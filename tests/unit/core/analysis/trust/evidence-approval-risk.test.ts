import { describe, expect, it } from "vitest";

import {
  evaluateEvidenceVerdict,
  type EvidenceVerdictInput,
} from "../../../../../src/core/analysis/trust/evidence-verdict";
import {
  contractRegistryEntriesForChain,
  type ContractRegistryEntry,
} from "../../../../../src/core/analysis/trust/contract-registry";
import type { Address } from "../../../../../src/core/domain";

const target = "0x1111111111111111111111111111111111111111" as Address;
const token = "0x2222222222222222222222222222222222222222" as Address;
const spender = "0x3333333333333333333333333333333333333333" as Address;

function reviewedSpenderRegistry(
  overrides: Partial<ContractRegistryEntry> = {},
): readonly ContractRegistryEntry[] {
  return [
    {
      chainId: 50,
      address: spender,
      label: "Reviewed protocol vault",
      protocol: "morpho",
      category: "protocol",
      role: "vault",
      source: "protocol-documentation",
      reference: "https://example.com/protocol-deployments",
      verification: "publisher-documented",
      reviewedAt: "2026-11-17",
      logoKey: "morpho",
      executionRole: null,
      trustPolicy: "protocol-whitelist",
      lifecycle: "active",
      ...overrides,
    },
  ];
}

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

  it("allows explicit acknowledgement for an active publisher-documented protocol spender", () => {
    const base = input([
      {
        standard: "erc20",
        token,
        spender,
        amount: ((1n << 256n) - 1n).toString(),
        infinite: true,
        newSpenderAtAnchor: true,
      },
    ]);
    const result = evaluateEvidenceVerdict({
      ...base,
      registry: reviewedSpenderRegistry(),
    });

    expect(result.verdict).toBe("unverified");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "requested-infinite-allowance",
        severity: "warning",
        title: "Reviewed protocol requests an unlimited token allowance",
      }),
    );
  });

  it("recognizes the documented XDC Morpho USDC vault used through Oku", () => {
    const morphoVault = "0x1ac19bEc163b445fbd4B8Ddc616e4002126Efa5A" as Address;
    const base = input([
      {
        standard: "erc20",
        token,
        spender: morphoVault,
        amount: ((1n << 256n) - 1n).toString(),
        infinite: true,
        newSpenderAtAnchor: true,
      },
    ]);
    const result = evaluateEvidenceVerdict({
      ...base,
      registry: contractRegistryEntriesForChain(50),
    });

    expect(result.verdict).toBe("unverified");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "requested-infinite-allowance",
        severity: "warning",
        detail: expect.stringContaining("Morpho Yield Network USDC Vault"),
        addresses: [token, morphoVault.toLowerCase()],
      }),
    );
  });

  it.each([
    ["wrong chain", { chainId: 1 }],
    [
      "internal deployment",
      { trustPolicy: "identity-only", lifecycle: "internal" },
    ],
    ["deprecated deployment", { lifecycle: "deprecated" }],
  ] as const)(
    "keeps unlimited approval critical for a %s registry record",
    (_label, overrides) => {
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
        registry: reviewedSpenderRegistry(
          overrides as Partial<ContractRegistryEntry>,
        ),
      });

      expect(result.verdict).toBe("flagged");
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          code: "requested-infinite-allowance",
          severity: "critical",
        }),
      );
    },
  );

  it("keeps Permit2 unlimited approval critical for a reviewed spender", () => {
    const base = input([
      {
        standard: "permit2-allowance",
        token,
        spender,
        amount: ((1n << 160n) - 1n).toString(),
        infinite: true,
        newSpenderAtAnchor: false,
      },
    ]);
    const result = evaluateEvidenceVerdict({
      ...base,
      registry: reviewedSpenderRegistry(),
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
