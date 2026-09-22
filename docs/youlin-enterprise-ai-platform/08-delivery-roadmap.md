# 企业 AI 工作台 MVP 交付路线

> 状态：交付基线 2.3（已补齐 MVP 产品运营闭环）
>
> 对应 PRD：[企业 AI 工作台基础平台](./07-mvp-product-spec.md)
>
> 建设周期：22～26 周
>
> Pilot：4～6 周
>
> 估算精度：ROM，误差可能为 ±30%～50%

## 1. 交付目标

第一阶段交付可供真实员工使用的企业 AI 基础平台：

1. 企业 SSO 和企业微信登录；
2. 唯一企业账号和身份绑定；
3. 部门、员工和在职状态同步；
4. Workspace、角色、用户组和资源权限；
5. Web 与 Desktop/Electron 客户端；
6. 企业 Skill、Tool、Workflow 和 Agent Registry；
7. 个人、团队、企业和项目级资源库，以及上传、分享、预览、下载、版本、回收站和资源权限；
8. 企业/团队/项目/个人知识库、个人记忆服务端存储和 AI/Workflow 产出物归档；
9. 原件、版本、预览衍生物、记忆载荷和产出物的企业 OSS 存储；
10. 基于员工工作指引、规章制度和非 GxP SOP/WI 的“有临员工工作助手”；
11. 模型、凭证、配额、审计和可观测；
12. 私有部署、备份、恢复和发布规范；
13. 数据与 API 控制中心最小骨架、一个低敏湖仓 PoC、一个 Data Product 和一个内部只读 API；
14. Project/Membership、个人/项目共享记忆、角色化项目上下文、Context Assembler 和企业上下文网络最小骨架；
15. 首页、导航、全局搜索、任务、通知、评审、反馈、Feature Flag 和管理员运营闭环。

TMF、Protocol、CRA、Study Copilot 等业务场景进入第二阶段，不进入首期关键路径。

## 2. 规划假设

- LobeHub 企业分支持续同步官方上游；
- 企业约 300～500 人；HR 使用新人新事，OA 使用泛微并计划重塑流程体系，CRM 为自研，CTMS/EDC/IWRS/eTMF 为医渡科技定制，财务使用用友；
- QMS、LMS、PV/安全数据库已纳入版图，供应商、版本、接口和部署待核验；
- 各系统理论上可取得数据，但正式排期前仍需完成接口、Owner、SLA 和合同约束核验；
- 统一 IdP/Identity Broker 已选定为私有部署 Keycloak；员工号和在职状态以新人新事为真源，部门/岗位主源仍需在新人新事和企业微信之间冻结；
- 首期一个企业主 Workspace；Project 是经营/交付与矩阵权限单元，MVP 实现通用 Membership/Context，临床 Study/Country/Site ABAC 后置；
- 首期知识不包含 PHI、受试者、人遗、跨境协作数据和高敏客户资料；MVP 1 不处理 GxP/Part 11 受控记录；
- 当前所有企业数据不出境、不越出批准处理边界；模型统一走现有企业网关，可接 OpenAI 和阿里云百炼；“具备外部 API 能力”不代表已批准外部数据开放；
- 首期只接一个只读 Tool 和一个低风险 Dify Workflow；
- Web 与 Desktop 连接同一企业服务端；
- “本地运行”同时包含开发/私有部署和 Desktop 客户端，不代表企业数据完全离线；
- Pilot 20～50 人、2 个部门、50～200 份知识文件，并验证四级资源库、个人记忆、产出物归档、一个低敏 Data Product 和一个内部只读 API；
- 文件正文、版本、预览衍生物、记忆附件/快照和产出物进入资源中心 OSS；湖仓使用隔离的 Bucket/服务账号/KMS 和 Bronze/Silver/Gold 分层；
- MVP 仅选择一个低敏数据源、一个 Data Product 和一个内部只读 API，不建设完整企业数仓或外部生产 API。

## 3. 总体时间线

```text
W1-2    决策、身份/组织调研、架构和环境设计
W3-5    Keycloak OIDC、企业微信适配、账号绑定
W4-7    组织同步、RBAC、资源权限和审计
W3-8    Web/私有部署、Desktop 登录与升级基线
W6-10   Skill/Tool/Workflow/Agent Registry
W7-14   企业资源中心、OSS、上传/预览/分享/版本/回收站
W9-15   知识发布、RAG、个人记忆和 AI/Workflow 产出物归档
W13-16  有临员工工作助手、领域 Skills、问答 Workflow、只读 Tool
W5-18   数据/API 控制面、湖仓 PoC、Data Product、内部只读 API
W7-20   Project/Membership、记忆分层、Context Assembler、权限/失效
W6-22   首页/搜索、任务/通知、评审/反馈、配置和运营中心
W22-24  安全、性能、OSS/湖仓对账、备份恢复和 UAT
W25-26  发布准备、培训和 Pilot 上线
W27-32  Pilot 运行、评估和下一阶段投资决策
```

采用并行工作流，但身份、权限和审计必须先于企业能力开放。

## 4. 工作流与阶段

### 阶段 0：决策与基线，W1～W2

交付：

- Keycloak 实施 ADR：部署拓扑、Realm/Client、Claims、MFA、HA、备份和紧急账号；
- 企业微信接入 Keycloak 的 Adapter/SPI ADR；
- 员工/部门权威源决策；
- 账号唯一标识和关联规则；
- Workspace/部门/用户组、个人/团队/企业/项目资源范围和分享权限模型；
- 企业 OSS、预览转换、恶意扫描、配额、回收站、保留和删除 ADR；
- Web、Desktop、私有部署拓扑；
- 数据分类、不出境控制、知识白名单和保留策略；
- 已知系统的版本、接口、部署位置、数据 Owner、SLA 和合同约束清单；
- Pilot 部门、用户和知识范围；
- 外部平台版本、接口、部署和技术支持信息核验；
- WBS、RACI、风险和预算基线。

退出门槛：

- HR、IT、安全、业务和法务共同确认身份数据用途；
- 明确企业微信应用申请人和管理员；
- Pilot Owner 和数据 Owner 确认；
- 不存在阻断实施的身份、数据、接口或基础设施问题。

### 阶段 1：工程与运行环境，W1～W4

交付：

- Dev/Test/UAT/Pilot 环境；
- PostgreSQL、Redis、企业 OSS/S3 兼容存储、日志和 Trace；
- CI/CD、SBOM、依赖/镜像扫描；
- Secret Manager 和配置分层；
- 数据库备份、恢复和迁移流程；
- 上游同步和分支保护；
- Web 企业域名和 TLS；
- Desktop 开发构建、签名和升级通道设计。

退出门槛：

- 环境可自动或按 Runbook 重建；
- Secret 不进入 Git、镜像和前端包；
- 基础监控、告警和备份可验证；
- Web 和 Desktop 测试制品可构建。

### 阶段 2：身份、企业微信和账号，W3～W5

交付：

- 标准 OIDC SSO；
- 企业微信扫码/授权登录；
- SSO 与企业微信账号绑定；
- 登录冲突管理；
- Session、登出、禁用和紧急账号；
- 登录审计；
- Web 和 Desktop 登录回调。

退出门槛：

- 同一员工两种登录方式对应同一 `userId`；
- 重放、state/nonce、回调和 Session 安全测试通过；
- 禁用员工在目标时限内失去访问；
- Desktop 能安全完成登录且不保存共享密钥。

### 阶段 3：组织与权限，W4～W7

交付：

- HR/通讯录全量和增量同步；
- Department Tree、Group 和 Workspace Member；
- Owner/Admin/Member/Viewer；
- Agent/Skill/Tool/Workflow/Resource Library/KB/Document/Artifact 资源权限；
- 个人、团队、企业、项目资源范围和分享授权模型；
- 权限管理界面；
- 组织和授权审计；
- 跨部门/Workspace 越权测试。

退出门槛：

- 部门调动和离职可正确同步；
- 搜索、Agent、引用和 Tool 使用同一授权边界；
- 不存在已知跨部门/Workspace 数据泄漏；
- 审计能还原管理员授权变更。

### 阶段 4：Web、Desktop 和私有部署，W3～W8

交付：

- 企业品牌和 Web 入口；
- Web 与 Desktop 连接同一服务端；
- Desktop Deep Link 或 Device Flow；
- Desktop 本地文件选择和目录授权；
- Desktop 版本、设备和更新策略；
- Docker Compose 开发/演示部署；
- 企业 OSS/S3 兼容对象存储、隔离区、正式区、预览区和产出物区；
- Pilot 目标环境部署拓扑；
- 出站网络白名单。

退出门槛：

- 同一账号在 Web/Desktop 看到一致资源和权限；
- 本地能力不绕过 Tool 策略；
- Desktop 制品可签名、升级和回滚；
- 私有环境部署、备份和恢复演练通过。

### 阶段 5：企业能力 Registry，W6～W10

#### Skill

- Agent Skills/SKILL.md 导入和编辑；
- 企业、部门、个人范围；
- 草稿、审核、发布、废弃和回滚；
- 版本、Owner、来源和安全元数据。

#### Tool

- MCP/HTTP/内置 Tool 注册；
- 输入输出 Schema；
- 风险、权限、凭证、超时和审计；
- 一个只读企业 Tool。

#### Workflow

- Dify Adapter 和 Registry；
- 固定版本和 Schema；
- 草稿、测试、审核、发布和停用；
- 一个低风险 Workflow。

#### Agent

- 企业 Agent 发布；
- 绑定模型、Skill、Tool、Workflow、知识库；
- 运行版本快照。

退出门槛：

- 未发布能力不能进入生产 Agent；
- Creator 不能自行批准高风险能力；
- 回滚后历史运行仍能定位原版本；
- Tool/Workflow 失败不会被记录为成功。

### 阶段 6：企业资源中心与 OSS，W7～W14

交付：

- 个人、团队、企业和项目级资源库；
- 文件夹/集合、标签、收藏和分类；
- 分片上传、短时预签名 URL、Hash、恶意扫描和隔离区；
- 图片/PDF/文本/Markdown/音视频预览和 Office 受控转换预览；
- 查看、下载、重命名、移动、元数据编辑和新版本上传；
- 用户/Group/部门/项目/企业分享、到期和取消分享；
- 不可变版本、回收站、恢复、保留、Legal Hold 和异步物理删除；
- 企业 OSS Bucket/Key、加密、版本化、生命周期、备份和对账；
- 企业/团队/项目/个人配额和容量管理；
- 全链路文件操作审计。

退出门槛：

- 无权用户无法通过页面、API、预览、搜索或历史 URL 获取资源；
- 原件、版本、预览和元数据可以对账并完成抽样恢复；
- 分享链接必须登录、短时解析并在打开时重新鉴权；
- 删除资源立即退出分享和新访问，回收站可恢复；
- 预览失败不损坏原件，恶意文件不进入正式资源区。

### 阶段 7：知识、记忆与产出物，W9～W15

交付：

- 企业、团队、项目和个人知识库；
- 普通资源提交、审核和发布为知识；
- 原生 RAG 或 RAGFlow Adapter；
- 混合检索、权限过滤、文件版本、页码/章节和原文引用；
- 撤回、失效、权限变化和索引更新；
- 个人记忆服务端同步、查看、编辑、删除、导出和停用；
- 记忆正文快照/附件加密保存到 OSS，结构化索引保存到 PostgreSQL；
- Agent/Tool/Workflow 产出物保存、分类、版本、来源追踪和资源库归档；
- 用户反馈与 RAG 金标准评测集。

退出门槛：

- 无权文件不进入搜索、Agent 上下文或个人记忆；
- 引用再次打开时执行鉴权；
- 过期/撤回版本不会作为当前有效依据；
- 用户可完整管理本人记忆，用户间不存在记忆泄漏；
- 产出物不静默覆盖，未审核草稿不自动成为企业知识；
- 引用可定位率和正确率达到 Pilot 阈值。

### 阶段 8：灯塔场景，W13～W16

交付：

- “有临员工工作助手”Agent；
- 入职、HR、财务、行政、IT、制度导航等领域 Skills；
- 意图分类、权限、检索、版本/冲突、拒答、转人工和反馈 Workflow；
- 以员工工作指引为导航，纳入经 Owner 审核的当前有效制度、非 GxP SOP/WI、OA 通知和系统指引；
- 已授权有效文件检索和带版本、章节/页码的引用回答；
- OA/系统/联系人目录只读深链接 Tool；
- “生成执行清单”低风险 Workflow；
- 用户反馈、成本和质量 Dashboard；
- Web/Desktop 端到端链路。

退出门槛：

- 100～200 个黄金问题完成评测，覆盖正常命中、冲突、旧版本、无权限和无答案；
- 引用可定位率 ≥95%，有依据回答率 ≥90%，正确拒答率 ≥90%，过期依据和越权泄漏均为 0；
- 无依据时明确拒答；
- 用户无权资源不出现在答案或引用中；
- 一次端到端运行可关联身份、权限、模型、知识、Workflow 和审计。

### 阶段 9：数据与 API 控制面 PoC，W5～W18

交付：

- DataSource、Dataset、Data Product、Metric、API Product、API Client、Policy 和 AccessGrant 元数据；
- 与资源中心隔离的湖仓 OSS Bucket、服务账号、KMS 和生命周期；
- 一个低敏数据源的 Bronze/Silver/Gold 与开放表格式 PoC；
- 一个显示 Owner、Schema、分类、质量、SLA 和血缘的 Data Product；
- 一个 OpenAPI 3.x 内部只读 API、独立 Keycloak Client 和 Gateway 策略；
- 权限申请、Data Owner 审批、Scope/配额、到期回收和调用审计；
- 字段白名单、行级过滤和至少一种动态脱敏；
- Schema/Data Contract 测试、基础质量规则和 Source→Gold→API 血缘；
- 外部 Gateway/DMZ 架构设计，但不开放外部生产数据。

退出门槛：

- PRD AC-22～AC-23 通过；
- 无 Token、错误 Audience/Scope、过期授权和超配额请求均被拒绝；
- 浏览器/Desktop 无底层数据或应用凭证；
- 受试者、人遗、PV、GxP 和跨境数据未进入 PoC；
- Data Product 和 API 的 Owner、质量、血缘、策略及 Trace 可审计。

### 阶段 10：记忆、项目上下文与 Agent 授权，W7～W20

交付：

- Project、Project Membership、角色、Facet、Purpose、Audience 和有效期模型；
- 个人通用记忆、个人项目记忆、项目共享记忆和 Promotion 生命周期；
- 项目全局上下文、PM/管理层/成员角色化 Context View；
- Context Assembler、Preview/Manifest、Runtime Context Package 和策略解释；
- Agent 用户身份+服务身份、权限交集和后台 Workload Identity；
- 多人会话受众交集或分段输出；
- 产出物分类、来源、受众和权限继承；
- 企业上下文网络最小节点/边/策略及 PostgreSQL/Search 投影；
- 离项/项目关闭后的引用、搜索、向量、关系、缓存和凭证失效。

退出门槛：

- PRD AC-24～AC-27 通过；
- PM/管理层不能读取成员个人项目记忆；
- Project-B Agent 不加载 Project-A 私有记忆；
- 服务账号不能扩大用户权限；
- 多人输出和项目产出物无私有记忆泄漏；
- 离项后历史会话、引用、搜索、节点/边、计数、自动补全和缓存均不能恢复内容。

### 阶段 11：工作台与产品运营闭环，W6～W22

交付：

- 企业首页、统一导航、应用切换、最近内容和系统状态；
- 权限感知全局搜索，覆盖资源、知识、Project、Agent、应用和 Data Product；
- 我的任务、异步 Job、失败重试和处理历史；
- 站内通知、订阅/免打扰和企业微信/邮件 Adapter；
- Capability、知识、记忆 Promotion、数据/API 授权统一评审中心；
- 用户个人设置、用量/授权、帮助、反馈和 Trace ID 报障；
- 企业品牌、公告、字典、Feature Flag、灰度和紧急停用；
- 管理员健康、队列、集成、配额、成本、质量、告警和审计视图；
- 管理员、Owner、用户和支持 Runbook。

退出门槛：

- PRD AC-28～AC-33 通过；
- 首页关键入口、全局搜索、任务、通知、评审和反馈链路可用；
- Feature Flag 服务端生效且可审计/回滚；
- 支持人员可使用 Trace ID 定位问题；
- 无权对象不通过搜索补全、计数或摘要泄漏。

### 阶段 12：硬化、UAT 和发布，W22～W26

交付：

- 单元、契约、集成和 E2E 测试；
- OIDC、IDOR、SSRF、Webhook、Prompt Injection 测试；
- 性能和容量测试，包括首页、全局搜索、任务/通知、大文件、并发上传、预览和批量下载；
- OSS 元数据/对象/索引对账、孤儿对象清理和恢复测试；
- 外部服务故障与恢复测试；
- Desktop 安装、升级和签名测试；
- 运维、安全、管理员和用户手册；
- UAT、培训、Go/No-Go；
- Pilot 发布。

退出门槛：

- PRD AC-01～AC-33 通过；
- 无未接受 Critical/High 安全风险；
- 备份、恢复、回滚和应急禁用演练通过；
- Product、IT、安全和业务 Owner 批准。

### 阶段 13：Pilot，W27～W32

- 2 个部门、20～50 名员工；
- 以员工工作指引为首份导航文档，纳入 50～200 份有效制度、非 GxP SOP/WI、OA 通知和系统指引，并加入受控个人知识文件和 AI 产出物；
- 验证个人、团队、企业、项目资源库和资源完整生命周期；
- 验证个人通用/项目私有/项目共享记忆、Promotion、Context View 和产出物权限继承；
- 至少 2 个通用 Project 验证多项目角色、PM/管理层视图、Audience 和离项回收；
- 3～5 个 Skill、1 个 Tool、1 个 Workflow、2～3 个 Agent；
- 1 个低敏 Data Product、1 个内部只读 API、1 个独立服务 Client，验证目录、质量、血缘、授权、配额、脱敏和审计；
- 验证首页、全局搜索、任务、通知、统一评审、反馈、Feature Flag 和 Trace 支持闭环；
- 每周复盘登录、账号、权限、质量、任务完成、反馈、成本和体验；
- 不立即替代原知识和业务系统；
- 形成 MVP 2 临床场景优先级和投入建议。

## 5. 里程碑

| 里程碑 | 时间 | 验证产物 |
| --- | ---: | --- |
| M0 范围与身份决策 | W2 | ADR、权威源、Pilot 和预算基线 |
| M1 工程基线 | W4 | 环境、CI/CD、监控、Web/Desktop 构建 |
| M2 统一登录 | W5 | SSO、企业微信、账号绑定、禁用 |
| M3 组织权限 | W7 | 组织同步、RBAC、ACL、越权测试 |
| M4 多端可用 | W8 | Web/Desktop/私有部署链路 |
| M5 能力中心 | W10 | Skill/Tool/Workflow/Agent 发布治理 |
| M6 企业资源中心 | W14 | 四级资源库、OSS、预览、分享、版本和回收站 |
| M7 知识/记忆/产出物 | W15 | 知识发布、个人记忆、产出物归档和权限验证 |
| M8 灯塔闭环 | W16 | 员工工作助手 + Skills + 问答 Workflow + Tool + 资源归档 + 审计 |
| M9 数据/API PoC | W18 | Lakehouse 分层 + Data Product + 内部 API + 授权/血缘/审计 |
| M10 Context 闭环 | W20 | Project/Membership + 记忆分层 + Runtime Context + 离项回收 |
| M11 产品闭环 | W22 | 首页/搜索 + 任务/通知 + 评审/反馈 + 配置/运营 |
| M12 发布候选 | W24 | 安全、性能、OSS/湖仓对账、恢复和 UAT 候选 |
| M13 Pilot 上线 | W26 | Go/No-Go、培训、发布和支持 |
| M14 Pilot 结论 | W32 | 指标、TCO、风险和下一阶段投资建议 |

里程碑以证据通过为准，不以“编码完成”作为完成。

## 6. 团队配置

| 角色 | 建议 FTE | 职责 |
| --- | ---: | --- |
| Product Owner | 1.0 | 范围、用户、验收和价值 |
| Tech Lead/Architect | 1.0 | 架构、上游同步、身份和安全边界 |
| 后端工程师 | 4.0～5.0 | Auth、组织、Project/Context、任务/通知、Registry、资源、Data/API 和审计 |
| 前端工程师 | 2.5～3.5 | 首页/搜索、工作台、任务/评审、资源/Context、管理台和 Desktop 集成 |
| AI/RAG 工程师 | 1.5～2.0 | 知识、记忆、Context Assembler、产出物、评测、Dify 和模型策略 |
| 数据工程师 | 1.0～2.0 | 湖仓接入、Bronze/Silver/Gold、开放表格式、质量、血缘和 Data Product |
| QA/SDET | 2.0～3.0 | 权限、跨项目/Audience、文件/API 生命周期、数据契约、E2E、性能和恢复 |
| DevOps/SRE | 1.0～1.5 | 环境、OSS/湖仓、Gateway、查询服务、CI/CD、监控、备份和 Desktop 发布 |
| Security/Privacy | 0.3～0.5 | 身份、Tool、数据和供应链安全 |
| UX/设计 | 0.5～0.8 | 信息架构、首页、搜索、任务、管理和核心工作流体验 |
| HR/IT/企业微信管理员 | 0.2～0.5 | 权威源、应用和同步接口 |
| 知识管理员/业务 SME | 0.3～0.5 | 首批内容、问题集和 UAT |
| Data Owner/Steward | 0.3～0.8 | 首个 Data Product、字段、用途、质量、SLA 和授权审批 |
| Project/Context SME | 0.3～0.8 | 项目角色、Facet、记忆 Promotion、离项和管理层视图 |

峰值约 **15～19 FTE**，建设投入约 **75～115 人月**。统一首页/搜索、任务/通知、评审/反馈、企业配置和运营中心补齐了可用产品闭环；完整图谱、外部网关或复杂数据源适配仍需单独立项。

## 7. RACI

| 工作 | Product | Tech Lead | Dev | AI/RAG | QA | HR/IT | Security | 知识/Data Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MVP 范围 | A/R | C | I | C | C | C | C | C |
| 身份权威源 | C | C | I | I | I | A/R | C | I |
| SSO/企业微信 | I | A | R | I | R | R | C | I |
| 组织权限 | C | A | R | I | R | R | C | I |
| Registry | A | R | R | R | C | I | C | C |
| 资源中心/OSS | C | A | R | C | R | I | C | A/R |
| 企业知识/记忆/产出物 | C | C | R | R | R | I | C | A/R |
| Project/Context/Agent 授权 | C | A | R | R | R | C | A/R | A/R |
| 首页/搜索/任务/评审/运营 | A/R | C | R | C | R | C | C | C |
| 湖仓/Data Product | C | A | R | I | R | C | C | A/R |
| API Product/授权 | C | A | R | I | R | C | A/R | A/R |
| 安全发布 | I | C | R | C | R | C | A/R | I |
| Pilot Go/No-Go | A | C | I | C | R | C | R | R |

## 8. 预算 ROM

### 8.1 MVP 一次性预算（人民币，不含税）

| 类别 | ROM | 说明 |
| --- | ---: | --- |
| 研发与测试人力 | 280～600 万 | 75～115 人月，视内部/外包综合成本 |
| 环境、OSS、数据库、湖仓和监控 | 25～90 万 | Dev/Test/UAT/Pilot、对象版本、查询服务、Gateway 和备份 |
| 文件预览、转码和安全处理 | 5～25 万 | Office/PDF 预览、OCR、扫描和异步任务 |
| 模型、Embedding 和评测 | 5～35 万 | 首期资源和通用知识规模 |
| Keycloak/企业微信适配/桌面发布 | 5～35 万 | Keycloak HA、身份适配、证书、签名、MDM 等 |
| 数据目录/API Gateway/质量工具 | 5～40 万 | 优先开源自建，计入集成、运维或商业支持 |
| 安全测试和供应链 | 15～50 万 | 身份、跨项目/受众、图/搜索侧信道、MCP、Desktop、API 和数据权限 |
| 培训、上线和支持准备 | 5～15 万 | 管理员、员工和运维 |
| 风险预备金 | 上述的 15%～20% | 接口、Desktop、身份和安全不确定性 |

综合 ROM：**约 380～1,100 万元**，不包括完整企业知识图谱、全量历史项目/数仓迁移、大规模私有 GPU、外部生产 API 专区和 Office 多人实时协作套件。

### 8.2 年度运行成本

| 类别 | 年度 ROM |
| --- | ---: |
| 平台运维与持续开发 | 80～220 万 |
| 云/机房、资源/湖仓 OSS、查询、Gateway、预览转码、备份和监控 | 35～180 万 |
| 模型与 Embedding | 10～120 万 |
| 外部平台技术支持与升级维护 | 0～80 万 |
| 安全、审计和桌面签名维护 | 10～50 万 |

Pilot 后按每活跃用户、每 GB 月资源/湖仓存储、每查询扫描量、每千次 API、每千次上传/预览/下载、每千页解析、每千次问答和每 Workflow Run 建立单位成本。

## 9. 采购与外部依赖

### 9.1 W1～W4 必须落实

| 项目 | 截止 | 关键内容 |
| --- | ---: | --- |
| Keycloak 私有部署 | W1 | OIDC、Realm/Client、MFA、账号关联、HA、备份和审计 |
| 企业微信身份适配器 | W1 | OAuth 回调、外部 Subject、员工号映射、冲突队列和 Secret |
| 企业微信自建应用 | W1 | Corp ID、Agent、可信域名、回调、Secret |
| HR/组织接口 | W2 | 新人新事 API、字段、频率、状态 |
| LobeHub/Dify/RAGFlow 技术基线 | W2 | 版本、接口、部署、升级和支持联系人 |
| 域名、TLS、邮件/通知 | W2 | 企业域名和回调地址 |
| Secret Manager | W3 | 加密、轮换、审计 |
| Desktop 代码签名 | W3 | Windows/macOS 证书和发布主体 |
| 企业 Model Gateway | W2 | 现有 OpenAI/阿里云百炼路由、部署区域、字段白名单、不出境控制、配额和价格 |
| 企业 OSS 与文件处理 | W3 | 地域、Bucket 分区、加密、版本、预览转码、容量、备份、恢复和生命周期 |
| 湖仓技术基线 | W3 | 独立 Bucket/KMS、开放表格式、Trino、处理/调度、目录血缘和质量工具 |
| API Gateway 与策略 | W3 | 内部网关、Keycloak Client/Scope、限流、配额、行列权限、脱敏和审计 |
| 首个数据源/Data Product | W4 | 源接口、Owner、Schema、分类、质量、SLA、保留和允许用途 |
| Project/Context 基线 | W4 | Project/Membership 真源、角色/Facet、Purpose/Audience、记忆 Promotion、离项失效 |
| Context Provider Spike | W6 | Runtime Context、策略解释、Search/Vector/Graph/Cache 授权和失效 |
| 安全与监控产品 | W4 | SAST/SCA、镜像、日志、Trace、告警 |

### 9.2 Desktop 特别依赖

- Windows 代码签名证书；
- macOS Developer ID/Notarization（如支持 macOS）；
- 企业软件分发或 MDM；
- 自动更新域名和制品存储；
- Deep Link/协议注册安全评审；
- 最低版本和紧急停止本地 Tool 的策略。

## 10. 风险台账

| ID | 风险 | 概率 | 影响 | 应对 | Owner |
| --- | --- | :---: | :---: | --- | --- |
| R01 | Keycloak 标准登录与企业微信身份产生重复账号 | 高 | 高 | 法人代码+employeeId、显式绑定、冲突队列、禁止姓名合并 | Identity Lead |
| R02 | HR 与企业微信组织不一致 | 高 | 高 | 冻结唯一真源、差异报告、人工处理例外 | HR/IT |
| R03 | 离职权限回收不及时 | 中 | 极高 | 增量同步、Session 回收、告警和定期对账 | Security |
| R04 | LobeHub 现有权限路径不完整 | 中 | 极高 | 服务端统一授权、越权测试、RLS 评估 | Tech Lead |
| R05 | Desktop 本地能力绕过企业策略 | 中 | 极高 | 设备、目录、Tool 三层策略和审计 | Desktop/Security |
| R06 | 平台先行演变为无用户的大平台 | 中 | 高 | 强制员工工作助手灯塔场景和真实 Pilot | Product |
| R07 | Skill/Tool/Workflow 无审核即发布 | 中 | 高 | 状态机、职责分离、生产只加载 published | AI Admin |
| R08 | 第三方 MCP/Skill 引发供应链风险 | 高 | 高 | 来源和完整性审查、沙箱、出站白名单、禁止自动安装 | Security |
| R09 | 知识权限在检索或引用阶段泄漏 | 中 | 极高 | 前后双重过滤、引用鉴权、跨部门测试 | Backend |
| R10 | 企业微信 API/回调限制影响 Keycloak 登录 | 中 | 中 | 尽早验证 Adapter/SPI、回调监控和重试、保留标准 OIDC 登录 | Identity Lead |
| R11 | Dify/RAGFlow 升级破坏契约 | 中 | 高 | Adapter、固定版本、契约测试、升级环境 | Tech Lead |
| R12 | Desktop 签名/发布采购延误 | 中 | 中 | W1 启动证书申请，Web 作为降级入口 | PM |
| R13 | 企业网关外部模型路由违反数据不出境/不越界基线 | 中 | 极高 | 路由与区域核验、字段白名单、脱敏、阻断测试、私有模型备选 | Privacy |
| R14 | `@know` 资料含内部敏感信息 | 中 | 高 | 仓库访问控制、分类、禁止公开发布和日志暴露 | Data Owner |
| R15 | 上游同步导致企业能力回归 | 高 | 中 | 独立包/Adapter、双周同步、E2E 回归 | Tech Lead |
| R16 | 员工工作指引与正式制度/OA 通知冲突导致错误回答 | 中 | 高 | 来源优先级、Owner、版本/替代关系、冲突拒答和黄金问题 | Knowledge Owner |
| R17 | OSS 对象、元数据和 RAG 索引不一致 | 中 | 极高 | 事务外箱、幂等任务、定期对账、孤儿隔离和恢复演练 | Backend/SRE |
| R18 | 文件分享或预签名 URL 造成越权 | 中 | 极高 | 服务端鉴权、短时 URL、禁止匿名分享、下载审计和负向测试 | Security |
| R19 | 预览转换器处理恶意 Office/PDF 文件 | 高 | 高 | 隔离区、恶意扫描、沙箱、资源限制和无出站网络 | Security/SRE |
| R20 | 个人记忆误存敏感信息或跨用户泄漏 | 中 | 极高 | 明示记忆、敏感检测、用户管理、严格隔离、停用和删除测试 | AI/Security |
| R21 | AI 产出物被误认为正式受控文档 | 中 | 高 | 默认草稿、来源标识、发布审批和受控系统终态边界 | Product/QA |
| R22 | “了解有临”与新员工工作助手并行产生两个知识口径 | 中 | 高 | 盘点现有机器人、共用 Knowledge Gateway、迁移历史问题、统一 Owner | Product/Knowledge |
| R23 | 把 Youlin 当作计算引擎或允许前端直连湖仓 | 中 | 极高 | 控制面/数据面分离、Data Service、网络隔离和凭证负向测试 | Architect/Security |
| R24 | API 直接暴露底层表导致契约和权限失控 | 中 | 极高 | Data Product、Gold 层、字段白名单、Data Contract 和版本门禁 | Data/API Owner |
| R25 | 内外 API 共用网关或 Client 导致数据外泄 | 中 | 极高 | External Gateway/DMZ、独立 Client、mTLS/IP、用途和期限 | Security |
| R26 | Schema 或数据质量变化静默破坏消费者 | 高 | 高 | 契约测试、质量门禁、血缘影响分析、弃用窗口和消费者通知 | Data Owner |
| R27 | “后续对外”与当前数据不出境边界冲突 | 中 | 极高 | 外部数据产品逐个审批，跨境默认拒绝，阶段 C 独立 Go/No-Go | Privacy/Legal |
| R28 | Project-B Agent 使用 Project-A 个人记忆 | 中 | 极高 | 记忆项目绑定、默认排除、Context Assembler 和跨项目负向测试 | AI/Security |
| R29 | PM/管理层读取成员个人项目记忆 | 中 | 极高 | 私有/共享分层、Facet 矩阵、无超级查看角色 | Product/Security |
| R30 | 图/搜索/计数/缓存泄漏无权项目 | 中 | 极高 | 先授权再检索、边/路径/聚合控制、策略版本化缓存失效 | Backend/Security |
| R31 | Agent 服务身份扩大用户权限 | 中 | 极高 | 权限交集、用户+服务双主体、限时 Workload Grant 和策略解释 | Architect/Security |
| R32 | 功能很多但员工找不到入口 | 中 | 高 | 统一首页/导航、全局搜索、任务中心和用户测试 | Product/UX |
| R33 | 多个审核流程分散且无人处理 | 高 | 高 | 统一评审中心、Owner、SLA、通知和升级 | Product/Ops |
| R34 | Feature Flag 只隐藏前端造成能力仍可调用 | 中 | 极高 | 服务端 Entitlement、审计、回滚和负向测试 | Backend/Security |
| R35 | 用户问题无法定位导致 Pilot 信任下降 | 高 | 中 | Trace ID、自助反馈、支持 Runbook 和反馈闭环 | Support/SRE |

## 11. 质量门禁

每个合并请求：

- lint、类型检查和相关测试；
- 权限、身份和数据模型变更专项 Review；
- 新 Tool/Workflow 必须有 Schema 和风险等级；
- 用户可见流程提供实际验收证据。

每个发布候选：

- SSO/企业微信回归；
- 账号绑定和离职回收；
- 跨部门/Workspace 越权；
- Skill/Tool/Workflow 发布与回滚；
- 四级资源库、上传/预览/分享/版本/回收站和 OSS 越权；
- 个人记忆管理、隔离、删除和停用；
- AI/Workflow 产出物归档、版本和来源追踪；
- 知识发布、检索和引用；
- Lakehouse Bronze/Silver/Gold、质量、血缘和恢复；
- Data Product、Data Contract、内部 API、Keycloak Client、Scope、配额、行列权限和脱敏；
- 个人通用/项目私有/项目共享记忆、Promotion、PM/管理层 Facet 和跨项目隔离；
- Runtime Context、多人 Audience、产出物权限继承、离项后 Search/Vector/Graph/Cache 失效；
- 首页/导航/全局搜索、任务/通知、评审/反馈、Feature Flag 和 Trace 报障；
- 无 Token/错误 Audience/过期授权/超配额/底层凭证泄漏负向测试；
- Web/Desktop 一致性；
- Secret/供应链扫描；
- 外部依赖故障和恢复；
- 备份、恢复、升级和回滚。

## 12. Go/No-Go

### Go

- PRD AC-01～AC-33 通过；
- 同一员工 SSO/企业微信唯一账号验证通过；
- 禁用和权限回收达到 SLA；
- 无跨部门/Workspace 泄漏；
- Web/Desktop 和私有部署链路可用；
- Registry 发布治理和回滚通过；
- 知识回答引用达到阈值；
- 低敏 Data Product 和内部只读 API 达到质量、权限、血缘和审计门槛；
- Project Context、Agent 权限交集、跨项目隔离、受众和离项回收达到门槛；
- 首页、全局搜索、任务、通知、评审、反馈和管理员运营闭环通过；
- 无未接受 Critical/High 风险；
- Pilot Owner、IT、安全和业务共同批准。

### No-Go

- 新人新事与企业微信的部门/岗位权威边界不明确；
- 存在重复账号或离职用户继续访问；
- 浏览器/Desktop 泄漏共享密钥；
- 未发布 Tool/Workflow 可被生产调用；
- 知识检索发生越权；
- API 行列权限、脱敏、到期回收或调用审计不通过；
- PM/管理层可读取个人项目记忆，或 Agent 服务身份扩大用户权限；
- 离项后仍可通过会话、引用、搜索、向量、图或缓存获取内容；
- 高风险 Feature Flag 仅前端隐藏、评审职责分离失败或关键失败任务无运营入口；
- 浏览器/Desktop 可获得湖仓、数据库、OSS 或生产 Client 凭证；
- Desktop 无签名或安全升级渠道；
- 没有真实 Pilot 用户和知识 Owner。

## 13. Pilot 评价与 MVP 2 决策

Pilot 结束输出：

- 登录成功率、重复账号和禁用时效；
- Web/Desktop 活跃和任务完成；
- 知识正确引用率、无依据率和用户反馈；
- Skill/Tool/Workflow 使用和发布效率；
- Data Product 质量、新鲜度、血缘和 API 可用性/调用/拒绝/配额；
- Context 装配成功率、策略拒绝、跨项目/受众泄漏、缓存失效和 Promotion 使用；
- 首页任务到达、搜索成功、通知送达、评审 SLA、反馈闭环和支持解决时间；
- 平台稳定性、安全事件和单位成本；
- 用户访谈和继续使用意愿；
- MVP 2 场景评分。

只有平台质量达到门槛后，才进入 TMF QC、Protocol Assistant、CRA Assistant 和 Study Copilot。业务场景进入顺序由价值、数据、风险和 Owner 共同决定，不按技术展示效果决定。

## 14. 立即行动

1. 指定 Product、Identity、Security、Knowledge Owner；
2. 部署 Keycloak Dev/Test 基线，冻结 Realm、Client、Claims、MFA 和紧急账号策略；
3. 确认新人新事与企业微信的部门/岗位权威边界，实现 HR → 同步服务 → Keycloak Admin API；
4. 申请企业微信测试应用和回调域名，完成 Keycloak Adapter/SPI 技术验证；
5. 补齐泛微、自研 CRM、医渡定制系统、用友及 QMS/LMS/PV 的版本、接口、部署和 Owner，并核验企业模型网关的数据不出境控制；
6. 确认 Web/Desktop 支持的操作系统和分发方式；
7. 选定企业 OSS、Office/PDF 预览转换和恶意文件扫描方案，完成大文件上传与短时下载 Spike；
8. 冻结个人/团队/企业/项目资源权限、分享、版本、回收站、个人记忆和产出物模型；
9. 选择 2 个 Pilot 部门，以员工工作指引为导航收集 50～200 份有效制度/非 GxP SOP/WI/系统指引，并建立 100～200 个黄金问题；
10. 冻结资源中心 OSS 与湖仓 OSS 的隔离拓扑，完成 Iceberg/Delta/Hudi、Trino、目录血缘、质量和 Gateway ADR；
11. 选择首个低敏 Data Product、源系统和 Owner，冻结 Schema、用途、质量、SLA、保留和内部 API 契约；
12. 验证 Keycloak Service Account、Gateway Scope/配额、Data Service 行列过滤、动态脱敏和调用审计；
13. 冻结 Project 与合同/客户/Study 关系、Membership 真源、PM/管理层/成员 Context Facet 和项目关闭策略；
14. 完成个人通用/项目私有/项目共享记忆、Promotion、Audience、Runtime Context 和离项失效 Spike；
15. 冻结首页信息架构、全局搜索范围、任务/通知/评审与泛微边界、Feature Flag 和反馈支持流程；
16. 按实际团队容量拆解 Sprint，面向 300～500 人进行资源/API/Context/搜索/任务容量设计，并按 `12-full-product-capability-and-evolution-blueprint.md` 设置 Stage 1～5 投资门。
