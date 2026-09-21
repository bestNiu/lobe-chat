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

本文是逻辑契约，不等同于某一版本供应商 API。实际接入前必须针对部署版本完成 Adapter 验证。

### 1.1 分阶段实施范围

MVP 1 只实现本契约的最小子集：

- RAGFlow/原生 RAG：企业通用知识摄取、权限检索和引用；
- Dify：一个低风险、固定版本的通用 Workflow；
- Tool Gateway：Registry、Credential、审计和一个只读 Tool；
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
| 用户、Workspace、成员关系 | Youlin/企业 IdP |
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
Idempotency-Key: idem_xxx
```

要求：

- Token 使用短期服务身份，不透传用户长期凭证；
- `workspaceId` 必填，Project/Study 按资源范围填写；
- 写操作必须支持 `Idempotency-Key`；
- 服务端从签名 Token 解析身份，并验证 Header 与 Token 声明一致；
- 不信任客户端直接提交的角色、权限和数据密级。

### 3.3 服务身份声明

JWT/服务令牌最小声明：

```json
{
  "iss": "youlin-auth",
  "aud": "ragflow-adapter",
  "sub": "service:youlin-api",
  "actor": {
    "type": "user",
    "id": "user_xxx"
  },
  "workspaceId": "ws_xxx",
  "projectId": "project_xxx",
  "studyId": "study_xxx",
  "scopes": ["knowledge:search", "document:ingest"],
  "clearance": ["internal", "confidential"],
  "exp": 1789115400,
  "jti": "token_xxx"
}
```

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

## 5. RAGFlow 契约

### 5.1 Provider 接口

```ts
interface KnowledgeProvider {
  createDataset(input: CreateDatasetInput): Promise<DatasetRef>;
  ingestDocument(input: IngestDocumentInput): Promise<JobRef>;
  getJob(jobId: string): Promise<JobStatus>;
  search(input: KnowledgeSearchInput): Promise<KnowledgeSearchResult[]>;
  deleteDocument(input: DeleteDocumentInput): Promise<JobRef>;
}
```

### 5.2 Dataset 映射

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

### 5.3 文档摄取

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

### 5.4 检索

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

Youlin 必须在调用前过滤可访问 Knowledge Base，在返回后再次验证每个文档仍属于当前范围。

## 6. Dify 契约

### 6.1 Provider 接口

```ts
interface WorkflowProvider {
  resolveDefinition(id: string, version: string): Promise<WorkflowDefinition>;
  run(input: RunWorkflowInput): Promise<WorkflowRunRef>;
  stream(runId: string): AsyncIterable<WorkflowEvent>;
  cancel(runId: string): Promise<void>;
  getRun(runId: string): Promise<WorkflowRun>;
}
```

### 6.2 Workflow 注册

Youlin 保存受控注册信息：

```json
{
  "workflowId": "wf_tmf_qc",
  "provider": "dify",
  "externalAppId": "dify_app_xxx",
  "version": "1.3.0",
  "status": "approved",
  "inputSchema": {},
  "outputSchema": {},
  "requiredScopes": ["document:read", "knowledge:search"],
  "riskLevel": "medium",
  "approvalPolicy": "before_external_write",
  "timeoutSeconds": 600
}
```

生产运行只能引用已批准且未撤回的确定版本，不允许自动跟随 Dify 草稿最新版。

### 6.3 运行 Workflow

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

### 6.4 Workflow 事件

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

## 7. BPM 契约

### 7.1 Provider 接口

```ts
interface ApprovalProvider {
  startProcess(input: StartApprovalInput): Promise<ApprovalInstanceRef>;
  getInstance(id: string): Promise<ApprovalInstance>;
  getTasks(input: ListApprovalTasksInput): Promise<ApprovalTask[]>;
  act(input: ApprovalActionInput): Promise<ApprovalActionResult>;
  cancel(input: CancelApprovalInput): Promise<void>;
}
```

### 7.2 启动审批

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

### 7.3 审批动作

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

### 7.4 BPM 回调

```text
approval.instance.started
approval.task.created
approval.task.completed
approval.instance.approved
approval.instance.rejected
approval.instance.cancelled
```

回调必须签名、带时间戳和防重放随机数；Youlin 收到后主动查询 BPM 核验关键终态。

## 8. Tool Gateway 契约

### 8.1 职责

Tool Gateway 统一承担：

- Tool 注册、发现、版本和输入输出 Schema；
- 用户/Agent/Study 范围授权；
- 凭证代理和短期凭证；
- 参数校验、出站策略、SSRF 防护；
- Human-in-the-Loop；
- 调用限流、超时、重试和熔断；
- 输入输出脱敏和全链路审计；
- MCP、HTTP API、Pi Runner 等协议适配。

### 8.2 Tool 定义

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

### 8.3 Tool 调用

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

### 8.4 风险与审批策略

| 风险 | 示例 | 默认策略 |
| --- | --- | --- |
| 低 | 读取已授权里程碑 | 自动执行并审计 |
| 中 | 生成文件、创建草稿 | 可执行，结果需人工确认 |
| 高 | 更新 CTMS、发送邮件 | 执行前明确审批 |
| 禁止 | 删除受控记录、代签 | 策略阻断 |

审批绑定具体 `toolId + version + argumentsHash + actor + resource`。参数改变后旧批准失效。

## 9. 回调安全

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

## 10. 可观测性与审计

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

## 11. SLO 候选

| 能力 | P95 | 可用性目标 | 备注 |
| --- | ---: | ---: | --- |
| Tool 只读同步调用 | ≤ 3 秒 | 99.9% | 不含源系统长查询 |
| RAG 检索 | ≤ 5 秒 | 99.5% | 不含首次摄取 |
| Dify Workflow 创建 | ≤ 2 秒 | 99.5% | 执行异步 |
| BPM 发起审批 | ≤ 3 秒 | 99.9% | BPM 为终态真源 |
| 文档摄取 | 15 分钟内完成 95% | 99.0% | 按文件规模分层 |

最终目标需通过真实容量测试确认。

## 12. 版本与兼容

- URL 只表达主版本；
- Schema 增加可选字段属于向后兼容；
- 删除/重命名字段、改变语义必须升主版本；
- Tool、Workflow、Parser Profile 独立版本化；
- 生产执行必须记录解析到的确定版本；
- 废弃接口至少经历“公告 → 双写/双读 → 停用”周期；
- Adapter 不直接向业务层泄露供应商私有字段。

## 13. 契约测试

每个 Adapter 必须具备：

1. Provider 接口单元测试；
2. 请求/响应 Schema 测试；
3. 鉴权、越权、跨 Study 隔离测试；
4. 幂等和重复回调测试；
5. 超时、429、5xx、断流和重试测试；
6. 外部沙箱环境集成测试；
7. 脱敏和审计字段测试；
8. 版本兼容测试；
9. 供应商升级前的回归测试套件。

## 14. 待确认事项

- RAGFlow、Dify、BPM 的准确版本和部署拓扑；
- BPM 产品、电子签名和组织同步接口；
- 事件总线选型及消息保留策略；
- 现有企业 Model Gateway 的产品、部署区域、OpenAI/阿里云百炼路由和数据控制；
- 新人新事、泛微、自研 CRM、医渡定制 CTMS/eTMF/EDC/IWRS、用友及 QMS/LMS/PV 的版本、接口能力、部署和合同限制；
- 数据不出境基线下允许进入 Dify/RAGFlow/模型网关的数据等级与字段白名单；
- SLO、容量、灾备等级和 RTO/RPO。
