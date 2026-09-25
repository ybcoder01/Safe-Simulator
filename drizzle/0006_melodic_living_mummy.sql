CREATE TYPE "public"."telegram_delivery_status" AS ENUM('pending', 'sent');--> statement-breakpoint
CREATE TABLE "telegram_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"safe_tx_hash" varchar(66) NOT NULL,
	"event_key" text NOT NULL,
	"status" "telegram_delivery_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telegram_link_tokens" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"safe_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"safe_id" uuid NOT NULL,
	"chat_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_deliveries" ADD CONSTRAINT "telegram_deliveries_subscription_id_telegram_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."telegram_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_subscriptions" ADD CONSTRAINT "telegram_subscriptions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_subscriptions" ADD CONSTRAINT "telegram_subscriptions_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_deliveries_subscription_event_unique" ON "telegram_deliveries" USING btree ("subscription_id","event_key");--> statement-breakpoint
CREATE INDEX "telegram_link_tokens_expiry_idx" ON "telegram_link_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_subscriptions_profile_safe_chat_unique" ON "telegram_subscriptions" USING btree ("profile_id","safe_id","chat_id");--> statement-breakpoint
CREATE INDEX "telegram_subscriptions_safe_enabled_idx" ON "telegram_subscriptions" USING btree ("safe_id","enabled");--> statement-breakpoint
