# Dify、RAGFlow、BPM 与 Tool Gateway 集成契约

> 状态：接口契约候选基线 1.0  
> 适用分支：`feat/youlin-enterprise-ai-platform`  
> 适用范围：Youlin Clinical AI Hub 与外部 AI/流程平台集成  
> 前置文档：[企业版二开架构](./04-lobehub-extension-architecture-and-roadmap.md)

## 1. 文档目标

本文定义 Youlin 与 RAGFlow、Dify、BPM、Tool Gateway 之间的稳定边界，保证：

- LobeHub/Youlin 是用户、租户、资源权限和审计入口；
- 外部平台不直接暴露给浏览器，不持有企业主身份；
- 所有调用可鉴权、可追踪、可重试、可去重、可审计；
- 外部平台可替换，不把供应商私有对象扩散到临床领域模型；
- Agent、Workflow、知识检索和正式审批职责清晰；
- 接口变更有版本、兼容和契约测试机制。

本文是逻辑契约，不等同于某一版本供应商 API。实际接入前必须针对部署版本完成 Adapter 验证。临床 JSON 示例仅说明后续契约，禁止直接作为 MVP 数据或默认配置。统一规则与参数冻结见[实施基线](./plan/04-unified-baseline-and-decision-register.md)。

### 1.1 分阶段实施范围

MVP 1 只实现本契约的最小子集：

- RAGFlow/原生 RAG：企业通用知识摄取、权限检索和引用；
- Dify：一个低风险、固定版本的通用 Workflow；
- Tool Gateway：Registry、Credential、审计和一个只读 Tool；
- Resource/Memory/Context Provider、湖仓内部 Data Product/API，以及任务/通知/评审/反馈和模块集成的公共契约；
- 统一请求头、错误、幂等、任务、回调、审计和契约测试。

BPM 正式审批、CTMS/eTMF/EDC 写回、Study 范围 Claim 和 Pi 高权限执行保留到 MVP 2/3。保留契约不等于首期必须部署所有组件。

当前企业集成目标已知为：新人新事 HR、泛微 OA、自研 CRM、医渡科技定制 CTMS/EDC/IWRS/eTMF、用友财务，以及待核验供应商的 QMS、LMS、PV/安全数据库。各系统理论上可取数，但在版本、接口和部署核验完成前，本契约只冻结 Provider/Adapter 边界，不假设具体供应商 API。

所有集成和模型调用遵循数据不出境、不越出批准处理边界的基线。企业模型网关虽可路由 OpenAI 和阿里云百炼，Adapter 不得据此默认向外部模型发送业务原文。

## 2. 集成上下文

```text
Browser
  │ 仅访问 Youlin
  ▼
Youlin Web/API
  ├── Knowledge Provider ──► RAGFlow Adapter ──► RAGFlow
  ├── Workflow Provider ───► Dify Adapter ─────► Dify
  ├── Approval Provider ───► BPM Adapter ──────► BPM/OA
  └── Tool Gateway ────────► MCP / CTMS / eTMF / EDC / Pi Runner
```

### 2.1 权威边界

| 数据 | 权威系统 |
| --- | --- |
| 认证身份、Token、Session、MFA、外部身份绑定 | Keycloak |
| 员工号、在职状态 | 新人新事，经同步服务投影到 Keycloak/Youlin |
| Youlin 用户、Workspace、成员关系 | Youlin |
| Project/Study 业务身份 | Youlin 领域层或指定 MDM/CTMS |
| 文件 ID、版本、密级、授权 | Youlin 资源中心 |
| 文档解析、Chunk、检索索引 | RAGFlow |
| AI Workflow 定义和运行节点 | Dify |
| 正式审批状态和电子签名 | BPM/OA |
| Tool 注册、授权和调用证据 | Tool Gateway/Youlin |
| 源业务事实 | CTMS、EDC、eTMF、QMS 等源系统 |

外部系统 ID 必须通过映射表关联，不允许替代 Youlin 的企业资源 ID。

## 3. 通用协议

### 3.1 传输

- 内部同步接口：HTTPS + JSON；
- 流式输出：SSE，必要时 WebSocket；
- 异步通知：Webhook 或事件总线；
- 大文件：S3 预签名 URL，不通过 JSON/Base64 传输；
- 时间：ISO 8601 UTC，例如 `2026-09-11T08:30:00Z`；
- 字符编码：UTF-8；
- API 版本：URL 主版本 `/api/integrations/v1/...`。

### 3.2 通用请求头

```http
Authorization: Bearer <short-lived-service-token>
Content-Type: application/json
X-Youlin-Request-Id: req_xxx
X-Youlin-Trace-Id: trace_xxx
X-Youlin-Workspace-Id: ws_xxx
X-Youlin-Project-Id: project_xxx
X-Youlin-Study-Id: study_xxx
X-Youlin-Purpose: project_risk_summary
X-Youlin-Runtime-Context-Id: ctxrun_xxx
Idempotency-Key: idem_xxx
```

要求：

- Token 使用短期服务身份，不透传用户长期凭证；
- `workspaceId` 必填，Project/Study 按资源范围填写，Purpose 和 Audience 进入服务端策略计算；
- 写操作必须支持 `Idempotency-Key`；
- 服务端从签名 Token 解析身份，并验证 Header 与 Token 声明一致；
- 不信任客户端直接提交的角色、权限和数据密级。

### 3.3 服务身份声明

JWT/服务令牌最小声明：

```json
{
  "iss": "https://id.example/realms/youlin",
  "aud": "ragflow-adapter",
  "sub": "service:youlin-api",
  "actor": {
    "type": "user",
    "id": "user_xxx"
  },
  "workspaceId": "ws_xxx",
  "projectId": "project_xxx",
  "studyId": "study_xxx",
  "purpose": "project_risk_summary",
  "audience": ["user_xxx"],
  "runtimeContextId": "ctxrun_xxx",
  "scope": "knowledge:search document:ingest",
  "clearance": ["internal", "confidential"],
  "exp": 1789115400,
  "jti": "token_xxx"
}
```

`iss` 为配置并校验的 Keycloak Issuer，不能由调用方任意填写。actor/Project/Purpose 等扩展 Claim 只能由可信代理签发或受控 Token Exchange 注入，不假设 Client Credentials 原生包含用户代理信息；若部署版本不支持，Adapter 验证服务 Token 后按服务端 Run/Grant 查询用户上下文。OIDC `aud` 是目标 API，业务 `audience` 是输出受众，两者不得混用。

### 3.4 通用响应

成功：

```json
{
  "requestId": "req_xxx",
  "data": {},
  "meta": {
    "provider": "ragflow",
    "providerRequestId": "external_xxx",
    "durationMs": 238
  }
}
```

失败：

```json
{
  "requestId": "req_xxx",
  "error": {
    "code": "INTEGRATION_TIMEOUT",
    "message": "Knowledge provider did not respond within the deadline",
    "retryable": true,
    "details": {}
  }
}
```

### 3.5 错误码

| 错误码 | HTTP | 是否可重试 | 含义 |
| --- | ---: | :---: | --- |
| `AUTH_REQUIRED` | 401 | 否 | 服务身份无效 |
| `PERMISSION_DENIED` | 403 | 否 | 权限不足 |
| `RESOURCE_NOT_FOUND` | 404 | 否 | 企业资源或映射不存在 |
| `SCOPE_MISMATCH` | 409 | 否 | Workspace/Study 范围不一致 |
| `IDEMPOTENCY_CONFLICT` | 409 | 否 | 相同幂等键对应不同请求 |
| `VALIDATION_ERROR` | 422 | 否 | 输入 Schema 不合法 |
| `RATE_LIMITED` | 429 | 是 | 超出配额 |
| `PROVIDER_UNAVAILABLE` | 502 | 是 | 外部平台不可用 |
| `INTEGRATION_TIMEOUT` | 504 | 是 | 调用超时 |
| `CONTENT_REJECTED` | 422 | 否 | 文件或内容违反安全策略 |

重试采用指数退避和抖动，只重试标记为 `retryable` 的错误；写操作重试必须复用原幂等键。

## 4. 统一异步任务契约

耗时操作统一返回任务：

```json
{
  "jobId": "job_xxx",
  "type": "document.ingest",
  "status": "queued",
  "createdAt": "2026-09-11T08:30:00Z",
  "resource": {
    "type": "document",
    "id": "doc_xxx"
  }
}
```

状态枚举：

```text
queued → running → succeeded
                 ↘ failed
                 ↘ cancelled
```

查询：

```http
GET /api/integrations/v1/jobs/{jobId}
```

事件信封：

```json
{
  "eventId": "evt_xxx",
  "eventType": "document.ingestion.succeeded",
  "eventVersion": 1,
  "occurredAt": "2026-09-11T08:35:00Z",
  "workspaceId": "ws_xxx",
  "projectId": "project_xxx",
  "studyId": "study_xxx",
  "correlationId": "req_xxx",
  "producer": "ragflow-adapter",
  "payload": {}
}
```

消费者按 `eventId` 去重。事件只表达已发生事实，不使用含糊命令式名称。

## 5. 资源中心与 OSS 契约

### 5.1 权威边界

- Youlin 资源中心是资源 ID、目录、版本、Owner、权限、分享、状态和保留策略的权威源；
- 企业 OSS/S3 兼容对象存储是文件原件、不可变版本、预览衍生物、记忆附件/快照和产出物载荷的权威存储；
- PostgreSQL 保存可查询元数据和对象 Key，不保存大文件正文；
- RAGFlow、缩略图和预览转换结果是可重建派生物，不得替代原件；
- 个人、团队、企业和项目资源统一使用企业资源 ID，不能把 OSS Key 暴露为业务 ID。

### 5.2 Resource Provider

```ts
interface ResourceStorageProvider {
  initiateUpload(input: InitiateUploadInput): Promise<UploadSession>;
  completeUpload(input: CompleteUploadInput): Promise<ResourceVersionRef>;
  createDownload(input: DownloadRequest): Promise<ShortLivedAccess>;
  createPreview(input: PreviewRequest): Promise<JobRef>;
  createVersion(input: CreateVersionInput): Promise<ResourceVersionRef>;
  createShare(input: CreateShareInput): Promise<ShareGrantRef>;
  revokeShare(shareGrantId: string): Promise<void>;
  moveToTrash(resourceId: string): Promise<void>;
  restore(resourceId: string): Promise<void>;
  requestPurge(resourceId: string): Promise<JobRef>;
}
```

资源范围枚举：

```text
personal | team | enterprise | project
```

资源动作枚举：

```text
view | preview | download | edit | manage | share | delete
```

### 5.3 上传与版本

```text
POST /api/resources/v1/uploads
→ 服务端校验用户、目标资源库、配额、类型和大小
→ 返回隔离区分片上传会话
→ 客户端直传 OSS
→ complete 回调校验 Hash/大小/MIME
→ 恶意扫描和策略检查
→ 幂等晋级 original 区并创建不可变 ResourceVersion
→ 发布 preview/资源搜索异步任务（资源搜索仍先授权）
→ 另经知识发布审批和摄取质量门禁，才激活在线 RAG 索引
```

要求：

- 预签名上传 URL 短时有效并绑定对象 Key、类型和上传会话；大小限制按 OSS 实际签名能力实施，不能假设所有 S3 PUT 都支持范围限制，完成前必须复核实际大小/Hash/MIME，超限隔离并清理；
- 浏览器不能自定义正式区对象 Key；
- `completeUpload` 必须幂等；
- 内容修改始终创建新版本，禁止覆盖历史对象；
- 重复 Hash 可提示或受控去重，但授权、Owner 和资源生命周期保持独立；
- 隔离失败对象不可预览、下载、分享或进入 RAG。

### 5.4 预览、查看与下载

- 预览和转码异步执行，输出写入 `preview` 区并继承原资源权限；
- 每次创建预览/下载 URL 前重新校验用户、资源状态、版本、分享和下载权限；
- 短时 URL 不是分享链接，不得长期缓存；
- Office/PDF 转换器运行在无默认出站网络的沙箱；
- 原件和转换件下载分别授权并记录审计；
- 文件被撤回、删除、隔离或权限收回后，不再签发新 URL；已签发的普通 OSS URL 通常仍可用到过期，不能靠删除 ShareGrant 撤销签名；
- MVP 用户预览/下载使用受控流式代理或支持实时撤权的资源网关，每次新请求及 Range 请求鉴权。普通 OSS 预签名仅用于隔离区上传和批准的服务间传输；如 ADR 允许用户直下载，必须明示最大残留窗口并修改验收，不得声称即时回收；
- 已下载或已展示的内容无法远程收回；测试覆盖后续请求、运行中传输中止和客户端缓存清理，不承诺收回截图或用户副本。

### 5.5 分享

`ShareGrant` 至少包含：

```json
{
  "resourceId": "res_xxx",
  "versionPolicy": "latest",
  "subjectType": "user|group|department|project|enterprise",
  "subjectId": "subject_xxx",
  "permissions": ["view", "preview", "download"],
  "startsAt": "2026-08-06T08:00:00Z",
  "expiresAt": "2026-09-06T08:00:00Z",
  "allowReshare": false
}
```

MVP 1 不允许匿名公网分享。分享入口必须先完成 Keycloak 登录，再由资源服务解析并执行实时授权。

### 5.6 删除与一致性

```text
active → trashed → purge_pending → purged
                 ↘ restored
```

- `trashed` 后立即停止分享、预览、下载、搜索和 Agent 新引用；
- Legal Hold 或保留期未结束时禁止进入 `purge_pending`；
- 物理删除按“RAG 索引 → 预览衍生物 → 原件/版本 → 元数据终态”编排，并保存回执；
- 使用事务外箱、幂等 Job 和补偿任务协调 PostgreSQL、OSS、预览与 RAG；
- 定期检测孤儿对象、缺失对象、无主上传、索引漂移和未完成删除；
- 审计和历史 Run 保留资源/版本 ID，但不得提供已删除内容的下载通道。

### 5.7 记忆、Promotion 与产出物

- PersonalMemory 区分 `general` 和 `project_private`；后者必须带 `projectId`、来源和当前项目授权；
- ProjectMemory 是独立项目资产，生命周期为 `draft/proposed/shared/confirmed/superseded/expired/archived`；
- 个人项目记忆通过 MemoryPromotionRequest 显式提交、脱敏和按类别审核，不能自动共享；
- 记忆元数据与关系保存在 PostgreSQL，正文快照、附件和导出包加密保存在 OSS `memory` 区；
- 个人接口支持 list/search/update/delete/export/disable 和 `allowAgentUse`，按 Keycloak `sub` 与企业用户 ID 双重校验；
- 当前 Project-B 请求默认排除 Project-A 私有记忆，除非是经策略验证的 `crossProjectReusable` 通用项；
- Agent、Tool、Workflow 产出物保存到 OSS `artifact` 区后创建 ResourceObject/ResourceVersion，并记录 Runtime Context、受众、来源最高密级和是否使用个人记忆；
- 使用个人记忆的产出物默认 `personal`，移动/分享至项目需重新执行来源、脱敏和 Audience 权限检查；
- 个人/项目记忆和未发布产出物不得自动进入企业知识库。

### 5.8 Context Provider 契约

```ts
interface ContextProvider {
  assemble(request: AssembleContextRequest): Promise<RuntimeContextPackage>;
  preview(request: AssembleContextRequest): Promise<ContextManifest>;
  explain(policyDecisionId: string): Promise<PolicyDecisionExplanation>;
  invalidate(request: ContextInvalidationRequest): Promise<InvalidationResult>;
}
```

请求至少包含：

```json
{
  "actorUserId": "user_xxx",
  "agentVersion": "agent_pm_1.2.0",
  "projectId": "project_a",
  "purpose": "project_risk_summary",
  "audience": ["user_xxx"],
  "asOf": "2026-08-06T08:00:00Z",
  "requestedFacets": ["milestone", "risk", "action", "project_memory"],
  "allowedOutputScopes": ["personal", "project_draft"]
}
```

响应至少包含：

```json
{
  "runtimeContextId": "ctxrun_xxx",
  "contextDefinitionVersion": "1.0.0",
  "policyDecisionId": "pd_xxx",
  "sourceRefs": [],
  "memoryRefs": [],
  "includedFacets": [],
  "excludedFacets": [],
  "audience": ["user_xxx"],
  "classification": "confidential",
  "expiresAt": "2026-08-06T08:30:00Z",
  "traceId": "trace_xxx"
}
```

有效权限必须是用户、Agent Manifest、Project Membership/Scope、资源/数据、Tool、Purpose、环境和时间策略的交集。Context Provider 必须先授权再检索 RAG、Search、Graph、Memory 和 Data Product，模型运行时不得绕过它自行拼接上下文。

多人输出使用 Audience 权限安全交集或返回分段授权 Manifest。权限变化、成员离项和项目关闭触发 Context/搜索/向量/图/缓存失效；历史 Run 只保留必要引用、Hash 和审计证据，不形成内容访问旁路。

详细规范见[记忆与上下文治理蓝图](./11-context-memory-and-agent-authorization-governance.md)。

## 6. RAGFlow 契约

### 6.1 Provider 接口

```ts
interface KnowledgeProvider {
  createDataset(input: CreateDatasetInput): Promise<DatasetRef>;
  ingestDocument(input: IngestDocumentInput): Promise<JobRef>;
  getJob(jobId: string): Promise<JobStatus>;
  search(input: KnowledgeSearchInput): Promise<KnowledgeSearchResult[]>;
  deleteDocument(input: DeleteDocumentInput): Promise<JobRef>;
}
```

### 6.2 Dataset 映射

创建：

```http
POST /api/integrations/v1/knowledge/datasets
```

```json
{
  "workspaceId": "ws_xxx",
  "projectId": "project_xxx",
  "studyId": "study_xxx",
  "knowledgeBaseId": "kb_xxx",
  "name": "STUDY-001 Protocol Knowledge",
  "classification": "confidential",
  "locale": "zh-CN",
  "embeddingProfile": "clinical-multilingual-v1",
  "parserProfile": "clinical-controlled-document-v1"
}
```

映射结果：

```json
{
  "datasetId": "kb_xxx",
  "provider": "ragflow",
  "externalDatasetId": "ragflow_dataset_xxx",
  "status": "ready"
}
```

映射表最少保存：`workspaceId`、`knowledgeBaseId`、`provider`、`externalDatasetId`、`providerVersion`、`createdAt`、`updatedAt`。

### 6.3 文档摄取

```http
POST /api/integrations/v1/knowledge/documents:ingest
```

```json
{
  "knowledgeBaseId": "kb_xxx",
  "document": {
    "id": "doc_xxx",
    "fileId": "file_xxx",
    "versionId": "version_xxx",
    "name": "Protocol V3.0.pdf",
    "mimeType": "application/pdf",
    "sha256": "...",
    "size": 7340032,
    "downloadUrl": "https://s3.example/presigned...",
    "downloadUrlExpiresAt": "2026-09-11T08:45:00Z"
  },
  "metadata": {
    "documentType": "protocol",
    "documentVersion": "3.0",
    "effectiveAt": "2026-08-01T00:00:00Z",
    "status": "effective",
    "countryCodes": ["CN"],
    "siteIds": [],
    "classification": "confidential",
    "containsPii": false,
    "containsPhi": false
  },
  "parserProfile": "clinical-controlled-document-v1"
}
```

约束：

- Adapter 下载前再次确认 URL、Host 和文件映射，防止 SSRF；
- 校验 SHA-256、大小、MIME 和恶意文件扫描结果；
- 相同 `documentId + versionId + sha256` 必须幂等；
- 新版本不能静默覆盖旧版本，旧版本保留检索/审计状态；
- 文档撤回后立即从在线检索范围排除，索引物理删除可异步完成。

### 6.4 检索

```http
POST /api/integrations/v1/knowledge:search
```

```json
{
  "query": "本研究主要入选标准是什么？",
  "knowledgeBaseIds": ["kb_xxx"],
  "filters": {
    "studyId": "study_xxx",
    "documentTypes": ["protocol"],
    "effectiveAt": "2026-09-11T08:40:00Z",
    "statuses": ["effective"],
    "countryCodes": ["CN"]
  },
  "retrieval": {
    "mode": "hybrid",
    "topK": 12,
    "rerankTopN": 6,
    "minimumScore": 0.55
  },
  "purpose": "agent_context"
}
```

标准结果：

```json
{
  "results": [
    {
      "chunkId": "chunk_xxx",
      "text": "...",
      "score": 0.87,
      "document": {
        "id": "doc_xxx",
        "versionId": "version_xxx",
        "name": "Protocol V3.0.pdf",
        "documentVersion": "3.0",
        "status": "effective"
      },
      "citation": {
        "pageStart": 31,
        "pageEnd": 32,
        "section": "5.1 Inclusion Criteria",
        "quote": "...",
        "snapshotHash": "sha256:..."
      },
      "provider": {
        "name": "ragflow",
        "externalChunkId": "external_chunk_xxx"
      }
    }
  ],
  "retrievalSnapshotId": "retrieval_xxx"
}
```

Youlin 必须在召回前将有效文档版本 ACL/Scope 白名单落实到 Provider 查询，并在返回后复核权限与版本。仅过滤 Knowledge Base 不足以保护同库不同 ACL 文件；若 Provider 不支持可靠预过滤，应物理拆分权限域或拒绝该查询，不能先召回无权内容再过滤。

### 6.5 员工工作助手问答契约

员工工作助手必须通过 Knowledge Gateway 调用 RAG，不允许 Agent 或 Dify 直接绕过权限过滤访问 RAGFlow。

请求至少包含：

```json
{
  "actorUserId": "user_xxx",
  "question": "出差如何申请？",
  "domains": ["administration", "finance"],
  "audience": ["user_xxx"],
  "effectiveAt": "2026-08-06T08:00:00Z",
  "allowedSourceTypes": ["policy", "non_gxp_sop_wi", "oa_notice", "employee_guide", "system_guide"],
  "requireCitation": true
}
```

证据排序规则：

```text
当前有效制度/SOP/WI
> 当前 OA 正式通知
> 员工工作指引
> 培训材料/历史说明
```

响应至少包含：

- 结构化答案、证据充分度和是否需要转人工；
- 资源 ID、确定版本、标题、章节/页码和原文引用；
- 文档状态、生效/失效时间、Owner、来源类型和来源优先级；
- 检测到的冲突、旧版本或缺失原始文件；
- 允许展示的 OA/系统/联系人角色深链接；
- Trace ID、检索时间和检索配置版本。

以下情况必须返回拒答或转人工，不允许模型补全企业规则：

- 无当前有效证据；
- 高优先级来源互相冲突；
- 员工工作指引引用的原始制度尚未入库或已失效；
- 用户无权访问必要证据；
- 问题进入 GxP、医学、安全、法律个案或正式审批终态；
- 证据低于配置阈值。

员工工作指引中的联系人优先归一为部门/岗位；个人姓名、手机和邮箱只有在资源权限和最小必要策略允许时才返回。

## 7. Dify 契约

### 7.1 Provider 接口

```ts
interface WorkflowProvider {
  resolveDefinition(id: string, version: string): Promise<WorkflowDefinition>;
  run(input: RunWorkflowInput): Promise<WorkflowRunRef>;
  stream(runId: string): AsyncIterable<WorkflowEvent>;
  cancel(runId: string): Promise<void>;
  getRun(runId: string): Promise<WorkflowRun>;
}
```

### 7.2 Workflow 注册

Youlin 保存受控注册信息：

```json
{
  "workflowId": "wf_tmf_qc",
  "provider": "dify",
  "externalAppId": "dify_app_xxx",
  "version": "1.3.0",
  "status": "published",
  "inputSchema": {},
  "outputSchema": {},
  "requiredScopes": ["document:read", "knowledge:search"],
  "riskLevel": "medium",
  "approvalPolicy": "before_external_write",
  "timeoutSeconds": 600
}
```

生产运行只能引用已批准且未撤回的 published 确定版本，不允许自动跟随 Dify 草稿最新版。Adapter 必须验证供应商实际支持的版本固定：若不能按历史版本运行，则每个发布版使用独立不可变应用/部署并记录 DSL Hash、Provider 版本和配置。仅在 Registry 写 version 字符串不构成版本固定。

### 7.3 运行 Workflow

```http
POST /api/integrations/v1/workflows/{workflowId}/runs
```

```json
{
  "workflowVersion": "1.3.0",
  "subject": {
    "type": "documentVersion",
    "id": "version_xxx"
  },
  "inputs": {
    "documentId": "doc_xxx",
    "documentVersionId": "version_xxx",
    "qcProfile": "tmf-core-v1"
  },
  "context": {
    "workspaceId": "ws_xxx",
    "projectId": "project_xxx",
    "studyId": "study_xxx",
    "actorId": "user_xxx"
  },
  "callbackUrl": "https://youlin.example/api/integrations/v1/callbacks/dify"
}
```

Dify Adapter 只传递 Workflow 需要的最小数据。文件采用短期 URL 或受控 Tool 获取，不在 Dify 变量中嵌入大文件和长期凭证。

### 7.4 Workflow 事件

```text
workflow.run.queued
workflow.run.started
workflow.node.started
workflow.node.completed
workflow.run.waiting_approval
workflow.run.succeeded
workflow.run.failed
workflow.run.cancelled
```

最终输出必须通过注册时的 JSON Schema 校验：

```json
{
  "runId": "wfrun_xxx",
  "workflowId": "wf_tmf_qc",
  "workflowVersion": "1.3.0",
  "status": "succeeded",
  "outputs": {
    "classification": "01.01.01",
    "findings": [],
    "summary": "..."
  },
  "usage": {
    "inputTokens": 12000,
    "outputTokens": 1800,
    "cost": 1.26,
    "currency": "CNY"
  }
}
```

Dify 输出是 AI 建议，不直接构成正式 QC 结论或源系统写入指令。

## 8. BPM 契约

### 8.1 Provider 接口

```ts
interface ApprovalProvider {
  startProcess(input: StartApprovalInput): Promise<ApprovalInstanceRef>;
  getInstance(id: string): Promise<ApprovalInstance>;
  getTasks(input: ListApprovalTasksInput): Promise<ApprovalTask[]>;
  act(input: ApprovalActionInput): Promise<ApprovalActionResult>;
  cancel(input: CancelApprovalInput): Promise<void>;
}
```

### 8.2 启动审批

```http
POST /api/integrations/v1/approvals/processes/{processKey}/instances
```

```json
{
  "processVersion": "2.1",
  "businessKey": "tmf-qc:qc_xxx",
  "title": "STUDY-001 TMF 文档 QC 复核",
  "initiatorId": "user_xxx",
  "subject": {
    "type": "qcReport",
    "id": "qc_xxx",
    "version": "1"
  },
  "participants": {
    "candidateGroupIds": ["group_tmf_qc"],
    "watcherIds": ["user_pm"]
  },
  "variables": {
    "studyId": "study_xxx",
    "riskLevel": "medium",
    "findingCount": 4
  },
  "evidence": [
    {
      "type": "artifact",
      "id": "artifact_qc_report_xxx",
      "sha256": "..."
    }
  ],
  "callbackUrl": "https://youlin.example/api/integrations/v1/callbacks/bpm"
}
```

### 8.3 审批动作

允许动作：

```text
approve / reject / request_changes / delegate / cancel
```

```http
POST /api/integrations/v1/approvals/tasks/{taskId}/actions
```

```json
{
  "action": "request_changes",
  "actorId": "user_qa",
  "comment": "请确认文件生效日期并重新执行版本检查",
  "expectedVersion": 3,
  "signature": {
    "meaning": "reviewed_and_requested_changes",
    "reauthenticationToken": "short_lived_token"
  }
}
```

约束：

- 任务候选人和最终权限由 BPM 与 Youlin 双向校验；
- 使用 `expectedVersion` 做乐观锁，防止重复审批；
- 电子签名必须由经过验证的 BPM/签名系统完成；
- Youlin 不伪造、代签或仅凭 Agent 输出自动批准；
- 回调只更新投影，BPM 仍是审批状态真源。

### 8.4 BPM 回调

```text
approval.instance.started
approval.task.created
approval.task.completed
approval.instance.approved
approval.instance.rejected
approval.instance.cancelled
```

回调必须签名、带时间戳和防重放随机数；Youlin 收到后主动查询 BPM 核验关键终态。

## 9. Tool Gateway 契约

### 9.1 职责

Tool Gateway 统一承担：

- Tool 注册、发现、版本和输入输出 Schema；
- 用户/Agent/Study 范围授权；
- 凭证代理和短期凭证；
- 参数校验、出站策略、SSRF 防护；
- Human-in-the-Loop；
- 调用限流、超时、重试和熔断；
- 输入输出脱敏和全链路审计；
- MCP、HTTP API、Pi Runner 等协议适配。

### 9.2 Tool 定义

```json
{
  "toolId": "ctms.getStudyMilestones",
  "version": "1.2.0",
  "title": "查询研究里程碑",
  "description": "从 CTMS 获取授权 Study 的里程碑",
  "transport": "http",
  "riskLevel": "low",
  "sideEffect": "read",
  "requiredScopes": ["ctms:study:read"],
  "inputSchema": {
    "type": "object",
    "properties": {
      "studyId": { "type": "string" }
    },
    "required": ["studyId"],
    "additionalProperties": false
  },
  "outputSchema": { "type": "object" },
  "approvalPolicy": "none",
  "timeoutMs": 10000,
  "dataPolicy": {
    "allowsPhi": false,
    "allowedRegions": ["CN"]
  }
}
```

### 9.3 Tool 调用

```http
POST /api/integrations/v1/tools/{toolId}:invoke
```

```json
{
  "toolVersion": "1.2.0",
  "callId": "call_xxx",
  "agentRunId": "run_xxx",
  "arguments": {
    "studyId": "study_xxx"
  },
  "context": {
    "workspaceId": "ws_xxx",
    "projectId": "project_xxx",
    "studyId": "study_xxx",
    "actorId": "user_xxx",
    "agentId": "agent_xxx"
  }
}
```

响应：

```json
{
  "callId": "call_xxx",
  "status": "succeeded",
  "result": {},
  "evidence": {
    "sourceSystem": "ctms",
    "sourceRequestId": "ctms_req_xxx",
    "retrievedAt": "2026-09-11T08:40:00Z"
  },
  "redactions": []
}
```

### 9.4 风险与审批策略

| 风险 | 示例 | 默认策略 |
| --- | --- | --- |
| 低 | 读取已授权里程碑 | 自动执行并审计 |
| 中 | 生成文件、创建草稿 | 可执行，结果需人工确认 |
| 高 | 更新 CTMS、发送邮件 | 执行前明确审批 |
| 禁止 | 删除受控记录、代签 | 策略阻断 |

审批绑定具体 `toolId + version + argumentsHash + actor + resource`。参数改变后旧批准失效。

### 9.5 插件绑定与可选执行后端

Plugin Catalog 负责包准入、精确版本/Digest 与依赖；Installation/Binding 记录环境、Workspace/Project、启用状态、权限上限与 Secret 引用。发现、安装、加载、调用和输出分别校验；升级新增权限重新评审，卸载/停用回收绑定与凭证，不删除历史证据。

Pi 经独立 Execution Provider 接入，逻辑任务契约包含 executionId、parentRunId、actor/service、workspace/project、purpose/audience、Runtime Context、输入版本、执行镜像/资源包、允许工具、deadline/预算、审批、事件序号与产出物。submit 受理不等于 succeeded；终态需运行状态、错误和产出物共同校验。SDK/RPC 只部署在隔离 Runner；自定义 Tool Bridge 调企业 Gateway，不假定 Pi 原生具有企业 MCP/授权能力。

MVP 只预留上述边界与默认关闭的受控 Spike，正式 Pi 执行/可执行插件生产启用必须另行批准。完整约束见 [18 §13.4～13.6](./18-application-and-technical-architecture.md)。

## 10. 湖仓 Data Product 与 API 契约

### 10.1 控制面边界

Youlin 只调用 Catalog、Authorization、Data Service 和 API Gateway 管理接口，不直接向浏览器/Desktop 暴露 Trino、数据库、OSS、Kafka 或生产 Client Secret。

MVP 控制面对象至少包含：

```text
DataSource / Dataset / DatasetVersion
DataProduct / DataContract / MetricDefinition
APIProduct / APIVersion / APIClient / Subscription
Policy / AccessRequest / AccessGrant
DataQualityRule / LineageEdge / APIUsageRecord / DataExport
```

### 10.2 Data Product 描述

```json
{
  "dataProductId": "dp_org_directory",
  "version": "1.0.0",
  "name": "企业组织与部门目录",
  "ownerId": "user_owner",
  "classification": "internal",
  "allowedPurposes": ["directory_sync"],
  "schemaRef": "schema://dp_org_directory/1.0.0",
  "sourceDatasetIds": ["ds_hr_employee_silver"],
  "freshnessSlo": "PT15M",
  "qualityStatus": "passed",
  "status": "published"
}
```

`published` 前必须完成 Owner、Schema、分类、用途、质量、SLA、血缘、保留和权限策略校验。底层 Dataset 不得因出现在目录中而自动获得查询权限。

### 10.3 权限申请与授权

```json
{
  "subjectType": "api_client",
  "subjectId": "client_crm_test",
  "dataProductId": "dp_org_directory",
  "apiVersion": "v1",
  "purpose": "directory_sync",
  "fields": ["employeeId", "displayName", "departmentId", "employmentStatus"],
  "rowScope": { "legalEntity": ["unionclin_cn"] },
  "environment": "test",
  "expiresAt": "2026-12-31T15:59:59Z",
  "requestedQuota": { "requestsPerMinute": 60 }
}
```

目录 Data Product 只用于目录消费，不作为人员禁用和实时授权真源；后者来自 HR/Project 同步与 Authorization Service。员工字段属于个人信息，需 Data Owner/Privacy 批准，未批准时使用合成数据。

批准后生成不可超出申请范围的 `AccessGrant`。授权必须可吊销并到期自动失效，策略缓存不得使吊销超过安全 SLA。

### 10.4 API 认证与数据策略

机器调用使用 Keycloak Client Credentials；每个应用、外部主体和环境使用独立 Client。Token 至少校验 `iss`、`aud`、`exp`、`client_id/azp` 和 `scope`，外部场景按策略叠加 mTLS、IP 和合同/审批上下文。

```text
Gateway：Token、Audience、Scope、网络、限流、配额
Authorization Service：主体、资源、动作、用途、环境、期限
Data Service：Data Contract、字段白名单、行级过滤、动态脱敏
Query Engine：只读、Dataset/Table/Row/Column 强制策略
```

禁止任意 SQL、任意字段透传、无限制下载和从 Bronze 直接提供 API。响应必须携带 `X-Youlin-Request-Id`、W3C `traceparent`、API 版本和数据新鲜度；不得暴露内部表名、对象 Key 或查询引擎信息。

### 10.5 API 生命周期与错误

生命周期为 `draft → testing → reviewing → published → deprecated → retired`。破坏性变更提升主版本并提供迁移窗口。

数据/API 专用错误至少包括：

| HTTP | code | 含义 |
| ---: | --- | --- |
| 401 | `API_CLIENT_UNAUTHENTICATED` | Client/Token 无效 |
| 403 | `DATA_PURPOSE_DENIED` | 用途不被允许 |
| 403 | `DATA_SCOPE_DENIED` | 字段、行或环境超范围 |
| 403 | `ACCESS_GRANT_EXPIRED` | 授权已过期/撤销 |
| 409 | `DATA_CONTRACT_MISMATCH` | 契约或 Schema 不兼容 |
| 429 | `API_QUOTA_EXCEEDED` | 超过配额/并发 |
| 503 | `DATA_PRODUCT_STALE` | 数据新鲜度低于阻断阈值 |
| 503 | `DATA_QUALITY_BLOCKED` | 质量门禁阻断发布/服务 |

### 10.6 审计

每次调用记录 `sub/clientId`、Data Product/API/版本、Scope、purpose、字段和行范围摘要、Policy/AccessGrant 版本、脱敏策略、返回数量/字节、状态、延迟、来源 IP、Trace ID 和时间。完整敏感响应不得写入普通日志。

详细治理边界见[湖仓与 API 治理蓝图](./10-lakehouse-data-platform-and-api-governance.md)。

## 11. 任务、通知、评审与反馈契约

### 11.1 统一任务投影

各模块向工作中心发布任务投影，不把 Youlin 任务表当作正式业务终态：

```json
{
  "taskId": "task_xxx",
  "sourceSystem": "knowledge-governance",
  "sourceTaskId": "review_xxx",
  "taskType": "knowledge_review",
  "title": "审核员工制度知识发布",
  "assigneeType": "user",
  "assigneeId": "user_xxx",
  "projectId": null,
  "riskLevel": "medium",
  "status": "pending",
  "dueAt": "2026-08-08T08:00:00Z",
  "targetUrl": "/reviews/review_xxx",
  "version": 3
}
```

源系统继续拥有任务状态；投影更新需要版本、幂等和对账。泛微正式审批只显示摘要/深链接或经批准 API 投影。

### 11.2 通知

通知包含稳定事件 ID、收件人、模板版本、渠道、去重键、敏感等级和目标链接。站内通知为基线，企业微信/邮件通过 Adapter 发送；重试不得产生通知风暴，敏感正文不直接放入外部渠道。

### 11.3 统一评审

Capability、Knowledge、Memory Promotion、Data/API Access 使用公共 Review 外壳，但领域服务拥有决定规则。评审记录提交人、Reviewer/Candidate、职责分离、风险、版本、意见、决定、SLA 和关联对象；高风险提交者不得批准自己。

### 11.4 反馈与支持

```json
{
  "feedbackId": "fb_xxx",
  "type": "citation_error",
  "subjectRef": { "type": "agent_run", "id": "run_xxx" },
  "traceId": "trace_xxx",
  "reporterUserId": "user_xxx",
  "classification": "internal",
  "status": "open",
  "ownerTeam": "knowledge-ops"
}
```

反馈支持分类、指派、评论、处理结果和用户通知；普通支持人员只能看到排障必要字段，不因工单自动获得敏感业务内容。

### 11.5 评审原子性与任务一致性

- Review 绑定对象 ID、确定版本、内容 Hash、提交者和策略版本；审批时重新校验资格、职责分离和 expectedVersion；修改内容必须重新提交。
- 领域状态变更与 Outbox 同事务提交；重复审批返回同一决定，冲突返回 409，不能先显示批准再异步遗漏授权。
- 任务投影以 `(sourceSystem, sourceTaskId)` 唯一，按源版本防乱序覆盖；通知以 `(eventId, recipientId, channel, templateVersion)` 去重。
- 队列至少一次投递，副作用依靠幂等而非承诺 exactly-once；取消只能表达请求，Provider 确认后才能显示 cancelled，超时且执行结果未知时进入人工对账。
- 所有 targetUrl/callbackUrl 从登记的白名单解析，禁止客户端注入任意地址；收件人权限在发送前复核，正文最小化。

## 12. 回调安全

所有 Webhook：

```http
X-Youlin-Webhook-Id: webhook_xxx
X-Youlin-Timestamp: 1789115400
X-Youlin-Signature: v1=<hmac_sha256>
```

接收方必须：

1. 验证签名；
2. 验证时间偏差不超过配置窗口；
3. 按 Webhook ID 去重；
4. 先落原始事件，再异步处理；
5. 返回成功后不依赖供应商重复投递作为唯一恢复机制；
6. 对关键终态执行反查确认。

## 13. 可观测性与审计

每次集成调用至少记录：

- request/trace/correlation ID；
- actor、service、workspace、project、study；
- Adapter 和外部平台版本；
- 资源 ID、操作、状态、耗时和重试次数；
- 输入输出摘要及 Hash，不默认记录敏感全文；
- Token/费用；
- 权限决策和策略版本；
- 审批 ID；
- 外部请求 ID；
- 错误码和降级动作。

日志、Trace 与合规审计分开存储。可观测日志可以采样，合规审计不得因采样丢失。

## 14. SLO 候选

| 能力 | P95 | 可用性目标 | 备注 |
| --- | ---: | ---: | --- |
| 资源列表/详情 | ≤ 2 秒 | 99.9% | 不含文件正文传输 |
| 预签名上传/下载授权 | ≤ 1 秒 | 99.9% | 每次重新鉴权 |
| 普通文件预览就绪 | 5 分钟内完成 95% | 99.0% | 按格式和大小分层 |
| Tool 只读同步调用 | ≤ 3 秒 | 99.9% | 不含源系统长查询 |
| RAG 检索 | ≤ 5 秒 | 99.5% | 不含首次摄取 |
| Dify Workflow 创建 | ≤ 2 秒 | 99.5% | 执行异步 |
| BPM 发起审批 | ≤ 3 秒 | 99.9% | BPM 为终态真源 |
| 文档摄取 | 15 分钟内完成 95% | 99.0% | 按文件规模分层 |

最终目标需通过真实容量测试确认；本表为候选而非已批准 SLA。必须冻结样本规模、并发、统计窗口、依赖计入方式及失败计数；BPM 指标仅用于后续阶段，MVP 不以其为发布门禁。

## 15. 版本与兼容

- URL 只表达主版本；
- Schema 增加可选字段属于向后兼容；
- 删除/重命名字段、改变语义必须升主版本；
- Tool、Workflow、Parser Profile 独立版本化；
- 生产执行必须记录解析到的确定版本；
- 废弃接口至少经历“公告 → 双写/双读 → 停用”周期；
- Adapter 不直接向业务层泄露供应商私有字段。

## 16. 契约测试

每个 Adapter 必须具备：

1. Provider 接口单元测试；
2. 请求/响应 Schema 测试；
3. 鉴权、越权、跨 Workspace/团队/项目/个人资源隔离测试；
4. OSS 预签名 URL、上传完成、版本、分享、回收站、删除和对象/元数据/索引对账测试；
5. 个人通用/项目私有/项目共享记忆、跨项目隔离、Promotion、删除、导出和停用测试；
6. Project Membership/Facet、PM/管理层视图、Audience 和离项回收测试；
7. Runtime Context 权限交集、策略解释、缓存失效和 Graph/Search 侧信道测试；
8. 产出物来源、受众、个人记忆标识、版本、TTL 和归档测试；
9. 幂等和重复回调测试；
10. 任务投影版本/对账、通知去重、评审职责分离、反馈/Trace 支持和 Feature Flag 服务端测试；
11. 超时、429、5xx、断流和重试测试；
12. 外部沙箱环境集成测试；
13. 脱敏和审计字段测试；
14. 版本兼容测试；
15. 供应商升级前的回归测试套件。

## 17. 待确认事项

- RAGFlow、Dify、BPM 的准确版本和部署拓扑；
- 已选泛微的正式审批接口、版本与组织同步能力；电子签名仅在后续受控范围核验；
- 事件总线选型及消息保留策略；
- 现有企业 Model Gateway 的产品、部署区域、OpenAI/阿里云百炼路由和数据控制；
- 新人新事、泛微、自研 CRM、医渡定制 CTMS/eTMF/EDC/IWRS、用友及 QMS/LMS/PV 的版本、接口能力、部署和合同限制；
- 数据不出境基线下允许进入 Dify/RAGFlow/模型网关的数据等级与字段白名单；
- 企业 OSS 产品、地域、Bucket 分区、加密、版本化、对象锁、备份、配额和成本；
- Office/PDF 预览转换、恶意文件扫描、OCR 和音视频转码组件；
- 资源、个人/项目共享记忆、Context Snapshot、产出物、回收站和临时文件的保留/删除策略；
- Project/Membership 权威源、Context Facet、Purpose/Audience、Promotion、离项回收和缓存失效策略；
- 我的任务与泛微待办、通知渠道、统一评审、反馈支持和 Feature Flag/Entitlement 契约；
- SLO、容量、灾备等级和 RTO/RPO。
