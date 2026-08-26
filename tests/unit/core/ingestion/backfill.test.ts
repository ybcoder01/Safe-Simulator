import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  Hex,
  SafeRef,
  SafeTransaction,
  SyncCursor,
} from "../../../../src/core/domain";
import {
  runBackfillPage,
  type BackfillPorts,
} from "../../../../src/core/ingestion/backfill";

const safe: SafeRef = {
  chainId: 1,
  address: "0x1111111111111111111111111111111111111111" as Address,
};

const transaction: SafeTransaction = {
  safe,
  safeTxHash: `0x${"1".repeat(64)}` as Hex,
  nonce: 1n,
  to: "0x2222222222222222222222222222222222222222" as Address,
  value: 0n,
  data: "0x",
  operation: "call",
  status: "pending",
  confirmations: [],
  proposedAt: 1_782_000_000,
  executedAt: null,
  executedTxHash: null,
  blockNumber: null,
  blockHash: null,
};

function makePorts(
  options: {
    cursor?: SyncCursor | null;
    nextCursor?: string | null;
    persistenceFails?: boolean;
  } = {},
) {
  const persistence = {
    findSyncCursor: vi.fn().mockResolvedValue(options.cursor ?? null),
    saveSyncCursor: vi.fn().mockResolvedValue(undefined),
    upsertTransactions: options.persistenceFails
      ? vi.fn().mockRejectedValue(new Error("database unavailable"))
      : vi.fn().mockResolvedValue(undefined),
    upsertModuleTransactions: vi.fn().mockResolvedValue(undefined),
    upsertTransfers: vi.fn().mockResolvedValue(undefined),
    upsertMessages: vi.fn().mockResolvedValue(undefined),
  };
  const safeData = {
    discoverSafesByOwner: vi.fn(),
    listMultisigTransactions: vi.fn().mockResolvedValue({
      items: [transaction],
      nextCursor: options.nextCursor ?? null,
      total: 1,
    }),
    listModuleTransactions: vi.fn(),
    listTransfers: vi.fn(),
    listMessages: vi.fn(),
    getBalances: vi.fn(),
  };
  const queue = { enqueue: vi.fn().mockResolvedValue({ jobId: "job_test" }) };

  return {
    ports: {
      persistence,
      safeData,
      queue,
      now: () => 1_782_000_000,
    } as BackfillPorts,
    persistence,
    safeData,
    queue,
  };
}

describe("runBackfillPage", () => {
  it("persists a page before advancing and queues its continuation", async () => {
    const { ports, persistence, queue } = makePorts({ nextCursor: "100" });

    await expect(
      runBackfillPage({ type: "backfill", safe, stream: "multisig" }, ports),
    ).resolves.toEqual({
      processed: 1,
      nextCursor: "100",
      status: "running",
    });
    expect(persistence.upsertTransactions).toHaveBeenCalledWith([transaction]);
    expect(persistence.saveSyncCursor).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "100", status: "running" }),
    );
    expect(queue.enqueue).toHaveBeenCalledOnce();
  });

  it("resumes from a stored cursor and completes the stream", async () => {
    const cursor: SyncCursor = {
      safe,
      stream: "multisig",
      cursor: "100",
      status: "failed",
      updatedAt: 1_781_999_000,
    };
    const { ports, persistence, safeData, queue } = makePorts({ cursor });

    await runBackfillPage(
      { type: "backfill", safe, stream: "multisig" },
      ports,
    );

    expect(safeData.listMultisigTransactions).toHaveBeenCalledWith(
      safe,
      "100",
      100,
    );
    expect(persistence.saveSyncCursor).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: null, status: "complete" }),
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("does not advance the cursor when persistence fails", async () => {
    const { ports, persistence } = makePorts({
      nextCursor: "100",
      persistenceFails: true,
    });

    await expect(
      runBackfillPage({ type: "backfill", safe, stream: "multisig" }, ports),
    ).rejects.toThrow("database unavailable");
    expect(persistence.saveSyncCursor).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: null, status: "failed" }),
    );
  });
});
