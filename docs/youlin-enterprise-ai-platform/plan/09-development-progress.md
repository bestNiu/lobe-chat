# 开发启动授权与里程碑进度

## 最新增量：首次真实 SSO 登录打通（仍未验收）

详见[续建记录末节](16-m0-m2-continuation.md)。已实现但**默认关闭、未经产品验收**：Better Auth 企业插件（Keycloak-only allowlist，关闭公开注册/邮箱密码/账号合并/身份变更）、逐请求 Session proof 强制与 `getSession`/HTTP 双重覆盖、手工开通与停用状态机（永久员工号、pending→active→disabled、精确 principal 绑定）、仅空库＋显式 local-test 配置下执行的首位管理员私有 bootstrap 仪式。

本机持久实例已重放 **165 条迁移**、完成引导仪式并处于 `login-test`；**首位管理员已完成一次真实 SSO 登录**（r7：`sessionEstablished=true`、落地应用首页、`userEmailMatchesPerson=true`，库内 1 条 session proof 绑定真实原生 session 且 epoch 与 subject 一致）。**仍无停用/隔离与双账号 UAT、无管理员 UI、网关 Key 为空**；独立初审 2 项 P1 与 3 项 P2 已修复并补先失败后通过的回归，容器内真实 PostgreSQL 两片与 server/app 定向套件、定向类型与定向 Lint 通过（非全仓）。浏览器验收 r1 的 7 道门禁已排定，首次截图因页面停留 loading 被隔离，0 个 case 记 pass。M0～M2 完整交付与产品 UAT 仍未完成。

### 本轮：登录阻塞定位与三项缺陷修复（已部署实测）

**根因（已定位并修复）**：r4～r6 复现显示 IdP 认证成功、code 交换成功，失败在 `getUserInfo` 的企业准入门。加入固定分类日志后一次复现即命名原因：`reason=INVALID_CREDENTIAL detail=ERR_JWT_CLAIM_VALIDATION_FAILED`；一次性无凭据诊断进一步给出 `claim=sub reason=missing`。Keycloak 26 通过 `basic` 客户端作用域的 `oidc-sub-mapper` 发出 `sub`，而 `localIdentityRealm.mjs` 显式写 `defaultClientScopes=['basic','profile','email']` 后，导入时 `basic` 被静默丢弃（实测该 client 只剩 `email`+`profile`），于是每个访问令牌都缺 `sub`，被 verifier 的 `requiredClaims:['sub']` 拒绝。隔离夹具 realm 不覆盖作用域，因此 14 项协议测试一直通过、未暴露此缺陷。

- **realm 作用域**：生成器不再手工指定 client scope（保留 Keycloak 默认，`basic` 随之分配）并加回归断言；live realm 用 Admin API 的专用作用域分配端点补回 `basic`（批量 client PUT 会静默忽略作用域名）。修复后探针显示令牌含 `sub`、`aud=youlin-api`、`azp=youlin-web`、`typ=Bearer`，真实 verifier **accepted**。一次性诊断/修复脚本用后删除。
- **受控失败**：企业失败记入本请求 store，wrapper 把 callback 的 5xx 换成 303 `<经校验的配置 origin>/auth-error?error=<粗粒度码>&attempt=<关联id>`，不带 set-cookie；浏览器只见 `youlin_admission_denied`/`youlin_login_unavailable`，内部 reason 仅进服务端日志，不泄露账号是否存在或已停用。首版误用容器内部请求 URL（`http://0.0.0.0:3210`）导致浏览器 `ERR_CONNECTION_REFUSED`，已改用配置 origin，并以两项先失败后通过的用例锁定。未记录企业失败的 5xx 不被掩盖。
- **可诊断性**：准入门输出固定分类 `reason`+`detail`（如 `ERR_JWT_CLAIM_VALIDATION_FAILED`、`AUTHORITY_NOT_FOUND`、`GATE_TIMEOUT`）；`classifyYoulinCredentialError` 只返回固定码或错误类名，不回显消息体（含泄露回归）。隔离实例 profile 注入两个 Youlin debug 命名空间（无通配符）。
- **打包缺陷**：4 个 SPA shell 路由（`spa`、`spa-auth`、`spa-share`、`spa-workbench`）改为 `force-dynamic`。新构建的 prerender-manifest 已完全不含这 4 条路由（旧构建在 `dynamicRoutes` 内），部署后访问 `/signin`、`/auth-error` 均 200 且 `Failed to update prerender cache` 计数为 **0**；同时避免环境变更后继续服务陈旧的内嵌 auth/feature 配置。
- **实例生命周期缺陷（本轮新发现并修复）**：各 phase 的 compose 共用 `<project>_default` 网络但 `internal` 不同（login-test 必须发布 loopback 端口 → false；migrate/bootstrap/quarantine → true）。切换 phase 会重建网络并把未变更的服务**重新挂载而不带 service alias**，容器内 `getaddrinfo postgres` 随即失败（实测 `Aliases: null`、migrate 连续 `EAI_AGAIN`）。现每个渲染文件用 phase 独立网络名（`<project>_<phase>`/`_migrate`/`_bootstrap`），一次性迁移与仪式网络不再与在服 phase 争用同一网络；已用 `down --remove-orphans`（不删卷）清理损坏状态后重放迁移并重启，实测 app 容器内 `postgres` 正常解析。

**验证口径**：插件 12+2 项（关闭转换或错误 origin 时新用例先失败）、准入门 12 项（含分类不泄露）、身份两片 **73+53=126 项**真实 PostgreSQL、部署工具 **32 项**（新增 phase 网络与 realm scope 回归）、定向 Lint 与身份/路由类型闭包通过；六阶段离线构建、打包为 `sha256:00a61ef9…`、`upgrade`+`migrate`（165 条 journal 重放）+`up` 与真实浏览器登录 `login-r9` 均实测（`sessionEstablished=true`、落地首页、3 条 session proof 与原生 session 一一绑定且 epoch 一致）。证据见[本轮 R2](evidence/m0-m2-continuation/r2/README.md)。未做全仓类型/构建门；停用/隔离、双账号、开户与管理员 UI 仍未验收。

**迁移生命周期加固**：一次性 `migrate`/`bootstrap` 的 `up` 必须带 `--force-recreate`（服务配置哈希不含网络名，否则 Compose 会直接重启上一 phase 的停止容器，本次网络没有可解析的 `postgres` 别名）；`migrate` 对已确认镜像在触碰任何容器前直接拒绝，清理放入 `finally`，避免把 `postgres` 留在一次性网络上使在服 phase 失联。已实测：重复 `migrate` 立即拒绝且在服栈保持 healthy、解析正常。

**登录后仍存在的产品级缺陷（下一个阻塞）**：`GET /trpc/lambda/user.getUserState` 返回 500（`S3 environment variables are not set completely`）。页面能渲染、会话有效，但依赖对象存储的用户状态查询失败；本机实例尚未配置对象存储。这是"登录成功"到"web 端可用"之间的下一个必修项，与身份链无关。

### 本轮基础设施接通：OSS、容器出网与模型网关

- **对象存储（阿里云 OSS `unionhub`）**：内网 endpoint `oss-cn-shanghai-internal.aliyuncs.com` 从本机不可达（TCP 可连、TLS 握不上，本机不在该 VPC）；改用公网 endpoint + `region=oss-cn-shanghai` + 虚拟主机风格（`S3_ENABLE_PATH_STYLE=0`）+ 私有桶（`S3_SET_ACL=0`，走预签 URL）。一次性探针（宿主网络）与**应用容器内服务端**均完成 List + Put/Get/Delete 往返；产品侧 `trpc/lambda/user.getUserState` 由 500 变 **200**，登录后进入正常应用页。AK/SK 只存本机 0600 私有文件，不渲染进 compose（实测 compose 内 0 处），聊天中出现过需轮换。
- **容器出网（真实缺陷，已修）**：宿主经 VPN `tun0` 策略路由出网，Docker 桥接既无 NAT/FORWARD，且 `table 2022` 的分裂默认路由会**把回程包再送回 tun0**（抓包中同一 SYN-ACK 在 tun0 出现两次、容器回 RST）。修复：`POSTROUTING` 对私网段 `-o tun0` MASQUERADE、`DOCKER-USER` 放行 br+↔tun0、并为每个 Docker 网段加 `pref 8000 to <subnet> lookup main` 规则。可重放脚本私有保存在 `~/.config/youlin/mvp/host-egress.sh`（0700，不入库），重启/VPN 重启/网络重建后需重放。修复后容器内 gateway/OSS/DNS 全部 CONNECT。
- **模型网关**：login-test 阶段接入既有企业网关（profile 只在该阶段停止清空 `OPENAI_API_KEY`/`OPENAI_PROXY_URL`，quarantine 与 identity-prepared 仍断开；密钥只在私有 env_file，compose 渲染 0 处，已加测试锁定）。容器内实测 `…/v1/models` 返回 **200、70 个模型、含 `qwen3.8-max`**。部署工具测试 33/33 通过。
- **遗留（上游依赖，非身份链）**：`market.agent.getOnboardingFull` 仍 500，出网修复后错误由 `fetch failed` 变为 `Failed to get onboarding full: Unauthorized` —— 上游 LobeHub 市场接口需要鉴权。内网私有部署应关闭该拉取或提供内网镜像；不影响登录与本地功能。

### S1 已完成：主聊天路径服务端 token 计量（实测落库）

- 事实澄清：主聊天路径此前**完全不进账本**，`agent_quota_usage_ledger` 只由 heterogeneous-agent 的**客户端** transport 写入（不可信，不能作为额度依据）。
- 采集点经过一次失败迭代后修正：路由外层解析 SSE 拿不到 usage（runtime 会规范化分片），改用 runtime 一等钩子 `ChatMethodOptions.callback.onUsage`，并合并保留既有 tracing 回调。直连网关已证明 `include_usage` 时确实返回用量，问题在层级不在网关。
- 组成：`apps/server/src/modules/YoulinUsage/`（严格三态开关 `YOULIN_USAGE_ACCOUNTING`、`ModelTokensUsage`→账本 token 分类映射、幂等 `operationId`、账本故障只记固定分类日志且绝不打断回答）。**没有用量就不写行，绝不写 0**。
- 实测（真实浏览器登录 + `POST /webapi/chat/openai` 真实会话）：账本新增 1 行 `openai / qwen3.8-max / input=66 / output=15 / reasoning=11 / cost_usd=NULL`（NULL 是预期：不猜价格）；部署镜像 `sha256:025b8a38…`，六阶段构建全 0，165 条 journal 重放通过。证据见 [R3](evidence/m0-m2-continuation/r3/README.md)。
- 只统计、不拦截。后续切片：S2 自有模型授权表 + 服务端强制、S3 每模型/每用户 token 额度（Asia/Shanghai 自然月，超限硬拒绝）、S4 独立 `/admin` 管理界面（开户/停用/授权/额度/用量）、S5 双账号浏览器验收。
- 工程口径：新增单测 6 项（`--check --test` 4 GiB 入口；通用 2 GiB 入口在本项目会 OOM）、部署工具 33 项、定向 Lint 通过；全仓类型门与远端 CI 仍未做。

### S2/S3 已完成并实测：模型授权与 token 额度的服务端强制

- 数据：`youlin_model_grants`（userId+model 唯一、可选 provider 收窄、enabled、每模型月度 token 上限）与 `youlin_user_quotas`（每用户月度总上限），迁移 `0165_youlin_model_governance`（Docker 内生成、幂等、journal 166 条并重放成功）。授权来源是平台自有表，不是 Keycloak realm role。
- 判定：`policy.ts` 纯函数（授权 → 每模型额度 → 用户总额度，到限即拒含等号）；`accessControl.ts` **fail-closed**（授权表或账本读不到 → `ACCESS_UNAVAILABLE` 拒绝，不在故障期放行无上限消费）；周期与计数一律取**数据库时钟**，容器时钟漂移不能移动窗口；计数来自 S1 账本的 `input+output`（cache/reasoning 是子集，不重复计）。
- 强制点：`/webapi/chat/[provider]` 在任何 provider 调用之前判定，拒绝返回 403（`INVALID_INPUT` 为 400）+ 固定原因码 + `periodId`，`no-store`；开关 `YOULIN_MODEL_ACCESS_CONTROL` 严格三态，仅 login-test 阶段开启。
- **真实验证**（真实浏览器登录 + 真实 `POST /webapi/chat/openai`，非直连数据库伪造会话）：授权表为空 → 403 `MODEL_NOT_GRANTED`；播种授权 → 200 且账本 1 行/81 tokens 增至 2 行/165 tokens；模型 cap=当期已用 → 403 `MODEL_QUOTA_EXCEEDED`；用户总 cap=当期已用 → 403 `USER_QUOTA_EXCEEDED`；放开额度 → 200。证据见 [R4](evidence/m0-m2-continuation/r4/README.md)。
- 本轮修掉一个真实缺陷：reader 用 `sql<Date>now()` 取数据库时钟，实际返回值不是 Date，退化成 Invalid Date 后策略按"计数不可信即拒绝"判为 `INVALID_INPUT`（首次部署后所有请求都被拒）。改为解析器无关的 epoch 毫秒，并对 `INVALID_INPUT` 输出只含类型/布尔的诊断日志；fail-closed 语义未放宽。
- 边界：授权行目前用 `docker exec psql` 直写播种（**工程验证用途**，因为还没有 `/admin` 界面）；轮前累计检查，单个在飞请求可超出自身用量；只守卫主聊天路由，embedding/插件/hetero agent 未接入。S4（`/admin`）与 S5（双账号验收）未开始。

## 上轮续建：可复用部署工具与正式身份读取

详见[本轮推进与剩余接入门](16-m0-m2-continuation.md)：六阶段离线构建、本地候选镜像、163条迁移与重放、12个登录资源、合成哨兵备份恢复通过；新增正式身份表Reader及默认关闭凭据桥接。身份两片47+39=86项（78 PostgreSQL+8 DTO）、Server80项、部署工具11项及真实Keycloak14项通过。该轮未接真实登录/Session/PEP，未创建首位用户。

## 上轮实施更正：GitHub CI、本机 Docker UAT

- 用户已明确纠正：CI 使用 **GitHub Actions**，不是 GitLab；UAT 在**本机 Docker**部署并验证。其他环境的完整部署后续推进，本阶段先完成部署手册。旧证据保留当时假设，不再作为当前部署依据。
- 已移除错误的 GitLab 候选模板，新增受保护默认分支、手动 opt-in 的 GitHub 工程验证工作流；远端 Runner/Environment 与依赖准备尚未配置验证，不声称 CI 已绿。
- 新增[完整部署与本机 UAT 手册](./12-deployment-and-local-uat-runbook.md)及[31项交付缺口账](./13-m0-m2-delivery-gap-register.md)，区分工程测试、真实产品 UAT、后续目标环境发布。完整应用栈尚未部署，工程测试不升级成 UAT。
- M2 新增默认关闭的私有清理确认记录接口：独立服务权限、因果事件/精确epoch校验、旧回执不覆盖新撤权、不激活/不恢复grant、不混同运输ACK；真实IdP清理及可信适配器仍未实现。
- 扩展身份套件单次执行触及45秒截止，已保留失败并拆成两个串行互补分片，仍保持测试隔离/原资源/原单次限时；两片最初74项通过；补充未知持久状态拒绝回归后，该轮47+28=**75项（67 PostgreSQL+8 DTO）**通过。工具/CI/参数合同20项通过；未删用例或提高预算。
- 本轮独立初审提出3个P2（tag/branch区分、未知持久状态拒绝、部署文档测试口径），均已修复；负向用例先失败再通过，独立复核无新增问题/剩余阻断。见[R4记录](evidence/M02-004-S1/r4-status.md)；这不是远端CI、IdP实际清理或产品UAT验收。

## 最近已提交工程增量：HR、绑定候选与私有租约（独立复核完成）

- 基于 `4985ab3295` 继续实现共享事务/失效策略、HR 完整快照、绑定候选与私有 Outbox 租约。未接应用登录、MFA 审批、真实 HR 或 Broker，不自动激活/恢复授权。
- 最新 Docker 身份套件 **65/65（57 PostgreSQL + 8 DTO）**，包含此前62项及新增3项边界回归；修复前3失败/62通过，修复后全部通过。定向 Lint/类型通过。前轮 server **33/33**、旧 PostgreSQL Reader **18/18** 记录保留，不冒充本轮重跑。
- 用户授权将独立静态审查时限延长到600秒后，初审及一次复核均完成：两个P1已修复，复核未发现新的范围内问题。此前90秒超时记录保留，审查阻塞已解除。见[最新审查与回归记录](./evidence/M02-004-S1/r3-status.md)。
- 提前切片账仍为6项，已更新本切片的实现路径、65项测试与复核证据；本轮不是完整交付，31项完整 Spec、正式 UAT/发布状态保持不变。
- 本轮代码、进度与 R2/R3 证据已提交并推送为 `2a2ea731fe`。证据文档中的“未提交”是采集当时状态，不回写冻结历史。

## 上一轮增量：候选身份持久化内核（仍在开发）

- 提前工程执行账现为 **6 项**，新增 `M02-004-S1`：九表候选 Schema、Docker 生成的 `0162` 草稿迁移、pending 注册、授权/幂等/审计/Outbox 原子边界及持久撤权。默认关闭、未接产品，不能作为完整 Spec 交付。
- 新身份套件 **32 项通过（24 项真实 PostgreSQL、8 项 DTO）**；工具 13 项、旧 PostgreSQL 18 项、旧 SQL 20 项、server 33 项回归通过。定向 Lint/类型通过，不等于全仓质量门。
- 独立初审及一次复核完成，诊断 P2 已修复；复核新增的非阻断分类 P2 也经失败/通过回归修正，但未再宣称独立复核。详见[身份持久化工程证据](./evidence/M02-004-S1/README.md)。
- M0～M2 的 **31 项完整 Spec 仍未交付完成**；正式绑定/冲突、HR、Session/PEP、投递、服务身份、部署与真实 UAT 缺口继续单独跟踪。未把编码、模型测试或 AI 静态审查等同企业签收。

## 上一轮增量：M0～M2 确认与真实 IdP 工程验证

- [确认记录](./11-m0-m2-confirmed-decisions.md)明确 Eric 承担责任角色、薪人薪事真源、邮箱/员工号认证、Windows/macOS；当时误记的 GitLab/外部 UAT 边界已由本次用户更正覆盖。下文早期轮次中的“实名待认领”不再作为当前阻塞；独立复核仍未完成。
- 该轮提前工程切片为 **5 项**，新增 M02-001-S1：真实隔离 Keycloak **14 项协议测试**、认证器 **9 项配置测试**通过；默认关闭、未接产品路由。管理员 MFA、已配置 OTP 的员工、已有 SSO 升权、JWT 过期与禁用后 refresh 均有实际协议用例。
- 旧 SQL **20 项**已迁入 Docker 复测；真实 PostgreSQL **18 项**、数据库/Reader **24 项**、server **33 项（24+9）**、环境/进程工具 **9 项（5+4）**回归通过。同例不跨入口重复累计。
- 新增 GitLab 私有 Runner 候选模板；远端流水线未执行。定向身份类型检查通过，不代表全仓类型/构建通过。
- [本轮证据](./evidence/M02-001-S1/README.md)记录失败、修复、通过和边界。首个独立审查进程达到180秒观察截止；随后只读、无上下文继承的独立 Pi 审查完成，未发现本轮代码范围内的新增缺陷。该结论不是生产或全产品签收。
- **M0～M2 的31项完整 Spec 尚未交付完成**：正式身份映射/迁移、HR/企业微信接入、应用 Session/PEP、服务身份、私有队列/审计运营与可重复应用部署仍有缺口；正式外部 UAT 不冒充已完成。

## 1. 首轮授权与统计口径（历史）

用户原话：**“批准，继续推进开发落地，目前里程碑以及对应的进度”**。

据此启动默认关闭、无真实数据、无生产接入的隔离开发切片。没有将此消息改写为 D01～D17 全部获批，也不代填企业实名 Owner、Security Reviewer、预算或数据/生产批准。

- **详细草案文件覆盖：159/159（100%）**。这是文件覆盖率，不是设计质量、批准或开发完成率。
- **完整 Spec 正式批准：0/159；业务验收：0/159；生产发布：0/159。**
- **提前工程切片：4 项进入开发**：M01-001-S1 根依赖已安装（跳过生命周期）；M02-006-S1 撤权内核通过定向严格类型检查，根配置对三个选定文件的 Lint/Vitest 24 项通过；M02-006-S2 在 PostgreSQL 15.19 上复测 20 项通过；新增 M02-006-S3 Drizzle 只读 Adapter 原型，13 项 PGlite、18 项真实 node-postgres 联调与 11 项自有池配置测试通过。正式 Adapter/迁移、完整仓库质量门和真实身份链仍未完成。
- **752 条 Spec 用例仍待实际执行**。25 项合同设计测试、13 项文档校验器测试、24 项内核测试、20 项隔离 PostgreSQL 试验、13 项 PGlite Reader 测试、18 项 node-postgres 联调、11 项自有池配置测试及 4 项进程工具测试单独统计，不冒充端到端验收。
- 当前不能给出可靠的“总体开发百分比”，尚无批准工作量权重、实际启动日期或完整团队投入数据。

完整 Spec 的 catalog 状态仍为 draft / not_started：表示没有把尚未满足完整 DoR 的父任务标为正式开工/批准。已发生的工程编码另记在[提前切片执行账](./execution-slices.json)，并在下表明确呈现，**不表示没有发生代码工作，也不代表父 Spec 已完成**。待父项合同/责任/批准补齐，再进入其正式交付状态。

## 2. M0～M14 当前进度

| 里程碑 | 候选交付周 | 草案覆盖 | 当前实际进度 | 主要下一步 |
| --- | --- | --- | --- | --- |
| M0 范围/架构 | W2 | 10/10 | 规划/决策已形成；Eric 责任与本轮实施边界已确认，未泛化为全部批准 | 启动日、容量/预算、关键 ADR 和独立复核 |
| M1 工程基线 | W4 | 12/12 | 可复用离线构建/候选镜像/隔离启动工具；163迁移、资源HTTP与合成恢复通过；本机持久实例已升级并重放165条迁移；冷构建、全仓类型、HTTPS/对象存储/真实邮件和正式部署仍未完成 | 批准工具链/镜像源，冷依赖构建、GitHub Runner 实跑、完整栈 UAT 编排 |
| M2 统一身份 | W5 | 9/9 | 撤权/Reader、真实 Keycloak 14项协议及认证器9项配置测试通过；九表草稿＋Session proof/手工开通两表；身份两片共86项通过；新增默认关闭的企业认证插件、Session proof 强制、手工开通/停用与首管理员 bootstrap，本机实例进入 `login-test` | 真实人类登录、停用/隔离与双账号浏览器 UAT、管理员 UI、真实 HR/IdP 清理、服务身份与 Desktop |
| M3 组织/权限 | W7 | 10/10 | Scope/AccessIntent Schema 子集与负向测试设计；无真实 PDP | Membership/ACL 物理合同，真实 PEP 与预过滤验证 |
| M4 Web/Desktop | W8 | 8/8 | 草案齐备，企业功能未实现 | 双端身份/升级/签名及设备 Spike |
| M5 AI 能力中心 | W10 | 11/11 | 草案齐备，企业功能未实现 | Registry、Review、Tool/Workflow 与模型边界 |
| M6 资源中心 | W14 | 12/12 | 草案齐备，企业功能未实现 | OSS/鉴权代理/扫描、配额与版本安全切片 |
| M7 知识/记忆/产物 | W15 | 10/10 | 草案齐备，企业功能未实现 | 知识审核/发布、RAG ACL、个人与项目记忆隔离 |
| M8 员工助手 | W16 | 10/10 | 草案齐备，尚无真实端到端灯塔 | 有效知识与黄金集、引用/拒答/质量基线 |
| M9 数据/API | W18 | 12/12 | 草案齐备，尚无真实数据产品 | 一个批准低敏 Gold 产品与内部只读 API |
| M10 Project Context | W20 | 12/12 | 草案齐备，C0～C3 未实现 | 按 C0/C1/C2/C3 提前切片，而非等 W20 才开始 |
| M11 工作台/运营 | W22 | 14/14 | 草案齐备，企业运营功能未实现 | Review/Module 先行，再做任务/通知/反馈/运维 |
| M12 RC/UAT | W24 | 10/10 | 测试与恢复/UAT 设计；尚未执行 | 固定 RC 后真实安全/性能/恢复/UAT |
| M13 Pilot 上线 | W26 | 9/9 | 准入与两道发布门设计；尚未部署 | 部署前 Go/No-Go、部署后 Smoke 再放流量 |
| M14 Pilot 结论 | W32 | 10/10 | 运营/指标/TCO/投资门设计；尚无真实运行 | 真实 4～6 周观察、原始指标、安全与投资结论 |

周数是相对批准启动日的计划，不是已过去的实际项目周数。当前未确认启动日期，不能宣称已到 W5 或给出确定日历完工日期。

## 3. 已落地的首个代码切片（历史范围）

- 实现：[revocationGate.ts](../../../apps/server/src/modules/YoulinSecurity/revocationGate.ts)
- 模块边界：[YoulinSecurity README](../../../apps/server/src/modules/YoulinSecurity/README.md)
- 共享行为测试：[revocationGate.cases.mjs](../../../apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.cases.mjs)
- 标准 Vitest 入口：[revocationGate.test.ts](../../../apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.test.ts)
- 本轮实际运行入口：[原生 Node smoke](../../../scripts/youlin/revocationGate.smoke.mjs)

已覆盖：默认关闭/无配置拒绝；禁用、旧/超前 epoch、主体错配、状态缺失/错误；每次重新读取；异常/超时 fail-closed；Abort、晚到响应、并发主体与输入突变。返回 `continue_authorization` 只允许继续 PDP，不等于允许访问。

**新增 S2**：[隔离 SQL 原型](../../../scripts/youlin/fixtures/revocation.sql)已实证 CAS/幂等、deny+Audit+Outbox+回执原子写入、失败/连接终止回滚，并以 PostgreSQL 查询接入 S1 测试。见[工具与边界](../../../scripts/youlin/README.md)。

**未完成**：正式 Drizzle Schema/生成迁移/应用数据库 Adapter、身份表映射与授权角色、Keycloak/Session/API Key/Worker 接点、PDP/PEP 和多端端到端。没有通过现有路由挂载；不存在修改企业登录或权限行为的生产效果。

## 4. 历史轮次检查与限制

隔离工具链安装和类型/lint/Vitest 命令见[固定工具链](../../../scripts/youlin/toolchain/README.md)；以下行为/文档检查也已执行：

```bash
node --experimental-strip-types --test scripts/youlin/revocationGate.smoke.mjs
node --experimental-strip-types --test scripts/youlin/revocationPostgres.smoke.mjs
python3 docs/youlin-enterprise-ai-platform/plan/specs/contracts/executable/test_contracts.py
python3 docs/youlin-enterprise-ai-platform/plan/validate_docs.py
python3 docs/youlin-enterprise-ai-platform/plan/test_validate_spec_catalog.py
```

24 项内核合成行为测试、20 项隔离 PostgreSQL 试验、25 项合同设计测试、13 项文档校验器测试通过。另已安装 Bun 1.4.2、TypeScript 6.0.3、Vitest 5.0.0、ESLint 10.0.2 的独立锁定工具链，内核严格类型检查、隔离 strictTypeChecked lint 与同一测试入口的 Vitest 24 项均通过。上一轮已执行根 `pnpm install --ignore-scripts`，并运行 `bun run check --lint --test --type`：指定三个文件的根 Lint clean（两文件自动规范化）、24 tests passed；全仓类型进程被 SIGKILL，整体 exit 1。一次软内存/限时重试仍未完成，已清理其所属进程；原因未确认，不声称 OOM 或代码类型错误。根原生编译器单独检查内核返回 exit 0；仍不能称全仓类型/质量门通过。

上一轮根检查对 8 个选定文件 Lint clean，37 tests passed（原 24 项内核 + 新 13 项 Reader，不重复累计）。Reader 的 4 个 TS 文件通过定向严格类型检查。全仓类型转入无网络、只读挂载、4 GiB / 2 CPU / 512 PID 容器，60 秒观察截止仍未完成，已清理；SIGTERM 返回 143 并完成清理。此截止由协调进程轮询实现，另有 Docker 控制/清理时延，不宣称绝对硬墙钟保证。4 项进程工具测试及 stderr 丢失的先失败/后通过回归也已记录。

r2 按用户本机部署授权运行[私有 socket PostgreSQL 环境](./10-local-test-environment.md)，9 项真实驱动测试通过。根定向检查对 4 文件 Lint clean、原 37 项测试通过；新 9 项默认跳过，仅由专用环境入口执行，未混算成根检查通过项。新测试及依赖闭包定向严格类型通过，正常退出和 SQL 阻塞期间 SIGTERM 清理已验证。未重新尝试或宣称全仓类型通过。

最新 r3 新增默认关闭的自有池 Adapter：只接受明确的本机 socket 参数，不接受外部事务；每次使用 READ COMMITTED READ ONLY，正常归还前结束事务，失败时丢弃连接。限额涵盖获取连接、SQL 与清理，取消不提前释放仍占用的额度。根定向 6 文件 Lint clean、48 项测试通过（24 + 13 + 11）；真实 DB 18 项由专用入口执行。已记录 pg 环境参数回退的失败→通过回归。未验证真实 standby/复制拓扑、全局限流或生产吞吐。

当前是无用户可见接点的隔离原型；未执行产品 Acceptance、真实安全/恢复/性能测试，也没有发布公共 Acceptance 页面。通过合成测试不证明授权服务、撤权 SLA 或供应商兼容性。

### M1 r4：测试环境容器化

按最新要求，测试进程和依赖服务默认 Docker；宿主只做编排/编辑/Git/证据。真实 DB 18项在双容器中通过；PGlite/配置13+11项、根 server 项目24项分别在容器通过，另有5项环境约束检查。根未限定项目入口在90秒内未结束，不标为聚合门通过；未扩大预算，未排除产品代码。原 S2 的20项旧混合入口暂不宿主复跑，待迁移。

镜像、范围、临时 Git 元数据限制、正常/异常清理见[当前环境](./10-local-test-environment.md)与[M1 r4 证据](./evidence/M01-001-S1/r4-manifest.json)。4个切片仍开发中，父 Spec 批准/验收/发布状态不提升。

## 5. 面向 MVP 完成的推进顺序

### 5.1 先把“MVP 完成”分成两层，不混用

| 层级 | 定义 | 对应门禁 |
| --- | --- | --- |
| **T0 内网可用 MVP**（当前已确认范围） | 员工用邮箱/员工号登录同一账号；管理员按核实清单开户/停用；停用后旧会话与旧 JWT 持续拒绝；每用户可用模型与每月 20 美元预算由服务端强制；既有 Chat 可用；本机 Docker 可重复部署与恢复 | AC-01/02/11/12/14/32 的 MVP 子集；M0～M2 缺口账 + 预算接线 |
| **T1 蓝图 MVP**（M0～M14） | 组织与权限、能力 Registry、四级资源库、知识/记忆/产出物、员工助手灯塔、数据与 API PoC、Project Context、运营闭环、RC/Pilot | 159 项 Spec、33 项 AC、W26/W32 基线 |

T0 通过**不等于** MVP 完成，但 T0 是 T1 的准入前提：身份、部署与计量底座未闭环前，开放资源/知识/助手只会放大越权与成本风险。

### 5.2 T0 关键路径

**A 身份登录闭环（当前唯一实测阻塞，最高优先）**

1. 诊断 `oauth2/callback/keycloak` 500：在实例内开启 `lobe-server:youlin-identity` debug 分类，复现登录并取得 `userCredentialGate`/`authorityReader` 的精确拒绝原因（主体/绑定/任职/epoch/ban/手工准入状态或 Pool 配置）；按真实原因修复，不放宽 deny-first。
2. 把准入拒绝从 500 改成受控失败：分类错误页/重定向 + 固定诊断码，不回显 token 或原始异常（Safe Failure）。
3. 依次跑通验收门禁 `local-ready → admin-login → closed-enrollment → disable-old-session → private-isolation`，证据私有归档；页面停留 loading 或错误不得记 pass。

**B 管理员最小运营面**：当前只有 `POST /webapi/youlin/admin/users`，缺开户/停用/查询的管理 UI 与审计视图。先做最小可用管理页（列表、开通、停用、结果与失败原因可见），否则 A 的 `closed-enrollment`/`disable-old-session` 只能靠裸 HTTP 调用，不满足“管理员实际操作”的验收口径。

**C 模型授权与预算账本**（`apps/server/src/modules/YoulinModelAccess/` 目前只有纯规则，无存储、无接线）：

1. 正式账本 Schema 与生成迁移：预算账户、预占/派发/结算、用户级冻结、审计；隔离 PostgreSQL 验证并发与唯一请求键。
2. 接可信登录身份与管理员权限，禁止客户端选择计费用户或自带 Key 绕过。
3. 接全部 Chat/Agent/工具/流式与非流式入口：原子预占 → 固定网关 → 可信 usage 结算；提供商侧强制输出上限；模糊失败不自动重试或 TTL 退款。
4. 管理员配置模型/可信价格/用户预算 + 用户用量视图 + 受审计解冻。
5. **外部依赖**：`qwen3.8-max` 可信计价仍未取得（`model-pricing.pending.json` 全为 null）。缺价格时只能启用“模型白名单 + 用量上界”，不得静默估算美元扣费。

**D 可重复部署与运维**：冷依赖构建与整体输入冻结、全仓质量门（有界 Runner）、GitHub Actions 实跑、内网 HTTPS/域名、对象存储、真实 SMTP 投递、业务数据备份/恢复与升级回退、请求-任务-撤权链可观测。当前打包依赖当前工作区静止源码，不能跨提交混搭旧产物。

**E 治理与放行**：启动日、容量/保留/RPO/RTO、第二位独立授权人、关键 ADR 正式批准；随后才按真实证据提升父 Spec 状态并放行内网员工流量。

### 5.3 T1 进入条件

A～E 闭环并有真实 UAT 证据后，按 M3（Scope/Membership/ACL/PDP 与逐入口 PEP，不依赖 OSS RBAC 占位）→ M5/M6/M7 提前切片 → M8 灯塔（有效知识 + 黄金问题集）推进；M10/M11 的 Review、Project 与 Context 必须按切片提前提供，不等 W20/W22。HR/企业微信/签名等真实供应商接点在取得受控参数前保持关闭，用合成身份验证但不冒充供应商实测。

不再待确认责任人姓名：Eric 已承担责任角色。仍需外部输入的是薪人薪事 API/稳定主键与版本语义、GitHub Runner/Environment/制品仓库、SMTP、企业微信回调、Windows/macOS 签名、可信模型价格，以及启动日、容量/保留/RPO/RTO等政策。需要职责分离的高风险审批还需第二位独立授权人，Eric 多角色不能替代；这些依赖不阻塞无真实数据的内部编码。Secret 仅走受控渠道，禁止在聊天或 Git 粘贴明文密钥。

## 6. S2 实际工程证据

- 最新 [r4 原始 TAP](./evidence/M02-006-S2/r4.tap)与[r4 源码 Hash](./evidence/M02-006-S2/r4-manifest.json)：20 项复测通过，容器清理已确认。
- 历史 [r1 清单](./evidence/M02-006-S2/r1-manifest.json)、[r2 清单](./evidence/M02-006-S2/r2-manifest.json)、[r3 清单](./evidence/M02-006-S2/r3-manifest.json)及对应 TAP 保留原状；对应当时源码，不覆盖旧证据。
- 只使用合成身份，网络关闭、无宿主端口、tmpfs 数据；未连接任何现有业务数据库。
- 结果仅证明这个版本的隔离原型；不证明正式生产迁移、审计防篡改、Broker 投递或真实身份权限链。父 Spec/AC 状态未提升。

## 7. M01-001-S1 工具链证据

- 当前 [r4 容器化结果](./evidence/M01-001-S1/r4-manifest.json)：测试 workload 不在宿主执行；历史 r1～r3 保留。

- r2 [根检查原始输出](./evidence/M01-001-S1/r2-root-check.txt)、[定向原生类型结果](./evidence/M01-001-S1/r2-targeted-type.txt)、[隔离复测](./evidence/M01-001-S1/r2-isolated-checks.txt)和[r2 版本/源码/报告 Hash](./evidence/M01-001-S1/r2-manifest.json)。整体根检查 exit 1，不标为全通过。
- 历史 [r1 清单](./evidence/M01-001-S1/r1-manifest.json)、[缺少根依赖的阻断](./evidence/M01-001-S1/r1-root-check.txt)与[lint 范围负向探针](./evidence/M01-001-S1/r1-lint-scope-probe.txt)保留。
- 仅请求工具/依赖包，未发送企业数据；安装禁用生命周期脚本。根依赖已经安装，但 package/workspace 配置未改；根原有 lockfile=false 策略保留，不宣称完整环境被冻结。
- 最新 r3：[指定文件根检查](./evidence/M01-001-S1/r3-root-check.txt)、[限额类型检查](./evidence/M01-001-S1/r3-bounded-type.txt)、[SIGTERM 清理](./evidence/M01-001-S1/r3-signal.txt)及[清单](./evidence/M01-001-S1/r3-manifest.json)。不把工具安全退出称为全仓类型通过。
- 本轮为内部实验 Adapter 和工具，没有产品接点或生产迁移；完整 Spec 验收仍为 0/159。

## 8. M02-006-S3 Drizzle Reader 原型

- [代码与边界](../../../packages/database/src/experimental/youlinSecurity/README.md)、[13 项 PGlite 测试](./evidence/M02-006-S3/r1-vitest.txt)及[源码/报告 Hash](./evidence/M02-006-S3/r1-manifest.json)。
- 使用真实 PGlite/Drizzle，不 mock 数据库；仅映射已有试验状态表，不导出到生产 schema，不运行产品迁移，不读取数据库环境凭据。
- 覆盖主体隔离、撤权后重读、绑定参数、缺状态、取消前/中结果丢弃、输入突变、整数上限/约束漂移、数据库失败传播和回滚。
- 历史 [r2 真实驱动证据](./evidence/M02-006-S3/r2-manifest.json)：9 项通过，覆盖两个连接池提交可见性、原子回滚、试验只读角色、参数化、旧快照反例、SQL 阻塞/超时、权限失效与整数上限。
- **Gate 取消并未立即中断 SQL**；SQL 后由试验配置的 PostgreSQL statement_timeout 终止，连接池可恢复读取，不保证复用同一物理连接。
- **通用 Reader 仍可被旧事务误用**：保留 repeatable-read 反例。新增 [ownedReader.ts](../../../packages/database/src/experimental/youlinSecurity/ownedReader.ts)自有池路径避免借用旧事务；[r3 证据](./evidence/M02-006-S3/r3-manifest.json)包含18 项 DB 测试和11 项配置测试。
- 自有池额外验证角色默认隔离级别、配置/主体突变、环境变量回退、获取连接期间取消/关闭、过载拒绝、超时清理与后续恢复。限额仅针对单个 Adapter，不能通过反复创建实例规避它后还声称全局限流。
- 即时 SQL 取消、正式端点/复制新鲜度、身份映射、生产权限和吞吐仍未完成；新增事务与元数据检查的开销尚未做容量评估。
- 本机环境只在验证期间运行；完成后清理容器/卷/socket。尚未部署完整 Web/Desktop、Keycloak、Redis/对象存储或员工助手。

[计划总览](./README.md) · [全部 Spec](./specs/index.md) · [实施准备](./08-implementation-readiness-and-spikes.md)
