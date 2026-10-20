# 内部市场（Internal Market）开发文档

> 状态：设计已定稿，待进入实施
> 适用范围：unionclinHub（LobeHub fork）自托管部署
> 目标读者：后端 / 前端 / 运维 / 安全

---

## 1. 背景与目标

当前部署依赖 LobeHub 官方市场 `market.lobehub.com`，其服务端为闭源商业服务，所有读接口要求 LobeHub Cloud 签发的凭据（OIDC / M2M / Trusted Client 白名单）。实测未配置凭据时返回：

```json
{ "error": "unauthorized", "error_description": "Missing bearer token" }
```

导致自托管实例的「助理市场 / Skill 市场 / MCP 市场」不可用，onboarding 推荐位报 500。

**本项目目标**：构建一套公司内部市场服务，复用 LobeHub 客户端已有的市场 UI 与 SDK 契约，实现：

| 编号 | 目标           | 说明                                        |
| ---- | -------------- | ------------------------------------------- |
| G1   | 完全自建       | 不依赖任何 LobeHub Cloud 服务               |
| G2   | UGC 上传       | 每个用户都能创建并提交助理 / Skill / MCP    |
| G3   | 可见范围可控   | 资源级 scope + 指定人授权（分阶段）         |
| G4   | 强制审核       | 所有资源发布前必须经 IT 审核                |
| G5   | MCP 全类型支持 | `http` / `sse` / `stdio` 三类连接方式均支持 |
| G6   | 内部可用       | 不对外开放，禁止匿名访问                    |

### 1.1 已确认的产品决策

| #   | 决策                          | 结论                                                                 |
| --- | ----------------------------- | -------------------------------------------------------------------- |
| D1  | 是否需要「指定人」授权        | **需要**，但分阶段推进（P1 先做 4 档 scope，P2 再补 ACL）            |
| D2  | 是否允许 `public`（匿名可读） | **不允许**，最高可见范围为 `org`（全员已认证用户）                   |
| D3  | 审核策略                      | **所有资源必须审核**；首版为「提交 → IT 单级审核」，审核链路需可扩展 |
| D4  | MCP 连接类型范围              | **全范围支持**（`stdio` / `http` / `sse`），配套安全控制             |

### 1.2 非目标

- 不实现对外公开市场（无 `public` scope）
- 不实现付费 / 结算 / 分成
- 不实现跨公司联邦市场
- 不复用 LobeHub 官方凭据体系

### 1.3 平台能力边界（重要，已验证）

自托管版（开源）**不具备 LobeHub Cloud 的多租户能力**，以下均为 cloud-only stub：

| 能力                   | 开源版实际行为                                                | 验证位置                                                      |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| 创建 workspace         | 抛 `NOT_IMPLEMENTED`（`cloudOnly('Workspace creation')`）     | `packages/business-server/src/lambda-routers/workspace.ts:73` |
| 更新 workspace         | 抛 `NOT_IMPLEMENTED`                                          | 同上 `:111`                                                   |
| 列出 workspace         | 恒返回 `[]`                                                   | 同上 `list`                                                   |
| workspace 邀请成员     | 抛 `NOT_IMPLEMENTED`（cloud-only）                            | `workspaceMember.ts:39`                                       |
| workspace 团队         | stub，无开源 UI 消费                                          | `workspaceTeam.ts`                                            |
| RBAC 角色              | `rbac_roles` / `rbac_user_roles` 为空，**无 seed 与分配入口** | 实测当前部署均为 0 行                                         |
| `resource_permissions` | 依赖 `workspace_id NOT NULL`，无 workspace 时不可用           | `schemas/resourcePermission.ts`                               |

**设计结论**：市场服务必须**完全自治**，不得依赖 LobeHub 的 workspace / RBAC / `resource_permissions`。组织、团队、授权、审核人全部由市场服务自建（见 §5）。

---

## 2. 术语

| 术语           | 含义                                                      |
| -------------- | --------------------------------------------------------- |
| Resource       | 市场资源，三类：`agent`（助理）、`skill`、`plugin`（MCP） |
| Scope          | 资源可见范围档位：`private` / `org` / `team` / `users`    |
| ACL            | 针对「指定人 / 指定团队」的例外授权记录                   |
| Submission     | 一次提交审核的动作                                        |
| Review         | IT 审核工单                                               |
| Trusted Client | 市场服务端与我方应用之间的 HMAC 签名认证方式              |
| Binding        | 资源安装到用户账号后形成的本地实例                        |

---

## 3. 总体架构

```text
┌──────────────────────────────────────────────────────────────┐
│  Browser (LobeHub SPA)                                       │
│  Community* 页面 / SkillStore / AgentMarketSubmission        │
└───────────────────────────┬──────────────────────────────────┘
                            │ tRPC (cookie session)
┌───────────────────────────▼──────────────────────────────────┐
│  youlin-v2-lobe（现有 Next.js 应用）                          │
│  ├─ apps/server/src/services/market  (MarketService)          │
│  └─ MarketSDK(0.42.0) ──MARKET_BASE_URL──┐                    │
└──────────────────────────────────────────┼───────────────────┘
                                           │ HTTPS + Trusted Client Token
┌──────────────────────────────────────────▼───────────────────┐
│  youlin-v2-market（本项目新建）                               │
│  ├─ /api/v1/agents      ├─ /api/v1/skills                     │
│  ├─ /api/v1/plugins     ├─ /api/v1/categories                 │
│  ├─ /api/v1/reviews     └─ /api/v1/orgs/...                   │
│  ├─ Auth (Trusted Client / 内部 token)                        │
│  ├─ Visibility Guard (scope + ACL)                            │
│  ├─ Upload (S3 presigned)                                     │
│  └─ Audit / Stats                                             │
└───────────┬───────────────────────┬───────────────────────────┘
            │                       │
    ┌───────▼────────┐      ┌───────▼────────┐
    │ PostgreSQL     │      │ rustfs (S3)    │
    │ market schema  │      │ 包体/图标      │
    └────────────────┘      └────────────────┘
```

### 3.1 关键约束：SDK 契约是黑盒

`@lobehub/market-sdk@0.42.0` 是压缩发布的客户端，服务端必须**逐字节匹配**其请求路径、查询参数、请求体字段与响应结构，否则前端出现 401 / 字段为空 / 页面崩溃。

**应对措施**：

1. 锁定 SDK 版本（`package.json` 精确版本，非 `^`）
2. 建立**契约测试**：用真实 SDK 对本地 mock 服务发起调用，断言请求与响应
3. 把 SDK 调用与业务实现之间保留一层 `MarketAdapter`，SDK 升级时只改适配层

---

## 4. 可见性模型

### 4.1 设计：`scope`（粗粒度）+ 授权表（细粒度）

#### 第一层：资源级 scope（P1 交付）

> 注意：自托管版无 workspace（见 §1.3），因此 **不使用** LobeHub 的 `workspace` 档；`team` 指市场服务自建的团队。

| scope     | 语义     | 可见主体                                 | 阶段 |
| --------- | -------- | ---------------------------------------- | ---- |
| `private` | 仅自己   | 创建者本人 + 市场管理员                  | P1   |
| `org`     | 全公司   | 所有已认证用户（**最高档，不允许匿名**） | P1   |
| `team`    | 指定团队 | 市场自建 `market_teams` 的成员           | P2   |
| `users`   | 指定人   | `market_resource_grants` 中的 user       | P2   |

> D2 落地：枚举中**不存在** `public`。数据库 CHECK 约束显式排除。

#### 第二层：授权表（P2 交付）

```text
market_resource_grants
  subject_type: 'user' | 'team'
  permission:   'read' | 'install' | 'manage'
  effect:       'allow' | 'deny'
```

用于表达「这条 private Skill 额外授权给张三、李四」或「对某人临时封禁」。`expires_at` 支持临时授权。

### 4.2 判定算法

```text
canAccess(resource, actor, permission):
  # 1. 市场管理员直通
  if actor.isMarketAdmin: return ALLOW

  # 2. 资源处于非可见状态时，仅 owner 与管理员可见
  if resource.status in ('draft','submitted','rejected'):
      return ALLOW if actor.userId == resource.ownerUserId else DENY

  # 3. 显式拒绝优先（P2）
  if existsGrant(resource, actor, 'deny'): return DENY

  # 4. 显式授权（P2）
  if existsGrant(resource, actor, permission): return ALLOW

  # 5. 创建者
  if actor.userId == resource.ownerUserId: return ALLOW

  # 6. scope 匹配
  switch resource.scope:
    'org':     return ALLOW if actor.isAuthenticated
    'team':    return ALLOW if actor.inAnyMarketTeamOf(resource)
    'users':   return DENY        # 仅靠第 4 步授权
    'private': return DENY

  return DENY
```

### 4.3 team scope 的落地细节（自建，不依赖 LobeHub）

```sql
-- 市场自建团队（与 LobeHub 的 workspace_teams 无关）
CREATE TABLE market_teams (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  identifier  TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE market_team_members (
  team_id  TEXT NOT NULL REFERENCES market_teams(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','lead')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE market_resource_teams (
  resource_id TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  team_id     TEXT NOT NULL REFERENCES market_teams(id) ON DELETE CASCADE,
  PRIMARY KEY (resource_id, team_id)
);
```

判定：`actor.inAnyMarketTeamOf(resource)` ⇔ 存在 `market_team_members(user_id=actor.userId, team_id IN resource.teams)`。

> 团队管理层级：首版只支持 `super_admin`（市场管理员）建团队并加人；成员自管理作为后续扩展。

### 4.4 实现要求（安全）

- **单一入口**：所有读取路径必须经过 `VisibilityGuard`，禁止在业务代码里散落 scope 判断
- **SQL 层过滤**：列表接口用 `WHERE` 条件过滤（先过滤后分页），禁止「先分页再过滤」
- **穿透测试**：为每条 scope 组合写越权用例（见 §12）

### 4.5 两级可见性（易踩坑）

| 层级           | 含义                         | 控制点                                                                     |
| -------------- | ---------------------------- | -------------------------------------------------------------------------- |
| 资源可见性     | 谁能浏览 / 安装              | `market_resources.scope` + `market_resource_grants`                        |
| 安装实例可见性 | 装到自己的账号后谁能**调用** | 复用现有 `agents` / `user_installed_plugins` / `agent_skills` 的 user 归属 |

> 自托管版无 workspace，安装实例默认归属**安装者账号**（`user_id`）。若后续启用单企业 workspace，再补 `installed_for_workspace_id`。

安装时需记录 `installed_by`、`granted_scope`，并允许安装后在**不超过资源 scope** 的前提下收紧。

---

## 5. 数据模型

### 5.1 资源主表

```sql
CREATE TABLE market_resources (
  id                  TEXT PRIMARY KEY,
  resource_type       TEXT NOT NULL CHECK (resource_type IN ('agent','skill','plugin')),
  identifier          TEXT NOT NULL,
  slug                TEXT NOT NULL,

  owner_user_id       TEXT NOT NULL REFERENCES users(id),
  owner_workspace_id  TEXT REFERENCES workspaces(id),

  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  summary             TEXT,
  icon                TEXT,
  category            TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',

  -- 可见范围：无 public（D2）
  scope               TEXT NOT NULL DEFAULT 'private'
                      CHECK (scope IN ('private','org','team','users')),

  -- 状态机
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','submitted','rejected','published','unpublished','archived')),

  latest_version_id   TEXT,
  latest_version_no   INTEGER NOT NULL DEFAULT 0,

  install_count       BIGINT  NOT NULL DEFAULT 0,
  fork_count          BIGINT  NOT NULL DEFAULT 0,
  rating_avg          NUMERIC(3,2),
  rating_count        INTEGER NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at        TIMESTAMPTZ,
  reviewed_at         TIMESTAMPTZ,
  published_at        TIMESTAMPTZ
);

-- 同一类型下 identifier 唯一（归档的不占位）
CREATE UNIQUE INDEX market_resources_type_identifier_uq
  ON market_resources (resource_type, identifier)
  WHERE status <> 'archived';

CREATE INDEX market_resources_browse_idx
  ON market_resources (resource_type, status, scope, published_at DESC);

CREATE INDEX market_resources_owner_idx ON market_resources (owner_user_id);
```

### 5.2 版本表

```sql
CREATE TABLE market_resource_versions (
  id             TEXT PRIMARY KEY,
  resource_id    TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  version_no     INTEGER NOT NULL,
  version_label  TEXT,

  -- 三类资源的完整快照（结构见 §5.5）
  payload        JSONB NOT NULL,

  changelog      TEXT,
  file_hash      VARCHAR(64),          -- sha256，Skill 包体
  file_size      BIGINT,
  storage_key    TEXT,                 -- S3 key

  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','submitted','rejected','published','archived')),

  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX market_versions_uq ON market_resource_versions (resource_id, version_no);
```

### 5.3 可见性授权（P2）

```sql
CREATE TABLE market_resource_grants (
  id            TEXT PRIMARY KEY,
  resource_id   TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('user','team')),
  subject_id    TEXT NOT NULL,
  permission    TEXT NOT NULL CHECK (permission IN ('read','install','manage')),
  effect        TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  granted_by    TEXT NOT NULL REFERENCES users(id),
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resource_id, subject_type, subject_id, permission)
);

CREATE INDEX market_resource_grants_subject_idx
  ON market_resource_grants (subject_type, subject_id);
```

配合 §4.3 的 `market_teams` / `market_team_members` / `market_resource_teams`。

### 5.4 审核（D3：单级审核，结构上支持多级）

```sql
CREATE TABLE market_reviews (
  id             TEXT PRIMARY KEY,
  resource_id    TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  version_id     TEXT NOT NULL REFERENCES market_resource_versions(id) ON DELETE CASCADE,

  -- 阶段：首版只有 'it'，预留扩展（security / legal / owner）
  stage          TEXT NOT NULL DEFAULT 'it',
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','cancelled')),

  assignee_id    TEXT REFERENCES users(id),
  reviewer_id    TEXT REFERENCES users(id),
  comment        TEXT,
  checklist      JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ
);

CREATE INDEX market_reviews_queue_idx
  ON market_reviews (stage, status, created_at);
```

#### 审核人来源（自托管版必需）

LobeHub 自托管版无 RBAC 角色分配（见 §1.3），**不能依赖 `super_admin`**。改为市场自管：

```sql
CREATE TABLE market_reviewers (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL DEFAULT 'it',
  granted_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

初始化两种手段（任选其一或同时）：

1. **环境变量白名单**（首启自举）：`MARKET_REVIEWER_EMAILS=it@company.com,ops@company.com`
2. **CLI 命令**：`youlin-market reviewer add --email it@company.com --stage it`

> 首位审核人在市场服务首次启动时由 `MARKET_REVIEWER_EMAILS` 写入，后续通过 CLI / 管理页维护。

> **扩展方式**：新增 `stage` 取值（如 `security`）+ 在 `market_reviews` 增加 `depends_on_review_id`，即可形成链路。首版不建链路表。

### 5.5 三类资源的 `payload` 结构

#### Agent

```jsonc
{
  "name": "客服助理",
  "description": "...",
  "avatar": "🎧",
  "category": "support",
  "tags": ["客服"],
  "config": {
    "model": "gpt-5.6-luna",
    "provider": "openai",
    "systemRole": "...",
    "params": { "temperature": 0.3 },
    "tools": ["plugin-id-1", "builtin:search"],
    "knowledgeBases": [],
  },
  "editorData": {/* 编辑器态 */},
  "defaultInputModes": ["text"],
  "defaultOutputModes": ["text"],
  "homepage": "https://wiki.internal/agents/support",
}
```

#### Skill

```jsonc
{
  "name": "weekly-report",
  "description": "生成周报",
  "summary": "从工单系统汇总周报",
  "icon": "📊",
  "category": "productivity",
  "license": "internal",
  "permissions": ["network:http:intranet"],
  "repository": "https://git.internal/skills/weekly-report",
  // SKILL.md 正文（本地 agent_skills.content 直接落库）
  "content": "---\nname: weekly-report\n---\n\n# 周报生成\n...",
  "resources": [{ "path": "scripts/collect.py", "fileHash": "sha256:...", "size": 1204 }],
  "manifest": {/* agent_skills.manifest 同构 */},
}
```

#### MCP Plugin

```jsonc
{
  "name": "jira-mcp",
  "description": "Jira 工具集",
  "icon": "🔷",
  "category": "devtools",
  "connectionType": "http", // http | sse | stdio
  // http / sse
  "url": "https://mcp.internal/jira/sse",
  "headers": { "Authorization": "Bearer ${JIRA_TOKEN}" },
  // stdio（D4 允许）
  "command": "npx",
  "args": ["-y", "@internal/jira-mcp@1.2.0"],
  "env": { "JIRA_URL": "https://jira.internal" },
  "tools": [{ "name": "create_issue", "description": "...", "inputSchema": {} }],
  "securityReview": {
    "networkAccess": ["mcp.internal"],
    "fileSystemAccess": false,
    "requiresSecrets": true,
  },
}
```

### 5.6 其它表

```sql
-- 安装记录（统计 + 可见性追溯）
CREATE TABLE market_installs (
  id                 TEXT PRIMARY KEY,
  resource_id        TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  version_id         TEXT NOT NULL,
  installed_by       TEXT NOT NULL REFERENCES users(id),
  target_workspace_id TEXT REFERENCES workspaces(id),
  local_instance_id  TEXT,               -- 落地后的 agents.id / identifier
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 评论 / 评分
CREATE TABLE market_comments (
  id           TEXT PRIMARY KEY,
  resource_id  TEXT NOT NULL REFERENCES market_resources(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id),
  rating       SMALLINT CHECK (rating BETWEEN 1 AND 5),
  content      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- 分类
CREATE TABLE market_categories (
  id            TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  key           TEXT NOT NULL,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (resource_type, key)
);

-- 审计（独立表，不复用 workspace_audit_logs：后者依赖 workspace_id）
-- 若未来启用单企业 workspace，可平滑合并（两边字段名已对齐）
--   id, workspace_id, user_id, action, resource_type, resource_id, metadata, ip_address, created_at）
CREATE TABLE market_audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id TEXT,
  actor_id     TEXT,
  action       TEXT NOT NULL,       -- resource.create / review.approve / plugin.invoke ...
  resource_type TEXT,
  resource_id  TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address   INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 6. 认证与鉴权

### 6.1 三种可用模式（选一）

| 模式                       | 适用                    | 复杂度 |
| -------------------------- | ----------------------- | ------ |
| **Trusted Client（推荐）** | 内部单体部署            | 低     |
| 内部 OIDC                  | 已有 IdP（Keycloak 等） | 中     |
| M2M client credentials     | 服务间调用              | 中     |

### 6.2 Trusted Client 落地

LobeHub 侧配置：

```bash
MARKET_BASE_URL=https://market.youlin.internal
MARKET_TRUSTED_CLIENT_ID=youlin-internal-market
# 注意：SDK 有 z.string().length(83) 校验，必须严格 83 字符
MARKET_TRUSTED_CLIENT_SECRET=<83 chars>
```

Token 由 `@lobehub/market-sdk` 的 `createTrustedClientToken` 生成，payload 含：

```ts
{ userId, email?, name? }   // 自托管版无 workspaceId（见 §1.3）
```

市场服务端校验：

```text
1. 解析 token，验签（使用同一 secret）
2. 检查 payload.userId 存在且非合成 id（eval_* / qstash_smoke_* 拒绝）
3. 若 payload.workspaceId 存在 → 查 workspace_members 确认成员有效
4. 注入 actor { userId, roles[], teams[] }
```

> `workspaceId` 与 LobeHub 的 `workspace:<workspaceId>` clerkId 约定对齐，天然支持「组织内可见」。

#### 6.2.1 secret 的自动生成（已验证可行）

**格式约束**（来自 SDK 源码 `utils/trustedClient.ts`）：

```text
CRYPTO.KEY_LENGTH = 32 bytes
SECRET_PREFIX     = "lobehub-market_tcs_"   (19 chars)
zod 约束          = z.string().length(83)
→ 83 = 19 + 64（32 字节 hex）
```

生成一行命令即可：

```bash
node -e "console.log('lobehub-market_tcs_'+require('crypto').randomBytes(32).toString('hex'))"
# 输出恰为 83 字符，直接通过 zod 校验
```

**三种落地方案对比：**

| 方案                          | 做法                                                                                  | 是否改代码      | 安全性                  | 推荐度               |
| ----------------------------- | ------------------------------------------------------------------------------------- | --------------- | ----------------------- | -------------------- |
| **A. init 容器生成 → 共享卷** | `market-keygen` 容器首次生成写入 named volume 的 `market.env`，两服务 `env_file` 挂载 | ❌ 不改         | 高（不落库）            | ⭐⭐⭐ **推荐**      |
| B. 生成后写数据库             | market 首启生成 → 写 `market_system_config`；主应用启动时 HTTP 拉取                   | ✅ 需改启动逻辑 | 中（DB 泄露即密钥泄露） | ⭐                   |
| C. 部署脚本生成写 `.env`      | `openssl rand` 写入 `.env`                                                            | ❌ 不改         | 高                      | ⭐⭐（需人工跑一次） |

> **不建议放业务数据库**：secret 用于给任意 `userId` 签发 trust token。DB 只读账号 + 备份泄露即可伪造管理员身份。

方案 A 的具体实现（`docker-compose` 片段）：

```yaml
market-keygen:
  image: busybox:latest
  volumes:
    - market-secrets:/secrets
  entrypoint: ['/bin/sh', '-c']
  command:
    - |
      if [ ! -f /secrets/market.env ]; then
        KEY="lobehub-market_tcs_$$(head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        printf 'MARKET_TRUSTED_CLIENT_ID=youlin-internal-market\nMARKET_TRUSTED_CLIENT_SECRET=%s\n' "$$KEY" > /secrets/market.env
        chmod 600 /secrets/market.env
      fi
  restart: 'no'
```

两侧服务追加：

```yaml
env_file:
  - /secrets/market.env # 经 volume 挂载
```

> 注意：`MARKET_TRUSTED_CLIENT_SECRET` 是**服务间共享密钥**，与用户登录无关，不应随用户登录生成。

### 6.3 权限串

复用 `packages/const/src/rbac.ts` 的 `resource:action:scope` 风格，新增：

```text
market:read          market:create       market:install
market:review        market:manage       market:visibility
```

**角色模型（自建，不依赖 LobeHub RBAC）**：

| 角色              | 来源                               | 能力                                               |
| ----------------- | ---------------------------------- | -------------------------------------------------- |
| `guest`（未登录） | —                                  | 无（全部拒绝）                                     |
| `user`            | 任意已认证用户                     | 浏览（scope 内）、安装、创建、提交、管理自己的资源 |
| `market_admin`    | `market_admins` 表（同 reviewers） | 审核、下架 / 删除他人资源、改他人可见范围、建团队  |

| 操作               | guest | user | market_admin | 创建者本人      |
| ------------------ | ----- | ---- | ------------ | --------------- |
| 浏览（scope 内）   | ❌    | ✅   | ✅           | ✅              |
| 安装               | ❌    | ✅   | ✅           | ✅              |
| 创建 / 提交        | ❌    | ✅   | ✅           | —               |
| 审核               | ❌    | ❌   | ✅           | ❌              |
| 下架 / 删除他人    | ❌    | ❌   | ✅           | 仅自己的        |
| 改可见范围（他人） | ❌    | ❌   | ✅           | 自己的（≤上限） |
| 建团队 / 加人      | ❌    | ❌   | ✅           | —               |

---

## 7. API 契约

> 全部挂在 `/api/v1`。响应必须与 SDK 的 TypeScript 类型一致（见 `@lobehub/market-sdk/dist/index.d.mts`）。

### 7.1 浏览侧（P0 必须）

| 方法 | 路径                                   | 用途                                                         |
| ---- | -------------------------------------- | ------------------------------------------------------------ |
| GET  | `/api/v1/agents`                       | 助理列表（`page`/`pageSize`/`category`/`q`/`sort`/`locale`） |
| GET  | `/api/v1/agents/:identifier`           | 助理详情                                                     |
| GET  | `/api/v1/agents/categories`            | 助理分类                                                     |
| GET  | `/api/v1/agents/onboarding-full`       | onboarding 推荐（当前 500 的接口）                           |
| GET  | `/api/v1/agents/:identifier/versions`  | 版本列表                                                     |
| POST | `/api/v1/agents/:identifier/fork`      | 安装 / 派生                                                  |
| GET  | `/api/v1/plugins`                      | MCP 列表（`connectionType` 过滤）                            |
| GET  | `/api/v1/plugins/:identifier`          | MCP 详情                                                     |
| GET  | `/api/v1/plugins/:identifier/manifest` | **MCP 清单（安装关键）**                                     |
| GET  | `/api/v1/plugins/categories`           | MCP 分类                                                     |
| GET  | `/api/v1/skills`                       | Skill 列表                                                   |
| GET  | `/api/v1/skills/:identifier`           | Skill 详情                                                   |
| GET  | `/api/v1/skills/:identifier/versions`  | 版本列表                                                     |
| GET  | `/api/v1/skills/categories`            | Skill 分类                                                   |
| GET  | `/api/v1/skill-collections`            | 合集列表                                                     |
| GET  | `/api/v1/agent-groups`                 | 助理组列表                                                   |
| GET  | `/api/v1/agent-groups/:id`             | 助理组详情                                                   |

### 7.2 发布侧（P2）

| 方法 | 路径                                    | 用途                       |
| ---- | --------------------------------------- | -------------------------- |
| POST | `/api/v1/{agents\|skills\|plugins}`     | 创建资源草稿               |
| PUT  | `/api/v1/{type}/:identifier`            | 修改元数据                 |
| POST | `/api/v1/{type}/:identifier/versions`   | 新增版本                   |
| POST | `/api/v1/{type}/:identifier/publish`    | 发布（内部触发提审）       |
| POST | `/api/v1/{type}/:identifier/unpublish`  | 下架                       |
| POST | `/api/v1/{type}/:identifier/archive`    | 归档                       |
| PUT  | `/api/v1/{type}/:identifier/visibility` | **改可见范围（扩展字段）** |

### 7.3 审核（P3）

| 方法 | 路径                                      | 用途                 |
| ---- | ----------------------------------------- | -------------------- |
| GET  | `/api/v1/reviews?stage=it&status=pending` | 审核队列             |
| POST | `/api/v1/reviews/:id/approve`             | 通过                 |
| POST | `/api/v1/reviews/:id/reject`              | 驳回（必填 comment） |
| GET  | `/api/v1/reviews/:id`                     | 审核详情             |

### 7.4 上传

| 方法 | 路径                      | 用途                                                |
| ---- | ------------------------- | --------------------------------------------------- |
| POST | `/api/v1/uploads/presign` | 取 S3 presigned PUT（返回 `key`/`url`/`expiresIn`） |
| POST | `/api/v1/uploads/commit`  | 提交已上传文件（校验 hash/size，绑定到版本）        |

### 7.5 统计 / 社交（P4）

```text
POST /api/v1/{type}/:identifier/install-count
POST /api/v1/{type}/:identifier/events
GET  /api/v1/{type}/:identifier/comments
POST /api/v1/{type}/:identifier/comments
GET  /api/v1/{type}/:identifier/rating-distribution
```

### 7.6 契约测试（强制）

每个端点在 CI 中至少一条用例：

```ts
// 用真实 SDK 调用我们自己的服务，断言请求形状与响应解析
const sdk = new MarketSDK({ baseURL: 'http://localhost:8789', trustedClientToken });
const res = await sdk.plugins.getPluginManifest('jira-mcp');
expect(res.connectionType).toBe('http');
```

---

## 8. 发布流程

### 8.1 通用状态机

```text
draft ──submit──▶ submitted ──approve──▶ published ──unpublish──▶ unpublished
  ▲                   │                                              │
  └──────reject───────┘                                              │
  └────────────────── republish ◀────────────────────────────────────┘

published ──archive──▶ archived（终态，释放 identifier）
```

**规则**：

1. `draft` 只有 owner 可见，可自由编辑
2. `submitted` 冻结内容，owner 不可改（避免审核后偷换）
3. 审核通过 → 资源 `published` + 版本 `published` + 更新 `latest_version_id`
4. 驳回 → 资源 `rejected` + `review.comment` 回显给提交者
5. 重提需新建版本（不复用已审版本）

### 8.2 助理（Agent）发布

```text
1. 本地已有 Agent（agents 表）
2. 点「发布到内部市场」→ 快照 config/editorData → 上传图标
3. 填写 name/description/category/tags/scope
4. 提交 → 创建 market_resources(draft) + version(1, submitted) + review(stage=it)
5. IT 审核通过 → published
6. 他人安装（fork）→ 本地 agents 表新增（source 标记为 market）
```

### 8.3 Skill 发布

```text
1. 上传 SKILL.md 或 zip（走 presign → commit）
2. 服务端解析 manifest（name/description/summary/icon/permissions）
3. 计算 sha256 与 file_size，落 market_resource_versions
4. 提交审核 → 通过 → published
5. 安装 → agent_skills 写入 content + resources + manifest
```

### 8.4 MCP 发布（D4 全范围）

```text
1. 选择连接类型：http / sse / stdio
2. http/sse：填 URL + headers（变量占位）
   stdio：填 command + args + env（变量占位 + 包来源）
3. 服务端做连通性探测（可选）+ 安全静态检查（见 §9）
4. 提交审核 → IT 人工确认清单 → 通过 → published
5. 安装 → user_installed_plugins.manifest 落库
```

---

## 9. MCP 全类型安全设计（D4 重点）

### 9.0 三种连接方式是什么

MCP（Model Context Protocol）是给 AI 提供外部工具的协议，三种传输方式决定了「工具跑到哪里」：

| 类型    | 运行位置       | 通信方式                          | 典型场景                           | 风险                                       |
| ------- | -------------- | --------------------------------- | ---------------------------------- | ------------------------------------------ |
| `http`  | 远程服务       | 流式 HTTP（MCP 新版标准）         | SaaS 工具、内部 API 网关           | 中（请求可被审计）                         |
| `sse`   | 远程服务       | HTTP + Server-Sent Events（旧版） | 同上                               | 中                                         |
| `stdio` | **本机子进程** | 标准输入 / 输出上的 JSON-RPC      | 读本地文件、执行命令、连内网数据库 | **高（等于在你服务器上跑一段第三方代码）** |

`stdio` 的工作方式示例：

```text
客户端（LobeHub）
   └─ spawn: npx -y @modelcontextprotocol/server-filesystem /data
        ├─ stdin  ← JSON-RPC 请求 {"method":"tools/list"}
        └─ stdout → JSON-RPC 响应
```

**意味着什么**：发布一个 `stdio` MCP，就是在向所有安装者分发「一段会在他们服务器上执行的代码」。能力最强（可读本地文件、跑命令），但风险也最高。因此 §9.2 的 10 条约束不是可选项。

> **若首版只需要「连内网服务」类 MCP（Jira、Confluence、数据库网关），`http` / `sse` 已足够，可先用 `MCP_ALLOW_STDIO=0` 关闭 stdio，把 P5 工期从 1 周压到 0.5 周。**

### 9.1 `http` / `sse`

| 控制      | 要求                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSRF 防护 | 禁止内网段（`10/8`、`172.16/12`、`192.168/16`）、`127/8`、`169.254/16`（含云元数据）、`::1`、`fc00::/7`；解析后校验 IP，防 DNS rebinding（解析与连接使用同一 IP） |
| 协议      | 仅 `https`（内网 http 需显式白名单）                                                                                                                              |
| TLS       | 强制校验证书，禁止跳过                                                                                                                                            |
| 超时      | 连接 5s / 请求 30s / 总 120s                                                                                                                                      |
| 大小      | 响应体 ≤ 2MB，工具列表 ≤ 500 项                                                                                                                                   |
| 重定向    | 禁止或最多 1 跳且必须同域                                                                                                                                         |

### 9.2 `stdio`

| 控制     | 要求                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------- |
| 执行位置 | **只能在受控 runner 内**（独立容器，非应用容器）                                                   |
| 网络     | 默认无网络；需要网络时走显式 egress 白名单                                                         |
| 文件系统 | 只读根 + 独立可写 tmp，禁止访问宿主路径                                                            |
| 资源限制 | CPU 1 核 / 内存 512MB / 进程数 64 / 单次调用 120s                                                  |
| 命令约束 | 只允许包管理器形式（`npx -y <pkg>@<version>`、`uvx <pkg>==<version>`），禁止裸 shell、禁止 `sh -c` |
| 包来源   | 白名单 registry（内部 npm / 官方）+ 版本锁定（禁止 `@latest`）                                     |
| 用户     | 非 root，`no_new_privileges`                                                                       |

### 9.3 审核清单（IT 必查项）

```jsonc
{
  "connectionType 与声明一致": true,
  "URL/命令解析到预期目标": true,
  "无内网/元数据地址": true,
  "stdio 命令为受控包管理器形式": true,
  "版本已锁定": true,
  "env/headers 无明文密钥": true,
  "工具清单无危险能力（写文件/执行命令）或已说明": true,
  "已记录网络访问范围": true,
}
```

### 9.4 运行时审计

每次 MCP 调用写 `market_audit_logs`：
`actor_id, resource_id, tool_name, connection_type, target(host 或 command), outcome, duration_ms`

### 9.5 安装时二次确认

前端安装 `stdio` 类型时必须展示：

- 将执行的命令
- 需要的环境变量
- 网络访问范围
- 确认按钮文案明确（「我了解该 MCP 将在受控环境中执行命令」）

---

## 10. 前端改造点

| 位置                                    | 改造                                                 |
| --------------------------------------- | ---------------------------------------------------- |
| `src/services/discover.ts`              | 无需改（走 market）                                  |
| `src/features/CommunityAgentList`       | 数据源切到内部市场；过滤掉 `public` 相关文案         |
| `src/features/CommunitySkillDetail`     | 增加「发布者 / 可见范围」展示                        |
| `src/features/SkillStore`               | 安装按钮接市场 API                                   |
| `src/features/AgentMarketSubmission`    | 补齐提交流程（scope 选择器、审核状态回显）           |
| 新增 `src/features/MarketPublishForm`   | 三类资源的发布表单（含 MCP 连接类型分支）            |
| 新增 `src/features/MarketReviewConsole` | IT 审核台（队列 / 详情 / 通过 / 驳回）               |
| 设置页                                  | 新增「内部市场」配置项（默认 scope、是否允许 stdio） |

**可见范围选择器**（P1）：`私有 / 工作区 / 指定团队 / 全员`
**指定人授权**（P2）：在资源详情页「管理可见性」→ 添加 user/team + 权限 + 到期时间

---

## 11. 部署

### 11.1 compose 新增服务

```yaml
market:
  image: ${MARKET_IMAGE:-youlin-market:dev}
  ports:
    - '127.0.0.1:33220:8789'
  environment:
    DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgresql:5432/lobehub_market
    S3_INTERNAL_ENDPOINT: http://rustfs:9000
    S3_BUCKET: market
    S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID}
    S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY}
    MARKET_TRUSTED_CLIENT_ID: ${MARKET_TRUSTED_CLIENT_ID}
    MARKET_TRUSTED_CLIENT_SECRET: ${MARKET_TRUSTED_CLIENT_SECRET}
    # MCP 运行时
    MCP_RUNNER_URL: http://mcp-runner:8790
    MCP_ALLOW_STDIO: '1'
    MCP_ALLOWED_REGISTRIES: registry.npmjs.org,registry.internal
    MCP_BLOCKED_CIDRS: 10.0.0.0/8,172.16.0.0/12,169.254.0.0/16
  depends_on:
    postgresql: { condition: service_healthy }
    rustfs-init: { condition: service_completed_successfully }
  restart: unless-stopped
```

主应用侧追加：

```yaml
MARKET_BASE_URL: http://market:8789
MARKET_TRUSTED_CLIENT_ID: ${MARKET_TRUSTED_CLIENT_ID}
MARKET_TRUSTED_CLIENT_SECRET: ${MARKET_TRUSTED_CLIENT_SECRET}
```

### 11.2 独立数据库

建议使用独立 database（`lobehub_market`），与主库物理隔离：

- 市场数据可独立备份 / 回滚
- 避免市场高频写入影响会话主库

### 11.3 项目结构

```text
apps/market/
├── src/
│   ├── index.ts                # Hono 入口
│   ├── middleware/
│   │   ├── auth.ts             # Trusted Client 校验
│   │   ├── visibility.ts       # VisibilityGuard（唯一判定入口）
│   │   └── audit.ts
│   ├── routes/
│   │   ├── agents.ts
│   │   ├── plugins.ts
│   │   ├── skills.ts
│   │   ├── categories.ts
│   │   ├── reviews.ts
│   │   └── uploads.ts
│   ├── services/
│   │   ├── resourceService.ts
│   │   ├── versionService.ts
│   │   ├── reviewService.ts
│   │   ├── uploadService.ts
│   │   ├── mcpSafety.ts        # SSRF / 命令校验
│   │   └── statsService.ts
│   ├── db/                     # drizzle schema + migrations
│   └── contracts/              # 与 SDK 类型对齐的 zod schema
└── test/
    ├── contract/               # 真实 SDK 契约测试
    ├── visibility/             # 越权穿透测试
    └── mcp-safety/
```

---

## 12. 测试策略

| 层级       | 覆盖                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| 契约测试   | 每个浏览端点用真实 SDK 调用，断言解析成功                              |
| 可见性穿透 | 4 种 scope × 6 种角色 × 3 种资源状态，全组合断言                       |
| 状态机     | draft→submit→approve→publish→unpublish→republish 全路径                |
| 权限边界   | 非 owner 改资源 / 非 reviewer 审核 /viewer 安装                        |
| MCP 安全   | SSRF（内网 / 元数据 / DNS rebinding）、stdio 命令注入、超时 / 资源限制 |
| 上传       | 超过大小限制、hash 不匹配、恶意文件类型                                |
| 性能       | 列表接口 P95 < 300ms（1 万资源）                                       |

---

## 13. 分阶段实施

| 阶段                                  | 交付内容                                                                         | 出口标准                       | 估时                |
| ------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------ | ------------------- |
| **P0 骨架**                           | 服务框架 + Trusted Client 认证（含 secret 自动生成）+ 三类浏览端点（数据手工灌） | 前端市场页能列出并安装手工数据 | 1 周                |
| **P1 可见性（scope）**                | `private` / `org` 两档 + VisibilityGuard + 列表 SQL 过滤                         | 越权用例全绿                   | 0.5 周              |
| **P2 UGC 创建**                       | 三类资源创建 / 版本 / 发布 + S3 上传                                             | 用户能提交草稿并进入审核       | 1.5 周              |
| **P2.5 指定人 / 团队（D1 第二阶段）** | `market_teams` + `market_resource_grants` + 管理 UI（scope 扩到 4 档）           | private 资源可定向共享         | 1 周                |
| **P3 审核**                           | 审核台（`market_reviewers` 自管）+ 单级链路（结构可扩展）                        | 审核通过后资源可被他人安装     | 0.5 周              |
| **P4 统计社交**                       | 安装数 / 评分 / 评论                                                             | 详情页数据完整                 | 0.5 周              |
| **P5 MCP 安全**                       | SSRF 防护 + 受控 runner（stdio）+ 审计                                           | 安全用例全绿                   | 1 周                |
| **P6 打磨验收**                       | 前端体验 + 文档 + 端到端                                                         | 全流程走通                     | 0.5 周              |
| **合计**                              |                                                                                  |                                | **≈6.5 周**（单人） |

> P5 与 P2 可并行；若首版先关闭 stdio（配置项 `MCP_ALLOW_STDIO=0`），P5 可压缩到 0.5 周。
> P1 因不依赖 workspace 反而变简单（只需两档 + 自建团队 / 授权表在 P2.5 补）。

---

## 14. 风险与缓解

| 风险                             | 等级 | 缓解                                                   |
| -------------------------------- | ---- | ------------------------------------------------------ |
| SDK 契约漂移导致升级后市场不可用 | 高   | 锁版本 + 契约测试 + MarketAdapter 隔离                 |
| stdio MCP 逃逸 / 滥用            | 高   | 受控 runner + 只读 FS + 无网络默认 + 命令白名单 + 审计 |
| 可见性越权                       | 高   | 单一 Guard 入口 + SQL 层过滤 + 穿透测试                |
| Skill 提示注入                   | 中   | 审核流 + `permissions` 声明 + 安装警告                 |
| 审核成为瓶颈                     | 中   | 审核 SLA + 批量操作 + 预留多级链路                     |
| 资源标识冲突                     | 低   | `(type, identifier)` 唯一 + 归档释放                   |

---

## 15. 待办清单（进入开发前）

### 已定（本轮确认）

- [x] D1 指定人授权：需要，分阶段（P2.5）
- [x] D2 匿名可见：不允许
- [x] D3 审核：所有资源必审；首版超管（`market_reviewers`）单级
- [x] D4 MCP：全类型支持（`stdio` 配受控 runner）
- [x] secret 自动生成：方案 A（init 容器 + 共享卷）
- [x] 不依赖 LobeHub workspace/RBAC（均为 cloud-only stub）

### 仍需确认

- [ ] 审核人邮箱（`MARKET_REVIEWER_EMAILS`）谁担任（首版 1–2 人）
- [ ] 独立数据库 `lobehub_market` 还是同库独立 schema
- [ ] MCP `stdio` 首版是否开启（建议先关，P5 再开）
- [ ] 资源 `identifier` 命名规则（仅英数连字符？是否允许中文）
- [ ] 默认可见范围（建议 `private`，防止误发布）
- [ ] 版本策略：是否支持回滚、是否允许历史版本共存安装
- [ ] 文件大小上限（Skill 包 / 图标）
- [ ] 审核通知渠道（站内 / 邮件 / 飞书 / 钉钉）
- [ ] 资源删除策略（软删 / 硬删 /identifier 是否释放）
- [ ] 市场 UI 入口（复用现有 Community 页 / 新增一级菜单「内部市场」）
- [ ] 单企业是否以后需要 workspace 隔离（若要，需自行实现而非依赖 Cloud 版）
