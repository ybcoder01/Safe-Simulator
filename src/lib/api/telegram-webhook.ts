import { createHash } from "node:crypto";

import type { SafeRef } from "@/core/domain";
import type {
  PersistencePort,
  RecurringQueuePort,
  TelegramDeliveryPort,
} from "@/core/ports";
import { hashTelegramLinkToken } from "@/lib/api/telegram-link";

interface TelegramCommandPorts {
  readonly persistence: Pick<
    PersistencePort,
    | "consumeTelegramLinkToken"
    | "disableTelegramSubscriptionsForChat"
    | "listTelegramSubscriptions"
    | "listTelegramSubscriptionsForChat"
  >;
  readonly queue: RecurringQueuePort;
  readonly telegram: TelegramDeliveryPort;
  readonly now: () => number;
}

const TELEGRAM_WATCH_CRON = "* * * * *";

function watchKey(chainId: number, address: string, now: number) {
  return `telegram-watch:${chainId}:${address.toLowerCase()}:${Math.floor(now / 60)}`;
}

export function telegramWatchScheduleId(
  chainId: number,
  address: string,
): string {
  const digest = createHash("sha256")
    .update(`telegram-watch:${chainId}:${address.toLowerCase()}`)
    .digest("hex");
  return `telegram-watch-${digest}`;
}

async function ensureTelegramWatch(
  safe: SafeRef,
  ports: Pick<TelegramCommandPorts, "queue" | "now">,
): Promise<void> {
  const job = { type: "telegram-watch" as const, safe };
  await ports.queue.schedule(job, {
    scheduleId: telegramWatchScheduleId(safe.chainId, safe.address),
    cron: TELEGRAM_WATCH_CRON,
  });
  await ports.queue.enqueue(job, {
    idempotencyKey: watchKey(safe.chainId, safe.address, ports.now()),
  });
}

function uniqueSafes(
  subscriptions: readonly {
    readonly safe: SafeRef;
  }[],
): readonly SafeRef[] {
  return Array.from(
    new Map(
      subscriptions.map((item) => [
        `${item.safe.chainId}:${item.safe.address.toLowerCase()}`,
        item.safe,
      ]),
    ).values(),
  );
}

export async function handleTelegramCommand(
  chatId: string,
  text: string,
  ports: TelegramCommandPorts,
): Promise<void> {
  const [command = "", argument] = text.trim().split(/\s+/, 2);
  if (command.startsWith("/start") && argument) {
    const subscription = await ports.persistence.consumeTelegramLinkToken(
      hashTelegramLinkToken(argument),
      chatId,
      ports.now(),
    );
    if (!subscription) {
      await ports.telegram.sendMessage({
        chatId,
        text: "This connection link is invalid or expired. Create a new link from Safe Inspector.",
      });
      return;
    }
    await ensureTelegramWatch(subscription.safe, ports);
    await ports.telegram.sendMessage({
      chatId,
      text: [
        "✅ Alerts enabled",
        "",
        `Safe: ${subscription.safe.address}`,
        `Chain ID: ${subscription.safe.chainId}`,
        "",
        "I will alert you when an owner signs, when another signer is added, when the threshold is reached, and when the proposal status changes.",
      ].join("\n"),
    });
    return;
  }

  if (command.startsWith("/stop")) {
    const subscriptions =
      await ports.persistence.listTelegramSubscriptionsForChat(chatId);
    const disabled =
      await ports.persistence.disableTelegramSubscriptionsForChat(chatId);
    for (const safe of uniqueSafes(subscriptions)) {
      const remaining = await ports.persistence.listTelegramSubscriptions(safe);
      if (remaining.length === 0) {
        const scheduleId = telegramWatchScheduleId(safe.chainId, safe.address);
        try {
          await ports.queue.deleteSchedule(scheduleId);
        } catch (error) {
          console.error("[telegram-watch] schedule cleanup failed", {
            chainId: safe.chainId,
            safe: safe.address,
            scheduleId,
            error:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : { message: String(error) },
          });
        }
      }
    }
    await ports.telegram.sendMessage({
      chatId,
      text:
        disabled > 0
          ? `Alerts stopped for ${disabled} Safe${disabled === 1 ? "" : "s"}.`
          : "No active Safe alerts were found.",
    });
    return;
  }

  if (command.startsWith("/safes")) {
    const subscriptions =
      await ports.persistence.listTelegramSubscriptionsForChat(chatId);
    await Promise.all(
      uniqueSafes(subscriptions).map((safe) =>
        ensureTelegramWatch(safe, ports),
      ),
    );
    await ports.telegram.sendMessage({
      chatId,
      text:
        subscriptions.length === 0
          ? "You are not watching any Safes yet. Connect one from Safe Inspector."
          : [
              "✅ Alert monitoring checked and active.",
              "",
              "Safes watched by this chat:",
              ...subscriptions.map(
                (item) => `• Chain ${item.safe.chainId}: ${item.safe.address}`,
              ),
            ].join("\n"),
    });
    return;
  }

  await ports.telegram.sendMessage({
    chatId,
    text: "Safe Inspector bot commands:\n/start <link code> — enable alerts\n/safes — list watched Safes\n/stop — stop all alerts in this chat",
  });
}
