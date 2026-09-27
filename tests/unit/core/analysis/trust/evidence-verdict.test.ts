import { describe, expect, it } from "vitest";

import {
  evaluateEvidenceVerdict,
  type EvidenceVerdictInput,
} from "../../../../../src/core/analysis/trust/evidence-verdict";
import {
  contractRegistryEntriesForChain,
  type ContractRegistryEntry,
} from "../../../../../src/core/analysis/trust/contract-registry";
import type { Address, Hex } from "../../../../../src/core/domain";

const target = "0x1111111111111111111111111111111111111111" as Address;
const token = "0x2222222222222222222222222222222222222222" as Address;
const spender = "0x3333333333333333333333333333333333333333" as Address;
const safe = "0x4444444444444444444444444444444444444444" as Address;
const multiSend = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526" as Address;
const multiSendCodeHash =
  "0x0e4f7fc66550a322d1e7688e181b75e217e662a4f3f4d6a29b22bc61217c4b77" as Hex;
const safeV150L2 = "0xEdd160fEBBD92E350D4D398fb636302fccd67C7e" as Address;

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
  it("treats Safe control changes as critical", () => {
    const result = evaluateEvidenceVerdict(
      input({
        safeConfigurationChanges: [
          {
            field: "owner",
            action: "added",
            before: null,
            after: spender,
            logIndex: 1,
            provenance: "safe-event",
          },
          {
            field: "threshold",
            action: "changed",
            before: null,
            after: "1",
            logIndex: 2,
            provenance: "safe-event",
          },
        ],
      }),
    );

    expect(result.verdict).toBe("flagged");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "safe-owner-change",
          severity: "critical",
        }),
        expect.objectContaining({
          code: "safe-threshold-change",
          severity: "critical",
        }),
      ]),
    );
  });

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

  it("does not treat a plain wallet address as an unverified contract", () => {
    const result = evaluateEvidenceVerdict(
      input({
        targetAccountType: "wallet",
        targetVerified: false,
        decodeConfidence: "raw",
      }),
    );

    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "unverified-target",
    );
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "raw-calldata",
    );
  });

  it("does not treat the Safe's direct native transfer as an extra internal contract call", () => {
    const result = evaluateEvidenceVerdict(
      input({
        targetAccountType: "wallet",
        targetVerified: false,
        decodeConfidence: "raw",
        callTrace: "complete",
        internalCalls: [
          { depth: 2, from: safe, to: target, operation: "call" },
        ],
      }),
    );

    expect(result.verdict).toBe("known");
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "internal-call-trust-unresolved",
    );
    expect(result.addresses).toContainEqual(
      expect.objectContaining({
        address: target,
        roles: ["target"],
      }),
    );
  });

  it("still reviews calls to the wallet target from an unexpected internal caller", () => {
    const result = evaluateEvidenceVerdict(
      input({
        targetAccountType: "wallet",
        targetVerified: false,
        decodeConfidence: "raw",
        callTrace: "complete",
        internalCalls: [
          { depth: 3, from: token, to: target, operation: "call" },
        ],
      }),
    );

    expect(result.verdict).toBe("unverified");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "internal-call-trust-unresolved",
        addresses: [target],
      }),
    );
  });

  it("keeps an unavailable target classification explicit", () => {
    const result = evaluateEvidenceVerdict(
      input({ targetAccountType: "unavailable" }),
    );

    expect(result.verdict).toBe("unverified");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "target-account-type-unavailable",
        severity: "warning",
      }),
    );
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
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "internal-call-trust-unresolved",
    );
  });

  it("treats the XDC Safe v1.5 proxy and resolved token proxy hops as infrastructure", () => {
    const tokenImplementation =
      "0x9DdB959f04b7075AacCd28e2e5c5c113469c534b" as Address;
    const result = evaluateEvidenceVerdict(
      input({
        implementationChain: [tokenImplementation],
        callTrace: "complete",
        internalCalls: [
          {
            depth: 1,
            from: safe,
            to: safeV150L2,
            operation: "delegatecall",
          },
          {
            depth: 2,
            from: safe,
            to: target,
            operation: "call",
          },
          {
            depth: 3,
            from: target,
            to: tokenImplementation,
            operation: "delegatecall",
          },
        ],
        registry: contractRegistryEntriesForChain(50),
      }),
    );

    expect(result.verdict).toBe("known");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "expected-safe-proxy-delegation" }),
        expect.objectContaining({ code: "expected-target-proxy-delegation" }),
      ]),
    );
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "internal-delegatecall",
    );
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "internal-call-trust-unresolved",
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

    expect(result.verdict).toBe("known");
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

  it("does not treat the Safe or zero mint address as unknown movement participants", () => {
    const result = evaluateEvidenceVerdict(
      input({
        movements: [
          { token, from: safe, to: target },
          {
            token: target,
            from: "0x0000000000000000000000000000000000000000" as Address,
            to: safe,
          },
        ],
        addressBook: [
          { address: token, label: "Underlying", trust: "trusted" },
          { address: target, label: "Receipt token", trust: "trusted" },
        ],
      }),
    );

    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "movement-trust-unresolved",
    );
  });

  it("recognizes the documented Fathom supply library only from the active pool", () => {
    const pool = "0x70d8005E3c8C7e383FE35Fa40156042F3393449F" as Address;
    const supplyLogic = "0xA8f477530036cF1391E5A76A723635be7b28Eff3" as Address;
    const registry = contractRegistryEntriesForChain(50);
    const expected = evaluateEvidenceVerdict(
      input({
        target: pool,
        internalCalls: [
          { depth: 4, from: pool, to: supplyLogic, operation: "delegatecall" },
        ],
        registry,
        callTrace: "complete",
      }),
    );
    const wrongCaller = evaluateEvidenceVerdict(
      input({
        target: pool,
        internalCalls: [
          {
            depth: 4,
            from: target,
            to: supplyLogic,
            operation: "delegatecall",
          },
        ],
        registry,
        callTrace: "complete",
      }),
    );

    expect(expected.findings).toContainEqual(
      expect.objectContaining({
        code: "expected-protocol-library-delegation",
        severity: "info",
        addresses: [supplyLogic.toLowerCase()],
      }),
    );
    expect(expected.findings.map((finding) => finding.code)).not.toContain(
      "internal-delegatecall",
    );
    expect(wrongCaller.findings).toContainEqual(
      expect.objectContaining({
        code: "internal-delegatecall",
        severity: "critical",
      }),
    );
  });

  it("keeps the observed Fathom supply execution aligned with its clean pre-sign result", () => {
    const pool = "0x70d8005E3c8C7e383FE35Fa40156042F3393449F" as Address;
    const poolImplementation =
      "0x5c756ACD4Cb26a9cA6De7abF9765cE84B5Be9322" as Address;
    const supplyLogic = "0xA8f477530036cF1391E5A76A723635be7b28Eff3" as Address;
    const interestStrategy =
      "0xB131Df2d2F2e042f79A09981DB7F9aDf578291a8" as Address;
    const underlying = "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1" as Address;
    const underlyingImplementation =
      "0x9DdB959f04b7075AacCd28e2e5c5c113469c534b" as Address;
    const receiptToken =
      "0xfc751eef339555950A8cb443bb1e3FdD6a3A77eC" as Address;
    const receiptTokenImplementation =
      "0x95f2f5fd81815Da3517E1EdfC149EE47c116F904" as Address;
    const result = evaluateEvidenceVerdict(
      input({
        target: pool,
        implementationChain: [poolImplementation],
        internalProxyBoundaries: [
          { proxy: underlying, implementation: underlyingImplementation },
          { proxy: receiptToken, implementation: receiptTokenImplementation },
        ],
        internalCalls: [
          { depth: 1, from: safe, to: safeV150L2, operation: "delegatecall" },
          { depth: 2, from: safe, to: pool, operation: "call" },
          {
            depth: 3,
            from: pool,
            to: poolImplementation,
            operation: "delegatecall",
          },
          { depth: 4, from: pool, to: supplyLogic, operation: "delegatecall" },
          { depth: 5, from: pool, to: interestStrategy, operation: "call" },
          {
            depth: 6,
            from: underlying,
            to: underlyingImplementation,
            operation: "delegatecall",
          },
          {
            depth: 6,
            from: receiptToken,
            to: receiptTokenImplementation,
            operation: "delegatecall",
          },
        ],
        movements: [
          { token: underlying, from: safe, to: receiptToken },
          {
            token: receiptToken,
            from: "0x0000000000000000000000000000000000000000" as Address,
            to: safe,
          },
        ],
        registry: contractRegistryEntriesForChain(50),
        callTrace: "complete",
      }),
    );

    expect(result.verdict).toBe("known");
    expect(
      result.findings.filter(
        (finding) =>
          finding.severity === "critical" || finding.severity === "warning",
      ),
    ).toEqual([]);
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
