import { NextRequest, NextResponse } from "next/server";

import { getPersistencePort, getSafeDataPort } from "@/container";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import { resolveSafeDiscovery } from "@/lib/api/safe-discovery";
import { discoverSafesInputSchema } from "@/lib/api/safes";

export async function GET(request: NextRequest) {
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
