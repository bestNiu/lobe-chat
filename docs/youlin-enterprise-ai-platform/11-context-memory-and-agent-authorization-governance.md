# 个人记忆、项目上下文、企业上下文网络与 Agent 授权治理蓝图

> 状态：MVP 架构与产品治理基线
>
> 核心原则：记忆是持久化信息；上下文是某个用户、某个用途、某个时点动态装配出的授权视图。
>
> 关联文档：[总体战略](./01-cro-ai-native-workbench-strategy.md) · [领域本体](./03-cro-domain-ontology.md) · [二开架构](./04-lobehub-extension-architecture-and-roadmap.md) · [集成契约](./06-integration-contracts.md) · [MVP PRD](./07-mvp-product-spec.md) · [交付路线](./08-delivery-roadmap.md) · [湖仓与 API 治理](./10-lakehouse-data-platform-and-api-governance.md) · [完整产品蓝图](./12-full-product-capability-and-evolution-blueprint.md)

## 1. 为什么必须区分记忆和上下文

如果把“个人记忆、项目记忆、项目上下文、企业知识、企业数据”都放进同一个向量库或同一张 `memory` 表，将无法回答：谁拥有、谁可查看、谁可让 Agent 使用、是否是事实、是否可以跨项目、离开项目后如何回收、是否允许沉淀为企业资产。

本平台统一使用以下定义：

| 概念 | 定义 | 默认可见范围 |
| --- | --- | --- |
| 个人通用记忆 | 跨项目或非项目的个人偏好、工作习惯和用户明确保存的信息 | 仅本人 |
| 个人项目记忆 | 个人在特定项目中的提醒、观察、草稿和经验 | 仅本人，且依赖当前项目权限 |
| 项目共享记忆 | 经显式共享/审核形成的项目约定、风险、决定和经验 | 授权项目成员 |
| 项目全局上下文 | 项目当前事实、资源、计划、决定、风险、指标和共享记忆的动态集合 | 按项目角色和数据分区裁剪 |
| 角色化项目上下文 | 项目全局上下文叠加用户职责范围和本人项目私有记忆 | 当前用户 |
| 企业上下文网络 | 组织、人员、项目、客户、知识、系统、数据产品和业务对象的有来源、有时效、有权限关系网络 | 动态授权投影 |
| 运行时上下文包 | 某次 Agent/Workflow 实际获得的上下文、策略和来源快照 | 该次运行及获授权审计人员 |

资源、知识、事实、记忆和上下文的边界：

```text
事实：源业务系统在特定时点的权威状态
资源：文件、对象及不可变版本
知识：经过审核发布、可检索引用的资源版本
记忆：用户或项目持续保留、可修正和过期的信息
上下文：按身份、项目、目的和时点动态装配的授权视图
企业上下文网络：连接上述对象的关系和策略层
```

记忆不能覆盖正式制度或源系统事实；上下文不能因为被 Agent 使用而成为新的权威事实。

## 2. 项目是经营单元和矩阵权限边界

Project 是合同、交付、资源、收入成本和责任的经营单元，不等同于 Department、Workspace 或 Study。

```text
Enterprise
├── Organization / Department
├── Project（经营与交付单元）
│   ├── Customer / Contract / Service Scope
│   ├── 一个或多个 Study（后续临床范围）
│   ├── Project Membership
│   ├── Project Resource Library
│   ├── Project Shared Memory
│   ├── Project Context
│   └── Project Data Products
└── Enterprise Context Network
```

一个员工可以属于一个部门，同时参加多个项目并承担不同角色。MVP 使用通用 Project，不把 Project 自动等同于临床 Study。

`ProjectMembership` 至少包括：

```text
projectId
userId
projectRole
workstream
countryScope
siteScope
dataScope
validFrom / validTo
delegation
status
```

项目关闭、成员退出、角色变化必须触发资源、检索、上下文、缓存、记忆引用、Agent 会话和产出物权限重算。

## 3. 个人记忆模型

### 3.1 分类

```text
Personal Memory
├── 通用偏好：语言、格式、交互和个人习惯
├── 非项目工作记忆：个人模板、通用提醒和用户明确保存的信息
└── 项目私有记忆
    ├── Project-A 个人提醒/观察/草稿
    └── Project-B 个人提醒/观察/草稿
```

每条记录至少包含：

```text
ownerUserId
memoryCategory
projectId?
sourceRefs
classification
allowedPurposes
crossProjectReusable
validFrom / expiresAt
confidence
lastConfirmedAt
contentRef
```

### 3.2 跨项目规则

```text
当前处于 Project-B
→ 可以加载个人通用偏好
→ 可以加载本人 Project-B 私有记忆
→ 默认排除 Project-A 私有记忆
→ 仅允许加载已标记 crossProjectReusable 且不含项目敏感信息的通用经验
```

项目事实、客户信息、预算、风险和人员信息不得仅因保存在个人记忆中而跨项目使用。可复用经验应先去标识化，必要时通过共享/知识发布流程沉淀。

### 3.3 用户权利

用户可以查看来源、纠正、删除、导出、停用个人记忆，并分别控制“允许保存”和“允许 Agent 使用”。企业保留策略、Legal Hold、项目受控记录和审计证据不因用户删除个人记忆而被不当删除。

## 4. 项目记忆模型

### 4.1 个人项目记忆

属于个人私有空间，默认不能被 PM、管理层、平台管理员或其他成员读取。项目绑定只用于上下文过滤、来源鉴权和退出项目后的回收，不构成共享授权。

### 4.2 项目共享记忆

项目共享记忆属于项目资产，可包含经确认的项目约定、风险、决定、客户沟通共识、行动、经验和总结。

生命周期：

```text
draft → proposed → shared → confirmed → superseded / expired / archived
```

个人记忆不得自动升级为项目共享记忆：

```text
个人项目记忆
→ 用户明确“提交共享”
→ 脱敏和来源检查
→ PM/指定角色按类别审核
→ 项目共享记忆
→ 进入项目全局上下文
```

项目共享记忆仍不是源系统终态；正式决定、审批和受控记录必须引用权威系统对象。

## 5. 项目全局上下文和角色化视图

### 5.1 项目全局上下文

项目上下文不是一个长期维护的大文本，而是由 Context Assembler 动态生成的结构化视图：

```text
Project Global Context
├── 项目、客户、合同和服务范围
├── 项目成员、角色和职责
├── 当前阶段、计划和里程碑
├── 当前有效资源与知识
├── 决定、风险、问题和行动项
├── 交付物和 AI/Workflow 产出物
├── 指标、质量和数据新鲜度
├── 项目共享记忆
└── 来源、版本、时间和权限
```

每个 Context Item 必须保留来源、源版本、生效期、观察时间、Owner、数据等级、允许角色、允许用途和是否允许 Agent 使用。

支持 `asOf`：当前时点、历史时点和特定决定发生时的上下文，以便重现 Agent 当时使用的依据。

### 5.2 角色化项目上下文

```text
User Project Context
=
Project Global Context
∩ Project Membership
∩ User/Role/Data Permissions
∩ Purpose/Environment/Time Policy
+ 当前用户的项目私有记忆
```

CRA 通常只能看到负责国家/中心和授权资料；PM 可看项目整体共享上下文和成员任务状态；管理层默认看项目组合摘要，并按业务需要获得项目下钻。法务特权、盲态、薪酬、医学和其他隔离分区仍需独立权限。

PM 或管理层拥有“完整项目视图”不等于有权读取每个成员的个人项目记忆。

## 6. 企业上下文网络

企业上下文网络是关系和策略层，不是把所有系统数据复制到一个图数据库。

```text
人员 ─任职于→ 部门
人员 ─参与→ 项目
人员 ─承担→ 项目角色
项目 ─服务于→ 客户
项目 ─包含→ Study
项目 ─使用→ SOP/模板
项目 ─产生→ 决定/风险/产出物
Data Product ─派生自→ Dataset
API ─提供→ Data Product
Agent ─使用→ Skill/Tool/Knowledge
决定 ─依据→ 文档版本/指标
```

上下文网络包括：

1. 组织网络；
2. 项目组合网络；
3. 人员/岗位/能力网络；
4. 知识与制度网络；
5. Dataset/Metric/Data Product/API 血缘网络；
6. 决定、风险、行动和证据网络。

每个节点和关系至少包含：

```text
scopeType / scopeId
classification
sourceSystem / sourceId / sourceVersion
validFrom / validTo / observedAt
owner
confidence
policyRef
allowedPurposes
```

推荐结构为“企业授权关系层 + 项目上下文投影 + 用户私有 Overlay”。个人记忆不进入其他用户可遍历的公共图。

## 7. 上下文网络安全

图和搜索的权限必须控制节点、边、字段、路径、聚合、自动补全、缓存和向量索引，避免通过数量、关系或相邻节点推断无权项目。

```text
正确：先授权 → 再检索/遍历/聚合
错误：先查询完整网络 → 再由前端隐藏
```

安全要求：

- 项目/客户不可见时，搜索建议、计数和邻接关系也不可泄漏；
- 向量和图索引携带可强制执行的 Scope/Policy 标签；
- Context Cache 绑定用户/角色/项目/目的/策略版本和短 TTL；
- 权限变化使缓存和检索投影失效；
- 聚合设置最小群组阈值，避免反推个人；
- 管理技术平台不自动授予业务内容访问权。

MVP 可先使用 PostgreSQL 关系表、JSONB、Search/RAG 索引和可重建投影，不因概念中有“网络”就立即引入图数据库。只有复杂遍历、性能和运维收益经实测成立后再选型。

## 8. Agent 有效权限

Agent 不拥有高于调用者的业务权限：

```text
Effective Agent Permission
=
User Permission
∩ Agent Manifest
∩ Project Membership/Role/Scope
∩ Resource/Data Policy
∩ Tool Permission
∩ Purpose
∩ Environment/Time Policy
```

用户触发的 Agent 使用用户身份和受限服务身份双重审计；后台/定时 Agent 使用独立 Workload Identity 和有范围、有用途、有期限的授权，不使用万能服务账号。

权限动作至少区分：

```text
personal_memory.read / use_in_agent / update / delete
project_private_memory.read / use_in_agent
project_memory.propose / publish / supersede
project_context.summary.read / full.read
project_context.finance.read / legal.read / export
enterprise_context.discover / traverse / admin
context_artifact.create / share / publish
```

企业管理员、数据库管理员和运维人员不能因为技术角色自动获得项目业务内容读取权限。

## 9. Runtime Context Package

Agent/Workflow 运行前必须由 Context Assembler 生成上下文包：

```text
确认用户、会话和当前 Project
→ 确认 purpose 和输出受众
→ 读取 Project Membership
→ 计算 RBAC + ABAC + Relationship 权限
→ 授权后检索项目全局上下文
→ 加载本人允许使用的个人记忆
→ 排除其他项目/其他人员私有记忆
→ 固定来源、上下文和策略版本
→ 调用模型/工具
→ 继承输出权限和敏感等级
→ 保存 Trace 和审计
```

最小契约：

```json
{
  "runtimeContextId": "ctxrun_xxx",
  "actorUserId": "user_xxx",
  "agentVersion": "agent_pm_1.2.0",
  "purpose": "project_risk_summary",
  "projectId": "project_a",
  "asOf": "2026-08-06T08:00:00Z",
  "contextDefinitionVersion": "1.0.0",
  "sourceRefs": [],
  "memoryRefs": [],
  "policyDecisionId": "pd_xxx",
  "audience": ["user_xxx"],
  "allowedOutputScopes": ["personal", "project_draft"],
  "expiresAt": "2026-08-06T08:30:00Z"
}
```

上下文包保存必要引用、Hash 和策略证据，不默认复制所有敏感正文。

## 10. 多人会话和共享输出

如果 Agent 结果会被多人查看，不能只按发起人权限生成。共享上下文应是目标受众权限的安全交集，或把输出分成公共段和受限段分别授权。

个人记忆默认不能进入共享回答和项目产出物。需要共享时执行：

```text
个人项目记忆
→ 用户明确确认
→ 脱敏/来源检查
→ 项目共享草稿
→ 必要审批
→ 项目发布
```

会话后续增加成员、分享链接、转发或将个人产出物移动到项目库时必须重新执行输出内容与来源权限检查。

## 11. 产出物权限继承

```text
Output Classification
=
输入来源最高等级
+ Tool 返回等级
+ 输出目的和受众限制
```

产出物保存创建人、Project、Agent/Workflow/模型版本、Runtime Context、来源、Policy、分类、受众、是否使用个人记忆以及允许的分享/发布范围。

- 使用个人记忆的产出物默认进入个人资源库；
- 保存到项目库前执行脱敏、来源权限和受众检查；
- 未授权来源不因被总结而改变权限；
- 项目产出物不自动成为项目共享记忆或企业知识；
- Enterprise 发布必须经过独立治理流程。

## 12. 成员退出与项目关闭

成员退出项目或授权到期后：

1. 停止装配该项目上下文；
2. 引用、搜索、图遍历和预览重新鉴权；
3. 使对应向量投影、Context Cache 和短期令牌失效；
4. 个人项目记忆中的项目敏感快照冻结或不可访问；
5. 通用个人偏好可以保留；
6. 已发布项目共享记忆继续属于项目；
7. 历史 Agent Run 保留审计，但不能成为恢复内容的旁路；
8. 项目关闭后共享上下文进入只读归档并执行保留/Legal Hold。

个人项目记忆优先保存来源引用而不是复制完整项目正文。是否允许用户在退出后保留自行撰写且不含项目敏感信息的通用经验，由保留和脱敏策略决定。

## 13. 逻辑数据模型

```text
PersonalMemory
PersonalMemorySource
Project
ProjectMembership
ProjectRole
ProjectMemory
MemoryPromotionRequest
ProjectContextDefinition
ContextNode
ContextEdge
ContextViewDefinition
ContextSnapshot
RuntimeContextPackage
PolicyDecision
ContextAccessLog
```

关键字段：

| 实体 | 必要字段 |
| --- | --- |
| PersonalMemory | owner、project?、category、contentRef、sourceRefs、classification、crossProjectReusable、expiry |
| ProjectMemory | project、status、owner、sourceRefs、visibilityPolicy、effectivePeriod |
| ProjectContextDefinition | project、includedDomains、sourceBindings、policy、version |
| ContextNode/Edge | scope、source、version、classification、validTime、policyRef |
| ContextViewDefinition | audience/role、purpose、included/excluded facets、version |
| RuntimeContextPackage | actor、agent、project、purpose、audience、sources、memories、policyDecision、expiry |
| ContextAccessLog | subject、action、scope、purpose、result、policyVersion、traceId、time |

不建议一张通用 `memory` 表承载所有实体。正文/附件可存企业 OSS；PostgreSQL 保存元数据、关系和权限；RAG/Search/Graph 是可重建派生索引。

## 14. Context Assembler 服务边界

建议通过独立 `Context Provider` 抽象：

```text
assemble(request) → RuntimeContextPackage
preview(request) → ContextManifest
explain(policyDecisionId) → DecisionExplanation
invalidate(scope/policy/member) → InvalidationResult
```

请求必须包括 actor、agent、purpose、project、audience、asOf 和输出范围；响应必须返回被采用/排除的来源类别、策略决定、上下文版本、有效期和 Trace。模型运行时不得绕过 Context Provider 直接拼接个人记忆、RAG、湖仓和业务 API。

## 15. MVP 1 范围

纳入：

1. 个人通用记忆和个人项目记忆分类；
2. Project 作为经营与权限单元；
3. Project Membership、Role、Scope 和有效期；
4. 项目共享记忆及显式 Promotion；
5. 项目全局上下文基础模型；
6. PM、管理层、普通成员的角色化 Context View；
7. Context Assembler 与 Runtime Context Package；
8. 用户、Agent、项目、资源/数据、Tool 和 Purpose 权限交集；
9. 产出物权限和敏感等级继承；
10. 退出项目后的引用、检索、缓存和上下文回收；
11. 企业上下文网络最小节点/关系/策略模型；
12. 全链路 Trace、策略解释和负向权限测试。

暂不纳入：

- 完整企业知识图谱平台和全量关系可视化；
- 全量历史项目上下文迁移；
- 自动将个人经验提升为项目/企业记忆；
- 跨客户、跨项目原始内容推理；
- 受试者级上下文网络；
- 无权限约束的图谱问答；
- 管理层查看所有员工个人记忆。

## 16. 验收标准

1. 用户 A 的个人/个人项目记忆不能被用户 B、PM、管理员或 Agent 旁路读取；
2. 用户在 Project-B 运行 Agent 时不会加载 Project-A 私有记忆；
3. PM 能看项目共享上下文，不能看成员个人项目记忆；
4. 管理层能看项目组合摘要，受限分区下钻被拒绝；
5. Agent 服务身份不能扩大用户权限；
6. Runtime Context 可还原来源、版本、策略、Purpose 和受众；
7. 使用个人记忆的产出物默认不能直接共享到项目；
8. 项目共享记忆具有发布者、来源、状态、有效期和版本；
9. 多人共享会话不泄漏仅发起人可见内容；
10. 成员退出后不能通过历史会话、引用、搜索、向量、图或缓存重新获取项目内容；
11. 企业上下文网络不通过计数、关系、自动补全或缓存泄漏无权项目；
12. 项目关闭后共享上下文只读归档并执行保留策略。

## 17. 实施顺序

### A. 权限与数据模型

冻结 Project、Membership、Memory、Context、Policy、Audience 和 Purpose；建立跨项目、离项和管理层权限测试矩阵。

### B. Context Assembler

接入个人记忆、项目资源/知识、项目共享记忆、数据产品和 Tool，先完成 Manifest/Preview，再允许进入模型运行。

### C. 项目视图

建设项目上下文页、我的项目记忆、项目共享记忆、Context 来源解释和权限拒绝页面。

### D. 企业上下文网络

先实现 PostgreSQL/搜索投影；收集真实遍历用例和性能数据后，再决定是否引入专用图数据库。

## 18. 待冻结决策

1. Project 与合同、客户、Study 的基数和权威来源；
2. PM、管理层、职能负责人和项目成员的 Context Facet 权限；
3. 个人项目记忆退出项目后的冻结、删除和脱敏规则；
4. 项目共享记忆哪些类别需要 PM/QA/法务审核；
5. 跨项目可复用记忆的识别、脱敏和发布流程；
6. 多人会话采用权限交集还是分段输出；
7. Context Snapshot 保存全文、引用还是 Hash 的策略；
8. Context Cache TTL 和权限变更失效 SLA；
9. 企业上下文网络 MVP 使用 PostgreSQL、搜索索引还是图数据库；
10. 项目关闭、Legal Hold 和历史 Agent Run 的保留策略；
11. 后台 Agent 的 Workload Identity 和授权审批；
12. 项目经营指标、财务、法务、医学和盲态分区权限。
