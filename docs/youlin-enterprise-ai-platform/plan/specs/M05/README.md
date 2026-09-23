# M05 详细设计队列

> 设计 W3～W5；评审 W5～W6；Review W8；交付 W10。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M05-001](./SPEC-M05-001.md) | 通用 Registry | draft | AI Lead | D05, D06, D07, D10, D16 |
| [SPEC-M05-002](./SPEC-M05-002.md) | Skill | draft | AI Lead | D05, D06, D07, D10, D16 |
| [SPEC-M05-003](./SPEC-M05-003.md) | Tool/MCP/插件绑定 | draft | AI Lead | D05, D06, D07, D10, D16 |
| [SPEC-M05-004](./SPEC-M05-004.md) | Workflow | draft | AI Lead | D05, D06, D07, D10, D16 |
| [SPEC-M05-005](./SPEC-M05-005.md) | Agent | draft | AI Lead | D05, D06, D07, D10, D16 |
| [SPEC-M05-006](./SPEC-M05-006.md) | Model/Prompt | draft | AI Lead | D05, D06, D07, D10, D16 |
| [SPEC-M05-007](./SPEC-M05-007.md) | 发布评审 | draft | AI Lead | D05, D06, D07, D10, D16 |
| [SPEC-M05-008](./SPEC-M05-008.md) | 运行追踪 | draft | AI Lead | D05, D06, D07, D10, D16 |
| [SPEC-M05-009](./SPEC-M05-009.md) | 回滚/停用 | draft | AI Lead | D05, D06, D07, D10, D16 |
| [SPEC-M05-010](./SPEC-M05-010.md) | 示例能力 | draft | AI Lead | D05, D06, D07, D10, D16 |
| [SPEC-M05-011](./SPEC-M05-011.md) | 会话与运行工作台 | draft | AI Lead | D05, D06, D07, D10, D16 |

## 本批切片边界

11 项已展开草案，均未批准。M05-007 消费 M11-006 通用 Review 核心，Registry 不依赖自身已发布能力来启动评审；M10 C0 消费 Registry Manifest 模型，不反向依赖 Agent 运行，避免循环等待。W10 示例以合成为主，真实知识灯塔等 C1；会话在 W16/W20 追加引用/Audience 联测。

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K04](../contracts/K04-registry-review-and-execution.md)、[K06](../contracts/K06-context-and-memory.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
