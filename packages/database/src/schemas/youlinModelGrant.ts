import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createdAt, updatedAt } from './_helpers';
import { users } from './user';

/**
 * Administrator-maintained model authorization and per-model token caps.
 *
 * Platform-owned on purpose: Keycloak only authenticates, it never decides which model an employee
 * may call or how much they may consume. A missing row means "not callable" (deny by default) and a
 * `null` limit means "uncapped" — never zero, because zero would silently look like an exhausted
 * quota instead of an unconfigured one.
 */
export const youlinModelGrants = pgTable(
  'youlin_model_grants',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    model: varchar('model', { length: 255 }).notNull(),
    /** Optional narrowing: when set, the grant only applies to this provider id. */
    provider: varchar('provider', { length: 64 }),
    enabled: boolean('enabled').default(true).notNull(),
    /** Token cap for the current Asia/Shanghai calendar month; null is uncapped. */
    monthlyTokenLimit: integer('monthly_token_limit'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('youlin_model_grants_user_model_unique').on(t.userId, t.model),
    check(
      'youlin_model_grants_limit_not_negative',
      sql`${t.monthlyTokenLimit} IS NULL OR ${t.monthlyTokenLimit} >= 0`,
    ),
  ],
);

/** Per-user monthly total token cap across all models; one row per user, null is uncapped. */
export const youlinUserQuotas = pgTable(
  'youlin_user_quotas',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    monthlyTotalTokenLimit: integer('monthly_total_token_limit'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('youlin_user_quotas_user_unique').on(t.userId),
    check(
      'youlin_user_quotas_limit_not_negative',
      sql`${t.monthlyTotalTokenLimit} IS NULL OR ${t.monthlyTotalTokenLimit} >= 0`,
    ),
  ],
);
