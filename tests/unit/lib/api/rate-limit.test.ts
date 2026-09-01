import { describe, expect, it, vi } from "vitest";

import type { RateLimitPort } from "@/core/ports";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  type RateLimitPolicy,
} from "@/lib/api/rate-limit";

const policy: RateLimitPolicy = {
  scope: "test",
  limit: 4,
  windowSeconds: 60,
};

describe("checkRequestRateLimit", () => {
  it("uses a fingerprint instead of retaining the request address", async () => {
    const consume = vi.fn().mockResolvedValue({
      allowed: true,
      remaining: 3,
      retryAfterSeconds: 60,
    });
    const port: RateLimitPort = { consume };
    const requestAddress = "203.0.113.7";

    const result = await checkRequestRateLimit(
      port,
      new Request("https://safe.example/api", {
        headers: {
          "x-vercel-forwarded-for": requestAddress,
          "x-forwarded-for": "198.51.100.4",
        },
      }),
      policy,
    );

    expect(result).toEqual({
      allowed: true,
      remaining: 3,
      retryAfterSeconds: 60,
      degraded: false,
    });
    expect(consume).toHaveBeenCalledWith(
      expect.stringMatching(/^rate-limit:test:[a-f0-9]{32}$/),
      4,
      60,
    );
    expect(consume.mock.calls[0]?.[0]).not.toContain(requestAddress);
  });

  it("fails open when the limiter backend is unavailable", async () => {
    const port: RateLimitPort = {
      consume: vi.fn().mockRejectedValue(new Error("unavailable")),
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      checkRequestRateLimit(
        port,
        new Request("https://safe.example/api"),
        policy,
      ),
    ).resolves.toEqual({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 0,
      degraded: true,
    });
    expect(consoleError).toHaveBeenCalledOnce();

    consoleError.mockRestore();
  });
});

describe("rateLimitHeaders", () => {
  it("describes the limit and retry window", () => {
    expect(
      rateLimitHeaders(policy, {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 27,
      }),
    ).toEqual({
      "Retry-After": "27",
      "X-RateLimit-Limit": "4",
      "X-RateLimit-Remaining": "0",
    });
  });
});
