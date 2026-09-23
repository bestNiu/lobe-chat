# M09 详细设计队列

> 设计 W2～W4；评审 W4～W6 按切片；交付 W18。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| SPEC-M09-001 | 湖仓存储 | planned | Data Owner | D08, D10, D13, D14 |
| SPEC-M09-002 | 低敏数据源 | planned | Data Owner | D08, D10, D13, D14 |
| SPEC-M09-003 | 分层 Pipeline | planned | Data Owner | D08, D10, D13, D14 |
| SPEC-M09-004 | 表格式/查询 | planned | Data Owner | D08, D10, D13, D14 |
| SPEC-M09-005 | 数据目录 | planned | Data Owner | D08, D10, D13, D14 |
| SPEC-M09-006 | Data Product | planned | Data Owner | D08, D10, D13, D14 |
| SPEC-M09-007 | 内部 API | planned | Data Owner | D08, D10, D13, D14 |
| SPEC-M09-008 | Client/Gateway | planned | Data Owner | D08, D10, D13, D14 |
| SPEC-M09-009 | 数据授权 | planned | Data Owner | D08, D10, D13, D14 |
| SPEC-M09-010 | 数据安全 | planned | Data Owner | D08, D10, D13, D14 |
| SPEC-M09-011 | 质量与血缘 | planned | Data Owner | D08, D10, D13, D14 |
| SPEC-M09-012 | 控制面 UI | planned | Data Owner | D08, D10, D13, D14 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K07](../contracts/K07-data-product-and-api.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
