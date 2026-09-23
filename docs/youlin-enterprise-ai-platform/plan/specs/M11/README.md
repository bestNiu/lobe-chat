# M11 详细设计队列

> 设计 W3～W5，领域 UI 滚动；评审 W5～W6 骨架；规则 W8；交付 W22。候选角色待实名，窗口待 D17 容量批准。

[返回全量索引](../index.md) · [WBS](../../01-mvp-development-milestone-specs.md) · [状态规则](../README.md)

| Spec | 任务 | 设计状态 | 候选 A | 决策依赖 |
| --- | --- | --- | --- | --- |
| SPEC-M11-001 | 企业首页 | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-002 | 统一导航/应用中心 | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-003 | 全局搜索 | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-004 | 我的任务 | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-005 | 通知 | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-006 | 统一评审 | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-007 | 用户设置 | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-008 | 反馈与支持 | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-009 | 企业配置 | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-010 | Feature Flag | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-011 | 运营中心 | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-012 | 帮助和 Runbook | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-013 | Module Registry 与融合容器 | planned | Product Owner | D10, D12, D16 |
| SPEC-M11-014 | CRM/OA 与 Launch Code 验证 | planned | Product Owner | D10, D12, D16 |

## 本阶段评审要求

逐项补 Schema/API/事件/交互、当前授权与失败语义、合成用例、迁移回退和实名签署；同一里程碑的共性要求不能替代每项详细设计。

前置共享契约：[K02](../contracts/K02-scope-and-authorization.md)、[K03](../contracts/K03-events-audit-and-jobs.md)、[K04](../contracts/K04-registry-review-and-execution.md)、[K08](../contracts/K08-workbench-and-modules.md)。

M12/M13 的 AC-15 仅 readiness，M14 才能签真实运行；Pi 仅可选受控 Spike。所有文件缺口均保留 planned，不声称已展开。
