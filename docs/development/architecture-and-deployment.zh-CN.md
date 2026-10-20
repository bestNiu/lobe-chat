# LobeHub 架构与部署总览

> 本文汇总 LobeHub（原 LobeChat，仓库 `@lobehub/lobehub`，当前版本见根 `package.json`）的**系统架构**、**组件依赖关系**与**部署形态**，作为工程与运维的统一入口文档。
>
> 细节以仓库内原始文档与源码为准，本文所有结论均标注了出处路径。

---

## 目录

1. [架构总览](#1-架构总览)
2. [Monorepo 结构与代码归属](#2-monorepo-结构与代码归属)
3. [前端架构](#3-前端架构)
4. [后端 API 架构](#4-后端-api-架构)
5. [Runtime 层：Model / Agent / Gateway](#5-runtime-层model--agent--gateway)
6. [数据与存储](#6-数据与存储)
7. [认证与鉴权](#7-认证与鉴权)
8. [组件依赖关系](#8-组件依赖关系)
9. [部署形态](#9-部署形态)
10. [容器启动时序](#10-容器启动时序)
11. [端口与网络矩阵](#11-端口与网络矩阵)
12. [环境变量矩阵](#12-环境变量矩阵)
13. [运维手册](#13-运维手册)
14. [开发环境与质量门禁](#14-开发环境与质量门禁)
15. [附录：文档索引](#15-附录文档索引)

---

## 1. 架构总览

LobeHub 是一个基于 Next.js 的开源 AI Agent 平台，采用 **单体仓库 + 多运行形态**（Web / 桌面 / 移动 / 微应用）的架构。

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  客户端形态                                                                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ ┌─────────┐  │
│  │ Web 桌面版  │ │ Web 移动版  │ │ Electron   │ │ 弹窗/微应用 │ │ LobeHub │  │
│  │ entry.web  │ │entry.mobile│ │ apps/      │ │ share /   │ │  CLI    │  │
│  │            │ │            │ │ desktop    │ │ workbench │ │ (lh)    │  │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬─────┘ └────┬────┘  │
└────────┼──────────────┼──────────────┼──────────────┼───────────┼────────┘
         │  HTTP/SSE    │              │  IPC + HTTP  │           │ HTTP/WS
         ▼              ▼              ▼              ▼           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Next.js 16 应用（lobe 容器 / Vercel Function）                            │
│                                                                          │
│  ┌────────────────────────────┐  ┌────────────────────────────────────┐  │
│  │ SSR 外壳                    │  │ 后端 API                            │  │
│  │ src/app/spa/*              │  │ src/app/(backend)/                 │  │
│  │ src/app/spa-auth/*         │  │  ├ trpc/{lambda,async,tools,mobile}│  │
│  │  → public/_spa* 静态产物    │  │  ├ webapi/{chat,tts,models,...}    │  │
│  └────────────────────────────┘  │  ├ api/v1        (OpenAPI + health)│  │
│                                  │  ├ api/agent     (Hono)            │  │
│                                  │  ├ api/workflows (QStash 回调)      │  │
│                                  │  ├ api/auth      (Better Auth)     │  │
│                                  │  └ api/webhooks  (Hono)            │  │
│                                  └──────────────┬─────────────────────┘  │
│  ┌───────────────────────────────────────────── ▼ ────────────────────┐  │
│  │ apps/server/src  —  routers / services / modules / workflows        │  │
│  └─────────────────────────────────────────────┬───────────────────────┘  │
└────────────────────────────────────────────────┼──────────────────────────┘
                                                 │
        ┌────────────────────┬───────────────────┼──────────────┬──────────────┐
        ▼                    ▼                   ▼              ▼              ▼
┌──────────────┐  ┌──────────────────┐  ┌────────────┐ ┌────────────┐ ┌────────────┐
│ PostgreSQL   │  │ lobehub-gateway  │  │ S3 / RustFS│ │  Redis     │ │ SearXNG /  │
│ (ParadeDB    │  │ 8787 Agent GW    │  │ MinIO      │ │ 缓存/限流/  │ │ Elastic-   │
│  pg_search + │  │ 8788 Device GW   │  │ 文件与知识库│ │ 队列        │ │ search     │
│  pgvector +  │  │ 服务端跑 Agent   │  └────────────┘ └────────────┘ └────────────┘
│  pg_cron)    │  └──────────────────┘
└──────────────┘           │
                           ▼
                 ┌──────────────────────┐      ┌───────────────────────┐
                 │ 外部 LLM Provider ×30+│      │ QStash (Upstash)      │
                 │ OpenAI/Anthropic/    │      │ 定时任务与异步工作流    │
                 │ Google/Bedrock/      │      └───────────────────────┘
                 │ Ollama/...           │
                 └──────────────────────┘
```

| 层           | 说明                                                      | 主要位置                                           |
| ------------ | --------------------------------------------------------- | -------------------------------------------------- |
| Frontend     | Next.js RSC 外壳 + React Router DOM SPA（混合路由）       | `src/app`、`src/spa`、`src/routes`                 |
| Backend API  | RESTful WebAPI + tRPC Routers + Hono 路由                 | `src/app/(backend)`、`apps/server/src`             |
| Runtime      | Model Runtime（LLM 适配）+ Agent Runtime（编排）+ Gateway | `packages/model-runtime`、`packages/agent-runtime` |
| Auth         | Better Auth（邮箱密码 + SSO/OIDC）                        | `src/auth.ts`、`src/libs/better-auth`              |
| Data Storage | PostgreSQL + Redis + S3（+ 可选 Elasticsearch）           | `packages/database`                                |
| Marketplace  | Agent 市场 + MCP 工具市场 + Skills 商店                   | `apps/server/src/services/{market,mcp,discover}`   |

> 出处：`docs/development/basic/architecture.zh-CN.mdx`、`.agents/skills/project-overview/SKILL.md`

---

## 2. Monorepo 结构与代码归属

扁平布局：`apps/`、`packages/`、`src/` 均在仓库根目录，无 git submodule。包管理器为 **pnpm（workspace）+ bun（跑脚本）**。

```text
lobehub/
├── apps/
│   ├── auth/          # @lobehub/auth      — 独立认证微应用（React Router SSR，Cloudflare Workers）
│   ├── cli/           # @lobehub/cli (lh)  — 命令行：设备接入、验收、评测
│   ├── desktop/       # Electron 桌面端（main / preload / overlay / common）
│   ├── server/        # @lobechat/server   — 后端运行时（routers/services/modules/workflows）
│   ├── share/         # @lobehub/share     — 分享页微应用（React Router + Workers）
│   └── workbench/     # @lobehub/workbench — 工作台微应用（React Router + Workers）
├── packages/          # 104 个 @lobechat/* 共享包（+ packages/business/* 4 个云端插槽）
├── src/               # 主应用源码
├── locales/           # i18n 产物（zh-CN、en-US …），源在 packages/locales/src/default/
├── docker-compose/    # deploy / dev / local / eval / production(grafana)
├── e2e/               # Cucumber + Playwright 端到端测试
├── docs/              # changelog / development / self-hosting / usage / wiki
└── scripts/           # 构建、迁移、启动器、i18n、发布等工作流脚本
```

### 2.1 `src/` 目录职责

| 目录                     | 职责                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `src/app/`               | Next.js App Router：后端 API 路由 + SPA / 认证页 HTML 外壳                                          |
| `src/app/(backend)`      | `api`、`f`、`market`、`middleware`、`oauth`、`oidc`、`trpc`、`webapi`                               |
| `src/spa/`               | SPA 入口（`entry.{web,mobile,desktop,popup,auth}.tsx`）与 React Router 配置                         |
| `src/routes/`            | SPA 页面片段（薄壳），按 `(main)`/`(mobile)`/`(desktop)`/`(popup)`/`auth`/`onboarding`/`share` 分组 |
| `src/features/`          | 领域业务组件（真正的 UI 与逻辑落点）                                                                |
| `src/store/`             | 38 个 zustand store（agent /chat/file/aiInfra/goal/task …）                                         |
| `src/components/`        | 可复用 UI 组件（优先级高于 `@lobehub/ui`）                                                          |
| `src/services/`          | 客户端服务接口（封装 tRPC /fetch）                                                                  |
| `src/libs/`              | 第三方集成（better-auth、oidc-provider、redis、mcp、qstash、observability、next 配置…）             |
| `src/layout/`            | 全局 Provider（Auth、Global）                                                                       |
| `src/business/`          | 开源版业务桩（stub），由私有 Cloud 仓库覆盖                                                         |
| `src/auth.ts`            | Better Auth 配置                                                                                    |
| `src/proxy.ts`           | Next.js middleware                                                                                  |
| `src/instrumentation.ts` | 遥测 / 监控初始化                                                                                   |

> **边界约束**（来自 `AGENTS.md`）：`src/app/(backend)` 只放 Next.js 路由外壳，后端业务逻辑一律放 `apps/server/src`；`src/routes` 不得新建 `features` 目录。

### 2.2 `apps/server/src` 职责

| 目录                                               | 职责                                                                                      | 可否访问 DB        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------ |
| `routers/`                                         | tRPC 路由：`lambda`（98 个）/ `async` / `tools` / `mobile`                                | 否（转调 service） |
| `services/`                                        | 业务服务（92 个：agent、file、knowledgeBase、mcp、gateway、ftsSearch…）                   | **是**             |
| `modules/`                                         | 无状态技术模块（ModelRuntime、AgentRuntime、S3、KeyVaultsEncrypt、Mecha…）                | **否**             |
| `router-hono/`                                     | Hono 端点（`agent`、`workflows`、`webhooks`、`composio`、`devtools`）与 standalone 运行时 | —                  |
| `workflows/`                                       | QStash 持久化工作流（agentSignal、agentEvalRun、topicAutoSummary、runGuard…）             | 是                 |
| `featureFlags/`、`globalConfig/`、`runtimeConfig/` | 开关与全局配置下发                                                                        | —                  |

> 出处：`docs/development/basic/folder-structure.zh-CN.mdx`、`.agents/skills/project-overview/SKILL.md`

---

## 3. 前端架构

### 3.1 混合路由

| 路由方式               | 使用场景                          | 位置                                |
| ---------------------- | --------------------------------- | ----------------------------------- |
| **Next.js App Router** | SPA HTML 外壳、认证页、SSR / 静态 | `src/app/spa/`、`src/app/spa-auth/` |
| **React Router DOM**   | 主聊天 SPA、Agent 界面            | `src/spa/router/` + `src/routes/`   |

请求流转：`Next.js route.ts` 依据设备类型渲染 HTML 外壳（`src/libs/spaHtml`）→ 加载 Vite 构建的 SPA bundle（`public/_spa*`）→ React Router 接管路由。

**为什么混合？** SSR 给认证页带来安全性、SEO 与静态性能；SPA 给高频交互界面带来即时导航与响应式状态。

### 3.2 SPA 入口与构建产物

| 入口                 | 构建命令              | 产物目录                | 宿主              |
| -------------------- | --------------------- | ----------------------- | ----------------- |
| `entry.web.tsx`      | `build:spa`           | `public/_spa`           | 桌面 Web          |
| `entry.mobile.tsx`   | `build:spa:mobile`    | `public/_spa`（MOBILE） | 移动 Web          |
| `entry.auth.tsx`     | `build:spa:auth`      | `public/_spa-auth`      | 认证页            |
| `@lobehub/workbench` | `build:spa:workbench` | `public/_spa-workbench` | 工作台微应用      |
| `@lobehub/share`     | `build:spa:share`     | `public/_spa-share`     | 分享页微应用      |
| `entry.desktop.tsx`  | Electron 内 vite 构建 | `apps/desktop/dist`     | Electron Renderer |
| `entry.popup.tsx`    | —                     | —                       | 弹出窗口          |

`build:spa:copy` = `scripts/copySpaBuild.mts` + `scripts/generateSpaTemplates.mts`，把各产物汇总到 `public/` 并生成 HTML 模板。

### 3.3 路由配置文件

- `src/spa/router/desktopRouter.shared.tsx` — Web/Electron 共用路径、metadata、lazy loader、`preloadId` 的**唯一注册点**
- `desktopRouter.config.tsx` / `desktopRouter.config.desktop.tsx` — 仅放平台差异，两者必须保持同步（`desktopRouter.sync.test.tsx` 守护）
- `mobileRouter.config.tsx`、`popupRouter.config.tsx`、`authRouter.config.tsx`

### 3.4 数据流

```text
React UI (src/features, src/routes)
  → Store Actions (src/store, zustand)
    → Client Service (src/services)
      → tRPC Router (apps/server/src/routers/lambda)
        → Server Service (apps/server/src/services)
          → DB Model (packages/database/src/models)
            → PostgreSQL
```

读方向相反：UI 通过 store selector 消费，store 通过 **SWR + tRPC query** 拉取并缓存。

### 3.5 技术栈与组件优先级

组件选择优先级：**项目组件 `src/components/` → `@lobehub/ui` → antd**。

| 类别     | 选型                                                |
| -------- | --------------------------------------------------- |
| 框架     | Next.js 16 + React 19 + TypeScript                  |
| 路由     | `react-router-dom`（SPA）+ App Router（外壳）       |
| UI       | `@lobehub/ui` 5.x、antd 6.x、`@lobehub/editor`      |
| 样式     | antd-style（CSS-in-JS）                             |
| 图标     | lucide-react、`@ant-design/icons`、`@lobehub/icons` |
| 状态     | zustand 5（slice 模式）                             |
| URL 参数 | nuqs                                                |
| 数据请求 | SWR 2 + tRPC 11                                     |
| Hooks    | aHooks                                              |
| 工具库   | es-toolkit、dayjs                                   |
| i18n     | react-i18next 16                                    |
| 构建     | Vite 8（SPA）+ Next build（外壳 / API）             |
| 测试     | Vitest 5 + Cucumber/Playwright（E2E）               |

### 3.6 性能与安全策略

**性能**：路由级代码分割、重组件懒加载、SWR 客户端缓存 + 后台重验证、CDN 边缘缓存、SSE 流式响应、长列表虚拟滚动。

**安全**：SameSite Cookie + Token 校验（CSRF）、CSP 头 + 输出净化（XSS，`ENABLED_CSP`）、边缘层限流、出站请求白名单（SSRF，`packages/ssrf-safe-fetch`）、Drizzle 参数化查询（SQLi）、密钥只走环境变量（`KEY_VAULTS_SECRET` 加密落库）。

> 出处：`docs/development/basic/architecture.zh-CN.mdx`、`.agents/skills/spa-routes/SKILL.md`

---

## 4. 后端 API 架构

后端有**三套并存的 API 形式**，按能力选型：

| 形式                | 挂载点                                                                                 | 实现位置                               | 适用场景                                          |
| ------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------- |
| **tRPC**（主力）    | `/trpc/lambda`、`/trpc/async`、`/trpc/tools`、`/trpc/mobile`                           | `apps/server/src/routers/*`            | 类型安全的主业务 CRUD 与查询                      |
| **RESTful WebAPI**  | `/webapi/*`                                                                            | `src/app/(backend)/webapi/*`           | 流式 chat、TTS、图像生成、models、trace、document |
| **Hono 路由**       | `/api/agent/*`、`/api/workflows/*`、`/api/webhooks/*`、`/api/composio/*`、`/api/dev/*` | `apps/server/src/router-hono/*`        | Agent 运行流、QStash 工作流回调、第三方 webhook   |
| **OpenAPI（对外）** | `/api/v1/*`（含 `/api/v1/health`）                                                     | `packages/openapi`                     | 对外 REST API、健康检查、API 文档                 |
| **Better Auth**     | `/api/auth/*`                                                                          | `src/auth.ts` + `src/libs/better-auth` | 登录、注册、SSO 回调                              |
| **OIDC Provider**   | `/oidc/*`                                                                              | `src/libs/oidc-provider`               | LobeHub 作为 IdP 对外签发                         |

### tRPC 路由分组

| 分组      | 说明                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------- |
| `lambda/` | 主业务：agent、session、message、topic、file、knowledge、settings、aiProvider、device、goal、task… |
| `async/`  | 耗时异步：文件解析、图像生成、RAG 评估                                                             |
| `tools/`  | 工具调用：search、MCP、market、composio                                                            |
| `mobile/` | 移动端专用                                                                                         |

路由外壳文件（`src/app/(backend)/trpc/<group>/[trpc]/route.ts`）只做转发，**不含业务逻辑**。

### 独立 Hono 服务（可选部署形态）

`apps/server` 可脱离 Next.js 单独运行：

```bash
pnpm --filter @lobechat/server dev     # 开发（vite-node，热更新）
pnpm --filter @lobechat/server build   # vite build → dist/standalone.js
pnpm --filter @lobechat/server start   # node dist/standalone.js
```

监听端口由 `HONO_PORT` → `PORT` → 默认 **3011** 决定（`apps/server/src/router-hono/standalone.ts`）。

> 出处：`apps/server/src/router-hono/index.ts`、`packages/openapi/src/app.ts`

---

## 5. Runtime 层：Model / Agent / Gateway

### 5.1 Model Runtime（`packages/model-runtime`）

LLM API 适配层，抹平 30+ Provider（OpenAI、Anthropic、Google、Bedrock、Azure、Ollama、OpenRouter、DeepSeek、Qwen、SiliconCloud…）的接口差异，**无状态**，每次调用独立。Provider 定义与模型卡片在 `packages/model-bank`。

### 5.2 Agent Runtime（`packages/agent-runtime`）

Agent 编排引擎，位于 Model Runtime 之上：

- **Plan-Execute 循环**：LLM 调用 → 工具执行 → 结果回填 → 循环
- 单工具 / 批量工具调用
- **Human-in-the-Loop**：安全检查与人工审批（`agentIntervention` schema）
- 上下文压缩（配合 `packages/context-engine`）
- Token 用量与成本追踪
- **多 Agent 协作**：`GroupOrchestrationRuntime`（Supervisor + Executor）

执行流程：解析输入 → LLM 决策（直答 or 调工具）→ 执行工具 → 必要时人工审批 → 结果回灌 → 循环至最终回复。

### 5.3 Gateway Mode（服务端跑 Agent）

默认情况下 Agent 循环在**浏览器**中运行。开启 Gateway 模式后循环搬到**服务端**，通过独立的 `lobehub-gateway` 容器把事件以 WebSocket 中继给浏览器。

```text
浏览器 ──WS──► AGENT_GATEWAY_URL (:8787) ──┐
                                          │  lobehub-gateway 容器
lobe 容器 ──HTTP(内网)──► http://gateway:8787 ──┘   （状态存内存，重启丢在途运行）
                                          │
设备(lh connect) ──WS──► :8788 Device GW ──┘  → 把工具调用路由回用户设备执行
```

| 组件                               | 作用                                             |
| ---------------------------------- | ------------------------------------------------ |
| `ghcr.io/lobehub/lobehub-gateway`  | 单实例网关，8787 Agent / 8788 Device             |
| `packages/agent-gateway-client`    | 浏览器 / 服务端侧的网关客户端（含 mux 多路复用） |
| `packages/device-gateway-client`   | 设备接入（tunnel /loopback/ws）                  |
| `apps/server/src/services/gateway` | `GatewayManager`、连接队列、运行状态             |

关键变量：`ENABLE_AGENT_GATEWAY`、`AGENT_GATEWAY_URL`（浏览器可达，需支持 WS 升级）、`AGENT_GATEWAY_INTERNAL_URL`（容器内网）、`AGENT_GATEWAY_SERVICE_TOKEN`、`JWKS_KEY`（私钥，仅留 lobe 容器）、`JWKS_PUBLIC_KEY`（给网关校验浏览器会话）。

### 5.4 内置工具体系

```text
packages/builtin-tools          ← 中央注册表（manifests / executors / renders / inspectors / interventions）
   └── packages/builtin-tool-*  ← 每个工具一个包（37 个）
         ├── builtin-tool-web-browsing      (→ desktop-bridge, prompts)
         ├── builtin-tool-local-system      (→ electron-client-ipc, tool-runtime)
         ├── builtin-tool-cloud-sandbox     (→ tool-runtime)
         ├── builtin-tool-image-generation / video-generation
         ├── builtin-tool-knowledge-base / memory / task / goal
         ├── builtin-tool-claude-code / browser / skills / skill-store
         └── ...
packages/mecha                  ← 组合 agent-runtime + builtin-tools + context-engine 的运行时装配层
```

### 5.5 异构 Agent 与外部集成

| 包                                                              | 作用                                           |
| --------------------------------------------------------------- | ---------------------------------------------- |
| `packages/heterogeneous-agents`                                 | Claude Code / Codex 等外部 Agent 适配          |
| `packages/chat-adapter-{feishu,wechat,qq,line,imessage}`        | IM 平台机器人接入                              |
| `packages/agent-signal`                                         | Agent Signal 事件源 / 动作 / 策略 / 工作流交接 |
| `packages/agent-tracing`                                        | 运行链路追踪与快照                             |
| `packages/web-crawler` / `python-interpreter` / `html-artifact` | 抓取、Python 沙箱、Artifact                    |

> 出处：`docs/development/basic/architecture.zh-CN.mdx`、`docker-compose/deploy/docker-compose.yml`

---

## 6. 数据与存储

| 存储                                | 用途                                                          | 必选性                        |
| ----------------------------------- | ------------------------------------------------------------- | ----------------------------- |
| **PostgreSQL**（ParadeDB）          | 主库：用户、会话、消息、Agent、文件元数据、知识库、Goal、Task | **必选**（服务端模式）        |
| **S3 兼容对象存储**（RustFS/MinIO） | 用户上传、图片、知识库文件、Artifact                          | **必选**（文件 / 知识库能力） |
| **Redis**                           | 缓存、会话状态、限流、队列                                    | 可选（推荐生产开启）          |
| **Elasticsearch**                   | 全文检索（替代 pg_search）                                    | 可选（profile 门控）          |
| **QStash (Upstash)**                | 定时任务与持久化异步工作流                                    | 可选（无则相关能力降级）      |

### 6.1 PostgreSQL

- 镜像：**`paradedb/paradedb:latest-pg17`**（PG 17 + `pg_search` 全文检索 + `pgvector` 向量检索）
- 启动参数必须保留：`shared_preload_libraries=pg_search,pg_cron,pg_stat_statements`（首次初始化会创建 `pg_cron`，缺失则中断）
- ORM：**Drizzle**，schema 在 `packages/database/src/schemas/`（69 个 schema 模块），model 在 `models/`（100 个），聚合查询在 `repositories/`
- 迁移：`packages/database/migrations/`，容器启动时自动执行（见 §10）
- 云端推荐托管：Neon / Supabase / RDS

### 6.2 全文检索（FTS）

| Provider            | 触发条件                            | 说明                                                                      |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| `pg_search`（默认） | 未设置 `FTS_SEARCH_PROVIDER`        | 走 ParadeDB，无额外组件                                                   |
| `pg_like`           | 不支持 pg_search 的 PG              | 降级 LIKE 查询                                                            |
| `elasticsearch`     | `FTS_SEARCH_PROVIDER=elasticsearch` | 需 `ES_URL` / `ES_API_KEY`；通过 Outbox 表 `ftsSearchSyncOutbox` 增量同步 |

ES 路径的三个额外服务（compose profile 门控）：

- `elasticsearch`（profile `elasticsearch`）— 本地单节点，镜像由 `docker-compose/deploy/elasticsearch/Dockerfile` 构建（官方镜像 + `analysis-icu` 插件），**不发布端口**
- `fts-search-reindex`（profile `elasticsearch-reindex`）— 一次性全量回填，`docker compose run --rm fts-search-reindex --status`
- `fts-search-sync`（profile `elasticsearch-sync`）— 常驻增量同步 worker，`stop_grace_period: 2m`

### 6.3 S3 对象存储

**必须区分两个 Endpoint**：

| 变量                   | 谁访问     | 示例                     |
| ---------------------- | ---------- | ------------------------ |
| `S3_ENDPOINT`          | **浏览器** | `https://s3.example.com` |
| `S3_INTERNAL_ENDPOINT` | lobe 容器  | `http://rustfs:9000`     |

> 直接把 `S3_ENDPOINT` 写成容器内网地址会导致**对话内图片不可用**（浏览器访问不到），但头像上传不受影响。

RustFS 需要 `rustfs-init` 一次性容器完成：创建 bucket `lobe` → 写入匿名访问策略（`bucket.config.json`）→ 配置 CORS（浏览器预签名直传必需）。

> 出处：`docs/self-hosting/platform/docker-compose.zh-CN.mdx`、`docs/self-hosting/advanced/full-text-search.zh-CN.mdx`

---

## 7. 认证与鉴权

- 框架：**Better Auth**（`src/auth.ts`），支持邮箱 + 密码与多种 SSO（GitHub、Google、Microsoft Entra、Auth0、Authelia、Authentik、Casdoor、Keycloak、Logto、Okta、Zitadel、Cognito、Feishu、WeChat、通用 OIDC、Cloudflare Zero Trust）
- 路由：`/api/auth/*`（`toNextJsHandler(auth)`），路由层额外做了 malformed JSON → 400 的兜底
- 密钥：`AUTH_SECRET`（会话加密）、`KEY_VAULTS_SECRET`（凭据落库加密，`apps/server/src/modules/KeyVaultsEncrypt`）
- 内部 JWT：`JWKS_KEY`（RS256 私钥）/ `JWKS_PUBLIC_KEY`（公钥给 Gateway 校验）
- LobeHub 亦可**作为 OIDC Provider** 对外签发（`src/app/(backend)/oidc`）
- v1 → v2 迁移：Clerk / NextAuth → Better Auth，见 `docs/self-hosting/migration/v2/auth/`

> ⚠️ 旧 `.env.example` 自带的示例 `JWKS_KEY`（`kid=6823046760c5d460`）**必须替换**，否则任何人可伪造令牌。

---

## 8. 组件依赖关系

### 8.1 外部关键依赖版本

以根 `package.json` 为准（下表为撰写时快照）：

| 依赖                    | 版本           | 用途                |
| ----------------------- | -------------- | ------------------- |
| `next`                  | ^16.3.0        | 应用框架 / SSR 外壳 |
| `react` / `react-dom`   | 19.2.7         | UI 运行时           |
| `@lobehub/ui`           | ^5.56.0        | 组件库              |
| `antd` / `antd-style`   | 6.3.5 / 4.1.0  | 组件库 / CSS-in-JS  |
| `zustand`               | 5.0.4          | 状态管理            |
| `swr`                   | ^2.5.0         | 数据请求缓存        |
| `@trpc/server`,`client` | ^11.18.0       | 类型安全 API        |
| `hono`                  | ^4.13.1        | 边缘 / 独立路由     |
| `drizzle-orm`           | ^0.45.2        | ORM                 |
| `pg`                    | ^8.23.0        | PG 驱动             |
| `ioredis`               | ^5.11.1        | Redis 客户端        |
| `@aws-sdk/client-s3`    | \~3.932.0      | S3 客户端           |
| `better-auth`           | 1.6.15         | 认证                |
| `zod`                   | ^4.4.3         | 校验                |
| `vite` / `vitest`       | 8.0.16 / 5.0.0 | SPA 构建 / 测试     |

Node 版本：Docker 基础镜像 `node:24-slim`（`Dockerfile` ARG `NODEJS_VERSION`），`.nvmrc` 见仓库根。包管理器：`pnpm@12.4.1`。

### 8.2 内部包依赖分层

依赖方向自下而上，**下层不得反向依赖上层**：

```text
L0 基础类型/常量
   @lobechat/types  ──►  @lobehub/{market-sdk,market-types,ui}
   @lobechat/const  ──►  @lobechat/business-const, @lobehub/ui
   @lobechat/utils  ──►  const, types, ssrf-safe-fetch
   @lobechat/env    ──►  const, types
   @lobechat/prompts──►  const

L1 数据与配置
   @lobechat/database   ──►  const, types, utils, agent-templates,
                             builtin-agents, conversation-flow, business-*
   @lobechat/app-config ──►  database, types, utils
   @lobechat/locales    ──►  const, env, utils
   @lobechat/model-bank ──►  business-const

L2 运行时内核
   @lobechat/model-runtime   ──►  const, utils, ssrf-safe-fetch, business-model-*
   @lobechat/tool-runtime    ──►  prompts
   @lobechat/context-engine  ──►  const, database, prompts, utils
   @lobechat/agent-runtime   ──►  utils
   @lobechat/trpc            ──►  const, database, env, types, utils,
                                  desktop-bridge, observability-otel

L3 能力装配
   @lobechat/builtin-tool-*  ──►  prompts / shared-tool-ui / tool-runtime / @lobehub/ui
   @lobechat/builtin-tools   ──►  全部 builtin-tool-*（37 个）+ const
   @lobechat/builtin-agents  ──►  agent-builder / agent-management / task /
                                  notebook / user-interaction / verify / group-*
   @lobechat/mecha           ──►  agent-runtime + builtin-tools + context-engine +
                                  model-runtime + prompts（Agent 运行时总装配）
   @lobechat/memory-user-memory ──► context-engine, model-runtime, prompts, types
   @lobechat/heterogeneous-agents ──► agent-gateway-client, types, utils

L4 服务端
   @lobechat/business-server ──►  agent-gateway-client, const, database,
                                  model-runtime, trpc, types
   @lobechat/openapi         ──►  heterogeneous-agents, model-runtime, types
   @lobechat/server (apps/server)  ──►  以上全部（通过 @/server/* 别名）

L5 客户端 / 端侧
   @lobechat/shared-tool-ui  ──►  tool-runtime, utils, @lobehub/ui
   @lobechat/fetch-sse       ──►  const, model-runtime, utils
   @lobechat/device-control  ──►  heterogeneous-agents, html-artifact,
                                  local-file-shell, types, utils
   @lobechat/local-file-shell──►  device-sandbox, file-loaders
   @lobechat/electron-*-ipc  ──►  heterogeneous-agents / napi-loader
```

### 8.3 高扇入的关键包（改动需重点回归）

| 包                        | 被依赖情况                                         | 风险提示                    |
| ------------------------- | -------------------------------------------------- | --------------------------- |
| `@lobechat/const`         | 几乎所有包                                         | 常量变更影响面全局          |
| `@lobechat/types`         | 几乎所有包                                         | 类型变更触发全仓 type-check |
| `@lobechat/utils`         | 大部分包                                           | —                           |
| `@lobechat/database`      | app-config、trpc、context-engine、server           | schema 变更需配迁移         |
| `@lobechat/model-runtime` | mecha、fetch-sse、openapi、business-server、memory | Provider 适配回归           |
| `@lobechat/builtin-tools` | mecha、前端工具渲染                                | 注册表变更影响所有工具卡片  |
| `@lobechat/trpc`          | 所有 router 与 client service                      | 契约变更需同步前后端        |

### 8.4 运行时服务依赖（部署视角）

```text
lobe (Next.js)
 ├─ depends_on: postgresql      (service_healthy, TCP 探针, start_period 60s)
 ├─ depends_on: redis           (service_healthy)
 ├─ depends_on: rustfs          (service_healthy)
 ├─ depends_on: rustfs-init     (service_completed_successfully)
 ├─ 内网调用: http://gateway:8787  (Agent Gateway)
 ├─ 内网调用: http://searxng:8080  (联网搜索)
 ├─ 内网调用: http://localhost:3210 (INTERNAL_APP_URL，异步功能自调用)
 └─ 出站: LLM Provider API / Market API / QStash

gateway (lobehub-gateway)
 ├─ LOBE_API_BASE_URL = http://lobe:3210
 ├─ SERVICE_TOKEN     = 与 lobe 共享
 └─ JWKS_PUBLIC_KEY   = 仅公钥

fts-search-sync / fts-search-reindex (profile 门控)
 └─ depends_on: postgresql (service_healthy) → ES_URL
```

---

## 9. 部署形态

### 9.1 形态对比

| 形态                                                                 | 适用场景                   | 优点                                          | 限制                                           | 配置                                                                  |
| -------------------------------------------------------------------- | -------------------------- | --------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| **Docker Compose（推荐）**                                           | 私有化、团队、完整基础设施 | 一条命令起全栈，`pull` 即升级，支持 WebSocket | 需自管服务器、备份、监控                       | `docker-compose/deploy/docker-compose.yml` + `setup.sh`               |
| **单容器 Docker**                                                    | 已有托管 PG/S3             | 轻量                                          | 需自备数据库与对象存储                         | `Dockerfile` → `lobehub/lobehub`                                      |
| **Vercel**                                                           | 快速试用、Serverless 弹性  | 一键部署、自动 HTTPS/CDN                      | 函数超时（\~10s）、不支持 WebSocket、需外部 PG | `vercel.json`（`buildCommand: bun run build:vercel`）                 |
| **云平台**（Zeabur/Sealos/Dokploy/Repocloud/ 阿里云计算巢 / 腾讯云） | 托管化                     | 模板化                                        | 能力受平台限制                                 | `docs/self-hosting/platform/*.mdx`                                    |
| **独立 Hono 服务**                                                   | 后端单独伸缩 / 边缘        | 与前端解耦                                    | 需自行组织前端产物                             | `pnpm --filter @lobechat/server start`（默认 3011）                   |
| **Electron 桌面端**                                                  | 本地优先、离线             | 本地数据库 + 本地工具执行                     | 分发 / 更新链路独立                            | `apps/desktop`（electron-builder + OTA）                              |
| **微应用（share /workbench/auth）**                                  | CDN/Workers 独立托管       | 独立发布节奏                                  | 需 Cloudflare Workers 环境                     | `apps/{share,workbench,auth}` + `wrangler.jsonc`                      |
| **本机私有部署（本仓库 fork）**                                      | 内网验证                   | 仅监听 127.0.0.1，隔离数据卷                  | 不含邮件 / SSO / 沙箱 / QStash                 | `docker-compose/local/compose.yml` + `docker-compose/local/README.md` |

### 9.2 Docker 镜像构建（`Dockerfile`）

多阶段构建，最终为 **distroless/scratch** 镜像：

| 阶段      | 基础镜像       | 产物                                                                                                    |
| --------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `base`    | `node:24-slim` | 系统依赖、`/distroless/`                                                                                |
| `builder` | `base`         | `npm run build:docker` → `.next/standalone`、`.next/static`、`public/_spa*`；esbuild 打包 4 个 FTS 脚本 |
| `deps`    | —              | 运行时最小依赖：`pg`、`drizzle-orm`、`@neondatabase`、`@swc/helpers`                                    |
| `app`     | `busybox`      | 组装 `/app`：standalone + static + SPA 产物 + `migrations` + `docker.cjs` + `startServer.js`            |
| 最终      | `scratch`      | `EXPOSE 3210`，`ENTRYPOINT ["/bin/node"]`，`CMD ["/app/startServer.js"]`                                |

构建期关键 ARG：`USE_CN_MIRROR`、`NEXT_PUBLIC_BASE_PATH`、`FEATURE_FLAGS`、`NEXT_PUBLIC_SENTRY_DSN`、`NEXT_PUBLIC_ANALYTICS_UMAMI`。
`DOCKER=true` 时 `next.config.ts` 会限制 `experimental.cpus = 2`（共享宿主 CPU 多但内存少的场景）。

`build:docker` 相比 `build` 多构建 mobile SPA，并强制 `WORKBENCH_REQUIRED=1 SHARE_REQUIRED=1`。

### 9.3 Docker Compose 官方栈（`docker-compose/deploy`）

一键部署：

```bash
mkdir lobehub && cd lobehub
bash <(curl -fsSL https://lobe.li/setup.sh) -l zh_CN
docker compose up -d
docker logs -f lobehub
```

三种网络模式：

| 模式             | 访问范围              | 说明                                                                        |
| ---------------- | --------------------- | --------------------------------------------------------------------------- |
| 本地模式（默认） | 仅本机                | 全默认回车即可，适合初次体验                                                |
| 端口模式         | 局域网 / 公网 HTTP    | 填服务器 IP，**强烈建议重新生成密钥**                                       |
| 域名模式         | 反向代理下 HTTP/HTTPS | 需为 `lobe`/`s3`/`gateway`（可选 `s3-ui`）配反代，网关需允许 WebSocket 升级 |

服务清单：

| 服务                 | 镜像                                       | 端口                                               | 必选                            |
| -------------------- | ------------------------------------------ | -------------------------------------------------- | ------------------------------- |
| `lobe`               | `lobehub/lobehub`                          | `${LOBE_PORT}:3210`                                | ✅                              |
| `gateway`            | `ghcr.io/lobehub/lobehub-gateway:0.3.2`    | `8787` / `8788`                                    | ✅（Gateway 模式）              |
| `postgresql`         | `paradedb/paradedb:latest-pg17`            | `5432`                                             | ✅                              |
| `redis`              | `redis:7-alpine`                           | `6379`                                             | ✅（本栈默认启用）              |
| `rustfs`             | `rustfs/rustfs:latest`                     | `${RUSTFS_PORT}:9000`、`${RUSTFS_ADMIN_PORT}:9001` | ✅                              |
| `rustfs-init`        | `rustfs/rc:latest`                         | —（一次性）                                        | ✅                              |
| `searxng`            | `searxng/searxng`                          | 内网 8080                                          | 联网搜索需要                    |
| `elasticsearch`      | 本地构建 `lobehub-elasticsearch-icu:9.5.2` | 内网 9200（**不发布**）                            | profile `elasticsearch`         |
| `fts-search-reindex` | `lobehub/lobehub`                          | —（一次性）                                        | profile `elasticsearch-reindex` |
| `fts-search-sync`    | `lobehub/lobehub`                          | —（常驻）                                          | profile `elasticsearch-sync`    |

数据卷：`redis_data`、`rustfs-data`、`elasticsearch-data`、`fts-search-reindex-state`；PG 数据挂载在 `./data`。

### 9.4 资源要求

| 级别         | CPU    | 内存  | 存储                   |
| ------------ | ------ | ----- | ---------------------- |
| 最低（轻量） | 2 核   | 4 GB  | 20 GB                  |
| 推荐（生产） | 4 核 + | 8 GB+ | 50 GB+（取决于上传量） |

Elasticsearch 单独至少 2 GB RAM，`ES_JAVA_OPTS` 堆 ≤ 容器内存一半；Linux 宿主需 `vm.max_map_count=262144`。
高流量建议使用托管 PG（Neon/Supabase/RDS）+ Redis 集群 + CDN。

### 9.5 可观测性栈（`docker-compose/production/grafana`）

独立 compose，含 `grafana 12.2` + `tempo`（Trace）+ `prometheus`（Metrics）+ `otel-collector` + `casdoor`（SSO）+ `minio` + `paradedb` + `searxng` + `lobe`。
应用侧接入见 `packages/observability-otel`、`src/libs/observability`、`src/instrumentation.ts`，文档 `docs/self-hosting/advanced/observability/grafana.zh-CN.mdx`。

---

## 10. 容器启动时序

`scripts/serverLauncher/startServer.js`（镜像 `CMD`）：

```text
1. checkDeprecatedAuth({ action: 'restart' })     # 旧认证变量 → fail fast
2. checkGatewayConfig()                           # Gateway 模式缺 .env → 打印 ACTION REQUIRED
3. 打印 DNS Server
4. if (DATABASE_DRIVER || FTS_SEARCH_PROVIDER==='elasticsearch')
      → node /app/docker.cjs                      # DB schema migration
        （脚本不存在且非 ES 模式 → 警告跳过，需手动迁移）
        （迁移失败 → exit 1）
5. if (FTS_SEARCH_PROVIDER==='elasticsearch')
      → node /app/fts-search-elasticsearch-reindex.cjs --startup --yes
        （失败 → exit 1，索引未就绪不接受请求）
6. startGateway()          # 后台，POST /api/agent/gateway/start，Bearer KEY_VAULTS_SECRET，最多重试 10 次 ×3s
7. createQstashSchedule()  # 需 QSTASH_TOKEN + APP_URL，否则告警跳过
8. runServer()             # PROXY_URL 存在 → 生成 proxychains 配置并经代理启动 /app/server.js
```

第 7 步注册的 QStash 定时任务：

| Schedule ID                   | Cron           | 路径                                    | 作用                                          |
| ----------------------------- | -------------- | --------------------------------------- | --------------------------------------------- |
| `lobe-task-schedule-dispatch` | `*/10 * * * *` | `/api/workflows/task/schedule-dispatch` | 定时任务派发                                  |
| `lobe-goal-sweep`             | `*/5 * * * *`  | `/api/workflows/goal/sweep`             | Goal Graph 兜底扫描（事件丢失后唯一恢复手段） |
| `lobe-widget-tick`            | `* * * * *`    | `/api/workflows/widget/tick`            | Widget 心跳                                   |

成功启动日志特征：

```text
[Database] Start to migration...
✅ database migration pass.
-------------------------------------
  ▲ Next.js 16.x.x
  - Local:        http://localhost:3210
  - Network:      http://0.0.0.0:3210
 ✓ Starting...
 ✓ Ready in 95ms
```

> **官方镜像承诺「空数据库 → 完整表」的自动建表稳定性**，建议使用空库实例，省去手工维护 migration。

---

## 11. 端口与网络矩阵

| 端口 | 服务             | 谁需要访问               | 备注                                           |
| ---- | ---------------- | ------------------------ | ---------------------------------------------- |
| 3210 | lobe (Next.js)   | 浏览器 / 反代            | `LOBE_PORT` 可改；容器内固定 3210              |
| 8787 | Agent Gateway    | **浏览器**（WebSocket）  | 反代须允许 WS 升级 + 长读取超时                |
| 8788 | Device Gateway   | 用户设备（`lh connect`） | 工具调用回传                                   |
| 9000 | RustFS S3 API    | **浏览器**（预签名直传） | `S3_ENDPOINT` 必须浏览器可达                   |
| 9001 | RustFS 控制台    | 运维                     | 可选                                           |
| 5432 | PostgreSQL       | lobe 容器 / DBA          | 生产建议不发布到宿主                           |
| 6379 | Redis            | lobe 容器                | 生产建议不发布到宿主                           |
| 8080 | SearXNG          | lobe 容器（内网）        | `SEARXNG_URL`                                  |
| 9200 | Elasticsearch    | lobe / sync worker       | **绝不发布**（`xpack.security.enabled=false`） |
| 3010 | 本地 dev（Next） | 开发机                   | `bun run dev:next`                             |
| 3011 | 独立 Hono 服务   | 开发 / 部署              | `HONO_PORT`                                    |

本机私有部署（`docker-compose/local`）端口映射：lobe `127.0.0.1:33210`、S3 `33212`、S3 控制台 `33213`、Agent GW `33217`、Device GW `33218`；PG/Redis/SearXNG **不映射宿主端口**。

反代示例（Nginx / Caddy / Traefik）见 `docs/self-hosting/platform/docker-compose.zh-CN.mdx#反向代理配置`。

---

## 12. 环境变量矩阵

完整清单见 `.env.example`（535 行）与 `docs/self-hosting/environment-variables/`。

**权威 schema 在代码里**：`packages/env/src/`（`app.ts`、`file.ts`、`email.ts`…）用 zod 定义并校验全部服务端变量，通过 `@/envs/*` 别名导入；客户端 / 全局默认值在 `packages/app-config`。新增或改名环境变量必须同步这三处 + `.env.example` + 文档。

### 12.1 必选（服务端数据库模式）

| 变量                | 说明                                        | 生成方式                  |
| ------------------- | ------------------------------------------- | ------------------------- |
| `DATABASE_URL`      | PG 连接串                                   | —                         |
| `DATABASE_DRIVER`   | 设为 `node` 触发容器内自动迁移              | —                         |
| `KEY_VAULTS_SECRET` | 凭据落库加密密钥                            | `openssl rand -base64 32` |
| `AUTH_SECRET`       | Better Auth 会话加密                        | `openssl rand -base64 32` |
| `APP_URL`           | 浏览器 / OAuth 回调 /webhook 使用的对外地址 | —                         |
| `INTERNAL_APP_URL`  | **容器内部自调用地址**                      | `http://localhost:3210`   |

> ⚠️ **`INTERNAL_APP_URL` 在 Compose 部署中必须配置**。AI 生图等异步功能需要容器内 HTTP 自调用；缺失时回退到 `APP_URL`，若 `APP_URL` 是宿主机 IP，容器内不可达 → 异步功能**静默失败**。

### 12.2 Gateway 模式

`ENABLE_AGENT_GATEWAY`、`AGENT_GATEWAY_URL`、`AGENT_GATEWAY_INTERNAL_URL`、`AGENT_GATEWAY_PROTOCOL`、`AGENT_GATEWAY_SERVICE_TOKEN`、`DEVICE_GATEWAY_SERVICE_TOKEN`、`DEVICE_GATEWAY_URL`、`GATEWAY_SERVICE_TOKEN`、`JWKS_KEY`、`JWKS_PUBLIC_KEY`。

生成命令：

```bash
openssl rand -hex 32    # GATEWAY_SERVICE_TOKEN
docker run --rm --entrypoint /bin/node lobehub/lobehub -e 'const c=require("crypto");const {privateKey,publicKey}=c.generateKeyPairSync("rsa",{modulusLength:2048});const meta={alg:"RS256",kid:c.randomBytes(8).toString("hex"),use:"sig"};console.log("JWKS_KEY="+JSON.stringify({keys:[{...privateKey.export({format:"jwk"}),...meta}]}));console.log("JWKS_PUBLIC_KEY="+JSON.stringify({keys:[{...publicKey.export({format:"jwk"}),...meta}]}))'
```

### 12.3 S3

`S3_ENDPOINT`（浏览器可达）、`S3_INTERNAL_ENDPOINT`（容器内网）、`S3_BUCKET`、`S3_ACCESS_KEY`/`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_ENABLE_PATH_STYLE`、`S3_SET_ACL`、`NEXT_PUBLIC_S3_DOMAIN`。

### 12.4 Redis

`REDIS_URL`、`REDIS_DATABASE`、`REDIS_USERNAME`、`REDIS_PASSWORD`、`REDIS_TLS`、`REDIS_PREFIX`。

### 12.5 检索

`FTS_SEARCH_PROVIDER`（`pg_search`/`pg_like`/`elasticsearch`）、`ES_URL`、`ES_API_KEY`、`ES_JAVA_OPTS`、`ES_REINDEX_STATE_DIR`、`FTS_SEARCH_SYNC_ENABLED`、`FTS_SEARCH_SYNC_INTERVAL_SECONDS`、`SEARXNG_URL`。

### 12.6 安全

`ENABLED_CSP`、`SSRF_ALLOW_PRIVATE_IP_ADDRESS`、`SSRF_ALLOW_IP_ADDRESS_LIST`、`PROXY_URL`、`ENABLE_PROXY_DNS`。

### 12.7 能力开关与外部服务

`FEATURE_FLAGS`（`+`/`-` 组合，**不支持 `all`**）、模型 Provider（`OPENAI_*`/`ANTHROPIC_*`/`GOOGLE_*`/`AWS_*`/`OLLAMA_*`/…）、`MARKET_BASE_URL`、`PLUGINS_INDEX_URL`、`AGENTS_INDEX_URL`、`SANDBOX_PROVIDER`、`QSTASH_TOKEN`/`QSTASH_URL`、`EMAIL_SERVICE_PROVIDER`、`ASSET_BASE_URL`/`NEXT_PUBLIC_ASSET_PREFIX`、`LLM_VISION_IMAGE_USE_BASE64`。

常用 Feature Flag（完整表见 `docs/self-hosting/advanced/feature-flags.zh-CN.mdx`）：

| Flag                | 默认 | 说明                                                 |
| ------------------- | ---- | ---------------------------------------------------- |
| `check_updates`     | 开   | 检查更新                                             |
| `provider_settings` | 开   | 模型供应商设置页                                     |
| `market`            | 开   | 助手市场                                             |
| `knowledge_base`    | 开   | 知识库                                               |
| `ai_image`          | 开   | AI 生图（`/image`）                                  |
| `speech_to_text`    | 开   | 语音转文本                                           |
| `agent_share`       | 关   | 交互式助理分享（还需部署侧支持）                     |
| `agent_gateway_mux` | 关   | 按用户复用网关连接（需网关 `/v2/ws` + `PROTOCOL=2`） |
| `agent_llm_relay`   | 关   | 由客户端执行单次模型调用（本地 / 私网 Provider）     |
| `rag_eval`          | 关   | RAG 评估                                             |
| `api_key_manage`    | 关   | API 密钥管理页                                       |

> `FEATURE_FLAGS` 只是布尔开关，**不能替代服务配置、权限、凭据或部署要求**；开关名与默认值随版本变化，须核对所部署版本的定义。

---

## 13. 运维手册

### 13.1 常用命令

```bash
docker compose ps                       # 服务状态
docker compose logs -f lobe             # 单服务日志
docker compose restart lobe             # 重启
docker compose pull && docker compose up -d   # 升级到最新版
docker compose down                     # 停止（保留数据）
docker compose down -v                  # ⚠️ 清空数据卷
```

### 13.2 健康检查

```bash
curl -fsS http://localhost:3210/api/v1/health     # { ok: true, service: '@lobechat/server' }
docker compose exec postgresql pg_isready -U postgres -h 127.0.0.1
docker compose exec redis redis-cli ping
curl -fsS http://localhost:9000/health             # RustFS
```

### 13.3 备份与恢复

```bash
# PostgreSQL
docker compose exec postgresql pg_dump -U postgres lobechat > backup.sql
docker compose exec -T postgresql psql -U postgres lobechat < backup.sql

# 对象存储
docker compose exec rustfs tar czf /tmp/backup.tar.gz /data
docker cp lobe-rustfs:/tmp/backup.tar.gz ./rustfs-backup.tar.gz

# Redis（AOF 自动持久化，手动快照）
docker compose exec redis redis-cli BGSAVE
```

同时备份 `.env`（`KEY_VAULTS_SECRET` 丢失 → 已加密凭据不可解；`AUTH_SECRET` 丢失 → 全员掉线）。

### 13.4 升级已有部署（新增 Gateway）

```bash
cp .env .env.bak
curl -O https://raw.githubusercontent.com/lobehub/lobehub/HEAD/docker-compose/deploy/docker-compose.yml
# 在 .env 补齐：AGENT_GATEWAY_PORT / DEVICE_GATEWAY_PORT / AGENT_GATEWAY_URL /
#              DEVICE_GATEWAY_URL / GATEWAY_SERVICE_TOKEN
# 从现有 JWKS_KEY 导出公钥：
docker run --rm -e JWKS_KEY="$(grep '^JWKS_KEY=' .env | cut -d= -f2-)" --entrypoint /bin/node lobehub/lobehub \
  -e 'const {d,p,q,dp,dq,qi,...pub}=JSON.parse(process.env.JWKS_KEY).keys[0];console.log("JWKS_PUBLIC_KEY="+JSON.stringify({keys:[pub]}))'
docker compose up -d --force-recreate
```

未补齐时症状：`lobe-gateway` 容器反复重启、Agent 退回浏览器运行、`docker logs lobehub` 打印 `ACTION REQUIRED`。

> 网关状态在内存中，重启会中断在途运行。替换 `JWKS_KEY` 后桌面端与 CLI 可能需重新登录。

### 13.5 故障排查

| 症状                    | 排查                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 服务无法启动            | `docker compose ps` / `logs`；常见：端口占用（改 `LOBE_PORT`）、磁盘不足、DB 连接失败                                                        |
| 数据库连接错误          | `pg_isready`；`docker compose logs postgresql`；首次初始化 TCP 端口开启较晚（`start_period: 60s`）                                           |
| 建表失败                | `docker compose down && sudo rm -rf ./data && docker compose up -d`（**会清库**）                                                            |
| 文件上传失败            | `logs rustfs` / `logs rustfs-init`；`exec rustfs ls /data/lobe` 确认 bucket；CORS 异常 → `docker compose up -d --force-recreate rustfs-init` |
| 对话内图片裂开          | `S3_ENDPOINT` 写成了容器内网地址，改为浏览器可达地址                                                                                         |
| 生图 / 异步功能静默失败 | 未配置 `INTERNAL_APP_URL`                                                                                                                    |
| Agent 不在服务端跑      | Gateway `.env` 未补齐（见 §13.4）；或 `AGENT_GATEWAY_URL` 反代未开 WebSocket 升级                                                            |
| 磁盘不足                | `docker system df`；`docker system prune -a --volumes`（**先备份**）                                                                         |
| 代理证书报错            | `docs/self-hosting/faq/proxy-with-unable-to-verify-leaf-signature.zh-CN.mdx`                                                                 |

---

## 14. 开发环境与质量门禁

### 14.1 启动

```bash
bun run dev:spa      # 仅前端 SPA（Vite），API 代理到 localhost:3010
bun run dev          # 全栈（Next.js + Vite SPA 并行）
bun run dev:next     # 仅 Next.js（3010）
bun run dev:docker   # 起本地依赖：postgresql / redis / rustfs / searxng
pnpm --filter @lobechat/server dev   # 独立 Hono 后端
bun run dev:desktop  # Electron
```

`dev:spa` 启动后终端会打印 **Debug Proxy** URL（`https://app.lobehub.com/_dangerous_local_dev_proxy?debug-host=...`），可用本地 Vite SPA 对接线上后端。**这是开发便利，不是验收面**。

### 14.2 质量检查

```bash
bun run check [changed-files...]     # 默认范围 = 所有 staged/unstaged/untracked 变更
bun run check --lint --test --type   # 选择器可组合
```

- 无选择器 = lint + 相关测试；`--type` 检查全仓
- **禁止** `bun run test`（跑全量套件）
- 单包手动测试：`cd packages/database && bunx vitest run --silent='passed-only' '[file-path]'`
- `--alint` 为可选的模型驱动规则（`packages/alint/`），需先 `bun run alint:setup`
- 每个 bug fix 需附**修复前失败、修复后通过**的回归测试（纯样式 / CSS 除外）
- 其他门禁：ESLint、Stylelint、tsc、dpdm（循环依赖）、knip（死代码）

### 14.3 Git 约定

- `canary` = 开发分支（云生产），`main` = 发布分支；新分支从 `canary` 切，PR 回 `canary`
- `git pull` 用 rebase；commit 前缀 gitmoji；分支名 `<type>/<feature-name>`
- 包管理用 `pnpm`，跑脚本用 `bun`，可执行包用 `bunx`

### 14.4 i18n

新增 key → `packages/locales/src/default/*.ts`；同一 PR 内手工提供 en-US（`locales/en-US/`）与 zh-CN（`locales/zh-CN/`）；其余语种由每日 CI（`.github/workflows/auto-i18n.yml`）自动补齐。`bun run i18n` 慢且需 `OPENAI_API_KEY`，仅在急需时手动跑。

### 14.5 验收

改动了产品行为且无有效既有证据时，须按 `.agents/skills/acceptance/SKILL.md` 在真实运行环境验证、采集证据并发布，PR 正文附 `https://app.lobehub.com/acceptance/<id>`。纯文档、纯重构、无行为变更的工具改动、gitlink 同步可免，但需在 PR 说明理由。

---

## 15. 附录：文档索引

### 架构与开发

| 主题                | 路径                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 架构设计            | `docs/development/basic/architecture.zh-CN.mdx`                                                                                                  |
| 目录架构            | `docs/development/basic/folder-structure.zh-CN.mdx`                                                                                              |
| 开发环境搭建        | `docs/development/basic/setup-development.zh-CN.mdx`                                                                                             |
| Chat API            | `docs/development/basic/chat-api.zh-CN.mdx`                                                                                                      |
| 特性开发            | `docs/development/basic/feature-development.zh-CN.mdx`                                                                                           |
| 测试                | `docs/development/basic/test.zh-CN.mdx`、`docs/development/tests/integration-testing.zh-CN.mdx`                                                  |
| 状态管理            | `docs/development/state-management/*.zh-CN.mdx`                                                                                                  |
| 数据库 Schema       | `docs/development/database-schema.dbml`（`bun run db:visualize`）                                                                                |
| 仓库地图 / 代码归属 | `.agents/skills/project-overview/SKILL.md`、`AGENTS.md`                                                                                          |
| 各专项 Skill        | `.agents/skills/{drizzle,trpc-router,zustand,react,spa-routes,db-migrations,full-text-search,heterogeneous-agent,upstash-workflow,...}/SKILL.md` |

### 部署与运维

| 主题                                           | 路径                                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 部署平台选型                                   | `docs/self-hosting/start.zh-CN.mdx`                                                                                                                  |
| Docker                                         | `docs/self-hosting/platform/docker.zh-CN.mdx`                                                                                                        |
| Docker Compose                                 | `docs/self-hosting/platform/docker-compose.zh-CN.mdx`                                                                                                |
| Vercel / Zeabur / Sealos / Dokploy / Repocloud | `docs/self-hosting/platform/*.zh-CN.mdx`                                                                                                             |
| 环境变量总览                                   | `docs/self-hosting/environment-variables.zh-CN.mdx` + `environment-variables/{basic,auth,s3,redis,analytics,model-provider,cloud-sandbox}.zh-CN.mdx` |
| 认证（Better Auth / SSO）                      | `docs/self-hosting/auth.zh-CN.mdx` + `auth/providers/*.zh-CN.mdx`                                                                                    |
| v1 → v2 迁移                                   | `docs/self-hosting/migration/v2/*.zh-CN.mdx`                                                                                                         |
| Feature Flags                                  | `docs/self-hosting/advanced/feature-flags.zh-CN.mdx`                                                                                                 |
| 全文检索                                       | `docs/self-hosting/advanced/full-text-search.zh-CN.mdx`                                                                                              |
| 知识库                                         | `docs/self-hosting/advanced/knowledge-base.zh-CN.mdx`                                                                                                |
| 对象存储（R2 / 腾讯云 / RustFS）               | `docs/self-hosting/advanced/s3/*.zh-CN.mdx`                                                                                                          |
| Redis / Upstash                                | `docs/self-hosting/advanced/redis*.zh-CN.mdx`                                                                                                        |
| 可观测性（Grafana）                            | `docs/self-hosting/advanced/observability/grafana.zh-CN.mdx`                                                                                         |
| 联网搜索                                       | `docs/self-hosting/advanced/online-search.zh-CN.mdx`                                                                                                 |
| 桌面端                                         | `docs/self-hosting/advanced/desktop.zh-CN.mdx`、`apps/desktop/README.zh-CN.md`                                                                       |
| FAQ                                            | `docs/self-hosting/faq/*.zh-CN.mdx`                                                                                                                  |
| 本机私有部署（本仓库）                         | `docker-compose/local/README.md`                                                                                                                     |

### 关键源码入口

| 用途                | 路径                                                           |
| ------------------- | -------------------------------------------------------------- |
| Next.js 构建配置    | `next.config.ts` → `src/libs/next/config/define-config.ts`     |
| 镜像构建            | `Dockerfile`                                                   |
| 容器启动器          | `scripts/serverLauncher/startServer.js`                        |
| DB 迁移             | `scripts/migrateServerDB/`、`packages/database/migrations/`    |
| SPA 构建产物汇总    | `scripts/copySpaBuild.mts`、`scripts/generateSpaTemplates.mts` |
| Compose（生产）     | `docker-compose/deploy/docker-compose.yml` + `setup.sh`        |
| Compose（开发依赖） | `docker-compose/dev/docker-compose.yml`                        |
| Compose（本机私有） | `docker-compose/local/compose.yml`                             |
| Compose（可观测性） | `docker-compose/production/grafana/docker-compose.yml`         |
| 环境变量样例        | `.env.example`、`.env.example.development`、`.env.desktop`     |
| 认证配置            | `src/auth.ts`                                                  |
| Hono 独立服务       | `apps/server/src/router-hono/{index,standalone,dev}.ts`        |
| 对外 OpenAPI        | `packages/openapi/src/{app,spec}.ts`                           |

---

_本文档由仓库源码与既有文档梳理生成；如与源码冲突，以源码为准。_
