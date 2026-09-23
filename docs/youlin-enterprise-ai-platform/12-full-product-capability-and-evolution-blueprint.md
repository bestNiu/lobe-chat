# Youlin 企业 AI 工作台完整产品能力与演进蓝图

> 状态：产品全景与分阶段建设基线
>
> 规划周期：MVP 1 建设 22～26 周、Pilot 4～6 周；完整产品体按 24～36 个月滚动建设
>
> 关联文档：[总体战略](./01-cro-ai-native-workbench-strategy.md) · [二开架构](./04-lobehub-extension-architecture-and-roadmap.md) · [MVP PRD](./07-mvp-product-spec.md) · [交付路线](./08-delivery-roadmap.md) · [多系统融合规范](./09-multi-system-fusion-integration-standard.md) · [湖仓/API 治理](./10-lakehouse-data-platform-and-api-governance.md) · [记忆/上下文治理](./11-context-memory-and-agent-authorization-governance.md) · [开发执行计划](./plan/README.md)

## 1. 产品愿景

Youlin 的完整产品不是聊天入口、知识库、Agent 商店或数据门户中任何单一产品，而是 CRO 企业统一的 AI 工作与治理操作系统：

```text
员工工作入口
+ 项目经营与交付上下文
+ 企业知识与资源
+ Agent/Skill/Tool/Workflow 工厂
+ 数据、指标与 API 服务
+ 应用集成和流程协同
+ 安全、权限、审计和运营治理
```

完整产品目标：

1. 员工使用同一身份和工作台处理知识、项目、数据、任务和 AI 工作；
2. 项目成为经营、交付、资源和权限的统一矩阵单元；
3. AI 在授权上下文中工作，结果具备来源、版本、受众和责任边界；
4. 现有系统保持业务终态，新模块同时支持 Embedded 和 Standalone；
5. 企业知识、湖仓数据、API 和上下文网络形成可治理的服务层；
6. 低风险场景快速产品化，高风险/GxP 场景按预期用途独立验证；
7. 平台能力可以内部复用，也可以按模块独立部署和销售。

## 2. 产品边界

| 产品/系统 | 主责 | 不承担 |
| --- | --- | --- |
| Youlin 工作台 | 统一交互、上下文、AI 能力、治理、任务和展示 | 源业务系统终态、湖仓计算引擎、正式电子签名 |
| Keycloak | 身份、会话、MFA、Client 和 Broker | HR 主数据、业务对象授权终态 |
| 泛微/BPM | 正式审批、流程、签名、SLA | 开放式 Agent 推理 |
| RAGFlow/Knowledge Gateway | 文档解析、检索、引用 | 文件主存储、用户主数据 |
| Dify/Workflow Runtime | AI 工作流编排 | 跨系统正式长事务终态 |
| Tool Gateway | 工具注册、策略、执行和回执 | 共享万能凭证 |
| 企业资源中心 | 文件、版本、分享、预览、记忆/产出物载荷 | 受控文档系统终态 |
| 湖仓/Data Service | 存储、计算、质量、血缘、数据产品和 API | 员工门户、源系统交易写回 |
| 源业务系统 | 权威业务事实和受控记录 | 企业统一 AI 入口 |

## 3. 目标用户与核心任务

| 用户 | 核心任务 |
| --- | --- |
| 普通员工 | 找制度、找流程、找系统、管理个人资源和记忆、使用 Agent |
| 项目成员 | 查看本人项目上下文、资源、任务、共享记忆和产出物 |
| PM/Project Owner | 查看项目全局上下文、风险、行动、交付、资源和经营状态 |
| 管理层 | 查看项目组合、经营指标、风险摘要和授权下钻 |
| 职能负责人 | 管理专业线知识、人员能力、质量和任务 |
| 知识管理员 | 资源审核、版本、知识发布、撤回和评测 |
| Agent/Skill/Tool/Workflow Creator | 创建、测试、提交和运营企业 AI 能力 |
| Reviewer/QA/Security | 风险评审、发布门禁、验证和审计 |
| Data Owner/Steward | 管理 Dataset、Data Product、指标、质量和授权 |
| API Product Owner/Consumer | 发布、订阅和运营 API |
| 企业/平台管理员 | 身份组织、Workspace、策略、配额、运行和配置 |
| 开发者/供应商 | 按契约开发可嵌入、可独立部署的模块和接口 |

## 4. 完整产品信息架构

```text
Youlin
├── 首页与决策收件箱
├── AI 工作台
│   ├── 对话与会话
│   ├── Agent
│   ├── Skill
│   ├── Tool
│   ├── Workflow
│   └── 模型与 Prompt
├── 我的工作
│   ├── 我的任务
│   ├── 通知与订阅
│   ├── 审批/评审中心
│   ├── 我的资源
│   ├── 我的记忆
│   └── 我的产出物
├── 项目工作台
│   ├── 项目 360 与上下文
│   ├── 成员与角色
│   ├── 资源与知识
│   ├── 共享记忆
│   ├── 风险/问题/行动
│   ├── 交付物
│   └── 指标与经营视图
├── 企业资源与知识
│   ├── 资源中心
│   ├── 知识中心
│   ├── 全局搜索
│   └── 员工工作助手
├── 数据与 API 中心
│   ├── 数据目录
│   ├── Data Product
│   ├── 指标
│   ├── API/Client
│   ├── 权限申请
│   └── 质量/血缘/用量
├── 应用与集成中心
│   ├── 应用中心
│   ├── Module Registry
│   ├── 插件与连接器中心（准入、版本、绑定和停用）
│   ├── 系统连接器
│   ├── 事件与 Webhook
│   └── Developer Portal
└── 管理与治理中心
    ├── 身份/组织/Workspace/Project
    ├── 角色/策略/授权
    ├── 发布与版本
    ├── 模型/凭证/配额/成本
    ├── 安全/审计/验证
    ├── 运行/任务/告警
    ├── Feature Flag/配置
    └── 数据保留/导出/删除
```

## 5. MVP 1 完整功能清单

### 5.1 工作台壳与个人入口

MVP 必须具备：

- 企业品牌、统一导航、应用切换、面包屑和响应式布局；
- 首页：最近会话、常用 Agent、我的项目、待办、通知和系统状态；
- 个人设置：语言、时区、通知、记忆开关、默认模型和 Desktop 设备；
- 权限感知的全局搜索；
- 空状态、无权限、降级、超时、维护和 Session 过期页面；
- Web/Desktop 使用同一账号、资源、策略和服务端状态；
- 帮助、反馈、问题上报和 Trace ID 复制。

### 5.2 身份、组织和工作空间

- Keycloak OIDC、企业微信身份适配、MFA 和紧急账号；
- 法人代码 + employeeId 唯一账号绑定；
- HR 入转调离、部门/岗位同步、差异和冲突队列；
- Enterprise、Department、Group、Workspace、Project、Membership；
- RBAC + ABAC + Relationship + ACL；
- Session/Token/缓存/派生权限回收；
- 管理角色不自动获得业务内容读取权限。

### 5.3 Project 经营和权限骨架

- Project 基础信息、Owner、客户/合同引用、状态和生命周期；
- Membership 角色、工作分工（workstream）、数据 Scope、有效期和委托；
- 我的项目、项目成员和项目资源入口；
- 项目全局上下文与角色化视图；
- PM、管理层、成员权限 Facet；
- 项目关闭、成员退出和只读归档；
- MVP 不进入临床 Study/Country/Site 复杂 ABAC。

### 5.4 会话与 Agent 工作台

- 新建、重命名、归档、删除、搜索和固定会话；
- Agent 选择、版本展示、能力/数据范围和禁止用途提示；
- 流式响应、中止、重试、引用、反馈和错误恢复；
- 附件、资源、知识、Context Manifest 和 Tool 调用展示；
- 会话默认私有；分享和多人 Audience 必须重新鉴权；
- Agent Run 固定模型、Prompt、Skill、Tool、Workflow、Knowledge 和 Context 版本；
- 输出支持保存为资源/产出物草稿。

### 5.5 Agent、Skill、Tool、Workflow 工厂

统一生命周期：

```text
draft → testing → reviewing → published → deprecated → retired
```

MVP 包含：

- Registry、Creator、Reviewer、Owner、风险等级和版本；
- Skill 内容、输入条件、适用范围和依赖；
- Tool Schema、Credential 引用、读写/风险、审批和回执；
- Workflow 输入输出 Schema、Dify 版本、超时和失败策略；
- Agent 组合模型、Prompt、知识、Skill、Tool、Workflow 和 Context Policy；
- 测试环境、样例、评测结果、发布、回滚和使用量；
- 高风险能力职责分离，生产只加载 published 版本；
- Agent/Skill/Tool/Workflow 各有明确产品目录，插件中心复用 Registry 管理 MCP/连接器、内容/模板包及安装绑定；
- 可执行 Pi Extension/Package 与普通内容包分级，不允许安装即授权；Pi 仅为默认关闭的受控试验后端，完整沙箱执行与公开 Marketplace 后置独立批准。

### 5.6 模型与 Prompt 治理

- 对接现有企业 Model Gateway；
- Provider/模型白名单、用途、区域、字段和数据等级策略；
- 默认模型、角色授权、配额、预算和熔断；
- Prompt Template 版本、Owner、用途和评测；
- Token、延迟、错误和成本；
- 生产凭证不进入浏览器/Desktop；
- 外部模型严格执行不出境、不越批准边界。

### 5.7 企业资源中心

- 个人、团队、企业、项目资源库；
- 文件夹/标签、上传、分片、断点、批量、Hash 和恶意扫描；
- 详情、预览、下载、元数据编辑和全文搜索；
- 不可变版本、历史、恢复和差异信息；
- ShareGrant、到期、下载策略、取消分享，MVP 禁止匿名公网分享；
- 回收站、恢复、Legal Hold、异步物理删除；
- OSS 原件/版本/预览/记忆/产出物分区和一致性对账；
- 容量、配额、失败任务、孤儿对象和保留策略。

### 5.8 知识中心与 RAG

- 资源版本审核发布为企业/团队/项目/个人知识；
- Owner、版本、生效/失效、分类、用途和替代关系；
- DOCX/PDF/Office/表格结构化解析；
- 全文 + 向量混合检索、Rerank 和权限过滤；
- 文件/版本/章节/页码引用和二次鉴权；
- 撤回、替代、重建和索引对账；
- 黄金问题、离线评测、用户反馈和无依据拒答；
- Prompt Injection 和知识污染防护。

### 5.9 记忆、上下文与产出物

- 个人通用记忆、个人项目记忆、项目共享记忆分层；
- 查看、纠正、删除、导出、停用和 `allowAgentUse`；
- 记忆来源、有效期、置信度、分类和最后确认；
- 个人项目记忆显式 Promotion、脱敏和审核；
- Context Assembler、Preview/Manifest、Runtime Context Package；
- 用户、Agent、Project、资源/数据、Tool、Purpose、Audience 权限交集；
- 多人输出安全交集或分段授权；
- 产出物来源、版本、Audience、分类和权限继承；
- 离项后的搜索、引用、向量、关系和缓存失效。

### 5.10 有临员工工作助手

- 入职、HR、财务、行政、IT、制度和系统导航；
- 员工工作指引为导航，正式制度/非 GxP SOP/WI/OA 通知为证据；
- 结构化回答、版本引用、低置信度拒答和转人工；
- OA/系统/联系人目录受控深链接；
- 与企业微信“了解有临”统一知识和评测口径；
- 执行清单草稿保存到资源中心。

### 5.11 数据与 API 控制面 PoC

- 数据源、Dataset、Data Product、Metric、API Product 和 Client 目录；
- 一个低敏数据源的 Bronze/Silver/Gold 和开放表格式 PoC；
- 一个 Data Product、一个内部只读 API 和一个 Keycloak Client；
- OpenAPI、Data Contract、质量、血缘和 SLA；
- Scope、配额、行列权限、脱敏、AccessGrant 和到期回收；
- Youlin 只做控制面，前端不直连湖仓；
- 外部生产 API 和完整数仓后置。

### 5.12 应用和系统集成

- Module Registry 和应用中心；
- Keycloak SSO 深链接；
- iframe 安全容器和一次性 Launch Code Spike；
- 一个只读 Tool、一个低风险 Workflow；
- API/事件公共契约、Adapter 和健康状态；
- CRM 作为首个融合验证系统；
- 新模块支持 Standalone + Embedded。

### 5.13 我的任务、通知与评审中心

这是平台完整性必须补齐的横向能力：

- 我的任务：异步 Job、Workflow 人工节点、失败重试和待处理事项；
- 通知：站内、企业微信/邮件 Adapter、已读、订阅和免打扰；
- 评审中心：Skill/Tool/Workflow/Agent、知识发布、记忆 Promotion、数据/API 授权；
- 每条待办显示来源、风险、SLA、当前状态和目标系统；
- 正式 OA 审批跳转泛微，不在 MVP 自建完整 BPM；
- 通知不等于审批终态，任务不等于业务事实。

### 5.14 统一管理中心

- 组织、成员、Group、Workspace、Project 和 Membership；
- 角色、策略、资源权限和权限解释；
- Registry 审核、版本和回滚；
- 资源/知识/记忆/Context 策略；
- 模型、Credential 引用、配额和成本；
- Data Product/API/Client/AccessGrant；
- Feature Flag、企业配置、字典和公告；
- 数据导出、保留、删除和 Legal Hold；
- 系统健康、异步任务、集成、告警和审计。

### 5.15 安全、审计和运行保障

- 统一授权服务端强制执行和负向测试；
- Secret Manager、轮换、出站白名单和网络分区；
- 文件/MCP/Prompt/依赖/镜像/Desktop 安全；
- Audit、业务日志、Access Log 和 Debug Log 分离；
- OTel Trace、指标、日志、告警、SLO 和状态页；
- 备份、恢复、RPO/RTO、升级、回滚和应急停用；
- CI/CD、SBOM、SAST/SCA、镜像签名和变更证据；
- 管理员、运维、知识 Owner、用户手册和支持流程。

### 5.16 反馈、评测和产品运营

- 回答、引用、Agent、Tool、Workflow 和系统问题反馈；
- 反馈分类、指派、状态、处理结果和通知；
- Agent/RAG/Workflow 离线评测和线上质量指标；
- 采用率、任务完成率、节省时间、失败、成本和安全指标；
- Pilot 周报、内容缺口、功能缺口和版本发布说明；
- 禁止只用 Token、会话数或 Agent 数量衡量价值。

## 6. MVP 优先级和版本切分

功能优先级 P0～P3 与缺陷严重度是两套字段，不可互相代替。明确纳入 AC 的功能不能只关闭 Feature Flag 就宣称验收通过；延期需变更范围与追踪矩阵。统一实施细则见[基线与决策](./plan/04-unified-baseline-and-decision-register.md)。

| 优先级 | 定义 | 处理方式 |
| --- | --- | --- |
| P0 | 缺失将导致无法安全上线或无法完成灯塔闭环 | MVP 1 必须完成 |
| P1 | 提升运营效率，但可由受控人工方式短期替代 | Pilot 前完成或 Feature Flag |
| P2 | 完整产品需要，但不影响 MVP 验证 | MVP 1.1/MVP 2 |
| P3 | 高风险、复杂商业化或规模化能力 | 后续阶段独立立项 |

MVP 不是把所有模块做深，而是每条关键链路可闭环：

```text
登录 → 授权 → 找到入口 → 完成任务 → 查看来源
→ 保存产出物 → 反馈 → 审计 → 运营人员可处理异常
```

## 7. MVP 完整性门禁

PRD AC-01～AC-33 已覆盖以下完整性门禁：

1. **工作台壳**：首页、导航、搜索、无权限、故障和状态页面完整；
2. **任务通知**：异步任务、评审、失败和重要通知有统一入口；
3. **治理闭环**：Capability、Knowledge、Memory Promotion、Data/API 授权均可提交、审核、退回和追踪；
4. **用户自助**：个人设置、记忆开关、资源/产出物、用量和反馈可管理；
5. **管理员可运营**：Feature Flag、企业配置、健康、任务、配额、审计和应急停用可用；
6. **质量可测**：RAG/Agent/Workflow 有版本化评测集和发布门禁；
7. **支持可闭环**：用户可以携带 Trace ID 报障，支持人员不依赖数据库手工判断；
8. **上线可恢复**：升级、回滚、备份、恢复、离职/离项回收和外部依赖降级演练通过。

## 8. 完整产品体能力域

### 8.1 Employee AI Workspace

员工首页、全局搜索、知识问答、个人资源、记忆、产出物、任务、通知和应用中心。

### 8.2 Project Delivery OS

Project 360、项目上下文、计划、风险、行动、交付物、资源、成本/收入、项目共享记忆、周报和 Project Copilot。

### 8.3 Clinical Copilot Suite

Study Startup、Protocol Assistant、CRA Assistant/Coach、TMF QC、医学写作、DM/统计辅助、质量和 Safety 导航。每个场景独立定义预期用途和 GxP 边界。

### 8.4 Enterprise Knowledge OS

资源中心、受控知识、知识图谱/上下文网络、术语、本体、检索、引用、评测、内容运营和知识生命周期。

### 8.5 AI Capability Factory

模型、Prompt、Skill、Tool、Workflow、Agent、数据集、评测、发布、灰度、回滚、成本和 Marketplace。

### 8.6 Data & API Hub

湖仓、数据目录、主数据映射、指标语义层、Data Product、API/Event、Developer Portal、外部消费者和数据计量。

### 8.7 App & Integration Hub

Module Registry、应用中心、插件/连接器中心、SSO/iframe/API/Event/MCP、流程编排、Webhook 和供应商接入。应用中心管理业务系统入口；插件中心管理可扩展能力的包、版本与安装绑定。Pi/其他执行后端经 Execution Provider 接入，不成为第二套门户/权限/记忆真源。

### 8.8 Governance & Trust Center

身份、权限、项目 Scope、策略、DLP、审计、验证、模型风险、数据保留、Legal Hold、安全运营和合规证据。

### 8.9 Platform Operations Center

环境、租户、Feature Flag、配置、配额、成本、任务、队列、SLO、告警、备份、恢复、发布和支持。

### 8.10 Ecosystem & Commercialization

Standalone/Embedded、客户 IdP、多租户/单租户、套餐、License/Entitlement、客户配置、品牌、升级、迁移、计量和外部 API 产品。

## 9. 分阶段产品路线

24～36 个月是滚动投资窗口，不是所有 Stage 顺序相加后的完工承诺。Stage 0 至 Stage 4 若完全串行约需 28～42 个月，尚未计 Stage 5；要落在滚动窗口内，必须按场景分批、以独立团队并行并经投资门批准，Stage 4/5 可跨出窗口。不得通过压缩验证或安全工作兑现日期。

### Stage 0：MVP 1，22～26 周 + Pilot 4～6 周

目标：企业平台底座、员工助手、资源/知识/记忆/Context、数据/API PoC 和完整运营闭环。

不得进入：受试者数据、GxP 受控写回、外部生产 API、完整图谱和全量迁移。

### Stage 1：企业采用与稳定化，3～4 个月

- 扩展至更多部门和 100～300 名用户；
- 完善首页、任务通知、全局搜索、内容运营和 Agent Marketplace；
- CRM/泛微/用友只读聚合和统一待办；
- 首批经营 Data Product、指标和管理视图；
- 项目上下文和 Project Copilot 非 GxP 版本；
- HA、容量、成本、支持和灾备成熟化。

### Stage 2：项目经营和通用业务智能体，4～6 个月

- PM 工作台、项目组合、收入成本、资源负载和预测；
- 智能报销、报价辅助、合同/法务导航；
- 企业数据产品、语义指标和事件中心；
- 更多低风险 Workflow/Tool 和系统写回审批；
- 企业上下文网络增强，但保持权限优先。

### Stage 3：临床 Copilot，6～9 个月

- Study Startup Assistant；
- Protocol Assistant；
- CRA Assistant/Coach；
- TMF QC 影子运行；
- 项目/Study/Site/Country ABAC；
- 真实临床数据仍按场景、字段和用途最小化接入。

### Stage 4：受控/GxP 场景，9～15 个月

- 预期用途、URS、风险评估、验证计划和追踪矩阵；
- QMS/CTMS/eTMF/EDC 受控集成；
- 电子签名、不可抵赖审计、偏差和变更控制；
- 高风险 Tool 人工审批、双人复核和回执；
- 按场景验证，不将整个平台一次性声明为 GxP。

### Stage 5：外部产品与生态，6～12 个月，可并行

- External Gateway/DMZ、Developer Portal 和 Sandbox；
- 客户/供应商独立 Client、mTLS、配额、合同和计量；
- 可独立销售模块、客户配置和版本支持；
- 多租户或单客户独立部署产品化；
- 对外数据产品逐个审批，跨境默认禁止。

## 10. 临床场景产品组合

| 场景 | 用户 | 核心价值 | 风险 | 建议阶段 |
| --- | --- | --- | --- | --- |
| 员工工作助手 | 全员 | 制度/流程/系统导航 | 低 | MVP 1 |
| 报价辅助 | BD/报价/财务 | 范围、工时、费用草稿 | 中 | Stage 2 |
| 智能报销 | 全员/财务 | 校验、填表、政策解释 | 中 | Stage 2 |
| PM Copilot | PM/管理层 | 项目风险、行动、周报和经营 | 中 | Stage 1/2 |
| Study Startup | SSU/PM | 缺口、材料和里程碑 | 中高 | Stage 3 |
| Protocol Assistant | 医学/运营 | 结构化方案问答 | 中高 | Stage 3 |
| CRA Assistant/Coach | CRA/LM | 访视准备、报告草稿和培训 | 中高 | Stage 3 |
| TMF QC | TMF/QA | 分类、命名、缺失和元数据检查 | 高 | Stage 3 影子、Stage 4 受控 |
| Safety/医学判断 | PV/医学 | 抽取和提示 | 极高 | 独立项目，不进入通用路线 |

## 11. 模块成熟度模型

| 等级 | 能力 |
| --- | --- |
| L0 实验 | 本地 Demo，无企业身份和治理 |
| L1 受控试验 | Dev/Test、固定用户、人工数据、可回滚 |
| L2 MVP | SSO、权限、版本、审计、监控、Owner 和支持 |
| L3 企业生产 | HA、容量、SLO、灾备、成本和多部门运营 |
| L4 受控业务 | 验证、签名、变更、偏差和受控记录 |
| L5 外部产品 | 多客户、套餐、升级、迁移、SLA 和商业支持 |

任何模块不能因 UI 完成就宣称达到 L2/L3；身份、权限、版本、审计、恢复、支持和 Owner 都是成熟度条件。

## 12. 产品化与独立销售

每个计划独立交付的业务模块从第一天设计并验证下列能力；工作台首页、搜索、权限等内建功能按模块化扩展，不要求逐个独立产品化。商业计费、多客户运维及 SLA 在 Stage 5 验收：

- Standalone 和 Embedded 共用核心业务代码；
- OIDC/Keycloak 可配置；
- 独立部署、数据库、对象存储和备份；
- API/OpenAPI/Event 契约；
- Entitlement/Feature Flag 服务端执行；
- 品牌、域名、通知、模型和数据源配置；
- 健康、日志、指标、Trace、升级和回滚；
- 数据导出、迁移和客户退出。

工作台提供统一体验，但不能成为独立模块运行的强依赖。

## 13. 非功能目标分层

| 维度 | MVP | 企业生产 | 受控/外部产品 |
| --- | --- | --- | --- |
| 可用性 | Pilot 目标，关键链路可降级 | 按业务 SLO 和 HA | 合同 SLA/验证要求 |
| 性能 | 300～500 人容量验证 | 多部门并发和容量预测 | 客户隔离和配额 |
| 安全 | 身份、越权、Secret、供应链 | SOC/SIEM、持续测试 | 客户/监管证据 |
| 恢复 | 备份恢复演练 | RPO/RTO、跨区策略 | 合同和验证范围 |
| 审计 | 关键动作和 Trace | 集中检索、告警和导出 | 不可抵赖/受控保留 |
| 兼容 | Web/Desktop 基线 | 浏览器/OS/接口矩阵 | 客户版本支持政策 |
| 成本 | 单位成本可测 | FinOps 和预算 | 套餐、计量和毛利 |

## 14. 产品成功指标

### 平台采用

- WAU/MAU、部门覆盖、重复使用、任务完成率；
- 员工助手、项目上下文、资源和 Agent 的真实任务渗透；
- 首次价值时间和用户继续使用意愿。

### 效率与质量

- 查找/办理/生成任务耗时下降；
- 正确引用、正确拒答、Workflow 成功和返工；
- 数据质量、API 可用性、Context 装配和产出物复用。

### 治理与安全

- 越权/泄漏为 0；
- 离职/离项/到期权限回收 SLA；
- 发布审核、回滚、审计和恢复通过率；
- 高风险动作人工审批覆盖率。

### 经营

- 每活跃用户、问答、Workflow、API 和数据扫描单位成本；
- 项目毛利/风险预测采用率；
- 模块交付周期、复用率和外部产品收入（后续）。

## 15. 组织和产品治理

建议建立四条产品线：

1. **Employee & Project Experience**：工作台、员工服务、项目上下文；
2. **AI & Knowledge Platform**：Agent 工厂、RAG、记忆和评测；
3. **Data & Integration Platform**：湖仓、API、应用集成和事件；
4. **Trust & Operations**：身份权限、安全、审计、验证和 SRE。

横向治理委员会：

- Product Council：范围、价值和体验；
- Architecture Council：边界、契约和技术债；
- AI/Knowledge Review：Prompt、知识、Agent 和评测；
- Data Governance：数据产品、指标、质量和授权；
- Security/Privacy/QA：高风险、外部和受控场景。

## 16. 团队与投资轮廓

### MVP 1

- 计划峰值约 15～19 FTE（角色满配区间 15.9～22.9 FTE，须按 08 的分周容量表错峰验证）；
- 约 75～115 人月；
- ROM 约 400～1,100 万元（按 08 分项及预备金校正；Pilot 运行人力/用量另计）；
- 以现有开源/企业组件复用为前提，不含完整图谱、全量迁移、GPU 集群和外部生产专区。

### 完整产品体

建议采用稳定核心平台团队 18～30 FTE，临床场景、数据接入和客户交付使用独立 Feature Team。24～36 个月累计投入必须在 Stage 0/M14 Pilot 指标、场景商业价值、基础设施方案和内部/外包结构冻结后重估，不建议当前给出单一承诺数字。

每个 Stage 设置独立投资门：

```text
业务 Owner + 数据可得 + 风险可接受 + 用户基线
+ 技术 Spike + 运维能力 + 量化退出标准
```

## 17. 发布策略

- 主干持续同步 LobeHub 上游，企业能力使用独立包、Adapter、Provider 和 Feature Flag；
- MVP 先内部 Pilot，再部门扩展，再企业推广；
- 临床场景先离线评测、影子运行、建议模式，最后才考虑受控写回；
- 外部产品使用独立版本支持策略，不把企业内部每日变更直接暴露给客户；
- 每个模块都有 Owner、版本、数据边界、SLO、Runbook、退出和停用计划。

## 18. 关键依赖与待决策

1. 部门/岗位权威源和 Keycloak 企业微信接入方式；
2. Project/Contract/Customer/Study 关系和项目主数据源；
3. 企业 OSS、预览、扫描、湖仓和备份；
4. Data Catalog、表格式、查询、调度、质量和 API Gateway；
5. Context Assembler、策略引擎、缓存和图数据库进入条件；
6. 任务/通知/评审中心与泛微 OA 的边界；
7. 全局搜索对 Resource、Knowledge、Project、App 和 Data Product 的索引策略；
8. Feature Flag、企业配置和 Entitlement 实现；
9. Desktop OS、签名、更新和 MDM；
10. 首批两个部门、两个 Project、数据产品和员工助手知识范围；
11. Stage 1/2 的业务场景 Owner、基线和收益门槛；
12. 外部产品的目标客户、部署方式、SLA、定价和数据边界。
