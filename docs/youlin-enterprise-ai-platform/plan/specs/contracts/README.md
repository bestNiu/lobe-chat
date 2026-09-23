# 跨里程碑关键合同草案

> 8 份合同全部 draft；K01/K02/K03 已有首批可执行子集，其余仍为逻辑合同。没有完整生产合同或供应商能力证明，不新增功能 Spec。

| 合同 | 候选 Owner | 设计/切片目标 | 决策 |
| --- | --- | --- | --- |
| [K01 身份、服务主体与撤销](./K01-identity-and-revocation.md) | Identity Lead | W3 设计；W5 真实接口 | D01/D02/D10 |
| [K02 Project、Membership、ACL 与统一授权](./K02-scope-and-authorization.md) | Security Lead | W4 设计；W7 真实 PDP | D03/D10/D13 |
| [K03 可靠事件、异步任务与审计](./K03-events-audit-and-jobs.md) | SRE Lead | W4 设计与真实骨架 | D07/D13/D14 |
| [K04 能力、插件、评审与执行](./K04-registry-review-and-execution.md) | AI Lead | W6 骨架；W8 Review 规则；Pi 启用另批 | D05/D06/D07/D10/D16 |
| [K05 资源版本、安全访问与知识发布](./K05-resource-and-knowledge.md) | Resource Owner | W6～W7 设计；W11 Resource API；W15 知识 | D04/D05/D13 |
| [K06 Context C0～C3、记忆与输出](./K06-context-and-memory.md) | Context Lead | C0 W6；C1 W9/C2 W12/C3 W15 设计评审 | D03/D09/D10/D13 |
| [K07 Data Product、内部 API 与行列授权](./K07-data-product-and-api.md) | Data Owner | W6 设计；W18 真实 API | D08/D10/D13/D14 |
| [K08 工作台、应用融合、任务与通知](./K08-workbench-and-modules.md) | Product Owner | W6 骨架；W8 Module/Review；W14 CRM Spike | D11/D12/D16 |

固定原则：身份从服务端派生，当前权限前置，先撤权后清投影，版本不可静默覆盖，运行成功与请求受理分开。

[首批可执行 Schema/合成夹具与测试](./executable/README.md)覆盖禁用命令/状态、Scope/动作请求、单种 CloudEvents；用于辅助评审，不替代 DoR，也未连接真实服务。[仓库接点与三组 Spike](../../08-implementation-readiness-and-spikes.md)列明真实验证门。尚待批准的供应商选型和阈值继续挂 D01～D17。

[设计排期](../../07-detailed-spec-design-plan.md) · [159 项索引](../index.md)
