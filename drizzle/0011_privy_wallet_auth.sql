CREATE TABLE "profile_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"privy_user_id" text NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"last_authenticated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_identities" ADD CONSTRAINT "profile_identities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "profile_identities_profile_unique" ON "profile_identities" USING btree ("profile_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "profile_identities_privy_user_unique" ON "profile_identities" USING btree ("privy_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "profile_identities_wallet_unique" ON "profile_identities" USING btree ("wallet_address");
