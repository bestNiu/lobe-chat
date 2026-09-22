# Spec 设计细则与补充验收场景

> 本文件补充 plan/01 的 WBS：任务表是设计输入，不等同于每个 Spec 已具备可编码设计。
> 依赖、数据边界、候选阈值与决策截止以 [04 统一基线](./04-unified-baseline-and-decision-register.md)为准。

## 1. 每个 Spec 的 Definition of Ready

进入开发前填写以下模板并完成技术/业务 Review；任何影响授权、数据或接口的关键 TBD 未解决，状态不得改为 approved。

```yaml
specId: SPEC-Mxx-xxx
status: draft
owner: 待实名认领
reviewers: [TechLead, QA, DomainOwner]
requirementRefs: [FR-xxx, AC-xx]
sourceRefs: [文档路径和章节]
scope:
  included: []
  excluded: []
dependencies:
  decisions: []
  slices: []
  versions: []
userStories: []
data:
  entities: []
  constraints: []
  classification: 待批准
  retentionPolicyRef: 待批准
contracts:
  apiSchemaRef: 待设计
  eventSchemaRef: 待设计
  errorCodes: []
authorization:
  actor: 待设计
  actions: []
  policyRef: 待批准
  revocation: 待设计
uiStates: [loading, empty, forbidden, error, degraded, expired]
acceptanceCases: []
observability: []
migration: {expand: 待设计, backfill: 待设计, contract: 待设计}
release: {flag: 待设计, rollback: 待设计, runbook: 待设计}
effortByRole: {}
evidenceRefs: []
```

前后端、QA、Security、Ops 子任务共享一个 Spec，而不是各自产生互不相连的完成定义。纯文档任务可以标 API/UI 不适用，但需理由；实际 Owner、接口 Schema、数据库迁移号不能由规划稿伪造。

## 2. 数据设计最低约束

| 聚合 | 必须说明的约束/并发/生命周期 |
| --- | --- |
| IdentityLink | unique(issuer, sub)；外部标识带 Provider/企业范围；员工号复用、返聘与法人调动人工裁决 |
| Project/Membership | workspace/project 复合范围；同人可多角色；validFrom/validTo、状态和撤销版本；无权更新目标 Project 时拒绝 |
| Resource/Version | 资源稳定 ID；version 单调或不可复用；内容 Hash/对象 Key/状态；内容恢复创建新头版本，不修改历史对象 |
| ShareGrant | 资源/版本策略、动作、受众、有效期、转分享上限；分享不能超出授权者当前范围 |
| KnowledgeRelease | 精确版本集合、解析/Embedding 配置、评审证据、激活版本；失败不覆盖旧有效索引 |
| PersonalMemory | owner/category/project 约束；project_private 必填 Project；正文 contentRef；更新生成版本；导出检查每条来源权限 |
| ProjectMemory/Promotion | 原私有记录不改 Owner；共享申请只拷贝用户确认的脱敏草稿，Reviewer 不获得完整私有记忆读取权 |
| RuntimeContext/PolicyDecision | actor/service、purpose/audience、来源版本、策略版本、expiry；有界保留；Hash 是完整性证据而非正文备份 |
| DataProduct/AccessGrant | 契约版本、源快照、质量、用途；fields/rowScope/expiry 不得超出批准；Consumer 自增 Scope 无效 |
| ReviewRequest | 唯一对象版本+请求 ID；乐观锁；提交者/批准者职责分离；对象改动使原评审失效 |
| Job/Outbox/Inbox | 稳定 eventId、租户和源版本；重试次数/nextAttempt/deadLetter；消费去重；取消与结果未知分开 |
| Task/Notification | 任务源 ID 唯一；版本防倒退；通知按收件人/渠道去重；发前复核授权 |
| Audit | 追加写、独立写账号、时间源和完整性校验；管理内容权限与审计权限分开 |

所有跨对象引用需防跨 Workspace 外键串接；API 层检查不能替代数据库约束。RLS 若采用则作为纵深防御，后台 Worker、连接池和迁移账号行为必须单独测试。

## 3. 迁移与失败语义

1. 扩展新表/可空字段，先部署双读兼容代码；不得修改已发布迁移。
2. 回填使用 checkpoint、幂等批次、数量/Hash/外键对账和限流，敏感原文不写日志。
3. 授权迁移采用 deny-by-default，不能先开放所有用户再补 ACL。
4. 切换读写前验证存量账号、资源和会话；个人资源不能自动变为企业公开资源。
5. 观察窗口内保留旧结构；破坏性收缩单独发布并批准，数据恢复和应用回滚独立设计。
6. Outbox 保证数据库状态与消息待发送事实同事务；外部失败进入重试或补偿，不宣称跨库 ACID。
7. 网络超时后查询同一幂等键/源回执，未知结果不自动重复高风险副作用。
8. 备份恢复后重放最新撤权、删除与 Legal Hold 账本；索引可重建不等于 KMS/原件可以缺失。

## 4. API/事件最小合同

- 外部模块用 OpenAPI 3.x/JSON Schema；内部 tRPC 类型不能替代跨系统运行时校验。
- 请求身份由签名 Token/服务端 Session 派生；workspace/project/body actor 均必须与认证上下文核验。
- `X-Youlin-Request-Id` 为规范请求头，W3C `traceparent` 传递追踪；旧 X-Request-ID/X-Trace-ID 仅由 Adapter 映射，不作为可信身份。
- 错误信封统一 `{requestId,error:{code,message,retryable,details}}`；不可发现对象对外统一 404，无权原因只在获授权审计中详述。
- 分页固定 cursor/limit/maxLimit、排序白名单与 scope，导出/批量接口另设配额，不允许任意 SQL。
- 幂等键绑定 workspace+actor+operation+canonicalPayloadHash；同键异参数返回 409；并发变更用 expectedVersion/If-Match。
- Webhook 原始字节签名、时间窗、keyId/轮换、持久去重；落盘使用最小字段与加密，不能把敏感原文写入普通日志。
- 事件内部领域名经注册映射到 CloudEvents 1.0；租户、源版本、Schema、causation/correlation 不得丢失。
- SSE 保存 runId/eventId/cursor；断线重连不创建新 Run、不重复工具执行或扣款；中止等待后端确认。
- Provider `cancel/versionPin/preFilter/streamResume` 等能力必须显式声明，缺失能力不得伪装成功。

## 5. 逐里程碑补充验收场景

以下用例可直接拆为 QA 任务；每条记录 Given/When/Then、环境/版本、输入样本、预期状态、审计证据和清理步骤。

| ID | 里程碑/Spec | 具体场景与通过条件 |
| --- | --- | --- |
| VT-001 | M0-001～010 | 每个 P0 FR 找到 Spec、责任角色、AC、数据范围；未决项有截止/阻断，没有以“待定”绕过硬门禁 |
| VT-002 | M1-011 | 禁止公网出口后真实 Job 可入队、重启恢复、重试/死信/重放；未部署 QStash 不影响核心链 |
| VT-003 | M1-012 | 伪造/删除审计记录被拒绝或完整性验证检测；写权限与查询/保留权限分离；审计失败时高风险动作拒绝 |
| VT-004 | M2-004～006 | 双入口同用户；同名不同人不合并；返聘、员工号复用、法人变更进入裁决；禁用后旧 JWT/应用会话/Refresh 均不能旁路 |
| VT-005 | M3-001/009 | 乱序入职/离职事件和 HR 不可用后重放，不复活已禁用账号；全量同步部分失败不得把所有员工删除 |
| VT-006 | M3-006～010 | 两部门/两项目同名资源，猜 ID、批量、导出、搜索、Worker 接口均隔离；平台 Admin 不自动读业务正文 |
| VT-007 | M4-003～005 | 劫持 Deep Link、过期授权码、未签更新包、路径穿越/symlink、目录范围外 Tool 均被拒绝；密钥不落普通配置 |
| VT-008 | M5-004/007 | 审核 v1 后改 Dify 草稿，生产 Run 仍执行 v1 的确定部署/Hash；无法固定版本阻断发布 |
| VT-009 | M5-003 | 审批绑定参数 Hash，参数改变/批准过期/Actor 变化拒绝；Mock 高风险 Tool 验证，不新增生产写回 |
| VT-010 | M5-011 | SSE 断线重连、取消/重试/会话切项目不重复 Tool；正确显示运行中、取消中、失败、未知结果；输出仅授权者可见 |
| VT-011 | M6-003 | 超限、MIME 伪装、恶意宏/压缩炸弹、重复 complete、分片缺失被拒绝或隔离；失败不会发布 ResourceVersion |
| VT-012 | M6-007 | 分享撤销后历史入口/Range/新下载均拒绝；另测旧普通 OSS URL 仍可能存活以证明不能用其承诺实时撤权 |
| VT-013 | M6-011/012 | TXT/Markdown 并发编辑返回 409；跨库移动/引用不扩大 ACL；不支持格式真实提示不执行任意转换 |
| VT-014 | M6-008/010 | 删除立即封禁，Hold 阻断 purge；恢复新头版本有来源；OSS/元数据不一致被对账发现，重建后不复活撤销权限 |
| VT-015 | M7-001～004 | 同 KB 不同文档 ACL，检索、重排、计数均不见无权文档；知识发布失败仍保留旧有效发布 |
| VT-016 | M7-007 | Promotion Reviewer 只看申请的脱敏草稿，不得读取原个人记忆全部正文；修改草稿使原批准失效 |
| VT-017 | M8-010 | 冻结黄金集按版本评测，冲突/旧版/无答案/注入/越权分层；输出缺少支持证据不能算有依据回答 |
| VT-018 | M9-007～011 | 无 Token、错误 aud/scope、过期 Grant、超配额、越行/列和未知字段分别拒绝；质量失败/陈旧时按契约阻断而非静默返回旧数据 |
| VT-019 | M10-003～005 | project=null 普通问答可用；伪造 actor/outputScope 被覆盖/拒绝；asOf 不恢复已失去权限；preview/explain 无名称/计数泄漏 |
| VT-020 | M10-007～010 | 两成员交集、加入无权成员、输出移动、个人记忆导出、离项旧会话均重新鉴权；Audience 不同不得命中同一缓存 |
| VT-021 | M10-010 | PDP/失效队列故障时旧索引不能继续服务撤权内容；单人离项不删除其他合法成员共享索引；回执/补偿可追溯 |
| VT-022 | M11-013/014 | CRM 独立/嵌入同授权；launch code 重放/过期/跨 Client 被拒绝；伪造 origin/source/navigation 被拒绝；Cookie 不可用安全降级 |
| VT-023 | M11-004～006 | 重复/乱序回调不倒退任务、不重复批准；源系统宕机显示陈旧/未知而非成功；通知发前权限回收无正文泄漏 |
| VT-024 | M11-010 | 关闭高风险 Flag 后页面/API/Agent/Worker 同时阻断新动作，运行中调用取消并记录已发生副作用，不声称自动撤回 |
| VT-025 | M12-006～008 | 从备份恢复原件/身份/密钥/策略，重放删除账本和重建索引后跑业务链；达到已批准 RPO/RTO，再允许流量 |
| VT-026 | M13/M14 | 准入只签 AC-15 readiness；真实 Pilot 结束有用户、观察周期、指标原始计数、事故和退出决定，不把准备当完成 |

## 6. AC-21 黄金评测计算方法

- 固定 100～200 问，由 Knowledge Owner/QA 标注：可回答、无依据、冲突、旧版、越权、超范围、注入。问题带 actor、Project/Purpose、期望版本/段落、禁止来源与期望动作。
- 分层需非零样本；每个权限、冲突和注入关键类别建议不少于 10 例，可重叠标签，但分别报告分母。由 Owner 在 D15 冻结；开发调参集与验收留出集分开。
- **关键答案依据展示率**：有关键事实的回答中，所有关键事实均展示来源文件与版本的回答数/有关键事实回答数，目标 100%。全拒答时为 N/A，不能记 100%。
- **引用可定位率**：能在确定版本的页码/章节找到对应原文的引用数/总引用数，目标 ≥95%；伪造和失效链接算失败。
- **有依据回答率**：可回答问题中答案正确且所有关键主张受有效证据支持的问题数/全部可回答问题数，目标 ≥90%；错误拒答不能排除出分母。
- **正确拒答率**：无依据问题中明确拒答或转人工且不编造规则的问题数/全部无依据问题数，目标 ≥90%；冲突、越权、超范围按各自策略另报，越权泄漏任何一次即失败。
- 过期依据作为当前依据计数=0，跨权限泄漏计数=0；报告分子/分母、失败案例、评审人及复评结果，不能仅交模型自动评分。
- 质量阈值不是 Prompt 参数；minimumScore 示例不能跨 Embedding/Rerank 模型照搬。Provider 变化需重新标定与回归。

## 7. 功能需求到 Spec 的补充映射

| PRD 需求 | 主 Spec | 补充重点 |
| --- | --- | --- |
| FR-A01～04 | M02-001～009、M03-001 | 唯一账号、JWT/Session 回收 |
| FR-B01～04 | M03-001～010 | 同步、Project、RBAC/ABAC/ACL |
| FR-C01～03 | M01、M04 | 私有队列、Desktop、部署和外发控制 |
| FR-D01～03 | M05-001/002/007/009 | Skill 生命周期与来源 |
| FR-E01～03 | M05-003/007/008、M01-006 | Tool 安全、审批参数与凭证 |
| FR-F01～03 | M05-004/007/009、M08-004/007 | Dify 真正版本固定与未知结果 |
| FR-G01～06 | M06-001～012 | 文件、文本编辑、音视频范围、撤权 |
| FR-G07 | M07-001～005 | 发布原子激活、检索预过滤 |
| FR-G08 | M07-006/007/009/010、M10 | 私有/共享、Promotion 与离项 |
| FR-G09～11 | M07-008/009、M06-009、M08-001 | 产出物、配额、内容范围 |
| FR-H01～03 | M05、M01-012、M10 | 版本/模型、完整审计、运行时权限 |
| FR-H04 | M05-011、M10-007/010 | 会话 CRUD、SSE、中止、历史权限 |
| FR-I01～05 | M09-001～012 | 真实只读 API、行列/脱敏、质量 |
| FR-J01～05 | M03-004/005、M10-001～012 | C0～C3 切片和安全解释 |
| FR-K01～06 | M11-001～012、M12 | 运营 UI 与最终演练拆分 |
| FR-K07 | M11-013/014 | Module/CRM/Launch Code、深链接降级 |

以上简写全部指 `SPEC-` 前缀 ID。新增任务不是自动扩张范围，是补齐 07/12 已有承诺；新增工作量必须由 D17 重新排容量。后续 Stage 的 Epic 需单独立项展开 Spec，不能按此表视为已就绪。

## 8. 交付证据目录约定

本仓库 `plan/` 只保存规划、Schema/模板、合成测试定义和脱敏结论；不创建包含生产原文的证据目录。受控证据库逻辑命名统一为 `evidence/{adr,specs,contracts,tests,security,performance,uat,releases,runbooks,pilot}`，链接需带版本/Hash、Owner、分类和有效期。私有报告链接不可被公开文档构建抓取。
