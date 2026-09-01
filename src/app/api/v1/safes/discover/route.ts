import { NextRequest, NextResponse } from "next/server";

import {
  getPersistencePort,
  getRateLimitPort,
  getSafeDataPort,
} from "@/container";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  SAFE_DISCOVERY_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import { resolveSafeDiscovery } from "@/lib/api/safe-discovery";
import { discoverSafesInputSchema } from "@/lib/api/safes";

export async function GET(request: NextRequest) {
  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    SAFE_DISCOVERY_RATE_LIMIT,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "rate_limit_exceeded",
          message: "Too many owner discovery requests. Try again later.",
        },
      },
      {
        status: 429,
        headers: rateLimitHeaders(SAFE_DISCOVERY_RATE_LIMIT, rateLimit),
      },
    );
  }

  const input = discoverSafesInputSchema.safeParse({
    chainId: request.nextUrl.searchParams.get("chainId"),
    owner: request.nextUrl.searchParams.get("owner"),
  });
  if (!input.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_discovery_request",
          message: "Enter a valid owner address and supported network.",
          details: input.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  try {
    const profileId = parseProfileId(
      request.cookies.get(PROFILE_COOKIE)?.value,
    );
    const result = await resolveSafeDiscovery(
      getSafeDataPort(),
      getPersistencePort(),
      input.data,
      profileId,
    );
    return NextResponse.json(
      { data: result.items, total: result.total, limited: result.limited },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "discovery_unavailable",
          message: "Safe discovery is temporarily unavailable.",
        },
      },
      { status: 502 },
    );
  }
}
