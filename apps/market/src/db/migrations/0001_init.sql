-- Internal market schema.
-- Every statement is idempotent so this file can be re-applied to an existing
-- database without data loss (the runner also records applied versions, but
-- operators may run it by hand during an incident).

CREATE TABLE IF NOT EXISTS market_resources (
  id                  TEXT PRIMARY KEY,
  resource_type       TEXT NOT NULL
                      CHECK (resource_type IN ('agent','skill','plugin')),
  identifier          TEXT NOT NULL,
  owner_user_id       TEXT NOT NULL,
  owner_email         TEXT,

  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  summary             TEXT,
  icon                TEXT,
  category            TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',

  -- No `public`: the market is internal-only (decision D2).
  scope               TEXT NOT NULL DEFAULT 'private'
                      CHECK (scope IN ('private','org','team','users')),

  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','submitted','rejected','published','unpublished','archived')),

  latest_version_id   TEXT,
  latest_version_no   INTEGER NOT NULL DEFAULT 0,

  install_count       BIGINT NOT NULL DEFAULT 0,
  fork_count          BIGINT NOT NULL DEFAULT 0,
  rating_avg          NUMERIC(3,2),
  rating_count        INTEGER NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at        TIMESTAMPTZ,
  reviewed_at         TIMESTAMPTZ,
  published_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS market_resources_type_identifier_uq
  ON market_resources (resource_type, identifier)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS market_resources_browse_idx
  ON market_resources (resource_type, status, scope, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS market_resources_owner_idx
  ON market_resources (owner_user_id);

CREATE TABLE IF NOT EXISTS market_resource_versions (
  id             TEXT PRIMARY KEY,
  resource_id    TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  version_no     INTEGER NOT NULL,
  version_label  TEXT,

  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,

  changelog      TEXT,
  file_hash      VARCHAR(64),
  file_size      BIGINT,
  storage_key    TEXT,

  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','submitted','rejected','published','archived')),

  created_by     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS market_versions_resource_version_uq
  ON market_resource_versions (resource_id, version_no);

CREATE TABLE IF NOT EXISTS market_categories (
  id            TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('agent','skill','plugin')),
  key           TEXT NOT NULL,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resource_type, key)
);

-- ---------------------------------------------------------------------------
-- P2.5: teams and explicit grants (the open-source build has no workspace/RBAC
-- seeding, so the market owns its own organization model).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS market_teams (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_team_members (
  team_id  TEXT NOT NULL REFERENCES market_teams(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL,
  role     TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','lead')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS market_team_members_user_idx
  ON market_team_members (user_id);

CREATE TABLE IF NOT EXISTS market_resource_teams (
  resource_id TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  team_id     TEXT NOT NULL REFERENCES market_teams(id) ON DELETE CASCADE,
  PRIMARY KEY (resource_id, team_id)
);

CREATE TABLE IF NOT EXISTS market_resource_grants (
  id           TEXT PRIMARY KEY,
  resource_id  TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user','team')),
  subject_id   TEXT NOT NULL,
  permission   TEXT NOT NULL CHECK (permission IN ('read','install','manage')),
  effect       TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  granted_by   TEXT NOT NULL,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resource_id, subject_type, subject_id, permission)
);

CREATE INDEX IF NOT EXISTS market_resource_grants_subject_idx
  ON market_resource_grants (subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- P3: review chain (single stage today, `stage` + `depends_on_review_id`
-- leave room for a multi-stage chain without a migration rewrite).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS market_reviewers (
  user_id    TEXT PRIMARY KEY,
  email      TEXT,
  stage      TEXT NOT NULL DEFAULT 'it',
  granted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_admins (
  user_id    TEXT PRIMARY KEY,
  email      TEXT,
  granted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_reviews (
  id                    TEXT PRIMARY KEY,
  resource_id           TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  version_id            TEXT NOT NULL REFERENCES market_resource_versions(id) ON DELETE CASCADE,
  stage                 TEXT NOT NULL DEFAULT 'it',
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','cancelled')),
  assignee_id           TEXT,
  reviewer_id           TEXT,
  comment               TEXT,
  checklist             JSONB NOT NULL DEFAULT '{}'::jsonb,
  depends_on_review_id  TEXT REFERENCES market_reviews(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS market_reviews_queue_idx
  ON market_reviews (stage, status, created_at);

-- ---------------------------------------------------------------------------
-- P4: installs, ratings, comments, audit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS market_installs (
  id                TEXT PRIMARY KEY,
  resource_id       TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  version_id        TEXT NOT NULL,
  installed_by      TEXT NOT NULL,
  local_instance_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS market_installs_user_resource_uq
  ON market_installs (resource_id, installed_by);

CREATE TABLE IF NOT EXISTS market_comments (
  id          TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),
  content     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS market_comments_resource_idx
  ON market_comments (resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS market_audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  workspace_id  TEXT,
  actor_id      TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_audit_logs_actor_idx
  ON market_audit_logs (actor_id, created_at DESC);