# 首批可编码准备与关键 Spike

> 状态：draft / 待实名与环境批准。源码核验基点：`7b11843daeeff891761ce24af9c2285b3255c467`。
> 不是生产实现或企业决策；159 项 Spec 仍全部 draft / not_started。

## 1. 本轮交付与明确未做

本轮把 K01/K02/K03 的小部分逻辑约束转为[可执行 Schema、合成示例与设计测试](./specs/contracts/executable/README.md)，核验实际接点，并写出下面三组 Spike 的进入/停止/退出条件。

未修改业务代码、登录行为、队列配置、数据库或企业权限；未启动 Keycloak/私有 Broker/生产服务；未取得实名签署。未将纯函数模型当可运行的撤权服务，未向公共 Debug Proxy/Acceptance/遥测发送企业数据。

当前环境未找到 `bun` 或根 `node_modules`，没有执行产品 TypeScript 检查或产品测试。Python 离线设计工具可运行；这不解除工程工具链/依赖镜像批准门。

## 2. 已核验仓库接点（不是已识别可利用漏洞）

| 接点 | 源码事实 | 企业实现必须补证 |
| --- | --- | --- |
| [Generic OIDC](../../../src/libs/better-auth/sso/providers/generic-oidc.ts)、[OIDC helper](../../../src/libs/better-auth/sso/helpers.ts) | 使用 discovery，默认 PKCE；profile name 有回退 | Keycloak 固定版本、issuer/sub 与员工映射；显示名回退不能当身份锚点 |
| [Better Auth 配置](../../../src/libs/better-auth/define-config.ts) | accountLinking enabled、allowDifferentEmails、trustedProviders；Session cookieCache 开启，maxAge=120s | 具体绑定行为须真实测试；缓存不能证明满足企业禁用时效，需独立实时 deny/epoch 门 |
| [tRPC context](../../../packages/trpc/src/lambda/context.ts) | Better Auth getSession 成功后派生 userId | 在保护动作处核当前状态与作用域；不能只改一个入口就声称所有路径撤权 |
| [OpenAPI middleware](../../../packages/openapi/src/middleware/auth.ts) | API Key 读取当前记录，OIDC 路径调用活动状态检查；requireAuth 独立 | 保留已有保护，逐路由证明 requireAuth/PDP 覆盖；不要笼统声称上游完全没有撤销检查 |
| [RBAC stub](../../../packages/business-server/src/trpc-middlewares/rbacPermission.ts) | withRbacPermission/Any/All/Scoped 都直接 next | 企业 PDP/PEP 不可依赖这些 OSS 占位；云覆盖行为不是本仓已交付能力 |
| [队列工厂](../../../apps/server/src/services/queue/impls/index.ts) | queue 模式选择 QStash，否则 Local | 不能把配置 queue 当私有队列准入；私有 Adapter 和全部旁路需验证 |
| [Local queue](../../../apps/server/src/services/queue/impls/local.ts) | setTimeout、内存去重；cancel 只记录不支持 | 不是崩溃可恢复/可靠取消方案，不能作为 M01-011 生产验收 |

额外检索发现 `src/libs/qstash`、`apps/server/src/workflows`、`router-hono` 和 taskScheduler/goal 等调用。此清单非完整依赖图；只替换 QueueService 不能证明全部工作流停止外发。上游升级后按新 Commit 重核这些接点。

## 3. 先决决定与实名清单

| 门 | 候选责任角色（均待实名） | 必须给出的实际输入 | 未解决时 |
| --- | --- | --- | --- |
| D01 / D02 | HR、Identity、Security | HR 唯一源、复用/返聘/多法人规则；Keycloak/Adapter 版本、两入口 Client 和绑定策略 | 仅合成模型，不绑定员工 |
| D03 / D10 | Security、Project Owner、Identity | Scope/Membership、可信 actor、全局禁用与离项语义、撤权窗口/故障策略 | 不开放企业资源；不臆造秒级 SLA |
| D07 | SRE、Tech、Security | 私有队列候选、地域/出站批准、凭据/证书、DLQ/重试/取消合同 | 无真实队列验收，不回退公网 QStash |
| D13 / D14 | Security、SRE、Data Owner | 证据保留、审计、恢复与测量口径、容量与停止预算 | 不写真实日志/生产数据，不签时效 |
| D17 | Product、Tech、财务 | 单 A/Reviewer 姓名、排期、逐周容量、试验及运行预算 | 候选试验不能自动开工 |

批准记录至少包含决定编号、选项/取舍、范围、版本、批准人与日期、证据引用和复核条件。空白姓名/待定阈值是真实阻断，不用助手代签。

## 4. Spike A：身份冲突与全路径撤销

关联 M02-001/002/004/005/006/008/009、M03-001/009；候选 A：Identity Lead，Reviewer：Security/QA。

**进入条件**：隔离环境获批；固定 Keycloak/Better Auth 版本与配置 Digest；合成两入口用户/同名不同人/多法人/离职返聘样本；测试账号和受控回调 Origin；撤权测量口径先批准。

| 步骤 | 实验动作 | 必须观察的断言/证据 |
| --- | --- | --- |
| A1 | 同一员工经两入口登录；同名不同员工、相同 email 不同 issuer/sub | 相同批准身份只对应同一 userId；冲突留待裁决，不按姓名/手机/email 自动合并；记录绑定前后受控映射 |
| A2 | 错 aud/issuer/nonce、回调重放、Desktop 回调/PKCE 失败 | 不建立可信 Session；保存脱敏请求/错误和是否创建账号的数据库核验 |
| A3 | 建立 Web Cookie、Desktop Session、Access/Refresh Token、API Key、排队 Run | 列出实际受保护入口与主体/委托关系；未覆盖入口标 blocked，不从一个入口外推 |
| A4 | 提交全局禁用，暂停 IdP 注销/队列，跨实例重放旧凭据 | deny 持久后所有 Workspace 的保护动作拒绝；测最后一次允许/首次拒绝，不以 HTTP 受理时间代替生效 |
| A5 | 断开撤权状态存储、制造旧 Cookie/缓存命中、流式输出中禁用 | 无法确认当前状态 fail-closed；按批准输出检查点停止后续输出，已展示内容不可收回 |
| A6 | 乱序 HR 事件、重试禁用、账号返聘/重新启用 | 旧事件不复活账号；幂等副作用可核；启用必须新决定且旧 Session 不复活 |

**停止**：任何真实员工数据混入、未批准出站、跨权泄漏或无法隔离副作用立即停试，按事件流程保全证据。

**退出**：真实版本/配置、绑定唯一性与并发冲突、所有入口的结果矩阵、撤权时间原始记录、失败/修复/复测及实名签收。缺一入口或阈值未批保持 blocked；本轮尚未执行。

## 5. Spike B：PDP/PEP 与 Scope 负向测试

关联 M03-003～010；候选 A：Security Lead，Reviewer：Backend/QA/Project Owner。

**进入条件**：A 的可信主体边界已确认；合成两个 Workspace、各两个 Project、同名资源、私有记忆和 view-only 角色；动作/Scope/用途/Audience 合同批准。只采用候选模块内 PDP 接口，不预选策略引擎。

| 步骤 | 实验动作 | 必须观察的断言/证据 |
| --- | --- | --- |
| B1 | 伪造 body/header actor、Workspace、Project、Purpose、Audience | Schema 通过也必须查真实归属和当前权限；actor 不能来自这些字段 |
| B2 | 猜 ID、批量查询、搜索补全/计数、download/share | 无权对象不可发现；view 不推导 download/share；聚合不泄漏名称/数量 |
| B3 | 修改成员/ACL 后重放缓存 allow 与历史 asOf | 当前版本优先；离项不删他人合法共享索引，先 deny 后清投影 |
| B4 | PDP 断连、未知 action/obligation、数据源无预过滤 | 拒绝；不得以旧 allow、平台管理员或召回后过滤兜底 |
| B5 | Worker 无 Grant/Grant 到期/Owner 离职，Tool 前与输出前撤权 | 每个保护点重验交集，任务暂停/拒绝而非借万能服务身份 |
| B6 | 新增 Audience 成员并访问历史正文/附件/引用 | 不能只移除引用后共享；无法证明安全则拒绝或新建获权会话 |

**退出**：实际路由/Worker/检索/输出 PEP 清单、授权决定与 source/member/policy 版本、正负向结果、已覆盖与未覆盖边界。只测试 schema 或 RBAC stub 不可关闭 M03-006/010。

## 6. Spike C：私有队列、Outbox/Inbox 与审计

关联 M01-006/007/011/012、M02-006；候选 A：SRE Lead，Reviewer：Backend/Security/QA。

**进入条件**：D07 批准私有 Broker 候选与部署；隔离数据库和 Worker；默认拒绝公网出口；批准测试窗口/预算/清理；不用企业业务原文。

| 步骤 | 实验动作 | 必须观察的断言/证据 |
| --- | --- | --- |
| C1 | 枚举所有发布者/消费者/调度器/工作流并封锁公网 | 全部批准链可运行；抓取受控出站日志证明无漏网 QStash/遥测，不只看 QueueService |
| C2 | deny 与 Outbox/Audit 提交前后分别杀进程 | 同事务提交或全回滚；已提交 deny 不因队列故障消失；检查实际行与事务边界 |
| C3 | 发送后 ACK 丢失、重复投递、多 Worker 竞争 | consumer+source+eventId 去重与本地副作用同事务；外部动作必须目标幂等/回执，不宣称 exactly-once |
| C4 | 乱序、旧 epoch、DLQ 重放、执行前撤权 | 版本不倒退；重放保留原事件身份并重验当前权限；未获权不能自动重试至成功 |
| C5 | Worker 崩溃/Lease 超时/取消与外部副作用未知 | 可恢复且无双执行保证漏洞；cancel_requested 与 cancelled 分开，unknown 先查回执 |
| C6 | 审计写失败、归档故障、越权删除/修改 | 高风险动作按合同阻断；归档有容量/停止规则；独立身份/检查点可检测，不以 Hash 链自证不可篡改 |

**退出**：固定 Broker/DB/Worker 版本，故障时间线、事务与去重证据、重试/回执、恢复/取消结果、出口清单和审计保护验证。Local setTimeout 单元测试不能签可靠性。

## 7. 证据格式、回退与下一步

每次试验记录：`spikeId / runId / sourceCommit / environment / artifactDigests / configDigest / approvals / syntheticFixtureVersion / steps / expected / actual / timestamps / evidenceRefs / defects / cleanup / signer`。

原始证据放受控库；Git 只保留合成输入、测试定义与脱敏结论。不存 Token、人员名单、数据库快照；Trace ID 不授正文权。失败、未测、未知与通过分开，保留第一次失败及后续复测，不覆盖历史。

回退停止试验 Worker/调度器，撤销试验 Client/Grant/凭据，按保留/Hold 处理记录并确认出站关闭；不得恢复较旧 deny/删除状态。

下一步先由实际团队完成第 3 节批准，再选择一组 Spike 进入隔离环境实施。批准前可继续补接口/物理模型候选，但不可把本轮工具提交登记为产品 merged/verified，也不能直接启用生产。

[设计计划](./07-detailed-spec-design-plan.md) · [统一决策台账](./04-unified-baseline-and-decision-register.md) · [Spec 索引](./specs/index.md)
