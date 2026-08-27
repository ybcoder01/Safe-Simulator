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
  overrides: Partial<EvidenceVerdictInput> = {},
): EvidenceVerdictInput {
  return {
    operation: "call",
    target,
    targetVerified: true,
    decodeConfidence: "verified",
    movements: [],
    allowances: [],
    callTrace: "root-only",
    storageDiff: "unavailable",
    tokenEvents: "standard-events",
    ...overrides,
  };
}

describe("evaluateEvidenceVerdict", () => {
  it("uses known rather than trusted when available evidence has no warning", () => {
    const result = evaluateEvidenceVerdict(input());

    expect(result.verdict).toBe("known");
    expect(result.trustBoundary).toContain("never inferred");
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "partial-analysis-coverage",
    ]);
  });

  it("marks unverified targets and signature-only decoding for review", () => {
    const result = evaluateEvidenceVerdict(
      input({
        targetVerified: false,
        decodeConfidence: "signature",
      }),
    );

    expect(result.verdict).toBe("unverified");
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "unverified-target",
      "signature-only-decode",
      "partial-analysis-coverage",
    ]);
  });

  it("keeps token movements unverified until participant trust exists", () => {
    const result = evaluateEvidenceVerdict(
      input({
        movements: [{ token, from: target, to: spender }],
      }),
    );

    expect(result.verdict).toBe("unverified");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "movement-trust-unresolved",
        severity: "warning",
        addresses: [token, target, spender],
      }),
    );
  });

  it("keeps bounded approvals unverified until spender trust exists", () => {
    const result = evaluateEvidenceVerdict(
      input({
        allowances: [
          { token, spender, amount: "1000000", infinite: false },
        ],
      }),
    );

    expect(result.verdict).toBe("unverified");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "spender-trust-unresolved",
        severity: "warning",
        addresses: [token, spender],
      }),
    );
  });

  it("flags an exact infinite allowance finding", () => {
    const result = evaluateEvidenceVerdict(
      input({
        allowances: [
          {
            token,
            spender,
            amount: ((1n << 256n) - 1n).toString(),
            infinite: true,
          },
        ],
      }),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "infinite-allowance",
        severity: "critical",
        addresses: [token, spender],
      }),
    );
  });

  it("flags delegate calls even when target source is verified", () => {
    const result = evaluateEvidenceVerdict(
      input({ operation: "delegatecall" }),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings[0]).toMatchObject({
      code: "delegatecall-operation",
      severity: "critical",
    });
  });
});
