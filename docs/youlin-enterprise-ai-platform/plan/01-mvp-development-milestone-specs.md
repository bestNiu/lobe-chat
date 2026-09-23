# MVP 开发里程碑与 Spec 任务

> 每个里程碑只有在功能、权限、安全、测试、运行和证据同时完成后才能关闭。
>
> 详细验收映射见[追踪矩阵](./02-traceability-and-delivery-gates.md)。
> 每项仍需按[Spec 设计与验证细则](./05-spec-design-and-verification-details.md)展开，依赖可消费时间及待冻结决策见[统一基线](./04-unified-baseline-and-decision-register.md)。里程碑是完成门，不代表依赖能力首次提供时间。

## M0：范围与架构基线（W1～W2）

### 目标

冻结已确认的 MVP 范围、系统边界、责任角色与数据硬边界；技术选型按 D01～D17 登记候选、Spike、批准状态和截止周，不能把 W3～W6 才能实测的决策标成 W2 已冻结。避免开发过程中持续扩大范围。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M00-001 | MVP 范围冻结 | 确认 P0/P1/P2、非目标、AC-01～AC-33、Pilot 用户和退出条件 | Scope Baseline、Backlog |
| SPEC-M00-002 | 身份与组织 ADR | 冻结新人新事员工真源、部门/岗位真源、Keycloak、企业微信 Adapter/SPI | Identity ADR |
| SPEC-M00-003 | Project/Context ADR | W2 确认语义边界和 Owner；关系/真源/Facet 于 D03 截止冻结，Context 策略按 D10 实测批准 | Context ADR 与待决策清单 |
| SPEC-M00-004 | 资源与知识 ADR | 选定企业 OSS 候选、Bucket 分区、预览、扫描、RAGFlow/原生 RAG 边界 | Resource/Knowledge ADR |
| SPEC-M00-005 | 数据/API ADR | 冻结湖仓 PoC 范围和内外网边界；列首个低敏产品候选，D08 截止前批准源、字段与技术方案 | Data/API ADR |
| SPEC-M00-006 | 集成边界 | 冻结泛微、CRM、Dify、RAGFlow、Tool Gateway、模型网关职责 | System Boundary Map |
| SPEC-M00-007 | 安全与数据范围 | 冻结“不出境”、MVP 非 GxP、允许/禁止数据和字段白名单 | Data Boundary Matrix |
| SPEC-M00-008 | 工程与上游策略 | 企业包、Adapter、Provider、Feature Flag、迁移编号和上游同步方式 | Engineering ADR |
| SPEC-M00-009 | 团队/RACI/预算 | W2 实名认领 Product/Tech/Identity/Security/Knowledge/Data/Project Owner；W4 完成逐周容量、建设和 Pilot 预算 | 单 A RACI、Capacity Plan |
| SPEC-M00-010 | 证据与决策库 | 建立 ADR、Spec、测试、UAT、发布和 Pilot 证据目录及模板 | Evidence Templates |

### 功能和验收要求

- 每个系统和能力都有“负责/不负责”；
- 所有 P0 功能有 Owner、目标周和验收 AC；
- 所有外部依赖有版本、接口、部署区域、测试环境和联系人；
- 明确禁止受试者、人遗、PV、跨境和 GxP 受控记录进入 MVP；
- 两个 Pilot 部门、20～50 用户、至少两个通用 Project 候选已指定；
- 首个数据产品和员工助手知识 Owner 已指定；
- 未决项有截止时间、决策人和降级方案。

### 退出证据

- Architecture/Product/Security/Data Review 纪要；
- ADR 清单及批准状态；
- 已估算 Backlog、关键路径和依赖图；
- MVP 范围与 ROM 估算口径确认；正式预算/资源承诺由 D17 批准，不用候选 ADR 替代真实签字。

---

## M1：工程与运行环境基线（W1～W4）

### 目标

建立可重复构建、部署、迁移、观测、测试和回滚的 Dev/Test/UAT 基础。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M01-001 | 本地开发基线 | 按 packageManager 固定 pnpm、bun 脚本及 Node；环境变量、Mock、种子数据和私有环境启动，禁止企业数据接上游公网调试代理 | Developer Runbook |
| SPEC-M01-002 | CI 基线 | Lint、Type Check、Unit、契约、构建、SBOM、SAST/SCA | CI Pipeline |
| SPEC-M01-003 | 制品与镜像 | 不可变镜像、版本标签、签名、漏洞扫描、私有 Registry | Signed Artifacts |
| SPEC-M01-004 | 环境部署 | Dev/Test/UAT 命名空间、配置隔离、Health/Ready 和网络策略 | Deployment Manifests |
| SPEC-M01-005 | 数据库迁移 | 企业 Migration 命名、前向/回滚、锁和失败恢复 | Migration Framework |
| SPEC-M01-006 | Secret 管理 | Secret 引用、轮换、审计，禁止进入代码/镜像/前端 | Secret Runbook |
| SPEC-M01-007 | 可观测 | OTel、结构化日志、指标、Trace、Dashboard 和告警 | Observability Baseline |
| SPEC-M01-008 | Feature Flag 基础 | 服务端 Flag、环境/用户组灰度、审计和紧急关闭 | Flag Service Skeleton |
| SPEC-M01-009 | 测试数据 | 合成账号、组织、Project、资源、知识和低敏数据样本 | Test Data Package |
| SPEC-M01-010 | 上游同步流水线 | upstream fetch、双周同步、冲突检查和企业 E2E | Sync Pipeline |
| SPEC-M01-011 | 私有队列与事件骨架 | Outbox/Inbox、至少一次投递、幂等、退避/死信/重放、限流和出站依赖清单；替代未获批公网 QStash | Queue/Event ADR 与断网证据 |
| SPEC-M01-012 | 审计完整性与保留骨架 | 关键动作追加写、独立审计账号、完整性校验/归档、可信时间、查询/导出授权和失败策略 | Audit Schema/验证用例 |

### 功能和非功能要求

- 制品可追溯到 Git Commit、锁文件、工具链、构建参数和 Digest；如要求字节级可重复构建，需排除时间戳/签名差异后单独验证，不将版本相同等同于字节相同；
- 环境 Secret 与代码、日志、制品完全分离；
- Migration 失败不会留下不可识别的半完成状态；
- 所有请求具有 Request ID/Trace ID；
- Dev/Test/UAT 使用不同 Client、Bucket、数据库和密钥；
- Feature Flag 必须在服务端强制执行；
- 依赖故障时 Health/Ready 反映真实状态。

### 退出证据

- 从空环境部署和升级演练；
- 一次 Migration 失败/恢复演练；
- SBOM、扫描和制品签名报告；
- Trace 从 Web/API 到至少一个依赖的截图/查询证据。

---

## M2：统一身份（W3～W5）

### 目标

同一员工通过标准 SSO 和企业微信进入同一企业账号，并可安全禁用和回收会话。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M02-001 | Keycloak Realm/Client | Realm、Web/Desktop/服务 Client、Redirect URI、MFA、Token 生命周期 | IAM 配置包 |
| SPEC-M02-002 | Generic OIDC | Youlin 只对接 Keycloak，校验 iss/aud/nonce/state/PKCE | OIDC Adapter |
| SPEC-M02-003 | 企业微信身份适配 | OAuth 回调、Subject 映射、错误/重试、Secret 和可信域名 | WeCom Adapter/SPI |
| SPEC-M02-004 | 唯一账号映射 | 法人代码+employeeId，保存 Keycloak sub 和外部身份，禁止姓名自动合并 | Identity Link Model |
| SPEC-M02-005 | 绑定与冲突队列 | 首次绑定、重复候选、人工裁决、拒绝和审计 | Binding UI/API |
| SPEC-M02-006 | Session 生命周期 | 登录、续期、登出、全局登出、禁用、Session/Token 回收 | Session Service |
| SPEC-M02-007 | 紧急账号 | 独立 MFA、来源限制、使用告警、双人管理和审计 | Break-glass Runbook |
| SPEC-M02-008 | Desktop 登录 | Deep Link/设备授权选型实现，防回调劫持和 Token 泄漏 | Desktop Auth Flow |
| SPEC-M02-009 | 服务身份 | Client Credentials、Workload Identity、Scope 和短期凭证 | Service Identity Baseline |

### 验收要求

- 同一员工两种登录方式对应同一 `userId`、个人资源和权限；
- 重复 employeeId、缺失 employeeId 和外部 Subject 冲突不能静默合并；
- 禁用后在约定 SLA 内禁止新登录并回收有效会话；
- 浏览器/Desktop 不保存企业微信 Secret 或共享服务密钥；
- OIDC CSRF、重放、错误 Audience、开放重定向和 Session 固定测试通过；
- 所有绑定、解绑、冲突裁决、禁用和紧急账号使用有审计。

### 关联验收

AC-01、AC-02、AC-11、AC-14。

---

## M3：组织、Workspace、Project 与权限（W4～W7）

### 目标

建立服务端强制执行的组织、矩阵项目和资源授权基础。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M03-001 | HR/组织同步 | 全量+增量、Cursor、重试、差异预览、软失效和对账 | Sync Service |
| SPEC-M03-002 | 组织模型 | Enterprise、Department 树、Position、Group、Member | Organization Schema |
| SPEC-M03-003 | Workspace | 企业主 Workspace、成员、角色和生命周期 | Workspace Service |
| SPEC-M03-004 | Project 基础 | Project、Owner、客户/合同引用、状态和关闭归档 | Project Service |
| SPEC-M03-005 | Membership | Role、Workstream、DataScope、有效期、委托、加入/退出 | Membership Service |
| SPEC-M03-006 | 授权服务 | RBAC+ABAC+Relationship+ACL，PDP/PIP/PEP 和解释 | Authorization Service |
| SPEC-M03-007 | Resource ACL | view/use/edit/manage/publish/share/download 动作矩阵 | ACL Model |
| SPEC-M03-008 | 权限管理 UI | 角色、Group、项目成员、资源授权、期限和来源 | Admin UI |
| SPEC-M03-009 | 权限缓存失效 | 组织/项目/授权变化触发缓存、Session 投影和索引更新 | Invalidation Pipeline |
| SPEC-M03-010 | 权限负向测试 | 跨部门/Workspace/Project、IDOR、搜索/引用/下载/Tool | Security Test Suite |

### 验收要求

- 部门调动、项目加入/退出和账号失效可重放、可对账；
- 所有业务 API 从服务端身份解析 Scope，不信任前端角色/Project 参数；
- 企业/平台管理员不自动获得项目业务内容读取权；
- 错误权限响应不泄漏对象名称、计数和元数据；
- Department A/Project A 用户无法通过任何入口访问 B；
- 历史责任和审计不因组织同步被物理删除。

### 关联验收

AC-03、AC-04、AC-24～AC-27 的权限前置。

---

## M4：Web、Desktop 与私有部署（W3～W8）

### 目标

Web 和 Desktop 使用同一企业服务端、身份、资源、会话和权限，具备安全发布能力。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M04-001 | Web 基线 | 企业域名、OIDC、SSE、错误/维护/无权限页面 | Web Release |
| SPEC-M04-002 | Desktop 构建 | Windows，按决策支持 macOS；环境配置和企业品牌 | Desktop Artifact |
| SPEC-M04-003 | Desktop Auth | 系统浏览器登录、安全回调、Token 系统安全存储 | Auth Implementation |
| SPEC-M04-004 | 本地能力策略 | 设备、目录、文件和 Tool 白名单；风险提示与审计 | Device Policy |
| SPEC-M04-005 | 签名与更新 | 代码签名、Notarization、更新源、最低版本和紧急停用 | Release Pipeline |
| SPEC-M04-006 | 多端一致性 | 会话、资源、知识、记忆、产出物和权限一致 | E2E Suite |
| SPEC-M04-007 | 私有部署 | 域名/TLS、Ingress、网络、代理、镜像和配置 Runbook | Deployment Runbook |
| SPEC-M04-008 | 离线边界 | 网络断开提示、本地缓存最小化、禁止企业数据完整离线副本 | Offline Policy |

### 验收要求

- Web/Desktop 同一用户看到相同企业数据和权限；
- Desktop 本地能力只能在已授权设备、目录和 Tool 范围运行；
- 安装包签名和更新链完整，旧版本可被策略阻止；
- Desktop 配置、日志和网络响应无共享 Secret；
- 服务端禁用后两个客户端均在 SLA 内失去访问；
- 私有环境可按 Runbook 从零部署、升级和回滚。

### 关联验收

AC-05、AC-11、AC-14。

---

## M5：AI 能力中心（W6～W10）

### 目标

完成模型、Prompt、Skill、Tool、Workflow、Agent 的统一注册、审核、发布、运行和回滚。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M05-001 | 通用 Registry | 稳定 ID、Owner、版本、状态、风险、Scope、依赖和标签；插件包/精确版本与安装绑定元数据，复用评审和权限 | Registry Core/Plugin Catalog |
| SPEC-M05-002 | Skill | 内容、输入条件、适用范围、依赖、版本和测试 | Skill Registry/UI |
| SPEC-M05-003 | Tool/MCP/插件绑定 | JSON Schema、风险、凭证、审批、回执；已审核连接器绑定、权限申请和健康；预留 Pi Execution Provider 契约，默认关闭，不要求 MVP 生产 Shell | Tool Gateway/执行适配契约 |
| SPEC-M05-004 | Workflow | Dify Provider、固定发布版本、I/O Schema、超时/取消/重试 | Workflow Provider |
| SPEC-M05-005 | Agent | 模型、Prompt、Knowledge、Skill、Tool、Workflow、Context Policy | Agent Registry |
| SPEC-M05-006 | Model/Prompt | Gateway Adapter、白名单、用途、区域、Prompt 版本和配额 | Model Center |
| SPEC-M05-007 | 发布评审 | draft/testing/reviewing/published/deprecated/retired | Review Workflow |
| SPEC-M05-008 | 运行追踪 | Run ID、确定版本、Token、成本、Tool/Workflow 和错误 | Runtime Trace |
| SPEC-M05-009 | 回滚/停用 | 版本回滚、插件依赖/权限变化检查、紧急停用、排队/运行中任务处置、历史 Run 可追溯 | Rollback Controls |
| SPEC-M05-010 | 示例能力 | 3～5 Skill、1 只读 Tool、1 低风险 Workflow、2～3 Agent | Pilot Capability Pack |
| SPEC-M05-011 | 会话与运行工作台 | 新建/重命名/固定/归档/删除/搜索、附件、引用、SSE 去重/重连、中止/重试、产出物入口和私有历史权限；W10 框架、W16 灯塔、W20 Audience 集成 | FR-H04 UI/API/E2E |

### 验收要求

- 生产只加载 `published` 版本；
- Creator 不能批准自己的高风险能力；
- Credential 只保存 Secret 引用且可轮换；
- Tool 输入输出按 Schema 校验，写操作有幂等和回执；
- Dify 草稿变化不影响生产固定版本；
- Agent Run 可定位所有组成版本并可成本归集；
- Feature Flag 关闭后 API、Agent 和后台任务均不可调用；
- Agent/Skill/Tool/Workflow 和插件目录入口明确，包准入≠已安装≠已启用≠当前调用授权；不允许篡改包、静默扩权升级或生产自动拉最新插件；
- Pi 可选 Spike 的实施范围/资源须另行批准：独立进程/OS 沙箱、显式资源装载、当前授权、会话隔离、取消与产出物校验；关闭 Pi 不影响核心员工助手验收。

### 关联验收

AC-06、AC-07、AC-08、AC-11、AC-12；会话交互归 AC-28，M10/M11 联合完成。Review 核心 W8 可用，Context C0 W10 可用；未通过时 M5 只允许合成测试，不能开放真实 Agent。

---

## M6：企业资源中心（W7～W14）

### 目标

实现个人、团队、企业、项目四级资源库和安全、可恢复的文件全生命周期。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M06-001 | 资源模型 | Library、Folder、ResourceObject、ResourceVersion、ShareGrant | Database Schema |
| SPEC-M06-002 | OSS Provider | Bucket/KMS 分区、对象 Key、版本、短时 URL 和服务账号 | Storage Adapter |
| SPEC-M06-003 | 上传 | 白名单、大小、Hash、分片/断点、隔离区、恶意扫描 | Upload Pipeline |
| SPEC-M06-004 | 预览 | 图片/PDF/文本/Markdown/Office 转换、沙箱和失败状态 | Preview Service |
| SPEC-M06-005 | 文件管理 | 列表、搜索、详情、标签、移动、重命名和元数据编辑 | Resource UI/API |
| SPEC-M06-006 | 版本 | 不可变版本、历史、下载、恢复和同名处理 | Version Service |
| SPEC-M06-007 | 分享 | 用户/Group/部门/Project、期限、下载、撤销、实时鉴权 | Share Service |
| SPEC-M06-008 | 回收与删除 | 回收站、恢复、Legal Hold、Purge Job 和删除回执 | Retention Pipeline |
| SPEC-M06-009 | 配额和运营 | 容量、文件数、流量、失败任务、孤儿对象和趋势 | Resource Admin |
| SPEC-M06-010 | 一致性 | PostgreSQL—OSS—Preview—Index 对账、补偿和恢复 | Reconciliation Job |
| SPEC-M06-011 | 文本编辑与集合引用 | TXT/Markdown 在线编辑、并发版本冲突、收藏/标签/引用、跨库移动前权限重算，不能借移动扩大 Audience | Editor/Collection API 与负向测试 |
| SPEC-M06-012 | 格式与安全预览矩阵 | 固定 DOCX/XLSX/PPTX/PDF/图片/文本及浏览器可播放音视频；转码/OCR 按白名单和资源上限，失败/不支持状态明确；Markdown 禁止执行脚本 | 格式兼容矩阵/沙箱测试 |

### 验收要求

- Bucket 非公开且浏览器不能枚举对象；
- 用户预览/下载经实时鉴权网关，取消分享后历史入口与 Range 请求被拒绝；普通 OSS 签名在过期前不可按分享即时撤销，只用于隔离区上传和批准的服务间传输；
- 历史版本不能静默覆盖；
- 删除后立即退出搜索、预览、分享和新 Agent Context；
- 恶意文件在隔离区且转换器无不必要出站网络；
- 元数据、对象、预览和索引抽样对账/恢复通过；
- MVP 禁止匿名公网分享。

### 关联验收

AC-16、AC-17、AC-18。

---

## M7：知识、记忆与产出物（W9～W15）

### 目标

建立资源发布为知识、可引用 RAG、记忆分层和 AI 产出物归档。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M07-001 | 知识发布 | ResourceVersion、Owner、版本、生效/失效、Audience、用途 | Knowledge Release |
| SPEC-M07-002 | RAG Provider | RAGFlow Adapter、Dataset 映射、摄取、撤回和重建 | Knowledge Gateway |
| SPEC-M07-003 | 解析检索 | 标题/章节/表格切分、混合检索、Rerank、权限过滤 | Retrieval Pipeline |
| SPEC-M07-004 | 引用 | 文件、版本、章节/页码、原文、二次鉴权 | Citation Component |
| SPEC-M07-005 | 评测 | 黄金问题、正常/冲突/旧版/无权限/无答案/注入样本 | Evaluation Suite |
| SPEC-M07-006 | 个人记忆 | general/project_private、来源、过期、允许 Agent、CRUD/导出/停用 | Memory Service |
| SPEC-M07-007 | 项目共享记忆 | ProjectMemory 生命周期、Promotion、脱敏和审核 | Project Memory |
| SPEC-M07-008 | 产出物 | OSS artifact、ResourceVersion、Run/来源/模型/Audience/分类 | Artifact Service |
| SPEC-M07-009 | 生命周期 | 记忆/知识/产出物保留、撤回、删除、索引/缓存失效 | Lifecycle Jobs |
| SPEC-M07-010 | 用户界面 | 我的知识、我的记忆、项目共享记忆、我的产出物 | Product UI |

### 验收要求

- 普通资源不会自动进入知识库；
- 检索前授权，引用打开再次鉴权；
- 失效/被替代文件不作为当前依据；
- 用户 A 的记忆不进入用户 B Context；
- Project-B 不加载 Project-A 私有记忆；
- 个人记忆未经 Promotion 不进入项目共享记忆；
- 使用个人记忆的产出物默认仅个人可见；
- 所有派生索引可从原件和元数据重建。

### 关联验收

AC-09、AC-10、AC-19、AC-20、AC-24。

---

## M8：有临员工工作助手（W13～W16）

### 目标

用真实员工工作问答验证身份、权限、知识、Agent、Workflow、Tool、反馈和审计完整链路。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M08-001 | 内容盘点 | 员工工作指引及 50～200 份有效制度/非 GxP SOP/WI/通知 | Approved Corpus |
| SPEC-M08-002 | 来源治理 | 制度/SOP/WI > OA 通知 > 工作指引 > 培训材料 | Source Policy |
| SPEC-M08-003 | 领域 Skills | 入职、HR、财务、行政、IT、制度/系统导航 | Skill Pack |
| SPEC-M08-004 | 问答 Workflow | 意图、权限、检索、版本/冲突、阈值、拒答、转人工 | QA Workflow |
| SPEC-M08-005 | Answer UI | 结论、步骤、材料、入口、时限、负责岗位和引用 | Assistant UI |
| SPEC-M08-006 | 深链接 Tool | 泛微/OA/系统/联系人目录只读跳转 | Read-only Tool |
| SPEC-M08-007 | 执行清单 | 带引用草稿、用户确认、资源中心归档 | Checklist Workflow |
| SPEC-M08-008 | 了解有临衔接 | 盘点现有机器人、历史问题、渠道和统一知识入口 | Migration/Channel Plan |
| SPEC-M08-009 | 质量 Dashboard | 正确引用、拒答、反馈、转人工、成本和旧版本命中 | Quality Dashboard |
| SPEC-M08-010 | 黄金评测 | 100～200 问，覆盖冲突、旧版、越权、无答案和注入 | Evaluation Report |

### 验收阈值

- 关键答案 100% 显示依据文件和版本；
- 引用可定位率 ≥95%；
- 有依据回答率 ≥90%；
- 无依据正确拒答率 ≥90%；
- 过期文件作为当前依据为 0；
- 跨权限泄漏为 0；
- GxP/医学/法律个案/正式审批终态明确拒答或转人工。

### 关联验收

AC-21 及 AC-01～AC-13 的端到端验证。

---

## M9：湖仓、Data Product 与内部 API PoC（W5～W18）

### 目标

验证工作台控制面、独立湖仓数据面和受控内部 API，不建设完整企业数仓。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M09-001 | 湖仓存储 | 与资源中心隔离的 Bucket、账号、KMS、生命周期 | Lakehouse Storage |
| SPEC-M09-002 | 低敏数据源 | 首个源接口、Schema、Owner、增量/全量和对账 | Source Connector |
| SPEC-M09-003 | 分层 Pipeline | Bronze 原始、Silver 标准、Gold 产品 | Data Pipeline |
| SPEC-M09-004 | 表格式/查询 | Iceberg/Delta/Hudi Spike、Trino 或等价查询 | Technical Report |
| SPEC-M09-005 | 数据目录 | DataSource、Dataset、Version、分类、Owner、血缘 | Catalog UI/API |
| SPEC-M09-006 | Data Product | Schema、Contract、质量、SLA、Purpose 和 Policy | Published Product |
| SPEC-M09-007 | 内部 API | OpenAPI、版本、分页、错误、字段白名单 | Read-only API |
| SPEC-M09-008 | Client/Gateway | Keycloak Client、Audience/Scope、配额、IP/网络 | Gateway Policy |
| SPEC-M09-009 | 数据授权 | AccessRequest/Grant、Owner 审批、期限和回收 | Access Workflow |
| SPEC-M09-010 | 数据安全 | 行过滤、列允许、至少一种脱敏和访问审计 | Security Test |
| SPEC-M09-011 | 质量与血缘 | 规则、阻断/陈旧状态、Source→Gold→API | Quality/Lineage |
| SPEC-M09-012 | 控制面 UI | 产品发现、权限申请、订阅、调用量和健康 | Data/API Center |

### 验收要求

- 仅使用批准低敏字段，禁止受试者、人遗、PV、GxP 和跨境数据；
- API 只读取 Gold/Data Product，不直接读取 Bronze；
- 无 Token、错误 Audience/Scope、过期授权和超配额请求被拒绝；
- 字段白名单、行过滤和脱敏通过；
- 浏览器/Desktop 不获得数据库、Trino、OSS 和 Client Secret；
- API 响应可追溯到源、转换、质量和策略版本；
- Schema 破坏性变化被契约门禁阻断。

### 关联验收

AC-22、AC-23。

---

## M10：Project Context 与 Agent 授权（W7～W20）

### 目标

按用户、项目、Purpose、Audience 和时点动态装配 Agent 上下文，防止跨项目、跨人员和服务身份提权。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M10-001 | Context 模型 | Definition、Node、Edge、View、Snapshot、PolicyDecision | Context Schema |
| SPEC-M10-002 | Project Context | 项目事实、资源、决定、风险、行动、指标和共享记忆 | Project Context View |
| SPEC-M10-003 | Context Provider | assemble/preview/explain/invalidate | Context Service |
| SPEC-M10-004 | Runtime Package | actor、agent、project、purpose、audience、asOf、来源和 expiry | Runtime Contract |
| SPEC-M10-005 | 权限交集 | User∩Agent∩Project∩Resource/Data∩Tool∩Purpose∩Time | Policy Implementation |
| SPEC-M10-006 | 角色化视图 | 成员、PM、管理层摘要、财务/法务等 Facet | View Policies |
| SPEC-M10-007 | 多人 Audience | 权限安全交集或分段授权，会话新增成员再鉴权 | Audience Controls |
| SPEC-M10-008 | 产出物继承 | 最高分类、来源 ACL、个人记忆标志、可保存范围 | Output Policy |
| SPEC-M10-009 | 上下文网络 | PostgreSQL/JSONB/Search 节点边投影和授权遍历 | Context Projection |
| SPEC-M10-010 | 失效机制 | 离项/关闭使引用、Search、Vector、Graph、Cache、Token 失效 | Invalidation Service |
| SPEC-M10-011 | 后台 Agent | Workload Identity、限时 Grant、Purpose 和 Owner | Scheduled Agent Policy |
| SPEC-M10-012 | 权限解释 | UI 展示采用/排除来源类别、策略和拒绝原因 | Explain UI |

### 验收要求

- PM/管理层不能读取成员个人项目记忆；
- Project-B Agent 不加载 Project-A 私有记忆；
- Agent 服务身份不能扩大用户权限；
- 多人输出不泄漏仅发起人可见内容；
- 使用个人记忆的输出默认不能进入项目共享库；
- 无权项目不通过节点、边、计数、补全、聚合和缓存泄漏；
- 离项后历史会话和 Run 不形成内容访问旁路；
- 每次 Run 可还原 Runtime Context 和 Policy Decision。

### 关联验收

AC-24、AC-25、AC-26、AC-27。

---

## M11：工作台与产品运营闭环（W6～W22）

### 目标

让用户找得到、办得完、看得懂，运营人员能审核、处理异常、配置、反馈和支持。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M11-001 | 企业首页 | 最近会话、常用 Agent、我的项目、待办、通知、系统状态 | Home UI/API |
| SPEC-M11-002 | 统一导航/应用中心 | 信息架构、Module Registry、深链接/嵌入入口和收藏 | Navigation/App Center |
| SPEC-M11-003 | 全局搜索 | Resource/Knowledge/Project/Agent/App/Data Product，权限裁剪 | Search Service/UI |
| SPEC-M11-004 | 我的任务 | 异步 Job、人工节点、评审、失败重试和源系统链接 | Work Center |
| SPEC-M11-005 | 通知 | 站内、订阅/免打扰、去重、企业微信/邮件 Adapter | Notification Service |
| SPEC-M11-006 | 统一评审 | Capability、Knowledge、Memory、Data/API，SLA 和职责分离 | Review Center |
| SPEC-M11-007 | 用户设置 | 语言/时区/通知/记忆/模型/Desktop/用量/授权 | Settings UI |
| SPEC-M11-008 | 反馈与支持 | 回答/引用/系统反馈、分类、指派、结果、Trace ID | Feedback Center |
| SPEC-M11-009 | 企业配置 | 品牌、公告、字典、默认策略、版本和审计 | Config Center |
| SPEC-M11-010 | Feature Flag | 环境/用户组灰度、服务端 Entitlement、回滚/紧急停用 | Flag Admin |
| SPEC-M11-011 | 运营中心 | 健康、队列、失败任务、集成、配额、成本、质量和告警 | Operations UI |
| SPEC-M11-012 | 帮助和 Runbook | 用户帮助、管理员/Owner/支持流程和发布说明 | Help Center |
| SPEC-M11-013 | Module Registry 与融合容器 | Manifest 生命周期、独立 Client、URL/Origin 白名单、iframe sandbox、postMessage source/Schema、健康与深链接降级；W8 契约，W14 CRM Spike | Module API/容器/E2E |
| SPEC-M11-014 | CRM/OA 与 Launch Code 验证 | CRM Standalone/Embedded、一次性启动码原子交换/过期/绑定、登出和权限一致；泛微批准只读入口，失败保留安全深链接；不接 OA 终态写回 | Spike、安全与兼容报告 |

### 验收要求

- 用户从首页可进入所有 Pilot 核心任务；
- 搜索只返回有权对象且无计数/补全泄漏；
- 任务投影不取代泛微/源模块正式状态；
- 通知有去重键、重试和敏感正文控制；
- 高风险提交人不能审核自己；
- 用户反馈可闭环并通知处理结果；
- 支持人员可用 Trace ID 定位但不自动获得敏感正文；
- Feature Flag 在页面/API/Agent/后台任务同时生效；
- 关键失败任务有 Owner、重试、告警和人工处置入口。

### 关联验收

AC-28～AC-32；AC-33 仅运营界面和 Runbook 分项，恢复演练在 M12。M11-006 Review 后端核心 W8 提供给 M5/M7/M9，不得等 W22 才支持审批。

---

## M12：发布候选与 UAT（W22～W24）

### 目标

形成满足安全、质量、性能、恢复和业务验收要求的 Release Candidate。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M12-001 | 全量回归 | AC-01～14、AC-16～33、Web/Desktop、角色/浏览器；AC-15 只测准备条件 | Regression Report |
| SPEC-M12-002 | 安全测试 | OIDC、IDOR、SSRF、MCP、文件、Prompt、API、Context 侧信道 | Security Report |
| SPEC-M12-003 | 性能容量 | 首页/搜索/任务、文件、RAG、Context、API 和并发 | Performance Report |
| SPEC-M12-004 | 数据一致性 | OSS/元数据/Preview/RAG、湖仓/目录/API、缓存失效 | Reconciliation Report |
| SPEC-M12-005 | 故障注入 | RAG/Dify/模型/OSS/Gateway/通知故障和恢复 | Resilience Report |
| SPEC-M12-006 | 备份恢复 | PostgreSQL、OSS、配置、Keycloak、索引可重建、RPO/RTO | DR Evidence |
| SPEC-M12-007 | 升级回滚 | 应用、Migration、Desktop、Feature Flag 和依赖升级 | Release Rehearsal |
| SPEC-M12-008 | UAT | 普通员工、PM、管理层、Owner、管理员和 Auditor | UAT Sign-off |
| SPEC-M12-009 | 文档培训 | 用户、管理员、知识/Data/Project Owner、支持和安全 | Training Package |
| SPEC-M12-010 | 缺陷/风险 | 缺陷分级、风险接受、已知问题、降级和修复日期 | Risk Acceptance |

### 发布候选门禁

- AC-01～AC-14、AC-16～AC-33 通过；AC-15 准备就绪，实际运行结果在 M14 签收；
- 无开放 P0/P1 缺陷或 Critical/High 安全风险，硬门禁不得风险接受；
- P2/P3 例外需 Owner、补偿控制、批准人和到期修复日期；
- 备份恢复、升级回滚、紧急停用、离职/离项回收演练通过；
- Product、IT、Security、Data/Knowledge/Project Owner 和 QA 批准；
- Pilot 数据、用户、内容、支持和监控均准备完成。

---

## M13：Pilot 上线（W25～W26）

### 目标

安全发布到企业 Pilot 环境，使 20～50 名真实用户可以在受控支持下开始工作。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M13-001 | 生产准备 | 域名、证书、网络、Client、Secret、备份、告警和容量 | Readiness Checklist |
| SPEC-M13-002 | 用户/组织导入 | Pilot 用户、部门、Group、Project、角色和测试账号清理 | Access Baseline |
| SPEC-M13-003 | 内容发布 | 50～200 份知识、100～200 黄金问题、Agent/Skill/Tool/Workflow | Pilot Content Release |
| SPEC-M13-004 | Data/API 发布 | 低敏 Data Product、内部 API、Client、授权和 Dashboard | Data/API Release |
| SPEC-M13-005 | Desktop 发布 | 签名安装包、更新、最低版本和设备支持 | Desktop Release |
| SPEC-M13-006 | 培训 | 员工、PM、管理层、Owner、管理员和支持 | Attendance/Evidence |
| SPEC-M13-007 | 支持机制 | 服务台、值班、升级、重大事件和每日健康检查 | Support Runbook |
| SPEC-M13-008 | Go/No-Go | 门禁复核、风险接受、回滚窗口和决策 | Go-live Record |
| SPEC-M13-009 | 发布验证 | 登录、权限、问答、资源、Context、API、通知和审计 Smoke | Smoke Report |

### 验收要求

- Pilot 用户只能访问约定部门、Project、资源和数据；
- 监控、告警、支持和回滚人员在线；
- 用户知道 AI 边界、反馈方式和正式系统终态；
- 发布后 Smoke 和抽样权限测试通过；
- No-Go 条件出现时可以在窗口内回滚或关闭对应 Feature。

---

## M14：Pilot 运行与投资决策（W27～W32）

### 目标

通过真实使用验证产品价值、质量、安全、单位成本和完整产品下一阶段优先级。

### Spec 任务

| Spec ID | 任务 | 具体功能/要求 | 交付物 |
| --- | --- | --- | --- |
| SPEC-M14-001 | Pilot 运营 | 周报、活跃、任务完成、内容缺口、问题和版本 | Weekly Report |
| SPEC-M14-002 | 产品指标 | 登录、搜索、任务、问答、资源、Context、API、反馈和成本 | KPI Dashboard |
| SPEC-M14-003 | 质量复评 | 黄金问题、线上差错、拒答、引用、权限和模型漂移 | Quality Report |
| SPEC-M14-004 | 安全复核 | 越权、Secret、离职/离项、异常下载、Tool/API 和事件 | Security Review |
| SPEC-M14-005 | 用户研究 | 普通员工、PM、管理层、Owner、管理员访谈和可用性 | Research Report |
| SPEC-M14-006 | TCO | 人力、模型、OSS、查询、API、转码、支持和单位成本 | TCO Report |
| SPEC-M14-007 | 问题闭环 | P0/P1 问题、内容修正、产品改进和技术债 | Closure Backlog |
| SPEC-M14-008 | 场景评分 | PM Copilot、报销、报价、Study Startup、Protocol、CRA、TMF | Scenario Scorecard |
| SPEC-M14-009 | Stage 投资门 | Stage 1～5 的价值、数据、风险、Owner、团队和预算 | Investment Proposal |
| SPEC-M14-010 | Pilot 结论 | 扩大、限范围继续、整改后继续或停止 | Executive Decision |

### Pilot 成功门槛

- 无重大身份、权限、数据泄漏或不可恢复事件；
- 员工助手达到 AC-21 阈值；
- 资源、Context、Data/API、任务/评审和运行链路达到约定 SLO；
- 真实任务完成率、重复使用率和用户继续使用意愿达到 D15 在 Pilot 开始前冻结的门槛，提交原始分子/分母、样本量与观察周期；
- 单位成本和支持负担可接受；
- Stage 1 的 Owner、场景、数据、团队和投资门明确。

### 最终输出

- Pilot 总结和管理层一页纸；
- AC-01～AC-33 最终证据包；
- 安全、质量、TCO 和用户研究报告；
- 下一阶段 3～6 个月已排序 Backlog；
- 完整产品 24～36 个月路线的更新版本。
