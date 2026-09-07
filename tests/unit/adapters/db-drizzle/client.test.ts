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

  it("prefers the isolated Neon connection during a staged migration", () => {
    expect(
      resolveDatabaseConnectionString({
        NEON_DATABASE_URL: "postgres://neon",
        DATABASE_URL: "postgres://existing",
      }),
    ).toBe("postgres://neon");
  });

  it("falls back to the existing database outside staged environments", () => {
    expect(
      resolveDatabaseConnectionString({
        DATABASE_URL: "postgres://existing",
      }),
    ).toBe("postgres://existing");
  });

  it("rejects missing or blank database configuration", () => {
    expect(() =>
      resolveDatabaseConnectionString({
        NEON_DATABASE_URL: " ",
        DATABASE_URL: "",
      }),
    ).toThrow(
      "NEON_DATABASE_URL or DATABASE_URL is not configured. Connect a PostgreSQL database to this project.",
    );
  });
});
