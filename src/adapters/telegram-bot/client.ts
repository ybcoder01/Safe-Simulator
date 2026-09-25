import type { TelegramDeliveryPort } from "@/core/ports";

interface TelegramApiResponse {
  readonly ok: boolean;
  readonly description?: string;
}

type Fetcher = typeof fetch;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function telegramBotUsername(): string {
  return requiredEnvironment("TELEGRAM_BOT_USERNAME").replace(/^@/, "");
}

export function telegramWebhookSecret(): string {
  return requiredEnvironment("TELEGRAM_WEBHOOK_SECRET");
}

export class TelegramBotAdapter implements TelegramDeliveryPort {
  private readonly token: string;

  constructor(private readonly fetcher: Fetcher = fetch) {
    this.token = requiredEnvironment("TELEGRAM_BOT_TOKEN");
  }

  async sendMessage(input: {
    readonly chatId: string;
    readonly text: string;
    readonly verificationUrl?: string;
  }): Promise<void> {
    const response = await this.fetcher(
      `https://api.telegram.org/bot${this.token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
          disable_web_page_preview: true,
          ...(input.verificationUrl
            ? {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "Verify this alert",
                        url: input.verificationUrl,
                      },
                    ],
                  ],
                },
              }
            : {}),
        }),
      },
    );

    const payload = (await response
      .json()
      .catch(() => null)) as TelegramApiResponse | null;
    if (!response.ok || payload?.ok !== true) {
      throw new Error(
        payload?.description ?? `Telegram returned HTTP ${response.status}.`,
      );
    }
  }
}
