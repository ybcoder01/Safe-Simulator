import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Address,
  Hex,
  SafeSnapshot,
  SimulationOutput,
} from "@/core/domain";
import { resolveApprovalRisk } from "@/lib/api/approval-risk";
import { resolveContractInsight } from "@/lib/api/contract-insight";
import { resolveEvidenceVerdict } from "@/lib/api/evidence-verdict";
import { resolveInternalProxyBoundaries } from "@/lib/api/internal-proxy-boundaries";
import {
  manualSimulationInputSchema,
  resolveManualSimulation,
  type ManualSimulationPorts,
} from "@/lib/api/manual-simulation";
import { resolveStorageChangeAnalysis } from "@/lib/api/storage-changes";

vi.mock("@/lib/api/approval-risk", () => ({ resolveApprovalRisk: vi.fn() }));
vi.mock("@/lib/api/contract-insight", () => ({
  resolveContractInsight: vi.fn(),
}));
vi.mock("@/lib/api/evidence-verdict", () => ({
  resolveEvidenceVerdict: vi.fn(),
}));
vi.mock("@/lib/api/internal-proxy-boundaries", () => ({
  resolveInternalProxyBoundaries: vi.fn(),
}));
vi.mock("@/lib/api/storage-changes", () => ({
  resolveStorageChangeAnalysis: vi.fn(),
}));

const safeAddress = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const spender = "0x3333333333333333333333333333333333333333" as Address;
const blockHash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;

const safe: SafeSnapshot = {
  chainId: 50,
  address: safeAddress,
  owners: [safeAddress],
  threshold: 1,
  nonce: 7n,
  version: "1.4.1",
  guard: null,
  modules: [],
  implementation: null,
  observedAt: 1,
};

const output: SimulationOutput = {
  success: true,
  gasUsed: 21_000n,
  callTree: {
    from: safeAddress,
    to: target,
    input: "0x095ea7b3",
    output: "0x",
    value: 0n,
    operation: "call",
    reverted: false,
    error: null,
    calls: [],
  },
  logs: [],
  storageChanges: [],
  blockNumber: 100n,
  blockHash,
  error: null,
  traceCoverage: { callTrace: "complete", storageDiff: "complete" },
};

const contract = {
  metadata: {
    address: target,
    chainId: 50,
    label: "Example token",
    verified: true,
    abi: null,
    implementation: null,
    storageLayout: null,
    source: "registry",
  },
  implementationChain: [],
  decoded: {
    method: "approve",
    parameters: [
      { name: "spender", type: "address", value: spender, nestedCalls: [] },
    ],
    to: target,
    value: "0",
    data: "0x095ea7b3" as Hex,
    operation: "call",
  },
  provenance: "verified-abi",
  signature: null,
} as const;

const approvalRisk = {
  requests: [
    {
      standard: "erc20",
      source: "transaction-calldata",
      method: "approve",
      depth: 0,
      target,
      token: target,
      owner: safeAddress,
      spender,
      amount: "5",
      amountMode: "absolute",
      resultingAmount: "5",
      infinite: false,
      expiration: null,
      priorAmount: "0",
      newSpenderAtAnchor: true,
      warning: null,
    },
  ],
  executedChanges: [],
  limited: false,
  anchor: { type: "latest-state", blockNumber: null },
  warnings: ["Latest-state comparison."],
} as const;

const storage = {
  items: [],
  namedCount: 0,
  rawCount: 0,
  contractCount: 0,
  verifiedLayoutCount: 0,
  lookupLimited: false,
  warnings: [],
} as const;

const verdict = {
  verdict: "unverified",
  headline: "Trust is not fully established",
  findings: [],
  addresses: [],
  coverage: "target-call-and-trace",
  trustBoundary: "Explicit trust only.",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveContractInsight).mockResolvedValue(contract);
  vi.mocked(resolveApprovalRisk).mockResolvedValue(approvalRisk);
  vi.mocked(resolveStorageChangeAnalysis).mockResolvedValue(storage);
  vi.mocked(resolveInternalProxyBoundaries).mockResolvedValue([]);
  vi.mocked(resolveEvidenceVerdict).mockReturnValue(verdict);
});

describe("manualSimulationInputSchema", () => {
  it("normalizes a bounded direct call", () => {
    const result = manualSimulationInputSchema.parse({
      to: target.toLowerCase(),
      value: "0",
      data: "0xAABB",
    });

    expect(result).toEqual({ to: target, value: "0", data: "0xaabb" });
  });

  it("rejects odd-length or oversized calldata", () => {
    expect(
      manualSimulationInputSchema.safeParse({
        to: target,
        value: "0",
        data: "0xabc",
      }).success,
    ).toBe(false);
    expect(
      manualSimulationInputSchema.safeParse({
        to: target,
        value: "0",
        data: `0x${"aa".repeat(32_769)}`,
      }).success,
    ).toBe(false);
  });
});

describe("resolveManualSimulation", () => {
  it("reuses the evidence pipeline for a Safe-originated target call", async () => {
    const simulate = vi.fn().mockResolvedValue(output);
    const ports = {
      abi: {},
      chain: {},
      safeData: {},
      simulation: { simulate },
    } as unknown as ManualSimulationPorts;

    const result = await resolveManualSimulation(
      safe,
      { to: target, value: "0", data: "0x095ea7b3" },
      [],
      ports,
    );

    expect(simulate).toHaveBeenCalledWith(
      50,
      { from: safeAddress, to: target, value: 0n, data: "0x095ea7b3" },
      [],
    );
    expect(result).toMatchObject({
      target: { label: "Example token", verified: true },
      decoded: { method: "approve", provenance: "verified-abi" },
      execution: {
        success: true,
        blockNumber: "100",
        internalCallCount: 0,
        storageChangeCount: 0,
      },
      approvals: [
        {
          method: "approve",
          spender,
          amount: "5",
          newSpenderAtAnchor: true,
        },
      ],
      verdict,
    });
    expect(resolveEvidenceVerdict).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        nonce: 7n,
        operation: "call",
      }),
      contract,
      expect.objectContaining({ mode: "target-call-preview" }),
      [],
      approvalRisk,
      storage,
      null,
      "unavailable",
      [],
    );
  });
});
