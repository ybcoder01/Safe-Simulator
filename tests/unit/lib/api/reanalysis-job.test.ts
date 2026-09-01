import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  Hex,
  SafeRef,
  SafeTransaction,
} from "../../../../src/core/domain";
import { queueJobSchema } from "../../../../src/lib/api/jobs";
import {
  REANALYSIS_ITEM_DELAY_SECONDS,
  REANALYSIS_NEXT_PAGE_DELAY_SECONDS,
  REANALYSIS_PAGE_SIZE,
  runReanalysisPage,
} from "../../../../src/lib/api/reanalysis-job";
import {
  reanalysisRequestIdempotencyKey,
  REANALYSIS_REQUEST_WINDOW_MS,
} from "../../../../src/lib/api/reanalysis-request";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "../../../../src/lib/api/transaction-analysis";

const safe: SafeRef = {
  chainId: 50,
  address: "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173",
};
const target = "0x2222222222222222222222222222222222222222" as Address;

function hash(digit: string) {
  return `0x${digit.repeat(64)}` as Hex;
}

function transaction(index: number): SafeTransaction {
  const safeTxHash = hash(String(index));
  return {
    safe,
    safeTxHash,
    nonce: BigInt(index),
    to: target,
    value: 0n,
    data: "0x",
    operation: "call",
    status: "executed",
    confirmations: [],
    proposedAt: index,
    executedAt: index,
    executedTxHash: safeTxHash,
    blockNumber: BigInt(index),
    blockHash: hash("a"),
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    type: "reanalyze",
    safe,
    engineVersion: TRANSACTION_ANALYSIS_ENGINE_VERSION,
    cursor: null,
    page: 0,
    ...overrides,
  } as const;
}

function ports(items: readonly SafeTransaction[], nextCursor: string | null) {
  const listTransactions = vi.fn().mockResolvedValue({
    items,
    nextCursor,
    total: null,
  });
  const enqueue = vi
    .fn()
    .mockImplementation((_job, options: { idempotencyKey: string }) =>
      Promise.resolve({ jobId: options.idempotencyKey }),
    );
  return {
    value: {
      persistence: { listTransactions },
      queue: { enqueue },
    },
    listTransactions,
    enqueue,
  };
}

describe("bounded reanalysis", () => {
  it("paces one small transaction page and schedules the next cursor", async () => {
    const state = ports([transaction(1), transaction(2)], "next-cursor");

    await expect(runReanalysisPage(job(), state.value)).resolves.toEqual({
      status: "complete",
      scanned: 2,
      scheduled: 2,
      nextPage: 1,
    });
    expect(state.listTransactions).toHaveBeenCalledWith(
      safe,
      null,
      REANALYSIS_PAGE_SIZE,
    );
    expect(state.enqueue).toHaveBeenNthCalledWith(
      1,
      {
        type: "analyze",
        safe,
        safeTxHash: hash("1"),
      },
      expect.objectContaining({ delaySeconds: 0 }),
    );
    expect(state.enqueue).toHaveBeenNthCalledWith(
      2,
      {
        type: "analyze",
        safe,
        safeTxHash: hash("2"),
      },
      expect.objectContaining({
        delaySeconds: REANALYSIS_ITEM_DELAY_SECONDS,
      }),
    );
    expect(state.enqueue).toHaveBeenNthCalledWith(
      3,
      {
        ...job(),
        cursor: "next-cursor",
        page: 1,
      },
      expect.objectContaining({
        delaySeconds: REANALYSIS_NEXT_PAGE_DELAY_SECONDS,
      }),
    );
  });

  it("finishes the final page without scheduling another scan", async () => {
    const state = ports([transaction(1)], null);

    await expect(runReanalysisPage(job(), state.value)).resolves.toEqual({
      status: "complete",
      scanned: 1,
      scheduled: 1,
      nextPage: null,
    });
    expect(state.enqueue).toHaveBeenCalledTimes(1);
  });

  it("rejects obsolete engine versions before reading history", async () => {
    const state = ports([], null);

    await expect(
      runReanalysisPage(job({ engineVersion: "obsolete" }), state.value),
    ).resolves.toEqual({
      status: "skipped",
      reason: "unsupported_engine_version",
    });
    expect(state.listTransactions).not.toHaveBeenCalled();
    expect(state.enqueue).not.toHaveBeenCalled();
  });

  it("requires an explicit bounded cursor and page in signed payloads", () => {
    expect(queueJobSchema.safeParse(job()).success).toBe(true);
    expect(
      queueJobSchema.safeParse({
        type: "reanalyze",
        safe,
        engineVersion: TRANSACTION_ANALYSIS_ENGINE_VERSION,
      }).success,
    ).toBe(false);
    expect(queueJobSchema.safeParse(job({ page: -1 })).success).toBe(false);
  });
});

describe("reanalysis request deduplication", () => {
  it("uses one normalized key per Safe, version, and time window", () => {
    const start = REANALYSIS_REQUEST_WINDOW_MS * 4 + 1;
    const lowerCaseSafe = {
      ...safe,
      address: safe.address.toLowerCase() as Address,
    };

    expect(
      reanalysisRequestIdempotencyKey(
        safe,
        TRANSACTION_ANALYSIS_ENGINE_VERSION,
        start,
      ),
    ).toBe(
      reanalysisRequestIdempotencyKey(
        lowerCaseSafe,
        TRANSACTION_ANALYSIS_ENGINE_VERSION,
        start + REANALYSIS_REQUEST_WINDOW_MS - 2,
      ),
    );
    expect(
      reanalysisRequestIdempotencyKey(
        safe,
        TRANSACTION_ANALYSIS_ENGINE_VERSION,
        start,
      ),
    ).not.toBe(
      reanalysisRequestIdempotencyKey(
        safe,
        TRANSACTION_ANALYSIS_ENGINE_VERSION,
        start + REANALYSIS_REQUEST_WINDOW_MS,
      ),
    );
  });
});
