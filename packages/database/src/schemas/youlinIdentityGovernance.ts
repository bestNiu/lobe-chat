import type {
  YoulinBindingCaseStatus,
  YoulinBindingConflictReason,
  YoulinIdentityPermission,
} from '@lobechat/types';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createdAt, timestamptz, updatedAt } from './_helpers';
import { youlinSubjects } from './youlinIdentity';

/** Current identity-operator grants, not Project membership or the OSS RBAC stub. */
export const youlinIdentityGrants = pgTable(
  'youlin_identity_grants',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    enterpriseId: varchar('enterprise_id', { length: 128 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    permission: text('permission').$type<YoulinIdentityPermission>().notNull(),
    /** A new employment/security epoch cannot resurrect this old grant. */
    authEpoch: bigint('auth_epoch', { mode: 'number' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('youlin_identity_grants_permission_unique').on(t.subjectId, t.permission),
    check('youlin_identity_grants_epoch_safe', sql`${t.authEpoch} BETWEEN 0 AND 9007199254740991`),
    foreignKey({
      columns: [t.subjectId, t.enterpriseId],
      foreignColumns: [youlinSubjects.id, youlinSubjects.enterpriseId],
      name: 'youlin_identity_grants_subject_scope_fk',
    }).onDelete('restrict'),
  ],
);

export const youlinBindingCases = pgTable(
  'youlin_binding_cases',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    enterpriseId: varchar('enterprise_id', { length: 128 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    submitterId: uuid('submitter_id').notNull(),
    reason: text('reason').$type<YoulinBindingConflictReason>().notNull(),
    status: text('status').$type<YoulinBindingCaseStatus>().default('pending').notNull(),
    version: bigint('version', { mode: 'number' }).default(0).notNull(),
    /** Any subsequent authority change invalidates this candidate's review. */
    subjectVersion: bigint('subject_version', { mode: 'number' }).notNull(),
    candidateHash: varchar('candidate_hash', { length: 64 }).notNull(),
    /** Principal fields are absent for HR-anchor conflicts; no fake issuer is invented. */
    issuer: varchar('issuer', { length: 1024 }),
    externalSubject: varchar('external_subject', { length: 255 }),
    personKey: varchar('person_key', { length: 255 }),
    reviewerId: uuid('reviewer_id'),
    decisionEvidence: varchar('decision_evidence', { length: 255 }),
    decidedAt: timestamptz('decided_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('youlin_binding_cases_queue_idx').on(t.enterpriseId, t.status, t.createdAt),
    check('youlin_binding_cases_version_safe', sql`${t.version} BETWEEN 0 AND 9007199254740991`),
    check(
      'youlin_binding_cases_subject_version_safe',
      sql`${t.subjectVersion} BETWEEN 0 AND 9007199254740991`,
    ),
    check(
      'youlin_binding_cases_principal_pair',
      sql`(${t.issuer} IS NULL) = (${t.externalSubject} IS NULL)`,
    ),
    check(
      'youlin_binding_cases_candidate_anchor',
      sql`${t.issuer} IS NOT NULL OR ${t.personKey} IS NOT NULL`,
    ),
    foreignKey({
      columns: [t.subjectId, t.enterpriseId],
      foreignColumns: [youlinSubjects.id, youlinSubjects.enterpriseId],
      name: 'youlin_binding_cases_subject_scope_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.submitterId, t.enterpriseId],
      foreignColumns: [youlinSubjects.id, youlinSubjects.enterpriseId],
      name: 'youlin_binding_cases_submitter_scope_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.reviewerId, t.enterpriseId],
      foreignColumns: [youlinSubjects.id, youlinSubjects.enterpriseId],
      name: 'youlin_binding_cases_reviewer_scope_fk',
    }).onDelete('restrict'),
  ],
);
