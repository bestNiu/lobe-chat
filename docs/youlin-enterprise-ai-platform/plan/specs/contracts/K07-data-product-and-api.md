# K07：Data Product、内部 API 与行列授权

> contractStatus: draft · 版本 0.1 · 候选 Owner：Data Owner（待实名）
> 设计/评审目标：W6 设计；W18 真实 API；决策阻断：D08/D10/D13/D14。

## 1. 生产者与消费者

- 生产者：M09-001～012，均为原有 Spec，合同编号不新增工作包。
- 消费者：内部客户端、Context C2、数据/API 中心。
- 依据：[统一基线](../../04-unified-baseline-and-decision-register.md)、[通用契约](../../../06-integration-contracts.md)、[架构](../../../18-application-and-technical-architecture.md)。

本稿为可评审的逻辑合同，不是已批准 OpenAPI/数据库 Schema，也不假设供应商部署版本具备所有能力。Mock 可用于消费者开发，真实 AC 必须用实际接口签收。

批次 4 逐项设计见 [M09 数据/API](../M09/README.md)。[产品契约](../M09/SPEC-M09-006.md)先行供[质量/血缘](../M09/SPEC-M09-011.md)定义规则，实际激活须收齐候选快照与质量证据；[API](../M09/SPEC-M09-007.md)每页和缓存命中均重验 Grant，行列/脱敏在数据面执行。逻辑合同不代表源字段、技术栈或内部 Consumer 已获批准。

## 2. 逻辑类型与不变量

- DataProductVersion：source/snapshot/schema/contractVersion、Owner、分类、qualityResult、freshness、lineage、purpose 与发布状态。
- AccessGrant：client/actor、productVersionRange、fields、rowScope、maskPolicy、purpose、expiry、policyVersion；不允许 consumer 自增权限。
- QueryRequest：产品 ID、白名单过滤/排序/分页、用途；不接受任意 SQL、表名或查询引擎凭据。
- ResponseMetadata：productVersion、snapshot/observedAt、quality/freshness、policyDecision、requestId；不对无权对象泄漏元数据。
- 资源与湖仓 Bucket/账号/KMS/保留隔离；目录可发现权不等于取数权。

字段需在下一轮补必填/可空、长度、枚举、UTC 时间、整数范围和跨 Scope 约束；未知值不能默认为允许。分类/保留按 D13 批准，不能自行填统一年限。

## 3. 操作与响应语义

| 操作候选 | 输入边界 | 输出/副作用 |
| --- | --- | --- |
| discover/requestAccess | 当前身份、产品引用、用途/字段 | 最小目录与权限申请，审批绑定确切范围 |
| approve/revokeGrant | Data Owner 决定、expectedVersion | 持久范围/期限；撤销后 API 立即拒绝新请求 |
| queryProduct | aud/scope 正确的 Token、当前 Grant | Internal Gateway→PEP→Data Service→Gold；行列/脱敏必须数据面执行 |
| validateContract/publish | Schema/质量/血缘证据 | 破坏性变化阻断，版本兼容与弃用窗口独立批准 |

操作名不是最终 URL。跨系统 OpenAPI/JSON Schema，内部接口仍须运行时输入校验；后续需映射现有 Router/Provider 并提供正负向夹具。规范头为 X-Youlin-Request-Id 与 traceparent；actor/Scope/Purpose 不因出现在 Header 而可信。

统一错误信封：`{requestId,error:{code,message,retryable,details}}`。无有效身份 401；无权且不可发现对象统一 404；版本/幂等冲突 409；无效输入 422；限流 429；依赖不可用按网关语义返回且不泄漏内部细节。是否可重试取决于动作/回执，不能只看 HTTP 状态。

## 4. 一致性、授权与失败

MVP 仅一个批准低敏内部只读产品，禁止任何外部生产消费者。无 Token/错 aud/scope/过期 Grant/未批字段分别拒绝。质量失败或过期按合同阻断或显式陈旧，不能静默用旧数据冒充当前。源人员目录不反向授权员工访问。

写操作幂等键绑定 workspace+actor/service+operation+canonicalPayloadHash，同键异参数冲突；并发变更 expectedVersion。内部事件采用 K03 合同，发布业务事实与 Outbox 同事务，不信任陈旧消息内的授权快照。

## 5. 必须通过的合同测试

- 授权字段外请求、行过滤逃逸、未知过滤字段 → 拒绝且不回显 SQL。
- 同 Client 不同业务 actor/Grant → 权限隔离，服务身份不扩大用户范围。
- 数据质量失败/源陈旧 → 合同规定状态而非成功假数据。
- API 响应能追到源快照/转换/策略版本；外部消费者生产凭证申请 → 拒绝。

上述为测试要求，未执行。每个测试补明确 actor/Scope、输入 Schema、状态/错误断言、审计/事件与清理；供应商能力用真实部署版本验证，不能仅 Mock 通过。

## 6. 批准、迁移与运行缺口

- 单一实名 A 与生产者/消费者 Reviewer；关联决策批准证据。
- 可执行 Schema、Provider capability 声明、合同测试夹具与兼容矩阵；当前均未交付。
- 具体配额/TTL/超时/重试/SLO/保留及生效时间由对应 D 决策冻结。
- expand/migrate/contract；破坏性 API/事件并行版本迁移，不在原版本静默改变权限语义。
- 回退保留当前 deny/删除账本、不可变版本与审计；控制面回滚不恢复被撤销授权。
- 观测至少 request/trace/job/run、决定/版本、结果与耗时，不收集不必要原文；Runbook 写清拒绝/未知/降级/恢复与 Owner。

[返回合同目录](./README.md) · [Spec 工作区](../README.md)
