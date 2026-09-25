import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { telegramWebhookSecret } from "@/adapters/telegram-bot/client";
import {
  getPersistencePort,
  getQueuePort,
  getTelegramDeliveryPort,
} from "@/container";
import { handleTelegramCommand } from "@/lib/api/telegram-webhook";

const updateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      chat: z.object({ id: z.union([z.number().int(), z.string()]) }),
      text: z.string().max(4_096).optional(),
    })
    .optional(),
});

function equalSecret(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export async function POST(request: Request) {
  let expectedSecret: string;
  try {
    expectedSecret = telegramWebhookSecret();
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
  if (
    !equalSecret(
      request.headers.get("x-telegram-bot-api-secret-token"),
      expectedSecret,
    )
  ) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: true });
  const message = parsed.data.message;
  if (!message?.text) return Response.json({ ok: true });

  try {
    await handleTelegramCommand(String(message.chat.id), message.text, {
      persistence: getPersistencePort(),
      queue: getQueuePort(),
      telegram: getTelegramDeliveryPort(),
      now: () => Math.floor(Date.now() / 1_000),
    });
  } catch (error) {
    console.error("Telegram update handling failed.", error);
  }
  return Response.json({ ok: true });
}
