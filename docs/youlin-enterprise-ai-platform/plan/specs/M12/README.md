# M12 详细设计队列

> 设计 W1～W4 策略；W18～W21 执行设计；评审 W21～W22；交付 W24。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| SPEC-M12-001 | 全量回归 | planned | QA Lead | D13, D14, D15, D17 |
| SPEC-M12-002 | 安全测试 | planned | QA Lead | D13, D14, D15, D17 |
| SPEC-M12-003 | 性能容量 | planned | QA Lead | D13, D14, D15, D17 |
| SPEC-M12-004 | 数据一致性 | planned | QA Lead | D13, D14, D15, D17 |
| SPEC-M12-005 | 故障注入 | planned | QA Lead | D13, D14, D15, D17 |
| SPEC-M12-006 | 备份恢复 | planned | QA Lead | D13, D14, D15, D17 |
| SPEC-M12-007 | 升级回滚 | planned | QA Lead | D13, D14, D15, D17 |
| SPEC-M12-008 | UAT | planned | QA Lead | D13, D14, D15, D17 |
| SPEC-M12-009 | 文档培训 | planned | QA Lead | D13, D14, D15, D17 |
| SPEC-M12-010 | 缺陷/风险 | planned | QA Lead | D13, D14, D15, D17 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K01](../contracts/K01-identity-and-revocation.md)、[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K04](../contracts/K04-registry-review-and-execution.md)、[K05](../contracts/K05-resource-and-knowledge.md)、[K06](../contracts/K06-context-and-memory.md)、[K07](../contracts/K07-data-product-and-api.md)、[K08](../contracts/K08-workbench-and-modules.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
