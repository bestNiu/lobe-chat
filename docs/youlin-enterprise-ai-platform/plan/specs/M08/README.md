# M08 详细设计队列

> 设计 W9～W12；评审 W12～W13；交付 W16。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M08-001](./SPEC-M08-001.md) | 内容盘点 | draft | Knowledge Owner | D05, D06, D15 |
| [SPEC-M08-002](./SPEC-M08-002.md) | 来源治理 | draft | Knowledge Owner | D05, D06, D15 |
| [SPEC-M08-003](./SPEC-M08-003.md) | 领域 Skills | draft | Knowledge Owner | D05, D06, D15 |
| [SPEC-M08-004](./SPEC-M08-004.md) | 问答 Workflow | draft | Knowledge Owner | D05, D06, D15 |
| [SPEC-M08-005](./SPEC-M08-005.md) | Answer UI | draft | Knowledge Owner | D05, D06, D15 |
| [SPEC-M08-006](./SPEC-M08-006.md) | 深链接 Tool | draft | Knowledge Owner | D05, D06, D15 |
| [SPEC-M08-007](./SPEC-M08-007.md) | 执行清单 | draft | Knowledge Owner | D05, D06, D15 |
| [SPEC-M08-008](./SPEC-M08-008.md) | 了解有临衔接 | draft | Knowledge Owner | D05, D06, D15 |
| [SPEC-M08-009](./SPEC-M08-009.md) | 质量 Dashboard | draft | Knowledge Owner | D05, D06, D15 |
| [SPEC-M08-010](./SPEC-M08-010.md) | 黄金评测 | draft | Knowledge Owner | D05, D06, D15 |

## 本批切片边界

10 项均已形成草案，尚未批准。W16 灯塔须具备 W15 真实 C1、确定知识/Workflow/模型版本及固定留出集，不能用合成链签 AC-21。W16 提供最小反馈落盘/人工处理与质量指标，W22 才汇入统一反馈运营；清单确认不等于泛微正式批准。

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K04](../contracts/K04-registry-review-and-execution.md)、[K05](../contracts/K05-resource-and-knowledge.md)、[K06](../contracts/K06-context-and-memory.md)、[K08](../contracts/K08-workbench-and-modules.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
