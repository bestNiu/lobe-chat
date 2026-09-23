# M07 详细设计队列

> 设计 W5～W8；评审 W8～W9；交付 W15。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M07-001](./SPEC-M07-001.md) | 知识发布 | draft | Knowledge Owner | D04, D05, D09, D10, D13 |
| [SPEC-M07-002](./SPEC-M07-002.md) | RAG Provider | draft | Knowledge Owner | D04, D05, D09, D10, D13 |
| [SPEC-M07-003](./SPEC-M07-003.md) | 解析检索 | draft | Knowledge Owner | D04, D05, D09, D10, D13 |
| [SPEC-M07-004](./SPEC-M07-004.md) | 引用 | draft | Knowledge Owner | D04, D05, D09, D10, D13 |
| [SPEC-M07-005](./SPEC-M07-005.md) | 评测 | draft | Knowledge Owner | D05, D10, D13, D15 |
| [SPEC-M07-006](./SPEC-M07-006.md) | 个人记忆 | draft | Knowledge Owner | D04, D05, D09, D10, D13 |
| [SPEC-M07-007](./SPEC-M07-007.md) | 项目共享记忆 | draft | Knowledge Owner | D04, D05, D09, D10, D13 |
| [SPEC-M07-008](./SPEC-M07-008.md) | 产出物 | draft | Knowledge Owner | D04, D05, D09, D10, D13 |
| [SPEC-M07-009](./SPEC-M07-009.md) | 生命周期 | draft | Knowledge Owner | D04, D05, D09, D10, D13 |
| [SPEC-M07-010](./SPEC-M07-010.md) | 用户界面 | draft | Knowledge Owner | D04, D05, D09, D10, D13 |

## 本批切片边界

10 项均已展开 draft，未批准。知识发布只激活确定 generation，失败保留的是仍有效且有权使用的旧发布；不允许已撤回旧知识作为降级答案。C1 阶段记忆/产出物默认私有，Promotion 只审本人提交的脱敏草稿，完整多人输出随 M10 联测，不先开放后补权限。

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K05](../contracts/K05-resource-and-knowledge.md)、[K06](../contracts/K06-context-and-memory.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
