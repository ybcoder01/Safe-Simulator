import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../../drizzle/0004_native_transfer_deduplication.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("native transfer deduplication migration", () => {
  it("removes only repeated transfer identities before replacing the index", () => {
    expect(migration).toContain("ROW_NUMBER() OVER");
    expect(migration).toContain(
      'PARTITION BY\n        "safe_id",\n        "transaction_hash",\n        "token",\n        "from",\n        "to",\n        "amount"',
    );
    expect(migration).toContain("duplicate_rank > 1");
  });

  it("treats a null native-token address as part of the unique identity", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "raw_transfers_identity_unique"',
    );
    expect(migration).toContain("NULLS NOT DISTINCT");
  });
});
