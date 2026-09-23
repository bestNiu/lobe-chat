# M11 详细设计队列

> 设计 W3～W5，领域 UI 滚动；评审 W5～W6 骨架；规则 W8；交付 W22。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| [SPEC-M11-001](./SPEC-M11-001.md) | 企业首页 | draft | Product Owner | D10, D12, D16 |
| [SPEC-M11-002](./SPEC-M11-002.md) | 统一导航/应用中心 | draft | Product Owner | D10, D12, D16 |
| [SPEC-M11-003](./SPEC-M11-003.md) | 全局搜索 | draft | Product Owner | D10, D12, D16 |
| [SPEC-M11-004](./SPEC-M11-004.md) | 我的任务 | draft | Product Owner | D10, D12, D16 |
| [SPEC-M11-005](./SPEC-M11-005.md) | 通知 | draft | Product Owner | D10, D12, D16 |
| [SPEC-M11-006](./SPEC-M11-006.md) | 统一评审 | draft | Product Owner | D10, D13, D16 |
| [SPEC-M11-007](./SPEC-M11-007.md) | 用户设置 | draft | Product Owner | D10, D12, D16 |
| [SPEC-M11-008](./SPEC-M11-008.md) | 反馈与支持 | draft | Product Owner | D10, D12, D16 |
| [SPEC-M11-009](./SPEC-M11-009.md) | 企业配置 | draft | Product Owner | D10, D12, D16 |
| [SPEC-M11-010](./SPEC-M11-010.md) | Feature Flag | draft | Product Owner | D10, D12, D16 |
| [SPEC-M11-011](./SPEC-M11-011.md) | 运营中心 | draft | Product Owner | D10, D12, D16 |
| [SPEC-M11-012](./SPEC-M11-012.md) | 帮助和 Runbook | draft | Product Owner | D10, D12, D16 |
| [SPEC-M11-013](./SPEC-M11-013.md) | Module Registry 与融合容器 | draft | Product Owner | D02, D10, D12 |
| [SPEC-M11-014](./SPEC-M11-014.md) | CRM/OA 与 Launch Code 验证 | draft | Product Owner | D02, D10, D12 |

## 本批切片边界

14 项均已展开草案，尚未批准。首页/搜索/任务/通知/设置/支持与运营在 W22 汇聚各域真实服务；最小反馈 W16 先行，统一中心不复制全量历史正文。运营 UI/Runbook 不是恢复验收，完整 AC-33 在 M12。W8 冻结模块/启动合同，W14 验证真实 CRM 兼容性，W22 汇总应用中心与安全降级；Launch Code 不替代模块自身 OIDC。W8 提交/决定/职责分离/最小 UI 先给领域服务消费，W22 才完成统一运营入口；批准结果不等于领域发布成功，双方通过版本/Hash、幂等事件与对账关联。

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K04](../contracts/K04-registry-review-and-execution.md)、[K08](../contracts/K08-workbench-and-modules.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。本阶段文件已齐不等于可编码批准；物理 Schema、协议、SLO/保留、实名评审与真实证据仍待补齐。
