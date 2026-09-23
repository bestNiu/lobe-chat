# M06 详细设计队列

> 设计 W3～W6；评审 W6～W7；交付 W14。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M06-001](./SPEC-M06-001.md) | 资源模型 | draft | Resource Owner | D04, D10, D13 |
| [SPEC-M06-002](./SPEC-M06-002.md) | OSS Provider | draft | Resource Owner | D04, D10, D13 |
| [SPEC-M06-003](./SPEC-M06-003.md) | 上传 | draft | Resource Owner | D04, D10, D13 |
| [SPEC-M06-004](./SPEC-M06-004.md) | 预览 | draft | Resource Owner | D04, D10, D13 |
| [SPEC-M06-005](./SPEC-M06-005.md) | 文件管理 | draft | Resource Owner | D04, D10, D13 |
| [SPEC-M06-006](./SPEC-M06-006.md) | 版本 | draft | Resource Owner | D04, D10, D13 |
| [SPEC-M06-007](./SPEC-M06-007.md) | 分享 | draft | Resource Owner | D04, D10, D13 |
| [SPEC-M06-008](./SPEC-M06-008.md) | 回收与删除 | draft | Resource Owner | D04, D10, D13 |
| [SPEC-M06-009](./SPEC-M06-009.md) | 配额和运营 | draft | Resource Owner | D04, D10, D13 |
| [SPEC-M06-010](./SPEC-M06-010.md) | 一致性 | draft | Resource Owner | D04, D10, D13 |
| [SPEC-M06-011](./SPEC-M06-011.md) | 文本编辑与集合引用 | draft | Resource Owner | D04, D10, D13 |
| [SPEC-M06-012](./SPEC-M06-012.md) | 格式与安全预览矩阵 | draft | Resource Owner | D04, D10, D13 |

## 本批切片边界

12 项均已展开 draft，未批准。W11 上传/API 必须同时具备实际扫描、不可变载荷、配额预留、格式限制与实时访问控制；M06-009/012 的安全核心需前置，不能等 W14 运营/格式矩阵完整时再补。扫描证据绑定确切 Hash/对象版本，防扫描后覆盖上传对象。

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K05](../contracts/K05-resource-and-knowledge.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
