import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/v1/cron/sync/route";

describe("cron synchronization route", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("does not disclose the missing environment variable name", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(
      new Request("https://safe.example/api/v1/cron/sync"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.message).toBe(
      "Scheduled synchronization is temporarily unavailable.",
    );
    expect(JSON.stringify(body)).not.toContain("CRON_SECRET");
  });
});
