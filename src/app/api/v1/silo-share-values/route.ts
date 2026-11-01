import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getChainPort, getRateLimitPort } from "@/container";
import type { Address, ChainId } from "@/core/domain";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  SILO_SHARE_VALUE_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import { resolveSiloShareValues } from "@/lib/api/silo-share-values";

const XDC_CHAIN_ID = 50;
const MAX_MARKETS = 4;
const MAX_MOVEMENTS = 4;
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const bodySchema = z.object({
  chainId: z.literal(XDC_CHAIN_ID),
  markets: z.array(addressSchema).min(1).max(MAX_MARKETS),
  movements: z
    .array(
      z.object({
        logIndex: z.number().int().nonnegative(),
        token: addressSchema,
        amount: z.string().regex(/^[0-9]+$/),
      }),
    )
    .min(1)
    .max(MAX_MOVEMENTS),
  blockNumber: z.string().regex(/^[0-9]+$/).nullable(),
});

function error(
  message: string,
  status: number,
  code: string,
  headers?: HeadersInit,
) {
  return NextResponse.json(
    { error: { code, message } },
    headers ? { status, headers } : { status },
  );
}

/**
 * Presentation-only Silo share valuation. The browser requests this after the
 * deterministic transaction report has rendered, so RPC latency cannot delay
 * or change the security verdict.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return error(
      "Cross-origin share value requests are rejected.",
      403,
      "origin_rejected",
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return error("Invalid Silo share value request.", 400, "invalid_request");
  }

  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    SILO_SHARE_VALUE_RATE_LIMIT,
  );
  if (rateLimit.degraded) {
    return error(
      "Share value rate limiting is unavailable. Try again later.",
      503,
      "rate_limit_unavailable",
    );
  }
  if (!rateLimit.allowed) {
    return error(
      "Too many share value requests. Try again later.",
      429,
      "rate_limit_exceeded",
      rateLimitHeaders(SILO_SHARE_VALUE_RATE_LIMIT, rateLimit),
    );
  }

  const values = await resolveSiloShareValues(getChainPort(), {
    chainId: parsed.data.chainId as ChainId,
    markets: parsed.data.markets as Address[],
    movements: parsed.data.movements,
    blockNumber:
      parsed.data.blockNumber === null
        ? null
        : BigInt(parsed.data.blockNumber),
  });

  return NextResponse.json({
    data: {
      items: [...values].map(([logIndex, value]) => ({
        logIndex,
        ...value,
      })),
    },
  });
}
