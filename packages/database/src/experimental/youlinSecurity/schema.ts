import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import type { ExperimentalSubjectKind } from './types';

// Deliberately outside src/schemas: not discovered by the production migrator.
// Maps the existing disposable PostgreSQL fixture, not approved production tables.
const experiment = pgSchema('youlin_security_spike');

export const experimentalSubjectStates = experiment.table(
  'subject_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subjectKind: text('subject_kind').$type<ExperimentalSubjectKind>().notNull(),
    subjectId: varchar('subject_id', { length: 128 }).notNull(),
    authEpoch: bigint('auth_epoch', { mode: 'number' }).notNull(),
    sourceVersion: bigint('source_version', { mode: 'number' }).notNull(),
    disabled: boolean('disabled').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('subject_states_subject_kind_subject_id_key').on(table.subjectKind, table.subjectId),
    check('subject_states_subject_kind_check', sql`${table.subjectKind} IN ('user', 'service')`),
    check('subject_states_subject_id_check', sql`length(${table.subjectId}) > 0`),
    check(
      'subject_states_auth_epoch_check',
      sql`${table.authEpoch} BETWEEN 0 AND 9007199254740991`,
    ),
    check(
      'subject_states_source_version_check',
      sql`${table.sourceVersion} BETWEEN 0 AND 9007199254740991`,
    ),
  ],
);
