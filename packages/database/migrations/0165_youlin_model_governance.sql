CREATE TABLE IF NOT EXISTS "youlin_model_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"model" varchar(255) NOT NULL,
	"provider" varchar(64),
	"enabled" boolean DEFAULT true NOT NULL,
	"monthly_token_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_model_grants_limit_not_negative" CHECK ("youlin_model_grants"."monthly_token_limit" IS NULL OR "youlin_model_grants"."monthly_token_limit" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "youlin_user_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"monthly_total_token_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_user_quotas_limit_not_negative" CHECK ("youlin_user_quotas"."monthly_total_token_limit" IS NULL OR "youlin_user_quotas"."monthly_total_token_limit" >= 0)
);
--> statement-breakpoint
ALTER TABLE "youlin_model_grants" DROP CONSTRAINT IF EXISTS "youlin_model_grants_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "youlin_model_grants" ADD CONSTRAINT "youlin_model_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youlin_user_quotas" DROP CONSTRAINT IF EXISTS "youlin_user_quotas_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "youlin_user_quotas" ADD CONSTRAINT "youlin_user_quotas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youlin_model_grants_user_model_unique" ON "youlin_model_grants" USING btree ("user_id","model");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youlin_user_quotas_user_unique" ON "youlin_user_quotas" USING btree ("user_id");
