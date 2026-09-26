import { createHash } from "node:crypto";

import { classifyTransactionActivity } from "@/core/analysis/decoding/activity";
import { findContractRegistryEntry } from "@/core/analysis/trust/contract-registry";
import type {
  AnalysisResult,
  Confirmation,
  QueueJob,
  SafeRef,
  SafeTransaction,
  Verdict,
} from "@/core/domain";
import type {
  ChainPort,
  PersistencePort,
  QueuePort,
  SafeDataPort,
  TelegramDeliveryPort,
} from "@/core/ports";
import { refreshSafeSnapshot } from "@/core/ingestion/safe-snapshot";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "@/lib/api/analysis-version";
import { createTelegramAlertReceipt } from "@/lib/api/telegram-alert-receipts";

const WATCH_PAGE_SIZE = 50;
const WATCH_INTERVAL_SECONDS = 60;
const ANALYSIS_WAIT_SECONDS = 12;
const MAX_ALERT_ATTEMPTS = 4;

type WatchJob = Extract<QueueJob, { type: "telegram-watch" }>;
type AlertJob = Extract<QueueJob, { type: "telegram-alert" }>;

interface WatchPorts {
  readonly chain: Pick<ChainPort, "getSafeSnapshot">;
  readonly persistence: Pick<
    PersistencePort,
    | "findTransaction"
    | "listTelegramSubscriptions"
    | "upsertSafe"
    | "upsertTransactions"
  >;
  readonly queue: QueuePort;
  readonly safeData: Pick<SafeDataPort, "listMultisigTransactions">;
  readonly now: () => number;
}

interface AlertPorts {
  readonly chain: Pick<ChainPort, "getSafeSnapshot">;
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
    | "upsertSafe"
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

  await refreshSafeSnapshot(job.safe, ports);

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

function alertHeading(
  transaction: SafeTransaction,
  threshold: number,
  verdict: Verdict,
): string {
  if (transaction.status === "executed") {
    if (verdict === "flagged") return "🔴 HIGH-RISK TRANSACTION EXECUTED";
    if (verdict === "unverified") return "🟠 EXECUTED — REVIEW REQUIRED";
    return "🟢 TRANSACTION EXECUTED";
  }
  if (transaction.status === "failed") {
    return verdict === "flagged"
      ? "🔴 FAILED ATTEMPT NEEDS REVIEW"
      : "⚪ TRANSACTION FAILED";
  }
  if (transaction.status === "replaced") {
    return verdict === "flagged"
      ? "🔴 REPLACED TRANSACTION NEEDS REVIEW"
      : "⚪ TRANSACTION REPLACED";
  }
  if (verdict === "flagged") {
    return transaction.confirmations.length >= threshold
      ? "🔴 STOP — READY TO EXECUTE"
      : "🔴 DO NOT SIGN";
  }
  if (verdict === "unverified") return "🟠 VERIFY BEFORE SIGNING";
  return "🟢 NO KNOWN WARNING FOUND";
}

const plainFindingTitles: Readonly<Record<string, string>> = {
  "new-approval-spender": "A new address can spend this Safe's tokens",
  "infinite-allowance": "Unlimited token spending access was granted",
  "requested-infinite-allowance":
    "Unlimited token spending access is requested",
  "requested-operator-all": "Control over every compatible token is requested",
  "permit2-signature-transfer": "A signature-based token transfer is requested",
  "maximum-permit2-signature-transfer":
    "A maximum-value signature-based transfer is requested",
  "delegatecall-operation": "This call can change the Safe itself",
  "internal-delegatecall":
    "A connected contract can make high-privilege internal changes",
  "explicitly-flagged-address": "A known dangerous address is involved",
  "movement-trust-unresolved": "A token moved through an unrecognized address",
  "spender-trust-unresolved": "The token spender is not recognized",
  "internal-call-trust-unresolved":
    "The transaction called an unrecognized contract internally",
  "unverified-target": "The destination contract could not be verified",
  "target-account-type-unavailable":
    "We could not confirm whether the destination is a wallet or contract",
  "raw-calldata": "The requested action could not be explained",
  "signature-only-decode": "The action is only a best-effort identification",
  "unrecognized-storage-change":
    "A connected contract made changes we could not fully explain",
  "partial-analysis-coverage":
    "Some transaction evidence was unavailable during the safety check",
  "safe-owner-change": "The Safe's owners are being changed",
  "safe-threshold-change":
    "The number of approvals required by the Safe is being changed",
  "module-execution-path":
    "A Safe module can execute without the normal owner-approval flow",
  "module-replay-anchor-mismatch":
    "The module execution could not be matched to its original chain state",
  "module-replay-anchor-unverified":
    "The module execution's original chain state could not be verified",
  "safe-batch-latest-bytecode-fallback":
    "The historical Safe batch code could not be independently verified",
};

function plainFindingTitle(code: string, fallback: string): string {
  return plainFindingTitles[code] ?? fallback;
}

function statusExplanation(
  transaction: SafeTransaction,
  threshold: number,
): string {
  if (transaction.status === "executed") {
    return "This transaction has already gone through. It cannot be stopped now.";
  }
  if (transaction.status === "failed") {
    return "The execution failed. It did not complete, but any related approvals should still be reviewed.";
  }
  if (transaction.status === "replaced") {
    return "Another proposal used this nonce. This proposal can no longer execute.";
  }
  if (transaction.confirmations.length >= threshold) {
    return "Enough owner approvals have been collected. This can now be executed.";
  }
  const remaining = Math.max(threshold - transaction.confirmations.length, 0);
  return `Waiting for ${remaining} more owner ${remaining === 1 ? "approval" : "approvals"}.`;
}

function networkName(chainId: number): string {
  if (chainId === 1) return "Ethereum";
  if (chainId === 50) return "XDC Network";
  return `Chain ${chainId}`;
}

function actionSummary(transaction: SafeTransaction): string {
  if (transaction.operation === "delegatecall") {
    return "High-privilege delegate call";
  }
  return classifyTransactionActivity(transaction).label;
}

function targetSummary(transaction: SafeTransaction): string {
  const registryEntry = findContractRegistryEntry(
    transaction.safe.chainId,
    transaction.to,
  );
  if (registryEntry) {
    return `${registryEntry.label} (${shortAddress(transaction.to)})`;
  }
  const activity = classifyTransactionActivity(transaction);
  const description =
    activity.type === "transfer" ? "Recipient" : "Unrecognized address";
  return `${description} (${shortAddress(transaction.to)})`;
}

function nextStep(transaction: SafeTransaction, verdict: Verdict): string {
  if (transaction.status === "executed") {
    return verdict === "flagged" || verdict === "unverified"
      ? "If you do not recognize this, contact the other owners and inspect token approvals immediately."
      : "Confirm that the action and destination match what the owners intended.";
  }
  if (transaction.status === "failed" || transaction.status === "replaced") {
    return "Do not retry automatically. Open the report and verify the action and every involved address first.";
  }
  if (verdict === "flagged") {
    return "Do not add another approval. Open the report and compare the action and addresses with your signing wallet.";
  }
  if (verdict === "unverified") {
    return "Open the report before signing and verify every unrecognized address.";
  }
  return "Open the report and confirm the action and destination before signing.";
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
): string {
  const verdict = analysis?.verdict ?? "unverified";
  const importantFindings = Array.from(
    new Set(
      (analysis?.findings ?? [])
        .filter((finding) => finding.severity !== "info")
        .map((finding) => plainFindingTitle(finding.code, finding.title)),
    ),
  ).slice(0, 3);

  return [
    alertHeading(transaction, threshold, verdict),
    "",
    statusExplanation(transaction, threshold),
    "",
    "What happened",
    `• Action: ${actionSummary(transaction)}`,
    `• With: ${targetSummary(transaction)}`,
    `• Owner approvals: ${transaction.confirmations.length} of ${threshold} required`,
    ...(importantFindings.length > 0
      ? [
          "",
          "Why this needs attention",
          ...importantFindings.map((finding) => `• ${finding}`),
        ]
      : analysis
        ? [
            "",
            "What we found",
            "• No critical or warning signal was found in the available evidence.",
          ]
        : [
            "",
            "Why this needs attention",
            "• Independent analysis is not available yet.",
          ]),
    "",
    "What you should do",
    `• ${nextStep(transaction, verdict)}`,
    "",
    `Safe: ${shortAddress(transaction.safe.address)} · ${networkName(transaction.safe.chainId)}`,
    "Never sign from a Telegram alert alone. Verify in Safe Inspector.",
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

  const currentSafe = await refreshSafeSnapshot(job.safe, ports);
  const alertSafe =
    transaction.blockNumber !== null && transaction.blockNumber > 0n
      ? await ports.chain
          .getSafeSnapshot(job.safe, transaction.blockNumber - 1n)
          .catch(() => safe)
      : currentSafe;

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
        threshold: alertSafe.threshold,
        analysis,
        issuedAt: ports.now(),
      });
      await ports.persistence.saveTelegramAlertReceipt(deliveryId, receipt);
      const verificationUrl = new URL(
        `/alerts/verify/${encodeURIComponent(receipt.payload.verificationId)}`,
        ports.appUrl,
      ).toString();
      await ports.telegram.sendMessage({
        chatId: subscription.chatId,
        text: formatTelegramAlert(transaction, alertSafe.threshold, analysis),
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
