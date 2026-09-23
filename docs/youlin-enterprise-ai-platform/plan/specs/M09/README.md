# M09 详细设计队列

> 设计 W2～W4；评审 W4～W6 按切片；交付 W18。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M09-001](./SPEC-M09-001.md) | 湖仓存储 | draft | Data Owner | D08, D10, D13, D14 |
| [SPEC-M09-002](./SPEC-M09-002.md) | 低敏数据源 | draft | Data Owner | D08, D10, D13, D14 |
| [SPEC-M09-003](./SPEC-M09-003.md) | 分层 Pipeline | draft | Data Owner | D08, D10, D13, D14 |
| [SPEC-M09-004](./SPEC-M09-004.md) | 表格式/查询 | draft | Data Owner | D08, D10, D13, D14 |
| [SPEC-M09-005](./SPEC-M09-005.md) | 数据目录 | draft | Data Owner | D08, D10, D13, D14 |
| [SPEC-M09-006](./SPEC-M09-006.md) | Data Product | draft | Data Owner | D08, D10, D13, D14 |
| [SPEC-M09-007](./SPEC-M09-007.md) | 内部 API | draft | Data Owner | D08, D10, D13, D14 |
| [SPEC-M09-008](./SPEC-M09-008.md) | Client/Gateway | draft | Data Owner | D08, D10, D13, D14 |
| [SPEC-M09-009](./SPEC-M09-009.md) | 数据授权 | draft | Data Owner | D08, D10, D13, D14 |
| [SPEC-M09-010](./SPEC-M09-010.md) | 数据安全 | draft | Data Owner | D08, D10, D13, D14 |
| [SPEC-M09-011](./SPEC-M09-011.md) | 质量与血缘 | draft | Data Owner | D08, D10, D13, D14 |
| [SPEC-M09-012](./SPEC-M09-012.md) | 控制面 UI | draft | Data Owner | D08, D10, D13, D14 |

## 本批切片边界

12 项均已形成草案，尚未批准。Data Product 草稿契约先提供给质量/授权设计，真正发布必须收齐候选 Gold 与质量证据；这不是通过删除依赖绕过质量门。内部 API 还须实际 Gateway、Grant、行列/脱敏与新鲜度检查，W18 与 Context C2 联合验证；外部生产消费者仍禁止。

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K07](../contracts/K07-data-product-and-api.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
