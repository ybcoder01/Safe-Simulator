import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../../../drizzle/0006_melodic_living_mummy.sql", import.meta.url),
);
const verificationMigrationPath = fileURLToPath(
  new URL("../../../../drizzle/0007_mean_wither.sql", import.meta.url),
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

  it("adds signed receipt fields and a unique public verification ID", () => {
    const sql = readFileSync(verificationMigrationPath, "utf8");

    expect(sql).toContain('ADD COLUMN "verification_id" varchar(43)');
    expect(sql).toContain('ADD COLUMN "receipt_payload" jsonb');
    expect(sql).toContain('ADD COLUMN "payload_digest" varchar(64)');
    expect(sql).toContain('ADD COLUMN "receipt_signature" text');
    expect(sql).toContain('ADD COLUMN "signing_key_id" varchar(64)');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "telegram_deliveries_verification_id_unique"',
    );
  });
});
