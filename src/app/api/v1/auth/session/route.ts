import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPersistencePort } from "@/container";
import {
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_MAX_AGE,
  authSessionFromRequest,
  createAuthSession,
} from "@/lib/auth/session";
import { verifyPrivyWallet } from "@/lib/auth/privy";
import {
  parseProfileId,
  PROFILE_COOKIE,
  PROFILE_MAX_AGE,
} from "@/lib/api/profile";

const inputSchema = z.object({ walletAddress: z.string() });

function clearCookies(response: NextResponse) {
  response.cookies.set(AUTH_SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(PROFILE_COOKIE, "", { maxAge: 0, path: "/" });
}

export async function GET(request: NextRequest) {
  const session = authSessionFromRequest(request);
  return NextResponse.json(
    session
      ? {
          authenticated: true,
          walletAddress: session.walletAddress,
          expiresAt: session.expiresAt,
        }
      : { authenticated: false },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  try {
    const input = inputSchema.parse(await request.json());
    const identity = await verifyPrivyWallet(request, input.walletAddress);
    const preferredProfileId =
      parseProfileId(request.cookies.get(PROFILE_COOKIE)?.value) ??
      crypto.randomUUID();
    const profileId = await getPersistencePort().claimProfileIdentity({
      ...identity,
      preferredProfileId,
    });
    const response = NextResponse.json({
      authenticated: true,
      walletAddress: identity.walletAddress,
    });
    const secure = request.nextUrl.protocol === "https:";
    response.cookies.set(
      AUTH_SESSION_COOKIE,
      createAuthSession({ profileId, ...identity }),
      {
        httpOnly: true,
        maxAge: AUTH_SESSION_MAX_AGE,
        path: "/",
        sameSite: "lax",
        secure,
      },
    );
    response.cookies.set(PROFILE_COOKIE, profileId, {
      httpOnly: true,
      maxAge: PROFILE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure,
    });
    return response;
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Wallet login could not be verified.";
    const status = message.includes("not configured") ? 503 : 401;
    return NextResponse.json(
      { error: { code: "authentication_failed", message } },
      { status },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  clearCookies(response);
  return response;
}
