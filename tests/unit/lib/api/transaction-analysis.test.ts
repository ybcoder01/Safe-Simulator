import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Address,
  AnalysisResult,
  Hex,
  SafeTransaction,
  SimulationOutput,
} from "../../../../src/core/domain";
import { runAnalyzeJob } from "../../../../src/lib/api/analysis-job";
import { resolveApprovalRisk } from "../../../../src/lib/api/approval-risk";
import { resolveContractInsight } from "../../../../src/lib/api/contract-insight";
import { resolveEvidenceVerdict } from "../../../../src/lib/api/evidence-verdict";
import { resolveExecutionInsight } from "../../../../src/lib/api/execution-insight";
import { resolveStorageChangeAnalysis } from "../../../../src/lib/api/storage-changes";
import {
  resolveNeutralTransactionAnalysis,
  TRANSACTION_ANALYSIS_ENGINE_VERSION,
  type NeutralTransactionAnalysisPorts,
} from "../../../../src/lib/api/transaction-analysis";

vi.mock("@/lib/api/approval-risk", () => ({
  resolveApprovalRisk: vi.fn(),
}));
vi.mock("@/lib/api/contract-insight", () => ({
  resolveContractInsight: vi.fn(),
}));
vi.mock("@/lib/api/evidence-verdict", () => ({
  resolveEvidenceVerdict: vi.fn(),
}));
vi.mock("@/lib/api/execution-insight", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../../../src/lib/api/execution-insight")
    >();
  return { ...original, resolveExecutionInsight: vi.fn() };
});
vi.mock("@/lib/api/storage-changes", () => ({
  resolveStorageChangeAnalysis: vi.fn(),
}));

const safeAddress = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const safeTxHash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
const blockHash =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;

function transaction(
  overrides: Partial<SafeTransaction> = {},
): SafeTransaction {
  return {
    safe: { chainId: 50, address: safeAddress },
    safeTxHash,
    nonce: 1n,
    to: target,
    value: 0n,
    data: "0x12345678",
    operation: "call",
    status: "executed",
    confirmations: [],
    proposedAt: 1,
    executedAt: 2,
    executedTxHash: safeTxHash,
    blockNumber: 3n,
    blockHash,
    ...overrides,
  };
}

const simulation: SimulationOutput = {
  success: true,
  gasUsed: 1n,
  callTree: {
    from: safeAddress,
    to: target,
    input: "0x12345678",
    output: "0x",
    value: 0n,
    operation: "call",
    reverted: false,
    error: null,
    calls: [],
  },
  logs: [],
  storageChanges: [],
  blockNumber: 3n,
  blockHash,
  error: null,
  traceCoverage: {
    callTrace: "complete",
    storageDiff: "complete",
  },
};

const contract = {
  metadata: {
    address: target,
    chainId: 50,
    label: null,
    verified: true,
    abi: null,
    implementation: null,
    storageLayout: null,
    source: "sourcify",
  },
  implementationChain: [],
  decoded: null,
  provenance: "verified-abi",
  signature: null,
} as const;

const executed = {
  mode: "executed-replay",
  success: true,
  gasUsed: "1",
  blockNumber: "3",
  blockHash,
  rootCall: null,
  internalCalls: [],
  logs: [],
  storageChanges: [],
  tokenMovements: [],
  allowanceChanges: [],
  safeConfigurationChanges: [],
  error: null,
  coverage: {
    outcome: "on-chain-receipt",
    callTrace: "complete",
    eventLogs: "complete",
    tokenEvents: "standard-events",
    storageDiff: "complete",
  },
  warnings: [],
} as const;

const pending = {
  ...executed,
  mode: "safe-execution-check",
  blockNumber: null,
  blockHash: null,
  coverage: {
    ...executed.coverage,
    outcome: "read-only-call",
  },
} as const;

const approvalRisk = {
  requests: [],
  executedChanges: [],
  limited: false,
  anchor: { type: "previous-block", blockNumber: "2" },
  warnings: [],
} as const;

const storageAnalysis = {
  items: [],
  namedCount: 0,
  rawCount: 0,
  contractCount: 0,
  verifiedLayoutCount: 0,
  lookupLimited: false,
  warnings: [],
} as const;

const baselineVerdict = {
  verdict: "known",
  headline: "Known evidence",
  findings: [
    {
      code: "known-evidence",
      severity: "info",
      title: "Known",
      detail: "Neutral evidence only.",
      addresses: [target],
    },
  ],
  addresses: [],
  coverage: "target-receipt-and-trace",
  trustBoundary: "",
} as const;

function ports(overrides: Record<string, unknown> = {}) {
  const persistence = {
    findTransaction: vi.fn(),
    findAnalysis: vi.fn(),
    findExecutionEvidence: vi.fn(),
    saveAnalysis: vi.fn(),
    saveExecutionEvidence: vi.fn(),
    ...overrides,
  };
  return {
    value: {
      abi: {},
      cache: {},
      chain: {},
      persistence,
      safeData: {},
      simulation: {},
      now: () => 99,
    } as unknown as NeutralTransactionAnalysisPorts,
    persistence,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveContractInsight).mockResolvedValue(contract);
  vi.mocked(resolveExecutionInsight).mockResolvedValue(executed);
  vi.mocked(resolveApprovalRisk).mockResolvedValue(approvalRisk);
  vi.mocked(resolveStorageChangeAnalysis).mockResolvedValue(storageAnalysis);
  vi.mocked(resolveEvidenceVerdict).mockReturnValue(
    baselineVerdict as ReturnType<typeof resolveEvidenceVerdict>,
  );
});

describe("resolveNeutralTransactionAnalysis", () => {
  it("persists immutable executed evidence without profile trust records", async () => {
    const state = ports();
    state.persistence.findExecutionEvidence.mockResolvedValue({
      safe: transaction().safe,
      safeTxHash,
      engineVersion: "execution-evidence-v1",
      blockHash,
      simulation,
      createdAt: 3,
    });

    const result = await resolveNeutralTransactionAnalysis(
      transaction(),
      state.value,
    );

    expect(resolveEvidenceVerdict).toHaveBeenCalledWith(
      transaction(),
      contract,
      executed,
      [],
      approvalRisk,
      storageAnalysis,
    );
    expect(result.persisted.engineVersion).toBe(
      TRANSACTION_ANALYSIS_ENGINE_VERSION,
    );
    expect(state.persistence.saveAnalysis).toHaveBeenCalledWith({
      safeTxHash,
      engineVersion: TRANSACTION_ANALYSIS_ENGINE_VERSION,
      verdict: "known",
      findings: baselineVerdict.findings,
      simulation,
      createdAt: 99,
      immutable: true,
    });
  });

  it("keeps pending results refreshable and does not claim immutable evidence", async () => {
    vi.mocked(resolveExecutionInsight).mockResolvedValue(pending);
    const state = ports();
    const pendingTransaction = transaction({
      status: "pending",
      executedAt: null,
      executedTxHash: null,
      blockNumber: null,
      blockHash: null,
    });

    const result = await resolveNeutralTransactionAnalysis(
      pendingTransaction,
      state.value,
    );

    expect(state.persistence.findExecutionEvidence).not.toHaveBeenCalled();
    expect(result.persisted).toMatchObject({
      simulation: null,
      immutable: false,
    });
  });
});

describe("runAnalyzeJob", () => {
  const job = {
    type: "analyze",
    safe: transaction().safe,
    safeTxHash,
  } as const;

  it("finishes missing transactions without retrying an impossible lookup", async () => {
    const state = ports();
    state.persistence.findTransaction.mockResolvedValue(null);

    await expect(runAnalyzeJob(job, state.value)).resolves.toEqual({
      status: "skipped",
      reason: "transaction_not_found",
    });
    expect(state.persistence.findAnalysis).not.toHaveBeenCalled();
  });

  it("reuses an immutable baseline", async () => {
    const existing: AnalysisResult = {
      safeTxHash,
      engineVersion: TRANSACTION_ANALYSIS_ENGINE_VERSION,
      verdict: "known",
      findings: [],
      simulation,
      createdAt: 3,
      immutable: true,
    };
    const state = ports();
    state.persistence.findTransaction.mockResolvedValue(transaction());
    state.persistence.findAnalysis.mockResolvedValue(existing);

    await expect(runAnalyzeJob(job, state.value)).resolves.toEqual({
      status: "cached",
      verdict: "known",
      immutable: true,
    });
    expect(resolveContractInsight).not.toHaveBeenCalled();
  });
});
