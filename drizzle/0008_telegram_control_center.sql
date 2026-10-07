ALTER TABLE "telegram_subscriptions" ADD COLUMN "chat_label" text;--> statement-breakpoint
ALTER TABLE "telegram_subscriptions" ADD COLUMN "disconnected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telegram_subscriptions" ADD COLUMN "last_polled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telegram_subscriptions" ADD COLUMN "last_poll_error" text;--> statement-breakpoint
ALTER TABLE "telegram_subscriptions" ADD COLUMN "last_delivery_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telegram_subscriptions" ADD COLUMN "last_delivery_error" text;