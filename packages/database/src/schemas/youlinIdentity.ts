import type {
  YoulinBindingStatus,
  YoulinEmploymentStatus,
  YoulinSubjectKind,
  YoulinSubjectStatus,
} from '@lobechat/types';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createdAt, timestamptz, updatedAt } from './_helpers';
import { users } from './user';

/** Application security subjects; neither an HR master nor a second application-user table. */
export const youlinSubjects = pgTable(
  'youlin_subjects',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    enterpriseId: varchar('enterprise_id', { length: 128 }).notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'restrict' }),
    kind: text('kind').$type<YoulinSubjectKind>().notNull(),
    status: text('status').$type<YoulinSubjectStatus>().default('pending').notNull(),
    authEpoch: bigint('auth_epoch', { mode: 'number' }).default(0).notNull(),
    /** Repository authority revision, distinct from an HR provider's per-person revision. */
    authorityVersion: bigint('authority_version', { mode: 'number' }).default(0).notNull(),
    /** New authentication must postdate this DB-clock barrier under an explicit clock-skew bound. */
    credentialsNotBefore: timestamptz('credentials_not_before').defaultNow().notNull(),
    /** Set only by the fenced delivery worker after IdP revocation succeeds for this exact epoch. */
    idpRevocationConfirmedEpoch: bigint('idp_revocation_confirmed_epoch', { mode: 'number' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('youlin_subjects_id_enterprise_unique').on(t.id, t.enterpriseId),
    uniqueIndex('youlin_subjects_user_unique').on(t.userId),
    index('youlin_subjects_enterprise_status_idx').on(t.enterpriseId, t.status),
    check('youlin_subjects_epoch_safe', sql`${t.authEpoch} BETWEEN 0 AND 9007199254740991`),
    check(
      'youlin_subjects_idp_epoch_bounded',
      sql`${t.idpRevocationConfirmedEpoch} IS NULL OR ${t.idpRevocationConfirmedEpoch} BETWEEN 0 AND ${t.authEpoch}`,
    ),
    check(
      'youlin_subjects_version_safe',
      sql`${t.authorityVersion} BETWEEN 0 AND 9007199254740991`,
    ),
    check(
      'youlin_subjects_user_reference',
      sql`(${t.kind} = 'user' AND ${t.userId} IS NOT NULL) OR (${t.kind} = 'service' AND ${t.userId} IS NULL)`,
    ),
  ],
);

/** A stable HR person anchor. Employee numbers belong to employment stages, not this key. */
export const youlinPersons = pgTable(
  'youlin_persons',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    enterpriseId: varchar('enterprise_id', { length: 128 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    source: varchar('source', { length: 64 }).notNull(),
    personKey: varchar('person_key', { length: 255 }).notNull(),
    sourceVersion: bigint('source_version', { mode: 'number' }).default(0).notNull(),
    /** Fingerprint of the normalized complete snapshot, for same-version conflict detection. */
    snapshotHash: varchar('snapshot_hash', { length: 64 }),
    /** True until a complete, unambiguous HR snapshot has been accepted. */
    requiresReconciliation: boolean('requires_reconciliation').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('youlin_persons_id_enterprise_unique').on(t.id, t.enterpriseId),
    uniqueIndex('youlin_persons_subject_unique').on(t.subjectId),
    uniqueIndex('youlin_persons_source_key_unique').on(t.enterpriseId, t.source, t.personKey),
    check('youlin_persons_version_safe', sql`${t.sourceVersion} BETWEEN 0 AND 9007199254740991`),
    foreignKey({
      columns: [t.subjectId, t.enterpriseId],
      foreignColumns: [youlinSubjects.id, youlinSubjects.enterpriseId],
      name: 'youlin_persons_subject_scope_fk',
    }).onDelete('restrict'),
  ],
);

/** Rehire and transfer retain the person/user anchor while preserving separate stage history. */
export const youlinEmploymentStages = pgTable(
  'youlin_employment_stages',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    enterpriseId: varchar('enterprise_id', { length: 128 }).notNull(),
    personId: uuid('person_id').notNull(),
    sourceStageKey: varchar('source_stage_key', { length: 255 }).notNull(),
    legalEntityCode: varchar('legal_entity_code', { length: 128 }).notNull(),
    employeeNumber: varchar('employee_number', { length: 128 }).notNull(),
    status: text('status').$type<YoulinEmploymentStatus>().notNull(),
    effectiveFrom: timestamptz('effective_from'),
    effectiveTo: timestamptz('effective_to'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('youlin_employment_stages_source_unique').on(t.personId, t.sourceStageKey),
    uniqueIndex('youlin_employment_stages_active_employee_unique')
      .on(t.enterpriseId, t.legalEntityCode, t.employeeNumber)
      .where(sql`${t.status} = 'active'`),
    index('youlin_employment_stages_person_idx').on(t.enterpriseId, t.personId),
    check(
      'youlin_employment_stages_dates_ordered',
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveFrom} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`,
    ),
    foreignKey({
      columns: [t.personId, t.enterpriseId],
      foreignColumns: [youlinPersons.id, youlinPersons.enterpriseId],
      name: 'youlin_employment_stages_person_scope_fk',
    }).onDelete('restrict'),
  ],
);

/** Issuer + sub is globally unique. No email/name/phone-based account linking. */
export const youlinIdentityBindings = pgTable(
  'youlin_identity_bindings',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    enterpriseId: varchar('enterprise_id', { length: 128 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    issuer: varchar('issuer', { length: 1024 }).notNull(),
    externalSubject: varchar('external_subject', { length: 255 }).notNull(),
    status: text('status').$type<YoulinBindingStatus>().default('active').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('youlin_identity_bindings_principal_unique').on(t.issuer, t.externalSubject),
    check('youlin_identity_bindings_issuer_bytes', sql`octet_length(${t.issuer}) <= 1024`),
    index('youlin_identity_bindings_subject_idx').on(t.enterpriseId, t.subjectId),
    foreignKey({
      columns: [t.subjectId, t.enterpriseId],
      foreignColumns: [youlinSubjects.id, youlinSubjects.enterpriseId],
      name: 'youlin_identity_bindings_subject_scope_fk',
    }).onDelete('restrict'),
  ],
);
