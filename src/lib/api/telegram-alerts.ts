import { createHash } from "node:crypto";

import type {
  AnalysisResult,
  Confirmation,
  QueueJob,
  SafeRef,
  SafeTransaction,
  Verdict,
} from "@/core/domain";
import type {
  PersistencePort,
  QueuePort,
  SafeDataPort,
  TelegramDeliveryPort,
} from "@/core/ports";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "@/lib/api/analysis-version";
import { createTelegramAlertReceipt } from "@/lib/api/telegram-alert-receipts";

const WATCH_PAGE_SIZE = 50;
const WATCH_INTERVAL_SECONDS = 60;
const ANALYSIS_WAIT_SECONDS = 12;
const MAX_ALERT_ATTEMPTS = 4;

type WatchJob = Extract<QueueJob, { type: "telegram-watch" }>;
type AlertJob = Extract<QueueJob, { type: "telegram-alert" }>;

interface WatchPorts {
  readonly persistence: Pick<
    PersistencePort,
    "findTransaction" | "listTelegramSubscriptions" | "upsertTransactions"
  >;
  readonly queue: QueuePort;
  readonly safeData: Pick<SafeDataPort, "listMultisigTransactions">;
  readonly now: () => number;
}

interface AlertPorts {
  readonly persistence: Pick<
    PersistencePort,
    | "claimTelegramDelivery"
    | "completeTelegramDelivery"
    | "findAnalysis"
    | "findSafe"
    | "findTransaction"
    | "listTelegramSubscriptions"
    | "releaseTelegramDelivery"
    | "saveTelegramAlertReceipt"
  >;
  readonly queue: QueuePort;
  readonly telegram: TelegramDeliveryPort;
  readonly now: () => number;
  readonly appUrl: string;
}

function confirmationKeys(confirmations: readonly Confirmation[]): string[] {
  return confirmations.map((item) => item.owner.toLowerCase()).sort();
}

function transactionState(transaction: SafeTransaction): string {
  return JSON.stringify({
    status: transaction.status,
    confirmations: confirmationKeys(transaction.confirmations),
  });
}

function changed(
  previous: SafeTransaction | null,
  current: SafeTransaction,
): boolean {
  if (!previous) return current.confirmations.length > 0;
  return transactionState(previous) !== transactionState(current);
}

function watchKey(safe: SafeRef, now: number): string {
  return [
    "telegram-watch",
    safe.chainId,
    safe.address.toLowerCase(),
    Math.floor(now / WATCH_INTERVAL_SECONDS),
  ].join(":");
}

export async function runTelegramWatchJob(job: WatchJob, ports: WatchPorts) {
  const subscriptions = await ports.persistence.listTelegramSubscriptions(
    job.safe,
  );
  if (subscriptions.length === 0) return { status: "stopped", changes: 0 };

  const page = await ports.safeData.listMultisigTransactions(
    job.safe,
    null,
    WATCH_PAGE_SIZE,
  );
  const previous = await Promise.all(
    page.items.map((item) =>
      ports.persistence.findTransaction(job.safe, item.safeTxHash),
    ),
  );
  const changedTransactions = page.items.filter((item, index) =>
    changed(previous[index] ?? null, item),
  );
  await ports.persistence.upsertTransactions(page.items);

  await Promise.all(
    changedTransactions.flatMap((transaction) => [
      ports.queue.enqueue(
        {
          type: "analyze",
          safe: job.safe,
          safeTxHash: transaction.safeTxHash,
        },
        {
          idempotencyKey: `telegram-analyze:${job.safe.chainId}:${transaction.safeTxHash}:${transactionState(transaction)}`,
        },
      ),
      ports.queue.enqueue(
        {
          type: "telegram-alert",
          safe: job.safe,
          safeTxHash: transaction.safeTxHash,
          attempt: 0,
        },
        {
          idempotencyKey: `telegram-alert:${job.safe.chainId}:${transaction.safeTxHash}:${transactionState(transaction)}`,
          delaySeconds: ANALYSIS_WAIT_SECONDS,
        },
      ),
    ]),
  );

  const now = ports.now();
  await ports.queue.enqueue(job, {
    idempotencyKey: watchKey(job.safe, now + WATCH_INTERVAL_SECONDS),
    delaySeconds: WATCH_INTERVAL_SECONDS,
  });
  return { status: "watching", changes: changedTransactions.length };
}

function shortAddress(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function verdictHeading(verdict: Verdict): string {
  switch (verdict) {
    case "flagged":
      return "🔴 DO NOT SIGN YET";
    case "unverified":
      return "🟠 REVIEW BEFORE SIGNING";
    case "known":
      return "🟡 CHECK THE DETAILS";
    case "trusted":
      return "🟢 NO KNOWN WARNING FOUND";
  }
}

const plainFindingTitles: Readonly<Record<string, string>> = {
  "new-approval-spender": "A new wallet is being allowed to spend tokens",
  "infinite-allowance": "Unlimited token spending access was granted",
  "requested-infinite-allowance": "This grants unlimited token spending access",
  "requested-operator-all": "This grants control over every compatible token",
  "permit2-signature-transfer": "A signature-based token transfer is requested",
  "maximum-permit2-signature-transfer":
    "A maximum-value signature-based transfer is requested",
  "delegatecall-operation": "This call can change the Safe itself",
  "internal-delegatecall": "An inner call can change contract-owned storage",
  "explicitly-flagged-address": "A known dangerous address is involved",
  "movement-trust-unresolved": "A token transfer involves an unknown address",
  "spender-trust-unresolved": "The spender address is not recognized",
  "unverified-target": "The target contract could not be verified",
  "raw-calldata": "The requested action could not be decoded",
  "signature-only-decode": "The requested action is only a best-effort match",
  "unrecognized-storage-change": "The call changes storage we cannot explain",
};

function plainFindingTitle(code: string, fallback: string): string {
  return plainFindingTitles[code] ?? fallback;
}

function statusLine(transaction: SafeTransaction, threshold: number): string {
  if (transaction.status === "executed") return "Status: Executed";
  if (transaction.status === "failed") return "Status: Execution failed";
  if (transaction.status === "replaced")
    return "Status: Replaced by another proposal";
  if (transaction.confirmations.length >= threshold) {
    return "Status: Signature threshold reached — it can now be executed";
  }
  return "Status: Waiting for more owners";
}

function actionLine(transaction: SafeTransaction): string {
  if (transaction.operation === "delegatecall")
    return "Action: Delegate call (high privilege)";
  if (transaction.data === "0x") {
    return transaction.value > 0n
      ? `Action: Send ${transaction.value.toString()} wei`
      : "Action: Empty contract/wallet call";
  }
  return `Action: Contract call ${transaction.data.slice(0, 10)}`;
}

function latestEventTime(transaction: SafeTransaction): number {
  return Math.max(
    transaction.proposedAt,
    transaction.executedAt ?? 0,
    ...transaction.confirmations.map(
      (confirmation) => confirmation.signedAt ?? 0,
    ),
  );
}

export function telegramAlertEventKey(
  transaction: SafeTransaction,
  analysis: AnalysisResult | null,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        state: transactionState(transaction),
        verdict: analysis?.verdict ?? "unavailable",
        engine: analysis?.engineVersion ?? "unavailable",
      }),
    )
    .digest("hex");
}

export function formatTelegramAlert(
  transaction: SafeTransaction,
  threshold: number,
  analysis: AnalysisResult | null,
  verificationId?: string,
  verificationPageUrl?: string,
): string {
  const verdict = analysis?.verdict ?? "unverified";
  const importantFindings = (analysis?.findings ?? [])
    .filter((finding) => finding.severity !== "info")
    .slice(0, 4);
  const signerLines = confirmationKeys(transaction.confirmations).map(
    (owner) => `• ${owner}`,
  );

  return [
    verdictHeading(verdict),
    "",
    `Safe ${shortAddress(transaction.safe.address)} on chain ${transaction.safe.chainId}`,
    statusLine(transaction, threshold),
    `Signed: ${transaction.confirmations.length} of ${threshold}`,
    ...signerLines,
    "",
    actionLine(transaction),
    `Nonce: ${transaction.nonce.toString()}`,
    `Native value: ${transaction.value.toString()} wei`,
    `Target: ${transaction.to}`,
    `Operation: ${transaction.operation}`,
    `Safe transaction hash: ${transaction.safeTxHash}`,
    ...(verificationId ? [`Alert verification ID: ${verificationId}`] : []),
    ...(verificationPageUrl
      ? [`Official verification page: ${verificationPageUrl}`]
      : []),
    ...(importantFindings.length > 0
      ? [
          "",
          "Warnings:",
          ...importantFindings.flatMap((finding) => [
            `• ${plainFindingTitle(finding.code, finding.title)}`,
            ...finding.addresses
              .slice(0, 4)
              .map((address) => `  Address: ${address}`),
          ]),
        ]
      : analysis
        ? ["", "No critical or warning signal was found in available evidence."]
        : [
            "",
            "Independent analysis is not available yet. Do not rely on this alert alone.",
          ]),
    "",
    "Telegram is notification-only. Never sign because of this message.",
    "Open Safe Inspector independently and verify this alert, then compare every address in your signing wallet.",
  ].join("\n");
}

export async function runTelegramAlertJob(job: AlertJob, ports: AlertPorts) {
  const transaction = await ports.persistence.findTransaction(
    job.safe,
    job.safeTxHash,
  );
  const safe = await ports.persistence.findSafe(job.safe);
  if (!transaction || !safe) {
    return { status: "skipped", reason: "transaction_or_safe_not_found" };
  }

  const analysis = await ports.persistence.findAnalysis(
    job.safeTxHash,
    TRANSACTION_ANALYSIS_ENGINE_VERSION,
  );
  if (!analysis && job.attempt < MAX_ALERT_ATTEMPTS) {
    const nextAttempt = job.attempt + 1;
    await ports.queue.enqueue(
      { ...job, attempt: nextAttempt },
      {
        idempotencyKey: `telegram-alert-retry:${job.safe.chainId}:${job.safeTxHash}:${nextAttempt}`,
        delaySeconds: ANALYSIS_WAIT_SECONDS,
      },
    );
    return { status: "waiting_for_analysis", attempt: nextAttempt };
  }

  const subscriptions = await ports.persistence.listTelegramSubscriptions(
    job.safe,
  );
  const eventKey = telegramAlertEventKey(transaction, analysis);
  let sent = 0;
  for (const subscription of subscriptions) {
    if (latestEventTime(transaction) + 5 < subscription.createdAt) continue;
    const deliveryId = await ports.persistence.claimTelegramDelivery(
      subscription.id,
      job.safeTxHash,
      eventKey,
    );
    if (!deliveryId) continue;
    let messageSent = false;
    try {
      const receipt = createTelegramAlertReceipt({
        transaction,
        threshold: safe.threshold,
        analysis,
        issuedAt: ports.now(),
      });
      await ports.persistence.saveTelegramAlertReceipt(deliveryId, receipt);
      const verificationUrl = new URL(
        `/alerts/verify/${encodeURIComponent(receipt.payload.verificationId)}`,
        ports.appUrl,
      ).toString();
      const verificationPageUrl = new URL(
        "/alerts/verify",
        ports.appUrl,
      ).toString();
      await ports.telegram.sendMessage({
        chatId: subscription.chatId,
        text: formatTelegramAlert(
          transaction,
          safe.threshold,
          analysis,
          receipt.payload.verificationId,
          verificationPageUrl,
        ),
        verificationUrl,
      });
      messageSent = true;
      await ports.persistence.completeTelegramDelivery(deliveryId, ports.now());
      sent += 1;
    } catch (error) {
      if (!messageSent) {
        await ports.persistence.releaseTelegramDelivery(deliveryId);
      }
      throw error;
    }
  }
  return { status: "complete", sent };
}
