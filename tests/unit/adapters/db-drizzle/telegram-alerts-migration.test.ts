import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../../../drizzle/0006_melodic_living_mummy.sql", import.meta.url),
);

describe("Telegram alert migration", () => {
  it("adds only the three Telegram persistence tables", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain('CREATE TABLE "telegram_link_tokens"');
    expect(sql).toContain('CREATE TABLE "telegram_subscriptions"');
    expect(sql).toContain('CREATE TABLE "telegram_deliveries"');
    expect(sql).not.toContain('CREATE TABLE "transaction_summaries"');
    expect(sql).not.toContain(
      'CREATE TYPE "public"."transaction_summary_status"',
    );
  });
});
