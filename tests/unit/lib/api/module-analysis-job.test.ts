import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Address,
  Hex,
  ModuleAnalysisResult,
  ModuleTransaction,
} from "../../../../src/core/domain";
import {
  MODULE_ANALYSIS_ENGINE_VERSION,
  resolveModuleAnalysis,
  type ModuleAnalysisPorts,
} from "../../../../src/lib/api/module-analysis";
import { runAnalyzeModuleJob } from "../../../../src/lib/api/module-analysis-job";

vi.mock("@/lib/api/module-analysis", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../../../src/lib/api/module-analysis")
    >();
  return { ...original, resolveModuleAnalysis: vi.fn() };
});

const safe = {
  chainId: 50,
  address: "0x1111111111111111111111111111111111111111" as Address,
};
const transactionHash = `0x${"a".repeat(64)}` as Hex;
const transaction: ModuleTransaction = {
  safe,
  module: "0x2222222222222222222222222222222222222222" as Address,
  transactionHash,
  to: "0x3333333333333333333333333333333333333333" as Address,
  value: 0n,
  data: "0x",
  operation: "call",
  blockNumber: 3n,
  executedAt: 1_700_000_000,
};
const result: ModuleAnalysisResult = {
  transactionHash,
  module: transaction.module,
  engineVersion: MODULE_ANALYSIS_ENGINE_VERSION,
  verdict: "unverified",
  findings: [],
  simulation: null,
  createdAt: 1_700_000_100,
  immutable: false,
};
const job = {
  type: "analyze-module",
  safe,
  transactionHash,
} as const;

function makePorts() {
  const persistence = {
    findModuleTransaction: vi.fn().mockResolvedValue(transaction),
    findModuleAnalysis: vi.fn().mockResolvedValue(null),
  };
  return {
    value: {
      persistence,
    } as unknown as ModuleAnalysisPorts,
    persistence,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveModuleAnalysis).mockResolvedValue(result);
});

describe("runAnalyzeModuleJob", () => {
  it("finishes a missing transaction without retrying an impossible lookup", async () => {
    const state = makePorts();
    state.persistence.findModuleTransaction.mockResolvedValue(null);

    await expect(runAnalyzeModuleJob(job, state.value)).resolves.toEqual({
      status: "skipped",
      reason: "module_transaction_not_found",
    });
    expect(state.persistence.findModuleAnalysis).not.toHaveBeenCalled();
    expect(resolveModuleAnalysis).not.toHaveBeenCalled();
  });

  it("reuses an immutable result for the current engine version", async () => {
    const state = makePorts();
    state.persistence.findModuleAnalysis.mockResolvedValue({
      ...result,
      verdict: "flagged",
      immutable: true,
    });

    await expect(runAnalyzeModuleJob(job, state.value)).resolves.toEqual({
      status: "cached",
      verdict: "flagged",
      immutable: true,
    });
    expect(state.persistence.findModuleAnalysis).toHaveBeenCalledWith(
      transactionHash,
      MODULE_ANALYSIS_ENGINE_VERSION,
    );
    expect(resolveModuleAnalysis).not.toHaveBeenCalled();
  });

  it("refreshes incomplete evidence", async () => {
    const state = makePorts();
    state.persistence.findModuleAnalysis.mockResolvedValue(result);

    await expect(runAnalyzeModuleJob(job, state.value)).resolves.toEqual({
      status: "complete",
      verdict: "unverified",
      immutable: false,
    });
    expect(resolveModuleAnalysis).toHaveBeenCalledWith(
      transaction,
      state.value,
    );
  });
});
