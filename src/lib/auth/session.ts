import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import type { Address } from "@/core/domain";

export const AUTH_SESSION_COOKIE = "safe-inspector-auth";
export const AUTH_SESSION_MAX_AGE = 60 * 60;

export interface AuthSession {
  readonly profileId: string;
  readonly privyUserId: string;
  readonly walletAddress: Address;
  readonly expiresAt: number;
}

function secret(): string {
  const value = process.env.PRIVY_APP_SECRET;
  if (!value) throw new Error("Privy authentication is not configured.");
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createAuthSession(
  input: Omit<AuthSession, "expiresAt">,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...input,
      expiresAt: Math.floor(Date.now() / 1_000) + AUTH_SESSION_MAX_AGE,
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function parseAuthSession(
  value: string | undefined,
): AuthSession | null {
  if (!value) return null;
  const [payload, providedSignature, extra] = value.split(".");
  if (!payload || !providedSignature || extra) return null;

  const expected = Buffer.from(signature(payload));
  const provided = Buffer.from(providedSignature);
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AuthSession;
    if (
      !session.profileId ||
      !session.privyUserId ||
      !/^0x[0-9a-f]{40}$/.test(session.walletAddress) ||
      session.expiresAt <= Math.floor(Date.now() / 1_000)
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function authSessionFromRequest(
  request: NextRequest,
): AuthSession | null {
  return parseAuthSession(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
}
