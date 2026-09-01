import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReadinessPort } from "@/core/ports";
import { checkReadiness } from "@/core/health/readiness";

function readinessPort(overrides: Partial<ReadinessPort> = {}): ReadinessPort {
  return {
    checkDatabase: vi.fn().mockResolvedValue(undefined),
    checkCache: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("checkReadiness", () => {
  it("reports healthy only when every dependency responds", async () => {
    await expect(checkReadiness(readinessPort())).resolves.toEqual({
      healthy: true,
      checks: { database: "ok", cache: "ok" },
    });
  });

  it("keeps dependency failures explicit without exposing errors", async () => {
    const port = readinessPort({
      checkDatabase: vi.fn().mockRejectedValue(new Error("secret details")),
    });

    await expect(checkReadiness(port)).resolves.toEqual({
      healthy: false,
      checks: { database: "unavailable", cache: "ok" },
    });
  });

  it("bounds checks that do not settle", async () => {
    vi.useFakeTimers();
    const port = readinessPort({
      checkCache: vi.fn().mockImplementation(() => new Promise(() => {})),
    });

    const result = checkReadiness(port, 1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toEqual({
      healthy: false,
      checks: { database: "ok", cache: "unavailable" },
    });
  });
});
