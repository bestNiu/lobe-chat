# LobeHub 开发规范

本规范用于指导 AI 编码智能体在本开源 LobeHub 仓库及有临企业定制开发中的工作方式。

目标是让智能体的工作保持：

* 正确；
* 可维护；
* 可测试；
* 安全可控；
* 能够自主闭环；
* 与当前开发阶段相匹配。

原则上，优先完成有价值的产品工作，避免围绕工作本身制造过多流程。

---

## 技术栈

* Next.js 16 + React 19 + TypeScript
* Next.js 内部使用 `react-router-dom` 承载 SPA
* UI 使用 `@lobehub/ui`、antd、antd-style
* 国际化使用 react-i18next
* 状态管理使用 zustand
* 数据获取使用 SWR
* 前后端类型安全通信使用 TRPC
* ORM 使用 Drizzle ORM + PostgreSQL
* 测试使用 Vitest

---

## Agent Skills

`AGENTS.md` 负责仓库级架构、工作流和执行边界。

具体实现规则尽量放在对应 Skill 中，避免出现多个规则来源。

### React 与 TSX

修改以下内容之前，先阅读 `react` skill：

* React 组件；
* 组件状态；
* hooks；
* render 边界；
* memoization；
* 组件组合；
* 与渲染性能相关的逻辑。

`react` skill 负责：

* 组件选择；
* 样式规范；
* 状态放置；
* render 性能；
* React 实现约束。

### 重型业务功能拆分

当需要把大型 Viewer / Page 拆成：

* 页面；
* Portal；
* Share；
* Micro App；
* 可复用能力；

等独立模块时，先阅读 `compose-atoms` skill。

应按照**可独立挂载的业务能力和职责**进行拆分，而不是单纯按照视觉区域拆分。

不要通过以下形式让不需要的功能继续执行：

* `readOnly`
* `mode`
* `hidden`
* 其他纯展示控制参数

如果某项能力不需要运行，应从结构上避免挂载，而不是隐藏。

---

## 代码归属

如果不确定某段代码应该放在哪里，或者需要查看完整仓库结构，先阅读 `project-overview` skill。

### 后端

`apps/server/src`

包含：

* 后端运行时；
* Router；
* Service；
* 后端业务逻辑。

通过以下方式引用：

```ts
@/server/*
```

`src/app/(backend)` 只用于 Next.js Route Shell。

不要把真正的后端业务逻辑放到 `src/app/(backend)`。

### Next.js Shell

`src/app`

主要负责：

* Next.js HTML Shell；
* 认证 Shell；
* Server Render 入口。

Web Shell 辅助逻辑应放在：

* `src/libs`
* 或对应的 app segment

除非确实属于后端 Runtime，否则不要放进 `src/server`。

### SPA

`src/spa`

负责：

* SPA 入口；
* React Router；
* SPA 层集成。

`src/routes` 只保留轻量页面路由片段。

真正的业务 UI 和业务逻辑应按领域放入：

```text
src/features
```

不要在 `src/routes` 内再次创建 `features` 目录。

### 客户端服务和状态

`src/services`

负责客户端 API Service。

`src/store`

负责 Zustand State。

涉及数据获取和缓存策略时，阅读：

```text
data-fetching-architecture
```

涉及 Zustand 设计时，阅读：

```text
zustand
```

### Desktop 与 CLI

```text
apps/desktop
```

负责 Electron 应用。

```text
apps/cli
```

负责 CLI 应用。

### Shared Packages

```text
packages
```

包含共享能力，例如：

* `database`
* `agent-runtime`
* `env`
* `locales`

以及其他跨应用公共能力。

### E2E

```text
e2e
```

包含：

* Cucumber；
* Playwright；

端到端测试。

---

## SPA Route 修改

修改 SPA Route 前，先阅读 `spa-routes` skill。

Web 和 Electron 共用的：

* Route Path；
* Metadata；
* Lazy Loader；
* `preloadId`

统一注册在：

```text
src/spa/router/desktopRouter.shared.tsx
```

`desktopRouter.config*.tsx`

只保留平台差异。

同时保持：

```text
desktopRouter.sync.test.tsx
```

通过。

不要在多个 Platform Config 中重复定义同一套路由。

---

# 开发

## 启动开发环境

### SPA 开发模式

仅启动前端，并代理 API 到 `localhost:3010`：

```bash
bun run dev:spa
```

### Full Stack

同时运行 Next.js 和 Vite SPA：

```bash
bun run dev
```

### 独立后端

```bash
pnpm --filter @lobechat/server dev
```

启动 `dev:spa` 后，终端可能会输出 **Debug Proxy** 地址，例如：

```text
https://app.lobehub.com/_dangerous_local_dev_proxy?debug-host=http%3A%2F%2Flocalhost%3A9876
```

该入口可以将本地 SPA 加载到在线后端环境中，方便 HMR 和真实服务器配置调试。

仅在任务确实适合这种方式时使用。

不要把远程或生产关联的 Debug Proxy 当成本地企业环境真实验证的替代品。

---

## Git 工作流

### 分支策略

* `canary`：主开发分支
* `main`：发布分支

上游 LobeHub 风格的新分支通常从：

```text
canary
```

创建。

PR 通常目标为：

```text
canary
```

对于有临企业分支，优先遵循当前已经建立的企业分支策略，不要擅自切换工作流。

### Pull

使用 Rebase：

```bash
git pull --rebase
```

### Commit

Commit Message 遵循仓库现有 gitmoji 规范。

### Branch Name

使用：

```text
<type>/<feature-name>
```

例如：

```text
feat/enterprise-sso
fix/session-enforcement
refactor/admin-boundary
```

未经当前任务授权，不要擅自：

* commit；
* push；
* merge；
* 发布。

---

## 包管理

依赖管理使用：

```text
pnpm
```

运行 npm scripts 使用：

```text
bun
```

运行 npm 可执行包使用：

```text
bunx
```

没有明确仓库级理由，不要再引入其他包管理器。

---

# 完整任务自主闭环执行

当用户交付一个完整任务时，可以在内部拆成任意数量的步骤。

这些内部步骤**不是暂停点**。

不得仅因为：

* 一个阶段完成；
* 一个 Milestone 完成；
* 一次测试通过；
* 一个文件写完；
* 一份计划生成；

就停下来等用户说：

```text
继续
```

---

## 默认执行链

除非遇到真正需要人工决策、缺失必要外部信息、不可逆生产操作或超出当前授权范围的动作，否则必须自主连续执行：

```text
理解
→ 规划
→ 开发
→ 测试
→ 修复
→ 必要重构
→ 回归
→ 最终 Diff 自检
→ UAT
→ 简洁文档
→ 最终汇报
```

不要在任务尚未完成时因为某个中间阶段完成而主动停止。

---

## Definition of Done

Definition of Done 应根据以下内容确定：

* 用户明确要求；
* 当前任务范围；
* 仓库已有规则；
* 已明确的验收标准；
* 产品实际可观察结果。

不得：

* 擅自缩小任务范围；
* 擅自降低验收标准；
* 将部分完成描述成全部完成；
* 把某一个 Unit Test 通过当成整个功能已经完成；
* 把 Build 成功当成真实产品功能已经可用。

修复完成后，应：

* 执行相关 Regression；
* 检查最终 Git Diff；
* 用户可见功能需要执行真实产品验证。

---

## 真正需要暂停的情况

只有遇到类似以下情况时，才应暂停并要求用户决策：

* 需要明确业务决策；
* 存在两个互斥且影响明显的产品方案；
* 缺少必须的凭据或权限；
* 需要执行不可逆生产操作；
* 需要执行破坏性数据库变更；
* 需要生产发布授权；
* 操作超出当前用户授权；
* 缺少决定最终结果的必要外部信息。

发生阻塞时，必须说明：

1. 为什么被阻塞；
2. 已经完成了什么；
3. 具体需要用户提供什么决策、授权或信息。

不得虚报已经完成。

本规则不会扩大原有授权范围。

不得因为“自主闭环”而擅自：

* 发布生产；
* 删除生产数据；
* 修改不可逆配置；
* 读取无关 Secret；
* Push 代码；
* 对外发布内容。

---

# 质量检查

优先使用：

```bash
bun run check [changed-files...]
```

---

## 检查范围

默认不带 selector 时：

```text
lint + related tests
```

以下 selector 可以组合：

```text
--lint
--test
--type
```

默认检查：

* staged；
* unstaged；
* untracked；

相关变更。

如果明确提供文件路径，则按指定范围执行。

---

## Lint

Lint 可能自动修改文件。

执行完成后必须查看产生的 Diff。

不要因为：

```text
lint passed
```

就默认功能是正确的。

---

## Test

测试使用离当前代码最近的 Vitest Config。

普通任务禁止直接运行：

```bash
bun run test
```

因为这通常会运行完整测试套件。

优先执行最小相关测试集。

例如：

```bash
cd packages/database
bunx vitest run --silent='passed-only' '[file-path]'
```

---

## Type Check

`--type` 会检查整个仓库。

仅在当前变更确实需要时执行。

在快速迭代过程中，不要每修改一次小代码就重新执行一次完整仓库 Type Check。

---

## Regression Test

Bug 修复原则上需要 Regression Test：

```text
修复前失败
→ 修复后通过
```

但以下场景可以合理跳过：

* 纯 CSS；
* 纯样式调整；
* 没有实际行为变化；
* 唯一可写的测试只是匹配 CSS 源代码字符串。

不要为了满足流程而制造没有实际价值的测试。

---

# 有临企业开发的 Docker 测试原则

有临企业项目中：

**服务测试和可重复测试 Workload 默认优先运行在 Docker 中。**

对于适合在容器中执行的测试，使用：

```text
scripts/youlin/docker/README.md
```

定义的 Container Runner。

宿主机主要负责：

* Docker 调度；
* 代码编辑；
* Git；
* Artifact 整理；
* 本地环境协调。

如果某项测试本来就应该在 Docker 内运行，不要仅因为 Docker 配置暂时不完整，就直接改成宿主机执行。

应该优先修复合理的 Container Test Path。

---

## Native Test 例外

不要为了一个本来就不适合 Docker 的测试，反过来扩大任务范围去建设容器化基础设施。

以下测试可能合理运行在 Host：

* 浏览器 UAT；
* Playwright 驱动真实浏览器；
* Keycloak / OIDC Redirect；
* OS 特定 Smoke Test；
* Desktop 集成；
* 本地编排脚本；
* 依赖真实 Host 环境的连接验证。

Native Test 如需记录原因，简洁记录即可。

例如：

```text
Browser login UAT must run on the host because it validates the real local browser/OIDC surface.
```

一行即可。

不要专门创建：

```text
native-test-exception-plan.md
```

之类的流程文档。

---

# Acceptance 验收

用户可见功能完成后，必须在真实产品表面验证。

只通过自动化检查，并不等于真实产品已经验收。

---

## 普通本地开发和 MVP

日常本地开发中，应按任务需要执行：

* Test；
* Lint；
* Type Check；
* Build；
* 真实 CLI / Web / Electron 操作；
* 验证最终用户结果。

测试、Lint、Type Check 和 Build 属于：

```text
工程 Gate
```

不是：

```text
产品 Acceptance
```

---

## 优先使用最简单的 UAT

本地 MVP 阶段优先：

```text
打开真实产品
→ 执行用户操作
→ 检查结果
```

不要为了验证一次功能，马上建设通用 Acceptance Framework。

例如：

```text
验证一次 Keycloak 登录
```

优先：

```text
真实浏览器登录
→ OIDC Redirect
→ 登录成功
→ 回到产品
→ 验证 Session
```

而不是自动演变成：

```text
通用认证测试平台
+ Evidence 系统
+ Reviewer 系统
+ Acceptance Framework
```

一次性验证需求不应默认变成永久基础设施。

只有出现明确重复使用价值时，才考虑抽象。

---

## LobeHub Acceptance Round

本地开发不要求每次都执行：

```bash
lh acceptance run ingest
```

只有以下情况需要正式 Acceptance Round：

* PR 明确要求正式验收证据；
* Release Candidate；
* Production Candidate；
* 已有正式流程明确要求；
* 用户明确要求。

需要正式 Acceptance 时，再生成：

```text
https://app.lobehub.com/acceptance/<id>
```

并放到对应 PR / Release 记录中。

---

## 可以跳过 Acceptance 的情况

以下变更如果确实没有用户可见结果，可以跳过产品表面验收：

* Pure Refactor；
* Tooling；
* 内部代码整理；
* 无行为变化的结构调整。

简洁说明原因即可。

不要为了满足流程，制造一个虚假的 UI 验收动作。

---

# Code Review

**开发过程中的 Diff 自检**和**正式 Code Review**是两个不同流程。

不要混为一谈。

---

## 最终 Diff 自检

普通开发任务完成后，主 Agent 必须自己检查最终 Git Diff。

至少检查：

* 是否有意外修改；
* 是否遗留 Debug Code；
* 是否遗留临时日志；
* 是否包含 Secret；
* 是否误提交生成文件；
* 是否有未完成代码；
* 是否存在明显 Regression；
* 是否出现 Scope Creep；
* 是否出现重复逻辑；
* 是否违反依赖方向；
* 是否缺少必要测试；
* 是否出现意外 API / Schema 变化。

这是普通开发流程中的**主 Agent 自检**。

它不触发：

* `deep-review`；
* Independent Reviewer；
* Review Subagent；
* Review Orchestration；
* 额外 Review Ceremony。

---

## 正式 Code Review

只有在以下场景执行正式 Code Review：

* 用户明确要求 Code Review；
* 正式 PR Review；
* 已建立的 Release 流程要求 Review；
* 用户明确要求 Deep Review。

正式 Review 前阅读：

```text
deep-review
```

skill。

---

## Light Review

普通正式 Code Review 使用 Light Mode。

Light Mode 默认：

* 1 个独立 Reviewer；
* 按维度 Quick Checklist Review；
* 输出明确 Findings；
* 不再派第二层 Reviewer；
* 不创建 Reviewer Tree；
* 不增加无必要 Review Ceremony。

Light Review 中的 Reviewer 不得再自行派其他 Reviewer。

---

## Deep Review

完整 Multi-Agent Deep Review 只有在：

**用户明确要求**

时才能执行。

禁止主 Agent 自己判断：

> “这个问题比较重要，所以我要升级成 Deep Review。”

例如以下内容本身并不能自动触发 Deep Review：

* Authentication；
* Authorization；
* Migration；
* Session；
* Credential；
* Admin；
* Security-sensitive code；
* Infrastructure。

风险较高时，优先加强：

* Targeted Test；
* Negative Path；
* Rollback；
* UAT；
* 主 Agent 检查。

而不是自动增加：

* Reviewer；
* Subagent；
* 文档；
* Gate。

---

## 用户界面 Review

设计或 Review 以下用户流程时：

* Empty State；
* Loading State；
* Error State；
* Confirmation；
* Async Feedback；
* Button Hierarchy；
* Large List；
* Picker；
* Permission；
* Authentication；
* Admin Flow；

遵循：

```text
DESIGN.md
```

中的设计价值：

```text
Natural / 自然
Meaningful / 意义感
Certainty / 确定性
Growth / 成长
```

不仅检查：

```text
代码能不能运行
```

还要关注：

* 用户知不知道正在发生什么；
* 用户知不知道操作成功没有；
* 用户知不知道失败原因；
* 用户知不知道下一步做什么；
* 主次操作是否明确；
* 危险操作后果是否清楚。

---

# 文件规模与架构解耦

避免单个文件不断膨胀，并持续承担多个无关职责。

新增和修改代码时，应按照：

* 业务能力；
* 模块边界；
* 变化原因；
* 责任范围；

组织文件。

目标：

```text
高内聚
低耦合
明确依赖方向
```

---

## 分层原则

根据实际情况保持以下职责清晰：

* 业务规则；
* Use Case 编排；
* 数据持久化；
* 外部系统 Adapter；
* Transport / API；
* UI / Presentation。

避免：

* 循环依赖；
* 跨层访问；
* 全局共享可变状态；
* 隐式耦合；
* 业务代码直接依赖不必要的基础设施细节。

---

## 什么时候应该拆分

出现以下情况时，应考虑当前任务内适当拆分：

* 文件承担多个无关职责；
* 函数过长且难理解；
* 大量重复逻辑；
* 代码很难独立测试；
* 一个模块因为多个不同原因频繁修改；
* 不同业务能力只是因为历史原因被塞进同一个文件。

测试和测试编排代码也遵循同样原则。

---

## 不要机械拆分

不要仅因为：

```text
超过某个行数
```

就机械拆文件。

大约 800 行可以作为：

```text
重新检查职责是否过多
```

的信号。

但不是：

```text
超过 800 行必须拆
```

的硬规则。

真正判断依据应是：

* 职责是否清晰；
* 可读性；
* 可测试性；
* 修改是否容易隔离；
* 后续维护成本。

避免：

* 无意义的小文件碎片；
* 纯转发层；
* 万能 `utils`；
* 没有实际需要的抽象；
* 只有一个简单调用方的复杂抽象；
* 过早微服务化。

---

## 重构范围

如果为了当前功能安全实现，确实需要重构，可以在当前任务中执行。

但不要因为实现一个小功能，顺便把整个架构全部重写。

除非需求明确改变，否则重构应保持：

* Existing Behavior；
* External Contract；
* Transaction Boundary；
* Compatibility。

必要时补齐测试并完成 Regression。

---

# i18n

新增国际化 Key 时，放入：

```text
packages/locales/src/default/
```

对应 Namespace。

例如：

```text
agent.ts
auth.ts
```

普通产品改动至少同步：

```text
en-US
zh-CN
```

英文源维护在：

```text
packages/locales/src/default/*.ts
```

同步到：

```text
locales/en-US/
```

中文手工翻译到：

```text
locales/zh-CN/
```

其他语言交给：

```text
.github/workflows/auto-i18n.yml
```

自动处理。

只有确实需要马上生成其他语言时，才运行：

```bash
bun run i18n
```

该过程较慢，并依赖：

```text
OPENAI_API_KEY
```

不要手工修改由自动翻译流程负责维护的语言文件。

---

# 安全敏感变更

以下类型变更需要更加谨慎：

* Authentication；
* Authorization；
* Session；
* Administrator Boundary；
* Database Migration；
* Bootstrap；
* Credential Handling。

但是：

**安全敏感 ≠ 自动增加流程。**

优先保证：

1. 最小权限；
2. Deny by Default；
3. 明确授权检查；
4. Safe Failure；
5. Regression Test；
6. Negative Path；
7. 必要时可回滚；
8. 真实 UAT。

不要认为：

```text
Review 人越多
文档越多
Gate 越多
```

就自动意味着系统更安全。

---

## Credential

禁止：

* 打印密码；
* 输出 Token；
* Commit Secret；
* 把凭据写进 Source Code；
* 在 Diagnostic Log 中输出敏感值。

使用项目已有 Secret Handling 方式。

临时本地测试凭据应：

* 最小暴露；
* 限制文件权限；
* 不无必要传播；
* 使用结束后按实际需要清理。

不要因为 `.env` 存在，就读取与当前任务无关的 Secret。

---

## Bootstrap / First Admin

Administrator Bootstrap 应：

* 范围尽量小；
* 行为清晰；
* 能够防止意外重复执行；
* 在不需要时默认不可访问；
* 具备足够可验证性。

不要仅因为存在 Bootstrap Flow 就自动创建额外 Ceremony。

优先直接验证关键行为。

---

# 文档原则

文档应服务于：

* 后续维护；
* 运维；
* 架构理解；
* Migration；
* Recovery；
* Integration；
* 长期有价值的决策记录。

不要创建文档仅仅为了证明：

```text
某一步流程执行过
```

优先更新现有合适文档。

适合长期保留的内容，例如：

* Architecture Decision；
* 运维说明；
* Migration Note；
* Recovery Procedure；
* 外部集成限制；
* 产品重要行为变化。

不建议每次都新建：

* Test Run 文档；
* Review 文档；
* Exception 文档；
* 每个 Milestone 文档；
* 每个开发阶段 Evidence 文档。

如果在现有 Task Log 中增加一句话就足够，就不要创建一个新文件。

对于已经冻结的历史 Evidence，不要直接修改。

需要补充时，增加新的记录。

---

# 避免流程膨胀

本地开发和 MVP 阶段，只使用足以证明以下内容的最小流程：

* Correctness；
* Safety；
* Maintainability；
* User-visible Functionality。

不要自动增加：

* Review Agent；
* Review Layer；
* Ceremony Document；
* Approval Gate；
* Evidence Workflow；
* Acceptance Framework；
* Test Framework；
* Coordination Layer；
* Permanent Helper Infrastructure。

除非：

* 用户明确要求；
* 正式 PR 流程已有要求；
* Release 流程已有要求；
* Production 流程已有要求；
* 已经证明存在持续、重复使用价值。

以下情况本身不能作为新增 Review Workflow 的充分理由：

* Authentication；
* Authorization；
* Migration；
* Admin；
* Security Code；
* Credential；
* Session Enforcement。

风险变高时，应优先加强：

* Implementation Check；
* Targeted Regression；
* Negative Test；
* Rollback；
* Direct UAT。

不要首先增加：

* 人；
* Agent；
* 文档；
* Gate。

---

## 一次性需求保持一次性

一次性的本地验证需求，不要默认建设成永久基础设施。

例如：

```text
只需要验证一次 Keycloak Login
```

合理路径：

```text
写一个简单直接的浏览器 UAT
→ 执行
→ 验证
→ 根据是否会复用决定保留或删除
```

不应自动扩张成：

```text
Generic Authentication Framework
→ Reviewer Framework
→ Acceptance Framework
→ Evidence Framework
→ Ceremony Documentation
```

临时验证工具优先：

* 简单；
* 易读；
* 易删除；
* 目的明确。

只有重复使用价值已经被证明后，再抽象。

---

## 默认开发流程

普通本地开发：

```text
理解
→ 开发
→ 测试
→ 修复
→ 回归
→ 最终 Diff 自检
→ UAT
→ 简洁文档
→ 完成
```

用户明确要求 Code Review：

```text
读取 deep-review
→ Light Review
→ 1 个 Independent Reviewer
→ Findings
```

用户明确要求 Deep Review：

```text
读取 deep-review
→ Multi-Agent Deep Review
→ Consolidated Findings
```

禁止智能体自行从一个等级升级到另一个等级。

---

# Agent 停止规则

只有以下情况应该停止：

## 任务完成

已经满足当前任务的 Definition of Done。

## 真正阻塞

需要：

* 用户决策；
* 授权；
* Credential；
* 外部依赖；
* 不可逆操作确认。

## 安全边界

继续执行会超出当前授权或者违反仓库安全规则。

以下情况不能作为停止理由：

* 一个内部阶段完成；
* Plan 写完；
* 一个测试通过；
* 一个 Subtask 完成；
* 一个 Reviewer 完成；
* 文档写完；
* 某个 Milestone 完成。

在当前可用执行窗口内，应优先完成真实任务，而不是增加无必要 Ceremony。

---

# 最终汇报

任务完成后，最终汇报应简洁说明：

* 修改了什么；
* 关键实现决策；
* 执行了哪些测试；
* 是否完成 UAT；
* 是否还有明确限制或风险；
* 用户需要知道的关键文件或命令。

不要输出大量内部执行日志，除非这些日志确实对用户有价值。

不要声称没有执行过的检查已经完成。

不要把：

```text
计划做
```

描述成：

```text
已经做完
```

最终汇报必须反映仓库和产品的真实状态。
