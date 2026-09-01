import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { supportedChainSummaries } from "@/adapters/chain-viem/config";
import {
  getImportSafeService,
  getPersistencePort,
  getRateLimitPort,
} from "@/container";
import { SafeImportError } from "@/core/safes/import-safe";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  SAFE_IMPORT_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import {
  parseProfileId,
  PROFILE_COOKIE,
  PROFILE_MAX_AGE,
} from "@/lib/api/profile";
import { importSafeInputSchema, toSafeView } from "@/lib/api/safes";

function errorResponse(
  message: string,
  status: number,
  code: string,
  details?: unknown,
) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

function infrastructureError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Infrastructure is unavailable.";
  const missingConfiguration =
    message.includes("not configured") || message.includes("DATABASE_URL");
  return errorResponse(
    missingConfiguration
      ? message
      : "The Safe could not be read or persisted right now.",
    missingConfiguration ? 503 : 502,
    missingConfiguration
      ? "infrastructure_not_configured"
      : "upstream_unavailable",
  );
}

export async function GET(request: NextRequest) {
  const profileId = parseProfileId(request.cookies.get(PROFILE_COOKIE)?.value);
  if (!profileId)
    return NextResponse.json({ data: [], chains: supportedChainSummaries });

  try {
    const persistence = getPersistencePort();
    const items = await persistence.listSafesForProfile(profileId);
    const data = await Promise.all(
      items.map(async (safe) => {
        const cursors = await Promise.all(
          (["multisig", "module", "transfer", "message"] as const).map(
            (stream) => persistence.findSyncCursor(safe, stream),
          ),
        );
        const syncStatus = cursors.some((cursor) => cursor?.status === "failed")
          ? "failed"
          : cursors.every((cursor) => cursor?.status === "complete")
            ? "complete"
            : cursors.some((cursor) => cursor?.status === "running")
              ? "syncing"
              : "queued";
        return toSafeView(safe, syncStatus);
      }),
    );
    return NextResponse.json({ data, chains: supportedChainSummaries });
  } catch (error) {
    return infrastructureError(error);
  }
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    SAFE_IMPORT_RATE_LIMIT,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "rate_limit_exceeded",
          message: "Too many Safe import attempts. Try again later.",
        },
      },
      {
        status: 429,
        headers: rateLimitHeaders(SAFE_IMPORT_RATE_LIMIT, rateLimit),
      },
    );
  }

  try {
    const input = importSafeInputSchema.parse(await request.json());
    const profileId =
      parseProfileId(request.cookies.get(PROFILE_COOKIE)?.value) ??
      crypto.randomUUID();
    const safe = await getImportSafeService().execute({ ...input, profileId });
    const response = NextResponse.json(
      { data: toSafeView(safe) },
      { status: 201 },
    );

    response.cookies.set(PROFILE_COOKIE, profileId, {
      httpOnly: true,
      maxAge: PROFILE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
    return response;
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(
        "The import request is invalid.",
        400,
        "invalid_request",
        error.flatten(),
      );
    }
    if (error instanceof SafeImportError) {
      return errorResponse(error.message, 422, error.code);
    }
    return infrastructureError(error);
  }
}
