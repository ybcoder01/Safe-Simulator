import { describe, expect, it } from "vitest";

import type { EvidenceVerdict } from "../../../src/core/analysis/trust/evidence-verdict";
import {
  resolveTransactionReviewPresentation,
  type TransactionReviewPresentation,
} from "../../../src/lib/transaction-review-presentation";

const evidence: EvidenceVerdict = {
  verdict: "known",
  headline: "No risk signal in available evidence",
  findings: [
    {
      code: "partial-analysis-coverage",
      severity: "info",
      title: "Analysis coverage is bounded",
      detail: "Evidence remains bounded.",
      addresses: [],
    },
  ],
  addresses: [],
  coverage: "target-call-and-trace",
  trustBoundary: "Explicit trust only.",
};

const input = {
  evidence,
  execution: {
    mode: "safe-execution-check" as const,
    success: true,
    coverage: {
      outcome: "read-only-call" as const,
      callTrace: "complete" as const,
      eventLogs: "unavailable" as const,
      tokenEvents: "unavailable" as const,
      storageDiff: "complete" as const,
    },
  },
  primaryAction: "Approve 1 USDC",
  target: {
    accountType: "contract" as const,
    anchor: "latest" as const,
  },
  targetVerified: true,
  transaction: {
    data: "0x1234" as const,
    operation: "call" as const,
    value: 0n,
  },
};

function withFinding(severity: "critical" | "warning"): EvidenceVerdict {
  return {
    ...evidence,
    findings: [
      ...evidence.findings,
      {
        code: `${severity}-finding`,
        severity,
        title: `${severity} finding`,
        detail: "Review this evidence.",
        addresses: [],
      },
    ],
  };
}

function expectSignal(
  result: TransactionReviewPresentation,
  signal: TransactionReviewPresentation["signal"],
) {
  expect(result.signal).toBe(signal);
  expect(result.title).toBeTruthy();
  expect(result.icon).toBeTruthy();
}

describe("transaction review presentation", () => {
  it("uses green only for complete evidence without warning findings", () => {
    expectSignal(resolveTransactionReviewPresentation(input), "clear");
  });

  it("uses red for critical findings", () => {
    expectSignal(
      resolveTransactionReviewPresentation({
        ...input,
        evidence: withFinding("critical"),
      }),
      "blocked",
    );
  });

  it("uses amber for warning findings and unverified contracts", () => {
    const warning = resolveTransactionReviewPresentation({
      ...input,
      evidence: withFinding("warning"),
      targetVerified: false,
    });

    expectSignal(warning, "review");
    expect(warning.targetType).toBe("Unverified smart contract");
  });

  it("uses gray when execution evidence or target classification is missing", () => {
    expectSignal(
      resolveTransactionReviewPresentation({
        ...input,
        target: { accountType: "unavailable", anchor: "unavailable" },
      }),
      "unknown",
    );
  });

  it("identifies a plain wallet transfer without describing it as a contract", () => {
    const result = resolveTransactionReviewPresentation({
      ...input,
      target: { accountType: "wallet", anchor: "latest" },
      targetVerified: false,
      transaction: { data: "0x", operation: "call", value: 12n },
    });

    expect(result.targetType).toBe("Wallet address");
    expect(result.actionSummary).toBe("Send 12 wei to a wallet address");
  });

  it("never turns missing evidence green even without findings", () => {
    const result = resolveTransactionReviewPresentation({
      ...input,
      execution: {
        ...input.execution,
        mode: "unavailable",
        success: null,
        coverage: {
          ...input.execution.coverage,
          outcome: "unavailable",
        },
      },
    });

    expect(result.signal).toBe("unknown");
    expect(result.signal).not.toBe("clear");
  });
});
