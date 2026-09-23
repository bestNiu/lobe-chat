# K08：工作台、应用融合、任务与通知

> contractStatus: draft · 版本 0.1 · 候选 Owner：Product Owner（待实名）
> 设计/评审目标：W6 骨架；W8 Module/Review；W14 CRM Spike；决策阻断：D11/D12/D16。

## 1. 生产者与消费者

- 生产者：M11-001～014、M04-001/003/006、M05-011，均为原有 Spec，合同编号不新增工作包。
- 消费者：Web/Desktop、CRM/OA、运营/支持。
- 依据：[统一基线](../../04-unified-baseline-and-decision-register.md)、[通用契约](../../../06-integration-contracts.md)、[架构](../../../18-application-and-technical-architecture.md)。

本稿为可评审的逻辑合同，不是已批准 OpenAPI/数据库 Schema，也不假设供应商部署版本具备所有能力。Mock 可用于消费者开发，真实 AC 必须用实际接口签收。

模块具体草案：[Module Registry/融合容器](../M11/SPEC-M11-013.md)、[CRM/OA/Launch Code](../M11/SPEC-M11-014.md)。W8 合同先行、W14 Spike、W22 联合验收；应用打开权、Tool 连接器使用权与模块后端业务权限各自校验，不自动互授。

## 2. 逻辑类型与不变量

- ModuleManifest：稳定 ID、版本、Owner、Client、standaloneUrl、allowedOrigins/paths、capabilities、health、status；业务应用与 Tool/插件包分开。
- LaunchSession：codeHash、user/workspace/module/client/targetPath、expiry、consumedAt；短时单次原子消费。
- TaskProjection：source/objectId/sourceVersion、displayState、freshness、targetLink；泛微正式终态仍在源系统。
- Notification：sourceEventId/recipient/channel 去重、templateVersion、minimalPayload、deliveryState；渠道受理不等于已送达。
- Conversation/RunEvent：owner/audience/project、runId/eventId/cursor/attempt；SSE 重连不重跑 Tool。
- SearchResult：授权集合内结果/计数/补全；各域负责查询策略，不能先全量召回再过滤。

字段需在下一轮补必填/可空、长度、枚举、UTC 时间、整数范围和跨 Scope 约束；未知值不能默认为允许。分类/保留按 D13 批准，不能自行填统一年限。

## 3. 操作与响应语义

| 操作候选 | 输入边界 | 输出/副作用 |
| --- | --- | --- |
| launchModule/exchangeCode | 当前身份、登记模块、目标路径 | 受限启动码，模块后端认证原子交换；不替代模块 OIDC |
| postMessage | 精确 origin/source、版本化 Schema、事件白名单 | 只允许批准交互；不传 Token/业务原文/任意导航 |
| projectTask/notify | 已校验源事件、版本、收件人 | 投影不倒退；通知发前重新授权，失权不发敏感正文 |
| search/listHome | 服务端身份、范围、cursor | 多域预过滤与可解释降级，不泄漏不可发现对象 |
| streamRun/reconnect | 当前会话权限、runId/cursor | 去重事件、权威终态、中止确认与产出物入口 |

操作名不是最终 URL。跨系统 OpenAPI/JSON Schema，内部接口仍须运行时输入校验；后续需映射现有 Router/Provider 并提供正负向夹具。规范头为 X-Youlin-Request-Id 与 traceparent；actor/Scope/Purpose 不因出现在 Header 而可信。

统一错误信封：`{requestId,error:{code,message,retryable,details}}`。无有效身份 401；无权且不可发现对象统一 404；版本/幂等冲突 409；无效输入 422；限流 429；依赖不可用按网关语义返回且不泄漏内部细节。是否可重试取决于动作/回执，不能只看 HTTP 状态。

## 4. 一致性、授权与失败

默认 SSO 深链接，iframe 兼容/安全失败则降级。第三方 Cookie 不可用不能降低认证要求。可售模块保持 Standalone/Embedded，内建首页不要求独立部署。统一 Review 外壳不接管领域发布权；支持 Trace ID 不赋予原文读取。

写操作幂等键绑定 workspace+actor/service+operation+canonicalPayloadHash，同键异参数冲突；并发变更 expectedVersion。内部事件采用 K03 合同，发布业务事实与 Outbox 同事务，不信任陈旧消息内的授权快照。

## 5. 必须通过的合同测试

- Launch Code 重放/过期/跨 Client → 原子拒绝；登录后旧 callback 不泄漏 code。
- 伪造 origin/source、未批 URL → 拒绝；iframe 失败 → 安全深链接。
- 任务重复/乱序事件 → 不倒退终态，通知不重复；源不可用 → 陈旧/未知。
- SSE 断线重连 → 不重跑 Tool/不重复扣费；退出会话受众 → 历史事件和引用不可读。

上述为测试要求，未执行。每个测试补明确 actor/Scope、输入 Schema、状态/错误断言、审计/事件与清理；供应商能力用真实部署版本验证，不能仅 Mock 通过。

## 6. 批准、迁移与运行缺口

- 单一实名 A 与生产者/消费者 Reviewer；关联决策批准证据。
- 可执行 Schema、Provider capability 声明、合同测试夹具与兼容矩阵；当前均未交付。
- 具体配额/TTL/超时/重试/SLO/保留及生效时间由对应 D 决策冻结。
- expand/migrate/contract；破坏性 API/事件并行版本迁移，不在原版本静默改变权限语义。
- 回退保留当前 deny/删除账本、不可变版本与审计；控制面回滚不恢复被撤销授权。
- 观测至少 request/trace/job/run、决定/版本、结果与耗时，不收集不必要原文；Runbook 写清拒绝/未知/降级/恢复与 Owner。

[返回合同目录](./README.md) · [Spec 工作区](../README.md)
