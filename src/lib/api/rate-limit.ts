import { createHash } from "node:crypto";

import type { RateLimitDecision, RateLimitPort } from "@/core/ports";

export interface RateLimitPolicy {
  readonly scope: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RequestRateLimitDecision extends RateLimitDecision {
  readonly degraded: boolean;
}

export const SAFE_IMPORT_RATE_LIMIT: RateLimitPolicy = {
  scope: "safe-import",
  limit: 12,
  windowSeconds: 10 * 60,
};

export const SAFE_DISCOVERY_RATE_LIMIT: RateLimitPolicy = {
  scope: "safe-discovery",
  limit: 30,
  windowSeconds: 5 * 60,
};

export const SAFE_REFRESH_RATE_LIMIT: RateLimitPolicy = {
  scope: "safe-refresh",
  limit: 6,
  windowSeconds: 15 * 60,
};

function requestIdentity(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function checkRequestRateLimit(
  port: RateLimitPort,
  request: Request,
  policy: RateLimitPolicy,
): Promise<RequestRateLimitDecision> {
  const key = `rate-limit:${policy.scope}:${fingerprint(requestIdentity(request))}`;

  try {
    const decision = await port.consume(
      key,
      policy.limit,
      policy.windowSeconds,
    );
    return { ...decision, degraded: false };
  } catch (error) {
    console.error("Rate-limit check unavailable.", error);
    return {
      allowed: true,
      remaining: policy.limit,
      retryAfterSeconds: 0,
      degraded: true,
    };
  }
}

export function rateLimitHeaders(
  policy: RateLimitPolicy,
  decision: RateLimitDecision,
) {
  return {
    "Retry-After": String(decision.retryAfterSeconds),
    "X-RateLimit-Limit": String(policy.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
  };
}
