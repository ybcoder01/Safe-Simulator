import { NextRequest, NextResponse } from "next/server";

import {
  getPersistencePort,
  getQueuePort,
  getRateLimitPort,
} from "@/container";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  SAFE_REFRESH_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";
import {
  isSafeBookmarked,
  queueSafeRefresh,
} from "@/lib/api/sync-refresh";

interface RouteContext {
  readonly params: Promise<{ chainId: string; address: string }>;
}

function unavailableToProfile() {
  return NextResponse.json(
    {
      error: {
        code: "safe_not_bookmarked",
        message: "This Safe is not available in the current watchlist.",
      },
    },
    { status: 404 },
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = safeRouteParamsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_safe", message: "Invalid Safe route." } },
      { status: 400 },
    );
  }

  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    SAFE_REFRESH_RATE_LIMIT,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "rate_limit_exceeded",
          message: "Too many refresh attempts. Try again later.",
        },
      },
      {
        status: 429,
        headers: rateLimitHeaders(SAFE_REFRESH_RATE_LIMIT, rateLimit),
      },
    );
  }

  const profileId = parseProfileId(request.cookies.get(PROFILE_COOKIE)?.value);
  if (!profileId) return unavailableToProfile();

  try {
    const persistence = getPersistencePort();
    const bookmarkedSafes = await persistence.listSafesForProfile(profileId);
    if (!isSafeBookmarked(bookmarkedSafes, parsed.data)) {
      return unavailableToProfile();
    }

    const result = await queueSafeRefresh(
      persistence,
      getQueuePort(),
      parsed.data,
    );
    return NextResponse.json({ data: result }, { status: 202 });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "upstream_unavailable",
          message: "The refresh could not be queued right now.",
        },
      },
      { status: 502 },
    );
  }
}
