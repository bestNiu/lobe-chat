# Youlin 企业 AI 工作台开发计划

> 依据：`../01`～`../12` 规划文档及 `../18` 应用/技术架构
>
> MVP 建设周期：22～26 周
>
> Pilot：4～6 周，计划 W27～W32
>
> 计划状态：开发实施基线 1.7（详细设计批次 1～6；159 项 draft、0 项 planned，均未批准或交付）

## 1. 文件索引

1. [MVP 开发里程碑与 Spec 任务](./01-mvp-development-milestone-specs.md)
2. [需求、验收与交付追踪矩阵](./02-traceability-and-delivery-gates.md)
3. [MVP 后完整产品开发路线](./03-post-mvp-product-roadmap.md)
4. [统一基线、依赖切片与决策台账](./04-unified-baseline-and-decision-register.md)
5. [Spec 设计细则与补充验收场景](./05-spec-design-and-verification-details.md)
6. [本轮 Review 发现与修订记录](./06-document-review-and-remediation.md)
7. [全量详细 Spec 设计与滚动批准计划](./07-detailed-spec-design-plan.md)
8. [逐项设计工作区](./specs/README.md)、[159 项设计索引](./specs/index.md)、[跨里程碑契约](./specs/contracts/README.md)
9. [首批可编码准备、仓库接点与三组 Spike](./08-implementation-readiness-and-spikes.md)
10. [K01/K02/K03 首批可执行 Schema 与合成测试](./specs/contracts/executable/README.md)
11. [开发启动授权与当前里程碑进度](./09-development-progress.md)、[提前工程切片执行账](./execution-slices.json)

应用模块、技术组件、部署边界与本计划的映射见[应用架构与技术架构](../18-application-and-technical-architecture.md)。

## 2. 里程碑总览

| 里程碑 | 目标时间 | 主题 | 核心结果 |
| --- | ---: | --- | --- |
| M0 | W2 | 范围与架构基线 | ADR、范围、Owner、预算和 Pilot 冻结 |
| M1 | W4 | 工程基线 | 环境、CI/CD、可观测、迁移和制品链 |
| M2 | W5 | 统一身份 | Keycloak、企业微信、唯一账号和禁用 |
| M3 | W7 | 组织与权限 | 组织同步、Workspace/Project、授权服务 |
| M4 | W8 | Web/Desktop | 多端登录、升级、设备与私有部署链路 |
| M5 | W10 | AI 能力中心 | Skill/Tool/Workflow/Agent/Model Registry |
| M6 | W14 | 企业资源中心 | 四级资源库、OSS、预览、分享和版本 |
| M7 | W15 | 知识/记忆/产出物 | 知识发布、RAG、记忆分层和产出物 |
| M8 | W16 | 员工助手灯塔 | 有临员工工作助手端到端闭环 |
| M9 | W18 | 数据与 API PoC | 湖仓分层、Data Product、内部只读 API |
| M10 | W20 | Project Context | Project/Membership、Context 和 Agent 授权 |
| M11 | W22 | 产品运营闭环 | 首页、搜索、任务、通知、评审、反馈和配置 |
| M12 | W24 | 发布候选 | 安全、性能、恢复、UAT Release Candidate |
| M13 | W26 | Pilot 上线 | 培训、生产发布、支持和 Go/No-Go |
| M14 | W32 | Pilot 结论 | 指标、TCO、问题闭环和下一阶段投资决策 |

W26/W32 为保守基线。M12/M13 不要求尚未运行的 AC-15 完成，仅检查 Pilot 准备；AC-15 在 M14 签收。M5/M7/M8 所依赖的 Review、Project 和 Context 必须提前按切片提供，不能等 M10/M11 最终关闭。

## 3. 并行开发泳道

```text
W1-4    工程、环境、CI/CD、可观测和安全基线
W1-7    Keycloak、企业微信、账号、组织和权限
W3-8    Web、Desktop 和私有部署
W6-10   Skill/Tool/Workflow/Agent/Model Registry
W7-14   企业资源中心、OSS 和文件处理
W9-15   知识、RAG、记忆和产出物
W13-16  有临员工工作助手
W5-18   湖仓/Data Product/API PoC
W7-20   Project/Membership/Context/Agent 授权
W6-22   首页/搜索/任务/通知/评审/反馈/运营
W22-24  安全、性能、恢复和 UAT
W25-26  发布准备和 Pilot 上线
W27-32  Pilot 运行和投资决策
```

## 4. 里程碑执行规则

### 4.1 Spec 状态

设计与交付使用两个独立状态轴，详见[Spec 工作区](./specs/README.md)：

```text
designStatus: planned → draft → in_review → approved（变更后可 superseded）
deliveryStatus: not_started → in_development → merged
                → in_verification → verified → accepted → released
```

blockedBy、审批版本与证据另记；设计批准不等于代码合并，代码合并不等于环境验证。M0 文档任务用受控交付物代替代码证据，不伪造 PR。当前完整 Spec 的 deliveryStatus=not_started；用户已批准隔离开发，M01-001-S1 与 M02-006-S1/S2 已进入工程开发，分别有隔离固定工具链、内核检查和 PostgreSQL 事务试验，单列于[执行账](./execution-slices.json)。该切片不冒充完整 Session/PDP/真实环境交付。

所有开发项必须具备：

- Spec ID、Owner 和目标里程碑；
- 用户/系统目标；
- 功能要求和非功能要求；
- 数据模型或 Schema；
- API/事件/页面契约；
- 权限、审计、保留和失败处理；
- 测试案例和验收阈值；
- 发布、回滚和运行手册；
- 关联 PRD AC 和证据地址。

### 4.2 完成定义

代码合并不等于 Spec 完成。每个 Spec 的 Definition of Done：

1. 需求和设计 Review 通过；
2. 代码、迁移、配置和 Feature Flag 完成；
3. 单元、类型、Lint、契约和安全测试通过；
4. 关键路径 E2E 和负向权限测试通过；
5. 日志、指标、Trace、告警和审计可用；
6. 文档、Runbook、发布和回滚步骤完成；
7. 测试环境部署并附实际证据；
8. Product、QA、Security/Data Owner 按风险签收；
9. 无开放 P0/P1 缺陷或 Critical/High 安全风险；硬门禁不可豁免；
10. 关联 AC、风险和变更记录已更新。

### 4.3 质量优先级

| 等级 | 定义 | 发布规则 |
| --- | --- | --- |
| P0 | 身份、权限、数据泄漏、不可恢复、凭证和高风险绕过 | 必须阻断发布 |
| P1 | 核心任务不可完成、数据/版本错误、严重性能问题 | 阻断发布，修复并复测 |
| P2 | 存在受控替代路径的功能或体验问题 | 需 Owner 接受和修复日期 |
| P3 | 优化项 | 进入版本 Backlog |

## 5. Spec 编号规范

```text
SPEC-M{里程碑两位数}-{三位序号}
```

例如：

- `SPEC-M02-001`：Keycloak Realm 与 Client；
- `SPEC-M06-004`：资源预览；
- `SPEC-M10-003`：Context Provider；
- `SPEC-M11-002`：统一导航与应用中心。

子任务建议：

```text
SPEC-M10-003-BE-01
SPEC-M10-003-FE-01
SPEC-M10-003-QA-01
SPEC-M10-003-SEC-01
SPEC-M10-003-OPS-01
```

## 6. 必须保存的交付证据

```text
evidence/adr
evidence/specs
evidence/contracts
evidence/tests
evidence/security
evidence/performance
evidence/uat
evidence/releases
evidence/runbooks
evidence/pilot
```

上面是受控文档库/制品库的逻辑目录，不是要求在代码仓库新增文件夹。本目录仅保存稳定链接、版本和 Hash；生产 Secret、企业业务原文和高敏测试数据不进入 Git、公共 Acceptance 或上游 Debug Proxy。现有 know/ 的明确批准参考资料例外按 02 管理。

### 6.1 离线校验

```bash
python3 docs/youlin-enterprise-ai-platform/plan/validate_docs.py
python3 docs/youlin-enterprise-ai-platform/plan/test_validate_spec_catalog.py
```

检查 WBS/catalog 覆盖、引用、依赖环、文件/状态一致与证据字段门禁；不核实批准真实性或代替产品验收。校验器负向测试在临时目录改副本，不修改规划原件。

## 7. 变更控制

以下变化必须重新评估排期、预算和验收：

- 将受试者、人遗、PV 或 GxP 受控记录纳入 MVP；
- 对 CTMS/EDC/eTMF/QMS 执行生产写回；
- 对外供应商开放生产数据；
- 引入匿名公网分享；
- 全量历史网盘/数仓迁移；
- 完整企业图数据库或实时数仓；
- Office 多人实时编辑；
- 增加多法人/多客户商业计费。

变更必须形成 ADR/Change Request，说明业务价值、数据边界、风险、人员、周期、预算及对既有里程碑的影响。
