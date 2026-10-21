# 阶段一落地规划：让 `/community` 三个市场 tab 能装

> 配套文档：[`DESIGN.md`](./DESIGN.md)（第一部分为阶段一设计）・[`README.md`](./README.md)
> 工作区：`/home/ulyy/app/unionclinRag/unionclinHub-market`（分支 `feat/internal-market`）
> 本文只讲**怎么落地**，不讲为什么这样设计（设计理由见 DESIGN.md §1.0）

---

## 0. 一页看懂

### 要解决什么

本地 `/community` 的三个市场 tab（助理 / Skill / MCP）**列表能看、详情和安装失败**。

### 为什么

自托管部署只有 M2M 机器身份，官方市场对它只开放 "公开目录读"，**详情 /fork/ 下载都需要用户身份**。

### 怎么解决

建一个代理，采用「**定时快照 + 透传兜底**」：

- **定时快照**：后台按类型 / 分类抓取条目（含 `config`/`github`/`manifestUrl`），内存索引 + 磁盘持久化
- **5 个受限端点**由快照本地应答（详情 /fork/ 下载）
- **其余端点**透传官方；快照未覆盖时也透传并回填
- 应用侧只改 3 个环境变量，0 行代码

```text
LobeHub 应用  ──MARKET_BASE_URL──▶  market 代理  ──▶  官方 market.lobehub.com
（0 行代码改动）                     （定时快照 + 5 端点接管 + 透传兜底）  （M2M token）
```

### 工作量

| 里程碑 | 内容                                    | 估时        |
| ------ | --------------------------------------- | ----------- |
| M0     | 代理骨架 + M2M 自举 + 透传              | 1 天        |
| M1     | 助理链路（列表 / 详情 /fork）           | 1 天        |
| M2     | MCP 链路（列表 / 详情 /manifest）       | 1 天        |
| M3     | Skill 链路（列表 / 详情 /download 302） | 1.5 天      |
| M4     | 部署 + 端到端验收                       | 1 天        |
|        | **合计**                                | **≈5.5 天** |

---

## 1. 事实基线（全部实测，规划的前提）

### 1.1 官方市场对 M2M token 的权限边界

| 端点                                 | 结果                                    | 代理是否要接管                 |
| ------------------------------------ | --------------------------------------- | ------------------------------ |
| `GET /api/v1/agents`                 | ✅ 200，`totalCount=843`                | 否（入快照 + 透传兜底）        |
| `GET /api/v1/agents/categories`      | ✅ 200                                  | 否                             |
| `GET /api/v1/agents/onboarding-full` | ✅ 200（项内含 `config`）               | 否                             |
| `GET /api/v1/agents/:id/versions`    | ✅ 200                                  | 否                             |
| `POST /api/v1/agents/:id/fork`       | ❌ 401                                  | **是**                         |
| `GET /api/v1/plugins`                | ✅ 200，`totalCount=111982`             | 否（入快照 + 透传兜底）        |
| `GET /api/v1/plugins/categories`     | ✅ 200                                  | 否                             |
| `GET /api/v1/plugins/:id/manifest`   | ✅ 200（21 KB，含 `deploymentOptions`） | 否（独立缓存 24h）             |
| `GET /api/v1/plugins/:id`            | ❌ 401                                  | **是**                         |
| `GET /api/v1/skills`                 | ✅ 200，`totalCount=361315`             | 否（入快照 + 透传兜底）        |
| `GET /api/v1/skills/:id/versions`    | ✅ 200（**只含版本号**）                | 否                             |
| `GET /api/v1/skills/:id/comments`    | ✅ 200                                  | 否                             |
| `GET /api/v1/skills/:id`             | ❌ 401                                  | **是**                         |
| `GET /api/v1/skills/:id/download`    | ❌ 401                                  | **是**                         |
| `GET /lobehub-oidc/userinfo`         | ❌ 401                                  | 不需要（阶段一不依赖用户身份） |

### 1.2 列表项已含安装所需数据（决定性）

| 资源  | 列表项字段（实测）                                                                                                          | 安装所需      | 是否够      |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------- |
| 助理  | `identifier, name, config, avatar, category, tags, version, versionNumber, versions, forkCount, installCount, author, ...`  | `config`      | ✅ 在列表里 |
| Skill | `identifier, name, description, icon, category, github{url,stars,forks}, homepage, version, installCount, ratingCount, ...` | `github.url`  | ✅ 在列表里 |
| MCP   | `identifier, name, manifestUrl, connectionType, github{url}, toolsCount, haveCloudEndpoint, ...`                            | `manifestUrl` | ✅ 在列表里 |

### 1.3 分页与检索能力（决定快照策略）

| 能力                        | 实测结果                                               | 影响                         |
| --------------------------- | ------------------------------------------------------ | ---------------------------- |
| `pageSize` 上限             | **100**（500 报 400）                                  | 全量抓取需多次请求           |
| `agents` 的 `q` 搜索        | ✅ 精确命中                                            | 快照未命中时可用它回捞       |
| `plugins` 的 `q` 搜索       | ✅ 精确命中                                            | 同上                         |
| `skills` 的 `q` 搜索        | ❌ **不可靠**（模糊匹配，上限 500 条，目标常不在前列） | **Skill 靠快照，不能靠回捞** |
| `skills` 的 `category` 过滤 | ✅ 有效（`Backend` 仅 225 条）                         | 可按分类抓快照               |
| `skills` 全量规模           | 361315 条                                              | **不可全量快照**             |

### 1.3.1 ⚠️ M2M 视角下助理只有 843 条（必须知道的限制）

| 资源  | M2M 列表可见 | 分类统计（全站）               | 结论                    |
| ----- | ------------ | ------------------------------ | ----------------------- |
| 助理  | **843**      | \~31 万（`academic:18475` 等） | **代理最多能给 843 条** |
| Skill | 361315       | 361315                         | 一致                    |
| MCP   | 111982       | 111982                         | 一致                    |

**后果**：助理分类侧栏会显示 31 万，但点进去只有 843 条 —— **UI 数字与列表不一致**。
这是官方按资源类型给的差异化权限，代理无法绕过。

处理方案（三选一，建议 A）：

| 方案                   | 做法                                    | 代价             |
| ---------------------- | --------------------------------------- | ---------------- |
| **A（建议）** 接受差异 | 不做处理，文档记录                      | 用户会疑惑       |
| B 重写分类计数         | 代理按快照实际条数重算 `categoryCounts` | 与官方统计不一致 |
| C 隐藏分类侧栏         | 前端改造                                | 需改应用代码     |

### 1.4 token 获取方式（代理可自行复用）

```text
POST /api/v1/clients/register        （匿名，返回 client_id / client_secret）
POST /oauth/token
     grant_type=client_credentials
     client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
     client_assertion=<HS256 JWT: iss=sub=client_id, aud={BASE}/oauth/token, exp=5m>
→ { access_token, expires_in: 3600 }
```

已用脚本完整验证通过（见附录 A）。

---

## 2. 目标与非目标

### 目标（可验收）

| #   | 目标                                       | 验收方式                                            |
| --- | ------------------------------------------ | --------------------------------------------------- |
| G1  | 助理 tab：列表 → 详情 → Fork and Chat 成功 | 本地 `agents` 表新增记录，进入对话页                |
| G2  | MCP tab：列表 → 详情 → 安装成功            | `user_installed_plugins` 新增记录，工具可列出       |
| G3  | Skill tab：列表 → 详情 → 安装成功          | `agent_skills` 新增记录，`content` 有 SKILL.md 正文 |
| G4  | 应用侧零代码改动                           | `git diff` 主应用无变更                             |

### 非目标

- 用户上传、审核、可见范围（阶段二）
- 用户级 market 身份（OAuth user token）
- MCP stdio 安全加固（P5，`MCP_ALLOW_STDIO=0`）
- 公域内容的合规过滤（作为可选项 M2.5）

---

## 3. 架构

```text
┌────────────────────────────────────────────────────────────┐
│ LobeHub 应用（youlin-v2-lobe）                              │
│  MARKET_BASE_URL=http://market:8789                         │
│  MARKET_TRUSTED_CLIENT_ID / _SECRET                         │
└───────────────────────┬────────────────────────────────────┘
                        │ Bearer <trusted client token>（我方签发）
┌───────────────────────▼────────────────────────────────────┐
│ market 代理（apps/market，新建）                            │
│                                                             │
│  ┌─ 鉴权层 ─────────────────────────────────┐              │
│  │ 验证 trusted client token（已实现）       │              │
│  └───────────────────────────────────────────┘              │
│  ┌─ 路由分派 ───────────────────────────────┐              │
│  │ 快照命中 → 本地应答（列表/详情）          │              │
│  │ 快照缺失 → 透传官方 + 回填                │              │
│  │ 受限且无快照（download）→ 302 GitHub      │              │
│  └───────────────────────────────────────────┘              │
│  ┌─ 快照层（核心）──────────────────────────┐              │
│  │ 内存索引：byType / byCategory / byId      │              │
│  │ 磁盘快照：/data/snapshot-{type}.json      │              │
│  │ 定时刷新：启动全量 + 30min 增量           │              │
│  └───────────────────────────────────────────┘              │
│  ┌─ 上游客户端 ─────────────────────────────┐              │
│  │ M2M token 自举（1h，提前 5min 续期）      │              │
│  │ 列表抓取（pageSize ≤ 100）                │              │
│  └───────────────────────────────────────────┘              │
└───────────────────────┬────────────────────────────────────┘
                        │ M2M Bearer
                        ▼
              market.lobehub.com（官方）
                        │
                        └─▶ GitHub（Skill 下载的最终跳转目标）
```

### 3.1 五个必须接管的端点（快照优先）

| #   | 端点                              | 实现逻辑                                         | 数据来源                   |
| --- | --------------------------------- | ------------------------------------------------ | -------------------------- |
| 1   | `GET /api/v1/agents/:id`          | **快照按 id 直接命中** → 未命中用 `q` 回捞并回填 | 快照（已含 `config`）      |
| 2   | `GET /api/v1/plugins/:id`         | 快照命中 → 未命中用 `q` 回捞并回填               | 快照（已含 `manifestUrl`） |
| 3   | `GET /api/v1/skills/:id`          | 快照命中 → 未命中按分类扫快照 → 仍失败尝试 `q`   | 快照                       |
| 4   | `GET /api/v1/skills/:id/download` | 从快照取 `github.url` + 解析 branch → **302**    | 快照                       |
| 5   | `POST /api/v1/agents/:id/fork`    | 校验源在快照中 → 返回合法 `AgentForkResponse`    | 无需真实数据               |

> 与旧方案的关键区别：**详情不再依赖 “用户先看过列表”**。快照在启动时与定时任务中建立，深链访问也能命中。

---

## 4. 关键技术决策

### D1：代理自己注册 M2M client，不复用主应用的 token

| 方案                   | 说明                                                           | 取舍                                       |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| **A（选）** 代理自注册 | 启动时走 `clients/register` + `oauth/token`，独立维护 1h token | 与主应用解耦；官方若回收 client 只影响代理 |
| B 复用主应用 cookie    | 需读主应用 httpOnly cookie                                     | 耦合、跨进程不可行（cookie 在浏览器）      |

**缓存 client 凭据**：首次注册后落盘（`/data/m2m-client.json`），重启复用；失效时自动重注册。

### D2：快照优先，透传兜底（核心决策）

**三种候选模式对比**：

|              | A. 纯透传            | B. 全量快照       | **C（选）定时快照 + 透传兜底** |
| ------------ | -------------------- | ----------------- | ------------------------------ |
| 列表         | 转发官方             | 本地              | **本地优先，缺失时透传并回填** |
| 详情         | 转发（**401 失败**） | 本地 100%         | **本地命中（快照范围内）**     |
| 深链访问     | ❌                   | ✅                | ✅                             |
| 内容新鲜度   | 实时                 | 取决于周期        | 最差 30 分钟延迟               |
| 规模可行性   | —                    | Skill 33 万不可行 | ✅ 分类型控制                  |
| 行为可预测性 | —                    | 高                | **高**                         |

- **A 已被实测否掉**：详情 /fork/download 对 M2M 全部 401。
- **B 对 Skill 不可行**：33 万条 × \~4 KB ≈ 1.3 GB，且 3300 次请求会触发限流。
- **C 是被选方案**：快照保证确定性，透传保证覆盖面与新鲜度。

**执行规则**（所有端点适用）：

```text
① 快照命中     → 直接应答（毫秒级，不访问上游）
② 快照未命中：
   可读端点   → 透传官方 → 成功则回填快照
   受限端点   → 尝试回捞（agents/plugins 用 q）→ 失败则 404
③ 上游不可达   → 返回快照旧数据（stale），响应头带 x-snapshot-stale: true
```

### D3：快照范围分类型设定

| 资源  | M2M 可见总量 | 快照范围                   | 请求量           | 磁盘     | 详情命中率     |
| ----- | ------------ | -------------------------- | ---------------- | -------- | -------------- |
| 助理  | **843**      | **全量**                   | 9 次（100 / 页） | \~2 MB   | **100%**       |
| MCP   | 111982       | 每分类 top 100（70 分类）  | \~70 次          | \~10 MB  | 热门高，长尾低 |
| Skill | 361315       | 每分类 top 100（296 分类） | \~296 次         | \~120 MB | 约 3 万条覆盖  |

> 为什么不全量：33 万条 × \~4 KB ≈ 1.3 GB，且 3300 次请求会触发限流。

**超出快照范围的条目怎么办**：

| 场景                                   | 行为                                                     |
| -------------------------------------- | -------------------------------------------------------- |
| 列表翻到快照覆盖之外                   | 透传官方（可读）+ 写入快照                               |
| 详情为快照外条目（agents/plugins）     | `q` 精确回捞，成功则回填                                 |
| 详情为快照外条目（skills，`q` 不可靠） | 尝试分类扫描；仍失败 → `404 { error:'not_in_snapshot' }` |

### D4：Skill 下载 = 302 到 GitHub，不代理字节流

```text
GET /api/v1/skills/{id}/download
  → 从快照项取 github.url = https://github.com/{owner}/{repo}
  → 从 homepage 解析 tree/{branch}/{subdir}（可能缺省）
  → 302 Location: https://github.com/{owner}/{repo}/archive/refs/heads/{branch|main}.zip
```

| 方案                   | 优点                              | 缺点                            |
| ---------------------- | --------------------------------- | ------------------------------- |
| **A（选）** 302 重定向 | 零带宽、零存储、GitHub 直接出流量 | 客户端需能访问 GitHub（实测可） |
| B 代理转发字节         | 可审计、可缓存                    | 占带宽，需处理大文件与超时      |

**子目录场景**：整仓 zip 可能含多个 skill。若 `homepage` 带 `tree/{branch}/{subdir}`，在响应头附带 `x-skill-subdir` 供排查；解压定位仍由主应用 `importFromUrl` 完成（当前行为）。

### D5：快照生命周期

#### 建立（启动）

```text
1. 读磁盘快照 /data/snapshot-{agents,plugins,skills}.json
   → 存在则先装载（服务立即就绪，不等上游）
2. 后台异步执行全量/分类抓取
   → 成功后原子替换（写临时文件 → rename）
   → 失败保留旧快照，日志告警
3. 首启无快照时：/health 返回 { status:'ok', snapshot:'warming' }
```

#### 定时刷新

| 资源             | 周期        | 方式                    |
| ---------------- | ----------- | ----------------------- |
| 助理（全量 843） | **10 分钟** | 全量重抓（成本低）      |
| MCP（分类）      | **30 分钟** | 按分类并发 2，每类 1 页 |
| Skill（分类）    | **60 分钟** | 按分类并发 2，每类 1 页 |

#### 失效与降级

| 情况             | 行为                                           |
| ---------------- | ---------------------------------------------- |
| 刷新失败         | 继续用旧快照，记录 `snapshot.lastRefreshError` |
| 快照过期超过 24h | 继续服务，`/health` 标 `snapshot:'stale'`      |
| 快照文件损坏     | 启动时忽略并重建，不影响服务                   |
| 磁盘写入失败     | 内存快照仍可用，日志告警                       |

#### 索引结构（内存）

```ts
interface SnapshotStore {
  byId: Map<`${type}:${identifier}`, Item>; // 详情主索引
  byType: Map<type, Item[]>; // 列表分页源
  byCategory: Map<`${type}:${category}`, Item[]>;
  meta: { builtAt; refreshedAt; counts; lastRefreshError? };
}
```

---

## 5. 端点实现清单

### 5.1 列表类端点（快照优先，透传兜底）

| 方法 | 路径                                                        | 实现                               |
| ---- | ----------------------------------------------------------- | ---------------------------------- |
| GET  | `/api/v1/agents`                                            | 快照分页 → 快照无数据时透传并回填  |
| GET  | `/api/v1/agents/categories`                                 | 快照重算 + 可选叠加官方统计        |
| GET  | `/api/v1/agents/onboarding-full`                            | 快照中按 `isFeatured` 取；否则透传 |
| GET  | `/api/v1/agents/:id/versions`                               | 透传（官方 200）                   |
| GET  | `/api/v1/plugins`                                           | 快照分页 → 兜底透传                |
| GET  | `/api/v1/plugins/categories`                                | 透传                               |
| GET  | `/api/v1/plugins/:id/manifest`                              | 透传 + 独立缓存（24h）             |
| GET  | `/api/v1/skills`                                            | 快照分页 → 兜底透传                |
| GET  | `/api/v1/skills/categories`                                 | 透传                               |
| GET  | `/api/v1/skills/:id/versions`                               | 透传                               |
| GET  | `/api/v1/skills/:id/comments`                               | 透传                               |
| POST | `/api/v1/{type}/:id/{reportInstallation,reportCall,events}` | 透传，失败忽略                     |

> **快照分页 vs 透传分页的选择**：`useSnapshot=true`（默认）时从快照组装；若快照尚未建立（冷启动中）或请求页码超出快照范围，改走透传，并把结果回填快照。

### 5.2 接管端点（本地应答）

| 方法 | 路径                          | 响应构造                                                                  |
| ---- | ----------------------------- | ------------------------------------------------------------------------- |
| GET  | `/api/v1/agents/:id`          | 快照 `byId` → `AgentItemDetail`（含 `config`）；未命中用 `q` 回捞并回填   |
| GET  | `/api/v1/plugins/:id`         | 快照 `byId` → `PluginItemDetail`；未命中用 `q` 回捞并回填                 |
| GET  | `/api/v1/skills/:id`          | 快照 `byId` → `MarketSkillDetail`；未命中按 `byCategory` 扫描，仍失败 404 |
| GET  | `/api/v1/skills/:id/download` | 快照取 `github.url` → `302 Location: GitHub archive`                      |
| POST | `/api/v1/agents/:id/fork`     | 校验源在快照中 → 合成 `AgentForkResponse`                                 |

### 5.3 兜底

| 场景                      | 响应                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| 快照未命且回捞失败        | `404 { error: 'not_in_snapshot', hint: '请从列表页进入或稍后重试' }`  |
| 上游 5xx                  | 有快照返回快照（`x-snapshot-stale: true`），否则 `502`                |
| 上游 401（token 失效）    | 自动重注册一次，仍失败 → `503 { error: 'upstream_auth' }`             |
| GitHub 不可达（download） | `502 { error: 'github_unreachable', hint: '检查网络或改用代理转发' }` |

---

## 6. 里程碑

### M0：代理骨架（1 天）

| 交付物                                         | 文件                      |
| ---------------------------------------------- | ------------------------- |
| M2M 客户端（注册 + token + 自动续期 + 落盘）   | `src/upstream/m2m.ts`     |
| 官方 API 客户端（带 token 注入、超时、重试）   | `src/upstream/client.ts`  |
| **快照层**（内存索引 + 磁盘持久化 + 原子替换） | `src/snapshot/store.ts`   |
| **快照构建器**（全量 / 分类抓取 + 定时刷新）   | `src/snapshot/builder.ts` |
| 路由分派（快照命中 / 透传兜底）+ `/health`     | `src/routes/*`            |
| 鉴权接入（复用已完成的 auth 中间件）           | `src/index.ts`            |

**验收**：

```bash
curl -s localhost:8789/health
# → {"status":"ok","snapshot":{"agents":843,"plugins":7000,"skills":29600,"refreshedAt":"..."}}

# 列表走快照（不访问上游）
curl -s -H "Authorization: Bearer $TOK" "localhost:8789/api/v1/agents?pageSize=1"
# → 200，totalCount=843

# 重启后冷启动 < 2s（读磁盘快照，不等上游）
docker restart youlin-v2-market && time curl -s localhost:8789/health
```

### M1：助理链路（1 天）

| 交付物                       | 说明                         |
| ---------------------------- | ---------------------------- |
| 助理全量预抓任务             | 启动时 9 次请求抓完 843 条   |
| `GET /agents/:id` 接管       | 快照优先 + `q` 回捞并回填    |
| `POST /agents/:id/fork` 接管 | 返回合法 `AgentForkResponse` |

**验收**：

```bash
# 详情含 config
curl -s -H "Authorization: Bearer $TOK" localhost:8789/api/v1/agents/dan | jq '.config.systemRole'
# fork 返回 200
curl -s -X POST -H "Authorization: Bearer $TOK" -d '{"identifier":"t1","name":"t"}' \
  localhost:8789/api/v1/agents/dan/fork
# 前端：/community/agent → 详情 → Fork and Chat → 进入对话，agents 表新增
```

### M2：MCP 链路（1 天）

| 交付物                       | 说明                      |
| ---------------------------- | ------------------------- |
| `GET /plugins/:id` 接管      | 快照优先 + `q` 回捞并回填 |
| manifest 透传 + 独立缓存 24h | 上游 21 KB 响应           |

**验收**：

```bash
curl -s -H "Authorization: Bearer $TOK" localhost:8789/api/v1/plugins/microsoft-playwright-mcp | jq '.manifestUrl'
curl -s -H "Authorization: Bearer $TOK" localhost:8789/api/v1/plugins/microsoft-playwright-mcp/manifest | jq '.deploymentOptions[0].connection.type'
# 前端：/community/mcp → 详情 → 安装 → user_installed_plugins 新增
```

### M3：Skill 链路（1.5 天）

| 交付物                          | 说明                               |
| ------------------------------- | ---------------------------------- |
| `GET /skills/:id` 接管          | 缓存优先 + 分类扫描回捞（限 5 页） |
| `GET /skills/:id/download` 接管 | 302 到 GitHub archive              |
| 分类预热后台任务                | 296 分类 × top 100                 |

**验收**：

```bash
# download 返回 302
curl -sI -H "Authorization: Bearer $TOK" \
  "localhost:8789/api/v1/skills/shipstatic-plugin-publish-online/download" | grep -i location
# → location: https://github.com/shipstatic/plugin/archive/refs/heads/main.zip
# 前端：/community/skill → 详情 → 安装 → agent_skills 新增且 content 非空
```

### M4：部署与验收（1 天）

| 交付物              | 说明                                                       |
| ------------------- | ---------------------------------------------------------- |
| compose 服务定义    | `market` + `market-keygen`（secret 自举）                  |
| 主应用 3 个环境变量 | `MARKET_BASE_URL` / `MARKET_TRUSTED_CLIENT_ID` / `_SECRET` |
| 端到端脚本          | 三个 tab 各走一遍                                          |

**验收**：见 §7。

---

## 7. 端到端验收清单

**可复现验收**：

```bash
cd apps/market
COOKIE='better-auth.session_token=...' bash scripts/acceptance.sh | tee evidence/phase1-acceptance.log
# 期望：RESULT: 16 passed, 0 failed
```

脚本覆盖：health 免鉴权、无 token 401、三类列表、助理详情 (含 config)/fork、
MCP 详情 /manifest、Skill 详情 (content)/download 302、主应用 tRPC 链路、
**三类安装落库**（`agents` / `user_installed_plugins` / `agent_skills`）、应用侧零改动。

### 7.1 已知限制（实测）

| 限制                                | 数据                                                                                                                                        | 影响                                                          | 处理                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| **MCP 在 Web 端无法安装（结构性）** | MCP 详情页的 Install 控件被 `mcp/features/Sidebar/index.tsx:41` 的 `isDesktop` 条件排除：Web 构建只渲染 `ConnectionTypeAlert`（拷贝式配置） | **596 个插件在 Web 端全部无法一键安装**（与 http/stdio 无关） | 属应用侧限制，与「应用零改动」冲突；需产品决策（见 §7.3）    |
| MCP 连接方式分布（供决策参考）      | 596 个中 461 个 stdio-only、135 个 http/cloud                                                                                               | 即便放开 Web 安装控件，仍有 461 个只能桌面 / 本地装           | `/health.installable.plugins` 暴露；`MCP_ALLOW_STDIO=0` 不变 |
| 助理 M2M 可见量                     | 843 条（分类统计显示 31 万）                                                                                                                | 分类侧栏数字与列表不一致                                      | 记为官方权限差异，不伪造                                     |
| Skill 详情正文                      | 懒加载 GitHub `SKILL.md`（首次约 1-2s）                                                                                                     | 首次打开略慢                                                  | 拉到后回填快照                                               |
| 代理 IP 变化                        | `SSRF_ALLOW_IP_ADDRESS_LIST` 是静态 IP                                                                                                      | 重启后 Skill 安装可能失败                                     | 用脚本自检，见 §9.2 提示                                     |

### 7.3 待决策：MCP 在 Web 端安装

`/community/mcp` 的列表与详情都正常（596 条、manifest 可拉、`deploymentOptions` 齐全），
但**详情页没有 Install 按钮**：`Sidebar/index.tsx:41` 只在 `isDesktop` 时渲染 `ActionButton`，
Web 构建走 `ConnectionTypeAlert`（只提供 JSON 配置供拷贝）。

两个选项：

| 选项             | 改动                                               | 结果                                                             |
| ---------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| A. 放开 Web 安装 | 应用侧 1 处条件（`isDesktop` → 允许 web），约 1 行 | Web 端可直接装 http/cloud 类 MCP（135 个）                       |
| B. 接受现状      | 无                                                 | Web 端 MCP 只能看不能装；需把阶段一目标改为「助理 + Skill 可装」 |

代理侧无法绕过：安装入口由前端渲染决定，属于应用侧结构。

## 7.4 已如实记录的次要问题

`market.oidc.getUserInfo` 仍返回 500：代理已正确透传上游 `401`，但主应用
`getUserInfoWithTrustedClient()` 把非 2xx 抛成错误。前端 `fetchUserInfo` 捕获后降级为
`null`（`MarketAuthProvider.tsx:47-58`），**功能不受影响**，仅三个 tab 的控制台各有一条
`[MarketAuth] Error fetching user info`。消除它需要在代理侧伪造 OIDC userinfo 响应，
风险高于收益，故保留并披露。

## 7.2 原验收清单

| #   | 检查                           | 通过标准                                                  |
| --- | ------------------------------ | --------------------------------------------------------- |
| 1   | `curl localhost:8789/health`   | `{"status":"ok"}`，免鉴权                                 |
| 2   | 无 token 访问 `/api/v1/agents` | 401                                                       |
| 3   | 有 token 访问 `/api/v1/agents` | 200，`totalCount=843`                                     |
| 4   | 助理详情含 `config`            | `config.systemRole` 非空                                  |
| 5   | 助理 fork                      | 200 + 合法 `AgentForkResponse`                            |
| 6   | MCP 详情含 `manifestUrl`       | 非空                                                      |
| 7   | MCP manifest                   | 200，`deploymentOptions` 非空                             |
| 8   | Skill download                 | **302**，Location 指向 `github.com/.../archive/...zip`    |
| 9   | 前端助理 tab                   | 列表→详情→Fork and Chat→进入对话，`agents` 新增           |
| 10  | 前端 MCP tab                   | 列表→详情→安装→`user_installed_plugins` 新增，工具可见    |
| 11  | 前端 Skill tab                 | 列表→详情→安装→`agent_skills` 新增，`content` 含 SKILL.md |
| 12  | 模型 / 服务商 tab              | 仍正常（回归确认，本地数据不受影响）                      |
| 13  | 上游断开                       | 列表返回缓存内容（stale），不报 500                       |
| 14  | 应用侧                         | `git diff` 主应用无代码变更                               |

---

## 8. 测试策略

| 层级   | 内容                                                   | 工具       |
| ------ | ------------------------------------------------------ | ---------- |
| 单元   | M2M 续期、缓存 TTL/LRU、GitHub URL 解析                | vitest     |
| 契约   | 真实 `MarketSDK` 打本地代理，断言 5 个接管端点解析成功 | vitest     |
| 集成   | 代理 + 真实上游（只读），验证列表透传与详情接管        | 脚本       |
| 端到端 | 三个 tab 的列表→详情→安装                              | Playwright |
| 降级   | 断上游、错 token、GitHub 不可达                        | 脚本注入   |

**契约测试样例**：

```ts
const sdk = new MarketSDK({ baseURL: 'http://localhost:8789', trustedClientToken: token });
const detail = await sdk.agents.getAgentDetail('dan');
expect(detail.config).toBeTruthy(); // 接管端点必须给出 config
const list = await sdk.agents.getAgentList({ pageSize: 1 });
expect(list.totalCount).toBeGreaterThan(0);
```

---

## 9. 部署

### 9.1 compose 片段

```yaml
market:
  image: ${MARKET_IMAGE:-youlin-market:dev}
  ports: ['127.0.0.1:33220:8789']
  environment:
    MARKET_TRUSTED_CLIENT_ID: ${MARKET_TRUSTED_CLIENT_ID}
    MARKET_TRUSTED_CLIENT_SECRET: ${MARKET_TRUSTED_CLIENT_SECRET}
    UPSTREAM_MARKET_URL: https://market.lobehub.com
    M2M_STATE_PATH: /data/m2m-client.json
    CACHE_SKILL_PREWARM: '1'
    MCP_ALLOW_STDIO: '0'
  volumes: ['market-data:/data']
  depends_on: [gateway]
  restart: unless-stopped

market-keygen:
  image: busybox:latest
  volumes: ['market-secrets:/secrets']
  command:
    - |
      if [ ! -f /secrets/market.env ]; then
        KEY="lobehub-market_tcs_$$(head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        printf 'MARKET_TRUSTED_CLIENT_ID=youlin-internal-market\nMARKET_TRUSTED_CLIENT_SECRET=%s\n' "$$KEY" > /secrets/market.env
        chmod 600 /secrets/market.env
      fi
  restart: 'no'
```

### 9.2 主应用追加

```yaml
MARKET_BASE_URL: http://market:8789
MARKET_TRUSTED_CLIENT_ID: ${MARKET_TRUSTED_CLIENT_ID}
MARKET_TRUSTED_CLIENT_SECRET: ${MARKET_TRUSTED_CLIENT_SECRET}
# 必需：Skill 安装由主应用的 skillImporter 拉取代理的 download URL，而
# ssrf-safe-fetch 默认拒绝私有 IP（market 解析到 172.23.x）。填代理容器 IP。
SSRF_ALLOW_IP_ADDRESS_LIST: ${MARKET_SSRF_ALLOW_LIST}
```

> ⚠️ 漏配时 Skill 安装报 `Failed to fetch URL: ... private IP address`，
> `agent_skills` 不会新增记录。代理重启后 IP 可能变化：
> `docker inspect youlin-v2-market-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`

### 9.3 环境变量清单

| 变量                            | 必填 | 默认                         | 说明                                     |
| ------------------------------- | ---- | ---------------------------- | ---------------------------------------- |
| `MARKET_TRUSTED_CLIENT_ID`      | ✅   | —                            | 与主应用一致                             |
| `MARKET_TRUSTED_CLIENT_SECRET`  | ✅   | —                            | **严格 83 字符**                         |
| `UPSTREAM_MARKET_URL`           | —    | `https://market.lobehub.com` | 官方上游                                 |
| `M2M_STATE_PATH`                | —    | `/data/m2m-client.json`      | M2M 凭据落盘                             |
| `SNAPSHOT_DIR`                  | —    | `/data/snapshot`             | 快照持久化目录                           |
| `SNAPSHOT_AGENTS_INTERVAL`      | —    | `10m`                        | 助理全量刷新周期                         |
| `SNAPSHOT_PLUGINS_INTERVAL`     | —    | `30m`                        | MCP 分类刷新周期                         |
| `SNAPSHOT_SKILLS_INTERVAL`      | —    | `60m`                        | Skill 分类刷新周期                       |
| `SNAPSHOT_PER_CATEGORY`         | —    | `100`                        | 每分类抓取条数（上限 100）               |
| `SNAPSHOT_PREFETCH_CONCURRENCY` | —    | `2`                          | 分类抓取并发                             |
| `SNAPSHOT_ENABLED`              | —    | `1`                          | 关闭则退化为纯透传（详情将 401）         |
| `SKILL_DOWNLOAD_PROXY_MODE`     | —    | `redirect`                   | `redirect` / `stream`（GitHub 不可达时） |
| `MCP_ALLOW_STDIO`               | —    | `0`                          | 阶段一保持关闭                           |

---

## 10. 风险与应对

| 风险                                | 概率 | 影响                    | 应对                                                                           |
| ----------------------------------- | ---- | ----------------------- | ------------------------------------------------------------------------------ |
| 官方收紧 M2M 只读权限               | 中   | 列表都不可读 → 方案失效 | 缓存快照兜底；准备 "纯 GitHub 数据源" 备用方案（见 §11）                       |
| Skill 详情超出快照范围              | 中   | 深链访问 404            | 分类扫描 + `q` 回捞；404 带 `hint`；可调大 `SNAPSHOT_PER_CATEGORY`（上限 100） |
| 快照刷新被限流                      | 中   | 快照变旧但不影响可用    | 分类型错峰（10/30/60 分钟）+ 并发 2 + 指数退避                                 |
| 快照磁盘占用                        | 低   | 磁盘增长                | agents 2MB + plugins 10MB + skills 120MB ≈ 130MB，可接受；定期清理旧版本       |
| 助理仅 843 条与分类统计 31 万不一致 | 高   | 用户困惑                | 文档记录；可选按快照重算 `categoryCounts`                                      |
| `q` 搜索行为变更                    | 中   | agents/plugins 回捞失效 | 依赖缓存为主，`q` 为辅                                                         |
| GitHub 不可达                       | 低   | Skill 装不上            | `SKILL_DOWNLOAD_PROXY_MODE=stream` 切换为代理转发                              |
| 33 万条预热带宽 / 限流              | 中   | 启动慢或 429            | 每分类 1 页 + 并发 2 + 失败退避                                                |
| 官方限流                            | 中   | 列表 429                | 请求合并 + 本地 TTL 缓存 + 退避重试                                            |
| Skill 子目录定位错误                | 中   | 装上错误的 skill        | 解析 `homepage` 的 `tree/{branch}/{subdir}`；无法解析时回落到仓库根并记录日志  |

### 10.1 备用方案（若官方关闭 M2M 读）

| 方案          | 说明                                              | 代价                       |
| ------------- | ------------------------------------------------- | -------------------------- |
| 快照模式      | 部署时抓一次，之后只读本地快照                    | 内容不更新                 |
| GitHub 数据源 | 直接索引 GitHub 上的 skill/agent 仓库（无需官方） | 无法覆盖 market 特有元数据 |
| 官方凭据      | 采购 LobeHub Cloud M2M / 用户凭据                 | 商业依赖                   |

---

## 11. 待决事项（开工前需确认）

| #   | 事项                                | 建议默认                                      |
| --- | ----------------------------------- | --------------------------------------------- |
| 1   | Skill 预热范围                      | 296 分类 × top 100（约 3 万条）               |
| 2   | Skill 深链未命中的表现              | 404 + `hint: 请从列表进入`                    |
| 3   | 是否限制可见内容（白名单 / 黑名单） | 阶段一不做，阶段二引入                        |
| 4   | 代理是否落盘快照                    | 是（`/data/cache-snapshot.json`，重启免冷启） |
| 5   | 是否接管 `userinfo`                 | 否（阶段一不需要用户身份）                    |
| 6   | GitHub 下载模式                     | `redirect`（失败可切 `stream`）               |
| 7   | 每分类快照条数                      | 100（官方 pageSize 上限，也是单分类单页上限） |
| 8   | 助理分类计数不一致是否处理          | 不处理（保留官方统计）                        |
| 9   | 快照刷新是否在启动时阻塞            | 否（先读磁盘快照即就绪，后台刷新）            |

---

## 附录 A：M2M 自举验证脚本（已跑通）

```js
// 1) 注册
POST https://market.lobehub.com/api/v1/clients/register
  { clientName:'LobeHub Web', clientType:'web', deviceId:'x', platform:'t', version:'2.2.20' }
→ { client_id, client_secret }

// 2) HS256 client assertion
header  = base64url({ alg:'HS256', typ:'JWT' })
payload = base64url({ iss:client_id, sub:client_id,
                      aud:'https://market.lobehub.com/oauth/token',
                      iat:now, exp:now+300, jti:uuid })
sig     = HMAC-SHA256(`${header}.${payload}`, client_secret)

// 3) 换 token
POST https://market.lobehub.com/oauth/token
  grant_type=client_credentials
  client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
  client_assertion=<jwt>
→ { access_token, expires_in: 3600 }
```

实测输出：`register 200` → `token 200 (3600s)` → 列表 `200 (totalCount=843/361315/111982)`。

## 附录 B：Skill 下载 URL 解析规则

```text
输入：列表项 { github: { url }, homepage }
       github.url = "https://github.com/shipstatic/plugin"
       homepage   = "https://github.com/shipstatic/plugin/tree/main/skills/publish-online"

解析：
  owner/repo = shipstatic/plugin
  branch     = main            （来自 /tree/{branch}，缺省 main）
  subdir     = skills/publish-online（可选，记录到日志/响应头）

输出：
  302 Location: https://github.com/shipstatic/plugin/archive/refs/heads/main.zip
```

边界：`github.url` 缺失 → 404；`homepage` 非 GitHub → 用 `main` 分支。
