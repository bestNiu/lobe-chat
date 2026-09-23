# K02：Project、Membership、ACL 与统一授权

> contractStatus: draft · 版本 0.1 · 候选 Owner：Security Lead（待实名）
> 设计/评审目标：W4 设计；W7 真实 PDP；决策阻断：D03/D10/D13。

## 1. 生产者与消费者

- 生产者：M03-003～010，均为原有 Spec，合同编号不新增工作包。
- 消费者：全部业务 API、Worker、检索、Tool 和输出。
- 依据：[统一基线](../../04-unified-baseline-and-decision-register.md)、[通用契约](../../../06-integration-contracts.md)、[架构](../../../18-application-and-technical-architecture.md)。

本稿为可评审的逻辑合同，不是已批准 OpenAPI/数据库 Schema，也不假设供应商部署版本具备所有能力。Mock 可用于消费者开发，真实 AC 必须用实际接口签收。

## 2. 逻辑类型与不变量

- ScopeRef：workspaceId 必填，projectId 可空；企业与 Workspace 不等同。所有跨对象 FK 检查复合 Scope。
- Membership：project/user/roles/workstream/dataScope、有效期、status、version；workstream 不是 Workflow。
- ResourceRef：type/id/version（若动作需要确定版本）；资源状态/分类与 ACL 一起判断。
- Action：view/use/edit/manage/publish/share/download 等显式枚举，未知 action 默认拒绝。
- PolicyDecision：id/outcome、policyVersion、subjectEpoch、membershipVersion、sourceVersions、obligations、expiry、受限 reasonCode；Hash 不是访问凭证。

字段需在下一轮补必填/可空、长度、枚举、UTC 时间、整数范围和跨 Scope 约束；未知值不能默认为允许。分类/保留按 D13 批准，不能自行填统一年限。

## 3. 操作与响应语义

| 操作候选 | 输入边界 | 输出/副作用 |
| --- | --- | --- |
| authorize | 服务端主体、动作、对象、核验后的 Purpose/Audience | deny 或 allow+obligations；PEP 不支持义务必须拒绝 |
| buildAuthorizedFilter | 查询目标类型、主体与范围 | 数据源可执行的预过滤约束；不能以巨大无界 ID 列表假装可扩展 |
| mutateMembership/ACL | 当前权限、expectedVersion、幂等键、目标范围 | 事务更新版本和撤销事实；事件异步驱动投影 |
| explainDecision | 决策 ID、当前查看者 | 脱敏原因；不披露无权名称/数量/关系 |

操作名不是最终 URL。跨系统 OpenAPI/JSON Schema，内部接口仍须运行时输入校验；后续需映射现有 Router/Provider 并提供正负向夹具。规范头为 X-Youlin-Request-Id 与 traceparent；actor/Scope/Purpose 不因出现在 Header 而可信。

统一错误信封：`{requestId,error:{code,message,retryable,details}}`。无有效身份 401；无权且不可发现对象统一 404；版本/幂等冲突 409；无效输入 422；限流 429；依赖不可用按网关语义返回且不泄漏内部细节。是否可重试取决于动作/回执，不能只看 HTTP 状态。

## 4. 一致性、授权与失败

权限是用户/服务受限 Grant、Agent、当前成员、资源/数据、Tool、Purpose/Audience、环境/时间的交集。管理平台配置不等于读全部业务正文。PDP 可先模块内实现；接口与策略测试优先于引擎采购。授权缓存命中仍检查当前版本；撤权先拒绝访问、后清理索引。历史 asOf 不能恢复旧权限。

写操作幂等键绑定 workspace+actor/service+operation+canonicalPayloadHash，同键异参数冲突；并发变更 expectedVersion。内部事件采用 K03 合同，发布业务事实与 Outbox 同事务，不信任陈旧消息内的授权快照。

## 5. 必须通过的合同测试

- 两部门/两项目同名资源 → 猜 ID、批量、导出、补全和计数均隔离。
- view-only → download/share 拒绝；过期委托或其来源撤销 → 立即不再授权。
- 数据源不支持预过滤 → 拆权限域或拒绝，不能召回后过滤交差。
- 无法确认最新策略状态 → 受保护操作失败而非使用过期 allow。

上述为测试要求，未执行。每个测试补明确 actor/Scope、输入 Schema、状态/错误断言、审计/事件与清理；供应商能力用真实部署版本验证，不能仅 Mock 通过。

## 6. 批准、迁移与运行缺口

- 单一实名 A 与生产者/消费者 Reviewer；关联决策批准证据。
- 可执行 Schema、Provider capability 声明、合同测试夹具与兼容矩阵；当前均未交付。
- 具体配额/TTL/超时/重试/SLO/保留及生效时间由对应 D 决策冻结。
- expand/migrate/contract；破坏性 API/事件并行版本迁移，不在原版本静默改变权限语义。
- 回退保留当前 deny/删除账本、不可变版本与审计；控制面回滚不恢复被撤销授权。
- 观测至少 request/trace/job/run、决定/版本、结果与耗时，不收集不必要原文；Runbook 写清拒绝/未知/降级/恢复与 Owner。

[返回合同目录](./README.md) · [Spec 工作区](../README.md)
