# 内部市场：开发文档

> 适用范围：unionclinHub（LobeHub fork）自托管部署
> 目标读者：后端 / 前端 / 运维
> 工作区：`/home/ulyy/app/unionclinRag/unionclinHub-market`（分支 `feat/internal-market`）

本文分两部分：

|              | 内容                                            | 状态         |
| ------------ | ----------------------------------------------- | ------------ |
| **第一部分** | 阶段 1：让 `/community` 五类 tab 可用           | **当前目标** |
| **第二部分** | 阶段 2：内部 UGC 市场（上传 / 审核 / 可见范围） | 后续排期     |

---

## 第一部分：阶段 1 —— 让 `/community` 可用

### 1.0 先读这一节：谁做什么、装到哪里

#### 1.0.1 现状核对：列表为什么有数据、详情和安装为什么失败

**你看到的 31 万 / 33 万 / 11 万条是真的**，不是幻觉。但它只证明了一件事：**读列表的权限是开放的**，不代表详情和安装可用。

##### 实测矩阵（用自托管自动注册的 M2M token 逐端点验证）

| 端点                                 | 结果                                    | 说明                        |
| ------------------------------------ | --------------------------------------- | --------------------------- |
| `GET /api/v1/agents`                 | ✅ 200，`totalCount=843`                | 列表可读                    |
| `GET /api/v1/agents/categories`      | ✅ 200                                  | 分类计数可读                |
| `GET /api/v1/agents/onboarding-full` | ✅ 200                                  | 精选推荐可读（含 `config`） |
| `GET /api/v1/skills`                 | ✅ 200，`totalCount=361315`             | **与你看到的 33 万一致**    |
| `GET /api/v1/skills/:id/versions`    | ✅ 200                                  | 版本可读                    |
| `GET /api/v1/plugins`                | ✅ 200，`totalCount=111982`             | **与你看到的 11 万一致**    |
| `GET /api/v1/plugins/:id/manifest`   | ✅ 200（21 KB，含 `deploymentOptions`） | **MCP 安装所需数据可读**    |
| `GET /api/v1/skills/:id`（详情）     | ❌ 401 `invalid_token`                  | 详情不可读                  |
| `GET /api/v1/plugins/:id`（详情）    | ❌ 401                                  | 详情不可读                  |
| `POST /api/v1/agents/:id/fork`       | ❌ 401                                  | **助理安装失败**            |
| `GET /api/v1/skills/:id/download`    | ❌ 401                                  | **Skill 安装失败**          |
| `GET /lobehub-oidc/userinfo`         | ❌ 401                                  | 无用户身份                  |

##### 为什么会这样

token 的来源是**自托管部署自动注册的 M2M client**（`src/services/discover.ts` → `registerClient` → `registerM2MToken`）：

```text
前端 injectMPToken()
  → 检查 cookie mp_token_status
  → 失效则：POST /api/v1/clients/register      （匿名可注册，返回 client_id/secret）
           POST /oauth/token (client_credentials + HS256 assertion)
           → 服务端把 access_token 写进 httpOnly cookie mp_token（1 小时）
```

解码你这个 `mp_token` 可以看到 `sub === client_id === web_xxx`，即 **机器身份，不是用户身份**。

官方市场的权限边界：

| 权限                                         | M2M client token | 用户 OAuth token |
| -------------------------------------------- | ---------------- | ---------------- |
| 读公开目录（列表 / 分类 /manifest/versions） | ✅               | ✅               |
| 读资源详情                                   | ❌               | ✅               |
| fork / 下载 / 上报                           | ❌               | ✅               |
| `userinfo` / 个人数据                        | ❌               | ✅               |

**结论**：自托管部署拿不到用户级 token，因此「详情」和「安装」在官方市场这条路上**走不通**。这就是你需要自建代理的根本原因。

##### 但有个决定性好消息：列表项已包含安装所需的全部数据

实测列表返回的字段（`pageSize=1` 的单项）：

| 资源      | 列表项关键字段                                                                                                | 是否够安装                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **助理**  | `identifier, name, config, avatar, category, tags, version, versionNumber, versions, forkCount, installCount` | ✅ **`config` 就在列表里**（systemRole / 模型 / 参数），安装必需的全部内容 |
| **Skill** | `identifier, name, description, icon, category, github{url,stars,forks}, homepage, version, installCount`     | ✅ **`github.url` 就在列表里**，可直接构造下载地址                         |
| **MCP**   | `identifier, name, manifestUrl, connectionType, github{url,...}, toolsCount, ...`                             | ✅ **`manifestUrl` 就在列表里**，且 manifest 本身 200 可读                 |

所以代理不需要另找数据源：**用 M2M 拉一次列表，就能本地应答详情和安装**。这让整个方案从 "重建一个市场" 降级为 "一个带缓存的应答层"。

##### 一个需要处理的细节：Skill 可能在仓库子目录

```jsonc
// 实测两条 skill 列表项
{
  "identifier": "shipstatic-plugin-publish-online",
  "github": { "url": "https://github.com/shipstatic/plugin" },
  "homepage": "https://github.com/shipstatic/plugin/tree/main/skills/publish-online",
}
//                                        ↑ branch=main, 子目录=skills/publish-online
```

- `github.url` 只到仓库根
- `homepage` 里带 `tree/{branch}/{subdir}`，可解析出分支与子目录
- 下载整仓 zip 可能包含多个 skill，需要按 `subdir` 定位；解析不到就按仓库根处理

#### 1.0.2 三个角色，各负责什么

先明确一个前提：**LobeHub 应用本身已经具备全部能力**（列表页、详情页、安装按钮、写库逻辑、Skill/MCP 运行时）。缺的只是 "市场能正确应答那几个受限端点"。

| 角色             | 是什么                             | 阶段 1 具体要做什么                                                                                                              | 写代码        |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **LobeHub 应用** | 前端 SPA + Next.js + tRPC + 数据库 | **只改 3 个配置项**：`MARKET_BASE_URL` 指向代理、`MARKET_TRUSTED_CLIENT_ID`、`MARKET_TRUSTED_CLIENT_SECRET`                      | ❌ 0 行       |
| **market 代理**  | 新建的薄应答层（`apps/market`）    | ① 用 M2M token 拉列表并按类型缓存（含 `config`/`github`/`manifestUrl`）；② 对 **5 个受限端点**做本地应答；③ 其余端点直接透传官方 | ✅ 全部在这里 |
| **你**           | 运维 / 决策                        | ① 部署代理并配好 3 个环境变量；② 验收三个 tab 的列表→详情→安装；③ 决定是否限制可见内容（白名单）                                 | ❌ 不需要     |

##### 代理为什么只需要 5 个端点

因为其余端点用 M2M token 已经 200（实测见 §1.0.1）。真正要补的只有：

| #   | 端点                              | 官方行为 | 代理怎么做                    | 数据从哪来                     |
| --- | --------------------------------- | -------- | ----------------------------- | ------------------------------ |
| 1   | `GET /api/v1/agents/:id`          | 401      | 从缓存的列表项返回            | 列表项**已含 `config`**        |
| 2   | `GET /api/v1/skills/:id`          | 401      | 从缓存的列表项返回            | 列表项（含 `github`）          |
| 3   | `GET /api/v1/skills/:id/download` | 401      | **302 到 GitHub archive zip** | 列表项的 `github.url`          |
| 4   | `GET /api/v1/plugins/:id`         | 401      | 从缓存的列表项返回            | 列表项（含 `manifestUrl`）     |
| 5   | `POST /api/v1/agents/:id/fork`    | 401      | 返回结构合法的成功响应        | 无需真实配置（配置来自端点 1） |

> 注意第 5 条：`AgentForkResponse` 本身不含 `config`，真正配置来自详情端点。所以 fork 只要返回合法结构即可，不用维护副本。

**一句话**：应用侧零改动；代理侧只需要 "一次列表抓取 + 5 个本地应答"；你的工作是部署与验收。

#### 1.0.3 「安装」到底装到哪里

这是最容易误解的一点。**三类资源全部装进 LobeHub 自己的数据库**，不是装到市场服务端，也不是装到你的浏览器。

| 资源  | 安装后落库的表           | 内容                                                 | 归属         | 谁能用               |
| ----- | ------------------------ | ---------------------------------------------------- | ------------ | -------------------- |
| 助理  | `agents`                 | 系统角色、模型、参数、引用插件                       | 当前登录用户 | 安装者及其助理列表   |
| Skill | `agent_skills`           | `content`（SKILL.md 正文）+ `manifest` + `resources` | 当前登录用户 | 安装者可在对话中启用 |
| MCP   | `user_installed_plugins` | `manifest`（连接方式 / 工具列表）+ 配置              | 当前登录用户 | 安装者可调用其工具   |

对应的数据库：`lobehub`（主库，**不是** `lobehub_market`）。

所以 “安装” 的本质是：

```text
市场返回一份内容或一份 URL
        ↓
主应用下载 / 组装
        ↓
写入自己的数据库
        ↓
用户立即可以使用
```

市场服务**不存储任何用户安装状态**，它只在安装那一刻提供一次数据（或一个跳转地址）。

#### 1.0.4 四个动作、四条链路

| 动作              | 谁发起     | 当前状态（实测）                                | 需要谁补           | 落到哪              |
| ----------------- | ---------- | ----------------------------------------------- | ------------------ | ------------------- |
| **看列表**        | 前端列表页 | ✅ **已可用**（M2M 可读 843 / 361315 / 111982） | 不需要             | —                   |
| **看分类 / 筛选** | 前端侧栏   | ✅ 已可用                                       | 不需要             | —                   |
| **看详情**        | 前端详情页 | ❌ 401（skill/plugin）、助理靠列表项自给        | **代理端点 1/2/4** | —                   |
| **安装**          | 详情页按钮 | ❌ 401（fork / download）                       | **代理端点 3/5**   | 主应用 `lobehub` 库 |
| **使用**          | 用户       | ⛔ 卡在安装                                     | 市场**完全不参与** | 本地运行时          |

##### 为什么 "使用" 阶段市场不参与

```text
安装完成 = 数据已写入主应用数据库
        ↓
对话 / 技能调用 / MCP 工具调用 → 全部读本地库 + 本地运行时
        ↓
市场宕机、token 过期、网络中断 → 已安装内容照常工作
```

这也意味着：**只要装成功一次，后续不依赖市场**。

关键认识：**安装之后，市场就完全不参与了**。使用阶段完全依赖主应用自己的数据库与运行时。这也意味着：市场挂了不影响已安装的东西。

接下来各节把三条链路逐段展开（§1.4 助理 / §1.5 Skill / §1.6 MCP）。

### 1.1 目标与验收

`http://localhost:33210/community` 页面的五个 tab 全部可用：**助理 / Skill / MCP / 模型 / 模型服务商**。

每个 tab 必须满足三件事：

1. **列表能加载** —— 不报 401/500，不空白
2. **详情能打开** —— 点击条目进入详情页，内容正常
3. **安装能成功** —— 点「安装 / Fork and Chat」后，本地真的能用

不做：用户上传、审核、可见范围、统计评论（属阶段 2）。

### 1.2 五个 tab 的数据来源

读代码后的结论：**模型与服务商根本不走市场**，数据来自本地 `model-bank`。

| tab               | 前端服务层                        | 服务端实现                           | 数据来源                                         | 需要市场吗 |
| ----------------- | --------------------------------- | ------------------------------------ | ------------------------------------------------ | ---------- |
| 模型 `model`      | `discoverService.getModelList`    | `discoverService._getRawModelList()` | `loadBuiltinModels()`（本地）                    | ❌         |
| 服务商 `provider` | `discoverService.getProviderList` | `discoverService._getProviderList()` | `loadBuiltinModels()` + `modelProviders`（本地） | ❌         |
| 助理 `agent`      | `discoverService.getAssistant*`   | `MarketSDK.agents.*`                 | `market.lobehub.com`                             | ✅         |
| Skill `skill`     | `discoverService.getSkill*`       | `MarketSDK.marketSkills.*`           | `market.lobehub.com`                             | ✅         |
| MCP `mcp`         | `discoverService.getMcp*`         | `MarketSDK.plugins.*`                | `market.lobehub.com`                             | ✅         |

→ **真实工作量只在 agent /skill/mcp 三个 tab**。模型与服务商应当本来就正常；若异常，属另一个 bug，不在本范围。

### 1.3 一次请求怎么走（通用机制）

所有市场 tab 共享同一条调用链，只有最末端的数据源不同：

```text
浏览器（SPA）
  │ ① discoverService.getXxx()                  src/services/discover.ts
  ▼
tRPC lambda（主应用 Next.js / Hono）
  │ ② apps/server/src/routers/lambda/market/*.ts
  │     └─ ctx.marketSDK / ctx.marketService
  ▼
@lobehub/market-sdk 0.42.0
  │ ③ 读取 process.env.MARKET_BASE_URL（默认 https://market.lobehub.com）
  │     Authorization: Bearer <trusted client token>
  ▼
【本阶段新增】market 代理服务  ← MARKET_BASE_URL 指向这里
  │ ④ 验签 + 从公域源取数 + 映射成 SDK 契约
  ▼
公域源（npmmirror / chat-plugins / GitHub）
```

**关键点**：主应用一行代码都不用改。只把 `MARKET_BASE_URL` 换成代理地址，并把同一对 `MARKET_TRUSTED_CLIENT_ID/SECRET` 配给代理，整条链就接上了。

> 鉴权机制、secret 格式（83 字符）、AES-256-GCM 加解密已在 `apps/market/src/middleware/auth.ts` 实现，19 个测试覆盖有效 / 篡改 / 过期 / 合成 id/clientId 不匹配。

---

### 1.4 助理（Agent）全链路

#### 1.4.1 列表：怎么获取

```text
CommunityAgentList
  → discoverService.getAssistantList({ page, pageSize, category, q, sort, order, locale })
  → tRPC market.getAssistantList
  → MarketSDK.agents.getAgentList() → GET {MARKET_BASE_URL}/api/v1/agents?...
```

**代理实现**：拉公域索引，映射成 `AgentListResponse`。

```text
GET https://registry.npmmirror.com/@lobehub/agents-index/v1/files/public/index.en-US.json
→ { schemaVersion: 1, agents: [ { identifier, author, createdAt, homepage,
      knowledgeCount, pluginCount, tokenUsage,
      meta: { title, description, avatar, tags, category } } ] }   // 实测 505 条 / 236 KB
```

代理侧分页、筛选、排序都在内存里做（505 条体量很小），不必回源多次。

**响应契约**（`AgentListResponse`）：

```ts
{
  currentPage: number;
  items: AgentItem[];        // extends MarketItemBase
  pageSize: number;
  totalCount: number;
  totalPages: number;
  categoryCounts?: CategoryItem[];   // [{ category, count }]
}
```

#### 1.4.2 详情：怎么获取

```text
CommunityAgentDetail（路由 /community/agent/:slug）
  → useDiscoverStore.useFetchAgentDetail({ identifier })
  → tRPC market.getAssistantDetail
  → MarketSDK.agents.getAgentDetail() → GET {MARKET_BASE_URL}/api/v1/agents/:identifier
```

**代理实现**：拉该条目详情 JSON。

```text
GET .../public/{identifier}.en-US.json
→ { identifier, meta, author, homepage, summary, examples,
    config: { systemRole, openingMessage, openingQuestions },
    knowledgeCount, pluginCount, tokenUsage }
```

响应契约是 `AgentItemDetail`：`MarketItemBase` + `avatar`、`config: Record<string, unknown>`、`description`、`createdAt` 等必填字段。

> **这是安装的关键前提**：`AgentItemDetail.config` 会被详情页上下文持有，安装时直接拿来创建本地 agent（见下）。

#### 1.4.3 安装：fork + 本地创建（不需要代理返回配置）

安装按钮在 `src/routes/(main)/community/(detail)/agent/features/Sidebar/ActionButton/ForkAndChat.tsx`，七步：

| 步骤 | 动作                                                                                                                   | 落点                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | `agentService.getAgentByForkedFromIdentifier(identifier)`                                                              | 本地查重，已 fork 过就直接跳转                                                         |
| 2    | `marketApiService.forkAgent([{ sourceIdentifier, identifier: newId, name, status:'published', visibility:'public' }])` | → tRPC `market.agent.forkAgent` → `POST {MARKET}/api/v1/agents/:sourceIdentifier/fork` |
| 3    | 取**详情页已加载的 `config`** + `editorData` + `meta`                                                                  | 内存                                                                                   |
| 4    | `createAgent({ config: {...config, marketIdentifier, params.forkedFromIdentifier } })`                                 | **写本地 `agents` 表**                                                                 |
| 5    | `discoverService.reportAgentEvent({ event:'add' })`                                                                    | 计数上报（可失败）                                                                     |
| 6    | `ensureAgentMarketSkillsAndWarn(config.plugins)`                                                                       | 安装该 agent 引用的 market skill（非阻塞）                                             |
| 7    | `navigate(AGENT_CHAT_URL(agentId))`                                                                                    | 跳转对话                                                                               |

**核心洞察**：fork 接口**不返回 agent 配置**。看 `AgentForkResponse` 类型：

```ts
{
  agent: {
    (id, identifier, name, ownerId, forkedFromAgentId, createdAt, updatedAt);
  }
  source: {
    (agentId, identifier, versionNumber);
  }
  version: {
    (id, agentId, versionNumber, createdAt);
  }
}
```

真正的 `config` 来自第 3 步用的**详情端点响应**。所以代理的 fork 端点只需要：

1. 校验入参（`sourceIdentifier` 必须存在）
2. 返回结构合法的 `AgentForkResponse`（id 用自增 / 哈希即可）
3. 记录安装计数（可选）

**这让助理代理实现量极小** —— 不需要在多处维护 agent 配置副本。

#### 1.4.4 代理需要实现的助理端点

| 方法 | 路径                                  | 返回                        | 说明                                                  |
| ---- | ------------------------------------- | --------------------------- | ----------------------------------------------------- |
| GET  | `/api/v1/agents`                      | `AgentListResponse`         | 支持 `page/pageSize/category/q/sort/order/locale`     |
| GET  | `/api/v1/agents/categories`           | `CategoryItem[]`            | 内存分组计数                                          |
| GET  | `/api/v1/agents/:identifier`          | `AgentItemDetail`           | 含 `config`，安装依赖它                               |
| GET  | `/api/v1/agents/:identifier/versions` | 版本数组                    | 公域无版本 → 返回单条 v1                              |
| POST | `/api/v1/agents/:identifier/fork`     | `AgentForkResponse`         | 结构合法即可，不需真实配置                            |
| GET  | `/api/v1/agents/onboarding-full`      | `Record<string, unknown[]>` | onboarding 推荐位（当前报 500 的那个），取索引前 N 条 |

#### 1.4.5 助理字段映射

| 契约字段                  | 公域来源                                     | 备注                                    |
| ------------------------- | -------------------------------------------- | --------------------------------------- |
| `identifier`              | `agent.identifier`                           | —                                       |
| `name`                    | `meta.title`                                 | —                                       |
| `description`             | `meta.description`                           | 必填，空串兜底                          |
| `icon`                    | `meta.avatar`                                | 可能是 emoji 或 URL                     |
| `category`                | `meta.category`                              | —                                       |
| `tags`                    | `meta.tags`                                  | 数组                                    |
| `author`                  | `agent.author`                               | —                                       |
| `homepage`                | `agent.homepage`                             | —                                       |
| `createdAt` / `updatedAt` | `agent.createdAt`                            | 只有日期 → 补 `T00:00:00Z`              |
| **`manifestUrl`**         | **构造** `{self}/api/v1/agents/{identifier}` | 契约必填 string，前端不消费助理的该字段 |
| `config`（仅详情）        | `config` 直传                                | 安装时被复制到本地 agent                |

---

### 1.5 Skill 全链路

#### 1.5.1 列表 / 详情

```text
CommunitySkillList / CommunitySkillDetail
  → discoverService.getSkillList / getSkillDetail
  → tRPC market.skill.getSkillList / getSkillDetail
  → MarketSDK.marketSkills.* → GET {MARKET}/api/v1/skills?...
```

官方接口实测返回 `401 Missing bearer token`，且**没有任何公域索引**（npmmirror /chat-plugins 均 404）。

→ 所以列表与详情由**我们的代理自给**，数据来自自建索引。

#### 1.5.2 安装：只靠一个 download URL

这是阶段 1 最重要的发现。服务端实现（`apps/server/src/routers/lambda/agentSkills.ts`）：

```ts
importFromMarket: skillWriteProcedure
  .input(z.object({ identifier: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Get download URL from market service
    const downloadUrl = ctx.marketService.getSkillDownloadUrl(input.identifier);
    // Import using the download URL
    return await ctx.skillImporter.importFromUrl(
      { url: downloadUrl },
      { identifier: input.identifier, source: 'market' },
    );
  }),
```

而 `getSkillDownloadUrl` 只是拼 URL：

```ts
// MarketSDK.marketSkills.getDownloadUrl
`${baseUrl}/api/v1/skills/${encodeURIComponent(identifier)}/download[?version=X]`;
```

**完整安装链路**：

```text
CommunitySkillDetail/Header.tsx  InstallButton
  │ ① agentSkillService.importFromMarket(identifier)
  ▼
tRPC agentSkills.importFromMarket
  │ ② 拼出 downloadUrl = {MARKET}/api/v1/skills/:identifier/download
  ▼
ctx.skillImporter.importFromUrl({ url: downloadUrl })
  │ ③ HTTP GET 下载 zip
  ▼
【本阶段新增】market 代理
  │ ④ 302 重定向到 https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip
  ▼
GitHub 返回 zip → 解压 → 解析 SKILL.md → 写 agent_skills 表
```

**关键**：`identifier` 就是 GitHub 坐标（`github.owner.repo`），这是 LobeHub 的既有约定（SDK 文档注释里直接以 `github.owner.repo` 举例）。

#### 1.5.3 代理需要实现的 Skill 端点

| 方法 | 路径                                  | 返回                      | 说明                        |
| ---- | ------------------------------------- | ------------------------- | --------------------------- |
| GET  | `/api/v1/skills`                      | `MarketSkillListResponse` | 自建索引分页                |
| GET  | `/api/v1/skills/categories`           | `CategoryItem[]`          | 索引分组                    |
| GET  | `/api/v1/skills/:identifier`          | `MarketSkillDetail`       | 详情 + `manifestUrl`        |
| GET  | `/api/v1/skills/:identifier/download` | **302**                   | 重定向到 GitHub archive zip |

**索引文件长这样**（自建，与公域索引同构）：

```jsonc
{
  "schemaVersion": 1,
  "skills": [
    {
      "identifier": "github.anthropics/skills",
      "name": "Anthropic Skills",
      "description": "官方技能集合",
      "icon": "🧠",
      "category": "general",
      "tags": ["official"],
      "github": { "owner": "anthropics", "repo": "skills", "branch": "main" },
      "createdAt": "2026-01-01T00:00:00Z",
    },
  ],
}
```

**下载重定向规则**：`/{owner}/{repo}/archive/refs/heads/{branch ?? 'main'}.zip`

> 若仓库私有或需要限流，可改为代理转发（服务端拉取后 stream 给客户端），URL 形状不变。

#### 1.5.4 索引内容的三种来源

| 方式                       | 说明                                                                       | 适用             |
| -------------------------- | -------------------------------------------------------------------------- | ---------------- |
| **人工白名单（推荐起步）** | 维护 `skills-index.json`，只收录内部认可的 GitHub 仓库                     | 最可控、符合合规 |
| GitHub topic 自动发现      | 抓 `topic:claude-skills` / `agent-skills` 的 `owner/repo`，人工复核后入库  | 内容更丰富       |
| 用户自助导入后回填         | 前端已有 `agentSkills.importFromGitHub({gitUrl})` 入口，装过的仓库回填索引 | 自然增长         |

---

### 1.6 MCP 全链路

#### 1.6.1 列表 / 详情

```text
CommunityMcpList / CommunityMcpDetail
  → discoverService.getMcpList / getMcpDetail
  → tRPC market.getMcpList / getMcpDetail
  → MarketSDK.plugins.* → GET {MARKET}/api/v1/plugins?...
```

**代理实现**：公域索引可用，实测 40 条。

```text
GET https://chat-plugins.lobehub.com/index.en-US.json
→ { schemaVersion: 1, plugins: [ { identifier, author, createdAt, homepage, manifest, meta } ] }
```

#### 1.6.2 安装：需要完整 manifest（`deploymentOptions`）

MCP 安装比前两者复杂，因为它要真正建立连接。前端 `installMCPPlugin`（`src/store/tool/slices/mcpStore/action.ts`）：

```text
installMCPPlugin(identifier)
  │ ① 若本地无缓存 → discoverService.getMcpDetail({ identifier })
  │ ② discoverService.getMCPPluginManifest(identifier, { install: true })
  ▼
【代理必须实现】GET /api/v1/plugins/:identifier/manifest → PluginManifest
  │ ③ 从 data.deploymentOptions 选连接方式：
  │      http  → { connection: { type:'http', url } }
  │      stdio → { connection: { type:'stdio', command, args } }
  │      cloud → 当 haveCloudEndpoint 存在时
  │ ④ 按 configSchema 判断是否需要用户填配置
  │ ⑤ 测试连接（CheckMcpInstall）
  ▼
⑥ 写入 user_installed_plugins（manifest + settings + customParams）
```

**`PluginManifest` 的关键结构**：

```ts
interface PluginManifest {
  version: string;
  deploymentOptions?: DeploymentOption[];   // ← 决定怎么连
  tools?: PluginTool[];                     // [{ name, description, inputSchema }]
  prompts?: PluginPrompt[];
  resources?: PluginResource[];
  overview?: { ... };
  validatedAt?: string;
  // 其余继承 MarketPluginItem（name/identifier/icon/category/tags/...）
}

interface DeploymentOption {
  installationMethod: string;
  connection: ConnectionConfig;      // ← 核心
  description?: string;
  isRecommended?: boolean;
}

interface ConnectionConfig {
  type: 'http' | 'stdio';   // ConnectionType
  url?: string;             // http 用
  command?: string;         // stdio 用
  args?: string[];          // stdio 用
  configSchema?: any;       // 需要用户填的配置
}
```

#### 1.6.3 上游 manifest 的转换

公域索引只给了 `manifest` URL（指向 `openai-collections.chat-plugin.lobehub.com/{slug}/manifest.json`），那是 **OpenAI 插件格式**，不是 `PluginManifest`。代理需要转换：

| 上游 manifest 字段          | 转换到                                                                    |
| --------------------------- | ------------------------------------------------------------------------- |
| `name_for_human`            | `name`                                                                    |
| `description_for_human`     | `description`                                                             |
| `name_for_model` / slug     | `identifier`                                                              |
| `logo_url`                  | `icon`                                                                    |
| `api.url` 或 `openapi` spec | `deploymentOptions[0].connection = { type:'http', url }`                  |
| `auth`                      | `connection.configSchema`（如需鉴权）                                     |
| OpenAPI `paths`             | `tools[]`（每个 operation → 一个 tool，`inputSchema` 由 parameters 生成） |

> 阶段 1 只需保证「能装、能出工具列表」。tools 由 MCP 握手时从远端动态获取也可以，manifest 里的 `tools` 允许为空。

#### 1.6.4 代理需要实现的 MCP 端点

| 方法 | 路径                                             | 返回                 | 说明                                                   |
| ---- | ------------------------------------------------ | -------------------- | ------------------------------------------------------ |
| GET  | `/api/v1/plugins`                                | `PluginListResponse` | `items[]` + `categories: string[]`（注意是字符串数组） |
| GET  | `/api/v1/plugins/categories`                     | `CategoryItem[]`     | `[{category,count}]`                                   |
| GET  | `/api/v1/plugins/:identifier`                    | `PluginItemDetail`   | 详情，含 `manifestUrl`                                 |
| GET  | `/api/v1/plugins/:identifier/manifest`           | `PluginManifest`     | **安装核心**，需转换上游格式                           |
| POST | `/api/v1/plugins/:identifier/reportInstallation` | `{success:true}`     | 计数上报（可空实现）                                   |
| POST | `/api/v1/plugins/:identifier/reportCall`         | `{success:true}`     | 调用上报（可空实现）                                   |

#### 1.6.5 ⚠️ manifest 域名的网络问题

实测 `openai-collections.chat-plugin.lobehub.com` 的 **TLS 握手被阻断**（Client Hello 后无响应），而同 IP 的 `chat-plugins.lobehub.com` 返回 200 → **基于 SNI 的拦截**。

三个解法：

| 方案                    | 做法                                                                  | 代价                           |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------ |
| **A. 路由修复（推荐）** | sing-box `route.rules` 把 `*.chat-plugin.lobehub.com` 加入 proxy 出站 | 改宿主配置，一次生效           |
| B. 预缓存               | 部署时批量拉 40 条 manifest 落盘 / 落桶，运行期读本地                 | 上游新增插件不自动出现         |
| C. 客户端直连           | 把 manifest URL 原样返回给浏览器                                      | 浏览器同样受限，且暴露内网代理 |

阶段 1 采用 **A + B 兜底**：优先代理转发，上游不可达时返回缓存副本，无缓存则 502。

---

### 1.7 模型 / 模型服务商（无需改动）

| tab    | 服务端实现                                                      | 说明                                        |
| ------ | --------------------------------------------------------------- | ------------------------------------------- |
| 模型   | `_getRawModelList()` → `loadBuiltinModels()`                    | 过滤 `isAiModelVisible`，按 identifier 去重 |
| 服务商 | `_getProviderList()` → `loadBuiltinModels()` + `modelProviders` | 按 `providerId` 统计模型数                  |

两者都不读 `MARKET_BASE_URL`。**验证方式**：改完 `MARKET_BASE_URL` 指向代理后，这两个 tab 应无任何变化。

---

### 1.8 端点总表（代理需实现）

| 方法 | 路径                                             | 对应 tab   | 数据来源             |
| ---- | ------------------------------------------------ | ---------- | -------------------- |
| GET  | `/health`                                        | —          | 免鉴权自检           |
| GET  | `/api/v1/agents`                                 | 助理       | npmmirror 索引       |
| GET  | `/api/v1/agents/categories`                      | 助理       | 同上分组             |
| GET  | `/api/v1/agents/:identifier`                     | 助理       | npmmirror 详情       |
| GET  | `/api/v1/agents/:identifier/versions`            | 助理       | 合成单版本           |
| POST | `/api/v1/agents/:identifier/fork`                | 助理安装   | 结构合法响应         |
| GET  | `/api/v1/agents/onboarding-full`                 | onboarding | 索引前 N 条          |
| GET  | `/api/v1/skills`                                 | Skill      | 自建索引             |
| GET  | `/api/v1/skills/categories`                      | Skill      | 同上分组             |
| GET  | `/api/v1/skills/:identifier`                     | Skill      | 自建详情             |
| GET  | `/api/v1/skills/:identifier/download`            | Skill 安装 | **302 → GitHub zip** |
| GET  | `/api/v1/plugins`                                | MCP        | chat-plugins 索引    |
| GET  | `/api/v1/plugins/categories`                     | MCP        | 同上分组             |
| GET  | `/api/v1/plugins/:identifier`                    | MCP        | chat-plugins 详情    |
| GET  | `/api/v1/plugins/:identifier/manifest`           | MCP 安装   | 上游 manifest 转换   |
| POST | `/api/v1/plugins/:identifier/reportInstallation` | MCP        | 可空实现             |
| POST | `/api/v1/plugins/:identifier/reportCall`         | MCP        | 可空实现             |

除 `/health` 外全部要求 `Authorization: Bearer <trusted client token>`。

### 1.9 三条安装链路对比

|                  | 助理                                | Skill                                       | MCP                                       |
| ---------------- | ----------------------------------- | ------------------------------------------- | ----------------------------------------- |
| 触发组件         | `ForkAndChat.tsx`                   | `CommunitySkillDetail/Header.tsx`           | `community/(detail)/mcp/.../ActionButton` |
| 前端调用         | `marketApiService.forkAgent`        | `agentSkillService.importFromMarket`        | `installMCPPlugin`                        |
| tRPC             | `market.agent.forkAgent`            | `agentSkills.importFromMarket`              | `market.getMcpManifest`                   |
| 代理端点         | `POST /agents/:id/fork`             | `GET /skills/:id/download`                  | `GET /plugins/:id/manifest`               |
| 代理返回         | 结构合法的 fork 响应                | **302 到 GitHub zip**                       | 转换后的 `PluginManifest`                 |
| 真正写入数据的   | 主应用（`createAgent` 写 `agents`） | 主应用（`importFromUrl` 写 `agent_skills`） | 主应用（写 `user_installed_plugins`）     |
| 代理是否持有内容 | ❌ 只做身份 / 计数                  | ❌ 只做重定向                               | ✅ 需转换 manifest                        |
| 失败表现         | `fork.failed` toast                 | `installError` toast                        | 安装进度停在 FETCHING_MANIFEST            |

**一句话总结**：代理对助理「只记账」、对 Skill「只指路」、对 MCP「要翻译」。

### 1.10 缓存与网络

| 数据            | TTL     | 说明                                               |
| --------------- | ------- | -------------------------------------------------- |
| 助理 / MCP 索引 | 1 小时  | stale-while-revalidate：过期期间返回旧值并后台刷新 |
| 详情            | 1 小时  | 按 `identifier + locale` 键                        |
| MCP manifest    | 24 小时 | 同时落盘作为兜底副本                               |
| Skill 索引      | 1 小时  | 自建文件，可热更新                                 |
| 失败结果        | 30 秒   | 避免上游抖动时打满                                 |

无数据库（阶段 1 只读）。进程内 `Map` 即可；重启只损失暖缓存。

网络可达性：

| 域名                                         | 现状          | 处理                             |
| -------------------------------------------- | ------------- | -------------------------------- |
| `registry.npmmirror.com`                     | ✅ 可达       | —                                |
| `chat-plugins.lobehub.com`                   | ✅ 可达       | —                                |
| `openai-collections.chat-plugin.lobehub.com` | ❌ TLS 被阻断 | sing-box 加 proxy + 预缓存 40 条 |
| `github.com` / `raw.githubusercontent.com`   | ✅ 可达       | Skill 安装依赖                   |

### 1.11 任务与估时

| #   | 任务                                                                | 依赖  | 估时      |
| --- | ------------------------------------------------------------------- | ----- | --------- |
| 1   | 公域源客户端（agents /plugins 拉取 + zod 校验上游形状）             | —     | 0.5 天    |
| 2   | TTL 缓存层（stale-while-revalidate + 失败短缓存）                   | 1     | 0.5 天    |
| 3   | 契约映射（三条链路的字段映射 + `manifestUrl` 构造）                 | 1     | 1 天      |
| 4   | 助理路由（list /categories/detail /versions/fork /onboarding-full） | 2,3   | 1 天      |
| 5   | MCP 路由 + manifest 转换（OpenAI 格式 → `PluginManifest`）          | 2,3   | 1 天      |
| 6   | Skill 自建索引 + 详情 + download 302                                | 2     | 0.5 天    |
| 7   | 网络修复（sing-box）+ manifest 预缓存脚本                           | —     | 0.5 天    |
| 8   | 契约测试（真实 `MarketSDK` 打本地服务，三条链路各一组）             | 4,5,6 | 1 天      |
| 9   | compose 集成（market 服务 + market-keygen 自举 secret）             | 4,5,6 | 0.5 天    |
| 10  | 端到端：五 tab 列表 / 详情 / 安装各走一遍                           | 全部  | 0.5 天    |
|     | **合计**                                                            |       | **≈7 天** |

### 1.12 验收清单

| #   | 检查项                                                                 | 判定                                                |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | `/health` 免鉴权返回 ok                                                | `curl` 直接 200                                     |
| 2   | 无 token 访问 `/api/v1/agents`                                         | 401 且 body 含 `unauthorized`                       |
| 3   | 有 token 访问三类列表                                                  | 200，`totalCount > 0`                               |
| 4   | `MarketSDK.getAgentList()` / `getPluginList()` / `getPluginManifest()` | 解析成功，字段非空                                  |
| 5   | `/community/model`、`/community/provider`                              | 正常展示（本地数据，回归确认）                      |
| 6   | `/community/agent` 列表 → 详情 → Fork and Chat                         | 进入对话页，本地 `agents` 表新增记录                |
| 7   | `/community/mcp` 列表 → 详情 → 安装                                    | `user_installed_plugins` 新增记录，工具可列出       |
| 8   | `/community/skill` 列表 → 详情 → 安装                                  | `agent_skills` 新增记录，`content` 有 SKILL.md 正文 |
| 9   | 上游索引不可达（断网模拟）                                             | 列表仍返回缓存内容                                  |
| 10  | 代理重启后冷启动                                                       | 首屏可接受（≤2s），随后进入缓存                     |

### 1.13 风险

| 风险                            | 影响                   | 缓解                                             |
| ------------------------------- | ---------------------- | ------------------------------------------------ |
| 公域索引格式变更                | 映射失效、前端解析失败 | 上游 JSON 用 zod 校验；契约测试入 CI             |
| npmmirror 不可用                | 助理市场空白           | 缓存兜底 + 可选备用镜像                          |
| manifest 域名持续被阻断         | MCP 安装不可用         | sing-box 修复 + 预缓存 40 条                     |
| `manifestUrl` 缺失              | MCP 安装按钮不可用     | 映射层强制构造（§1.4.5）                         |
| OpenAI 插件 manifest 格式差异大 | MCP 装不上或工具缺失   | 转换层做宽松兜底：`api.url` 优先，`tools` 允许空 |
| GitHub 限流                     | Skill 安装失败         | 只收录小仓库；必要时镜像到内部 Git               |
| 自建 skill 索引陈旧             | 内容过时               | 起步人工白名单，后续接 GitHub topic 自动发现     |
| 公域内容合规                    | 内部出现不适宜内容     | 白名单过滤索引；阶段 2 引入可见范围与下架        |

---

## 第二部分：阶段 2 —— 内部 UGC 市场

> 以下 §1–§15 为阶段 2 的完整设计（用户上传 / 审核 / 可见范围 / 统计），
> 待阶段 1 交付后按需求排期。两阶段共用同一套鉴权与 SDK 契约。

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
>
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
