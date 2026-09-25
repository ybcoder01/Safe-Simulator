ALTER TABLE "telegram_deliveries" ADD COLUMN "verification_id" varchar(43);--> statement-breakpoint
ALTER TABLE "telegram_deliveries" ADD COLUMN "receipt_payload" jsonb;--> statement-breakpoint
ALTER TABLE "telegram_deliveries" ADD COLUMN "payload_digest" varchar(64);--> statement-breakpoint
ALTER TABLE "telegram_deliveries" ADD COLUMN "receipt_signature" text;--> statement-breakpoint
ALTER TABLE "telegram_deliveries" ADD COLUMN "signing_key_id" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_deliveries_verification_id_unique" ON "telegram_deliveries" USING btree ("verification_id");