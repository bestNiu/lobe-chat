# M14 详细设计队列

> 设计 W1～W12 指标；W23～W26 运营；评审 指标 W16；运营 W26；交付 W32。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| SPEC-M14-001 | Pilot 运营 | planned | Product Owner | D14, D15, D17 |
| SPEC-M14-002 | 产品指标 | planned | Product Owner | D14, D15, D17 |
| SPEC-M14-003 | 质量复评 | planned | Product Owner | D14, D15, D17 |
| SPEC-M14-004 | 安全复核 | planned | Product Owner | D14, D15, D17 |
| SPEC-M14-005 | 用户研究 | planned | Product Owner | D14, D15, D17 |
| SPEC-M14-006 | TCO | planned | Product Owner | D14, D15, D17 |
| SPEC-M14-007 | 问题闭环 | planned | Product Owner | D14, D15, D17 |
| SPEC-M14-008 | 场景评分 | planned | Product Owner | D14, D15, D17 |
| SPEC-M14-009 | Stage 投资门 | planned | Product Owner | D14, D15, D17 |
| SPEC-M14-010 | Pilot 结论 | planned | Product Owner | D14, D15, D17 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K01](../contracts/K01-identity-and-revocation.md)、[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K04](../contracts/K04-registry-review-and-execution.md)、[K05](../contracts/K05-resource-and-knowledge.md)、[K06](../contracts/K06-context-and-memory.md)、[K07](../contracts/K07-data-product-and-api.md)、[K08](../contracts/K08-workbench-and-modules.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
