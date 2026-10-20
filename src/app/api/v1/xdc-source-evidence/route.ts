import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCachePort, getRateLimitPort } from "@/container";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  XDC_SOURCE_EVIDENCE_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import { resolveXdcContractVerification } from "@/lib/api/xdcscan-verification";

const XDC_CHAIN_ID = 50;

const bodySchema = z.object({
  addresses: z
    .array(z.string().regex(/^0x[0-9a-fA-F]{40}$/))
    .min(1)
    .max(16),
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
 * Supplementary XDCScan source evidence, requested by the browser after the
 * transaction report has rendered. Nothing in the deterministic report waits
 * on this endpoint.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return error(
      "Cross-origin source evidence requests are rejected.",
      403,
      "origin_rejected",
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return error("Provide 1 to 16 contract addresses.", 400, "invalid_request");
  }

  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    XDC_SOURCE_EVIDENCE_RATE_LIMIT,
  );
  if (rateLimit.degraded) {
    return error(
      "Source evidence rate limiting is unavailable. Try again later.",
      503,
      "rate_limit_unavailable",
    );
  }
  if (!rateLimit.allowed) {
    return error(
      "Too many source evidence requests. Try again later.",
      429,
      "rate_limit_exceeded",
      rateLimitHeaders(XDC_SOURCE_EVIDENCE_RATE_LIMIT, rateLimit),
    );
  }

  const [target] = parsed.data.addresses;
  const result = await resolveXdcContractVerification(
    getCachePort(),
    XDC_CHAIN_ID,
    parsed.data.addresses,
    fetch,
    { priorityAddresses: target ? [target] : [] },
  );
  return NextResponse.json({ data: result });
}
