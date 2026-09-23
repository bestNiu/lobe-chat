# M01 详细设计队列

> 设计 W1～W3；评审 W1～W4 按切片；交付 W4。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M01-001](./SPEC-M01-001.md) | 本地开发基线 | draft | Tech Lead | D07 |
| [SPEC-M01-002](./SPEC-M01-002.md) | CI 基线 | draft | Tech Lead | D07 |
| [SPEC-M01-003](./SPEC-M01-003.md) | 制品与镜像 | draft | SRE Lead | D07 |
| [SPEC-M01-004](./SPEC-M01-004.md) | 环境部署 | draft | SRE Lead | D07, D14 |
| [SPEC-M01-005](./SPEC-M01-005.md) | 数据库迁移 | draft | Database Lead | D13, D14 |
| [SPEC-M01-006](./SPEC-M01-006.md) | Secret 管理 | draft | Security Lead | D07, D13 |
| [SPEC-M01-007](./SPEC-M01-007.md) | 可观测 | draft | SRE Lead | D13, D14 |
| [SPEC-M01-008](./SPEC-M01-008.md) | Feature Flag 基础 | draft | Tech Lead | D07, D10 |
| [SPEC-M01-009](./SPEC-M01-009.md) | 测试数据 | draft | QA Lead | D13 |
| [SPEC-M01-010](./SPEC-M01-010.md) | 上游同步流水线 | draft | Tech Lead | D17 |
| [SPEC-M01-011](./SPEC-M01-011.md) | 私有队列与事件骨架 | draft | SRE Lead | D07 |
| [SPEC-M01-012](./SPEC-M01-012.md) | 审计完整性与保留骨架 | draft | Security Lead | D07, D13 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K01](../contracts/K01-identity-and-revocation.md)、[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
