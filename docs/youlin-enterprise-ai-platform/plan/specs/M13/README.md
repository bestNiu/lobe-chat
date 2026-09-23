# M13 详细设计队列

> 设计 W20～W23；评审 W23～W24；上线候选 W26。9 项均为 draft，未执行或批准。
>
> 候选 A：SRE Lead；实名发布决策及领域批准人待认领。依赖 D11/D13/D14/D15/D16/D17。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M13-001](./SPEC-M13-001.md) | 生产准备 | draft | SRE Lead | D11, D13, D14, D15, D16, D17 |
| [SPEC-M13-002](./SPEC-M13-002.md) | 用户/组织导入 | draft | SRE Lead | D11, D13, D14, D15, D16, D17 |
| [SPEC-M13-003](./SPEC-M13-003.md) | 内容发布 | draft | SRE Lead | D11, D13, D14, D15, D16, D17 |
| [SPEC-M13-004](./SPEC-M13-004.md) | Data/API 发布 | draft | SRE Lead | D11, D13, D14, D15, D16, D17 |
| [SPEC-M13-005](./SPEC-M13-005.md) | Desktop 发布 | draft | SRE Lead | D11, D13, D14, D15, D16, D17 |
| [SPEC-M13-006](./SPEC-M13-006.md) | 培训 | draft | SRE Lead | D11, D13, D14, D15, D16, D17 |
| [SPEC-M13-007](./SPEC-M13-007.md) | 支持机制 | draft | SRE Lead | D11, D13, D14, D15, D16, D17 |
| [SPEC-M13-008](./SPEC-M13-008.md) | Go/No-Go | draft | SRE Lead | D11, D13, D14, D15, D16, D17 |
| [SPEC-M13-009](./SPEC-M13-009.md) | 发布验证 | draft | SRE Lead | D11, D13, D14, D15, D16, D17 |

## 两道发布门

1. **部署前 Go/No-Go**：RC/UAT/安全/恢复、真实环境准备、人员与数据范围、支持/回退窗口均就绪；未决硬门禁不得接受。
2. **部署后 Smoke 与放流量**：M13-009 对实际制品/配置执行关键真链和负向权限测试；失败停止或回退并复测。部署前不能预签尚未执行的 Smoke。

Pilot 限批准两部门、20～50 人、至少两个通用 Project，内容/能力与一个低敏内部 API 按确定版本发布；不开放外部生产消费者或高风险写回。

培训材料已发不等于参加培训，监控配置存在不等于有人值班。AC-15 在本阶段只有 readiness，4～6 周实际结果在 M14 签收。

共享合同：[K01～K08](../contracts/README.md)。名单、Secret、生产配置原文与报告保存在受控库，不写入 Git。
