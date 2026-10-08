import { describe, expect, it } from "vitest";

import type { EvidenceVerdict } from "../../../src/core/analysis/trust/evidence-verdict";
import type { Address, Finding } from "../../../src/core/domain";
import { resolveUserFacingFindings } from "../../../src/lib/user-facing-findings";

const target = "0x1111111111111111111111111111111111111111" as Address;
const implementation = "0x2222222222222222222222222222222222222222" as Address;
const unknown = "0x3333333333333333333333333333333333333333" as Address;
const recipient = "0x4444444444444444444444444444444444444444" as Address;

function finding(
  code: string,
  severity: Finding["severity"],
  addresses: readonly Address[] = [],
): Finding {
  return { code, severity, title: code, detail: `${code} detail`, addresses };
}

function evidence(
  findings: readonly Finding[],
  addresses: EvidenceVerdict["addresses"] = [],
): EvidenceVerdict {
  return {
    verdict: findings.some((item) => item.severity === "critical")
      ? "flagged"
      : "unverified",
    headline: "Evidence review",
    findings,
    addresses,
    coverage: "target-call-and-trace",
    trustBoundary: "Explicit trust only.",
  };
}

describe("resolveUserFacingFindings", () => {
  it("collapses repeated protocol trace warnings into one route check", () => {
    const result = resolveUserFacingFindings({
      evidence: evidence([
        finding("internal-delegatecall", "critical", [implementation, unknown]),
        finding("internal-call-trust-unresolved", "warning", [unknown]),
        finding("movement-trust-unresolved", "warning", [unknown]),
      ]),
      identifiedAddresses: [target, implementation],
      protocolLabel: "Silo",
      targetKnown: true,
      targetVerified: true,
    });

    expect(result).toEqual([
      expect.objectContaining({
        code: "protocol-path-unconfirmed",
        severity: "warning",
        addresses: [unknown],
      }),
    ]);
    expect(result[0]?.detail).toContain(
      "not proof of multiple separate attacks",
    );
  });

  it("does not repeat source and signature warnings for a verified target", () => {
    const result = resolveUserFacingFindings({
      evidence: evidence([
        finding("unverified-target", "warning", [target]),
        finding("signature-only-decode", "warning", [target]),
      ]),
      identifiedAddresses: [target],
      protocolLabel: "Silo",
      targetKnown: true,
      targetVerified: true,
    });

    expect(result).toEqual([]);
  });

  it("keeps an unconfirmed recipient visible as an address-replacement check", () => {
    const result = resolveUserFacingFindings({
      evidence: evidence(
        [finding("movement-trust-unresolved", "warning", [recipient])],
        [
          {
            address: recipient,
            label: null,
            status: "unverified",
            source: "unresolved",
            roles: ["movement-recipient"],
          },
        ],
      ),
      identifiedAddresses: [target],
      protocolLabel: "Silo",
      targetKnown: true,
      targetVerified: true,
    });

    expect(result).toContainEqual(
      expect.objectContaining({
        code: "recipient-address-unconfirmed",
        severity: "warning",
        addresses: [recipient],
      }),
    );
    expect(result.map((item) => item.code)).not.toContain(
      "protocol-path-unconfirmed",
    );
  });

  it("keeps spender permissions as one separate signer check", () => {
    const result = resolveUserFacingFindings({
      evidence: evidence(
        [
          finding("new-approval-spender", "warning", [target, unknown]),
          finding("spender-trust-unresolved", "warning", [unknown]),
        ],
        [
          {
            address: unknown,
            label: null,
            status: "unverified",
            source: "unresolved",
            roles: ["approval-spender"],
          },
        ],
      ),
      identifiedAddresses: [target],
      protocolLabel: "Silo",
      targetKnown: true,
      targetVerified: true,
    });

    expect(result).toEqual([
      expect.objectContaining({
        code: "spender-address-check",
        severity: "warning",
      }),
    ]);
  });

  it("never hides flagged addresses, Safe control changes, or unlimited access", () => {
    const result = resolveUserFacingFindings({
      evidence: evidence([
        finding("explicitly-flagged-address", "critical", [unknown]),
        finding("safe-owner-change", "critical", [recipient]),
        finding("requested-infinite-allowance", "critical", [target, unknown]),
      ]),
      identifiedAddresses: [target],
      protocolLabel: "Silo",
      targetKnown: true,
      targetVerified: true,
    });

    expect(result.map((item) => item.code)).toEqual([
      "flagged-address-involved",
      "safe-control-change",
      "unlimited-spending-access",
    ]);
  });

  it("removes a route warning when every ordinary call target is identified", () => {
    const result = resolveUserFacingFindings({
      evidence: evidence([
        finding("internal-call-trust-unresolved", "warning", [implementation]),
      ]),
      identifiedAddresses: [target, implementation],
      protocolLabel: "Silo",
      targetKnown: true,
      targetVerified: true,
    });

    expect(result).toEqual([]);
  });

  it("keeps an unexplained delegate call visible even when its address is named", () => {
    const result = resolveUserFacingFindings({
      evidence: evidence([
        finding("internal-delegatecall", "critical", [implementation]),
      ]),
      identifiedAddresses: [target, implementation],
      protocolLabel: "Silo",
      targetKnown: true,
      targetVerified: true,
    });

    expect(result).toContainEqual(
      expect.objectContaining({
        code: "protocol-path-unconfirmed",
        severity: "warning",
      }),
    );
  });

  it("summarizes Silo route attestation in plain language", () => {
    const result = resolveUserFacingFindings({
      evidence: evidence([
        finding("silo-permissionless-market", "warning", [target]),
      ]),
      identifiedAddresses: [target],
      protocolLabel: "Silo",
      targetKnown: true,
      targetVerified: true,
    });

    expect(result).toEqual([
      expect.objectContaining({
        code: "silo-permissionless-market",
        title: "Silo route verified; market approval still required",
      }),
    ]);
  });

  it("does not duplicate a Silo attestation failure as a generic route warning", () => {
    const result = resolveUserFacingFindings({
      evidence: evidence([
        finding("internal-call-trust-unresolved", "warning", [unknown]),
        finding("protocol-route-attestation-incomplete", "warning", [unknown]),
      ]),
      identifiedAddresses: [target],
      protocolLabel: "Silo",
      targetKnown: true,
      targetVerified: true,
    });

    expect(result.map((item) => item.code)).toEqual([
      "protocol-route-attestation-incomplete",
    ]);
  });
});
