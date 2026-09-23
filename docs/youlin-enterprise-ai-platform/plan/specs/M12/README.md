# M12 详细设计队列

> 设计 W1～W4 策略、W18～W21 执行细化；评审 W21～W22；交付候选 W24。10 项均为 draft，未执行或批准。
>
> 候选 A：QA Lead；实名与跨角色签署按 D17 认领。决策依赖 D13/D14/D15/D17，不能把候选 SLO/RPO/RTO 当已批准标准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M12-001](./SPEC-M12-001.md) | 全量回归 | draft | QA Lead | D13, D14, D15, D17 |
| [SPEC-M12-002](./SPEC-M12-002.md) | 安全测试 | draft | QA Lead | D13, D14, D15, D17 |
| [SPEC-M12-003](./SPEC-M12-003.md) | 性能容量 | draft | QA Lead | D13, D14, D15, D17 |
| [SPEC-M12-004](./SPEC-M12-004.md) | 数据一致性 | draft | QA Lead | D13, D14, D15, D17 |
| [SPEC-M12-005](./SPEC-M12-005.md) | 故障注入 | draft | QA Lead | D13, D14, D15, D17 |
| [SPEC-M12-006](./SPEC-M12-006.md) | 备份恢复 | draft | QA Lead | D13, D14, D15, D17 |
| [SPEC-M12-007](./SPEC-M12-007.md) | 升级回滚 | draft | QA Lead | D13, D14, D15, D17 |
| [SPEC-M12-008](./SPEC-M12-008.md) | UAT | draft | QA Lead | D13, D14, D15, D17 |
| [SPEC-M12-009](./SPEC-M12-009.md) | 文档培训 | draft | QA Lead | D13, D14, D15, D17 |
| [SPEC-M12-010](./SPEC-M12-010.md) | 缺陷/风险 | draft | QA Lead | D13, D14, D15, D17 |

## 执行与签收边界

- 固定 RC、配置、AI 资产、语料、策略与测试数据版本；真实接口和授权链必须实测，Mock 不能签生产 AC。
- AC-01～14、AC-16～33 回归；AC-15 只验证 readiness。M4/M11 留到此阶段的跨端、恢复、容量与业务 UAT 证据在此汇总。
- 开放 P0/P1 缺陷或 Critical/High 安全风险一律阻断；低风险接受也须实名、补偿、到期和复测。
- 恢复必须包括 KMS/身份/策略/删除撤权账本、原件和业务验证，不只启动数据库。
- 本阶段主要交付测试/演练/批准记录，不默认新增业务表或 API；N/A 需说明理由，不能免除证据。
- 所有用例尚待执行，文档齐全不等于 RC/UAT 通过。

共享合同：[K01～K08](../contracts/README.md)。真实报告仅存受控证据库，Git 保存合成定义与脱敏结论。
