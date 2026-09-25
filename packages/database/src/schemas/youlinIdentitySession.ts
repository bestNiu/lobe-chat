import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createdAt } from './_helpers';
import { session as authSessions } from './betterAuth';
import { users } from './user';
import { youlinIdentityBindings, youlinSubjects } from './youlinIdentity';

/** Immutable proof that one native Better Auth session passed enterprise authentication. */
export const youlinSessionProofs = pgTable(
  'youlin_session_proofs',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    sessionId: text('session_id').notNull(),
    enterpriseId: varchar('enterprise_id', { length: 128 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    userId: text('user_id').notNull(),
    bindingId: uuid('binding_id').notNull(),
    issuer: varchar('issuer', { length: 1024 }).notNull(),
    externalSubject: varchar('external_subject', { length: 255 }).notNull(),
    /** Authority epoch captured from the credential gate, never inferred from session time. */
    authEpoch: bigint('auth_epoch', { mode: 'number' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('youlin_session_proofs_session_unique').on(t.sessionId),
    check('youlin_session_proofs_epoch_safe', sql`${t.authEpoch} BETWEEN 0 AND 9007199254740990`),
    check('youlin_session_proofs_issuer_bytes', sql`octet_length(${t.issuer}) <= 1024`),
    foreignKey({
      columns: [t.sessionId],
      foreignColumns: [authSessions.id],
      name: 'youlin_session_proofs_session_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: 'youlin_session_proofs_user_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.subjectId, t.enterpriseId],
      foreignColumns: [youlinSubjects.id, youlinSubjects.enterpriseId],
      name: 'youlin_session_proofs_subject_scope_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.issuer, t.externalSubject],
      foreignColumns: [youlinIdentityBindings.issuer, youlinIdentityBindings.externalSubject],
      name: 'youlin_session_proofs_principal_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.bindingId],
      foreignColumns: [youlinIdentityBindings.id],
      name: 'youlin_session_proofs_binding_fk',
    }).onDelete('restrict'),
  ],
);

export type YoulinSessionProofItem = typeof youlinSessionProofs.$inferSelect;
export type NewYoulinSessionProof = typeof youlinSessionProofs.$inferInsert;
