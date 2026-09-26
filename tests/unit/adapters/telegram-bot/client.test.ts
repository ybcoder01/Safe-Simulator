import { afterEach, describe, expect, it, vi } from "vitest";

import { TelegramBotAdapter } from "../../../../src/adapters/telegram-bot/client";

describe("TelegramBotAdapter", () => {
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("uses one plain-language verified-report button", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const adapter = new TelegramBotAdapter(fetcher);

    await adapter.sendMessage({
      chatId: "chat",
      text: "Alert",
      verificationUrl: "https://safe.example/alerts/verify/id",
    });

    const request = fetcher.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(body.reply_markup.inline_keyboard).toEqual([
      [
        {
          text: "Open verified safety report",
          url: "https://safe.example/alerts/verify/id",
        },
      ],
    ]);
  });
});
