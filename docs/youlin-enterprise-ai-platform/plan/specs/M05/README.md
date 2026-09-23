# M05 详细设计队列

> 设计 W3～W5；评审 W5～W6；Review W8；交付 W10。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| SPEC-M05-001 | 通用 Registry | planned | AI Lead | D05, D06, D07, D10, D16 |
| SPEC-M05-002 | Skill | planned | AI Lead | D05, D06, D07, D10, D16 |
| SPEC-M05-003 | Tool/MCP/插件绑定 | planned | AI Lead | D05, D06, D07, D10, D16 |
| SPEC-M05-004 | Workflow | planned | AI Lead | D05, D06, D07, D10, D16 |
| SPEC-M05-005 | Agent | planned | AI Lead | D05, D06, D07, D10, D16 |
| SPEC-M05-006 | Model/Prompt | planned | AI Lead | D05, D06, D07, D10, D16 |
| SPEC-M05-007 | 发布评审 | planned | AI Lead | D05, D06, D07, D10, D16 |
| SPEC-M05-008 | 运行追踪 | planned | AI Lead | D05, D06, D07, D10, D16 |
| SPEC-M05-009 | 回滚/停用 | planned | AI Lead | D05, D06, D07, D10, D16 |
| SPEC-M05-010 | 示例能力 | planned | AI Lead | D05, D06, D07, D10, D16 |
| SPEC-M05-011 | 会话与运行工作台 | planned | AI Lead | D05, D06, D07, D10, D16 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K04](../contracts/K04-registry-review-and-execution.md)、[K06](../contracts/K06-context-and-memory.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
