CREATE TABLE "module_analysis_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_hash" varchar(66) NOT NULL,
	"engine_version" text NOT NULL,
	"verdict" "verdict" NOT NULL,
	"findings" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "module_analysis_results" ADD CONSTRAINT "module_analysis_results_transaction_hash_module_transactions_transaction_hash_fk" FOREIGN KEY ("transaction_hash") REFERENCES "public"."module_transactions"("transaction_hash") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "module_analysis_transaction_version_unique" ON "module_analysis_results" USING btree ("transaction_hash","engine_version");
