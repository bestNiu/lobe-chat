# 基于 LobeHub 的临床 CRO 企业版二开架构与实施路线

> 状态：二开指导基线 1.0  
> 基线版本：LobeHub `v2.2.17`  
> 企业分支：`feat/youlin-enterprise-ai-platform`  
> 适用范围：Youlin 临床 CRO 企业 AI 工作台  
> 关联文档：[战略与二开路线](./01-cro-ai-native-workbench-strategy.md) · [现状盘点](./02-current-state-inventory.md) · [领域本体](./03-cro-domain-ontology.md) · [分支与上游同步规范](./05-upstream-sync-and-development-guide.md) · [多系统融合接入规范](./09-multi-system-fusion-integration-standard.md)

## 1. 执行摘要

本项目不应被建设成一套简单换皮的聊天系统，也不应把 LobeHub、RAGFlow、Dify、Pi Agent 各自建设成独立门户。推荐定位如下：

- **LobeHub / Youlin Hub**：企业统一展示层、用户工作台、Agent 管理与运行入口、资源入口、权限和审计入口；
- **RAGFlow**：复杂临床文档解析、OCR、切片、索引、混合检索和引用服务；
- **Dify**：可视化、确定性的 AI 工作流编排与快速业务流程实现；
- **Pi Agent**：代码、文件、Shell、Git、数据处理等高权限自动化任务运行时；
- **Model Gateway**：统一模型接入、路由、配额、脱敏、成本和审计；
- **Integration Gateway**：统一封装 MCP、企业 API、Dify Workflow、RAGFlow 和外部 Agent；
- **BPM/审批系统**：承担正式审批、电子签名、会签、SLA 和监管终态，不由大模型替代。

第一阶段调整为“企业平台底座 + 通用灯塔场景”：

```text
新人新事/企业微信 → Keycloak 统一身份 → 唯一账号与组织权限
→ Web/Desktop 工作台 → 企业 Skill/Tool/Workflow/Agent
→ 员工工作指引/制度/非 GxP SOP/WI → 有临员工工作助手 → 带版本和页码引用的问答
→ 一个只读 Tool + 一个低风险 Workflow → 全链路审计
```

Study、Protocol、TMF、CRA 等临床业务能力建立在该底座上，进入第二阶段。

## 2. 当前仓库技术架构

### 2.1 总体技术栈

| 层级 | 当前实现 | 企业二开用途 |
| --- | --- | --- |
| Web | Next.js、React、React Router SPA | 企业门户、Agent 工作台 |
| UI | `@lobehub/ui`、Ant Design、antd-style | 企业品牌与业务界面 |
| 状态与请求 | Zustand、SWR、tRPC | 前端状态和类型安全 API |
| 后端 | `apps/server`、tRPC、REST、Hono | 企业领域服务、集成网关 |
| 认证 | Better Auth、Generic OIDC | 对接已选 Keycloak，应用不直连多套身份 Provider |
| 数据 | PostgreSQL、Drizzle ORM | 用户、组织、项目、资源、审计 |
| 缓存/任务 | Redis | 缓存、限流、异步任务 |
| 文件 | S3 兼容存储 | 临床文档原件与产物 |
| 搜索/RAG | pgvector、pg_search/Elasticsearch | 原生知识库及检索基线 |
| 模型 | `packages/model-runtime` | 多模型统一适配 |
| Agent | `packages/agent-runtime` | Plan-Execute、工具、审批、多 Agent |
| 上下文 | `packages/context-engine` | 知识、记忆、Skill、业务上下文注入 |
| 工具 | Builtin Tool、MCP、Connector、Skill | 企业系统和专业能力接入 |
| 可观测性 | OpenTelemetry、Agent/LLM Tracing | 质量、成本和审计证据 |

### 2.2 重点代码边界

```text
src/features/                         业务 UI 能力
src/routes/                           SPA 薄路由
src/services/                         前端 API 服务
src/store/                            Zustand 状态

apps/server/src/routers/              tRPC/Hono 接口
apps/server/src/services/             后端领域服务
apps/server/src/modules/AgentRuntime  Agent 服务端运行时

packages/database/                    Schema、迁移、Repository
packages/model-runtime/               模型供应商适配
packages/agent-runtime/               Agent 执行循环
packages/context-engine/              上下文装配和注入
packages/tool-runtime/                工具执行
packages/memory-user-memory/          用户长期记忆
packages/builtin-tools/               内置工具集合
packages/builtin-skills/              内置 Skill
```

### 2.3 可评估复用的企业基础

以下为代码结构或能力候选，不是已通过企业验收的功能。尤其 Workspace、RBAC 和审计可能包含开源占位实现；必须逐项做服务端正负向测试后才能决定复用，不得把表结构当作生效权限：

- Workspace、成员、邀请、用户偏好和审计日志；
- RBAC Role、Permission、User Role；
- Agent、Agent Group、Skill、Document、Task、Goal；
- 文件、文档、知识库、Chunk、Embedding；
- Agent/Document/Knowledge Base 的资源级权限；
- 模型供应商、模型目录、API Key 和用量统计；
- 用户记忆、Agent 文档和上下文注入；
- MCP、Connector、远程设备、Sandbox；
- RAG Eval、Agent Eval、Tracing、Verify 和 Acceptance。

MVP 重点补强组织层级、Project 权限、外部能力权限透传、数据生命周期与审计完整性；Study 权限、电子签名和临床领域模型后置。统一范围与代码命名见[实施基线](./plan/04-unified-baseline-and-decision-register.md)。

## 3. 目标架构

```text
┌────────────────────────────────────────────────────────────┐
│                  Youlin Clinical AI Hub                    │
│ Agent / Resource / Memory / Project Context / Data / API  │
└──────────────────────────┬─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│ Enterprise API, Data & Policy Control Plane                │
│ SSO / RBAC / ABAC / ACL / Catalog / Audit / Rate Limit    │
└───────────────┬──────────────────┬─────────────────────────┘
                │                  │
      ┌─────────▼────────┐  ┌──────▼────────────────────────┐
      │ Model Gateway    │  │ Integration / Tool Gateway    │
      │ Route/Quota/DLP  │  │ MCP/API/Approval/Credentials │
      └─────────┬────────┘  └──────┬─────────┬──────────────┘
                │                  │         │
       Cloud/Private LLM      RAGFlow      Dify      Pi Runner
                │                  │         │          │
                └──────────────────┴─────────┴──────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────┐
│ PostgreSQL / Resource S3 / Lakehouse S3 / Trino / OTEL    │
└────────────────────────────────────────────────────────────┘
```

### 3.1 系统职责边界

| 系统 | 负责 | 不负责 |
| --- | --- | --- |
| LobeHub | 企业入口、首页/搜索、对话、Agent、资源、项目 Context、任务/通知/评审和治理入口 | 复杂 OCR、正式 OA 终态、任意代码裸机执行 |
| RAGFlow | 文档解析、索引、检索、引用 | 用户主数据、最终资源权限、企业门户 |
| Dify | 可视化 AI Workflow、结构化多步骤处理 | 企业身份真源、主文件真源、通用 Agent 门户 |
| Pi Agent | 代码与文件自动化、脚本、Git、数据任务 | 无隔离地处理生产敏感数据 |
| Model Gateway | 模型路由、配额、DLP、审计 | 业务权限和临床流程终态 |
| BPM | 正式审批、电子签名、流程版本、SLA | 开放式 Agent 推理 |
| Data Platform | Bronze/Silver/Gold、计算、目录、血缘、质量、Data Product | 企业门户、源系统交易写回 |
| API Gateway/Data Service | 应用认证、Scope、配额、数据契约、行列过滤、脱敏 | 任意 SQL、底层表或湖仓直连 |
| Context/Memory Service | 记忆分层、项目 Context View、Runtime Context、策略解释和失效 | 替代源事实、公开个人记忆、扩大用户权限 |

## 4. 企业组织与权限

### 4.1 推荐层级

```text
Enterprise / Tenant
├── Organization Unit
│   ├── Department
│   └── Team
├── Workspace
│   ├── Project
│   │   └── Clinical Study
│   │       ├── Country
│   │       ├── Site
│   │       └── Study Resources
│   └── Shared Resources
└── Members / Groups
```

MVP 阶段建议：

- MVP 一个 Enterprise 对应一个主 Workspace；两者通过显式映射关联，不能视为通用领域等号；
- `Project = MVP 1 的通用项目协作与资源边界`，不直接等同受控临床 Study；
- `Agent Group = 企业或项目 Agent 团队`；
- `Resource Library = 个人/团队/企业/项目资源容器`；
- `Knowledge Base = 确定资源版本经治理后形成的可检索知识集合`；
- 临床 Study 在 MVP 2 作为独立领域对象与 Project 建立映射。

只有在明确存在集团、多法人、多 Workspace 统一治理需求后，才在 Workspace 上增加 Organization 层，避免早期过度建模。

### 4.2 权限模式

采用 `RBAC + ABAC + Resource ACL`：

- **RBAC**：定义用户能执行的动作，如 `study:create`、`agent:run`、`document:approve`；
- **ABAC**：根据 Study、Site、国家、盲态、数据级别、文件状态等属性判断；
- **Resource ACL**：控制具体 Agent、文档、知识库、Workflow 的访问级别。

推荐补充的资源类型：

```text
project / resourceLibrary / resource / resourceVersion / shareGrant / artifact / personalMemory / knowledgeBase / skill / workflow / dataset
```

所有外部调用必须由服务端生成短期服务凭证，并携带至少以下上下文：

```text
userId / workspaceId / projectId / studyId / roles / clearance / requestId
```

外部系统返回结果后仍需在 Youlin 服务端做二次鉴权，不能把 RAGFlow 或 Dify 自身权限当作最终授权。

### 4.3 临床角色候选

- 企业管理员、AI 平台管理员、QA、Auditor；
- CRO PM、CRA、CRC、医学监查员；
- DM、生物统计、Medical Writer、PV；
- TMF 管理员、Sponsor 外部用户、Site 外部用户、只读访客。

角色定义必须经过真实组织和职责调研，不应直接用候选角色生成生产权限。

## 5. RAGFlow 集成

### 5.1 分工

RAGFlow 负责 OCR、版面分析、切片、Embedding、混合检索和 Rerank；Youlin 负责文件入口、元数据、权限、Agent 挂载、引用展示和审计。

### 5.2 数据流

```text
上传文件 → OSS/S3 隔离区扫描 → 保存不可变原件 → 写入资源/版本元数据
→ Owner 选择版本并通过知识发布评审 → 发布 ingestion 事件 → RAGFlow 解析和索引
→ 质量门禁通过后原子激活 KnowledgeRelease（此前不进入在线检索）
→ 回调处理状态 → 写入外部资源映射
→ Agent 查询 Knowledge Gateway → 权限过滤
→ RAGFlow Search → 结果归一化 → Context Engine 注入
```

统一接口：

```ts
interface KnowledgeProvider {
  createDataset(input: unknown): Promise<unknown>;
  ingestDocument(input: unknown): Promise<{ jobId: string }>;
  getJobStatus(jobId: string): Promise<unknown>;
  search(input: unknown): Promise<KnowledgeSearchResult[]>;
  deleteDocument(id: string): Promise<void>;
}
```

实现至少包括：

```text
NativeLobeKnowledgeProvider
RagFlowKnowledgeProvider
```

### 5.3 知识来源优先级与引用要求

员工工作助手按以下优先级使用证据：当前有效制度/SOP/WI → 当前 OA 正式通知 → 员工工作指引 → 培训材料。工作指引用于导航和摘要，不覆盖其引用的正式文件；发现冲突、旧版本或缺少原始依据时必须拒绝确定性回答并转内容 Owner。

首批 DOCX/PDF 解析必须保留 Part/章节/小节、完整表格行、问题答案、操作步骤、建议时限、联系人角色和文件链接。DOCX 应生成受控 PDF 预览或稳定章节锚点，保证引用可定位。

检索结果至少包含：

- 企业文件 ID、外部文档 ID；
- 文档版本、页码、Chunk ID；
- Study、Site 和文档类型；
- 生效日期、失效日期和受控状态；
- 来源系统、解析版本和检索时间；
- 权限标签和引用快照。

模型回答必须能够还原“使用了哪个版本、哪一页、何时检索”的证据链。

## 6. Dify 集成

Dify 定位为可视化 Workflow 引擎。每个 Dify 应用在 Youlin 中注册为受控 Tool/Workflow，而不是独立门户。

适合 Dify 的场景：

- Protocol/SOP 结构化抽取；
- 监查报告草稿检查；
- TMF 分类与规则检查；
- CSR 章节草拟；
- 多系统固定步骤的数据加工。

调用链：

```text
Lobe Agent → Tool Gateway → 权限/审批 → Dify API
→ 流式事件 → 结构化 Tool Result → Lobe Agent 继续推理
```

治理要求：

- Dify API Key 仅保存在服务端凭证库；
- Workflow 需要版本冻结、输入输出 Schema 和超时重试策略；
- 正式发布需要评测、审批和回滚版本；
- 避免 Lobe Agent → Dify Agent → 多层 Agent 的无边界递归。

## 7. Pi Agent 集成

Pi Agent 适合 SAS/R/Python/SQL、Git、文件批处理、代码审查及自动化任务。推荐构建独立 `pi-runner-service`：

```text
Youlin → Agent Execution Gateway → Queue
→ 独立容器/微虚拟机中的 Pi SDK/RPC
→ 事件流回传 → 产物归档 → 环境销毁
```

接入优先级：

1. 同为 Node.js 服务时使用 Pi SDK `createAgentSession()`；
2. 需要进程或语言隔离时使用 `pi --mode rpc`；
3. 通过 Pi Extension 注册企业 Tool、权限门和模型网关；
4. 复用 Agent Skills 标准同步临床 `SKILL.md`。

安全底线：

- 每任务独立沙箱、非 root、只挂载授权目录；
- 网络出口白名单、资源和时长限制；
- 禁止长期凭证落盘，使用短期凭证；
- bash/write/edit 等高风险工具按任务授权；
- 危险动作必须 Human-in-the-Loop；
- 工具输入、输出、文件变更和命令均进入审计；
- 不在 LobeHub Web 主进程内直接执行 Pi 的 Shell 工具。

## 8. ECC 与其他外部项目

“ECC”尚未获得明确仓库地址和产品定义。在确认前不绑定其私有 API，而是预留以下适配边界：

```ts
interface ExternalAgentBackend {}
interface ExternalWorkflowBackend {}
interface ExternalKnowledgeBackend {}
interface ExternalToolBackend {}
```

确认 ECC 项目后，应先判断它属于 Agent Runtime、Workflow、知识检索还是 Tool，再选择唯一接入边界，避免重复建设。

## 9. 模型管理中心

所有平台统一通过现有企业 Model Gateway 调用模型。当前已知下游包括 OpenAI 和阿里云百炼，具体部署区域、模型清单和路由规则待核验：

```text
LobeHub / Dify / Pi / RAGFlow → 企业 Model Gateway → OpenAI / 阿里云百炼 / 后续私有模型
```

企业当前基线是数据不出境、不越出批准处理边界。因此不能因为网关支持外部 Provider 就默认允许发送业务原文；必须按模型路由验证部署区域、字段脱敏、日志留存和禁止数据类型。

模型中心应支持：

- Provider、模型目录和版本管理；
- 按企业、角色、Study、数据级别授权；
- 主备路由、限流、预算、并发和 Token 配额；
- 数据不出境策略、外部路由阻断和敏感字段脱敏；
- Prompt/Response 审计与可配置留存；
- Embedding、Rerank、Chat、Code 模型分类；
- 模型效果、成本、延迟和安全评测；
- 生产模型版本冻结及回滚。

## 10. Agent、Skill、Tool、Workflow 边界

| 概念 | 定义 |
| --- | --- |
| Agent | 角色、Prompt、模型、知识、记忆、Skill、Tool 的组合 |
| Skill | 领域说明、规则、示例和标准步骤的知识包 |
| Tool | 可执行 API 或动作，必须具有权限和输入输出 Schema |
| Workflow | 可追踪、可版本化的确定性多步骤业务流程 |

以 CRA 监查报告助手为例：

- Agent：CRA 监查报告助手；
- Skill：ICH-GCP、企业 SOP、报告写作规范；
- Tool：查询 CTMS、获取 Protocol、创建报告草稿；
- Knowledge：Protocol、Monitoring Plan、SOP、Site 文件；
- Workflow：拉取访视信息 → 缺失检查 → 草稿 → QA → 人工确认 → 导出。

## 11. 企业资源中心、知识、记忆与产出物

### 11.1 资源范围模型

```text
Enterprise Resource Library
├── Team/Department Resource Library
├── Project Resource Library
└── Personal Resource Library
```

- 个人库默认仅本人可见；
- 团队库绑定部门或自定义 Group；
- 企业库由企业资源管理员治理；
- 项目库绑定 Project 成员关系，后续扩展 Study/Site ABAC；
- Knowledge Base 是资源版本经过审核、解析和发布后的检索集合，不等同于普通目录；
- Artifact 是 Agent、Tool、Workflow 或人工任务产生的资源，可归档到上述任一范围。

### 11.2 存储五层模型

1. **对象层**：企业 OSS/S3 兼容存储保存原件、不可变版本、预览/缩略图、解析中间产物、记忆附件/快照和 AI 产出物；
2. **元数据层**：PostgreSQL 保存资源 ID、目录、版本、状态、密级、Owner、对象 Key、分享、权限、保留和来源；
3. **处理层**：异步服务执行恶意扫描、格式识别、Office/PDF 转换、OCR、缩略图和转码；
4. **检索层**：RAGFlow 或原生 RAG 保存 Chunk、Embedding 和搜索索引；
5. **治理层**：ACL/ABAC、分享、配额、审计、水印、Legal Hold、回收站、归档和销毁。

企业资源 ID、权限、版本和生命周期的真源保留在 Youlin。OSS 是二进制载荷真源，RAG/预览系统只保存可重建派生物。

### 11.3 OSS 分区与对象规则

建议逻辑分区：

```text
quarantine/   上传隔离区
original/     不可变原件与版本
preview/      PDF/图片/缩略图/转码衍生物
artifact/     Agent/Workflow/Tool 产出物
memory/       个人记忆附件、正文快照和导出包
archive/      归档与低频对象
```

要求：

- 对象 Key 只使用 tenant/scope/resource/version 等不可猜测 ID，不出现姓名和原始文件名；
- Bucket 非公开；浏览器仅用短时签名向隔离区上传，用户预览/下载默认经实时鉴权网关，普通预签名不能保证单项撤权立即生效；
- 开启服务端加密、版本化、生命周期和跨故障域备份；
- 上传先隔离扫描，成功后幂等晋级正式区；
- 使用事务外箱/任务表协调 PostgreSQL、OSS、预览和 RAG，定期执行对象—元数据—索引对账；
- 删除先阻断访问并进入回收站，物理删除按保留策略异步执行。

### 11.4 文件能力

- 分片/断点/批量上传、Hash 和重复文件提示；
- 文件夹、标签、收藏、重命名、移动和元数据编辑；
- 图片、PDF、文本、Markdown、音视频和 Office 转换预览；
- 原件/转换件下载和按密级水印；
- 不可变版本、版本比较信息、历史下载和恢复；
- 分享给用户、部门、Group、项目或企业，并设置到期和下载权限；
- 回收站、恢复、归档、Legal Hold 和物理删除审批；
- 所有预览、查看、下载、编辑、分享和删除执行服务端鉴权和审计。

MVP 1 不提供匿名公网分享；Office 文档首期采用预览与上传新版本，不把多人实时协同编辑作为上线门槛。

### 11.5 记忆分层

| 类型 | 内容 | 服务端存储与策略 |
| --- | --- | --- |
| 会话记忆 | 当前会话摘要 | PostgreSQL/会话存储，随会话权限和保留期 |
| 个人通用记忆 | 偏好、格式、通用工作习惯和用户明确保存的信息 | 仅本人；可跨项目使用但受分类、Purpose 和用户开关限制 |
| 个人项目记忆 | 本人在特定 Project 的提醒、观察和草稿 | 仅本人；绑定 Project；默认不能跨项目或被 PM/管理层读取 |
| 项目共享记忆 | 经 Promotion/审核的项目约定、风险、决定和经验 | 属于 Project；按项目角色/Facet 授权并版本化 |
| 企业知识 | SOP、标准模板、制度 | 资源版本化并经审核发布，不被个人/项目记忆覆盖 |

约束：PHI/PII 默认不进入长期记忆；自动记忆记录来源、用途、置信度和有效期；个人记忆不能跨用户共享。个人项目记忆必须显式提交、脱敏和按类别审核后才能成为项目共享记忆。

### 11.6 AI/Workflow 产出物

- 每个产出物关联创建者、Run ID、Agent/Workflow/Tool/模型版本、来源资源和生成时间；
- 产出物默认是草稿，保存到 OSS 后归入个人、团队、企业或项目资源库；
- 重复运行产生新版本或新产出物，不静默覆盖；
- 用户可预览、下载、移动、分享、编辑元数据和提交知识发布；
- 临时中间文件设置 TTL，正式保存或被业务记录引用后取消临时清理；
- 产出物升级为受控文档必须经过独立审核流程，AI 生成不代表批准；
- 使用个人记忆的产出物默认保存到个人资源库，移动/分享至项目时重新检查来源、分类和受众。

### 11.7 Project Context 与企业上下文网络

Project 是经营和矩阵权限单元。项目全局上下文由项目事实、资源、计划、决定、风险、指标和项目共享记忆动态装配；每个用户获得按 Membership、角色、工作分工（workstream）、数据 Facet、Purpose 和时间裁剪（国家/中心为后续临床扩展）的 Context View，并叠加本人项目私有记忆。

```text
Context Assembler
→ 验证 actor / agent / project / purpose / audience / asOf
→ 授权后检索资源、知识、记忆、Data Product 和 Tool
→ 生成 RuntimeContextPackage + PolicyDecision
→ 模型/Workflow/Tool
→ 输出继承最高敏感等级和来源权限
```

企业上下文网络使用有来源、有时效、有策略的节点和边连接组织、项目、客户、知识、数据、决定和 Agent。节点、边、路径、聚合、搜索建议、向量和缓存均先授权再查询。MVP 使用 PostgreSQL/JSONB/搜索投影，不把图数据库作为前置依赖。

成员退出项目时同步撤销 Context、检索、引用、向量/图投影、缓存和短期凭证；历史 Run 保留审计但不能成为内容访问旁路。详细规范见[记忆与上下文治理蓝图](./11-context-memory-and-agent-authorization-governance.md)。

## 12. 湖仓与 API 控制面

Youlin 增加“数据与 API 中心”，但只管理控制面：

- 数据源、Dataset、Data Product、Metric 和基础血缘目录；
- API Product、版本、OpenAPI、Client、Scope、配额和生命周期；
- Access Request、Data Owner 审批、Access Grant、到期回收；
- 数据质量、新鲜度、运行、调用量、成本和安全审计；
- Internal/External Gateway、Authorization Service、Data Service 和湖仓适配。

数据面使用与资源中心隔离的企业 OSS 和 Bronze/Silver/Gold 分层。浏览器/Desktop 只能调用 Data Service/API Gateway，不获得数据库、Trino、OSS 或生产 Client Secret。API 只面向 Gold/Data Product，不将底层表直接外放。

MVP 只验证一个低敏数据源、一个 Data Product、一个内部只读 API、一个 Keycloak 服务 Client，以及字段白名单、行级过滤、动态脱敏、配额和审计。External Gateway/DMZ 只完成架构设计或合成数据验证，外部生产数据开放进入后续独立 Go/No-Go。详细规范见[湖仓与 API 治理蓝图](./10-lakehouse-data-platform-and-api-governance.md)。

## 13. Agent 优先级

### P0：企业平台 MVP

1. 有临员工工作助手：以员工工作指引为导航，按权限检索当前有效制度、非 GxP SOP/WI、OA 通知和系统指引并提供引用；
2. Capability Builder：帮助管理员创建受控 Skill、Tool、Workflow 和 Agent 草稿；
3. IT/平台帮助助手：回答企业 AI 工作台使用问题；
4. 一个只读企业 Tool 示例；
5. 一个低风险 Dify Workflow 示例。

### P1：临床业务 MVP

1. Protocol Assistant：方案问答、入排标准和访视流程；
2. TMF QC Agent：分类、命名、缺失和元数据检查；
3. CRA Assistant：监查准备、报告草拟和 Follow-up；
4. Clinical Project Copilot：风险、纪要、Action Item、周报。

### 必须人工终审

- 医学判断和受试者诊疗建议；
- SAE 因果关系或监管终态；
- 正式法规提交和方案批准；
- 对生产 EDC/CTMS 的写操作；
- 对外发送正式报告。

## 14. 安全、合规与验证

MVP 1 不处理 GxP/Part 11 受控电子记录，也不纳入受试者、人遗或跨境协作数据；首期重点执行身份、个人信息、商业机密和数据不出境控制。CTMS、EDC、eTMF、ePRO、IWRS 及其受控记录在后续阶段按预期用途评估 ICH-GCP、ALCOA+、21 CFR Part 11 和计算机化系统验证要求。

技术能力不等于自动合规。即使首期不属于 GxP 范围，生产上线仍需风险评估、测试证据、SOP、培训和持续运维控制；后续受控场景再补充 URS、验证计划、追踪矩阵和偏差管理。

最低安全要求：

- 应用层租户隔离，并评估 PostgreSQL RLS 作为纵深防御；
- 不可篡改或可验证完整性的审计归档；
- 模型、Prompt、Agent、Skill、Workflow、知识版本可追溯；
- Prompt Injection、工具越权、SSRF 和数据外泄防护；
- 敏感日志脱敏，严格控制 Prompt/Response 留存；
- 文件恶意内容扫描和解析沙箱；
- 正式审批与电子签名由受控系统完成。

## 15. 推荐代码组织

优先使用独立领域包和 Adapter，减少与上游合并冲突。以下为长期示意，不是必须创建的目录；MVP 使用 `enterprise-*`，临床 Stage 再增加 `clinical-*`；统一映射见实施基线，避免同时建立 cro-domain/clinical-domain/enterprise-domain 三套模型：

```text
packages/clinical-domain/
packages/clinical-permissions/
packages/clinical-agents/
packages/clinical-skills/
packages/integration-ragflow/
packages/integration-dify/
packages/integration-pi/
packages/enterprise-data-control/
packages/enterprise-context/      # Project/Memory/Context Assembler 与策略投影
packages/enterprise-work-center/  # 任务、通知、评审、反馈和运营契约
packages/integration-api-gateway/
packages/enterprise-audit/

apps/server/src/services/clinical/
apps/server/src/routers/lambda/clinical/
apps/server/src/router-hono/integrations/

src/features/ClinicalStudy/
src/features/ClinicalAgent/
src/features/ClinicalResource/
src/features/ClinicalCompliance/
src/features/EnterpriseAdmin/
src/features/DataControlCenter/
src/features/APIManagement/
src/features/ProjectContext/
src/features/MemoryGovernance/
src/features/EnterpriseHome/
src/features/GlobalSearch/
src/features/WorkReviewCenter/
src/features/PlatformOperations/
```

二开原则：

- 上游模块通过 Adapter、Hook、Provider 和 Feature Flag 扩展；
- 不直接散改模型运行时、数据库公共 Schema 和核心路由；
- 必须修改上游文件时保持改动小、测试完整，并记录原因；
- 品牌和企业配置优先配置化，不硬编码；
- 所有企业表默认带 `workspaceId`，Study 资源带 `projectId/studyId`；
- 所有跨系统记录保存 `externalSystem/externalId/version`。

## 16. 实施路线

| 阶段 | 目标 | 主要产物 |
| --- | --- | --- |
| 0，1～2 周 | 决策和工程基线 | 身份 ADR、组织真源、环境、CI 和 Pilot 范围 |
| 1，3～5 周 | 统一身份 | Keycloak、企业微信适配、账号绑定和禁用 |
| 2，4～7 周 | 组织权限 | 部门同步、Workspace、RBAC、ACL 和审计 |
| 3，3～8 周 | 多端与私有部署 | Web、Desktop 登录、制品、部署和升级 |
| 4，6～10 周 | 企业能力中心 | Skill、Tool、Workflow、Agent Registry |
| 5，7～16 周 | 资源、知识与灯塔场景 | 四级资源库、OSS、记忆分层、Project Context、Context Assembler、产出物和员工工作助手 |
| 6，5～18 周 | 数据/API 控制面 PoC | 目录、湖仓分层、Data Product、内部只读 API、授权、质量、血缘和审计 |
| 7，7～20 周 | Project Context 与 Agent 授权 | Membership、记忆分层、Context Assembler、Audience、离项回收和网络投影 |
| 8，6～22 周 | 产品与运营闭环 | 首页、搜索、任务、通知、评审、反馈、Feature Flag 和运营中心 |
| 9，22～26 周 | 硬化与上线 | 安全、性能、恢复、UAT 和 Pilot 发布 |
| 10，后续 | 完整产品演进 | Employee/Project/Clinical/Knowledge/AI/Data/Integration/Trust 产品域 |

### 16.1 企业平台 MVP 验收指标

- 同一员工通过 SSO 和企业微信登录映射到同一账号；
- 离职/禁用员工在目标时限内失去访问；
- 权限隔离测试不存在跨 Workspace/部门数据泄漏；
- Web 与 Desktop 使用同一企业资源和权限；
- Skill、Tool、Workflow、Agent 可审核、发布和回滚；
- 个人/团队/企业/项目资源库及上传、预览、分享、版本和回收站可用；
- 个人通用/项目私有记忆在 Web/Desktop 同步，项目共享记忆需显式 Promotion；
- PM/管理层按职责查看项目共享上下文，不能默认读取成员个人项目记忆；
- Agent Runtime Context 可还原 actor、project、purpose、audience、来源和 Policy Decision；
- Agent/Workflow 产出物可保存到 OSS 并按来源归档；
- 关键回答具备有效文件版本和页码/章节引用；
- 高风险 Tool 未批准无法执行；
- 一个低敏 Data Product 展示 Owner、Schema、分类、质量、SLA 和血缘；
- 一个独立 Keycloak Client 通过内部 Gateway 调用只读 API，行列权限、脱敏、配额、到期回收和审计通过；
- 首页、全局搜索、任务、通知、统一评审、反馈、Feature Flag 和支持入口可用；
- 身份、权限、模型、知识、数据产品、API、工具和 Workflow 全链路可追踪。

## 17. 架构决策清单

进入编码前需确认：

1. Workspace 是否等同企业租户，是否允许用户加入多个企业；
2. Project 与后续独立 Study 聚合根的关系基数及权威源；不得把 Project 直接作为 Study；
3. RAGFlow 是唯一生产 RAG 还是与原生 RAG 并存；
4. Dify 是生产流程引擎还是原型工具；
5. Pi Agent 可以访问哪些数据和执行哪些命令；
6. 企业模型网关连接 OpenAI/阿里云百炼时，如何技术保证业务数据不出境、不越界；
7. MVP 1 明确不处理受试者、人遗数据，需冻结允许字段白名单；
8. MVP 1 明确排除 GxP/Part 11 受控记录，后续需逐一确定 CTMS、EDC、eTMF、ePRO、IWRS 的预期用途与验证范围；
9. ECC 的准确项目地址和职责；
10. 首个 Pilot 部门、用户、文件集和业务指标；
11. 资源中心与湖仓 OSS 隔离、开放表格式、查询引擎、目录血缘和质量工具；
12. API Gateway、Authorization Service、Data Service、行列权限和脱敏实现；
13. 首个低敏 Data Product、Owner、Schema、SLA 和内部 API；
14. 外部 Gateway/DMZ、允许数据边界和对外审批矩阵；
15. Project 与合同/客户/Study 关系及 Membership 真源；
16. 记忆分类、Promotion、Context Facet、受众、离项回收和缓存失效策略；
17. Context Network 使用 PostgreSQL/搜索投影还是图数据库的进入条件；
18. 首页/全局搜索、任务通知、统一评审与泛微 OA 的边界；
19. Feature Flag/Entitlement、反馈支持和完整产品 Stage 投资门。

## 18. 推荐下一步

1. 部署 Keycloak 私有环境，确认新人新事、企业微信和 Keycloak 的身份/组织权威边界；
2. 申请企业微信测试应用，通过独立身份适配器完成 Keycloak 唯一账号 Spike；
3. 冻结一个企业主 Workspace、部门、用户组和资源权限模型；
4. 确认 Web、Desktop 和私有部署目标；
5. 核验 LobeHub、Dify、RAGFlow 以及企业模型网关的版本、接口、部署、数据路由和升级基线；
6. 补齐新人新事、泛微、自研 CRM、医渡定制系统和用友的接口元数据；
7. 选择两个 Pilot 部门，以员工工作指引为导航收集首批有效制度/非 GxP SOP/WI，建设员工工作助手、只读深链接 Tool 和问答 Workflow；
8. 冻结湖仓 OSS 分区、表格式、Trino/计算、目录、质量和 Gateway ADR；
9. 选择首个低敏 Data Product 和 Owner，验证 Keycloak Service Account、内部 API、行列过滤、脱敏、配额和审计；
10. 冻结 Project/Membership、个人/项目共享记忆和 Context Facet，完成 Context Assembler 与离项回收 Spike；
11. 冻结首页、全局搜索、任务/通知/评审、反馈、Feature Flag 和运营支持边界；
12. 按 `07-mvp-product-spec.md`、`08-delivery-roadmap.md` 和 `12-full-product-capability-and-evolution-blueprint.md` 推进完整 MVP，并设置后续 Stage 投资门。
