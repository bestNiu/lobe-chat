import {
  bigint,
  bigserial,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Drizzle mirror of `migrations/0001_init.sql`.
 * Keep both in sync: the SQL is the source of truth for DDL, this file is for
 * type-safe queries.
 */

export const marketResources = pgTable(
  'market_resources',
  {
    id: text('id').primaryKey(),
    resourceType: text('resource_type').notNull(),
    identifier: text('identifier').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    ownerEmail: text('owner_email'),

    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    summary: text('summary'),
    icon: text('icon'),
    category: text('category'),
    tags: text('tags').array().notNull().default([]),

    scope: text('scope').notNull().default('private'),
    status: text('status').notNull().default('draft'),

    latestVersionId: text('latest_version_id'),
    latestVersionNo: integer('latest_version_no').notNull().default(0),

    installCount: bigint('install_count', { mode: 'number' }).notNull().default(0),
    forkCount: bigint('fork_count', { mode: 'number' }).notNull().default(0),
    ratingAvg: numeric('rating_avg'),
    ratingCount: integer('rating_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('market_resources_type_identifier_uq').on(table.resourceType, table.identifier),
    index('market_resources_browse_idx').on(table.resourceType, table.status, table.scope),
    index('market_resources_owner_idx').on(table.ownerUserId),
  ],
);

export const marketResourceVersions = pgTable(
  'market_resource_versions',
  {
    id: text('id').primaryKey(),
    resourceId: text('resource_id')
      .notNull()
      .references(() => marketResources.id, { onDelete: 'cascade' }),
    versionNo: integer('version_no').notNull(),
    versionLabel: text('version_label'),

    payload: jsonb('payload').notNull().default({}),

    changelog: text('changelog'),
    fileHash: text('file_hash'),
    fileSize: bigint('file_size', { mode: 'number' }),
    storageKey: text('storage_key'),

    status: text('status').notNull().default('draft'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('market_versions_resource_version_uq').on(table.resourceId, table.versionNo),
  ],
);

export const marketCategories = pgTable(
  'market_categories',
  {
    id: text('id').primaryKey(),
    resourceType: text('resource_type').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('market_categories_type_key_uq').on(table.resourceType, table.key)],
);

// ---------------------------------------------------------------------------
// P2.5 — teams + explicit grants
// ---------------------------------------------------------------------------

export const marketTeams = pgTable('market_teams', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const marketTeamMembers = pgTable(
  'market_team_members',
  {
    teamId: text('team_id')
      .notNull()
      .references(() => marketTeams.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role').notNull().default('member'),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    index('market_team_members_user_idx').on(table.userId),
  ],
);

export const marketResourceTeams = pgTable(
  'market_resource_teams',
  {
    resourceId: text('resource_id')
      .notNull()
      .references(() => marketResources.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => marketTeams.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.resourceId, table.teamId] })],
);

export const marketResourceGrants = pgTable(
  'market_resource_grants',
  {
    id: text('id').primaryKey(),
    resourceId: text('resource_id')
      .notNull()
      .references(() => marketResources.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    permission: text('permission').notNull(),
    effect: text('effect').notNull().default('allow'),
    grantedBy: text('granted_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('market_resource_grants_uq').on(
      table.resourceId,
      table.subjectType,
      table.subjectId,
      table.permission,
    ),
    index('market_resource_grants_subject_idx').on(table.subjectType, table.subjectId),
  ],
);

// ---------------------------------------------------------------------------
// P3 — reviewers, admins, reviews
// ---------------------------------------------------------------------------

export const marketReviewers = pgTable('market_reviewers', {
  userId: text('user_id').primaryKey(),
  email: text('email'),
  stage: text('stage').notNull().default('it'),
  grantedBy: text('granted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const marketAdmins = pgTable('market_admins', {
  userId: text('user_id').primaryKey(),
  email: text('email'),
  grantedBy: text('granted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const marketReviews = pgTable(
  'market_reviews',
  {
    id: text('id').primaryKey(),
    resourceId: text('resource_id')
      .notNull()
      .references(() => marketResources.id, { onDelete: 'cascade' }),
    versionId: text('version_id')
      .notNull()
      .references(() => marketResourceVersions.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull().default('it'),
    status: text('status').notNull().default('pending'),
    assigneeId: text('assignee_id'),
    reviewerId: text('reviewer_id'),
    comment: text('comment'),
    checklist: jsonb('checklist').notNull().default({}),
    dependsOnReviewId: text('depends_on_review_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [index('market_reviews_queue_idx').on(table.stage, table.status, table.createdAt)],
);

// ---------------------------------------------------------------------------
// P4 — installs, comments, audit
// ---------------------------------------------------------------------------

export const marketInstalls = pgTable(
  'market_installs',
  {
    id: text('id').primaryKey(),
    resourceId: text('resource_id')
      .notNull()
      .references(() => marketResources.id, { onDelete: 'cascade' }),
    versionId: text('version_id').notNull(),
    installedBy: text('installed_by').notNull(),
    localInstanceId: text('local_instance_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('market_installs_user_resource_uq').on(table.resourceId, table.installedBy),
  ],
);

export const marketComments = pgTable(
  'market_comments',
  {
    id: text('id').primaryKey(),
    resourceId: text('resource_id')
      .notNull()
      .references(() => marketResources.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    rating: smallint('rating'),
    content: text('content'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('market_comments_resource_idx').on(table.resourceId, table.createdAt)],
);

export const marketAuditLogs = pgTable(
  'market_audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: text('workspace_id'),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    metadata: jsonb('metadata').notNull().default({}),
    ipAddress: inet('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('market_audit_logs_actor_idx').on(table.actorId, table.createdAt)],
);
