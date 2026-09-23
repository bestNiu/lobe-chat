# K01：身份、服务主体与撤销

> contractStatus: draft · 版本 0.1 · 候选 Owner：Identity Lead（待实名）
> 设计/评审目标：W3 设计；W5 真实接口；决策阻断：D01/D02/D10。

## 1. 生产者与消费者

- 生产者：M02-001～009、M03-001/009，均为原有 Spec，合同编号不新增工作包。
- 消费者：M3/M4/M5/M6/M9/M10/M11。
- 依据：[统一基线](../../04-unified-baseline-and-decision-register.md)、[通用契约](../../../06-integration-contracts.md)、[架构](../../../18-application-and-technical-architecture.md)。

本稿为可评审的逻辑合同，不是已批准 OpenAPI/数据库 Schema，也不假设供应商部署版本具备所有能力。Mock 可用于消费者开发，真实 AC 必须用实际接口签收。

## 2. 逻辑类型与不变量

- AuthenticatedSubject：userId 或 servicePrincipalId、issuer/sub、workspaceId、sessionRef、authEpoch；仅认证中间件构造，不从 body 反序列化为可信主体。
- IdentityLink：unique(issuer,sub)；external identity 额外带 provider/corpId；当前法人代码+employeeId 锚点唯一，历史任职单列。
- RevocationState：subjectId、monotonicEpoch、disabled、sourceVersion、effectiveAt、reason；撤销版本不可回退。
- DelegatedContext：runId、actorRef、purpose、project（可空）、audience、grantRef、expiry；由可信服务查 Run/Grant 或经批准 Token Exchange 派生。
- aud 是 OAuth 目标服务；业务 audience 是输出接收人集合，禁止混用。

字段需在下一轮补必填/可空、长度、枚举、UTC 时间、整数范围和跨 Scope 约束；未知值不能默认为允许。分类/保留按 D13 批准，不能自行填统一年限。

## 3. 操作与响应语义

| 操作候选 | 输入边界 | 输出/副作用 |
| --- | --- | --- |
| resolveIdentity | 已验证 issuer/sub | userId 或 unbound/conflict；不返回任意人员候选给普通用户 |
| authenticateRequest | Cookie/Token 与目标服务 | 校验 iss/aud/exp/签名后检查 Session/epoch，输出认证主体 |
| revokeSubject/revokeSession | 受权管理员/可信 HR 事件、expectedVersion、理由 | 持久 deny+审计+Outbox；IdP 注销异步失败不解除平台阻断 |
| resolveWorkloadGrant | 服务身份、Run/Grant 引用 | 限时用途和范围；无 Grant 不以服务角色兜底 |
| logout | 当前会话与 CSRF 防护 | 注销会话、清理客户端凭据；全局注销为独立授权操作 |

操作名不是最终 URL。跨系统 OpenAPI/JSON Schema，内部接口仍须运行时输入校验；后续需映射现有 Router/Provider 并提供正负向夹具。规范头为 X-Youlin-Request-Id 与 traceparent；actor/Scope/Purpose 不因出现在 Header 而可信。

统一错误信封：`{requestId,error:{code,message,retryable,details}}`。无有效身份 401；无权且不可发现对象统一 404；版本/幂等冲突 409；无效输入 422；限流 429；依赖不可用按网关语义返回且不泄漏内部细节。是否可重试取决于动作/回执，不能只看 HTTP 状态。

## 4. 一致性、授权与失败

账号禁用先完成平台 deny 持久化，之后调用 Keycloak。PEP 每次受保护动作核验当前状态；不能以 JWT 未到期或缓存可用放行。状态存储不可确认时 fail-closed。旧入职/刷新事件不得覆盖较新的禁用版本。身份重新启用需新决定，不恢复旧 Session。

写操作幂等键绑定 workspace+actor/service+operation+canonicalPayloadHash，同键异参数冲突；并发变更 expectedVersion。内部事件采用 K03 合同，发布业务事实与 Outbox 同事务，不信任陈旧消息内的授权快照。

## 5. 必须通过的合同测试

- 双入口同员工 → 同 userId，个人资源不重复。
- 错 aud/nonce、回调重放、员工号冲突 → 拒绝或裁决，不自动绑定。
- Keycloak 宕机或失效队列积压 → 已禁用主体仍无法用旧 Cookie/JWT/Refresh/Worker 访问。
- 服务 Token 无用户委托/Workload Grant → 不能访问用户私有资源。

上述为测试要求，未执行。每个测试补明确 actor/Scope、输入 Schema、状态/错误断言、审计/事件与清理；供应商能力用真实部署版本验证，不能仅 Mock 通过。

## 6. 批准、迁移与运行缺口

- 单一实名 A 与生产者/消费者 Reviewer；关联决策批准证据。
- 可执行 Schema、Provider capability 声明、合同测试夹具与兼容矩阵；当前均未交付。
- 具体配额/TTL/超时/重试/SLO/保留及生效时间由对应 D 决策冻结。
- expand/migrate/contract；破坏性 API/事件并行版本迁移，不在原版本静默改变权限语义。
- 回退保留当前 deny/删除账本、不可变版本与审计；控制面回滚不恢复被撤销授权。
- 观测至少 request/trace/job/run、决定/版本、结果与耗时，不收集不必要原文；Runbook 写清拒绝/未知/降级/恢复与 Owner。

[返回合同目录](./README.md) · [Spec 工作区](../README.md)
