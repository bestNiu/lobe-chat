# K03：可靠事件、异步任务与审计

> contractStatus: draft · 版本 0.1 · 候选 Owner：SRE Lead（待实名）
> 设计/评审目标：W4 设计与真实骨架；决策阻断：D07/D13/D14。

## 1. 生产者与消费者

- 生产者：M01-007/011/012，均为原有 Spec，合同编号不新增工作包。
- 消费者：全部领域模块、通知与集成。
- 依据：[统一基线](../../04-unified-baseline-and-decision-register.md)、[通用契约](../../../06-integration-contracts.md)、[架构](../../../18-application-and-technical-architecture.md)。

本稿为可评审的逻辑合同，不是已批准 OpenAPI/数据库 Schema，也不假设供应商部署版本具备所有能力。Mock 可用于消费者开发，真实 AC 必须用实际接口签收。

首批[可执行子集与合成测试](./executable/README.md)已加入一种主体禁用 CloudEvents 应用剖面；[Spike C](../../08-implementation-readiness-and-spikes.md)验证真实私有队列/事务/审计，当前未执行。事件结构正确不证明可靠投递或源认证。

## 2. 逻辑类型与不变量

- CloudEvents 1.0：specversion="1.0"，id/source/type 必填；time/subject/datacontenttype/dataschema 按版本合同明确，data 使用最小业务字段或受控引用。
- 扩展字段候选：workspaceid、aggregateversion、schemaversion、correlationid、causationid、traceparent；字段名使用协议允许字符。Token/Secret 不进入消息。
- Outbox 与业务变更同事务；Inbox 唯一键 consumer+source+eventId；业务 aggregateVersion 独立于投递重试次数。
- Job：id/type/owner/scope/state/attempt/lease/deadline/idempotencyKey/resultRef；state 区分 queued/running/cancel_requested/cancelled/succeeded/failed/unknown。
- AuditEvent 与运行日志分开，追加写、独立读写身份、受保护归档/检查点；Hash 链不单独构成防篡改证明。

字段需在下一轮补必填/可空、长度、枚举、UTC 时间、整数范围和跨 Scope 约束；未知值不能默认为允许。分类/保留按 D13 批准，不能自行填统一年限。

## 3. 操作与响应语义

| 操作候选 | 输入边界 | 输出/副作用 |
| --- | --- | --- |
| publishDomainEvent | 已提交的 Outbox 记录 | 至少一次；发送 Ack 丢失可以重投 |
| consume | source/id、版本、当前执行权限 | 本地副作用与 Inbox 同事务；外部副作用依靠目标幂等/回执 |
| cancelJob | 当前授权、Job ID、expectedVersion | cancel_requested，后端确认后才 cancelled；不逆转已发生副作用 |
| replayDeadLetter | 受限管理员、理由、事件范围 | 重验当前授权、版本与幂等；保留原事件身份 |
| append/queryAudit | 领域决定或受权查询 | 持久证据；查询/导出权限独立，关键审计不采样 |

操作名不是最终 URL。跨系统 OpenAPI/JSON Schema，内部接口仍须运行时输入校验；后续需映射现有 Router/Provider 并提供正负向夹具。规范头为 X-Youlin-Request-Id 与 traceparent；actor/Scope/Purpose 不因出现在 Header 而可信。

统一错误信封：`{requestId,error:{code,message,retryable,details}}`。无有效身份 401；无权且不可发现对象统一 404；版本/幂等冲突 409；无效输入 422；限流 429；依赖不可用按网关语义返回且不泄漏内部细节。是否可重试取决于动作/回执，不能只看 HTTP 状态。

## 4. 一致性、授权与失败

乱序事件按源版本拒绝倒退；缺版本时使用源查询/对账，不按接收时间猜终态。持久化审计失败的高风险动作拒绝。可靠审计暂存后归档失败可重试，但容量/超时策略须批准。源业务状态与任务投影分开，不承诺跨数据库 ACID 或 exactly-once。

写操作幂等键绑定 workspace+actor/service+operation+canonicalPayloadHash，同键异参数冲突；并发变更 expectedVersion。内部事件采用 K03 合同，发布业务事实与 Outbox 同事务，不信任陈旧消息内的授权快照。

## 5. 必须通过的合同测试

- 禁公网出口、进程崩溃、重复投递 → 私有链可恢复且不重复业务。
- 网络超时后外部副作用未知 → unknown/对账，不盲目再次执行。
- 审计删除/修改、整链重写企图 → 独立权限拒绝或检查点检测。
- 队列中待执行任务已撤权 → 执行/输出重新鉴权拒绝。

上述为测试要求，未执行。每个测试补明确 actor/Scope、输入 Schema、状态/错误断言、审计/事件与清理；供应商能力用真实部署版本验证，不能仅 Mock 通过。

## 6. 批准、迁移与运行缺口

- 单一实名 A 与生产者/消费者 Reviewer；关联决策批准证据。
- 完整可执行合同、Provider capability 声明与兼容矩阵仍待补；已有单种禁用事件 draft Schema 与合成夹具，未实现 Outbox/Inbox、Job、Broker 或审计存储。
- 具体配额/TTL/超时/重试/SLO/保留及生效时间由对应 D 决策冻结。
- expand/migrate/contract；破坏性 API/事件并行版本迁移，不在原版本静默改变权限语义。
- 回退保留当前 deny/删除账本、不可变版本与审计；控制面回滚不恢复被撤销授权。
- 观测至少 request/trace/job/run、决定/版本、结果与耗时，不收集不必要原文；Runbook 写清拒绝/未知/降级/恢复与 Owner。

[返回合同目录](./README.md) · [Spec 工作区](../README.md)
