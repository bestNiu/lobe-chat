import type { YoulinManualEnrollmentStatus } from '@lobechat/types';
import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { createdAt, updatedAt } from './_helpers';
import { users } from './user';
import { youlinSubjects } from './youlinIdentity';

/** Permanent administrator-maintained employee-number reservations, separate from HR facts. */
export const youlinManualEnrollments = pgTable(
  'youlin_manual_enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    enterpriseId: varchar('enterprise_id', { length: 128 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    employeeNumber: varchar('employee_number', { length: 128 }).notNull(),
    status: text('status').$type<YoulinManualEnrollmentStatus>().default('pending').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('youlin_manual_enrollments_employee_unique').on(t.enterpriseId, t.employeeNumber),
    uniqueIndex('youlin_manual_enrollments_subject_unique').on(t.subjectId),
    uniqueIndex('youlin_manual_enrollments_user_unique').on(t.userId),
    check(
      'youlin_manual_enrollments_employee_canonical',
      sql`${t.employeeNumber} ~ '^[A-Z0-9][A-Z0-9._:-]{0,127}$'`,
    ),
    foreignKey({
      columns: [t.subjectId, t.enterpriseId],
      foreignColumns: [youlinSubjects.id, youlinSubjects.enterpriseId],
      name: 'youlin_manual_enrollments_subject_scope_fk',
    }).onDelete('restrict'),
  ],
);
