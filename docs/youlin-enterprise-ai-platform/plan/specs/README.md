# 逐项 Spec 设计工作区

> 状态：完整 Spec 仍为设计草案批次 1～6；M01-001-S1 与 M02-006-S1/S2 隔离开发已启动，工具链/内核/数据库原型与工程测试另记[当前进度](../09-development-progress.md)，不等于父 Spec 已批准/交付/验收。W1 指项目实际启动周，目前没有获批日历日期。

## 1. 本批次交付

- [全量设计索引](./index.md)：覆盖现有 159 项 Spec，保留原 ID；机器索引为 [catalog.json](./catalog.json)。
- M00～M03：41 份逐项设计草案，含故事、状态/数据约束、契约候选、权限、异常、测试和交付拆分。
- 批次 2：M04 全部 8 项、M05 全部 11 项、M10 的 001/003/004/005（C0 核心与后续边界）、M11-006（Review 核心）共新增 24 份草案。
- 批次 3：M06 全部 12 项、M07 全部 10 项、M11-013/014 共新增 24 份草案；覆盖上传/扫描/实时访问、知识原子发布、记忆 Promotion、产出物权限和 CRM 融合。
- 批次 4：M08 员工助手 10 项、M09 数据/API 12 项，共新增 22 份草案；涵盖来源与拒答、黄金评测、内部产品质量/授权/查询和控制面。
- 批次 5：M10 剩余 8 项、M11 剩余 11 项，共新增 19 份草案；补齐角色/Audience/输出继承/网络/失效/后台 Agent，以及首页、搜索、任务、通知和运营。
- 批次 6：M12 发布候选/UAT 10 项、M13 Pilot 上线 9 项、M14 真实运行/投资决策 10 项，共新增 29 份草案。
- 累计 159 项全部有逐项 draft，planned=0；尚无 approved 或实际开发/验收。文件覆盖完成不代表全部物理 Schema/可执行契约/脚本已就绪。
- [关键契约](./contracts/README.md)：8 份跨里程碑逻辑契约草案，为提前切片提供评审输入；不是已经通过供应商验证的 OpenAPI/物理 Schema。
- [滚动设计与批准计划](../07-detailed-spec-design-plan.md)：设计窗口、DoR、认领及批准规则。

## 2. 阅读与执行

1. 先读 [统一基线](../04-unified-baseline-and-decision-register.md)、[DoR 与验证细则](../05-spec-design-and-verification-details.md)和[架构](../../18-application-and-technical-architecture.md)。
2. 从 index 进入对应里程碑与单项文档；单项逻辑字段/路由为候选，不是已上线接口。
3. 认领单项 A、实现负责人、QA、Security/领域 Reviewer；角色名不能代替实名签署。
4. 关联 D01～D17 的批准证据，展开实际 OpenAPI/JSON Schema/数据库迁移/交互设计、威胁模型与测试夹具。
5. 满足 DoR 才将该项设计改为 approved；允许独立切片先批准，但须明确批准范围，不能把父 Spec 一并标为完成。

## 3. 状态分开记录

`designStatus = planned | draft | in_review | approved | superseded`。

`deliveryStatus = not_started | in_development | merged | in_verification | verified | accepted | released`。

另记 `blockedBy`、批准人、批准版本、Evidence；blocked 不是完成状态。设计 approved 不推导代码 merged；测试 verified 不推导业务 accepted。M0 文档任务用获批准文档作为交付，不伪造代码 PR。

159 项全部为 draft，planned=0；完整父 Spec 的 deliveryStatus=not_started；提前工程切片通过 `executionSliceIds` 关联[执行账](../execution-slices.json)，不能把已有切片代码算成完整任务完成，也不能漏报实际编码工作。任何物理接口/真实 Owner/保留/SLO 未定都不隐去。catalog 的 `milestoneContexts.acContext/frContext` 为里程碑覆盖范围，逐项 `requirementRefs` 为对应分项证据范围，实际签收以详细 Spec 和原追踪矩阵为准，不宣称一项独立覆盖整组 AC。

## 4. 文件与变更

- `Mxx/SPEC-Mxx-xxx.md`：单项设计，一项一文件；后续文件准备好后再登记 `designPath`。
- `Mxx/README.md`：里程碑设计入口及分期交付/验收边界，当前 M00～M14 文件均已覆盖。
- `contracts/Kxx-*.md`：共享契约，不另造新功能 Spec ID，不代替原 Spec 的交付责任。
- `catalog.json`：ID、任务名、状态、文件、候选角色、决策、契约、设计窗口、交付周与证据引用；`slicePlan` 记录有跨期交付的先行/最终边界，不包含生产数据。
- `index.md`：供人阅读的目录；和 catalog/WBS 同步更新并运行校验。

catalog 为便于审阅采用每条 Spec 一行的 JSON 排版；人读目录使用 index.md。更新记录须同时更新对应文档及里程碑目录，不能只改其中一个状态。

机器校验只证明结构/引用/枚举/覆盖关系，不判断设计质量、真实批准、工期可行性或部署结果。新增字段/边界影响消费者时必须一起更新契约、Spec、负向测试与 D17 容量。
