ALTER TABLE "profile_address_book" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "profile_address_book" ADD COLUMN "trusted_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "profile_address_book" SET "trusted_at" = "created_at";
