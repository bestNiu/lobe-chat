# K04：能力、插件、评审与执行

> contractStatus: draft · 版本 0.1 · 候选 Owner：AI Lead（待实名）
> 设计/评审目标：W6 骨架；W8 Review 规则；Pi 启用另批；决策阻断：D05/D06/D07/D10/D16。

## 1. 生产者与消费者

- 生产者：M05-001～009、M11-006，均为原有 Spec，合同编号不新增工作包。
- 消费者：Agent/Skill/Tool/Workflow/插件中心、知识和数据评审。
- 依据：[统一基线](../../04-unified-baseline-and-decision-register.md)、[通用契约](../../../06-integration-contracts.md)、[架构](../../../18-application-and-technical-architecture.md)。

本稿为可评审的逻辑合同，不是已批准 OpenAPI/数据库 Schema，也不假设供应商部署版本具备所有能力。Mock 可用于消费者开发，真实 AC 必须用实际接口签收。

## 2. 逻辑类型与不变量

- CapabilityVersion：kind/id/version/owner/manifestHash/dependencies/modelRoute/contextPolicy/risk/status；生产只加载 published 且未 suspended 的确定版本。
- PluginPackage/Version 与 Installation/Binding 分开；绑定 Scope/环境/Secret 引用/权限上限；包安装不授业务权限。
- ReviewRequest：objectRef+version+payloadHash、submitter、reviewer、expectedVersion、decision、expiry；对象改动使旧批准失效。
- AgentRun：parentRunId、actor/service、project/purpose/audience、Registry/Skill/Tool/Workflow/Prompt/model/Context 版本、attempt、usage、outputRefs。
- ExecutionProfile：主编排者、providerVersion、工具上限、deadline、预算、沙箱策略；默认 LobeHub，Dify 固定流程，Pi 可选受控后端。

字段需在下一轮补必填/可空、长度、枚举、UTC 时间、整数范围和跨 Scope 约束；未知值不能默认为允许。分类/保留按 D13 批准，不能自行填统一年限。

## 3. 操作与响应语义

| 操作候选 | 输入边界 | 输出/副作用 |
| --- | --- | --- |
| submitForReview/decide | 对象确定版本、当前主体、职责分离 | 乐观锁决定；审批 UI 不拥有领域发布写权限 |
| activateVersion | 领域 Owner 的批准决定、依赖状态、expectedVersion | 原子更新活动版本；不重写历史 Run |
| invokeTool | toolVersion、inputSchema、actor/Grant、参数 Hash、幂等键 | Gateway 当前授权、输出校验、回执和计量 |
| startExecution | parentRun、Context 引用、输入版本、ExecutionProfile | 返回任务，不代表成功；事件/结果/中止统一映射 |
| suspend/rollback | 当前管理权、影响预览、理由 | 阻断新动作并处置运行中步骤；不能声称收回已产生副作用 |

操作名不是最终 URL。跨系统 OpenAPI/JSON Schema，内部接口仍须运行时输入校验；后续需映射现有 Router/Provider 并提供正负向夹具。规范头为 X-Youlin-Request-Id 与 traceparent；actor/Scope/Purpose 不因出现在 Header 而可信。

统一错误信封：`{requestId,error:{code,message,retryable,details}}`。无有效身份 401；无权且不可发现对象统一 404；版本/幂等冲突 409；无效输入 422；限流 429；依赖不可用按网关语义返回且不泄漏内部细节。是否可重试取决于动作/回执，不能只看 HTTP 状态。

## 4. 一致性、授权与失败

高风险提交人不得自审，批准绑定参数与对象版本。Dify 须验证真正版本固定；不支持则不可变独立部署并记录 DSL Hash。插件依赖漂移、篡改 Digest、升级增权均阻断。Pi 的 SDK/RPC 本身不是沙箱，可执行扩展不得加载进 Web 进程；资源装载、Session、出站与产出物约束沿用 18 号架构，本合同不新增 Pi 生产实现承诺。

写操作幂等键绑定 workspace+actor/service+operation+canonicalPayloadHash，同键异参数冲突；并发变更 expectedVersion。内部事件采用 K03 合同，发布业务事实与 Outbox 同事务，不信任陈旧消息内的授权快照。

## 5. 必须通过的合同测试

- 已批 Dify v1 后改草稿 → 生产仍运行 v1，不能固定则拒绝发布。
- 相同工具名覆盖、未批 Plugin Binding、升级新增权限 → 拒绝。
- approve 后改参数/过期/换 actor → 批准失效；并发审批 → 不重复发布。
- Pi Flag 关闭 → 不可调用且核心员工助手仍通过；启用 Spike 必须另验隔离/Session/产出物。

上述为测试要求，未执行。每个测试补明确 actor/Scope、输入 Schema、状态/错误断言、审计/事件与清理；供应商能力用真实部署版本验证，不能仅 Mock 通过。

## 6. 批准、迁移与运行缺口

- 单一实名 A 与生产者/消费者 Reviewer；关联决策批准证据。
- 可执行 Schema、Provider capability 声明、合同测试夹具与兼容矩阵；当前均未交付。
- 具体配额/TTL/超时/重试/SLO/保留及生效时间由对应 D 决策冻结。
- expand/migrate/contract；破坏性 API/事件并行版本迁移，不在原版本静默改变权限语义。
- 回退保留当前 deny/删除账本、不可变版本与审计；控制面回滚不恢复被撤销授权。
- 观测至少 request/trace/job/run、决定/版本、结果与耗时，不收集不必要原文；Runbook 写清拒绝/未知/降级/恢复与 Owner。

[返回合同目录](./README.md) · [Spec 工作区](../README.md)
