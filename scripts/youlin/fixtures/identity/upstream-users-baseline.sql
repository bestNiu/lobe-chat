CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"tts" jsonb,
	"hotkey" jsonb,
	"key_vaults" text,
	"general" jsonb,
	"language_model" jsonb,
	"system_agent" jsonb,
	"default_agent" jsonb,
	"market" jsonb,
	"memory" jsonb,
	"tool" jsonb,
	"image" jsonb,
	"notification" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text,
	"email" text,
	"normalized_email" text,
	"avatar" text,
	"phone" text,
	"first_name" text,
	"last_name" text,
	"full_name" text,
	"interests" varchar(64)[],
	"is_onboarded" boolean DEFAULT false,
	"agent_onboarding" jsonb,
	"onboarding" jsonb,
	"clerk_created_at" timestamp with time zone,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verified_at" timestamp with time zone,
	"preference" jsonb,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"two_factor_enabled" boolean DEFAULT false,
	"phone_number_verified" boolean,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_normalized_email_unique" UNIQUE("normalized_email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_banned_true_created_at_idx" ON "users" USING btree ("created_at") WHERE "users"."banned" = true;