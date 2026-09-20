import type { Finding, FindingSeverity } from "@/core/domain";
import { findingGuidance } from "@/lib/finding-guidance";

const REVIEW_RECORD_VERSION = 1;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;

export type ReviewDecision = "proceed" | "investigate" | "reject";

interface ReviewRecordStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ReviewCheckSnapshot {
  readonly key: string;
  readonly code: string;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly actionLabel: string;
  readonly action: string;
  readonly addresses: readonly string[];
}

export interface TransactionReviewRecord {
  readonly version: 1;
  readonly chainId: number;
  readonly safeAddress: string;
  readonly safeTxHash: string;
  readonly evidenceVersion: string;
  readonly decision: ReviewDecision;
  readonly notes: string;
  readonly completedChecks: readonly string[];
  readonly findings: readonly ReviewCheckSnapshot[];
  readonly reviewedAt: string;
}

interface CreateReviewRecordInput {
  readonly chainId: number;
  readonly safeAddress: string;
  readonly safeTxHash: string;
  readonly evidenceVersion: string;
  readonly decision: ReviewDecision;
  readonly notes: string;
  readonly completedChecks: ReadonlySet<string>;
  readonly findings: readonly Finding[];
}

export function reviewRecordKey(
  chainId: number,
  safeAddress: string,
  safeTxHash: string,
): string {
  return `safe-inspector:review-record:v${REVIEW_RECORD_VERSION}:${chainId}:${safeAddress.toLowerCase()}:${safeTxHash.toLowerCase()}`;
}

export function findingCheckKey(finding: Finding, index: number): string {
  return `${finding.code}:${index}`;
}

export function snapshotReviewFindings(
  findings: readonly Finding[],
): readonly ReviewCheckSnapshot[] {
  return findings.map((finding, index) => {
    const guidance = findingGuidance(finding);
    return {
      key: findingCheckKey(finding, index),
      code: finding.code,
      severity: finding.severity,
      title: finding.title,
      actionLabel: guidance.label,
      action: guidance.action,
      addresses: finding.addresses.map((address) => address.toLowerCase()),
    };
  });
}

export function createTransactionReviewRecord(
  input: CreateReviewRecordInput,
  reviewedAt = new Date().toISOString(),
): TransactionReviewRecord {
  return {
    version: REVIEW_RECORD_VERSION,
    chainId: input.chainId,
    safeAddress: input.safeAddress.toLowerCase(),
    safeTxHash: input.safeTxHash.toLowerCase(),
    evidenceVersion: input.evidenceVersion,
    decision: input.decision,
    notes: input.notes.trim(),
    completedChecks: [...input.completedChecks].sort(),
    findings: snapshotReviewFindings(input.findings),
    reviewedAt,
  };
}

function isReviewDecision(value: unknown): value is ReviewDecision {
  return value === "proceed" || value === "investigate" || value === "reject";
}

function isFindingSeverity(value: unknown): value is FindingSeverity {
  return value === "info" || value === "warning" || value === "critical";
}

function isReviewCheckSnapshot(value: unknown): value is ReviewCheckSnapshot {
  if (!value || typeof value !== "object") return false;
  const check = value as Partial<ReviewCheckSnapshot>;
  return (
    typeof check.key === "string" &&
    typeof check.code === "string" &&
    isFindingSeverity(check.severity) &&
    typeof check.title === "string" &&
    typeof check.actionLabel === "string" &&
    typeof check.action === "string" &&
    Array.isArray(check.addresses) &&
    check.addresses.every(
      (address) => typeof address === "string" && ADDRESS_PATTERN.test(address),
    )
  );
}

export function loadTransactionReviewRecord(
  storage: ReviewRecordStorage,
  key: string,
): TransactionReviewRecord | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<TransactionReviewRecord>;
    if (
      record.version !== REVIEW_RECORD_VERSION ||
      !Number.isInteger(record.chainId) ||
      typeof record.safeAddress !== "string" ||
      !ADDRESS_PATTERN.test(record.safeAddress) ||
      typeof record.safeTxHash !== "string" ||
      !HASH_PATTERN.test(record.safeTxHash) ||
      typeof record.evidenceVersion !== "string" ||
      !isReviewDecision(record.decision) ||
      typeof record.notes !== "string" ||
      !Array.isArray(record.completedChecks) ||
      !record.completedChecks.every((item) => typeof item === "string") ||
      !Array.isArray(record.findings) ||
      !record.findings.every(isReviewCheckSnapshot) ||
      typeof record.reviewedAt !== "string" ||
      Number.isNaN(Date.parse(record.reviewedAt))
    ) {
      return null;
    }
    return record as TransactionReviewRecord;
  } catch {
    return null;
  }
}

export function saveTransactionReviewRecord(
  storage: ReviewRecordStorage,
  key: string,
  record: TransactionReviewRecord,
): boolean {
  try {
    storage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function reviewRecordMatchesEvidence(
  record: TransactionReviewRecord,
  evidenceVersion: string,
  findings: readonly Finding[],
): boolean {
  return (
    record.evidenceVersion === evidenceVersion &&
    JSON.stringify(record.findings) ===
      JSON.stringify(snapshotReviewFindings(findings))
  );
}

export function reviewReportFilename(record: TransactionReviewRecord): string {
  return `safe-review-${record.chainId}-${record.safeTxHash.slice(2, 10)}.json`;
}

export function serializeReviewReport(record: TransactionReviewRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}
