CREATE TABLE "slack_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"safe_tx_hash" varchar(66) NOT NULL,
	"event_key" text NOT NULL,
	"verification_id" varchar(43),
	"receipt_payload" jsonb,
	"payload_digest" varchar(64),
	"receipt_signature" text,
	"signing_key_id" varchar(64),
	"status" "telegram_delivery_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "slack_link_tokens" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"safe_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"safe_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_label" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"disconnected_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"last_poll_error" text,
	"last_delivery_attempt_at" timestamp with time zone,
	"last_delivery_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_deliveries" ADD CONSTRAINT "slack_deliveries_subscription_id_slack_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."slack_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_link_tokens" ADD CONSTRAINT "slack_link_tokens_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_link_tokens" ADD CONSTRAINT "slack_link_tokens_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_subscriptions" ADD CONSTRAINT "slack_subscriptions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_subscriptions" ADD CONSTRAINT "slack_subscriptions_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_deliveries_subscription_event_unique" ON "slack_deliveries" USING btree ("subscription_id","event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_deliveries_verification_id_unique" ON "slack_deliveries" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "slack_link_tokens_expiry_idx" ON "slack_link_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_subscriptions_profile_safe_channel_unique" ON "slack_subscriptions" USING btree ("profile_id","safe_id","team_id","channel_id");--> statement-breakpoint
CREATE INDEX "slack_subscriptions_safe_enabled_idx" ON "slack_subscriptions" USING btree ("safe_id","enabled");
