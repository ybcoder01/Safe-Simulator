CREATE TYPE "public"."transaction_summary_status" AS ENUM('pending', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE "transaction_summaries" (
  "id" uuid PRIMARY KEY NOT NULL,
  "transaction_id" uuid NOT NULL,
  "evidence_fingerprint" varchar(64) NOT NULL,
  "evidence" jsonb NOT NULL,
  "prompt_version" text NOT NULL,
  "model" text NOT NULL,
  "status" "transaction_summary_status" NOT NULL,
  "summary" jsonb,
  "usage" jsonb,
  "failure_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "transaction_summaries" ADD CONSTRAINT "transaction_summaries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_summaries_lookup_idx" ON "transaction_summaries" USING btree ("transaction_id","evidence_fingerprint","prompt_version","model","status","created_at");
