import { describe, expect, it } from "vitest";

import type {
  Address,
  ContractMetadata,
  Hex,
  SafeTransaction,
} from "../../../../src/core/domain";
import type { ContractInsight } from "../../../../src/lib/api/contract-insight";
import type { ExecutionInsight } from "../../../../src/lib/api/execution-insight";
import { resolveEvidenceVerdict } from "../../../../src/lib/api/evidence-verdict";

const safe = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const token = "0x3333333333333333333333333333333333333333" as Address;
const spender = "0x4444444444444444444444444444444444444444" as Address;
const hash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;

const transaction: SafeTransaction = {
  safe: { chainId: 50, address: safe },
  safeTxHash: hash,
  nonce: 1n,
  to: target,
  value: 0n,
  data: "0x12345678",
  operation: "call",
  status: "executed",
  confirmations: [],
  proposedAt: 1,
  executedAt: 2,
  executedTxHash: hash,
  blockNumber: 3n,
  blockHash: hash,
};

function contract(
  overrides: Partial<ContractMetadata> = {},
): ContractInsight {
  return {
    metadata: {
      address: target,
      chainId: 50,
      label: null,
      verified: false,
      abi: null,
      implementation: null,
      storageLayout: null,
      source: "unknown",
      ...overrides,
    },
    implementationChain: [],
    decoded: null,
    provenance: "signature-database",
    signature: "test()",
  };
}

function execution(
  allowanceChanges: ExecutionInsight["allowanceChanges"] = [],
): ExecutionInsight {
  return {
    mode: "executed-replay",
    success: true,
    gasUsed: "1",
    blockNumber: "3",
    blockHash: hash,
    rootCall: null,
    logs: [],
    tokenMovements: [],
    allowanceChanges,
    error: null,
    coverage: {
      outcome: "on-chain-receipt",
      callTrace: "root-only",
      eventLogs: "complete",
      tokenEvents: "standard-events",
      storageDiff: "unavailable",
    },
    warnings: [],
  };
}

describe("resolveEvidenceVerdict", () => {
  it("maps contract provenance and receipt coverage into core rules", () => {
    const result = resolveEvidenceVerdict(
      transaction,
      contract(),
      execution(),
    );

    expect(result.verdict).toBe("unverified");
    expect(result.findings.map((finding) => finding.code)).toContain(
      "signature-only-decode",
    );
  });

  it("passes exact infinite allowance evidence into the flagged verdict", () => {
    const result = resolveEvidenceVerdict(
      transaction,
      contract({ verified: true, source: "sourcify" }),
      execution([
        {
          token,
          owner: safe,
          spender,
          amount: ((1n << 256n) - 1n).toString(),
          infinite: true,
          logIndex: 2,
        },
      ]),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "infinite-allowance",
        addresses: [token, spender],
      }),
    );
  });
});
