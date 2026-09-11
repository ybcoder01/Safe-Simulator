import { describe, expect, it } from "vitest";

import {
  databaseConnectionOptions,
  resolveDatabaseConnectionString,
} from "@/adapters/db-drizzle/client";

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

  it("uses the isolated Neon connection", () => {
    expect(
      resolveDatabaseConnectionString({
        NEON_DATABASE_URL: "  postgres://neon  ",
      }),
    ).toBe("postgres://neon");
  });

  it("does not fall back to the legacy database connection", () => {
    expect(() =>
      resolveDatabaseConnectionString({
        DATABASE_URL: "postgres://existing",
      }),
    ).toThrow(
      "NEON_DATABASE_URL is not configured. Connect the Neon PostgreSQL database to this project.",
    );
  });

  it("rejects missing or blank Neon configuration", () => {
    expect(() =>
      resolveDatabaseConnectionString({
        NEON_DATABASE_URL: " ",
      }),
    ).toThrow(
      "NEON_DATABASE_URL is not configured. Connect the Neon PostgreSQL database to this project.",
    );
  });
});
