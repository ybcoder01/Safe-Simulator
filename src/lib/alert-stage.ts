import type {
  SafeTransaction,
  TelegramAlertReceiptPayload,
  TransactionStatus,
  UnixTime,
  Verdict,
} from "@/core/domain";

export type AlertStageId =
  | "collecting-signatures"
  | "ready-to-execute"
  | "executed"
  | "failed"
  | "replaced";

export interface AlertStage {
  readonly id: AlertStageId;
  readonly label: string;
  readonly detail: string;
  /** True while owners can still stop the transaction by not signing it. */
  readonly open: boolean;
}

export interface StageInput {
  readonly status: TransactionStatus;
  readonly signatureCount: number;
  readonly threshold: number;
}

export function resolveAlertStage(input: StageInput): AlertStage {
  const { status, signatureCount, threshold } = input;
  if (status === "executed") {
    return {
      id: "executed",
      label: "Executed",
      detail: "The transaction has run on-chain and cannot be stopped.",
      open: false,
    };
  }
  if (status === "failed") {
    return {
      id: "failed",
      label: "Execution failed",
      detail: "The transaction was submitted but did not complete.",
      open: false,
    };
  }
  if (status === "replaced") {
    return {
      id: "replaced",
      label: "Replaced by another transaction",
      detail: "Another proposal used this nonce, so this one can never run.",
      open: false,
    };
  }
  if (signatureCount >= threshold) {
    return {
      id: "ready-to-execute",
      label: `Ready to execute (${signatureCount} of ${threshold} signed)`,
      detail: "Enough owners have signed. It can run at any moment.",
      open: true,
    };
  }
  const remaining = threshold - signatureCount;
  return {
    id: "collecting-signatures",
    label:
      remaining === 1
        ? `Waiting for the last signature (${signatureCount} of ${threshold} signed)`
        : `Waiting for ${remaining} more signatures (${signatureCount} of ${threshold} signed)`,
    detail:
      "Owners can still decide not to sign. This is the moment to check it.",
    open: true,
  };
}

export function alertStageFromReceipt(
  payload: Pick<
    TelegramAlertReceiptPayload,
    "status" | "signerAddresses" | "threshold"
  >,
): AlertStage {
  return resolveAlertStage({
    status: payload.status,
    signatureCount: payload.signerAddresses.length,
    threshold: payload.threshold,
  });
}

export function currentStageFromTransaction(
  transaction: Pick<SafeTransaction, "status" | "confirmations">,
  threshold: number,
): AlertStage {
  return resolveAlertStage({
    status: transaction.status,
    signatureCount: transaction.confirmations.length,
    threshold,
  });
}

/**
 * Describes what the alert concluded, worded for the stage it was sent at.
 * The result itself is never changed after the fact; only its framing is.
 */
export function alertVerdictLabel(
  verdict: Verdict,
  status: TransactionStatus,
): string {
  if (status === "executed") {
    switch (verdict) {
      case "flagged":
        return "Danger signal found — the transaction had already executed";
      case "unverified":
        return "Could not verify enough — the transaction had already executed";
      case "known":
        return "Known target — the transaction had already executed";
      case "trusted":
        return "No known warning found — the transaction had already executed";
    }
  }
  if (status === "failed" || status === "replaced") {
    return verdict === "flagged"
      ? "Danger signal found — the transaction did not complete"
      : "The transaction did not complete";
  }
  switch (verdict) {
    case "flagged":
      return "Danger signal found — do not sign yet";
    case "unverified":
      return "Could not verify enough — review manually";
    case "known":
      return "Known target — still check every detail";
    case "trusted":
      return "No known warning found in available evidence";
  }
}

export interface AlertTimelineReceipt {
  readonly verificationId: string;
  readonly issuedAt: UnixTime;
  readonly status: TransactionStatus;
  readonly signatureCount: number;
  readonly threshold: number;
  readonly verdict: Verdict;
  readonly findingCodes: readonly string[];
}

export interface StageTimelineEntry {
  readonly key: string;
  readonly stage: AlertStage;
  readonly at: UnixTime | null;
  readonly alert: AlertTimelineReceipt | null;
  readonly current: boolean;
}

function entryKey(status: TransactionStatus, signatureCount: number): string {
  return status === "pending" ? `pending:${signatureCount}` : status;
}

/**
 * Lays the transaction's real history (each signature, then the conclusion)
 * beside the alerts that were sent, so a reader can see which stage an alert
 * described and where the transaction stands now.
 */
export function buildStageTimeline(input: {
  readonly transaction: Pick<
    SafeTransaction,
    "status" | "confirmations" | "proposedAt" | "executedAt"
  >;
  readonly threshold: number;
  readonly receipts: readonly AlertTimelineReceipt[];
}): readonly StageTimelineEntry[] {
  const { transaction, threshold } = input;
  const entries = new Map<
    string,
    {
      stage: AlertStage;
      at: UnixTime | null;
      alert: AlertTimelineReceipt | null;
    }
  >();

  const signed = [...transaction.confirmations].sort(
    (a, b) =>
      (a.signedAt ?? transaction.proposedAt) -
      (b.signedAt ?? transaction.proposedAt),
  );
  signed.forEach((confirmation, index) => {
    const count = index + 1;
    entries.set(entryKey("pending", count), {
      stage: resolveAlertStage({
        status: "pending",
        signatureCount: count,
        threshold,
      }),
      at: confirmation.signedAt ?? transaction.proposedAt,
      alert: null,
    });
  });

  if (transaction.status !== "pending") {
    entries.set(entryKey(transaction.status, signed.length), {
      stage: resolveAlertStage({
        status: transaction.status,
        signatureCount: signed.length,
        threshold,
      }),
      at: transaction.status === "executed" ? transaction.executedAt : null,
      alert: null,
    });
  }

  const earliestFirst = [...input.receipts].sort(
    (a, b) => a.issuedAt - b.issuedAt,
  );
  for (const receipt of earliestFirst) {
    const key = entryKey(receipt.status, receipt.signatureCount);
    const existing = entries.get(key);
    if (existing) {
      if (!existing.alert) existing.alert = receipt;
      continue;
    }
    entries.set(key, {
      stage: resolveAlertStage({
        status: receipt.status,
        signatureCount: receipt.signatureCount,
        threshold: receipt.threshold,
      }),
      at: receipt.issuedAt,
      alert: receipt,
    });
  }

  const ordered = [...entries.entries()].sort(([, a], [, b]) => {
    const rank = (stage: AlertStage) => (stage.open ? 0 : 1);
    return (
      rank(a.stage) - rank(b.stage) ||
      (a.at ?? Number.MAX_SAFE_INTEGER) - (b.at ?? Number.MAX_SAFE_INTEGER)
    );
  });

  return ordered.map(([key, entry], index) => ({
    key,
    ...entry,
    current: index === ordered.length - 1,
  }));
}

export interface StageComparison {
  readonly then: AlertStage;
  readonly now: AlertStage | null;
  readonly changed: boolean;
  readonly headline: string;
  readonly explanation: string;
}

/** Compares the stage an alert described with where the transaction is now. */
export function compareAlertStageWithCurrent(
  payload: TelegramAlertReceiptPayload,
  current: Pick<SafeTransaction, "status" | "confirmations"> | null,
): StageComparison {
  const then = alertStageFromReceipt(payload);
  if (!current) {
    return {
      then,
      now: null,
      changed: false,
      headline: "Current status unavailable",
      explanation:
        "This receipt shows the stage when the alert was sent. The transaction's present state could not be loaded.",
    };
  }
  const now = currentStageFromTransaction(current, payload.threshold);
  const changed =
    then.id !== now.id ||
    payload.signerAddresses.length !== current.confirmations.length;
  if (!changed) {
    return {
      then,
      now,
      changed,
      headline: "Nothing has changed since this alert",
      explanation:
        "The transaction is still at the stage this alert described.",
    };
  }
  if (!now.open) {
    return {
      then,
      now,
      changed,
      headline:
        now.id === "executed"
          ? "This transaction has since executed"
          : `This transaction has since concluded: ${now.label.toLowerCase()}`,
      explanation: then.open
        ? "The alert below was sent while owners could still decide whether to sign. Its warnings are kept exactly as they were shown then, so you can compare them with what actually happened."
        : "The alert below describes an earlier stage. Its contents are kept exactly as they were sent.",
    };
  }
  return {
    then,
    now,
    changed,
    headline: "This transaction has moved on since this alert",
    explanation:
      "More has happened since the alert was sent. The alert below is kept exactly as it was shown then.",
  };
}
