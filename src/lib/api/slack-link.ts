import { createHash, randomBytes } from "node:crypto";

import type { SafeRef } from "@/core/domain";
import type { PersistencePort } from "@/core/ports";

export const SLACK_LINK_TTL_SECONDS = 10 * 60;

export function hashSlackLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSlackLink(
  persistence: Pick<PersistencePort, "createSlackLinkToken">,
  input: {
    readonly profileId: string;
    readonly safe: SafeRef;
    readonly now: number;
    readonly token?: string;
  },
) {
  const token = input.token ?? randomBytes(24).toString("base64url");
  const expiresAt = input.now + SLACK_LINK_TTL_SECONDS;
  await persistence.createSlackLinkToken({
    tokenHash: hashSlackLinkToken(token),
    profileId: input.profileId,
    safe: input.safe,
    expiresAt,
  });
  return {
    command: `/safe-alerts connect ${token}`,
    expiresAt,
  };
}
