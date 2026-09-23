# M04 详细设计队列

> 设计 W1～W2；评审 W2～W3；交付 W8。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M04-001](./SPEC-M04-001.md) | Web 基线 | draft | Desktop Lead | D02, D07, D11 |
| [SPEC-M04-002](./SPEC-M04-002.md) | Desktop 构建 | draft | Desktop Lead | D02, D07, D11 |
| [SPEC-M04-003](./SPEC-M04-003.md) | Desktop Auth | draft | Desktop Lead | D02, D07, D11 |
| [SPEC-M04-004](./SPEC-M04-004.md) | 本地能力策略 | draft | Desktop Lead | D02, D07, D11 |
| [SPEC-M04-005](./SPEC-M04-005.md) | 签名与更新 | draft | Desktop Lead | D02, D07, D11 |
| [SPEC-M04-006](./SPEC-M04-006.md) | 多端一致性 | draft | Desktop Lead | D02, D07, D11 |
| [SPEC-M04-007](./SPEC-M04-007.md) | 私有部署 | draft | Desktop Lead | D02, D07, D11 |
| [SPEC-M04-008](./SPEC-M04-008.md) | 离线边界 | draft | Desktop Lead | D02, D07, D11 |

## 本批切片边界

8 项已展开草案，均未批准。W8 只提供多端身份/权限基础和部署路径；资源、记忆、Audience 随 M6/M7/M10 补真实一致性，完整 AC-05 与 DR 证据在 M12 汇总，不用 Mock 提前签全部多端能力。

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K01](../contracts/K01-identity-and-revocation.md)、[K08](../contracts/K08-workbench-and-modules.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
