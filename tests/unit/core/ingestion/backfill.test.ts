import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  AnalysisResult,
  Hex,
  ModuleAnalysisResult,
  ModuleTransaction,
  SafeRef,
  SafeTransaction,
  SyncCursor,
} from "../../../../src/core/domain";
import {
  AUTO_ANALYSIS_DELAY_SECONDS,
  AUTO_ANALYSIS_LIMIT,
  runBackfillPage,
  type BackfillPorts,
} from "../../../../src/core/ingestion/backfill";

const safe: SafeRef = {
  chainId: 1,
  address: "0x1111111111111111111111111111111111111111" as Address,
};
const engineVersion = "transaction-analysis-v1";
const moduleEngineVersion = "module-analysis-v1";

function hash(digit: string) {
  return `0x${digit.repeat(64)}` as Hex;
}

function transactionWithDigit(digit: string): SafeTransaction {
  return {
    safe,
    safeTxHash: hash(digit),
    nonce: BigInt(digit),
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
}

function moduleTransactionWithDigit(digit: string): ModuleTransaction {
  return {
    safe,
    module: "0x3333333333333333333333333333333333333333" as Address,
    transactionHash: hash(digit),
    to: "0x2222222222222222222222222222222222222222" as Address,
    value: 0n,
    data: "0x",
    operation: "call",
    blockNumber: BigInt(digit),
    executedAt: 1_782_000_000,
  };
}

const transaction = transactionWithDigit("1");
const moduleTransaction = moduleTransactionWithDigit("1");

function analysis(safeTxHash: Hex): AnalysisResult {
  return {
    safeTxHash,
    engineVersion,
    verdict: "unverified",
    findings: [],
    simulation: null,
    createdAt: 1_782_000_000,
    immutable: false,
  };
}

function moduleAnalysis(transactionHash: Hex): ModuleAnalysisResult {
  return {
    transactionHash,
    module: moduleTransaction.module,
    engineVersion: moduleEngineVersion,
    verdict: "unverified",
    findings: [],
    simulation: null,
    createdAt: 1_782_000_000,
    immutable: true,
  };
}

function makePorts(
  options: {
    cursor?: SyncCursor | null;
    nextCursor?: string | null;
    persistenceFails?: boolean;
    items?: readonly SafeTransaction[];
    moduleItems?: readonly ModuleTransaction[];
    analyses?: readonly AnalysisResult[];
    moduleAnalyses?: readonly ModuleAnalysisResult[];
  } = {},
) {
  const persistence = {
    findAnalyses: vi.fn().mockResolvedValue(options.analyses ?? []),
    findModuleAnalyses: vi
      .fn()
      .mockResolvedValue(options.moduleAnalyses ?? []),
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
    getMultisigTransaction: vi.fn(),
    listMultisigTransactions: vi.fn().mockResolvedValue({
      items: options.items ?? [transaction],
      nextCursor: options.nextCursor ?? null,
      total: 1,
    }),
    listModuleTransactions: vi.fn().mockResolvedValue({
      items: options.moduleItems ?? [moduleTransaction],
      nextCursor: options.nextCursor ?? null,
      total: 1,
    }),
    listTransfers: vi.fn(),
    listMessages: vi.fn(),
    getBalances: vi.fn(),
    decodeTransactionData: vi.fn(),
  };
  const queue = { enqueue: vi.fn().mockResolvedValue({ jobId: "job_test" }) };

  return {
    ports: {
      persistence,
      safeData,
      queue,
      analysisEngineVersion: engineVersion,
      moduleAnalysisEngineVersion: moduleEngineVersion,
      now: () => 1_782_000_000,
    } as BackfillPorts,
    persistence,
    safeData,
    queue,
  };
}

describe("runBackfillPage", () => {
  it("persists a page before advancing and queues analysis plus continuation", async () => {
    const { ports, persistence, queue } = makePorts({ nextCursor: "100" });

    await expect(
      runBackfillPage({ type: "backfill", safe, stream: "multisig" }, ports),
    ).resolves.toEqual({
      processed: 1,
      scheduledAnalyses: 1,
      nextCursor: "100",
      status: "running",
    });
    expect(persistence.upsertTransactions).toHaveBeenCalledWith([transaction]);
    expect(persistence.findAnalyses).toHaveBeenCalledWith(
      safe,
      [transaction.safeTxHash],
      engineVersion,
    );
    expect(persistence.saveSyncCursor).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "100", status: "running" }),
    );
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).toHaveBeenCalledWith(
      {
        type: "analyze",
        safe,
        safeTxHash: transaction.safeTxHash,
      },
      expect.objectContaining({ delaySeconds: 0 }),
    );
  });

  it("resumes from a stored cursor without scheduling deeper history", async () => {
    const cursor: SyncCursor = {
      safe,
      stream: "multisig",
      cursor: "100",
      status: "failed",
      updatedAt: 1_781_999_000,
    };
    const { ports, persistence, safeData, queue } = makePorts({ cursor });

    await expect(
      runBackfillPage({ type: "backfill", safe, stream: "multisig" }, ports),
    ).resolves.toEqual({
      processed: 1,
      scheduledAnalyses: 0,
      nextCursor: null,
      status: "complete",
    });

    expect(safeData.listMultisigTransactions).toHaveBeenCalledWith(
      safe,
      "100",
      100,
    );
    expect(persistence.findAnalyses).not.toHaveBeenCalled();
    expect(persistence.saveSyncCursor).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: null, status: "complete" }),
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("does not enqueue work for a current baseline", async () => {
    const { ports, persistence, queue } = makePorts({
      analyses: [analysis(transaction.safeTxHash)],
    });

    await expect(
      runBackfillPage({ type: "backfill", safe, stream: "multisig" }, ports),
    ).resolves.toEqual({
      processed: 1,
      scheduledAnalyses: 0,
      nextCursor: null,
      status: "complete",
    });
    expect(persistence.findAnalyses).toHaveBeenCalledOnce();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("caps and spaces automatically scheduled analyses", async () => {
    const items = ["1", "2", "3", "4", "5", "6", "7"].map(transactionWithDigit);
    const { ports, queue } = makePorts({ items });

    await runBackfillPage(
      { type: "backfill", safe, stream: "multisig" },
      ports,
    );

    expect(queue.enqueue).toHaveBeenCalledTimes(AUTO_ANALYSIS_LIMIT);
    for (let index = 0; index < AUTO_ANALYSIS_LIMIT; index += 1) {
      expect(queue.enqueue).toHaveBeenNthCalledWith(
        index + 1,
        {
          type: "analyze",
          safe,
          safeTxHash: items[index]?.safeTxHash,
        },
        expect.objectContaining({
          delaySeconds: index * AUTO_ANALYSIS_DELAY_SECONDS,
          idempotencyKey: expect.stringContaining(engineVersion),
        }),
      );
    }
  });

  it("caps and spaces first-page module analysis jobs", async () => {
    const moduleItems = ["1", "2", "3", "4", "5", "6", "7"].map(
      moduleTransactionWithDigit,
    );
    const { ports, persistence, queue } = makePorts({ moduleItems });

    await expect(
      runBackfillPage({ type: "backfill", safe, stream: "module" }, ports),
    ).resolves.toEqual({
      processed: 7,
      scheduledAnalyses: AUTO_ANALYSIS_LIMIT,
      nextCursor: null,
      status: "complete",
    });

    expect(persistence.findModuleAnalyses).toHaveBeenCalledWith(
      safe,
      moduleItems.map((item) => item.transactionHash),
      moduleEngineVersion,
    );
    expect(queue.enqueue).toHaveBeenCalledTimes(AUTO_ANALYSIS_LIMIT);
    for (let index = 0; index < AUTO_ANALYSIS_LIMIT; index += 1) {
      expect(queue.enqueue).toHaveBeenNthCalledWith(
        index + 1,
        {
          type: "analyze-module",
          safe,
          transactionHash: moduleItems[index]?.transactionHash,
        },
        expect.objectContaining({
          delaySeconds: index * AUTO_ANALYSIS_DELAY_SECONDS,
          idempotencyKey: expect.stringContaining(moduleEngineVersion),
        }),
      );
    }
  });

  it("does not schedule module analysis for deeper pages", async () => {
    const cursor: SyncCursor = {
      safe,
      stream: "module",
      cursor: "module-cursor",
      status: "failed",
      updatedAt: 1_781_999_000,
    };
    const { ports, persistence, queue } = makePorts({ cursor });

    await runBackfillPage({ type: "backfill", safe, stream: "module" }, ports);

    expect(persistence.findModuleAnalyses).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("does not duplicate a current module analysis", async () => {
    const { ports, queue } = makePorts({
      moduleAnalyses: [moduleAnalysis(moduleTransaction.transactionHash)],
    });

    await expect(
      runBackfillPage({ type: "backfill", safe, stream: "module" }, ports),
    ).resolves.toEqual({
      processed: 1,
      scheduledAnalyses: 0,
      nextCursor: null,
      status: "complete",
    });
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
    expect(persistence.findAnalyses).not.toHaveBeenCalled();
    expect(persistence.saveSyncCursor).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: null, status: "failed" }),
    );
  });
});
