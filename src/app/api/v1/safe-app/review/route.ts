import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { z } from "zod";

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
import { authSessionFromRequest } from "@/lib/auth/session";

const MAX_REQUEST_BYTES = 70_000;

const safeAppReviewSchema = manualSimulationInputSchema.extend({
  chainId: z.number().int().positive(),
  safeAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Enter a 20-byte Safe address.")
    .transform((value) => getAddress(value)),
});

function error(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return error(
      "Cross-origin Safe App review requests are rejected.",
      403,
      "origin_rejected",
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return error("Review request is too large.", 413, "request_too_large");
  }

  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    MANUAL_SIMULATION_RATE_LIMIT,
  );
  if (rateLimit.degraded) {
    return error(
      "Review rate limiting is unavailable. Try again later.",
      503,
      "rate_limit_unavailable",
    );
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "rate_limit_exceeded",
          message: "Too many draft reviews. Try again later.",
        },
      },
      {
        status: 429,
        headers: rateLimitHeaders(MANUAL_SIMULATION_RATE_LIMIT, rateLimit),
      },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return error("Request body must be valid JSON.", 400, "invalid_json");
  }
  const parsed = safeAppReviewSchema.safeParse(payload);
  if (!parsed.success) {
    return error(
      parsed.error.issues[0]?.message ?? "Invalid review input.",
      400,
      "invalid_input",
    );
  }

  const { chainId, safeAddress, to, value, data } = parsed.data;

  try {
    const safe = await getChainPort().getSafeSnapshot({
      chainId,
      address: safeAddress,
    });
    const session = authSessionFromRequest(request);
    const addressBook = session
      ? await getPersistencePort()
          .listAddressBookEntries(session.profileId, safe)
          .catch(() => [])
      : [];

    const result = await resolveManualSimulation(
      safe,
      { to, value, data },
      addressBook,
      {
        abi: getAbiPort(),
        chain: getChainPort(),
        safeData: getSafeDataPort(),
        simulation: getSimulationPort(),
      },
    );

    return NextResponse.json(
      { data: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.warn("Safe App draft review unavailable.", {
      chainId,
      safeAddress,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return error(
      "The read-only draft review could not be completed right now.",
      502,
      "review_unavailable",
    );
  }
}
