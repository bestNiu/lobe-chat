# M00 详细设计队列

> 设计 W1；评审 W1～W2；交付 W2。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M00-001](./SPEC-M00-001.md) | MVP 范围冻结 | draft | Product Owner | D17 |
| [SPEC-M00-002](./SPEC-M00-002.md) | 身份与组织 ADR | draft | Identity Lead | D01, D02 |
| [SPEC-M00-003](./SPEC-M00-003.md) | Project/Context ADR | draft | Project Owner | D03, D10 |
| [SPEC-M00-004](./SPEC-M00-004.md) | 资源与知识 ADR | draft | Resource Owner | D04, D05, D13 |
| [SPEC-M00-005](./SPEC-M00-005.md) | 数据/API ADR | draft | Data Owner | D08 |
| [SPEC-M00-006](./SPEC-M00-006.md) | 集成边界 | draft | Tech Lead | D05, D06, D12 |
| [SPEC-M00-007](./SPEC-M00-007.md) | 安全与数据范围 | draft | Security Lead | D06, D13 |
| [SPEC-M00-008](./SPEC-M00-008.md) | 工程与上游策略 | draft | Tech Lead | D07, D17 |
| [SPEC-M00-009](./SPEC-M00-009.md) | 团队/RACI/预算 | draft | Product Owner | D17 |
| [SPEC-M00-010](./SPEC-M00-010.md) | 证据与决策库 | draft | QA Lead | D13, D17 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K01](../contracts/K01-identity-and-revocation.md)、[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K04](../contracts/K04-registry-review-and-execution.md)、[K05](../contracts/K05-resource-and-knowledge.md)、[K06](../contracts/K06-context-and-memory.md)、[K07](../contracts/K07-data-product-and-api.md)、[K08](../contracts/K08-workbench-and-modules.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
