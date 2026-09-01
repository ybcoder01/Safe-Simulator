import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Address,
  Hex,
  ModuleTransaction,
  SimulationOutput,
} from "../../../../src/core/domain";
import { resolveApprovalRisk } from "../../../../src/lib/api/approval-risk";
import { resolveContractInsight } from "../../../../src/lib/api/contract-insight";
import { resolveEvidenceVerdict } from "../../../../src/lib/api/evidence-verdict";
import {
  executionInsightFromReplay,
  unavailableExecutionInsight,
} from "../../../../src/lib/api/execution-insight";
import {
  MODULE_ANALYSIS_ENGINE_VERSION,
  resolveModuleAnalysis,
  type ModuleAnalysisPorts,
} from "../../../../src/lib/api/module-analysis";
import { resolveStorageChangeAnalysis } from "../../../../src/lib/api/storage-changes";

vi.mock("@/lib/api/approval-risk", () => ({
  resolveApprovalRisk: vi.fn(),
}));
vi.mock("@/lib/api/contract-insight", () => ({
  resolveContractInsight: vi.fn(),
}));
vi.mock("@/lib/api/evidence-verdict", () => ({
  resolveEvidenceVerdict: vi.fn(),
}));
vi.mock("@/lib/api/execution-insight", () => ({
  executionInsightFromReplay: vi.fn(),
  unavailableExecutionInsight: vi.fn(),
}));
vi.mock("@/lib/api/storage-changes", () => ({
  resolveStorageChangeAnalysis: vi.fn(),
}));

const safeAddress = "0x1111111111111111111111111111111111111111" as Address;
const moduleAddress = "0x2222222222222222222222222222222222222222" as Address;
const target = "0x3333333333333333333333333333333333333333" as Address;
const transactionHash = `0x${"a".repeat(64)}` as Hex;
const blockHash = `0x${"b".repeat(64)}` as Hex;
const otherBlockHash = `0x${"c".repeat(64)}` as Hex;

const transaction: ModuleTransaction = {
  safe: { chainId: 50, address: safeAddress },
  module: moduleAddress,
  transactionHash,
  to: target,
  value: 0n,
  data: "0x12345678",
  operation: "call",
  blockNumber: 3n,
  executedAt: 1_700_000_000,
};

const simulation: SimulationOutput = {
  success: true,
  gasUsed: 1n,
  callTree: {
    from: safeAddress,
    to: target,
    input: transaction.data,
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
  metadata: null,
  implementationChain: [],
  decoded: null,
  provenance: "unknown",
  signature: null,
} as const;

const execution = { mode: "executed-replay" } as const;
const approvalRisk = {
  requests: [],
  executedChanges: [],
  limited: false,
  anchor: null,
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

function baseline(verdict: "known" | "flagged" = "known") {
  return {
    verdict,
    headline: "Evidence",
    findings: [
      {
        code: `${verdict}-evidence`,
        severity: verdict === "flagged" ? "critical" : "info",
        title: "Baseline finding",
        detail: "Evidence from the normal analysis pipeline.",
        addresses: [target],
      },
    ],
    addresses: [],
    coverage: "target-receipt-and-trace",
    trustBoundary: "",
  } as const;
}

function makePorts(
  anchor: { blockNumber: bigint; blockHash: Hex } | null = {
    blockNumber: 3n,
    blockHash,
  },
) {
  const persistence = {
    saveModuleAnalysis: vi.fn().mockResolvedValue(undefined),
  };
  const chain = {
    getTransactionBlock: vi.fn().mockResolvedValue(anchor),
  };
  const replay = vi.fn().mockResolvedValue(simulation);

  return {
    value: {
      abi: {},
      chain,
      persistence,
      safeData: {},
      simulation: { replay },
      now: () => 1_700_000_100,
    } as unknown as ModuleAnalysisPorts,
    chain,
    persistence,
    replay,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveContractInsight).mockResolvedValue(
    contract as Awaited<ReturnType<typeof resolveContractInsight>>,
  );
  vi.mocked(executionInsightFromReplay).mockReturnValue(
    execution as ReturnType<typeof executionInsightFromReplay>,
  );
  vi.mocked(unavailableExecutionInsight).mockReturnValue(
    execution as ReturnType<typeof unavailableExecutionInsight>,
  );
  vi.mocked(resolveApprovalRisk).mockResolvedValue(
    approvalRisk as Awaited<ReturnType<typeof resolveApprovalRisk>>,
  );
  vi.mocked(resolveStorageChangeAnalysis).mockResolvedValue(
    storageAnalysis as Awaited<ReturnType<typeof resolveStorageChangeAnalysis>>,
  );
  vi.mocked(resolveEvidenceVerdict).mockReturnValue(
    baseline() as ReturnType<typeof resolveEvidenceVerdict>,
  );
});

describe("resolveModuleAnalysis", () => {
  it("persists canonical replay evidence with a module-specific verdict floor", async () => {
    const state = makePorts();

    const result = await resolveModuleAnalysis(transaction, state.value);

    expect(result).toMatchObject({
      transactionHash,
      module: moduleAddress,
      engineVersion: MODULE_ANALYSIS_ENGINE_VERSION,
      verdict: "unverified",
      immutable: true,
      simulation,
    });
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "module-execution-path",
      "known-evidence",
    ]);
    expect(state.persistence.saveModuleAnalysis).toHaveBeenCalledWith(result);
  });

  it("preserves critical findings from the shared evidence pipeline", async () => {
    vi.mocked(resolveEvidenceVerdict).mockReturnValue(
      baseline("flagged") as ReturnType<typeof resolveEvidenceVerdict>,
    );
    const state = makePorts();

    await expect(
      resolveModuleAnalysis(transaction, state.value),
    ).resolves.toMatchObject({
      verdict: "flagged",
      immutable: true,
    });
  });

  it("keeps evidence refreshable when the canonical anchor is unavailable", async () => {
    const state = makePorts(null);

    const result = await resolveModuleAnalysis(transaction, state.value);

    expect(result).toMatchObject({
      verdict: "unverified",
      immutable: false,
    });
    expect(result.findings.map((finding) => finding.code)).toContain(
      "module-replay-anchor-unverified",
    );
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "module-replay-anchor-mismatch",
    );
  });

  it("flags a replay that conflicts with its canonical transaction anchor", async () => {
    const state = makePorts({ blockNumber: 3n, blockHash: otherBlockHash });

    const result = await resolveModuleAnalysis(transaction, state.value);

    expect(result).toMatchObject({
      verdict: "flagged",
      immutable: false,
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "module-replay-anchor-mismatch",
          severity: "critical",
        }),
      ]),
    );
  });

  it("keeps unavailable replay evidence explicit and refreshable", async () => {
    const state = makePorts();
    state.replay.mockRejectedValue(new Error("trace RPC unavailable"));

    const result = await resolveModuleAnalysis(transaction, state.value);

    expect(unavailableExecutionInsight).toHaveBeenCalledWith(
      "trace RPC unavailable",
    );
    expect(result).toMatchObject({
      verdict: "unverified",
      immutable: false,
      simulation: null,
    });
  });
});
