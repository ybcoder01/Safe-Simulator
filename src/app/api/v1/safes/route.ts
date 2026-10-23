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
import { PROFILE_COOKIE, PROFILE_MAX_AGE } from "@/lib/api/profile";
import { authSessionFromRequest } from "@/lib/auth/session";
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
  const session = authSessionFromRequest(request);
  if (!session) {
    return errorResponse(
      "Sign in with your wallet to view saved Safes.",
      401,
      "authentication_required",
    );
  }

  try {
    const persistence = getPersistencePort();
    const [bookmarked, owned] = await Promise.all([
      persistence.listSafesForProfile(session.profileId),
      persistence.listSafesForOwner(session.walletAddress),
    ]);
    const bookmarkedKeys = new Set(
      bookmarked.map((safe) => `${safe.chainId}:${safe.address.toLowerCase()}`),
    );
    const items = [...bookmarked, ...owned].filter(
      (safe, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.chainId === safe.chainId &&
            candidate.address.toLowerCase() === safe.address.toLowerCase(),
        ) === index,
    );
    const data = await Promise.all(
      items.map(async (safe) => {
        const [cursors, reviews] = await Promise.all([
          Promise.all(
            (["multisig", "module", "transfer", "message"] as const).map(
              (stream) => persistence.findSyncCursor(safe, stream),
            ),
          ),
          persistence.listAddressBookReviews(session.profileId, safe),
        ]);
        const syncStatus = cursors.some((cursor) => cursor?.status === "failed")
          ? "failed"
          : cursors.every((cursor) => cursor?.status === "complete")
            ? "complete"
            : cursors.some((cursor) => cursor?.status === "running")
              ? "syncing"
              : "queued";
        const key = `${safe.chainId}:${safe.address.toLowerCase()}`;
        return toSafeView(safe, syncStatus, {
          bookmarked: bookmarkedKeys.has(key),
          pendingTrustReviews: reviews.filter(
            (review) =>
              review.status === "pending" &&
              review.currentUserDecision === null,
          ).length,
        });
      }),
    );
    return NextResponse.json({ data, chains: supportedChainSummaries });
  } catch (error) {
    return infrastructureError(error);
  }
}

export async function POST(request: NextRequest) {
  const session = authSessionFromRequest(request);
  if (!session) {
    return errorResponse(
      "Sign in with your wallet before importing a Safe.",
      401,
      "authentication_required",
    );
  }
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
    const profileId = session.profileId;
    const result = await getImportSafeService().execute({
      ...input,
      profileId,
    });
    if (result.syncQueueError) {
      console.error(
        "Safe imported but initial synchronization was not queued.",
        {
          chainId: input.chainId,
          safe: input.address,
          error:
            result.syncQueueError instanceof Error
              ? {
                  name: result.syncQueueError.name,
                  message: result.syncQueueError.message,
                }
              : { message: String(result.syncQueueError) },
        },
      );
    }
    const response = NextResponse.json(
      {
        data: toSafeView(result.safe, result.syncQueued ? "queued" : "failed"),
        ...(result.syncQueued
          ? {}
          : {
              warning:
                "Safe imported, but history synchronization is delayed. Use Refresh when queue service is available.",
            }),
      },
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
