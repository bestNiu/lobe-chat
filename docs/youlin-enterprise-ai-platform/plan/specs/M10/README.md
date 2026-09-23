# M10 详细设计队列

> 设计 W2～W6，C1/C2/C3 滚动；评审 C0 W6～W7；C1 W9/C2 W12/C3 W15；交付 W20。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M10-001](./SPEC-M10-001.md) | Context 模型 | draft | Context Lead | D03, D09, D10, D13 |
| [SPEC-M10-002](./SPEC-M10-002.md) | Project Context | draft | Context Lead | D03, D09, D10, D13 |
| [SPEC-M10-003](./SPEC-M10-003.md) | Context Provider | draft | Context Lead | D03, D09, D10, D13 |
| [SPEC-M10-004](./SPEC-M10-004.md) | Runtime Package | draft | Context Lead | D03, D09, D10, D13 |
| [SPEC-M10-005](./SPEC-M10-005.md) | 权限交集 | draft | Context Lead | D03, D09, D10, D13 |
| [SPEC-M10-006](./SPEC-M10-006.md) | 角色化视图 | draft | Context Lead | D03, D09, D10, D13 |
| [SPEC-M10-007](./SPEC-M10-007.md) | 多人 Audience | draft | Context Lead | D03, D09, D10, D13 |
| [SPEC-M10-008](./SPEC-M10-008.md) | 产出物继承 | draft | Context Lead | D03, D09, D10, D13 |
| [SPEC-M10-009](./SPEC-M10-009.md) | 上下文网络 | draft | Context Lead | D03, D09, D10, D13 |
| [SPEC-M10-010](./SPEC-M10-010.md) | 失效机制 | draft | Context Lead | D03, D09, D10, D13 |
| [SPEC-M10-011](./SPEC-M10-011.md) | 后台 Agent | draft | Context Lead | D03, D09, D10, D13 |
| [SPEC-M10-012](./SPEC-M10-012.md) | 权限解释 | draft | Context Lead | D03, D09, D10, D13 |

## 本批切片边界

12 项均已展开草案，尚未批准。001/003/004/005 的 C0 在 W10 先行，C1/C2 来源合同先于 W15/W18 接入，剩余 C3 设计候选 W15 评审、W20 联验。多人默认权限交集，旧回答无法证明对新受众安全时拒绝分享或重建获权会话；失效从 M3/C0 开始执行，不能等 W20 才阻断离项访问。

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K01](../contracts/K01-identity-and-revocation.md)、[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K05](../contracts/K05-resource-and-knowledge.md)、[K06](../contracts/K06-context-and-memory.md)、[K07](../contracts/K07-data-product-and-api.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。本阶段文件已齐不等于可编码批准；物理 Schema、策略参数、实名评审与真实证据仍待补齐。
