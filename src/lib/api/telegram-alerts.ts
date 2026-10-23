import { createHash } from "node:crypto";

import { formatEther } from "viem";

import { classifyTransactionActivity } from "@/core/analysis/decoding/activity";
import { knownCallSummary } from "@/core/analysis/decoding/calldata";
import { findContractRegistryEntry } from "@/core/analysis/trust/contract-registry";
import { findTokenRegistryEntry } from "@/core/analysis/trust/token-registry";
import type {
  AnalysisResult,
  Confirmation,
  Page,
  QueueJob,
  SafeTransaction,
} from "@/core/domain";
import type {
  CachePort,
  ChainPort,
  PersistencePort,
  QueuePort,
  SafeDataPort,
  TelegramDeliveryPort,
} from "@/core/ports";
import { refreshSafeSnapshot } from "@/core/ingestion/safe-snapshot";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "@/lib/api/analysis-version";
import { createTelegramAlertReceipt } from "@/lib/api/telegram-alert-receipts";
import { currentStageFromTransaction } from "@/lib/alert-stage";
import {
  TELEGRAM_WATCH_HEALTH_TTL_SECONDS,
  TELEGRAM_WATCH_REGISTRY_TTL_SECONDS,
  TELEGRAM_WATCH_STATE_TTL_SECONDS,
  telegramWatchHealthKey,
  telegramWatchRegistryKey,
  telegramWatchStateKey,
  type TelegramWatchHealth,
  type TelegramWatchRegistryPage,
} from "@/lib/api/telegram-watch-cache";

const WATCH_PAGE_SIZE = 50;
const ANALYSIS_WAIT_SECONDS = 12;
const MAX_ALERT_ATTEMPTS = 4;
const TELEGRAM_SWEEP_PAGE_SIZE = 20;

type WatchJob = Extract<QueueJob, { type: "telegram-watch" }>;
type SweepJob = Extract<QueueJob, { type: "telegram-sweep" }>;
type AlertJob = Extract<QueueJob, { type: "telegram-alert" }>;

interface WatchPorts {
  readonly cache: CachePort;
  readonly chain: Pick<ChainPort, "getSafeSnapshot">;
  readonly persistence: Pick<
    PersistencePort,
    | "findTransaction"
    | "listTelegramSubscriptions"
    | "recordTelegramWatchResult"
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
    | "recordTelegramDeliveryResult"
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

function watchState(transactions: readonly SafeTransaction[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        transactions
          .map((transaction) => ({
            safeTxHash: transaction.safeTxHash.toLowerCase(),
            state: transactionState(transaction),
          }))
          .sort((left, right) =>
            left.safeTxHash.localeCompare(right.safeTxHash),
          ),
      ),
    )
    .digest("hex");
}

async function readCache<T>(cache: CachePort, key: string): Promise<T | null> {
  try {
    return await cache.get<T>(key);
  } catch {
    return null;
  }
}

async function writeCache<T>(
  cache: CachePort,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  try {
    await cache.set(key, value, ttlSeconds);
  } catch (error) {
    console.error("[telegram-watch] cache write failed", {
      key,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
  }
}

async function recordCachedWatchHealth(
  safe: WatchJob["safe"],
  ports: Pick<WatchPorts, "cache" | "now">,
  error: string | null,
): Promise<void> {
  await writeCache<TelegramWatchHealth>(
    ports.cache,
    telegramWatchHealthKey(safe),
    { checkedAt: ports.now(), error },
    TELEGRAM_WATCH_HEALTH_TTL_SECONDS,
  );
}

function changed(
  previous: SafeTransaction | null,
  current: SafeTransaction,
): boolean {
  if (!previous) return current.confirmations.length > 0;
  return transactionState(previous) !== transactionState(current);
}

export async function runTelegramWatchJob(
  job: WatchJob,
  ports: WatchPorts,
  prefetchedPage?: Page<SafeTransaction>,
) {
  const subscriptions = await ports.persistence.listTelegramSubscriptions(
    job.safe,
  );
  if (subscriptions.length === 0) return { status: "stopped", changes: 0 };

  try {
    await refreshSafeSnapshot(job.safe, ports);

    const page =
      prefetchedPage ??
      (await ports.safeData.listMultisigTransactions(
        job.safe,
        null,
        WATCH_PAGE_SIZE,
      ));
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

    await ports.persistence.recordTelegramWatchResult(
      job.safe,
      ports.now(),
      null,
    );
    await Promise.all([
      writeCache(
        ports.cache,
        telegramWatchStateKey(job.safe),
        watchState(page.items),
        TELEGRAM_WATCH_STATE_TTL_SECONDS,
      ),
      recordCachedWatchHealth(job.safe, ports, null),
    ]);
    return { status: "watching", changes: changedTransactions.length };
  } catch (error) {
    const publicError =
      "The latest monitoring check failed. Use Check now or try again shortly.";
    await ports.persistence
      .recordTelegramWatchResult(job.safe, ports.now(), publicError)
      .catch(() => undefined);
    await recordCachedWatchHealth(job.safe, ports, publicError);
    throw error;
  }
}

interface SweepPorts extends Omit<WatchPorts, "persistence"> {
  readonly persistence: WatchPorts["persistence"] &
    Pick<PersistencePort, "listTelegramWatchedSafes">;
}

export async function runTelegramSweepJob(job: SweepJob, ports: SweepPorts) {
  const registryKey = telegramWatchRegistryKey(job.cursor);
  let page = await readCache<TelegramWatchRegistryPage>(
    ports.cache,
    registryKey,
  );
  if (!page) {
    page = await ports.persistence.listTelegramWatchedSafes(
      job.cursor,
      TELEGRAM_SWEEP_PAGE_SIZE,
    );
    await writeCache(
      ports.cache,
      registryKey,
      page,
      TELEGRAM_WATCH_REGISTRY_TTL_SECONDS,
    );
  }
  let checked = 0;
  let failed = 0;
  for (const safe of page.items) {
    try {
      const transactionPage = await ports.safeData.listMultisigTransactions(
        safe,
        null,
        WATCH_PAGE_SIZE,
      );
      const currentState = watchState(transactionPage.items);
      const previousState = await readCache<string>(
        ports.cache,
        telegramWatchStateKey(safe),
      );
      if (previousState === currentState) {
        await recordCachedWatchHealth(safe, ports, null);
      } else {
        await runTelegramWatchJob(
          { type: "telegram-watch", safe },
          ports,
          transactionPage,
        );
      }
      checked += 1;
    } catch (error) {
      failed += 1;
      await recordCachedWatchHealth(
        safe,
        ports,
        "The latest monitoring check failed. Use Check now or try again shortly.",
      );
      console.error("[telegram-sweep] Safe check failed", {
        chainId: safe.chainId,
        safe: safe.address,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
    }
  }

  if (page.nextCursor) {
    await ports.queue.enqueue(
      { type: "telegram-sweep", cursor: page.nextCursor },
      {
        idempotencyKey: `telegram-sweep:${Math.floor(ports.now() / 120)}:${page.nextCursor}`,
      },
    );
  }

  return { checked, failed, nextCursor: page.nextCursor };
}

function shortAddress(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

type TelegramBriefSignal = "expected" | "check" | "stop" | "unknown";

interface TelegramBriefCheck {
  readonly key: string;
  readonly severity: "check" | "stop";
  readonly title: string;
  readonly action: string;
}

interface TelegramBrief {
  readonly signal: TelegramBriefSignal;
  readonly heading: string;
  readonly checks: readonly TelegramBriefCheck[];
}

function alertHeading(
  transaction: SafeTransaction,
  signal: TelegramBriefSignal,
): string {
  const isTransfer =
    classifyTransactionActivity(transaction).type === "transfer";
  if (transaction.status === "executed") {
    if (signal === "stop") {
      return isTransfer
        ? "🔴 TRANSFER WENT THROUGH — ACT NOW"
        : "🔴 WENT THROUGH — LOOK INTO THIS NOW";
    }
    if (signal === "check") {
      return isTransfer
        ? "🟠 TRANSFER WENT THROUGH — WORTH A LOOK"
        : "🟠 WENT THROUGH — WORTH A LOOK";
    }
    if (signal === "unknown") return "⚪ WENT THROUGH — COULD NOT CHECK";
    return isTransfer
      ? "🟢 TRANSFER WENT THROUGH — LOOKS NORMAL"
      : "🟢 WENT THROUGH — LOOKS NORMAL";
  }
  if (transaction.status === "failed") {
    return signal === "stop"
      ? "🔴 FAILED ATTEMPT NEEDS REVIEW"
      : "⚪ TRANSACTION FAILED";
  }
  if (transaction.status === "replaced") {
    return signal === "stop"
      ? "🔴 REPLACED TRANSACTION NEEDS REVIEW"
      : "⚪ TRANSACTION REPLACED";
  }
  if (signal === "stop") return "🔴 STOP. DON'T SIGN YET";
  if (signal === "check") return "🟠 CHECK BEFORE YOU SIGN";
  if (signal === "unknown") return "⚪ WE COULDN'T CHECK THIS YET";
  return "🟢 LOOKS NORMAL";
}

const plainFindingTitles: Readonly<Record<string, string>> = {
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

export function plainAlertFindingCode(code: string): string {
  return (
    plainFindingTitles[code] ??
    `${code.charAt(0).toUpperCase()}${code.slice(1).replaceAll("-", " ")}`
  );
}

const CONTROL_CHANGE_CODES = new Set([
  "safe-owner-change",
  "safe-threshold-change",
  "safe-module-change",
  "safe-guard-change",
  "safe-fallback-handler-change",
  "safe-implementation-change",
]);
const PERMISSION_CODES = new Set([
  "infinite-allowance",
  "requested-infinite-allowance",
  "requested-operator-all",
  "maximum-permit2-signature-transfer",
  "permit2-signature-transfer",
  "new-approval-spender",
  "spender-trust-unresolved",
]);
const RECIPIENT_CODES = new Set([
  "movement-trust-unresolved",
  "recipient-address-unconfirmed",
]);
const ROUTE_CODES = new Set([
  "internal-delegatecall",
  "internal-call-trust-unresolved",
  "unverified-target",
  "target-account-type-unavailable",
  "signature-only-decode",
  "raw-calldata",
  "protocol-path-unconfirmed",
  "protocol-route-attestation-incomplete",
  "silo-permissionless-market",
  "silo-market-review-stale",
  "silo-factory-lookup-unavailable",
]);

function hasCode(
  findings: readonly AnalysisResult["findings"][number][],
  codes: ReadonlySet<string>,
) {
  return findings.some((finding) => codes.has(finding.code));
}

function telegramBrief(
  transaction: SafeTransaction,
  analysis: AnalysisResult | null,
): TelegramBrief {
  if (!analysis) {
    return {
      signal: "unknown",
      heading: "We don't have enough information to check it.",
      checks: [],
    };
  }

  const findings = analysis.findings.filter(
    (finding) => finding.severity !== "info",
  );
  const checks: TelegramBriefCheck[] = [];
  const push = (check: TelegramBriefCheck) => {
    if (!checks.some((item) => item.key === check.key)) checks.push(check);
  };

  if (
    findings.some((finding) => finding.code === "explicitly-flagged-address")
  ) {
    push({
      key: "flagged-address",
      severity: "stop",
      title: "A flagged address is involved",
      action:
        "Do not approve. Compare every full address with an independent source and contact the other owners.",
    });
  }
  if (hasCode(findings, CONTROL_CHANGE_CODES)) {
    push({
      key: "safe-control",
      severity: "stop",
      title: "This changes who can control the Safe",
      action:
        "Confirm the exact owner, threshold, module, guard, or implementation change with every owner.",
    });
  }
  if (hasCode(findings, PERMISSION_CODES)) {
    const unlimited = findings.some((finding) =>
      [
        "infinite-allowance",
        "requested-infinite-allowance",
        "requested-operator-all",
        "maximum-permit2-signature-transfer",
      ].includes(finding.code),
    );
    push({
      key: "permissions",
      severity: unlimited ? "stop" : "check",
      title: unlimited
        ? "Unlimited token access is requested"
        : "A contract is receiving token spending access",
      action:
        "Confirm the complete spender address and the exact amount your team intended.",
    });
  }
  if (hasCode(findings, RECIPIENT_CODES)) {
    push({
      key: "recipient",
      severity: "check",
      title: "The recipient could not be independently confirmed",
      action:
        "Compare the complete recipient address with the original request before the final approval.",
    });
  }
  if (hasCode(findings, ROUTE_CODES)) {
    const factoryUnavailable = findings.some(
      (finding) => finding.code === "silo-factory-lookup-unavailable",
    );
    const staleMarket = findings.some(
      (finding) => finding.code === "silo-market-review-stale",
    );
    const siloMarket = findings.some(
      (finding) => finding.code === "silo-permissionless-market",
    );
    push({
      key: "route",
      severity: "check",
      title: factoryUnavailable
        ? "Silo verification is temporarily unavailable"
        : staleMarket
          ? "A trusted Silo market configuration has changed"
          : siloMarket
            ? "The Silo route is genuine; this market still needs approval"
            : "Part of the project route still needs verification",
      action: factoryUnavailable
        ? "The Silo Factory lookup timed out and continues in the background. Reload the report before relying on it."
        : staleMarket
          ? "The saved market approval does not match the current implementation and configuration. Review it and trust the current configuration."
          : siloMarket
            ? "Confirm that your team chose this exact Silo market, including its assets, hooks, and oracles."
            : "Match the destination and any unconfirmed helper contracts with the project's official records.",
    });
  }
  if (analysis.simulation?.success === false) {
    push({
      key: "simulation",
      severity: "stop",
      title: "The test run failed",
      action:
        "Do not approve until the failed execution is explained and the transaction has been checked again.",
    });
  }

  const representedCodes = new Set([
    "explicitly-flagged-address",
    ...CONTROL_CHANGE_CODES,
    ...PERMISSION_CODES,
    ...RECIPIENT_CODES,
    ...ROUTE_CODES,
  ]);
  const remaining = findings.filter(
    (finding) => !representedCodes.has(finding.code),
  );
  if (remaining.length > 0) {
    push({
      key: "additional",
      severity: remaining.some((finding) => finding.severity === "critical")
        ? "stop"
        : "check",
      title: "One additional check needs attention",
      action:
        "Open the verified report and resolve the remaining check before approving.",
    });
  }

  const signal: TelegramBriefSignal = checks.some(
    (check) => check.severity === "stop",
  )
    ? "stop"
    : checks.length > 0
      ? "check"
      : "expected";
  return {
    signal,
    heading:
      signal === "expected"
        ? "We found nothing unusual."
        : `We couldn't confirm ${checks.length} ${checks.length === 1 ? "thing" : "things"}.`,
    checks: checks.slice(0, 3),
  };
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

function nativeAssetSymbol(chainId: number): string {
  if (chainId === 1) return "ETH";
  if (chainId === 50) return "XDC";
  return "native asset";
}

function transactionDetails(transaction: SafeTransaction): readonly string[] {
  const activity = classifyTransactionActivity(transaction);
  if (activity.basis === "native-value") {
    return [
      `• Sent: ${formatEther(transaction.value)} ${nativeAssetSymbol(transaction.safe.chainId)}`,
      `• To: ${shortAddress(transaction.to)}`,
    ];
  }

  const reviewedToken = findTokenRegistryEntry(
    transaction.safe.chainId,
    transaction.to,
  );
  const decoded = knownCallSummary(
    transaction.data,
    transaction.operation,
    reviewedToken
      ? { decimals: reviewedToken.decimals, symbol: reviewedToken.symbol }
      : "unavailable",
  );

  return [
    `• Action: ${decoded ?? actionSummary(transaction)}`,
    `• With: ${targetSummary(transaction)}`,
  ];
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
        safeTxHash: transaction.safeTxHash.toLowerCase(),
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
  const brief = telegramBrief(transaction, analysis);
  const stage = currentStageFromTransaction(transaction, threshold);
  const target = targetSummary(transaction);
  const recipientNeedsCheck = brief.checks.some(
    (check) => check.key === "recipient",
  );
  const permissionNeedsCheck = brief.checks.some(
    (check) => check.key === "permissions",
  );
  const simulationText = analysis?.simulation
    ? analysis.simulation.success
      ? "✓ Test run: Completed successfully"
      : "× Test run: Failed"
    : "? Test run: Not available";
  const actionHeading =
    stage.id === "collecting-signatures"
      ? "Before another owner signs"
      : "What to do now";

  return [
    alertHeading(transaction, brief.signal),
    "",
    brief.heading,
    stage.label,
    "",
    "What this transaction does",
    ...transactionDetails(transaction),
    `• Approved by: ${transaction.confirmations.length} of ${threshold} owners`,
    "",
    "Quick checks",
    `• ${findContractRegistryEntry(transaction.safe.chainId, transaction.to) ? "✓" : "?"} Who you're dealing with: ${target}`,
    `• ${recipientNeedsCheck ? "!" : "✓"} Who gets the money: ${recipientNeedsCheck ? "Confirm the full recipient address" : "No unexpected recipient found"}`,
    `• ${permissionNeedsCheck ? "!" : "✓"} What it can access: ${permissionNeedsCheck ? "Confirm the spender and amount" : "No unexpected permission found"}`,
    `• ${simulationText}`,
    ...(brief.checks.length > 0
      ? ["", actionHeading, ...brief.checks.map((check) => `• ${check.action}`)]
      : [
          "",
          actionHeading,
          "• Compare the action, amount, and destination with what your team intended.",
        ]),
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
      await ports.persistence.recordTelegramDeliveryResult(
        subscription.id,
        ports.now(),
        null,
      );
      sent += 1;
    } catch (error) {
      await ports.persistence
        .recordTelegramDeliveryResult(
          subscription.id,
          ports.now(),
          "Telegram did not accept the latest alert. Send a test alert or reconnect this chat.",
        )
        .catch(() => undefined);
      if (!messageSent) {
        await ports.persistence.releaseTelegramDelivery(deliveryId);
      }
      throw error;
    }
  }
  return { status: "complete", sent };
}
