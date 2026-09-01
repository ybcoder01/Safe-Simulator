import { describe, expect, it } from "vitest";

import { toRateLimitDecision } from "@/adapters/cache-upstash/rate-limit";

describe("toRateLimitDecision", () => {
  it("allows requests through the configured limit", () => {
    expect(toRateLimitDecision(3, 42, 3)).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 42,
    });
  });

  it("rejects requests beyond the configured limit", () => {
    expect(toRateLimitDecision(4, 18, 3)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 18,
    });
  });

  it("always returns a usable retry delay", () => {
    expect(toRateLimitDecision(2, -1, 1).retryAfterSeconds).toBe(1);
  });
});
