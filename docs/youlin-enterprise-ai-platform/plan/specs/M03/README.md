# M03 详细设计队列

> 设计 W2～W3；评审 W3～W4；交付 W7。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M03-001](./SPEC-M03-001.md) | HR/组织同步 | draft | Identity Lead | D01, D03 |
| [SPEC-M03-002](./SPEC-M03-002.md) | 组织模型 | draft | Identity Lead | D01 |
| [SPEC-M03-003](./SPEC-M03-003.md) | Workspace | draft | Tech Lead | D01, D03 |
| [SPEC-M03-004](./SPEC-M03-004.md) | Project 基础 | draft | Project Owner | D03 |
| [SPEC-M03-005](./SPEC-M03-005.md) | Membership | draft | Project Owner | D03, D10 |
| [SPEC-M03-006](./SPEC-M03-006.md) | 授权服务 | draft | Security Lead | D03, D10 |
| [SPEC-M03-007](./SPEC-M03-007.md) | Resource ACL | draft | Security Lead | D03, D10, D13 |
| [SPEC-M03-008](./SPEC-M03-008.md) | 权限管理 UI | draft | Product Owner | D03, D10 |
| [SPEC-M03-009](./SPEC-M03-009.md) | 权限缓存失效 | draft | Security Lead | D02, D10 |
| [SPEC-M03-010](./SPEC-M03-010.md) | 权限负向测试 | draft | QA Lead | D03, D10 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K01](../contracts/K01-identity-and-revocation.md)、[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
