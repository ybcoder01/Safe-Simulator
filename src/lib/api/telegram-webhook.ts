import type { SafeRef } from "@/core/domain";
import type {
  PersistencePort,
  RecurringQueuePort,
  TelegramDeliveryPort,
} from "@/core/ports";
import { hashTelegramLinkToken } from "@/lib/api/telegram-link";
import {
  legacyTelegramWatchScheduleId,
  TELEGRAM_SWEEP_CRON,
  TELEGRAM_SWEEP_SCHEDULE_ID,
} from "@/lib/api/telegram-schedule";

interface TelegramCommandPorts {
  readonly persistence: Pick<
    PersistencePort,
    | "consumeTelegramLinkToken"
    | "disableTelegramSubscriptionsForChat"
    | "listTelegramSubscriptionsForChat"
  >;
  readonly queue: RecurringQueuePort;
  readonly telegram: TelegramDeliveryPort;
  readonly now: () => number;
}

function watchKey(chainId: number, address: string, now: number) {
  return `telegram-watch:${chainId}:${address.toLowerCase()}:${Math.floor(now / 120)}`;
}

export async function ensureTelegramWatch(
  safe: SafeRef,
  ports: Pick<TelegramCommandPorts, "queue" | "now">,
): Promise<void> {
  const job = { type: "telegram-watch" as const, safe };
  await ports.queue.schedule(
    { type: "telegram-sweep", cursor: null },
    {
      scheduleId: TELEGRAM_SWEEP_SCHEDULE_ID,
      cron: TELEGRAM_SWEEP_CRON,
    },
  );
  try {
    await ports.queue.deleteSchedule(
      legacyTelegramWatchScheduleId(safe.chainId, safe.address),
    );
  } catch {
    // A missing legacy schedule is the desired end state.
  }
  try {
    await ports.queue.enqueue(job, {
      idempotencyKey: watchKey(safe.chainId, safe.address, ports.now()),
    });
  } catch (error) {
    console.error("[telegram-watch] immediate check could not be queued", {
      chainId: safe.chainId,
      safe: safe.address,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
  }
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
  chatLabel: string | null,
  text: string,
  ports: TelegramCommandPorts,
): Promise<void> {
  const [command = "", argument] = text.trim().split(/\s+/, 2);
  if (command.startsWith("/start") && argument) {
    const subscription = await ports.persistence.consumeTelegramLinkToken(
      hashTelegramLinkToken(argument),
      chatId,
      chatLabel,
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
      const scheduleId = legacyTelegramWatchScheduleId(
        safe.chainId,
        safe.address,
      );
      try {
        await ports.queue.deleteSchedule(scheduleId);
      } catch (error) {
        console.error("[telegram-watch] legacy schedule cleanup failed", {
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
