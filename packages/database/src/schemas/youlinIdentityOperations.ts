import type {
  YoulinIdentityAuditDetail,
  YoulinIdentityCommandResult,
  YoulinOutboxStatus,
} from '@lobechat/types';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createdAt, timestamptz } from './_helpers';
import { youlinSubjects } from './youlinIdentity';

/** A retry returns its committed receipt; it never reapplies an earlier authority state. */
export const youlinIdentityCommands = pgTable(
  'youlin_identity_commands',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    enterpriseId: varchar('enterprise_id', { length: 128 }).notNull(),
    actorId: uuid('actor_id').notNull(),
    operation: varchar('operation', { length: 64 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    result: jsonb('result').$type<YoulinIdentityCommandResult>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('youlin_identity_commands_id_enterprise_unique').on(t.id, t.enterpriseId),
    uniqueIndex('youlin_identity_commands_key_unique').on(
      t.enterpriseId,
      t.actorId,
      t.operation,
      t.idempotencyKey,
    ),
    foreignKey({
      columns: [t.actorId, t.enterpriseId],
      foreignColumns: [youlinSubjects.id, youlinSubjects.enterpriseId],
      name: 'youlin_identity_commands_actor_scope_fk',
    }).onDelete('restrict'),
  ],
);

/** Application append-only audit. DB-role hardening/retention are separate deployment gates. */
export const youlinIdentityAuditEvents = pgTable(
  'youlin_identity_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    enterpriseId: varchar('enterprise_id', { length: 128 }).notNull(),
    actorId: uuid('actor_id').notNull(),
    subjectId: uuid('subject_id'),
    operation: varchar('operation', { length: 64 }).notNull(),
    commandId: uuid('command_id').notNull(),
    detail: jsonb('detail').$type<YoulinIdentityAuditDetail>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('youlin_identity_audit_id_enterprise_unique').on(t.id, t.enterpriseId),
    index('youlin_identity_audit_subject_idx').on(t.enterpriseId, t.subjectId, t.createdAt),
    foreignKey({
      columns: [t.actorId, t.enterpriseId],
      foreignColumns: [youlinSubjects.id, youlinSubjects.enterpriseId],
      name: 'youlin_identity_audit_actor_scope_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.subjectId, t.enterpriseId],
      foreignColumns: [youlinSubjects.id, youlinSubjects.enterpriseId],
      name: 'youlin_identity_audit_subject_scope_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.commandId, t.enterpriseId],
      foreignColumns: [youlinIdentityCommands.id, youlinIdentityCommands.enterpriseId],
      name: 'youlin_identity_audit_command_scope_fk',
    }).onDelete('restrict'),
  ],
);

/** Leased private delivery queue. Acknowledgement is fenced by the exact current lease token. */
export const youlinIdentityOutbox = pgTable(
  'youlin_identity_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    enterpriseId: varchar('enterprise_id', { length: 128 }).notNull(),
    auditEventId: uuid('audit_event_id').notNull(),
    status: text('status').$type<YoulinOutboxStatus>().default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamptz('available_at').defaultNow().notNull(),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamptz('lease_expires_at'),
    deliveredAt: timestamptz('delivered_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('youlin_identity_outbox_event_unique').on(t.auditEventId),
    index('youlin_identity_outbox_ready_idx').on(t.enterpriseId, t.status, t.availableAt),
    check('youlin_identity_outbox_attempts_nonnegative', sql`${t.attempts} >= 0`),
    check(
      'youlin_identity_outbox_lease_pair',
      sql`(${t.leaseToken} IS NULL) = (${t.leaseExpiresAt} IS NULL)`,
    ),
    foreignKey({
      columns: [t.auditEventId, t.enterpriseId],
      foreignColumns: [youlinIdentityAuditEvents.id, youlinIdentityAuditEvents.enterpriseId],
      name: 'youlin_identity_outbox_event_scope_fk',
    }).onDelete('restrict'),
  ],
);
