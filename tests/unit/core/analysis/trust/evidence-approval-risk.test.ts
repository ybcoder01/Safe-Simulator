import { describe, expect, it } from "vitest";

import {
  evaluateEvidenceVerdict,
  type EvidenceVerdictInput,
} from "../../../../../src/core/analysis/trust/evidence-verdict";
import type { Address } from "../../../../../src/core/domain";

const target = "0x1111111111111111111111111111111111111111" as Address;
const token = "0x2222222222222222222222222222222222222222" as Address;
const spender = "0x3333333333333333333333333333333333333333" as Address;

function input(
  approvalRequests: NonNullable<EvidenceVerdictInput["approvalRequests"]>,
): EvidenceVerdictInput {
  return {
    chainId: 50,
    safeAddress: target,
    operation: "call",
    target,
    targetVerified: true,
    decodeConfidence: "verified",
    movements: [],
    allowances: [],
    approvalRequests,
    internalCalls: [],
    addressBook: [],
    callTrace: "root-only",
    storageDiff: "unavailable",
    tokenEvents: "unavailable",
    outcome: "read-only-call",
  };
}

describe("approval request evidence verdicts", () => {
  it("flags an exact infinite Permit2 allowance request", () => {
    const result = evaluateEvidenceVerdict(
      input([
        {
          standard: "permit2-allowance",
          token,
          spender,
          amount: ((1n << 160n) - 1n).toString(),
          infinite: true,
          newSpenderAtAnchor: true,
        },
      ]),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "requested-infinite-allowance",
          severity: "critical",
          addresses: [token, spender],
        }),
        expect.objectContaining({
          code: "new-approval-spender",
          severity: "warning",
        }),
      ]),
    );
  });

  it("reviews Permit2 signature transfers without calling them allowances", () => {
    const result = evaluateEvidenceVerdict(
      input([
        {
          standard: "permit2-signature-transfer",
          token,
          spender: null,
          amount: "1000",
          infinite: false,
          newSpenderAtAnchor: null,
        },
      ]),
    );

    expect(result.verdict).toBe("unverified");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "permit2-signature-transfer",
        severity: "warning",
        addresses: [token],
      }),
    );
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "requested-infinite-allowance",
    );
  });

  it("does not let trusted labels suppress exact infinite calldata", () => {
    const base = input([
      {
        standard: "erc20",
        token,
        spender,
        amount: ((1n << 256n) - 1n).toString(),
        infinite: true,
        newSpenderAtAnchor: false,
      },
    ]);
    const result = evaluateEvidenceVerdict({
      ...base,
      addressBook: [
        { address: target, label: "Target", trust: "trusted" },
        { address: token, label: "Token", trust: "trusted" },
        { address: spender, label: "Spender", trust: "trusted" },
      ],
    });

    expect(result.verdict).toBe("flagged");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "requested-infinite-allowance",
        severity: "critical",
      }),
    );
  });
});
