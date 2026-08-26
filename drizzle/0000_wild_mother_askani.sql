CREATE TYPE "public"."operation" AS ENUM('call', 'delegatecall');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('idle', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_stream" AS ENUM('multisig', 'module', 'transfer', 'message');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'executed', 'failed', 'replaced');--> statement-breakpoint
CREATE TYPE "public"."trust_level" AS ENUM('trusted', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('trusted', 'known', 'unverified', 'flagged');--> statement-breakpoint
CREATE TABLE "address_book" (
	"safe_id" uuid NOT NULL,
	"address" varchar(42) NOT NULL,
	"label" text NOT NULL,
	"trust_level" "trust_level" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "address_book_safe_id_address_pk" PRIMARY KEY("safe_id","address")
);
--> statement-breakpoint
CREATE TABLE "analysis_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"engine_version" text NOT NULL,
	"verdict" "verdict" NOT NULL,
	"findings" jsonb NOT NULL,
	"state_diff" jsonb NOT NULL,
	"call_tree" jsonb,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"token" varchar(42) NOT NULL,
	"spender" varchar(42) NOT NULL,
	"amount" text NOT NULL,
	"is_infinite" boolean NOT NULL,
	"method" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "confirmations" (
	"transaction_id" uuid NOT NULL,
	"owner" varchar(42) NOT NULL,
	"signature" text NOT NULL,
	"signed_at" timestamp with time zone,
	CONSTRAINT "confirmations_transaction_id_owner_pk" PRIMARY KEY("transaction_id","owner")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"address" varchar(42) NOT NULL,
	"label" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"implementation" varchar(42),
	"abi" jsonb,
	"storage_layout" jsonb,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"safe_id" uuid NOT NULL,
	"message_hash" varchar(66) NOT NULL,
	"payload" text NOT NULL,
	"confirmations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_transactions" (
	"transaction_hash" varchar(66) PRIMARY KEY NOT NULL,
	"safe_id" uuid NOT NULL,
	"module" varchar(42) NOT NULL,
	"to" varchar(42) NOT NULL,
	"value" text NOT NULL,
	"data" text NOT NULL,
	"operation" "operation" NOT NULL,
	"block_number" bigint NOT NULL,
	"executed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_safes" (
	"profile_id" uuid NOT NULL,
	"safe_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_safes_profile_id_safe_id_pk" PRIMARY KEY("profile_id","safe_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"safe_id" uuid NOT NULL,
	"transaction_hash" varchar(66) NOT NULL,
	"token" varchar(42),
	"from" varchar(42) NOT NULL,
	"to" varchar(42) NOT NULL,
	"amount" text NOT NULL,
	"block_number" bigint NOT NULL,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safe_modules" (
	"safe_id" uuid NOT NULL,
	"module_address" varchar(42) NOT NULL,
	CONSTRAINT "safe_modules_safe_id_module_address_pk" PRIMARY KEY("safe_id","module_address")
);
--> statement-breakpoint
CREATE TABLE "safe_owners" (
	"safe_id" uuid NOT NULL,
	"owner_address" varchar(42) NOT NULL,
	"added_at_block" bigint,
	CONSTRAINT "safe_owners_safe_id_owner_address_pk" PRIMARY KEY("safe_id","owner_address")
);
--> statement-breakpoint
CREATE TABLE "safes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"address" varchar(42) NOT NULL,
	"threshold" integer NOT NULL,
	"nonce" text NOT NULL,
	"version" text,
	"guard" varchar(42),
	"implementation" varchar(42),
	"observed_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"safe_id" uuid NOT NULL,
	"stream" "sync_stream" NOT NULL,
	"cursor" text,
	"status" "sync_status" NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sync_cursors_safe_id_stream_pk" PRIMARY KEY("safe_id","stream")
);
--> statement-breakpoint
CREATE TABLE "token_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"token" varchar(42) NOT NULL,
	"from" varchar(42) NOT NULL,
	"to" varchar(42) NOT NULL,
	"amount" text NOT NULL,
	"direction" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"safe_id" uuid NOT NULL,
	"safe_tx_hash" varchar(66) NOT NULL,
	"nonce" text NOT NULL,
	"to" varchar(42) NOT NULL,
	"value" text NOT NULL,
	"data" text NOT NULL,
	"operation" "operation" NOT NULL,
	"status" "transaction_status" NOT NULL,
	"proposed_at" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"executed_tx_hash" varchar(66),
	"block_number" bigint,
	"block_hash" varchar(66),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "address_book" ADD CONSTRAINT "address_book_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_transactions" ADD CONSTRAINT "module_transactions_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_safes" ADD CONSTRAINT "profile_safes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_safes" ADD CONSTRAINT "profile_safes_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_transfers" ADD CONSTRAINT "raw_transfers_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_modules" ADD CONSTRAINT "safe_modules_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_owners" ADD CONSTRAINT "safe_owners_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_transaction_version_unique" ON "analysis_results" USING btree ("transaction_id","engine_version");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_chain_address_unique" ON "contracts" USING btree ("chain_id","address");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_safe_hash_unique" ON "messages" USING btree ("safe_id","message_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_transfers_identity_unique" ON "raw_transfers" USING btree ("safe_id","transaction_hash","token","from","to","amount");--> statement-breakpoint
CREATE UNIQUE INDEX "safes_chain_address_unique" ON "safes" USING btree ("chain_id","address");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_safe_hash_unique" ON "transactions" USING btree ("safe_id","safe_tx_hash");--> statement-breakpoint
CREATE INDEX "transactions_safe_nonce_idx" ON "transactions" USING btree ("safe_id","nonce");