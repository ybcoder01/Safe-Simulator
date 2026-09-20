import { describe, expect, it } from "vitest";

import type { Finding } from "../../../src/core/domain";
import {
  createTransactionReviewRecord,
  findingCheckKey,
  loadTransactionReviewRecord,
  reviewRecordKey,
  reviewRecordMatchesEvidence,
  reviewReportFilename,
  saveTransactionReviewRecord,
  serializeReviewReport,
} from "../../../src/lib/review-record";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("browser-local transaction review records", () => {
  const safeAddress = `0x${"a".repeat(40)}`;
  const safeTxHash = `0x${"b".repeat(64)}`;
  const finding: Finding = {
    code: "new-approval-spender",
    severity: "warning",
    title: "New spender",
    detail: "The spender had no prior allowance.",
    addresses: [`0x${"c".repeat(40)}`],
  };

  it("scopes records by chain, Safe, transaction, and schema version", () => {
    expect(reviewRecordKey(50, safeAddress.toUpperCase(), safeTxHash)).toBe(
      `safe-inspector:review-record:v1:50:${safeAddress}:${safeTxHash}`,
    );
  });

  it("captures guidance and a deterministic evidence snapshot", () => {
    const record = createTransactionReviewRecord(
      {
        chainId: 50,
        safeAddress,
        safeTxHash,
        evidenceVersion: "transaction-analysis-v7+execution-evidence-v1",
        decision: "investigate",
        notes: "  Confirm spender first.  ",
        completedChecks: new Set([findingCheckKey(finding, 0)]),
        findings: [finding],
      },
      "2026-09-20T12:00:00.000Z",
    );

    expect(record).toMatchObject({
      decision: "investigate",
      notes: "Confirm spender first.",
      completedChecks: ["new-approval-spender:0"],
      reviewedAt: "2026-09-20T12:00:00.000Z",
    });
    expect(record.findings[0]).toMatchObject({
      actionLabel: "Verify the new spender",
      addresses: finding.addresses,
    });
  });

  it("round-trips a valid record and rejects malformed storage", () => {
    const storage = memoryStorage();
    const key = reviewRecordKey(50, safeAddress, safeTxHash);
    const record = createTransactionReviewRecord(
      {
        chainId: 50,
        safeAddress,
        safeTxHash,
        evidenceVersion: "v1",
        decision: "proceed",
        notes: "",
        completedChecks: new Set(),
        findings: [finding],
      },
      "2026-09-20T12:00:00.000Z",
    );

    expect(saveTransactionReviewRecord(storage, key, record)).toBe(true);
    expect(loadTransactionReviewRecord(storage, key)).toEqual(record);
    expect(
      loadTransactionReviewRecord(
        memoryStorage({ [key]: '{"version":2,"decision":"proceed"}' }),
        key,
      ),
    ).toBeNull();
  });

  it("exports a stable human-readable report", () => {
    const record = createTransactionReviewRecord(
      {
        chainId: 50,
        safeAddress,
        safeTxHash,
        evidenceVersion: "v1",
        decision: "reject",
        notes: "Unexpected spender",
        completedChecks: new Set(),
        findings: [finding],
      },
      "2026-09-20T12:00:00.000Z",
    );

    expect(reviewReportFilename(record)).toBe("safe-review-50-bbbbbbbb.json");
    expect(serializeReviewReport(record)).toContain(
      '"notes": "Unexpected spender"',
    );
    expect(serializeReviewReport(record).endsWith("\n")).toBe(true);
  });

  it("requires a new review when the evidence version or findings change", () => {
    const record = createTransactionReviewRecord(
      {
        chainId: 50,
        safeAddress,
        safeTxHash,
        evidenceVersion: "v1@100",
        decision: "investigate",
        notes: "",
        completedChecks: new Set(),
        findings: [finding],
      },
      "2026-09-20T12:00:00.000Z",
    );

    expect(reviewRecordMatchesEvidence(record, "v1@100", [finding])).toBe(true);
    expect(reviewRecordMatchesEvidence(record, "v1@101", [finding])).toBe(
      false,
    );
    expect(
      reviewRecordMatchesEvidence(record, "v1@100", [
        { ...finding, title: "Updated finding" },
      ]),
    ).toBe(false);
  });
});
