import type { QueueJob } from "@/core/domain";
import type {
  ChainPort,
  PersistencePort,
  QueuePort,
  SlackDeliveryPort,
} from "@/core/ports";
import { refreshSafeSnapshot } from "@/core/ingestion/safe-snapshot";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "@/lib/api/analysis-version";
import { createTelegramAlertReceipt } from "@/lib/api/telegram-alert-receipts";
import {
  formatSlackAlert,
  telegramAlertEventKey,
} from "@/lib/api/telegram-alerts";

const ANALYSIS_WAIT_SECONDS = 12;
const MAX_ALERT_ATTEMPTS = 4;

type SlackAlertJob = Extract<QueueJob, { type: "slack-alert" }>;

interface SlackAlertPorts {
  readonly chain: Pick<ChainPort, "getSafeSnapshot">;
  readonly persistence: Pick<
    PersistencePort,
    | "claimSlackDelivery"
    | "completeSlackDelivery"
    | "findAnalysis"
    | "findSafe"
    | "findTransaction"
    | "listSlackSubscriptions"
    | "recordSlackDeliveryResult"
    | "releaseSlackDelivery"
    | "saveSlackAlertReceipt"
    | "upsertSafe"
  >;
  readonly queue: QueuePort;
  readonly slack: SlackDeliveryPort;
  readonly now: () => number;
  readonly appUrl: string;
}

function latestEventTime(transaction: {
  readonly proposedAt: number;
  readonly executedAt: number | null;
  readonly confirmations: readonly { readonly signedAt: number | null }[];
}): number {
  return Math.max(
    transaction.proposedAt,
    transaction.executedAt ?? 0,
    ...transaction.confirmations.map(
      (confirmation) => confirmation.signedAt ?? 0,
    ),
  );
}

export async function runSlackAlertJob(
  job: SlackAlertJob,
  ports: SlackAlertPorts,
) {
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
        idempotencyKey: `slack-alert-retry:${job.safe.chainId}:${job.safeTxHash}:${nextAttempt}`,
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
  const subscriptions = await ports.persistence.listSlackSubscriptions(
    job.safe,
  );
  const eventKey = telegramAlertEventKey(transaction, analysis);
  let sent = 0;

  for (const subscription of subscriptions) {
    if (latestEventTime(transaction) + 5 < subscription.createdAt) continue;
    const deliveryId = await ports.persistence.claimSlackDelivery(
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
      await ports.persistence.saveSlackAlertReceipt(deliveryId, receipt);
      const verificationUrl = new URL(
        `/alerts/verify/${encodeURIComponent(receipt.payload.verificationId)}`,
        ports.appUrl,
      ).toString();
      await ports.slack.sendMessage({
        channelId: subscription.channelId,
        text: formatSlackAlert(transaction, alertSafe.threshold, analysis),
        verificationUrl,
      });
      messageSent = true;
      await ports.persistence.completeSlackDelivery(deliveryId, ports.now());
      await ports.persistence.recordSlackDeliveryResult(
        subscription.id,
        ports.now(),
        null,
      );
      sent += 1;
    } catch (error) {
      await ports.persistence
        .recordSlackDeliveryResult(
          subscription.id,
          ports.now(),
          "Slack did not accept the latest alert. Send a test alert or reconnect this channel.",
        )
        .catch(() => undefined);
      if (!messageSent) {
        await ports.persistence.releaseSlackDelivery(deliveryId);
      }
      throw error;
    }
  }

  return { status: "complete", sent };
}
