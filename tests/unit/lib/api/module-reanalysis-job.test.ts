import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  Hex,
  ModuleTransaction,
  SafeRef,
} from "../../../../src/core/domain";
import { queueJobSchema } from "../../../../src/lib/api/jobs";
import { MODULE_ANALYSIS_ENGINE_VERSION } from "../../../../src/lib/api/module-analysis";
import { runModuleReanalysisPage } from "../../../../src/lib/api/module-reanalysis-job";
import {
  REANALYSIS_ITEM_DELAY_SECONDS,
  REANALYSIS_NEXT_PAGE_DELAY_SECONDS,
  REANALYSIS_PAGE_SIZE,
} from "../../../../src/lib/api/reanalysis-job";

const safe: SafeRef = {
  chainId: 50,
  address: "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173",
};
const moduleAddress =
  "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;

function hash(digit: string) {
  return `0x${digit.repeat(64)}` as Hex;
}

function transaction(index: number): ModuleTransaction {
  return {
    safe,
    module: moduleAddress,
    transactionHash: hash(String(index)),
    to: target,
    value: 0n,
    data: "0x",
    operation: "call",
    blockNumber: BigInt(index),
    executedAt: index,
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    type: "reanalyze-module",
    safe,
    engineVersion: MODULE_ANALYSIS_ENGINE_VERSION,
    runId: "module:reanalyze:request:50:safe:1",
    cursor: null,
    page: 0,
    ...overrides,
  } as const;
}

function ports(items: readonly ModuleTransaction[], nextCursor: string | null) {
  const listModuleTransactions = vi.fn().mockResolvedValue({
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
      persistence: { listModuleTransactions },
      queue: { enqueue },
    },
    listModuleTransactions,
    enqueue,
  };
}

describe("bounded module reanalysis", () => {
  it("paces one module page and schedules the next cursor", async () => {
    const state = ports([transaction(1), transaction(2)], "next-cursor");

    await expect(
      runModuleReanalysisPage(job(), state.value),
    ).resolves.toEqual({
      status: "complete",
      scanned: 2,
      scheduled: 2,
      nextPage: 1,
    });
    expect(state.listModuleTransactions).toHaveBeenCalledWith(
      safe,
      null,
      REANALYSIS_PAGE_SIZE,
    );
    expect(state.enqueue).toHaveBeenNthCalledWith(
      1,
      {
        type: "analyze-module",
        safe,
        transactionHash: hash("1"),
      },
      expect.objectContaining({ delaySeconds: 0 }),
    );
    expect(state.enqueue).toHaveBeenNthCalledWith(
      2,
      {
        type: "analyze-module",
        safe,
        transactionHash: hash("2"),
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

    await expect(
      runModuleReanalysisPage(job(), state.value),
    ).resolves.toEqual({
      status: "complete",
      scanned: 1,
      scheduled: 1,
      nextPage: null,
    });
    expect(state.enqueue).toHaveBeenCalledTimes(1);
  });

  it("rejects obsolete versions before reading module history", async () => {
    const state = ports([], null);

    await expect(
      runModuleReanalysisPage(
        job({ engineVersion: "obsolete" }),
        state.value,
      ),
    ).resolves.toEqual({
      status: "skipped",
      reason: "unsupported_engine_version",
    });
    expect(state.listModuleTransactions).not.toHaveBeenCalled();
    expect(state.enqueue).not.toHaveBeenCalled();
  });

  it("requires bounded cursor and page fields in signed payloads", () => {
    expect(queueJobSchema.safeParse(job()).success).toBe(true);
    expect(
      queueJobSchema.safeParse({
        type: "reanalyze-module",
        safe,
        engineVersion: MODULE_ANALYSIS_ENGINE_VERSION,
      }).success,
    ).toBe(false);
    expect(queueJobSchema.safeParse(job({ page: -1 })).success).toBe(false);
  });
});
