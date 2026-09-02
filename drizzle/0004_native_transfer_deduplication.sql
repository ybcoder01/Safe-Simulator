WITH ranked_transfers AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY
        "safe_id",
        "transaction_hash",
        "token",
        "from",
        "to",
        "amount"
      ORDER BY "timestamp" ASC, "id" ASC
    ) AS duplicate_rank
  FROM "raw_transfers"
)
DELETE FROM "raw_transfers"
USING ranked_transfers
WHERE "raw_transfers"."id" = ranked_transfers."id"
  AND ranked_transfers.duplicate_rank > 1;
--> statement-breakpoint
DROP INDEX IF EXISTS "raw_transfers_identity_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "raw_transfers_identity_unique"
ON "raw_transfers" USING btree (
  "safe_id",
  "transaction_hash",
  COALESCE("token", ''),
  "from",
  "to",
  "amount"
);
