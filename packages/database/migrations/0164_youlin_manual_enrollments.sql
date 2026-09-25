CREATE TABLE IF NOT EXISTS "youlin_manual_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar(128) NOT NULL,
	"subject_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"employee_number" varchar(128) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_manual_enrollments_employee_canonical" CHECK ("youlin_manual_enrollments"."employee_number" ~ '^[A-Z0-9][A-Z0-9._:-]{0,127}$')
);
--> statement-breakpoint
ALTER TABLE "youlin_manual_enrollments" DROP CONSTRAINT IF EXISTS "youlin_manual_enrollments_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "youlin_manual_enrollments" ADD CONSTRAINT "youlin_manual_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youlin_manual_enrollments" DROP CONSTRAINT IF EXISTS "youlin_manual_enrollments_subject_scope_fk";
--> statement-breakpoint
ALTER TABLE "youlin_manual_enrollments" ADD CONSTRAINT "youlin_manual_enrollments_subject_scope_fk" FOREIGN KEY ("subject_id","enterprise_id") REFERENCES "public"."youlin_subjects"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youlin_manual_enrollments_employee_unique" ON "youlin_manual_enrollments" USING btree ("enterprise_id","employee_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youlin_manual_enrollments_subject_unique" ON "youlin_manual_enrollments" USING btree ("subject_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youlin_manual_enrollments_user_unique" ON "youlin_manual_enrollments" USING btree ("user_id");
