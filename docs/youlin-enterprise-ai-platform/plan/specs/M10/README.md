# M10 详细设计队列

> 设计 W2～W6，C1/C2/C3 滚动；评审 C0 W6～W7；C1 W9/C2 W12/C3 W15；交付 W20。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| SPEC-M10-001 | Context 模型 | planned | Context Lead | D03, D09, D10, D13 |
| SPEC-M10-002 | Project Context | planned | Context Lead | D03, D09, D10, D13 |
| SPEC-M10-003 | Context Provider | planned | Context Lead | D03, D09, D10, D13 |
| SPEC-M10-004 | Runtime Package | planned | Context Lead | D03, D09, D10, D13 |
| SPEC-M10-005 | 权限交集 | planned | Context Lead | D03, D09, D10, D13 |
| SPEC-M10-006 | 角色化视图 | planned | Context Lead | D03, D09, D10, D13 |
| SPEC-M10-007 | 多人 Audience | planned | Context Lead | D03, D09, D10, D13 |
| SPEC-M10-008 | 产出物继承 | planned | Context Lead | D03, D09, D10, D13 |
| SPEC-M10-009 | 上下文网络 | planned | Context Lead | D03, D09, D10, D13 |
| SPEC-M10-010 | 失效机制 | planned | Context Lead | D03, D09, D10, D13 |
| SPEC-M10-011 | 后台 Agent | planned | Context Lead | D03, D09, D10, D13 |
| SPEC-M10-012 | 权限解释 | planned | Context Lead | D03, D09, D10, D13 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K01](../contracts/K01-identity-and-revocation.md)、[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K05](../contracts/K05-resource-and-knowledge.md)、[K06](../contracts/K06-context-and-memory.md)、[K07](../contracts/K07-data-product-and-api.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
