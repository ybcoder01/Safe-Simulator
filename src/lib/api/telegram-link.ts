import { createHash, randomBytes } from "node:crypto";

import type { SafeRef } from "@/core/domain";
import type { PersistencePort } from "@/core/ports";

export const TELEGRAM_LINK_TTL_SECONDS = 10 * 60;

export function hashTelegramLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createTelegramLink(
  persistence: Pick<PersistencePort, "createTelegramLinkToken">,
  input: {
    readonly profileId: string;
    readonly safe: SafeRef;
    readonly botUsername: string;
    readonly now: number;
    readonly token?: string;
  },
) {
  const token = input.token ?? randomBytes(24).toString("base64url");
  const expiresAt = input.now + TELEGRAM_LINK_TTL_SECONDS;
  await persistence.createTelegramLinkToken({
    tokenHash: hashTelegramLinkToken(token),
    profileId: input.profileId,
    safe: input.safe,
    expiresAt,
  });
  return {
    url: `https://t.me/${input.botUsername}?start=${token}`,
    expiresAt,
  };
}
