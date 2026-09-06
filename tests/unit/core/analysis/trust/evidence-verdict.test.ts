import { describe, expect, it } from "vitest";

import {
  evaluateEvidenceVerdict,
  type EvidenceVerdictInput,
} from "../../../../../src/core/analysis/trust/evidence-verdict";
import type { ContractRegistryEntry } from "../../../../../src/core/analysis/trust/contract-registry";
import type { Address, Hex } from "../../../../../src/core/domain";

const target = "0x1111111111111111111111111111111111111111" as Address;
const token = "0x2222222222222222222222222222222222222222" as Address;
const spender = "0x3333333333333333333333333333333333333333" as Address;
const safe = "0x4444444444444444444444444444444444444444" as Address;
const multiSend = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526" as Address;
const multiSendCodeHash =
  "0x0e4f7fc66550a322d1e7688e181b75e217e662a4f3f4d6a29b22bc61217c4b77" as Hex;

function safeBatchRegistry(
  overrides: Partial<ContractRegistryEntry> = {},
): readonly ContractRegistryEntry[] {
  return [
    {
      chainId: 50,
      address: multiSend,
      label: "Safe v1.4.1 MultiSend",
      protocol: "safe",
      category: "infrastructure",
      role: "batch-executor",
      source: "safe-deployments",
      reference: "https://example.com/pinned-safe-deployment",
      verification: "publisher-documented",
      reviewedAt: "2026-09-03",
      logoKey: "safe",
      executionRole: "safe-batch-executor",
      runtimeCodeHash: multiSendCodeHash,
      trustPolicy: "identity-only",
      lifecycle: "active",
      ...overrides,
    },
  ];
}

function input(
  overrides: Partial<EvidenceVerdictInput> = {},
): EvidenceVerdictInput {
  return {
    chainId: 50,
    safeAddress: safe,
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
        internalCalls: [
          { depth: 2, from: token, to: spender, operation: "delegatecall" },
        ],
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

  it("records the exact Safe proxy-to-singleton boundary without making it critical", () => {
    const result = evaluateEvidenceVerdict(
      input({
        callTrace: "complete",
        internalCalls: [
          {
            depth: 1,
            from: safe,
            to: spender,
            operation: "delegatecall",
          },
        ],
        registry: [
          {
            chainId: 50,
            address: spender,
            label: "Safe singleton",
            protocol: "safe",
            category: "infrastructure",
            role: "safe-singleton",
            source: "safe-deployments",
            reference: "https://example.com/pinned-safe-deployment",
            verification: "publisher-documented",
            reviewedAt: "2026-09-03",
            logoKey: "safe",
            executionRole: "safe-singleton",
            trustPolicy: "identity-only",
            lifecycle: "active",
          },
        ],
      }),
    );

    expect(result.verdict).toBe("known");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "expected-safe-proxy-delegation",
        severity: "info",
        addresses: [spender],
      }),
    );
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "internal-delegatecall",
    );
  });

  it("recognizes a Safe proxy dispatch below a module entry call", () => {
    const result = evaluateEvidenceVerdict(
      input({
        callTrace: "complete",
        internalCalls: [
          {
            depth: 2,
            from: safe,
            to: spender,
            operation: "delegatecall",
          },
        ],
        registry: [
          {
            chainId: 50,
            address: spender,
            label: "Safe singleton",
            protocol: "safe",
            category: "infrastructure",
            role: "safe-singleton",
            source: "safe-deployments",
            reference: "https://example.com/pinned-safe-deployment",
            verification: "publisher-documented",
            reviewedAt: "2026-09-03",
            logoKey: "safe",
            executionRole: "safe-singleton",
            trustPolicy: "identity-only",
            lifecycle: "active",
          },
        ],
      }),
    );

    expect(result.verdict).toBe("known");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "expected-safe-proxy-delegation",
        severity: "info",
        addresses: [spender],
      }),
    );
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "internal-delegatecall",
    );
  });

  it("recognizes an adjacent target proxy implementation dispatch", () => {
    const result = evaluateEvidenceVerdict(
      input({
        implementationChain: [spender],
        callTrace: "complete",
        internalCalls: [
          {
            depth: 4,
            from: target,
            to: spender,
            operation: "delegatecall",
          },
        ],
      }),
    );

    expect(result.verdict).toBe("unverified");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "expected-target-proxy-delegation",
        severity: "info",
        addresses: [spender],
      }),
    );
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "internal-delegatecall",
    );
  });

  it("keeps a delegate call that skips an implementation-chain link critical", () => {
    const result = evaluateEvidenceVerdict(
      input({
        implementationChain: [token, spender],
        callTrace: "complete",
        internalCalls: [
          {
            depth: 4,
            from: target,
            to: spender,
            operation: "delegatecall",
          },
        ],
      }),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "internal-delegatecall",
        severity: "critical",
        addresses: [spender],
      }),
    );
  });

  it("keeps a nested delegation to a registered singleton critical", () => {
    const result = evaluateEvidenceVerdict(
      input({
        callTrace: "complete",
        internalCalls: [
          {
            depth: 2,
            from: token,
            to: spender,
            operation: "delegatecall",
          },
        ],
        registry: [
          {
            chainId: 50,
            address: spender,
            label: "Safe singleton",
            protocol: "safe",
            category: "infrastructure",
            role: "safe-singleton",
            source: "safe-deployments",
            reference: "https://example.com/pinned-safe-deployment",
            verification: "publisher-documented",
            reviewedAt: "2026-09-03",
            logoKey: "safe",
            executionRole: "safe-singleton",
            trustPolicy: "identity-only",
            lifecycle: "active",
          },
        ],
      }),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "internal-delegatecall",
        severity: "critical",
        addresses: [spender],
      }),
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
        internalCalls: [
          { depth: 1, from: safe, to: spender, operation: "call" },
        ],
        registry: [
          {
            chainId: 50,
            address: spender,
            label: "Known infrastructure",
            protocol: "safe",
            category: "infrastructure",
            role: "proxy-factory",
            source: "safe-deployments",
            reference: "https://example.com/authoritative-record",
            verification: "publisher-documented",
            reviewedAt: "2026-09-03",
            logoKey: "safe",
            executionRole: null,
            trustPolicy: "identity-only",
            lifecycle: "active",
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

  it("ignores registry records from a different chain", () => {
    const result = evaluateEvidenceVerdict(
      input({
        internalCalls: [
          { depth: 1, from: safe, to: spender, operation: "call" },
        ],
        registry: [
          {
            chainId: 1,
            address: spender,
            label: "Wrong-chain infrastructure",
            protocol: "safe",
            category: "infrastructure",
            role: "proxy-factory",
            source: "safe-deployments",
            reference: "https://example.com/authoritative-record",
            verification: "publisher-documented",
            reviewedAt: "2026-09-03",
            logoKey: "safe",
            executionRole: null,
            trustPolicy: "identity-only",
            lifecycle: "active",
          },
        ],
        callTrace: "complete",
      }),
    );

    expect(result.addresses).toContainEqual(
      expect.objectContaining({
        address: spender,
        source: "unresolved",
        status: "unverified",
      }),
    );
    expect(result.findings.map((finding) => finding.code)).toContain(
      "internal-call-trust-unresolved",
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

  it("keeps full operator access critical even for a known operator", () => {
    const result = evaluateEvidenceVerdict(
      input({
        approvalRequests: [
          {
            standard: "operator-all",
            token,
            spender,
            amount: ((1n << 256n) - 1n).toString(),
            infinite: true,
            newSpenderAtAnchor: true,
          },
        ],
        addressBook: [
          { address: token, label: "Collection", trust: "trusted" },
          { address: spender, label: "Known operator", trust: "trusted" },
        ],
      }),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "requested-operator-all",
        severity: "critical",
        addresses: [token, spender],
      }),
    );
  });

  it("recognizes a Safe batch delegation only with exact pinned bytecode", () => {
    const result = evaluateEvidenceVerdict(
      input({
        operation: "delegatecall",
        target: multiSend,
        targetRuntimeCodeHash: multiSendCodeHash,
        targetRuntimeCodeAnchor: "latest",
        registry: safeBatchRegistry(),
        internalCalls: [
          {
            depth: 2,
            from: safe,
            to: multiSend,
            operation: "delegatecall",
          },
        ],
      }),
    );

    expect(result.verdict).not.toBe("flagged");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "expected-safe-batch-delegation",
        severity: "info",
        addresses: [multiSend],
      }),
    );
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "delegatecall-operation",
    );
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "internal-delegatecall",
    );
  });

  it("keeps a latest-only historical batch match explicit", () => {
    const result = evaluateEvidenceVerdict(
      input({
        operation: "delegatecall",
        target: multiSend,
        targetRuntimeCodeHash: multiSendCodeHash,
        targetRuntimeCodeAnchor: "latest-fallback",
        registry: safeBatchRegistry(),
      }),
    );

    expect(result.verdict).toBe("unverified");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "safe-batch-latest-bytecode-fallback",
        severity: "warning",
      }),
    );
  });

  it.each([
    [
      "different runtime bytecode",
      { targetRuntimeCodeHash: ("0x" + "11".repeat(32)) as Hex },
    ],
    ["different chain", { registry: safeBatchRegistry({ chainId: 1 }) }],
    [
      "lookalike address",
      { registry: safeBatchRegistry({ address: spender }) },
    ],
  ])("keeps Safe batch delegation critical for %s", (_label, overrides) => {
    const result = evaluateEvidenceVerdict(
      input({
        operation: "delegatecall",
        target: multiSend,
        targetRuntimeCodeHash: multiSendCodeHash,
        registry: safeBatchRegistry(),
        ...overrides,
      }),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "delegatecall-operation",
        severity: "critical",
      }),
    );
  });

  it("keeps independent approval risk critical inside a verified Safe batch", () => {
    const result = evaluateEvidenceVerdict(
      input({
        operation: "delegatecall",
        target: multiSend,
        targetRuntimeCodeHash: multiSendCodeHash,
        registry: safeBatchRegistry(),
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
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "expected-safe-batch-delegation",
        "infinite-allowance",
      ]),
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
            protocol: "safe",
            category: "infrastructure",
            role: "proxy-factory",
            source: "safe-deployments",
            reference: "https://example.com/authoritative-record",
            verification: "publisher-documented",
            reviewedAt: "2026-09-03",
            logoKey: "safe",
            executionRole: null,
            trustPolicy: "identity-only",
            lifecycle: "active",
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
  it("requires review when a storage change cannot be recognized", () => {
    const raw = evaluateEvidenceVerdict(
      input({
        storageDiff: "complete",
        storageChanges: [{ address: target, recognized: false }],
      }),
    );
    const named = evaluateEvidenceVerdict(
      input({
        storageDiff: "complete",
        storageChanges: [{ address: target, recognized: true }],
      }),
    );

    expect(raw.verdict).toBe("unverified");
    expect(raw.findings).toContainEqual(
      expect.objectContaining({
        code: "unrecognized-storage-change",
        severity: "warning",
        addresses: [target],
      }),
    );
    expect(named.findings.map((finding) => finding.code)).not.toContain(
      "unrecognized-storage-change",
    );
  });
  it("recognizes only an exact independently resolved internal proxy boundary", () => {
    const result = evaluateEvidenceVerdict(
      input({
        callTrace: "complete",
        internalCalls: [
          { depth: 3, from: token, to: spender, operation: "delegatecall" },
        ],
        internalProxyBoundaries: [{ proxy: token, implementation: spender }],
      }),
    );

    expect(result.verdict).not.toBe("flagged");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "expected-internal-proxy-delegation",
        severity: "info",
        addresses: [spender],
      }),
    );
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "internal-delegatecall",
    );
  });

  it("keeps the same implementation critical when the caller does not match", () => {
    const result = evaluateEvidenceVerdict(
      input({
        callTrace: "complete",
        internalCalls: [
          { depth: 3, from: target, to: spender, operation: "delegatecall" },
        ],
        internalProxyBoundaries: [{ proxy: token, implementation: spender }],
      }),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "internal-delegatecall",
        severity: "critical",
        addresses: [spender],
      }),
    );
  });
});
