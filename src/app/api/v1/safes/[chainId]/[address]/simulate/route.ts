import { NextRequest, NextResponse } from "next/server";

import {
  getAbiPort,
  getChainPort,
  getPersistencePort,
  getRateLimitPort,
  getSafeDataPort,
  getSimulationPort,
} from "@/container";
import {
  manualSimulationInputSchema,
  resolveManualSimulation,
} from "@/lib/api/manual-simulation";
import {
  checkRequestRateLimit,
  MANUAL_SIMULATION_RATE_LIMIT,
  rateLimitHeaders,
} from "@/lib/api/rate-limit";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";
import { isSafeBookmarked } from "@/lib/api/sync-refresh";

interface RouteContext {
  readonly params: Promise<{ chainId: string; address: string }>;
}

const MAX_REQUEST_BYTES = 70_000;

function error(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function sameOrigin(request: NextRequest): boolean {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!sameOrigin(request)) {
    return error(
      "Cross-origin draft simulation requests are rejected.",
      403,
      "origin_rejected",
    );
  }

  const safeRef = safeRouteParamsSchema.safeParse(await context.params);
  if (!safeRef.success) {
    return error("Invalid Safe route.", 400, "invalid_safe");
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return error("Simulation request is too large.", 413, "request_too_large");
  }

  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    MANUAL_SIMULATION_RATE_LIMIT,
  );
  if (rateLimit.degraded) {
    return error(
      "Simulation rate limiting is unavailable. Try again later.",
      503,
      "rate_limit_unavailable",
    );
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "rate_limit_exceeded",
          message: "Too many draft simulations. Try again later.",
        },
      },
      {
        status: 429,
        headers: rateLimitHeaders(MANUAL_SIMULATION_RATE_LIMIT, rateLimit),
      },
    );
  }

  const profileId = parseProfileId(request.cookies.get(PROFILE_COOKIE)?.value);
  if (!profileId) {
    return error(
      "Import this Safe in the current browser before simulating a draft.",
      403,
      "profile_required",
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return error("Request body must be valid JSON.", 400, "invalid_json");
  }
  const input = manualSimulationInputSchema.safeParse(payload);
  if (!input.success) {
    return error(
      input.error.issues[0]?.message ?? "Invalid simulation input.",
      400,
      "invalid_input",
    );
  }

  try {
    const persistence = getPersistencePort();
    const bookmarked = await persistence.listSafesForProfile(profileId);
    if (!isSafeBookmarked(bookmarked, safeRef.data)) {
      return error(
        "This Safe is not available in the current watchlist.",
        404,
        "safe_not_bookmarked",
      );
    }

    const [safe, addressBook] = await Promise.all([
      getChainPort().getSafeSnapshot(safeRef.data),
      persistence.listAddressBookEntries(profileId, safeRef.data),
    ]);
    const result = await resolveManualSimulation(
      safe,
      input.data,
      addressBook,
      {
        abi: getAbiPort(),
        chain: getChainPort(),
        safeData: getSafeDataPort(),
        simulation: getSimulationPort(),
      },
    );

    return NextResponse.json({ data: result });
  } catch (cause) {
    console.warn("Draft simulation unavailable.", {
      chainId: safeRef.data.chainId,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return error(
      "The read-only draft simulation could not be completed right now.",
      502,
      "simulation_unavailable",
    );
  }
}
