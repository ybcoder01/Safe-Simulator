import { z } from "zod";

import type { Hex, SafeMessage } from "@/core/domain";

export const messageHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as Hex);

export const messagePageQuerySchema = z.object({
  cursor: z.string().datetime({ offset: true }).nullable(),
  limit: z.coerce.number().int().min(1).max(100),
});

function payloadView(payload: string) {
  if (/^0x(?:[0-9a-fA-F]{2})*$/.test(payload)) {
    return { kind: "hex" as const, display: payload };
  }

  try {
    return {
      kind: "structured" as const,
      display: JSON.stringify(JSON.parse(payload) as unknown, null, 2),
    };
  } catch {
    return { kind: "text" as const, display: payload };
  }
}

export function toMessageView(message: SafeMessage, currentThreshold: number) {
  const confirmations = message.confirmations.filter(
    (confirmation, index, items) =>
      items.findIndex(
        (candidate) =>
          candidate.owner.toLowerCase() === confirmation.owner.toLowerCase(),
      ) === index,
  );
  const payload = payloadView(message.payload);

  return {
    safe: message.safe,
    messageHash: message.messageHash,
    payload: message.payload,
    payloadKind: payload.kind,
    payloadDisplay: payload.display,
    confirmations,
    confirmationCount: confirmations.length,
    currentThreshold,
    reportedConfirmationCountMeetsCurrentThreshold:
      confirmations.length >= currentThreshold,
    createdAt: message.createdAt,
  };
}

export type MessageView = ReturnType<typeof toMessageView>;

export function appendUniqueMessageViews(
  current: readonly MessageView[],
  incoming: readonly MessageView[],
): readonly MessageView[] {
  const known = new Set(
    current.map((message) => message.messageHash.toLowerCase()),
  );
  const merged = [...current];

  for (const message of incoming) {
    const key = message.messageHash.toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    merged.push(message);
  }

  return merged;
}
