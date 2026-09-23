# 开发启动授权与里程碑进度

## 1. 本轮授权与统计口径

用户原话：**“批准，继续推进开发落地，目前里程碑以及对应的进度”**。

据此启动默认关闭、无真实数据、无生产接入的隔离开发切片。没有将此消息改写为 D01～D17 全部获批，也不代填企业实名 Owner、Security Reviewer、预算或数据/生产批准。

- **详细草案文件覆盖：159/159（100%）**。这是文件覆盖率，不是设计质量、批准或开发完成率。
- **完整 Spec 正式批准：0/159；业务验收：0/159；生产发布：0/159。**
- **提前工程切片：3 项进入开发**：M01-001-S1 根依赖已安装（跳过生命周期）；M02-006-S1 撤权内核通过定向严格类型检查，根配置对三个选定文件的 Lint/Vitest 24 项通过；M02-006-S2 在 PostgreSQL 15.19 上复测 20 项通过。正式 Adapter/迁移、仓库质量门和真实身份链仍未完成。
- **752 条 Spec 用例仍待实际执行**。25 项合同设计测试、13 项文档校验器测试、24 项内核测试及 20 项隔离 PostgreSQL 试验单独统计，不冒充端到端验收。
- 当前不能给出可靠的“总体开发百分比”，尚无批准工作量权重、实际启动日期或完整团队投入数据。

完整 Spec 的 catalog 状态仍为 draft / not_started：表示没有把尚未满足完整 DoR 的父任务标为正式开工/批准。已发生的工程编码另记在[提前切片执行账](./execution-slices.json)，并在下表明确呈现，**不表示没有发生代码工作，也不代表父 Spec 已完成**。待父项合同/责任/批准补齐，再进入其正式交付状态。

## 2. M0～M14 当前进度

| 里程碑 | 候选交付周 | 草案覆盖 | 当前实际进度 | 主要下一步 |
| --- | --- | --- | --- | --- |
| M0 范围/架构 | W2 | 10/10 | 规划、架构、决策台账已形成，企业批准未闭环 | 实名 RACI、启动日、容量/预算、关键 ADR |
| M1 工程基线 | W4 | 12/12 | 根依赖安装、指定文件根 Lint/Vitest 已打通；全仓类型未完成，CI/私有队列未落地 | 批准工具链/镜像源，隔离 DB/IdP/Broker、Secret 与 CI |
| M2 统一身份 | W5 | 9/9 | **S1 定向类型、根 Lint/Vitest 24 项通过；S2 数据库复测 20 项通过；均未接产品** | 标准质量检查、权威状态 Adapter、原子禁用/审计/Outbox、真实身份链 |
| M3 组织/权限 | W7 | 10/10 | Scope/AccessIntent Schema 子集与负向测试设计；无真实 PDP | Membership/ACL 物理合同，真实 PEP 与预过滤验证 |
| M4 Web/Desktop | W8 | 8/8 | 草案齐备，企业功能未实现 | 双端身份/升级/签名及设备 Spike |
| M5 AI 能力中心 | W10 | 11/11 | 草案齐备，企业功能未实现 | Registry、Review、Tool/Workflow 与模型边界 |
| M6 资源中心 | W14 | 12/12 | 草案齐备，企业功能未实现 | OSS/鉴权代理/扫描、配额与版本安全切片 |
| M7 知识/记忆/产物 | W15 | 10/10 | 草案齐备，企业功能未实现 | 知识审核/发布、RAG ACL、个人与项目记忆隔离 |
| M8 员工助手 | W16 | 10/10 | 草案齐备，尚无真实端到端灯塔 | 有效知识与黄金集、引用/拒答/质量基线 |
| M9 数据/API | W18 | 12/12 | 草案齐备，尚无真实数据产品 | 一个批准低敏 Gold 产品与内部只读 API |
| M10 Project Context | W20 | 12/12 | 草案齐备，C0～C3 未实现 | 按 C0/C1/C2/C3 提前切片，而非等 W20 才开始 |
| M11 工作台/运营 | W22 | 14/14 | 草案齐备，企业运营功能未实现 | Review/Module 先行，再做任务/通知/反馈/运维 |
| M12 RC/UAT | W24 | 10/10 | 测试与恢复/UAT 设计；尚未执行 | 固定 RC 后真实安全/性能/恢复/UAT |
| M13 Pilot 上线 | W26 | 9/9 | 准入与两道发布门设计；尚未部署 | 部署前 Go/No-Go、部署后 Smoke 再放流量 |
| M14 Pilot 结论 | W32 | 10/10 | 运营/指标/TCO/投资门设计；尚无真实运行 | 真实 4～6 周观察、原始指标、安全与投资结论 |

周数是相对批准启动日的计划，不是已过去的实际项目周数。当前未确认启动日期，不能宣称已到 W5 或给出确定日历完工日期。

## 3. 已落地的首个代码切片

- 实现：[revocationGate.ts](../../../apps/server/src/modules/YoulinSecurity/revocationGate.ts)
- 模块边界：[YoulinSecurity README](../../../apps/server/src/modules/YoulinSecurity/README.md)
- 共享行为测试：[revocationGate.cases.mjs](../../../apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.cases.mjs)
- 标准 Vitest 入口：[revocationGate.test.ts](../../../apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.test.ts)
- 本轮实际运行入口：[原生 Node smoke](../../../scripts/youlin/revocationGate.smoke.mjs)

已覆盖：默认关闭/无配置拒绝；禁用、旧/超前 epoch、主体错配、状态缺失/错误；每次重新读取；异常/超时 fail-closed；Abort、晚到响应、并发主体与输入突变。返回 `continue_authorization` 只允许继续 PDP，不等于允许访问。

**新增 S2**：[隔离 SQL 原型](../../../scripts/youlin/fixtures/revocation.sql)已实证 CAS/幂等、deny+Audit+Outbox+回执原子写入、失败/连接终止回滚，并以 PostgreSQL 查询接入 S1 测试。见[工具与边界](../../../scripts/youlin/README.md)。

**未完成**：正式 Drizzle Schema/生成迁移/应用数据库 Adapter、身份表映射与授权角色、Keycloak/Session/API Key/Worker 接点、PDP/PEP 和多端端到端。没有通过现有路由挂载；不存在修改企业登录或权限行为的生产效果。

## 4. 本轮检查与限制

隔离工具链安装和类型/lint/Vitest 命令见[固定工具链](../../../scripts/youlin/toolchain/README.md)；以下行为/文档检查也已执行：

```bash
node --experimental-strip-types --test scripts/youlin/revocationGate.smoke.mjs
node --experimental-strip-types --test scripts/youlin/revocationPostgres.smoke.mjs
python3 docs/youlin-enterprise-ai-platform/plan/specs/contracts/executable/test_contracts.py
python3 docs/youlin-enterprise-ai-platform/plan/validate_docs.py
python3 docs/youlin-enterprise-ai-platform/plan/test_validate_spec_catalog.py
```

24 项内核合成行为测试、20 项隔离 PostgreSQL 试验、25 项合同设计测试、13 项文档校验器测试通过。另已安装 Bun 1.4.2、TypeScript 6.0.3、Vitest 5.0.0、ESLint 10.0.2 的独立锁定工具链，内核严格类型检查、隔离 strictTypeChecked lint 与同一测试入口的 Vitest 24 项均通过。最新已执行根 `pnpm install --ignore-scripts`，并运行 `bun run check --lint --test --type`：指定三个文件的根 Lint clean（两文件自动规范化）、24 tests passed；全仓类型进程被 SIGKILL，整体 exit 1。一次软内存/限时重试仍未完成，已清理其所属进程；原因未确认，不声称 OOM 或代码类型错误。根原生编译器单独检查内核返回 exit 0；仍不能称全仓类型/质量门通过。

当前是无用户可见接点的隔离原型；未执行产品 Acceptance、真实安全/恢复/性能测试，也没有发布公共 Acceptance 页面。通过合成测试不证明授权服务、撤权 SLA 或供应商兼容性。

## 5. 紧接着的开发顺序

1. **M1 完整质量链与隔离环境**：根依赖与指定文件的原生 Lint/测试已完成；全仓类型需转入有硬资源边界的 Runner 继续定位，并补必要依赖构建/应用启动验证。不得在共享宿主无限重试，也不排除业务代码来刷绿。
2. **M2 正式持久化切片**：在已验证事务原型基础上，批准现有 users/auth_sessions 与企业主体的映射，按 Drizzle 生成迁移并实现正式 Repository/Adapter；不能直接部署试验 SQL。
3. **M1/M2 私有验证**：连接批准 Keycloak/数据库/队列，执行[Spike A/C](./08-implementation-readiness-and-spikes.md)，证实绑定冲突、跨实例禁用、崩溃/重投。
4. **M3 授权内核**：实现受限的 Scope/Membership/ACL/PDP 接口，按 Spike B 逐入口挂载 PEP；不得依赖 OSS RBAC 占位。
5. **W5/W7 交付签收**：真实证据齐备后再提升父 Spec 状态和里程碑通过标记；资源、Review、Context 按原切片并行。

还需要企业提供：实名技术/安全/身份负责人、实际启动日、隔离环境与 Secret 的受控提供渠道，以及待决策台账中的实际选项。禁止在聊天或 Git 粘贴明文密钥。

## 6. S2 实际工程证据

- 最新 [r3 原始 TAP](./evidence/M02-006-S2/r3.tap)与[r3 源码 Hash](./evidence/M02-006-S2/r3-manifest.json)：20 项复测通过，容器清理已确认。
- 历史 [r1 清单](./evidence/M02-006-S2/r1-manifest.json)、[r2 清单](./evidence/M02-006-S2/r2-manifest.json)及对应 TAP 保留原状；对应当时源码，不覆盖旧证据。
- 只使用合成身份，网络关闭、无宿主端口、tmpfs 数据；未连接任何现有业务数据库。
- 结果仅证明这个版本的隔离原型；不证明正式生产迁移、审计防篡改、Broker 投递或真实身份权限链。父 Spec/AC 状态未提升。

## 7. M01-001-S1 工具链证据

- 最新 [根检查原始输出](./evidence/M01-001-S1/r2-root-check.txt)、[定向原生类型结果](./evidence/M01-001-S1/r2-targeted-type.txt)、[隔离复测](./evidence/M01-001-S1/r2-isolated-checks.txt)和[r2 版本/源码/报告 Hash](./evidence/M01-001-S1/r2-manifest.json)。整体根检查 exit 1，不标为全通过。
- 历史 [r1 清单](./evidence/M01-001-S1/r1-manifest.json)、[缺少根依赖的阻断](./evidence/M01-001-S1/r1-root-check.txt)与[lint 范围负向探针](./evidence/M01-001-S1/r1-lint-scope-probe.txt)保留。
- 仅请求工具/依赖包，未发送企业数据；安装禁用生命周期脚本。根依赖已经安装，但 package/workspace 配置未改；根原有 lockfile=false 策略保留，不宣称完整环境被冻结。
- 本轮只做工程接入和规范修订，没有产品行为接点或新的生产迁移；完整 Spec 验收仍为 0/159。

[计划总览](./README.md) · [全部 Spec](./specs/index.md) · [实施准备](./08-implementation-readiness-and-spikes.md)
