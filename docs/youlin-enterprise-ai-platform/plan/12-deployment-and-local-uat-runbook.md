# 完整部署与本机 Docker UAT 手册

> 哪一层可作为验收证据、dev 内循环与镜像外循环的分工见[测试与验证策略](./17-test-and-verification-strategy.md)；本文是部署与 UAT 的操作步骤。


状态：**部署设计/执行清单，尚非已验证的一键部署包**。当前已有隔离身份工程测试，不存在已验收的完整 Youlin 应用环境。责任人为 Eric；CI/UAT 的最新依据为[用户确认记录](./11-m0-m2-confirmed-decisions.md)。

## 1. 三种环境不能混称

| 环境 | 用途 | 当前事实 | 成功标准 |
| --- | --- | --- | --- |
| 工程 Test | 验证事务、协议、类型及隔离工具 | Docker 临时 PostgreSQL/Keycloak/Node 已有实测 | 指定检查通过、资源清理；不是 UAT |
| 本机 UAT | 运行当前应用，验证员工/管理员流程 | 地点和 Docker 方式已确认；完整栈尚未建成 | 应用、身份、数据、拒绝路径及持久化恢复有真实流程证据 |
| 其他目标环境 | 后续完整部署及生产候选 | 本阶段提供本手册，未执行远端部署 | 固定制品、目标参数、迁移/恢复实测及独立放流决定 |

同机并不意味着复用现有业务服务。已有 CRM、Dify、文档处理等容器、端口和数据不得接管、重启或删除。每轮环境有 UUID 项目名、独立网络/卷/凭据与资源账。宿主仅编排、编辑/Git、观察和归档；应用、依赖、构建、浏览器及断言均在 Docker。不得读取根 `.env` 或其他项目连接串作为捷径。

## 2. 部署对象与尚缺的能力

| 对象 | 应包含的能力 | 当前落点/差距 |
| --- | --- | --- |
| Web/后端 | 当前提交的 LobeHub Next.js + SPA 与企业接点 | 根 `Dockerfile` 是上游构建入口；当前新增企业内核未接应用路由，不能用上游公开镜像证明本分支功能 |
| PostgreSQL | 上游完整 schema、企业九表、角色/迁移分离 | `0162_youlin_identity.sql` 是生成草稿；工程库只应用 users 基线+该草稿，不是完整上游迁移链 |
| 搜索扩展 | 应用实际需要的 pg_search/向量等扩展及版本 | 上游 deploy Compose 使用 ParadeDB PG17；工程 PG15 镜像不能未经核验充当完整产品数据库 |
| Keycloak | 独立 Realm/Clients、PKCE、MFA、会话策略 | `scripts/youlin/identity/realm.mjs` 有合成协议实测；当前 H2/start-dev 夹具不是正式 IdP 部署 |
| Redis | 应用缓存/协调等实际调用路径 | 不得复用本机 Dify Redis；缓存不得代替逐次权威撤权判断 |
| 私有对象存储 | 鉴权上传/下载、短期 URL、删除及分类边界 | 需私有 bucket、独立账户和浏览器可达入口；不得默认匿名开放 |
| Agent 队列 | 真实应用 runtime 的队列依赖 | 现有 queue 模式依赖 QStash；不能把内存 Local Queue 或企业 Outbox 租约当作等价替代 |
| 企业 Outbox/Worker | 真实投递、幂等、重试/死信、IdP 精确 epoch 清理确认 | 已有事务写入/租约和精确 epoch 的私有清理确认记录接口；真实 provider adapter、relay/consumer/运营仍缺。ACK 不证明 IdP 清理完成 |
| HR/企业微信 | 稳定人员键、版本、验签/重放及账号映射 | 规范化 HR 快照不是薪人薪事 wire adapter；真实接口尚缺 |
| 可观测/恢复 | 私有日志、健康检查、告警、备份/恢复记录 | 需落地，不能仅有测试 stdout；禁止原始 Token、密码及 SQL 参数入日志 |

不为凑齐“完整栈”启动尚未接入代码的假 Worker 或 mock 服务，再把健康端口算成业务验证通过。未实现能力必须显示 blocked，而不是容器数量达标。

## 3. 上游部署入口的采用边界

可参考根 `Dockerfile`、`docker-compose/deploy/docker-compose.yml`、`docker-compose/dev/docker-compose.yml`，但**当前不可直接在共享宿主运行作为企业配置**：

- 示例含固定容器名、可变镜像标签，以及 PostgreSQL/Redis 的宿主端口，容易碰撞和扩大暴露面。
- 对象存储初始化示例含 `set -x`/凭据输出与匿名 bucket 配置；企业包须删除这些行为，采用私有 bucket 和显式 CORS。
- 根构建的 Node 版本/依赖安装路径与当前工程工具链并不相同；默认构建 `NODE_OPTIONS` 堆上限为8192MiB，不是获准使用共享宿主8GiB的依据。需独立限额构建 profile，不能无界启动后再观察是否 OOM。
- 根镜像包含迁移入口，必须核对启动时自动迁移行为；Feature Flag 关闭不阻止 DDL 执行。
- 上游配置文件不含本轮完整的企业授权接入，不能仅配置 OIDC 就称“离职全渠道立即失效”。

后续应新增企业专用 Compose/profile 与编排入口，不侵入修改固定上游示例。本手册不虚构尚不存在的 `youlin-up` 命令。

## 4. 制品与配置交付清单

每次候选发布生成只含非 Secret 元数据的清单：

| 必备字段 | 要求 |
| --- | --- |
| 源码 | 仓库、完整 commit SHA、干净工作区证明、上游基线 |
| 制品 | 每个镜像的不可变 digest、构建任务、平台/架构、SBOM/扫描引用；禁止仅写 latest |
| 依赖 | 安装工具版本、锁文件或审查过的依赖快照来源；生命周期脚本执行范围 |
| 数据库 | 当前/目标迁移号、SQL/快照 hash、扩展版本、DDL 锁评估、前滚/恢复方案 |
| 配置 | 非敏感配置版本、Flag 默认关闭状态、Secret 名称/版本引用（不是值） |
| 环境 | UUID、服务/网络/卷、端口绑定、总资源上限、清理/保留选择 |
| 验证 | 工程检查、UAT 用例/截图/原始输出、失败修复历史、审查与签收分别记录 |

工程测试工具镜像 ID 是本地缓存，不是已发布的应用制品。CI 依赖快照还未形成冷构建可复现证明；根仓忽略 pnpm-lock 的现状不能写成已有完整锁定供应链。

## 5. 配置与 Secret 责任边界

以下是代码中已有配置入口，不是批准的生产值：

| 类别 | 代码入口/变量 | 操作约束 |
| --- | --- | --- |
| URL/会话 | `APP_URL`、`AUTH_SECRET`、受信 origin 配置 | 外部/容器内 URL 分开；回调和 Cookie 域按实际路由校验，不猜旧 NextAuth 路径 |
| 加密 | `KEY_VAULTS_SECRET` | 独立保存、备份与轮换演练；恢复 DB 但丢此密钥不等于恢复可用 |
| DB | `DATABASE_URL`、`DATABASE_DRIVER` | 应用最小权限与迁移权限分离；日志只显示目标环境引用 |
| Redis | `REDIS_URL`、前缀/TLS 设置 | 每环境独立，禁用跨环境缓存凭据复用 |
| S3 | `packages/env/src/file.ts` 中的 S3 配置 | 私有 bucket；CORS 指定实际 UAT origin；容器内部地址不直接给浏览器 |
| OIDC | `AUTH_SSO_PROVIDERS`、`AUTH_GENERIC_OIDC_ID/SECRET/ISSUER` 或已存在的 Keycloak provider 配置 | 先确认选用 provider 与实际回调；Web Secret 只在后端，Desktop public client 用 PKCE，不内置共享 Secret |
| Agent runtime | `AGENT_RUNTIME_MODE=queue`、`QSTASH_TOKEN` 及对应服务配置 | 必须按实际实现准备依赖；未经批准不能接公网托管队列或把内存模式声称持久队列 |
| 企业身份 | 当前 Repository 的显式 `enabled`、可信 actor 与权威 DB 参数 | 不是已有完整环境变量开关；不得编造一个 `YOULIN_ENABLED` 就声称接入完成 |

本机合成凭据每轮生成、仅挂入对应容器的私有临时文件/Secret；不复用仓库根 `.env`，不写入 Git、shell trace、截图、manifest。其他环境使用受控 Secret 通道及权限审批；同名变量也不能跨环境复制值。SMTP/真实模型/HR/企业微信参数缺失的路径明确 blocked，不用假投递或真实个人账户代跑。

## 6. 网络与资源门

- Test 工程 profile 继续无网络/宿主端口；UAT 需要服务通信时使用本轮独立 Docker 网络，默认内部网络，不连接已有网络。
- 只允许确需浏览器访问的应用/IdP/对象存储入口绑定 **127.0.0.1** 的本轮分配端口；数据库、Redis、管理控制台不发布宿主端口。测试浏览器使用同轮隔离容器/会话，不劫持个人登录态。
- IdP issuer 必须让浏览器和应用以同一受信标识解析，不能以不同 internal/public issuer 绕过验签。回调、TLS、Cookie 和私有 S3 round trip 都要实测。
- 外联 HR/邮件/模型等按域名与用途审批；默认不加载真实数据。不得访问公共 Debug Proxy、上传企业证据或启用未批准遥测。
- 启动前登记每服务 memory/CPU/PID、构建峰值、浏览器资源及**同时运行总量**。既定工程单容器限额不是整个 UAT 栈的无限预算；未确认总量不启动完整栈，不影响无外部依赖的继续编码。
- 构建与运行分阶段，不和已有重负载容器抢占预算；失败保留日志、停止本轮环境，禁止无限重试或扩内存刷绿。

## 7. 本机 UAT 的执行顺序与放行门

| 阶段 | 执行动作 | 放行证据 / 失败处理 |
| --- | --- | --- |
| 0 盘点 | 只读观察现有容器/端口/容量；冻结 runId 和制品 | 确认无资源/数据冲突；不触碰已有服务 |
| 1 准备 | 在限额构建容器生成当前提交镜像与非敏感 manifest；生成私有 Secret | 记录 digest/来源；不拿上游镜像替代当前分支 |
| 2 基础服务 | 独立 DB/扩展、Redis、私有对象存储、持久 Keycloak 数据库 | 不仅 TCP 就绪，还验证实际 SQL、鉴权 Put/Get/Delete、IdP discovery/JWKS |
| 3 迁移 | 在独立一次性容器执行完整迁移链；验证全新库和上一候选升级 | 审查 `0162` 编号/真实索引锁行为；失败保持应用关闭，不运行反向 DROP 伪回滚 |
| 4 身份引导 | 合成 HR 人员、Web/Desktop clients、管理员与普通员工；安全 bootstrap | 不按邮箱自动合并；审批第二人用明确合成身份，不冒充企业真实第二授权人 |
| 5 应用/Worker | 启动当前应用与已实现的依赖；企业入口未接完则相关流程 blocked | Health 与 Ready 分离；就绪需真实 DB/IdP/对象存储/队列依赖可用 |
| 6 用户流程 | 容器浏览器/CLI驱动真实页面/API；按下节逐例取证 | 每例记录预期、观察、截图/原始输出、版本和结果；失败修复后新轮次 |
| 7 持久化/故障 | 定向重启本轮应用/Worker，验证已写数据、撤权、重投、恢复 | 单次成功不证明 HA/RPO/RTO；未实现链路不能用模型测试替代 |
| 8 归档/清理 | 私有证据归档、hash、逐 UUID 核验本轮容器/卷/网络 | 保留或删除 UAT 数据由清单明确选择；不得 global prune 或删除其他项目卷 |

目前阶段1～8没有完整应用级运行证据。上述步骤是执行合同，不是宣称已启动成功。

## 8. 首轮 UAT 用例与证据要求

| 用户结果 | 必须实际观察 | 当前准备状态 |
| --- | --- | --- |
| 员工可登录自己的账号 | 邮箱/员工号登录到正确应用账号；错误账户不自动合并 | IdP 协议已测，应用映射/登录衔接待实现 |
| 普通员工不能执行身份管理 | 实际页面/API拒绝越权，修改请求体不能提升 actor/企业 | Repository 有负向测试，入口 PEP 待接 |
| 管理员审批可信且不能自审 | MFA可信来源、两名独立主体、旧版本/撤权审批拒绝 | 审批与 MFA 衔接待实现；只创建候选不算通过 |
| 离职后旧会话失效 | 保留旧 JWT/Cookie，撤权后各已接入口拒绝；IdP故障时仍拒绝 | 事务/gate已测，跨入口及清理链待接 |
| 返聘不恢复旧权限 | 同一人员保留历史、新阶段明确授权，旧会话仍拒绝 | HR内核已测，应用流程待接 |
| 文件属于正确用户且不可匿名读取 | 上传、鉴权下载、跨用户/匿名拒绝、删除效果 | 完整私有 S3/应用路径待部署 |
| 重启不丢已确认结果 | 真实对话/审计/任务重启后保留；重复任务不越权 | 完整应用/投递路径待实现与验证 |
| 故障有可理解的反馈 | DB/IdP不可用不放行，明确失败/恢复，不显示假成功 | 部分内核拒绝已测，用户界面/系统流程待验证 |

可复用工程构建/镜像/隔离启动入口见 `scripts/youlin/deployment/README.md`；最新范围见[本轮续建](16-m0-m2-continuation.md)。这些入口不部署真实员工实例。

本机 UAT 可以使用合成数据，但必须是**真实产品流程**。当前身份工程测试（86项）、14项 Keycloak协议或 YAML 校验不能直接填写这些用例为 pass。Windows/macOS 原生包和设备差异另设必要原生例外，不能用 Linux 浏览器冒充。

## 9. GitHub Actions 与部署隔离

[工程工作流](../../../.github/workflows/youlin-verify.yml)仅手动 opt-in、受保护默认分支、专用临时 Runner；配置、预置依赖及原始日志私有归档合同见[工具说明](../../../scripts/youlin/docker/README.md)。该文件尚未证明远端任务已执行。

未来完整 CI/CD 分为：可信源码检查 → 限额依赖/制品构建 → 私有签名/扫描/制品登记 → 本机 Docker UAT → 明确目标环境批准 → 目标部署/迁移 → Smoke → 放流。不要把当前局部工程 job 设成唯一发布门。fork/外部脚本不接触有 Docker 管理权的私有 Runner、公司 Secret 或部署账户。当前不创建远端环境、修改分支保护或注册本机为 Runner。

企业清理确认接口 `YoulinIdentityCredentialCleanup.recordCompletion` 只接受已授权服务对实际撤权事件/精确 epoch 的内部声明，不执行或验证 IdP HTTP 副作用。`identity:record-cleanup` 不授予人工或仅负责relay的身份；必须由完成全部受影响 provider 凭据清理并核实结果的可信适配器调用。HTTP超时/模糊结果、队列ACK、客户端 `verified=true` 都不得触发它。确认不激活主体、不恢复grant，也不ACK运输队列；历史回执不能证明当前epoch已清理。真实适配器未实现前该能力不可对产品开放。

## 10. 后续其他环境部署步骤

1. 提供目标域名、DNS/TLS、网络/出口、总容量、镜像仓库、数据库/对象存储/队列拓扑与受控 Secret 引用；独立确认日志/备份保留及 RPO/RTO。
2. 导入与 UAT **同一 commit/digest** 的制品；目标参数覆盖必须有 diff，不重新拉 latest 或现场改源代码。
3. 核对实际 DB 当前版本及已应用迁移，评估锁与维护窗口；备份 DB、IdP配置/数据库、对象存储及密钥，并在隔离环境证明能恢复。
4. 先基础服务与健康检查，再一次性迁移、身份引导、应用/Worker；未就绪不暴露入口。默认关闭企业高风险能力。
5. 用批准测试账户执行登录、拒绝越权、旧会话撤权、私有文件、任务恢复 Smoke；记录源版本/配置版本。
6. 数据/身份迁移与正式放流另行审批；Eric 多角色不替代要求独立授权的第二人。UAT通过不自动授予生产发布许可。
7. 观察错误率、权限拒绝、HR同步状态、队列最老任务/死信、IdP确认滞后与 DB 连接；阈值按批准容量/SLA配置，不虚填已达标值。

## 11. 回退与恢复

- 应用回退仅在新旧 schema/消息格式兼容时切换到先前固定 digest；先停新任务入口并保留审计与队列状态。不能把“回旧镜像”当作自动撤销 DDL。
- 破坏性迁移优先前滚修复；确需恢复备份须由目标环境授权，记录数据损失窗口和源版本。禁止生成 DROP 脚本假装无损回滚。
- 身份状态从备份恢复后，**先补齐撤权/删除/时间屏障，再开放访问**；恢复旧 grant、Session 或旧 IdP proof 不得让离职人员重新登录。
- 保持稳定事件幂等键；恢复重投时验证租约/fencing/consumer去重。当前 Outbox 没有实现完整 Inbox/外部副作用链，不能据此签收恢复一致性。
- 每次失败、修复、复验使用新的证据轮次；只清理本次清单中的资源。Secret/真实业务数据的备份和恢复产物不进 Git。

## 12. 本轮可执行入口与后续落地项

当前可执行的是以下工程入口，不能将它们重命名为“完整 UAT”。身份套件必须在同一源码版本运行两个互补分片，保持原45秒单次限时、原容器资源及文件隔离；未分片全量入口可能超时，单个分片不能算全套通过。

```bash
node scripts/youlin/nodePostgres.smoke.mjs --identity --identity-shard=1/2
node scripts/youlin/nodePostgres.smoke.mjs --identity --identity-shard=2/2
node scripts/youlin/identity.smoke.mjs
```

R4轮身份测试以两片并集75项记账，不将此前65/73/74项重跑累加。实际工程结果与独立审查见本轮证据，真实 UAT 用例仍待产品接入。

下一落地顺序：批准限额的应用构建/制品来源 → 企业 UAT Compose 与 Secret/资源生命周期控制器 → 完整迁移与实际依赖 → M2 应用鉴权/审批/投递接入 → 首轮真实产品 UAT。未完成前，部署手册、候选工作流和接入原语分别记账，不标 M1/M2 完成交付。

## 13. 本机持久实例：升级、迁移与首管理员引导（已执行，非生产）

持久实例只有一个协调入口，全部步骤在 Docker 内执行，宿主只做编排；所有输出日志写入私有实例目录（0700/0600），凭据不回显。

```bash
node scripts/youlin/deployment/localInstance.mjs status
node scripts/youlin/deployment/localInstance.mjs upgrade sha256:<新镜像>   # 必须先 stop；保留 previousImage
node scripts/youlin/deployment/localInstance.mjs migrate                 # 同一镜像重放迁移链，成功后记录 migrated/migratedImage
node scripts/youlin/deployment/localInstance.mjs prepare-bootstrap <person.json> <password-file>
node scripts/youlin/deployment/localInstance.mjs bootstrap               # 一次性仪式，跑完自动 down（保留卷）
node scripts/youlin/deployment/localInstance.mjs set-phase login-test    # 需 migrated=true；不可回退相位
node scripts/youlin/deployment/localInstance.mjs up | stop | render | sql <query-file>
```

约束与语义：

- 相位只能前进（`quarantined → identity-prepared → login-test`），`login-test` 额外要求“已用当前镜像确认迁移”。`upgrade` 拒绝在项目容器仍在运行时改写；`render` 只做幂等重渲染，不改镜像或相位。
- 迁移由**将要服务流量的同一镜像**一次性重放并校验退出码，之后才写 `migrated=true`＋`migratedImage`；`mark-migrated` 只接受与当前镜像一致的确认，不能给别的镜像背书。
- 引导仪式使用仓库自身的 TypeScript 入口，在有界只读容器内经 Vitest server 项目执行；私有输入（人员 JSON、密码、installation.json）以只读挂载进 `/private`，密码不进 argv、不打印、不落日志。仪式 Compose 保持 internal 网络、不发布宿主端口，Keycloak 通过无状态 TCP relay 让 runner 以其配置的 loopback issuer 访问。
- 仪式前置条件：空业务库（`users`/`youlin_subjects` 为空）、显式 local-test 配置、私有 0600 输入且 `instanceProject` 与实例一致。引导服务在首位人类管理员授权后同事务退休，不允许第二个管理员或复活。
- `sql` 只接受私有文件中的只读语句（拒绝 DML/DDL/权限语句），通过一次性 psql 容器执行，输出写私有日志；DSN 只以进程环境传入。
- 只有 `login-test` 相位允许从宿主浏览器访问，且仅发布 `127.0.0.1`；`quarantined`/`identity-prepared` 与仪式网络保持 internal。Docker 会忽略 internal 网络上的 `ports`，这是本机浏览器可达性的显式取舍，不等于开放 LAN。

已执行结果（本机 loopback，尚未做真实登录 UAT）：新镜像经 `upgrade`＋`migrate`（165 个迁移）安装；`bootstrap` 产出 1 个原生用户、1 个 active 用户主体（authEpoch 0 / authorityVersion 1 / cleanup epoch 0）、1 条 active 手工准入、1 条 active 绑定（issuer `http://127.0.0.1:33211/realms/youlin-local`）、1 条 keycloak account、0 原生会话、0 session proof、8 条命令回执与 8 条对应 Outbox 事件，引导服务已退休、清理服务仍 active。HTTP 侧观测：`/signin` 200、`get-session` null、邮箱注册 403、`sign-in/oauth2` 返回带 PKCE 与 `prompt=login` 的 realm 跳转、realm 登录页无注册/找回密码入口、管理 API 无会话 401 且异源 403。

这些都不等于验收：**尚无任何人类登录、无双账号隔离与停用生效验证、无产品数据持久化验证**，网关 Key 仍为空，管理员仅有 HTTP 接口没有 UI。

[31项缺口账](./13-m0-m2-delivery-gap-register.md) · [当前进度](./09-development-progress.md) · [本机工程环境](./10-local-test-environment.md)
