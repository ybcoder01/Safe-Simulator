import type {
  QueuePort,
  PersistencePort,
  TelegramDeliveryPort,
} from "@/core/ports";
import { hashTelegramLinkToken } from "@/lib/api/telegram-link";

interface TelegramCommandPorts {
  readonly persistence: Pick<
    PersistencePort,
    | "consumeTelegramLinkToken"
    | "disableTelegramSubscriptionsForChat"
    | "listTelegramSubscriptionsForChat"
  >;
  readonly queue: QueuePort;
  readonly telegram: TelegramDeliveryPort;
  readonly now: () => number;
}

function watchKey(chainId: number, address: string, now: number) {
  return `telegram-watch:${chainId}:${address.toLowerCase()}:${Math.floor(now / 60)}`;
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
    await ports.queue.enqueue(
      { type: "telegram-watch", safe: subscription.safe },
      {
        idempotencyKey: watchKey(
          subscription.safe.chainId,
          subscription.safe.address,
          ports.now(),
        ),
      },
    );
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
    const disabled =
      await ports.persistence.disableTelegramSubscriptionsForChat(chatId);
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
    await ports.telegram.sendMessage({
      chatId,
      text:
        subscriptions.length === 0
          ? "You are not watching any Safes yet. Connect one from Safe Inspector."
          : [
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
