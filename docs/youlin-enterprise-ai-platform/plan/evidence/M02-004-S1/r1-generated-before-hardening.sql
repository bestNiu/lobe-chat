CREATE TABLE "youlin_employment_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar(128) NOT NULL,
	"person_id" uuid NOT NULL,
	"source_stage_key" varchar(255) NOT NULL,
	"legal_entity_code" varchar(128) NOT NULL,
	"employee_number" varchar(128) NOT NULL,
	"status" text NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_employment_stages_dates_ordered" CHECK ("youlin_employment_stages"."effective_to" IS NULL OR "youlin_employment_stages"."effective_from" IS NULL OR "youlin_employment_stages"."effective_to" >= "youlin_employment_stages"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "youlin_identity_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar(128) NOT NULL,
	"subject_id" uuid NOT NULL,
	"issuer" varchar(1024) NOT NULL,
	"external_subject" varchar(255) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_identity_bindings_issuer_bytes" CHECK (octet_length("youlin_identity_bindings"."issuer") <= 1024)
);
--> statement-breakpoint
CREATE TABLE "youlin_persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar(128) NOT NULL,
	"subject_id" uuid NOT NULL,
	"source" varchar(64) NOT NULL,
	"person_key" varchar(255) NOT NULL,
	"source_version" bigint DEFAULT 0 NOT NULL,
	"snapshot_hash" varchar(64),
	"requires_reconciliation" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_persons_id_enterprise_unique" UNIQUE("id","enterprise_id"),
	CONSTRAINT "youlin_persons_version_safe" CHECK ("youlin_persons"."source_version" BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "youlin_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar(128) NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"auth_epoch" bigint DEFAULT 0 NOT NULL,
	"authority_version" bigint DEFAULT 0 NOT NULL,
	"credentials_not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"idp_revocation_confirmed_epoch" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_subjects_id_enterprise_unique" UNIQUE("id","enterprise_id"),
	CONSTRAINT "youlin_subjects_epoch_safe" CHECK ("youlin_subjects"."auth_epoch" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "youlin_subjects_idp_epoch_bounded" CHECK ("youlin_subjects"."idp_revocation_confirmed_epoch" IS NULL OR "youlin_subjects"."idp_revocation_confirmed_epoch" BETWEEN 0 AND "youlin_subjects"."auth_epoch"),
	CONSTRAINT "youlin_subjects_version_safe" CHECK ("youlin_subjects"."authority_version" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "youlin_subjects_user_reference" CHECK (("youlin_subjects"."kind" = 'user' AND "youlin_subjects"."user_id" IS NOT NULL) OR ("youlin_subjects"."kind" = 'service' AND "youlin_subjects"."user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "youlin_binding_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar(128) NOT NULL,
	"subject_id" uuid NOT NULL,
	"submitter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"subject_version" bigint NOT NULL,
	"candidate_hash" varchar(64) NOT NULL,
	"issuer" varchar(1024),
	"external_subject" varchar(255),
	"person_key" varchar(255),
	"reviewer_id" uuid,
	"decision_evidence" varchar(255),
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_binding_cases_version_safe" CHECK ("youlin_binding_cases"."version" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "youlin_binding_cases_subject_version_safe" CHECK ("youlin_binding_cases"."subject_version" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "youlin_binding_cases_principal_pair" CHECK (("youlin_binding_cases"."issuer" IS NULL) = ("youlin_binding_cases"."external_subject" IS NULL)),
	CONSTRAINT "youlin_binding_cases_candidate_anchor" CHECK ("youlin_binding_cases"."issuer" IS NOT NULL OR "youlin_binding_cases"."person_key" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "youlin_identity_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar(128) NOT NULL,
	"subject_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"auth_epoch" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_identity_grants_epoch_safe" CHECK ("youlin_identity_grants"."auth_epoch" BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "youlin_identity_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar(128) NOT NULL,
	"actor_id" uuid NOT NULL,
	"subject_id" uuid,
	"operation" varchar(64) NOT NULL,
	"command_id" uuid NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_identity_audit_id_enterprise_unique" UNIQUE("id","enterprise_id")
);
--> statement-breakpoint
CREATE TABLE "youlin_identity_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar(128) NOT NULL,
	"actor_id" uuid NOT NULL,
	"operation" varchar(64) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_identity_commands_id_enterprise_unique" UNIQUE("id","enterprise_id")
);
--> statement-breakpoint
CREATE TABLE "youlin_identity_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar(128) NOT NULL,
	"audit_event_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youlin_identity_outbox_attempts_nonnegative" CHECK ("youlin_identity_outbox"."attempts" >= 0),
	CONSTRAINT "youlin_identity_outbox_lease_pair" CHECK (("youlin_identity_outbox"."lease_token" IS NULL) = ("youlin_identity_outbox"."lease_expires_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "youlin_employment_stages" ADD CONSTRAINT "youlin_employment_stages_person_scope_fk" FOREIGN KEY ("person_id","enterprise_id") REFERENCES "public"."youlin_persons"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_identity_bindings" ADD CONSTRAINT "youlin_identity_bindings_subject_scope_fk" FOREIGN KEY ("subject_id","enterprise_id") REFERENCES "public"."youlin_subjects"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_persons" ADD CONSTRAINT "youlin_persons_subject_scope_fk" FOREIGN KEY ("subject_id","enterprise_id") REFERENCES "public"."youlin_subjects"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_subjects" ADD CONSTRAINT "youlin_subjects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_binding_cases" ADD CONSTRAINT "youlin_binding_cases_subject_scope_fk" FOREIGN KEY ("subject_id","enterprise_id") REFERENCES "public"."youlin_subjects"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_binding_cases" ADD CONSTRAINT "youlin_binding_cases_submitter_scope_fk" FOREIGN KEY ("submitter_id","enterprise_id") REFERENCES "public"."youlin_subjects"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_binding_cases" ADD CONSTRAINT "youlin_binding_cases_reviewer_scope_fk" FOREIGN KEY ("reviewer_id","enterprise_id") REFERENCES "public"."youlin_subjects"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_identity_grants" ADD CONSTRAINT "youlin_identity_grants_subject_scope_fk" FOREIGN KEY ("subject_id","enterprise_id") REFERENCES "public"."youlin_subjects"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_identity_audit_events" ADD CONSTRAINT "youlin_identity_audit_actor_scope_fk" FOREIGN KEY ("actor_id","enterprise_id") REFERENCES "public"."youlin_subjects"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_identity_audit_events" ADD CONSTRAINT "youlin_identity_audit_subject_scope_fk" FOREIGN KEY ("subject_id","enterprise_id") REFERENCES "public"."youlin_subjects"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_identity_audit_events" ADD CONSTRAINT "youlin_identity_audit_command_scope_fk" FOREIGN KEY ("command_id","enterprise_id") REFERENCES "public"."youlin_identity_commands"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_identity_commands" ADD CONSTRAINT "youlin_identity_commands_actor_scope_fk" FOREIGN KEY ("actor_id","enterprise_id") REFERENCES "public"."youlin_subjects"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youlin_identity_outbox" ADD CONSTRAINT "youlin_identity_outbox_event_scope_fk" FOREIGN KEY ("audit_event_id","enterprise_id") REFERENCES "public"."youlin_identity_audit_events"("id","enterprise_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "youlin_employment_stages_source_unique" ON "youlin_employment_stages" USING btree ("person_id","source_stage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "youlin_employment_stages_active_employee_unique" ON "youlin_employment_stages" USING btree ("enterprise_id","legal_entity_code","employee_number") WHERE "youlin_employment_stages"."status" = 'active';--> statement-breakpoint
CREATE INDEX "youlin_employment_stages_person_idx" ON "youlin_employment_stages" USING btree ("enterprise_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "youlin_identity_bindings_principal_unique" ON "youlin_identity_bindings" USING btree ("issuer","external_subject");--> statement-breakpoint
CREATE INDEX "youlin_identity_bindings_subject_idx" ON "youlin_identity_bindings" USING btree ("enterprise_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "youlin_persons_subject_unique" ON "youlin_persons" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "youlin_persons_source_key_unique" ON "youlin_persons" USING btree ("enterprise_id","source","person_key");--> statement-breakpoint
CREATE UNIQUE INDEX "youlin_subjects_user_unique" ON "youlin_subjects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "youlin_subjects_enterprise_status_idx" ON "youlin_subjects" USING btree ("enterprise_id","status");--> statement-breakpoint
CREATE INDEX "youlin_binding_cases_queue_idx" ON "youlin_binding_cases" USING btree ("enterprise_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "youlin_identity_grants_permission_unique" ON "youlin_identity_grants" USING btree ("subject_id","permission");--> statement-breakpoint
CREATE INDEX "youlin_identity_audit_subject_idx" ON "youlin_identity_audit_events" USING btree ("enterprise_id","subject_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "youlin_identity_commands_key_unique" ON "youlin_identity_commands" USING btree ("enterprise_id","actor_id","operation","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "youlin_identity_outbox_event_unique" ON "youlin_identity_outbox" USING btree ("audit_event_id");--> statement-breakpoint
CREATE INDEX "youlin_identity_outbox_ready_idx" ON "youlin_identity_outbox" USING btree ("enterprise_id","status","available_at");