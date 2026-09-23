# M02 详细设计队列

> 设计 W1～W2；评审 W2～W3；交付 W5。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M02-001](./SPEC-M02-001.md) | Keycloak Realm/Client | draft | Identity Lead | D01, D02, D11 |
| [SPEC-M02-002](./SPEC-M02-002.md) | Generic OIDC | draft | Identity Lead | D02 |
| [SPEC-M02-003](./SPEC-M02-003.md) | 企业微信身份适配 | draft | Identity Lead | D01, D02 |
| [SPEC-M02-004](./SPEC-M02-004.md) | 唯一账号映射 | draft | Identity Lead | D01 |
| [SPEC-M02-005](./SPEC-M02-005.md) | 绑定与冲突队列 | draft | Identity Lead | D01, D02 |
| [SPEC-M02-006](./SPEC-M02-006.md) | Session 生命周期 | draft | Identity Lead | D02, D10 |
| [SPEC-M02-007](./SPEC-M02-007.md) | 紧急账号 | draft | Security Lead | D02, D13 |
| [SPEC-M02-008](./SPEC-M02-008.md) | Desktop 登录 | draft | Desktop Lead | D02, D11 |
| [SPEC-M02-009](./SPEC-M02-009.md) | 服务身份 | draft | Identity Lead | D02, D06, D07 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K01](../contracts/K01-identity-and-revocation.md)、[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
