# M04 详细设计队列

> 设计 W1～W2；评审 W2～W3；交付 W8。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| SPEC-M04-001 | Web 基线 | planned | Desktop Lead | D02, D07, D11 |
| SPEC-M04-002 | Desktop 构建 | planned | Desktop Lead | D02, D07, D11 |
| SPEC-M04-003 | Desktop Auth | planned | Desktop Lead | D02, D07, D11 |
| SPEC-M04-004 | 本地能力策略 | planned | Desktop Lead | D02, D07, D11 |
| SPEC-M04-005 | 签名与更新 | planned | Desktop Lead | D02, D07, D11 |
| SPEC-M04-006 | 多端一致性 | planned | Desktop Lead | D02, D07, D11 |
| SPEC-M04-007 | 私有部署 | planned | Desktop Lead | D02, D07, D11 |
| SPEC-M04-008 | 离线边界 | planned | Desktop Lead | D02, D07, D11 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K01](../contracts/K01-identity-and-revocation.md)、[K08](../contracts/K08-workbench-and-modules.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
