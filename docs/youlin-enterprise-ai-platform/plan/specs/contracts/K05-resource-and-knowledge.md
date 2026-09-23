# K05：资源版本、安全访问与知识发布

> contractStatus: draft · 版本 0.1 · 候选 Owner：Resource Owner（待实名）
> 设计/评审目标：W6～W7 设计；W11 Resource API；W15 知识；决策阻断：D04/D05/D13。

## 1. 生产者与消费者

- 生产者：M06-001～012、M07-001～005/008/009，均为原有 Spec，合同编号不新增工作包。
- 消费者：知识/记忆/引用/Agent 产出物/搜索。
- 依据：[统一基线](../../04-unified-baseline-and-decision-register.md)、[通用契约](../../../06-integration-contracts.md)、[架构](../../../18-application-and-technical-architecture.md)。

本稿为可评审的逻辑合同，不是已批准 OpenAPI/数据库 Schema，也不假设供应商部署版本具备所有能力。Mock 可用于消费者开发，真实 AC 必须用实际接口签收。

## 2. 逻辑类型与不变量

- ResourceObject 与不可变 ResourceVersion 分离；versionRef/hash/storageRef/size/MIME/scanStatus/classification/owner/scope 必须可追溯。
- UploadSession：scope/limits/quarantineKey/expiry/status/expectedHash；服务器 complete 检查实际对象，不信任客户端 declared MIME/大小。
- ShareGrant：principal/actions/expiry/sourceGrant/versionPolicy；撤销不试图回收已下载内容。
- KnowledgeRelease：精确 ResourceVersion 集合、Provider 配置版本、ACL 元数据、评审、质量结果、activePointer。
- CitationRef：resourceId/versionId/pageOrSection/chunkRef/releaseId；打开时实时授权，不发永久裸 OSS 链接。

字段需在下一轮补必填/可空、长度、枚举、UTC 时间、整数范围和跨 Scope 约束；未知值不能默认为允许。分类/保留按 D13 批准，不能自行填统一年限。

## 3. 操作与响应语义

| 操作候选 | 输入边界 | 输出/副作用 |
| --- | --- | --- |
| initiateUpload/completeUpload | 目标库、声明信息、配额、幂等键 | 隔离上传许可；扫描/校验后才创建可用版本 |
| preview/download/range | 当前主体、resourceVersion | 实时鉴权代理；请求复核，私有响应 no-store |
| move/share/revoke/delete | expectedVersion、目标范围、当前授权 | 不扩大来源 Audience，删除先封禁再清派生 |
| publishKnowledge | 确定版本、Review 决定、用途 | publishing→质量通过→原子激活；失败旧有效发布仍可用 |
| retrieve/cite | K02 预过滤条件、查询、当前主体 | 授权版本集合内检索、重排/计数；引用复核 |

操作名不是最终 URL。跨系统 OpenAPI/JSON Schema，内部接口仍须运行时输入校验；后续需映射现有 Router/Provider 并提供正负向夹具。规范头为 X-Youlin-Request-Id 与 traceparent；actor/Scope/Purpose 不因出现在 Header 而可信。

统一错误信封：`{requestId,error:{code,message,retryable,details}}`。无有效身份 401；无权且不可发现对象统一 404；版本/幂等冲突 409；无效输入 422；限流 429；依赖不可用按网关语义返回且不泄漏内部细节。是否可重试取决于动作/回执，不能只看 HTTP 状态。

## 4. 一致性、授权与失败

普通预签名用于隔离上传/批准服务间传输，不承诺可撤销普通下载签名。扫描/转换无不必要出站并设格式/资源上限；Markdown 不执行脚本。Legal Hold 阻止 purge 但不授予读权；恢复先重放删除/撤销账本。知识索引非事实真源，上传不自动进 RAG。

写操作幂等键绑定 workspace+actor/service+operation+canonicalPayloadHash，同键异参数冲突；并发变更 expectedVersion。内部事件采用 K03 合同，发布业务事实与 Outbox 同事务，不信任陈旧消息内的授权快照。

## 5. 必须通过的合同测试

- MIME 伪装、超限、压缩炸弹、重复 complete → 隔离/拒绝且无半成品发布。
- 分享撤销后旧 URL/Range/引用 → 实时代理拒绝；另证明裸签名残留风险。
- 同 KB 不同 ACL → 无权内容不进召回/重排/计数。
- 索引摄取失败/切换中断 → 旧有效发布仍可用；派生物对账可重建。

上述为测试要求，未执行。每个测试补明确 actor/Scope、输入 Schema、状态/错误断言、审计/事件与清理；供应商能力用真实部署版本验证，不能仅 Mock 通过。

## 6. 批准、迁移与运行缺口

- 单一实名 A 与生产者/消费者 Reviewer；关联决策批准证据。
- 可执行 Schema、Provider capability 声明、合同测试夹具与兼容矩阵；当前均未交付。
- 具体配额/TTL/超时/重试/SLO/保留及生效时间由对应 D 决策冻结。
- expand/migrate/contract；破坏性 API/事件并行版本迁移，不在原版本静默改变权限语义。
- 回退保留当前 deny/删除账本、不可变版本与审计；控制面回滚不恢复被撤销授权。
- 观测至少 request/trace/job/run、决定/版本、结果与耗时，不收集不必要原文；Runbook 写清拒绝/未知/降级/恢复与 Owner。

[返回合同目录](./README.md) · [Spec 工作区](../README.md)
