CREATE TABLE IF NOT EXISTS "profile_address_book" (
	"profile_id" uuid NOT NULL,
	"safe_id" uuid NOT NULL,
	"address" varchar(42) NOT NULL,
	"label" text NOT NULL,
	"trust_level" "trust_level" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_address_book_profile_id_safe_id_address_pk" PRIMARY KEY("profile_id","safe_id","address"),
	CONSTRAINT "profile_address_book_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "profile_address_book_safe_id_safes_id_fk" FOREIGN KEY ("safe_id") REFERENCES "public"."safes"("id") ON DELETE cascade ON UPDATE no action
);
