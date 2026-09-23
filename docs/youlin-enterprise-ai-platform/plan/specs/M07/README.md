# M07 详细设计队列

> 设计 W5～W8；评审 W8～W9；交付 W15。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| SPEC-M07-001 | 知识发布 | planned | Knowledge Owner | D04, D05, D09, D10, D13 |
| SPEC-M07-002 | RAG Provider | planned | Knowledge Owner | D04, D05, D09, D10, D13 |
| SPEC-M07-003 | 解析检索 | planned | Knowledge Owner | D04, D05, D09, D10, D13 |
| SPEC-M07-004 | 引用 | planned | Knowledge Owner | D04, D05, D09, D10, D13 |
| SPEC-M07-005 | 评测 | planned | Knowledge Owner | D04, D05, D09, D10, D13 |
| SPEC-M07-006 | 个人记忆 | planned | Knowledge Owner | D04, D05, D09, D10, D13 |
| SPEC-M07-007 | 项目共享记忆 | planned | Knowledge Owner | D04, D05, D09, D10, D13 |
| SPEC-M07-008 | 产出物 | planned | Knowledge Owner | D04, D05, D09, D10, D13 |
| SPEC-M07-009 | 生命周期 | planned | Knowledge Owner | D04, D05, D09, D10, D13 |
| SPEC-M07-010 | 用户界面 | planned | Knowledge Owner | D04, D05, D09, D10, D13 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K05](../contracts/K05-resource-and-knowledge.md)、[K06](../contracts/K06-context-and-memory.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
