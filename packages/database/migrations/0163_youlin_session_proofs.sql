CREATE TABLE IF NOT EXISTS "youlin_session_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"enterprise_id" varchar(128) NOT NULL,
	"subject_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"binding_id" uuid NOT NULL,
	"issuer" varchar(1024) NOT NULL,
	"external_subject" varchar(255) NOT NULL,
	"auth_epoch" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_session_proofs_epoch_safe" CHECK ("youlin_session_proofs"."auth_epoch" BETWEEN 0 AND 9007199254740990),
	CONSTRAINT "youlin_session_proofs_issuer_bytes" CHECK (octet_length("youlin_session_proofs"."issuer") <= 1024)
);
--> statement-breakpoint
ALTER TABLE "youlin_session_proofs" DROP CONSTRAINT IF EXISTS "youlin_session_proofs_session_fk";
--> statement-breakpoint
ALTER TABLE "youlin_session_proofs" ADD CONSTRAINT "youlin_session_proofs_session_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youlin_session_proofs" DROP CONSTRAINT IF EXISTS "youlin_session_proofs_user_fk";
--> statement-breakpoint
ALTER TABLE "youlin_session_proofs" ADD CONSTRAINT "youlin_session_proofs_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youlin_session_proofs" DROP CONSTRAINT IF EXISTS "youlin_session_proofs_subject_scope_fk";
--> statement-breakpoint
ALTER TABLE "youlin_session_proofs" ADD CONSTRAINT "youlin_session_proofs_subject_scope_fk" FOREIGN KEY ("subject_id","enterprise_id") REFERENCES "public"."youlin_subjects"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youlin_session_proofs" DROP CONSTRAINT IF EXISTS "youlin_session_proofs_principal_fk";
--> statement-breakpoint
ALTER TABLE "youlin_session_proofs" ADD CONSTRAINT "youlin_session_proofs_principal_fk" FOREIGN KEY ("issuer","external_subject") REFERENCES "public"."youlin_identity_bindings"("issuer","external_subject") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youlin_session_proofs" DROP CONSTRAINT IF EXISTS "youlin_session_proofs_binding_fk";
--> statement-breakpoint
ALTER TABLE "youlin_session_proofs" ADD CONSTRAINT "youlin_session_proofs_binding_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."youlin_identity_bindings"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youlin_session_proofs_session_unique" ON "youlin_session_proofs" USING btree ("session_id");
