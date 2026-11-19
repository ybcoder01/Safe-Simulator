import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkReadiness: vi.fn(),
  getReadinessPort: vi.fn(() => ({})),
}));

vi.mock("@/container", () => ({
  getReadinessPort: mocks.getReadinessPort,
}));
vi.mock("@/core/health/readiness", () => ({
  checkReadiness: mocks.checkReadiness,
}));

import { GET } from "@/app/api/health/route";

describe("public health route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkReadiness.mockResolvedValue({
      healthy: false,
      checks: {
        database: "failed: secret host",
        cache: "failed: secret token",
        executionRpc: "ok",
      },
    });
  });

  it("reports aggregate readiness without exposing dependency diagnostics", async () => {
    const response = await GET(new Request("https://safe.example/api/health"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      service: "safe-inspector",
      status: "degraded",
    });
    expect(body).not.toHaveProperty("checks");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("rejects query-string cache busting before running dependency checks", async () => {
    const response = await GET(
      new Request("https://safe.example/api/health?nonce=attacker"),
    );

    expect(response.status).toBe(400);
    expect(mocks.checkReadiness).not.toHaveBeenCalled();
  });
});
