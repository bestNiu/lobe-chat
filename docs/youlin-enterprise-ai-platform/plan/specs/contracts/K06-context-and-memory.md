# K06：Context C0～C3、记忆与输出

> contractStatus: draft · 版本 0.1 · 候选 Owner：Context Lead（待实名）
> 设计/评审目标：C0 W6；C1 W9/C2 W12/C3 W15 设计评审；决策阻断：D03/D09/D10/D13。

## 1. 生产者与消费者

- 生产者：M10-001～012、M07-006～010、M03-005/006/009，均为原有 Spec，合同编号不新增工作包。
- 消费者：M5/M8/M9/M11 及全部 Agent。
- 依据：[统一基线](../../04-unified-baseline-and-decision-register.md)、[通用契约](../../../06-integration-contracts.md)、[架构](../../../18-application-and-technical-architecture.md)。

本稿为可评审的逻辑合同，不是已批准 OpenAPI/数据库 Schema，也不假设供应商部署版本具备所有能力。Mock 可用于消费者开发，真实 AC 必须用实际接口签收。

C0 具体草案：[模型](../M10/SPEC-M10-001.md)、[Provider](../M10/SPEC-M10-003.md)、[Runtime Package](../M10/SPEC-M10-004.md)、[权限交集](../M10/SPEC-M10-005.md)。这些文件记录 C0 核心和后续边界，不意味着 C1～C3 全部细节已冻结；W10 不签未交付的完整网络/Audience 能力。

C1 具体草案：[个人记忆](../M07/SPEC-M07-006.md)、[Promotion/共享记忆](../M07/SPEC-M07-007.md)、[产出物](../M07/SPEC-M07-008.md)、[生命周期](../M07/SPEC-M07-009.md)。个人来源不因生成新文件而失去 ACL；完整多人输出按 M10 继续细化，早期默认私有。

## 2. 逻辑类型与不变量

- ContextRequest：agentVersion、project（允许 null）、purpose、audience、asOf、tokenBudget、sourceRequirements；actor/workspace/service 来自服务端，客户端字段仅为请求。
- RuntimeContextPackage：id、主体/Agent/Scope、Audience Hash、来源/记忆版本、PolicyDecision、classification/outputScopes、expiry、trace；记录来源不意味着长期读取权。
- PersonalMemory category=general/project_private，后者要求 Project；ProjectMemory 独立共享资产。
- Promotion：个人选择的脱敏草稿、确定版本、审核与新共享记忆引用，不将 Reviewer 授予原私有记忆读取权。
- CacheKey：workspace/actor/service/agentVersion/project/purpose/audienceHash/asOf/sourceVersions/policyAndMembershipVersions。

字段需在下一轮补必填/可空、长度、枚举、UTC 时间、整数范围和跨 Scope 约束；未知值不能默认为允许。分类/保留按 D13 批准，不能自行填统一年限。

## 3. 操作与响应语义

| 操作候选 | 输入边界 | 输出/副作用 |
| --- | --- | --- |
| assemble | 可信主体+ContextRequest | 当前授权预过滤→检索→有效性/预算→有界上下文包 |
| preview/explain | 当前主体、请求或包 ID | 仅解释有权来源与策略类别，不能泄漏无权名称/计数 |
| invalidate | 权威撤销/来源变更与版本 | 新访问先拒绝，异步清 Context/Search/Vector/关系投影 |
| propose/approvePromotion | 脱敏草稿版本、本人确认、职责分离 | 审核后创建共享记录，原私有记录 Owner 不变 |
| commitOutput | Run、当前 Audience、来源与最高分类 | 重新授权；个人记忆输出默认个人，分享/移动需重新评估 |

操作名不是最终 URL。跨系统 OpenAPI/JSON Schema，内部接口仍须运行时输入校验；后续需映射现有 Router/Provider 并提供正负向夹具。规范头为 X-Youlin-Request-Id 与 traceparent；actor/Scope/Purpose 不因出现在 Header 而可信。

统一错误信封：`{requestId,error:{code,message,retryable,details}}`。无有效身份 401；无权且不可发现对象统一 404；版本/幂等冲突 409；无效输入 422；限流 429；依赖不可用按网关语义返回且不泄漏内部细节。是否可重试取决于动作/回执，不能只看 HTTP 状态。

## 4. 一致性、授权与失败

C0 提供主体/Purpose/私有受众/null Project 与 Manifest；C1 加知识/记忆；C2 加数据行列/脱敏；C3 加完整角色视图/Audience/网络/离项。不同切片都有当前授权，不能后补安全。asOf 不恢复历史权限，多人默认交集；服务身份不可扩权，Token/Context 包不能替代读取/Tool/输出的实时 PEP。

写操作幂等键绑定 workspace+actor/service+operation+canonicalPayloadHash，同键异参数冲突；并发变更 expectedVersion。内部事件采用 K03 合同，发布业务事实与 Outbox 同事务，不信任陈旧消息内的授权快照。

## 5. 必须通过的合同测试

- project=null 普通助手 → 可用；伪造 actor/Audience → 不提权。
- PM 读取成员私有记忆/Reviewer 读取未提交正文 → 拒绝。
- Audience 加入无权成员、会话切项目、asOf 选旧事实 → 不泄漏；缓存不能跨 Audience 命中。
- 单人离项 → 旧会话/引用拒绝，其他合法成员共享索引保留。

上述为测试要求，未执行。每个测试补明确 actor/Scope、输入 Schema、状态/错误断言、审计/事件与清理；供应商能力用真实部署版本验证，不能仅 Mock 通过。

## 6. 批准、迁移与运行缺口

- 单一实名 A 与生产者/消费者 Reviewer；关联决策批准证据。
- 可执行 Schema、Provider capability 声明、合同测试夹具与兼容矩阵；当前均未交付。
- 具体配额/TTL/超时/重试/SLO/保留及生效时间由对应 D 决策冻结。
- expand/migrate/contract；破坏性 API/事件并行版本迁移，不在原版本静默改变权限语义。
- 回退保留当前 deny/删除账本、不可变版本与审计；控制面回滚不恢复被撤销授权。
- 观测至少 request/trace/job/run、决定/版本、结果与耗时，不收集不必要原文；Runbook 写清拒绝/未知/降级/恢复与 Owner。

[返回合同目录](./README.md) · [Spec 工作区](../README.md)
