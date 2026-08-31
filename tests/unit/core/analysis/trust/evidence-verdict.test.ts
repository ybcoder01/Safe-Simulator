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
    internalCalls: [],
    addressBook: [],
    callTrace: "root-only",
    storageDiff: "unavailable",
    tokenEvents: "standard-events",
    outcome: "on-chain-receipt",
    ...overrides,
  };
}

describe("evaluateEvidenceVerdict", () => {
  it("uses known rather than trusted when available evidence has no warning", () => {
    const result = evaluateEvidenceVerdict(input());

    expect(result.verdict).toBe("known");
    expect(result.coverage).toBe("target-and-receipt-only");
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

  it("flags traced internal delegate calls and unresolved targets", () => {
    const result = evaluateEvidenceVerdict(
      input({
        callTrace: "complete",
        internalCalls: [{ to: spender, operation: "delegatecall" }],
      }),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.coverage).toBe("target-receipt-and-trace");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "internal-delegatecall",
          addresses: [spender],
        }),
        expect.objectContaining({
          code: "internal-call-trust-unresolved",
          addresses: [spender],
        }),
      ]),
    );
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
        addresses: [token, spender],
      }),
    );
  });

  it("keeps bounded approvals unverified until spender trust exists", () => {
    const result = evaluateEvidenceVerdict(
      input({
        allowances: [{ token, spender, amount: "1000000", infinite: false }],
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

  it("uses registry evidence as known without promoting it to trusted", () => {
    const result = evaluateEvidenceVerdict(
      input({
        internalCalls: [{ to: spender, operation: "call" }],
        registry: [
          {
            chainId: 50,
            address: spender,
            label: "Known infrastructure",
            source: "safe-deployments",
            reference: "https://example.com/authoritative-record",
          },
        ],
        callTrace: "complete",
      }),
    );

    expect(result.verdict).toBe("known");
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "internal-call-trust-unresolved",
    );
    expect(result.addresses).toContainEqual(
      expect.objectContaining({
        address: spender,
        label: "Known infrastructure",
        source: "registry",
        status: "known",
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
  it("uses explicit trusted records to resolve a bounded allowance", () => {
    const result = evaluateEvidenceVerdict(
      input({
        allowances: [{ token, spender, amount: "1000000", infinite: false }],
        addressBook: [
          { address: target, label: "Target", trust: "trusted" },
          { address: token, label: "Token", trust: "trusted" },
          { address: spender, label: "Spender", trust: "trusted" },
        ],
      }),
    );

    expect(result.verdict).toBe("trusted");
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "spender-trust-unresolved",
    );
    expect(result.addresses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ address: spender, status: "trusted" }),
      ]),
    );
  });

  it("keeps unverified source evidence when the target is explicitly trusted", () => {
    const result = evaluateEvidenceVerdict(
      input({
        targetVerified: false,
        addressBook: [
          { address: target, label: "Reviewed target", trust: "trusted" },
        ],
      }),
    );

    expect(result.verdict).toBe("unverified");
    expect(result.findings.map((finding) => finding.code)).toContain(
      "unverified-target",
    );
  });

  it("elevates an explicitly flagged participant", () => {
    const result = evaluateEvidenceVerdict(
      input({
        movements: [{ token, from: target, to: spender }],
        addressBook: [
          { address: spender, label: "Blocked counterparty", trust: "flagged" },
        ],
        registry: [
          {
            chainId: 50,
            address: spender,
            label: "Known infrastructure",
            source: "safe-deployments",
            reference: "https://example.com/authoritative-record",
          },
        ],
      }),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "explicitly-flagged-address",
        addresses: [spender],
      }),
    );
  });

  it("does not let trusted labels hide delegate calls or infinite allowances", () => {
    const result = evaluateEvidenceVerdict(
      input({
        operation: "delegatecall",
        allowances: [
          {
            token,
            spender,
            amount: ((1n << 256n) - 1n).toString(),
            infinite: true,
          },
        ],
        addressBook: [
          { address: target, label: "Target", trust: "trusted" },
          { address: token, label: "Token", trust: "trusted" },
          { address: spender, label: "Spender", trust: "trusted" },
        ],
      }),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["delegatecall-operation", "infinite-allowance"]),
    );
  });
});
