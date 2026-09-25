import { NextRequest, NextResponse } from "next/server";

import { telegramBotUsername } from "@/adapters/telegram-bot/client";
import { getPersistencePort, getRateLimitPort } from "@/container";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  TELEGRAM_LINK_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";
import { isSafeBookmarked } from "@/lib/api/sync-refresh";
import { createTelegramLink } from "@/lib/api/telegram-link";

interface RouteContext {
  readonly params: Promise<{ chainId: string; address: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = safeRouteParamsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_safe", message: "Invalid Safe route." } },
      { status: 400 },
    );
  }

  const profileId = parseProfileId(request.cookies.get(PROFILE_COOKIE)?.value);
  if (!profileId) {
    return NextResponse.json(
      {
        error: {
          code: "safe_not_bookmarked",
          message: "Add this Safe to your watchlist before enabling alerts.",
        },
      },
      { status: 404 },
    );
  }

  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    TELEGRAM_LINK_RATE_LIMIT,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "rate_limit_exceeded",
          message: "Too many Telegram linking attempts. Try again later.",
        },
      },
      {
        status: 429,
        headers: rateLimitHeaders(TELEGRAM_LINK_RATE_LIMIT, rateLimit),
      },
    );
  }

  try {
    const persistence = getPersistencePort();
    const bookmarked = await persistence.listSafesForProfile(profileId);
    if (!isSafeBookmarked(bookmarked, parsed.data)) {
      return NextResponse.json(
        {
          error: {
            code: "safe_not_bookmarked",
            message: "Add this Safe to your watchlist before enabling alerts.",
          },
        },
        { status: 404 },
      );
    }

    const link = await createTelegramLink(persistence, {
      profileId,
      safe: parsed.data,
      botUsername: telegramBotUsername(),
      now: Math.floor(Date.now() / 1_000),
    });
    return NextResponse.json({ data: link }, { status: 201 });
  } catch (error) {
    console.error("Telegram linking is unavailable.", error);
    return NextResponse.json(
      {
        error: {
          code: "telegram_unavailable",
          message: "Telegram alerts are not configured yet.",
        },
      },
      { status: 503 },
    );
  }
}
