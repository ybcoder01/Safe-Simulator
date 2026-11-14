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
  rateLimitHeaders,
  SAFE_APP_SUMMARY_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import {
  buildManualSimulationSummaryEvidence,
  configuredOpenRouterModel,
  requestTransactionSummary,
  TransactionSummaryProviderError,
} from "@/lib/api/transaction-summary";
import { authSessionFromRequest } from "@/lib/auth/session";

const MAX_REQUEST_BYTES = 70_000;

const safeAppSummarySchema = manualSimulationInputSchema.extend({
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
      "Cross-origin Safe App summary requests are rejected.",
      403,
      "origin_rejected",
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return error("Summary request is too large.", 413, "request_too_large");
  }

  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    SAFE_APP_SUMMARY_RATE_LIMIT,
  );
  if (rateLimit.degraded) {
    return error(
      "Summary rate limiting is unavailable. Try again later.",
      503,
      "rate_limit_unavailable",
    );
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "rate_limit_exceeded",
          message: "You have used today's automatic AI summaries.",
        },
      },
      {
        status: 429,
        headers: rateLimitHeaders(SAFE_APP_SUMMARY_RATE_LIMIT, rateLimit),
      },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return error("Request body must be valid JSON.", 400, "invalid_json");
  }
  const parsed = safeAppSummarySchema.safeParse(payload);
  if (!parsed.success) {
    return error(
      parsed.error.issues[0]?.message ?? "Invalid summary input.",
      400,
      "invalid_input",
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return error(
      "AI summaries are not configured.",
      503,
      "summary_not_configured",
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
    const review = await resolveManualSimulation(
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
    const model = configuredOpenRouterModel();
    const generated = await requestTransactionSummary(
      buildManualSimulationSummaryEvidence(review),
      { apiKey, model },
    );

    return NextResponse.json(
      { data: { model, summary: generated.summary } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.warn("Safe App automatic summary unavailable.", {
      chainId,
      safeAddress,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    if (cause instanceof TransactionSummaryProviderError) {
      return error(
        "The AI explanation could not be generated right now.",
        502,
        cause.code,
      );
    }
    return error(
      "The AI explanation could not be generated right now.",
      502,
      "summary_unavailable",
    );
  }
}
