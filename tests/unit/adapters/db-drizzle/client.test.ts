import { describe, expect, it } from "vitest";

import { databaseConnectionOptions } from "@/adapters/db-drizzle/client";

describe("database connection policy", () => {
  it("keeps each serverless runtime to one short-lived pooled connection", () => {
    expect(databaseConnectionOptions).toEqual({
      max: 1,
      idle_timeout: 5,
      connect_timeout: 10,
      max_lifetime: 60,
      prepare: false,
    });
  });
});
