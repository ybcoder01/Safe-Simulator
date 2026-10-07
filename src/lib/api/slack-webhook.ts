import type { SafeRef } from "@/core/domain";
import type { PersistencePort, RecurringQueuePort } from "@/core/ports";
import { hashSlackLinkToken } from "@/lib/api/slack-link";
import { ensureTelegramWatch } from "@/lib/api/telegram-webhook";

interface SlackCommandPorts {
  readonly persistence: Pick<
    PersistencePort,
    | "consumeSlackLinkToken"
    | "disableSlackSubscriptionsForChannel"
    | "listSlackSubscriptionsForChannel"
  >;
  readonly queue: RecurringQueuePort;
  readonly now: () => number;
}

function uniqueSafes(
  subscriptions: readonly { readonly safe: SafeRef }[],
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

export async function handleSlackCommand(
  input: {
    readonly teamId: string;
    readonly channelId: string;
    readonly channelLabel: string | null;
    readonly text: string;
  },
  ports: SlackCommandPorts,
): Promise<string> {
  const [command = "", argument] = input.text.trim().split(/\s+/, 2);

  if (command.toLowerCase() === "connect" && argument) {
    const subscription = await ports.persistence.consumeSlackLinkToken(
      hashSlackLinkToken(argument),
      input.teamId,
      input.channelId,
      input.channelLabel,
      ports.now(),
    );
    if (!subscription) {
      return "This connection code is invalid or expired. Create a new code from Safe Inspector.";
    }
    await ensureTelegramWatch(subscription.safe, ports);
    return [
      "✅ Safe Inspector alerts enabled for this channel.",
      `Safe: ${subscription.safe.address}`,
      `Chain ID: ${subscription.safe.chainId}`,
      "Alerts are notification-only. Verify every transaction in the signed report before approving it.",
    ].join("\n");
  }

  if (command.toLowerCase() === "list") {
    const subscriptions =
      await ports.persistence.listSlackSubscriptionsForChannel(
        input.teamId,
        input.channelId,
      );
    await Promise.all(
      uniqueSafes(subscriptions).map((safe) =>
        ensureTelegramWatch(safe, ports),
      ),
    );
    return subscriptions.length === 0
      ? "This channel is not watching any Safes yet. Connect one from Safe Inspector."
      : [
          "✅ Alert monitoring checked and active.",
          ...subscriptions.map(
            (item) => `• Chain ${item.safe.chainId}: ${item.safe.address}`,
          ),
        ].join("\n");
  }

  if (command.toLowerCase() === "stop") {
    const disabled =
      await ports.persistence.disableSlackSubscriptionsForChannel(
        input.teamId,
        input.channelId,
      );
    return disabled > 0
      ? `Alerts stopped for ${disabled} Safe${disabled === 1 ? "" : "s"} in this channel.`
      : "No active Safe alerts were found in this channel.";
  }

  return "Safe Inspector commands: `/safe-alerts connect <code>`, `/safe-alerts list`, `/safe-alerts stop`.";
}
