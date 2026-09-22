# MVP PRD：企业 AI 工作台基础平台

> 状态：产品需求基线 2.2（已纳入记忆、项目上下文与 Agent 授权治理）
>
> 产品：Youlin Clinical AI Hub
>
> 目标版本：MVP 1.0
>
> 目标周期：建设 20～24 周，Pilot 4～6 周
>
> 关联文档：[企业版二开架构](./04-lobehub-extension-architecture-and-roadmap.md) · [集成契约](./06-integration-contracts.md) · [多系统融合接入规范](./09-multi-system-fusion-integration-standard.md) · [湖仓与 API 治理](./10-lakehouse-data-platform-and-api-governance.md) · [记忆与上下文治理](./11-context-memory-and-agent-authorization-governance.md)
>
> 后续阶段：TMF、Protocol、CRA、Study Copilot 等临床业务场景

## 1. 产品定位

首个 MVP 不直接建设单一临床业务系统，而是基于 LobeHub 建设企业统一 AI 工作台基础平台：

```text
企业身份与组织
+ Web/Desktop 多端工作台
+ 企业模型与 Agent
+ Skill / Tool / Workflow 能力中心
+ 企业资源中心与通用知识库
+ 个人/项目记忆、Project Context 与 AI 产出物中心
+ Context Assembler 与企业上下文网络最小骨架
+ 数据与 API 控制中心、湖仓 PoC
+ 权限、审计、配额和发布治理
```

同时用“有临员工工作助手”作为首个 AI 问答灯塔场景，以员工工作指引、规章制度及经批准的非 GxP SOP/WI 为知识范围，验证从登录、授权、资源发布、知识检索、引用回答、Skill、Workflow、Tool 到审计的最小完整链路。

### 1.1 一句话目标

> 企业员工使用 SSO 或企业微信登录同一个账号，在 Web 和 Desktop 中安全管理个人、团队、企业和项目资源，使用经过审核的知识、Skill、Tool、Workflow 和 Agent，并将个人记忆与 AI 产出物持续沉淀到企业服务端。

### 1.2 为什么平台优先

- 企业组织和权限是所有 CRO 场景的共同前置能力；
- Skill、Tool、Workflow 和知识库需要统一注册、审核、发布和回滚；
- 先验证账号、权限、多端、知识和治理，可降低后续业务场景返工；
- 企业约 300～500 人，组织资料显示存在多部门、多专业线、多岗位和矩阵项目协作，不能用简单用户列表代替组织权限；
- 先从通用知识和低风险能力开始，更容易受控 Pilot。

## 2. MVP 目标与非目标

### 2.1 产品目标

1. 支持企业标准 SSO 和企业微信登录；
2. 同一员工不同登录方式关联到唯一企业账号；
3. 同步部门、员工、在职状态和基础角色；
4. 提供企业私有部署的 Web 服务；
5. 提供连接同一企业服务端的 Desktop/Electron 客户端；
6. 建立企业 Skill、Tool、Workflow 和 Agent 的注册与发布治理；
7. 建立个人、团队、企业和项目级资源库，提供上传、分类、分享、预览、查看、下载、编辑、版本、回收站和权限控制；
8. 资源文件原件、版本、预览衍生物、个人记忆载荷和 AI/Workflow 产出物统一保存到企业 OSS/S3 兼容对象存储；
9. 建立企业级、部门/团队级、项目级和个人级知识库，并允许资源按治理流程发布为知识；
10. 知识回答提供文件版本、页码和来源；
11. 支持个人通用记忆、个人项目记忆、项目共享记忆及显式 Promotion；
12. 将 Project 建模为经营与矩阵权限单元，提供项目全局/角色化上下文；
13. 通过 Context Assembler 为 Agent 生成带身份、Project、Purpose、Audience、来源和策略的 Runtime Context；
14. 支持 Agent、Tool、Workflow 产出物自动归档、权限继承、追溯和再次使用；
15. 建立模型、权限、凭证、配额、审计和可观测基础；
16. 通过资源中心与“有临员工工作助手”完成真实用户 Pilot；
17. 建立湖仓与 API 控制面的最小骨架，以一个低敏数据产品和内部只读 API 验证身份、授权、质量、血缘和审计。

### 2.2 非目标

MVP 1.0 不包含：

- CTMS、EDC、eTMF、ePRO、IWRS、QMS 的 GxP/Part 11 受控记录处理和生产写回；
- TMF 智能质检正式业务闭环；
- SAE、医学监查、受试者诊疗等高风险决策；
- 受试者级 PHI 数据处理；
- 完整 OA/BPM 替代；
- 全企业历史网盘和全部知识一次性迁移；
- Office 多人实时协同编辑、匿名公网分享和外部客户文件交换；
- 用户自由安装未经审核的生产 MCP/Tool；
- Desktop 完全离线的企业数据副本；
- 多法人、多客户复杂租户计费；
- 完整企业数仓、全量历史迁移、实时数仓、完整 MDM 和任意 SQL 服务；
- 完整企业知识图谱、全量历史项目上下文迁移和受试者级上下文网络；
- 自动将个人记忆提升为项目/企业记忆，或允许管理层查看全部员工个人记忆；
- 外部供应商生产数据的大规模开放、匿名公网 API 或消费者直连数据库/Trino/OSS/Kafka；
- 任何受试者、人遗、跨境协作数据处理或未经网关策略批准的数据外发。

这些能力进入 MVP 2/3，且必须在预期用途、数据分类和验证范围确认后实施。

## 3. 产品边界与系统关系

```text
新人新事 HR ──同步服务──┐
                         ▼
企业微信 ──身份适配器──► Keycloak（私有 IdP/Broker）
                         │ OIDC
             ▼
      Youlin Web/API
       ├── Web SPA
       ├── Desktop/Electron
       ├── Skill/Tool/Workflow Registry
       ├── Knowledge Gateway
       ├── Model Gateway
       ├── Data/API Control Plane
       └── Audit/Tracing
             │
       RAGFlow / Dify / MCP / Pi Runner
             │
       Data Catalog / Policy / API Gateway
             │
       Data Service / Trino / Lakehouse OSS
```

### 3.1 身份架构与权威源

统一身份框架已选定为 **Keycloak 私有部署**：

- Keycloak 是认证、Token、Session、MFA 和外部身份绑定的权威系统；
- 员工、员工号和在职状态以 HR“新人新事”为真源；
- 部门结构可由新人新事或企业微信通讯录提供，但实施前必须冻结一个主源；
- 企业微信作为登录和协作渠道，通过独立身份适配器接入 Keycloak，不成为人事事实真源；
- LobeHub 只通过 Generic OIDC 接入 Keycloak，保存 Keycloak `sub`、企业用户映射和权限投影，不成为认证或人事主数据源。

### 3.2 已知企业系统与边界

- HR：新人新事，提供员工与在职状态候选真源；
- OA/BPM：泛微，后续在其中重塑正式流程，Youlin 不替代其审批终态；
- CRM：有临自研系统；
- 临床系统：医渡科技定制 CTMS、EDC、IWRS、eTMF，MVP 1 不接入受控记录；
- 财务：用友；QMS、LMS、PV/安全数据库的供应商和接口待核验；
- 数据：各系统理论上可取数，但版本、接口、部署、Owner 和 SLA 必须在接入前验证；Youlin 作为湖仓/API 控制面，不直接成为数仓计算引擎；
- 模型：统一通过现有企业模型网关接入 OpenAI/阿里云百炼，业务数据不得出境或越出批准边界。

## 4. 用户与角色

| 角色 | 目标 | 核心权限 |
| --- | --- | --- |
| 普通员工 | 查询知识、使用已授权 Agent/能力 | 使用，不管理企业资源 |
| 项目成员 | 使用项目资源、共享上下文和本人项目记忆 | 按 Membership/Facet/Purpose 访问 |
| PM/Project Owner | 管理项目共享上下文、成员工作状态和记忆 Promotion | 不读取成员个人项目记忆 |
| 管理层 | 查看项目组合摘要和授权下钻 | 不因职级自动读取全部项目/个人内容 |
| 部门知识管理员 | 管理本部门知识 | 上传、版本、发布、撤回 |
| Skill Creator | 创建和测试 Skill | 管理本人草稿 |
| Tool/Workflow Creator | 接入和测试能力 | 管理本人草稿和测试版本 |
| Reviewer | 审核企业能力 | 评审、退回、批准发布 |
| AI 平台管理员 | 配置模型、能力和策略 | 企业 AI 配置和运行治理 |
| 企业管理员 | 管理组织和 Workspace | 成员、角色、权限和策略 |
| Data Owner/Steward | 管理数据产品、字段、质量和授权 | 审核用途、维护目录和质量 |
| API Product Owner | 发布 API 产品 | 管理契约、版本、Scope、SLA 和消费者 |
| API Consumer | 使用获批数据服务 | 在授权范围和有效期内调用 |
| Auditor | 检查关键操作 | 只读审计和导出 |
| Desktop 用户 | 使用本地文件/受控工具 | 受设备与目录策略约束 |

角色可叠加，但审批者不能审批自己提交的高风险 Tool/Workflow。

## 5. 范围 A：企业登录与账号

### FR-A01 Keycloak 标准 SSO

- LobeHub 通过 Generic OIDC 接入 Keycloak，不直接连接企业微信或其他登录 Provider；
- 支持授权码 + PKCE；
- 校验 issuer、audience、nonce、state 和签名；
- 支持企业域名、回调地址和 Session 策略；
- 生产环境禁止绕过 SSO 的普通注册；
- 保留受控、可审计的紧急管理员账号机制。

### FR-A02 企业微信登录

- Web 支持企业微信扫码或企业内授权登录；
- 企业微信凭证只保存在服务端 Secret Manager；
- 登录成功后通过稳定员工标识查找或绑定企业账号；
- 禁止仅按姓名自动合并；
- 绑定冲突进入管理员处理队列；
- 记录登录 Provider、外部 Subject、时间和结果。

企业微信通过独立 OAuth/OIDC 适配器或 Keycloak Identity Provider SPI 接入 Keycloak，再由 Keycloak 统一向 LobeHub 签发 OIDC 身份。适配器独立部署，禁止修改 Keycloak 核心代码。

### FR-A03 唯一账号和身份关联

建议身份结构：

```text
User
├── Identity(provider=keycloak, subject=<keycloak-sub>)
├── Employee(enterpriseUserId=<legalEntityCode+employeeId>, status=active)
└── IdentityLink(externalProvider=wecom, externalSubject=..., managedBy=keycloak)
```

必须支持：

- 首次登录自动建号或待审批建号；
- Keycloak 标准登录与企业微信登录绑定同一 User；
- 解绑、冲突处理和账号合并审计；
- 禁用用户立即阻止新登录；
- 根据风险配置回收现有 Session；
- 不因邮箱或手机号变化创建第二账号。

### FR-A04 账号生命周期

状态：

```text
pending → active → suspended → deactivated
```

- 新人新事通过同步服务调用 HR API 与 Keycloak Admin API，按规则自动开通；
- 部门调动更新 Keycloak 属性与 Youlin 组织投影，但不改变 Keycloak `sub` 或丢失个人数据；
- 离职/禁用同步后禁用 Keycloak 用户、撤销 Session 并回收 Youlin 访问；
- 同步失败告警且不静默恢复已禁用账号；
- 所有自动变更记录来源和批次。

## 6. 范围 B：组织与权限

### FR-B01 组织同步

- 支持全量初始化和增量同步；
- 同步部门、员工、负责人、在职状态；
- 外部 ID 稳定映射，不用部门名称作为主键；
- 组织变更有差异预览、失败重试和审计；
- 删除优先软删除或失效，不物理删除历史责任记录；
- `@know` 文件作为需求和核验输入，不直接作为生产导入源。

### FR-B02 组织模型

MVP 支持：

```text
Enterprise
├── Department（行政组织）
├── Group（跨部门权限组）
├── Workspace（平台边界）
├── Project（经营/交付与矩阵权限单元）
│   └── ProjectMembership（Role/Workstream/DataScope/有效期）
└── Member
```

首期建议一个企业对应一个主 Workspace，MVP 1 实现通用 Project 和 Membership 基础权限；临床 Study、Country、Site 和受控数据 ABAC 在 MVP 2 扩展。Project 不等于 Workspace、Department 或 Study。

### FR-B03 权限模型

采用：

```text
平台角色 + Workspace RBAC + Project Relationship/ABAC + Resource ACL
```

资源级动作：

```text
view / use / edit / manage / publish
```

资源类型：

- Agent；
- Skill；
- Tool；
- Workflow；
- Knowledge Base；
- Document；
- Model；
- Credential 元数据。

### FR-B04 权限安全

- 所有服务端查询强制带 Workspace 范围，项目内容同时带 Project/Membership/Purpose 范围；
- 部门知识访问由成员关系和资源授权共同决定；
- 搜索、引用、Agent 上下文、Context Network 和 Tool 调用使用同一授权结果；
- PM/管理层可按职责访问项目共享上下文，不默认读取成员个人项目记忆；
- 项目成员退出或授权到期后，引用、搜索、向量、关系和 Context Cache 按 SLA 失效；
- 浏览器隐藏按钮不能代替服务端鉴权；
- 越权响应不泄漏资源名称和元数据；
- 建立跨部门和跨 Workspace 自动化测试。

## 7. 范围 C：Web、Desktop 与私有部署

### FR-C01 Web

- 企业域名访问；
- SSO/企业微信登录；
- Agent、知识、Skill、Tool、Workflow 和管理控制台；
- 主流企业浏览器兼容；
- SSE 流式响应和断线恢复。

### FR-C02 Desktop/Electron

- Desktop 连接同一企业服务端；
- 支持系统浏览器 SSO、回调 Deep Link 或设备授权流程；
- Web 与 Desktop 使用同一用户、权限、对话和企业资源；
- 本地文件访问必须用户主动选择；
- 本地 Tool 按设备、目录和风险策略授权；
- 企业资源不默认完整离线落盘；
- 支持企业签名、升级通道和版本最低要求。

### FR-C03 本地/私有部署

“本地端”同时覆盖企业私有部署：

- 开发环境可使用 Docker Compose；
- Pilot/生产环境根据容量选择 Kubernetes 或受控容器平台；
- PostgreSQL、Redis、S3、RAG、Dify、模型网关可在企业网络部署；
- 环境配置和 Secret 分离；
- 支持备份、恢复、日志、指标和 Trace；
- 对外网络出口使用白名单。

## 8. 范围 D：企业 Skill 中心

### FR-D01 Skill 定义

Skill 是 Agent Skills 格式的领域说明和标准方法，不是可执行 API。

最少字段：

```text
id / name / description / SKILL.md / version / owner
scope / tags / riskLevel / status / reviewers / changelog
```

### FR-D02 生命周期

```text
draft → reviewing → approved → published → deprecated
             ↘ rejected
```

- Creator 只能管理草稿；
- 发布必须审核；
- 生产 Agent 默认只使用 published 版本；
- Agent 运行记录确定 Skill 版本；
- 支持回滚和废弃，不静默覆盖已发布版本；
- 支持企业、部门和个人范围。

### FR-D03 Skill 安全

- 导入 Skill 时校验路径、压缩包和文件大小；
- Skill 中的外部指令视为不可信内容；
- Skill 不能自行提升 Tool 权限；
- 第三方 Skill 需要来源、完整性和安全审核。

## 9. 范围 E：企业 Tool 中心

### FR-E01 Tool Registry

支持注册：

- MCP HTTP/SSE；
- 企业 HTTP API；
- 内置 Tool；
- Dify Workflow Tool；
- Pi Runner/本地 Tool（受控试验）。

每个 Tool 包含输入输出 Schema、版本、Owner、权限、风险、凭证引用、超时、数据策略和审批策略。

### FR-E02 风险策略

| 等级 | 示例 | 默认策略 |
| --- | --- | --- |
| Low | 查询公开制度 | 自动执行并审计 |
| Medium | 生成文档草稿 | 执行后人工确认 |
| High | 发送消息、写业务系统 | 执行前明确审批 |
| Prohibited | 代签、删除受控记录 | 阻断 |

MVP 灯塔场景至少接入一个只读 Tool，不接生产写回。

### FR-E03 Credential

- Credential 值保存在 Secret Manager 或加密存储；
- 普通用户不能看到明文；
- Tool 只获得调用所需短期凭证；
- 支持轮换、失效和使用审计；
- Desktop 不下发企业共享长期密钥。

## 10. 范围 F：企业 Workflow 中心

### FR-F01 Workflow Registry

- 统一注册 Dify 或其他引擎 Workflow；
- 保存输入输出 Schema、固定版本、Owner、权限和风险；
- LobeHub 管元数据、发布和权限，Dify 管流程节点；
- 生产运行不自动跟随 Dify 草稿最新版。

### FR-F02 生命周期

```text
draft → testing → reviewing → published → deprecated
```

- 测试环境与生产凭证隔离；
- 发布前通过 Schema、权限、安全和样例测试；
- 记录每次运行的 Workflow/模型/Prompt 版本；
- 支持取消、超时、重试和运行查询；
- 输出明确标记为 AI 生成或 Workflow 结果。

### FR-F03 MVP Workflow

首期至少实现一个低风险 Workflow，例如：

```text
输入制度主题
→ 检索授权知识
→ 生成带引用的制度摘要
→ 用户确认
→ 导出受控格式草稿
```

不自动发送、不自动审批、不写入临床生产系统。

## 11. 范围 G：企业资源中心、知识、记忆与产出物

### FR-G01 资源库层级

MVP 1 必须支持：

- **个人资源库**：仅本人默认可见，可主动分享或发布为个人知识；
- **团队资源库**：面向部门、业务团队或自定义 Group，由团队 Owner 管理；
- **企业资源库**：面向全企业或指定组织范围，由企业资源管理员治理；
- **项目级资源库**：按 Project 隔离成员、文件和产出物；MVP 1 支持通用项目，Study 的复杂 ABAC 在后续扩展；
- **资源文件夹/集合**：用于分类、排序、标签、收藏和批量授权；
- **知识库**：资源经过解析、审核和发布后形成的可检索知识集合，不等同于普通网盘目录。

同一文件只保存一个企业资源身份，可以通过引用加入多个集合；不得通过无控制复制形成多个无法追溯的版本。

### FR-G02 OSS/S3 对象存储

- 文件原件、不可变版本、预览衍生物、缩略图、OCR/解析中间产物、AI 产出物和记忆附件统一保存到企业 OSS/S3 兼容对象存储；
- PostgreSQL 保存资源 ID、目录、版本、Owner、权限、分享、密级、Hash、对象 Key、保留和审计元数据；
- RAGFlow/原生 RAG 只保存解析、Chunk、Embedding 和检索索引，不成为文件原件真源；
- 对象 Key 使用企业、范围、资源和版本 ID，不包含姓名、原文件名或敏感业务含义；
- Bucket 不向浏览器公开，上传和下载使用服务端授权的短时预签名 URL；
- 开启服务端加密、版本化、生命周期、跨故障域备份及必要的对象锁；
- 上传先进入隔离区，完成大小、MIME、Hash、恶意内容和策略检查后才能进入正式资源区；
- 元数据、对象和索引之间必须有对账、孤儿对象清理和恢复机制。

### FR-G03 文件操作

用户按权限可以：

- 分片上传、断点续传、批量上传和重复文件提示；
- 新建文件夹、移动、复制引用、重命名、标签、收藏和归档；
- 在线预览图片、PDF、文本、Markdown 和浏览器支持的音视频；
- 通过受控转换服务预览 DOCX、XLSX、PPTX 等 Office 文件；
- 查看文件详情、版本、Owner、来源、密级、分享范围和操作历史；
- 下载原件或允许的转换版本；
- 编辑标题、描述、标签和分类；在线编辑 TXT/Markdown；
- Office 内容修改在 MVP 1 通过“下载/编辑后上传新版本”实现，不将多人实时协同编辑作为首期门槛；
- 删除到回收站、恢复或按治理策略申请物理删除。

所有查看、预览、下载、编辑、移动、分享和删除操作都必须在服务端重新鉴权并记录审计。

### FR-G04 版本与删除

- 内容变化创建不可变新版本，不覆盖历史对象；
- 版本记录上传人、时间、Hash、大小、MIME、变更说明和来源；
- 可查看、下载和在授权下恢复历史版本；
- 普通删除进入回收站并保持可恢复期；
- 企业、团队和项目资源的物理删除必须受 Owner、保留策略和 Legal Hold 控制；
- 文件撤回或删除后立即从分享、搜索、Agent 上下文和新下载中排除，OSS 物理清理可以异步执行；
- 引用历史文件的 Agent Run、Workflow Run 和审计记录保留资源/版本标识，不因删除而伪造历史。

### FR-G05 分享与授权

- 支持分享给用户、Group、部门、项目成员和整个企业；
- 权限至少包括 `view / preview / download / edit / manage / share`；
- 分享可设置开始时间、到期时间、是否允许下载和是否允许再次分享；
- 分享链接是短期、不可猜测的资源入口，打开时必须登录并再次鉴权；
- 预签名 OSS URL 只在实际上传/预览/下载时短时生成，不作为可转发分享链接；
- 支持取消分享、权限降级、成员离开项目后的自动回收和分享审计；
- MVP 1 禁止匿名公网分享；外部客户分享进入后续阶段并单独进行数据和安全评估。

### FR-G06 预览与内容处理

- 预览、缩略图、文本抽取、OCR 和转码采用异步任务；
- 所有衍生文件继承原文件权限、密级、保留和删除策略；
- 预览服务在隔离环境运行，限制网络、CPU、内存、时间和输出大小；
- 预览失败不影响原件下载，用户能看到真实处理状态并触发受控重试；
- 下载或预览前再次检查文件状态、用户权限和恶意扫描结果；
- 水印策略可按密级、用户、时间和用途配置。

### FR-G07 资源发布为知识

- 普通资源默认不自动进入 RAG；
- Owner 或知识管理员选择资源版本、适用范围、解析配置和有效期后提交发布；
- 发布后由 RAGFlow 或原生 RAG 完成解析、索引和评测；
- 支持全文、向量和混合检索；
- 按 Workspace、个人/团队/企业/项目范围、状态和版本过滤；
- 回答展示资源、版本、页码/章节和引用；引用打开时再次鉴权；
- 撤回、失效、权限变化和版本替换必须同步更新在线检索范围；
- 用户可以反馈有帮助、引用错误和答案错误，并建立固定 RAG 评测集。

### FR-G08 个人与项目记忆

- 个人记忆随企业账号保存在服务端，支持 Web/Desktop 一致访问；
- 区分个人通用记忆和绑定 `projectId` 的个人项目记忆，默认均仅本人可见；
- 当前 Project-B 的 Agent 默认不能加载 Project-A 私有记忆；跨项目只允许使用经策略确认、不含项目敏感信息的通用项；
- 项目共享记忆属于 Project，状态支持 `draft/proposed/shared/confirmed/superseded/expired/archived`；
- 个人项目记忆只能通过显式 Promotion、脱敏、来源检查和按类别审核成为项目共享记忆；
- 用户可查看、搜索、纠正、编辑、删除、导出、停用，并分别控制保存和 `allowAgentUse`；
- 每条记忆保存 Owner、Project、来源、创建方式、用途、分类、有效期、置信度和最后确认时间；
- PM、管理层、企业管理员和平台运维默认不能读取成员个人项目记忆；
- 记忆不能覆盖企业制度、源系统事实或业务终态；
- 账号停用、成员离项或项目关闭时按策略冻结/归档/删除并停止进入模型上下文。

### FR-G09 AI 与 Workflow 产出物

- Agent、Tool、Workflow、对话和人工编辑产生的文件必须能够保存为服务器端产出物；
- 产出物保存到 OSS，并归类到个人、团队、企业或项目资源库；
- 保存产出物类型、文件格式、创建者、Agent/Workflow/模型版本、来源资源、Run ID、Prompt 摘要、时间、密级和审批状态；
- 产出物默认是草稿，不因 AI 生成自动成为受控文档或知识；
- 产出物继承输入来源最高数据等级、Runtime Context、Audience 和来源权限；使用个人记忆时默认只能保存到个人资源库；
- 用户可以预览、下载、重命名、移动、分享、生成新版本和提交知识发布；
- 同名重复运行不得静默覆盖，必须产生新版本或新的产出物；
- 临时执行文件必须设置 TTL，到期清理前确认未被用户保存或业务记录引用。

### FR-G10 配额与资源治理

- 支持企业、团队、项目和个人的容量、单文件大小、文件数和下载流量配额；
- 管理员可查看容量趋势、大文件、重复对象、失败任务、孤儿对象和长期未使用资源；
- 相同 Hash 可以进行受控去重，但不同权限范围仍保留独立资源授权，不得因去重造成越权；
- 提供数据保留、归档、回收站、Legal Hold、物理删除和恢复策略；
- 所有后台任务可查询、重试、取消和人工处置。

### FR-G11 首批资源与知识范围

建议纳入：

- 企业制度、员工手册；
- 信息安全与 IT 使用说明；
- 通用 SOP；
- 部门职责和常用模板；
- Pilot 用户自行上传的非敏感知识性文档；
- 灯塔 Workflow 生成的执行清单和摘要产出物。

首批排除：PHI、受试者数据、人遗数据、高敏客户材料、未脱敏人事材料、GxP/Part 11 受控记录和未经授权业务数据库。

## 12. 范围 H：Agent、模型与治理

### FR-H01 企业 Agent

- 创建 Agent 并绑定模型、Skill、Tool、Workflow 和知识库；
- Agent 有企业、部门、Project 和个人范围；
- 发布版本可审核和回滚；
- 运行时解析并记录确定版本；
- Agent 有效权限取用户、Agent Manifest、Project Membership/Scope、资源/数据、Tool、Purpose、环境和时间策略交集；
- Agent 必须通过 Context Assembler 获取上下文，不能直接拼接个人记忆、RAG、湖仓或业务 API；
- 用户触发运行同时记录用户与服务身份，后台 Agent 使用独立 Workload Identity 和限时授权。

### FR-H02 模型

- 通过统一 Model Runtime/Gateway 接入；
- 按角色和资源范围授权模型；
- 支持默认模型、禁用模型、配额和预算；
- 默认禁止向外部模型发送业务原文；企业网关必须按“不出境、不越界”基线执行 Provider、字段与用途白名单；
- 记录 Provider、模型版本、Token、延迟和成本。

### FR-H03 审计与可观测

至少记录：

- 登录、绑定、登出、禁用；
- 组织同步和权限变更；
- Skill/Tool/Workflow/Agent 发布；
- 文件和知识库变更；
- Tool 和 Workflow 调用；
- 管理员配置和 Credential 元数据操作；
- 模型调用摘要、用量和策略结果。

敏感内容默认不完整写入普通日志；审计、业务记录和调试日志分开治理。

## 13. 范围 I：数据与 API 控制中心

### FR-I01 数据目录与数据产品

工作台提供数据源、Dataset、Data Product、Metric 和基础血缘目录。MVP 至少发布一个低敏内部数据产品，每个产品必须显示 Owner、Schema、分类、允许用途、刷新频率、质量状态、SLA 和来源血缘。

底层表不能直接成为开放产品；Youlin 保存和展示控制面元数据，不保存为业务数仓或允许前端直连查询引擎。

### FR-I02 湖仓 PoC

使用与资源中心隔离的企业 OSS Bucket、服务账号、KMS Key 和生命周期，验证：

- 一个低敏数据源接入；
- Bronze 原始不可变、Silver 标准化和 Gold 数据产品分层；
- Iceberg/Delta/Hudi 之一的开放表格式；
- Trino 或等价查询引擎；
- Schema Evolution、基础质量、血缘、备份和恢复；
- 不将受试者、人遗、PV、GxP 和跨境数据纳入 PoC。

### FR-I03 API Product 与 Gateway

MVP 至少发布一个内部只读 API：

- 使用 OpenAPI 3.x、显式版本和 Data Contract；
- 通过 Keycloak 独立 Client/Service Account 认证；
- Gateway 校验 Token Audience、Scope、配额、网络和有效期；
- Data Service 执行业务授权、字段白名单、行级过滤和动态脱敏；
- API 只读取 Gold/Data Product，不直接读取 Bronze；
- 浏览器/Desktop 不获得数据库、Trino、OSS 或生产 Client Secret。

### FR-I04 权限申请与授权回收

```text
应用注册
→ 选择 Data Product/API
→ 申明用途、字段、范围、频率和有效期
→ Data Owner 审批
→ 条件触发 Security/Privacy/QA/法务审批
→ 创建 Keycloak Client/Scope 和 AccessGrant
→ Sandbox/契约测试
→ 生产授权
→ 到期自动回收或主动吊销
```

权限叠加平台 RBAC、数据产品/API 订阅、Dataset、行列、脱敏、用途、环境、网络、期限和配额。工作台是策略管理入口，Gateway、Data Service 和查询引擎是强制执行点。

### FR-I05 API 生命周期与审计

API 支持 `draft → testing → reviewing → published → deprecated → retired`。调用和权限决策至少记录 `sub/clientId`、Data Product、API 版本、Scope、用途、策略/授权版本、返回数量、延迟、来源 IP 和 Trace ID；完整敏感响应不得写入普通日志。

外部 Gateway/DMZ、Developer Portal 和供应商生产数据开放不进入 MVP 1；只允许使用合成数据或明确批准的低敏数据完成技术验证。具体要求见[湖仓一体数据平台与 API 开放治理蓝图](./10-lakehouse-data-platform-and-api-governance.md)。

## 14. 范围 J：Project Context 与企业上下文网络

### FR-J01 Project 与 Membership

Project 是客户/合同、交付、资源、收入成本和责任的经营单元。Project Membership 保存角色、工作流、国家/中心、数据范围、委托、有效期和状态。成员调岗、退出或项目关闭触发 Context、搜索、引用、向量/关系投影、缓存和短期凭证失效。

### FR-J02 项目全局与角色化上下文

项目全局上下文包含授权的项目事实、资源、计划、决定、风险、行动、指标、产出物和项目共享记忆。用户视图为全局上下文与 Membership、角色、Facet、Purpose、时间策略的交集，再叠加本人项目私有记忆。

PM 可以读取项目共享上下文和成员工作状态，但不能默认读取个人项目记忆；管理层默认使用项目组合摘要，财务、法务、医学、盲态等分区独立授权。

### FR-J03 Context Assembler

每次 Agent/Workflow 运行前生成 `RuntimeContextPackage`，至少固定 actor、agentVersion、project、purpose、audience、asOf、contextVersion、sourceRefs、memoryRefs、policyDecisionId、outputScopes 和 expiry。提供 Preview/Manifest 和授权解释，允许用户/审计人员了解采用和排除的来源类别。

### FR-J04 多人受众与产出物

共享会话和共享输出使用所有目标受众权限的安全交集，或按段落/附件分级授权。会话新增成员、转发或将个人产出物移动到项目库时重新鉴权。个人记忆默认不进入共享输出。

### FR-J05 企业上下文网络

以有来源、有时效、有分类、有 Policy 的节点和边连接组织、人员、项目、客户、知识、数据产品、决定和 Agent。节点、边、路径、计数、自动补全、聚合、向量和缓存均先授权再查询。MVP 使用 PostgreSQL/JSONB/Search 可重建投影，不要求专用图数据库。

详细要求见[个人记忆、项目上下文、企业上下文网络与 Agent 授权治理蓝图](./11-context-memory-and-agent-authorization-governance.md)。

## 15. 灯塔场景：有临员工工作助手

### 15.1 场景定位

面向全体在职员工提供“怎么做、去哪里、找谁、依据什么”的内部工作问答。首批分析材料为：

- `know/有临医药员工工作指引手册_V1_2605.docx`；
- 后续收集的当前有效员工手册、规章制度、OA 正式通知；
- HR、财务、行政、IT、品牌、法务与内部协作类非 GxP SOP/WI；
- 文档中引用的有效原始制度、流程说明、系统指引和模板。

工作指引本身是导航和摘要，不自动替代其引用文件。当前有效制度/SOP/WI 和 OA 正式通知优先于工作指引；存在冲突、缺失或版本不明时必须拒绝确定性回答并转内容 Owner。

### 15.2 首批问题域

P0 高频低风险范围：

- 新员工入职和企业通用事项；
- 考勤、假期、薪酬福利与 HR 服务导航；
- 财务报销、开票和费用办理导航；
- 行政、出差、办公设备和访客事项；
- IT 系统入口、常见操作和故障联系人；
- 企业规章制度、常用模板和内部协作入口。

P1 在内容 Owner 确认后加入：

- 品牌与对外传播；
- 法律与合规支持导航；
- BD、PM/BPM、CRA 等岗位关键任务节点和建议时限。

临床项目执行 SOP、GxP/Part 11 受控记录、医学/安全终态判断和正式审批不进入 MVP 1 问答范围。

### 15.3 Agent、Skill、Workflow、RAG 与 Tool 分工

| 能力 | MVP 职责 |
| --- | --- |
| Agent | 提供统一“有临员工工作助手”入口、会话和回答展示 |
| Skill | 分别封装入职、HR、财务、行政、IT、法务合规导航、岗位任务等回答规则和边界 |
| Workflow | 执行意图分类、权限检查、检索、版本/冲突检查、引用校验、拒答、转人工和反馈 |
| RAG | 从当前有效且用户有权访问的确定文档版本中执行全文+向量混合检索和 Rerank |
| Tool | 打开泛微 OA 流程、目标系统深链接、联系人目录或反馈入口；MVP 1 不自动提交审批 |

Skill 不复制整份制度正文，Agent 不依赖模型记忆回答制度事实，Workflow 不绕过 Knowledge Gateway 直接访问 RAGFlow。

### 15.4 主流程

```text
员工使用 Keycloak SSO/企业微信登录
→ 打开“有临员工工作助手”
→ Workflow 识别问题域、用户、部门和权限
→ 过滤当前有效且允许问答的知识版本
→ 混合检索和 Rerank
→ 检查来源优先级、版本、冲突和最低证据阈值
→ Agent 生成结构化答案并绑定原文引用
→ 提供 OA/系统/联系人深链接或低置信度转人工
→ 用户反馈，管理员查看质量、成本和审计
```

回答模板：

```text
结论
操作步骤
所需材料
办理入口
完成时限
负责部门/岗位
注意事项
依据文件、版本、章节/页码
```

### 15.5 知识治理和解析

每个发布版本至少具备：文档 ID、类型、版本、生效/失效日期、状态、Owner、批准人、适用部门/岗位、密级、是否 GxP、来源系统、优先级和替代关系。

解析要求：

- 按 Part、章节、小节和完整表格行切片，不只按固定字符数切分；
- 问题、答案、操作步骤、时限、联系人角色和文件链接尽量保持在同一 Chunk；
- DOCX 转换为受控 PDF 预览或提供稳定章节锚点，确保引用可以定位；
- 联系人优先展示岗位/部门，个人姓名、手机和邮箱按权限与最小必要原则处理；
- 普通资源只有经过 Owner 审核和知识发布后才进入 RAG；
- 过期、撤回、被替代或权限变化必须及时退出在线检索范围。

### 15.6 与现有“了解有临”机器人的关系

实施前盘点企业微信现有“了解有临”机器人的知识来源、Owner、历史高频问题、错误反馈和使用量。其历史问题在脱敏后可作为评测集；长期目标是让企业微信入口调用同一 Youlin 员工工作助手服务，避免维护两个口径不同的知识源。

### 15.7 扩展流程

```text
员工选择“生成执行清单” Workflow
→ Workflow 使用当前回答和授权引用
→ 生成带来源的草稿
→ 用户确认
→ 保存到个人/团队/项目资源库并形成 OSS 产出物版本
```

### 15.8 不允许

- 根据过期、被替代或版本不明文件给出未标记的确定答案；
- 引用用户无权浏览的文件或在答案中泄漏联系人敏感信息；
- 将工作指引摘要覆盖当前正式制度、SOP/WI 或 OA 通知；
- 对 GxP、医学、安全、法律个案或正式审批形成终态判断；
- 自动批准、自动提交或对外发送；
- 把用户问题自动写入长期记忆而不遵守记忆策略；
- 将敏感制度全文发送到未批准模型；
- 无依据时使用模型常识补全企业规则。

## 16. 页面范围

员工端：

1. 登录与账号绑定；
2. 首页/Agent 工作台；
3. 资源中心：个人、团队、企业和项目资源库；
4. 文件上传、预览、分享、版本、回收站和下载；
5. 企业知识问答与我的知识；
6. 个人通用记忆、各项目私有记忆和 Agent 使用开关；
7. 项目上下文、项目共享记忆、来源/权限解释和提交共享；
8. 我的 AI/Workflow 产出物；
9. Skill/Tool/Workflow 浏览；
10. Desktop 设备与本地能力提示；
11. 个人容量、用量和授权；
12. 数据目录、数据产品、指标与 API 浏览；
13. 数据/API 权限申请、订阅状态和调用量。

管理端：

1. 组织和成员同步；
2. 角色、用户组和资源权限；
3. Skill Registry；
4. Tool/MCP Registry；
5. Workflow Registry；
6. Agent 发布；
7. 企业资源中心、团队/项目资源库和知识发布；
8. OSS 容量、文件处理、分享、回收站、保留和删除治理；
9. 个人/项目共享记忆、Promotion、Context Facet、Purpose/Audience 和产出物分类策略；
10. Project、Membership、项目角色和离项/关闭策略；
11. 模型、凭证、配额；
12. 数据源、Dataset、Data Product、Metric 和血缘目录；
13. API Registry、版本、Client、Scope、配额和生命周期；
14. 数据/API 权限审批、质量、调用量和授权回收；
15. Context Network、Runtime Context、策略解释和失效状态；
16. 审计、运行和集成健康状态。

## 17. 非功能需求

### 17.1 安全

- 服务端强制鉴权和资源范围；
- 浏览器不持有企业微信、Dify、RAGFlow、共享 Tool、数据库、Trino、OSS 和 API Client 密钥；
- OIDC 防 CSRF、重放和回调劫持；
- 文件扫描、隔离区、预览沙箱、短时预签名 URL、SSRF 防护和 MCP 出站策略；
- OSS Bucket 和对象 Key 不向用户公开，所有资源操作服务端鉴权；
- 高风险工具和外部数据授权有人工审批；
- API Gateway、Data Service 和查询引擎分别强制执行身份、业务、行列和脱敏策略；
- Context Assembler、RAG、Search、Graph 和 Cache 使用同一授权结论，节点、边、计数和自动补全不得形成侧信道；
- 多人会话、会话分享和产出物移动需要按 Audience 重新鉴权；
- Secret 可轮换；
- 依赖、镜像和桌面制品有供应链扫描。

### 17.2 性能候选

容量基线按 300～500 名企业员工可覆盖设计；Pilot 为 20～50 人。峰值并发、文档规模和模型吞吐尚无实测数据，必须通过容量采样和压测冻结。

- 登录完成后首页 P95 ≤ 3 秒；
- 普通列表 P95 ≤ 2 秒；
- 资源列表 P95 ≤ 2 秒，普通文件上传后 95% 在 5 分钟内生成可用预览；
- 知识检索 P95 ≤ 5 秒，不含模型生成；
- 流式回答首 Token P95 ≤ 5 秒；
- 组织增量同步在 15 分钟内生效；
- 禁用用户访问回收时间由安全评估冻结，建议 ≤ 15 分钟；
- MVP 内部只读 API 可用性、P95 延迟和吞吐在选定数据产品后按 SLA 与压测冻结。

### 17.3 可用性

- 外部 RAG/Dify 不可用时明确降级，不伪造成功；
- 异步任务可查询、重试和人工恢复；
- Web 服务故障不破坏 OSS 已存原件、版本、产出物、记忆快照和审计；
- OSS、元数据和检索索引支持对账与可验证恢复；
- Desktop 版本过旧时可阻止高风险本地能力；
- Pilot 前完成备份和恢复演练。

### 17.4 隐私

- 只同步业务所需员工字段；
- 手机、邮箱等字段按用途控制和脱敏；
- 明确日志、对话、资源文件、个人/项目共享记忆、Context Snapshot、产出物、回收站和审计的保留期；
- 支持账号停用后的数据归属和个人数据处理；
- `@know` 资料按内部资料治理，不公开暴露。

## 18. 核心验收标准

### AC-01 唯一账号

同一员工分别使用企业 SSO 和企业微信登录，系统映射到同一 `userId`，不会创建重复个人空间和权限。

### AC-02 生命周期

HR/权威源将员工标记为离职或禁用后，在约定时限内禁止新登录并回收会话；操作有审计。

### AC-03 组织同步

部门新增、调动和失效可增量同步；失败可重试；组织历史责任记录不因同步被物理删除。

### AC-04 权限隔离

部门 A 用户通过页面、API、搜索、Agent、引用和 Tool 均无法访问仅授权部门 B 的资源。

### AC-05 Web/Desktop 一致性

同一用户在 Web 和 Desktop 看到相同企业资源、权限和会话；本地 Tool 额外受设备和本地策略限制。

### AC-06 Skill 发布

Creator 提交 Skill 后需 Reviewer 批准才能成为企业 published 版本；回滚后历史 Agent Run 仍能定位原版本。

### AC-07 Tool 治理

只读 Tool 可按授权调用；高风险 Tool 未批准不能执行；调用记录含用户、Agent、参数摘要、结果和策略。

### AC-08 Workflow 版本

生产 Workflow 固定到已发布版本；Dify 草稿变化不影响生产运行；输出通过 Schema 校验。

### AC-09 知识权限

知识检索仅返回用户有权查看且状态有效的文件片段，引用链接再次执行权限检查。

### AC-10 引用可靠性

灯塔场景答案展示文件名、版本、页码/章节和原文；无依据时不生成伪造引用。

### AC-11 密钥安全

浏览器包、网络响应、普通日志和 Desktop 配置中不存在企业共享服务明文密钥。

### AC-12 审计

Auditor 能还原账号绑定、权限变更、资源发布、知识变更、Tool/Workflow 调用和管理员操作。

### AC-13 故障降级

RAGFlow、Dify、模型或 Tool 超时/不可用时，用户看到真实状态且可恢复，不记录虚假成功。

### AC-14 私有部署

在目标企业环境按 Runbook 完成部署、升级、备份和恢复，环境 Secret 与代码/镜像分离。

### AC-15 Pilot

至少两个部门、20～50 名用户完成 4～6 周 Pilot，无重大权限/安全事件，核心任务完成率达到约定阈值。

### AC-16 多级资源库

同一用户可以按授权访问个人、团队、企业和项目资源库；部门 A、项目 A 的资源无法被未授权用户通过页面、API、搜索、预览或 OSS URL 获取。

### AC-17 文件全生命周期

白名单文件可以上传、预览、查看详情、下载、编辑元数据、产生新版本、分享、取消分享、删除到回收站和恢复；每个动作均有审计，历史版本不会被静默覆盖。

### AC-18 OSS 与一致性

原件、版本、预览衍生物和产出物保存于企业 OSS；浏览器无法枚举 Bucket，预签名 URL 短时有效；抽样执行元数据—对象—索引对账和恢复验证通过。

### AC-19 个人记忆

用户在 Web/Desktop 看到一致的个人记忆，能够查看来源、编辑、删除、导出和停用；用户 A 的记忆不会进入用户 B 的上下文，账号禁用后不再被调用。

### AC-20 产出物归档

Agent/Workflow 生成的执行清单可以保存到指定资源库，记录 Run、模型、来源和版本；重复生成不覆盖既有文件，未发布草稿不会自动成为企业知识。

### AC-21 员工工作助手

员工工作助手覆盖首批 P0 问题域；关键答案 100% 展示依据文件与版本，引用可定位率 ≥95%，有依据回答率 ≥90%，无依据问题正确拒答率 ≥90%，过期文件作为当前依据为 0，跨权限泄漏为 0。冲突、版本不明和超范围问题必须转人工或明确拒答。

### AC-22 湖仓与数据产品

一个低敏数据源完成 Bronze/Silver/Gold 和开放表格式 PoC；工作台能展示一个 Data Product 的 Owner、Schema、分类、质量、SLA 和 Source→Gold 血缘，受试者、人遗、PV、GxP 和跨境数据未进入该产品。

### AC-23 内部 API 与授权

一个内部应用使用独立 Keycloak Client 调用版本化只读 API；无 Token、错误 Audience/Scope、过期授权和超配额请求均被拒绝；字段白名单、行级过滤和至少一种动态脱敏验证通过；调用、授权决策和 Trace 可审计，浏览器/Desktop 无法获取底层数据凭证。

### AC-24 记忆分层与跨项目隔离

个人通用、个人项目和项目共享记忆使用不同所有权和生命周期；用户 A/PM/管理员不能读取用户 B 个人项目记忆；Project-B Agent 不加载 Project-A 私有记忆；个人记忆未经显式 Promotion 不进入项目共享上下文。

### AC-25 项目上下文和管理视图

PM 可以读取授权项目的共享上下文和成员工作状态但不能读取成员私有记忆；管理层能读取项目组合摘要，财务/法务/医学/盲态等受限 Facet 未授权下钻被拒绝且不泄漏对象名称。

### AC-26 Agent Runtime Context

每次 Agent Run 可还原 actor、服务身份、agentVersion、Project、Purpose、Audience、asOf、来源/记忆引用、Policy Decision 和输出范围；服务身份不能扩大用户权限；使用个人记忆的产出物默认不能直接保存到项目共享库。

### AC-27 离项回收与上下文网络

成员退出项目后不能通过历史会话、引用、搜索、向量、节点/边、计数、自动补全或缓存获取项目内容；缓存和派生投影在目标 SLA 内失效，历史 Run 只保留合规审计证据。

## 19. 产品指标

| 维度 | 指标候选 |
| --- | --- |
| 身份 | 登录成功率、重复账号数、禁用生效时间 |
| 采用 | 周活用户、知识问答任务完成率、重复使用率 |
| 资源 | 活跃资源用户、上传/预览成功率、分享使用率、存储量、回收站恢复率 |
| 知识 | 知识发布量、引用可定位率、正确引用率、无依据回答率 |
| 员工助手 | 高频问题任务完成率、正确拒答率、转人工率、反馈闭环率、旧版本命中数 |
| 记忆/产出物 | 通用/项目记忆使用率、Promotion 率、纠正删除率、产出物保存复用率、孤儿对象数 |
| 项目上下文 | Context 装配成功率、来源覆盖、策略拒绝率、缓存失效时间、跨项目/受众泄漏数 |
| 能力治理 | 发布周期、回滚成功率、未授权调用数 |
| 数据产品 | 产品数、Owner 完整率、质量通过率、数据新鲜度、血缘覆盖率 |
| API | 可用性、P95 延迟、错误/拒绝率、活跃 Client、配额使用、到期授权回收时间 |
| 稳定性 | P95 延迟、错误率、异步任务恢复率 |
| 安全 | 越权事件、密钥泄漏、高风险 Tool 绕过数 |
| 成本 | 每活跃用户、每次回答、每个 Workflow 的成本 |

不以 Token 总量、Agent 数量或聊天次数作为单独成功标准。

## 20. Pilot 方案

- 选择 2 个部门，覆盖普通员工、知识管理员和平台管理员；
- 20～50 名用户；
- 以员工工作指引为导航，收集并审核 50～200 份当前有效制度、非 GxP SOP/WI、OA 通知和系统指引；
- 建立覆盖入职、HR、财务、行政、IT 和制度查询的 100～200 个黄金问题，包含冲突、旧版本、无权限和无答案样本；
- 验证个人、团队、企业、项目四级资源库及上传、预览、分享、版本、回收站；
- 验证个人通用/项目私有/项目共享记忆、Promotion、项目上下文和产出物权限继承；
- 至少选择 2 个通用 Project，验证成员多项目角色、PM/管理层视图、跨项目隔离、多人 Audience 和离项回收；
- 3～5 个企业 Skill；
- 1 个只读 Tool；
- 1 个低风险 Dify Workflow；
- 2～3 个已发布 Agent；
- 1 个低敏 Data Product、1 个内部只读 API 和 1 个独立服务 Client；
- 验证目录、质量、血缘、权限申请、Scope/配额、行列过滤、脱敏和审计；
- 同时验证 Web 和少量受控 Desktop 设备；
- 运行 4～6 周，每周复盘身份、权限、质量、成本和体验。

## 21. 后续阶段

### MVP 2：临床业务场景

- TMF 智能质检；
- Protocol Assistant；
- CRA Assistant；
- Study Project Copilot；
- BPM 审批和 Evidence Package；
- CRM、财务、项目等首批企业数据产品、指标语义层和经营看板。

### MVP 3：深度系统集成

- CTMS/eTMF/EDC/ePRO/IWRS/QMS；
- 受控写回；
- 多 Study/项目级 ABAC；
- 更高风险 Agent 和 GxP 验证；
- External API Gateway/DMZ、Developer Portal、Sandbox 和经独立批准的外部数据产品；
- 企业上下文网络复杂遍历、图谱可视化和专用图数据库（仅在真实用例证明需要后）。

## 22. 待冻结决策

1. HR“新人新事”和企业微信中哪个是部门结构真源；
2. 企业微信接入 Keycloak 采用独立 OAuth/OIDC Adapter 还是 Identity Provider SPI；
3. Keycloak 的生产拓扑、Realm/Client、MFA、HA、备份和紧急账号策略；
4. 一个 Workspace 是否代表整个企业；
5. Desktop 登录采用 Deep Link 还是设备授权；
6. 原生 RAG 与 RAGFlow 的首期选择；
7. Dify 首期 Workflow；
8. 现有企业 Model Gateway 的 OpenAI/阿里云百炼路由、部署区域和不出境控制；
9. Pilot 部门、员工助手 P0/P1 知识范围、内容 Owner、来源优先级和数据密级；
10. 用户、对话、资源文件、个人记忆、产出物、回收站、日志和审计保留期限；
11. 企业 OSS 产品、Bucket/地域、加密、版本化、对象锁、备份和容量配额；
12. Office 预览转换组件，以及是否在后续引入 OnlyOffice/Collabora 实时协作编辑；
13. 企业微信现有“了解有临”机器人是迁移、并行还是作为 Youlin 员工助手渠道接入；
14. 企业 OSS 湖仓 Bucket/KMS 分区、开放表格式和查询引擎；
15. 数据目录/血缘、质量、调度、转换和 API Gateway 选型；
16. 首个低敏 Data Product、源系统、Owner、Schema 和 SLA；
17. Authorization Service、行列权限和动态脱敏实现；
18. 内外网 API Gateway 隔离方式及未来外部数据开放审批矩阵；
19. Project 与客户/合同/Study 的基数、Membership 真源和项目关闭状态；
20. PM、管理层、职能角色和成员的 Context Facet 矩阵；
21. 个人项目记忆退出项目后的冻结、脱敏、删除和通用经验保留规则；
22. 项目共享记忆 Promotion 的审核分类和 Owner；
23. 多人 Audience 使用权限交集还是分段输出；
24. Context Snapshot、Cache TTL、失效 SLA 和历史 Agent Run 保留；
25. 企业上下文网络采用 PostgreSQL/Search 还是图数据库的进入标准。
