import { describe, expect, it } from "vitest";

import { knownCallSummary } from "../../../../src/core/analysis/decoding/calldata";
import { extractApprovalRequests } from "../../../../src/core/analysis/tokens/approval-intents";
import {
  evaluateEvidenceVerdict,
  type EvidenceVerdictInput,
} from "../../../../src/core/analysis/trust/evidence-verdict";
import {
  FIXTURE_SPENDER,
  FIXTURE_TOKEN,
  UNKNOWN_DELEGATE_TARGET,
  approvalCalldata,
  approvalTransaction,
} from "../../../fixtures/analysis-regressions";

function verdictInput(
  overrides: Partial<EvidenceVerdictInput> = {},
): EvidenceVerdictInput {
  return {
    chainId: 50,
    operation: "call",
    target: FIXTURE_TOKEN,
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

function allowanceEvidence(amount: bigint) {
  const requests = extractApprovalRequests(approvalTransaction(amount), null);
  const approval = requests.items[0];

  if (
    !approval?.token ||
    !approval.spender ||
    approval.amount === null ||
    approval.infinite === null
  ) {
    throw new Error("The approval regression fixture did not normalize.");
  }

  return {
    request: approval,
    evidence: {
      token: approval.token,
      spender: approval.spender,
      amount: approval.amount.toString(),
      infinite: approval.infinite,
    },
  };
}

describe("analysis regression fixtures", () => {
  it("keeps the imported XDC Safe approval decode and verdict aligned", () => {
    const amount = 1_000_000n;
    const { request, evidence } = allowanceEvidence(amount);

    expect(knownCallSummary(approvalCalldata(amount), "call")).toBe(
      "Approve 0x941acf…8bc9d7 for 1000000 base units",
    );
    expect(request).toMatchObject({
      method: "approve",
      token: FIXTURE_TOKEN,
      spender: FIXTURE_SPENDER,
      amount,
      infinite: false,
    });

    const verdict = evaluateEvidenceVerdict(
      verdictInput({ allowances: [evidence] }),
    );

    expect(verdict.verdict).toBe("unverified");
    expect(verdict.findings).toContainEqual(
      expect.objectContaining({
        code: "spender-trust-unresolved",
        addresses: [FIXTURE_SPENDER],
      }),
    );
  });

  it("never weakens an infinite approval because its calldata decoded", () => {
    const { evidence } = allowanceEvidence((1n << 256n) - 1n);
    const verdict = evaluateEvidenceVerdict(
      verdictInput({ allowances: [evidence] }),
    );

    expect(verdict.verdict).toBe("flagged");
    expect(verdict.findings).toContainEqual(
      expect.objectContaining({
        code: "infinite-allowance",
        severity: "critical",
        addresses: [FIXTURE_TOKEN, FIXTURE_SPENDER],
      }),
    );
  });

  it("keeps an unknown delegate call critical with complete trace coverage", () => {
    const verdict = evaluateEvidenceVerdict(
      verdictInput({
        callTrace: "complete",
        internalCalls: [
          { to: UNKNOWN_DELEGATE_TARGET, operation: "delegatecall" },
        ],
      }),
    );

    expect(verdict.verdict).toBe("flagged");
    expect(verdict.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "internal-delegatecall",
        "internal-call-trust-unresolved",
      ]),
    );
  });
});
