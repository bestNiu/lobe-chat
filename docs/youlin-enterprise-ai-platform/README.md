# Youlin 企业化 AI 中台建设资料

本目录用于集中存放 Youlin 企业化 AI 中台二次开发、部署、架构、产品设计、数据治理和实施计划等后续产物。

## 文档索引

1. [CRO AI 原生工作台：项目分析、目标架构与二开路线](./01-cro-ai-native-workbench-strategy.md)
2. [企业现状盘点与调研执行手册](./02-current-state-inventory.md)
3. [CRO 企业本体、主数据、事件与指标字典](./03-cro-domain-ontology.md)
4. [基于 LobeHub 的临床 CRO 企业版二开架构与实施路线](./04-lobehub-extension-architecture-and-roadmap.md)
5. [企业二开分支与 LobeHub 上游同步规范](./05-upstream-sync-and-development-guide.md)
6. [Dify、RAGFlow、BPM 与 Tool Gateway 集成契约](./06-integration-contracts.md)
7. [MVP PRD：企业 AI 工作台基础平台](./07-mvp-product-spec.md)
8. [企业 AI 工作台 MVP 交付路线](./08-delivery-roadmap.md)
9. [多系统融合接入与可产品化模块建设规范](./09-multi-system-fusion-integration-standard.md)
10. [湖仓一体数据平台与 API 开放治理蓝图](./10-lakehouse-data-platform-and-api-governance.md)
11. [个人记忆、项目上下文、企业上下文网络与 Agent 授权治理蓝图](./11-context-memory-and-agent-authorization-governance.md)
12. [Youlin 企业 AI 工作台完整产品能力与演进蓝图](./12-full-product-capability-and-evolution-blueprint.md)

## 应用与技术架构总览

[Youlin 企业 AI 工作台应用架构与技术架构](./18-application-and-technical-architecture.md)：应用模块与权威边界、Agent/Skill/Tool/应用/插件中心定位、LobeHub/Dify/Pi 运行时分工、技术组件、部署单元、数据/授权链路、运行治理及里程碑映射。13～17 仍保留给下列专题产物。

## 开发实施计划

- [开发计划总览与 M0～M14 里程碑](./plan/README.md)
- [MVP 详细 Spec 任务与功能要求](./plan/01-mvp-development-milestone-specs.md)
- [需求、验收和交付追踪矩阵](./plan/02-traceability-and-delivery-gates.md)
- [MVP 后 24～36 个月完整产品开发路线](./plan/03-post-mvp-product-roadmap.md)
- [统一基线、依赖切片与待决策台账](./plan/04-unified-baseline-and-decision-register.md)
- [Spec 设计细则、FR 映射与具体测试场景](./plan/05-spec-design-and-verification-details.md)
- [Review 发现、修订与未决事项](./plan/06-document-review-and-remediation.md)
- [详细 Spec 滚动设计与批准计划](./plan/07-detailed-spec-design-plan.md)
- [159 项逐项设计索引](./plan/specs/index.md)、[8 份跨模块契约草案](./plan/specs/contracts/README.md)

当前为规划/设计基线，不是功能实现或企业验收完成声明。MVP PRD/交付基线为 2.4，开发计划为 1.4；先阅读统一基线再展开 Spec。计划包含 **159 项 Spec、33 项 AC、17 项待冻结决策和 26 条补充验收场景**。详细设计批次 1～3 累计 **89 份 draft**：M0～M7 全部，以及 M10 C0 相关 4 项、M11 Review/Module/CRM 3 项；其余 **70 项仍 planned**。草案不等于全部切片实现细节已冻结，所有任务未获批准、未开始交付。

静态校验：`python3 docs/youlin-enterprise-ai-platform/plan/validate_docs.py`；校验器测试：`python3 docs/youlin-enterprise-ai-platform/plan/test_validate_spec_catalog.py`（均不访问外网，不替代真实验收）。

## 当前 MVP 定位

MVP 1 按 22～26 周建设完整可运营闭环：企业身份与组织、Web/Desktop、统一首页/导航/全局搜索、Project/Membership、Agent/Skill/Tool/Workflow、模型与 Prompt、企业资源和知识、个人/项目记忆与 Context、员工工作助手、湖仓/API PoC、应用集成，以及我的任务、通知、评审、反馈、Feature Flag、审计和运行治理。Project 作为经营与矩阵权限单元；Agent 通过 Context Assembler 按用户、项目、用途和受众动态获得授权上下文。完整企业图谱/数仓、外部生产 API 和临床受控场景进入 24～36 个月滚动投资窗口，不承诺全量场景在窗口内完成；每个 Stage 独立立项。

当前规划基线：企业约 300～500 人；统一 IdP/Identity Broker 选定私有部署 Keycloak，Youlin 通过 Generic OIDC 接入；HR 为新人新事、OA 为泛微、CRM 为自研，CTMS/EDC/IWRS/eTMF 为医渡科技定制，财务为用友；已有企业模型网关连接 OpenAI 与阿里云百炼；所有企业数据保持不出境、不越出批准处理边界。

## 企业参考材料

- `know/有临组织架构-人员职责版_副本.png`：用于组织、部门、岗位和职责建模，仍需转换为结构化组织数据并由权威源核验。
- `know/有临CRO报价工具_v4.22_20260821.xlsx`：用于报价任务、角色、标准工时、费用、签批和时间计划分析。
- `know/有临医药员工工作指引手册_V1_2605.docx`：用于首期员工工作助手的信息架构、问题域、任务节点和知识来源分析；它是导航材料，不替代其引用的当前有效制度、SOP/WI 或 OA 正式通知。

`know/` 中资料纳入企业二开仓库版本管理，但只作为项目分析和知识治理输入，不直接作为生产组织、人员、报价、权限或自动发布的 RAG 数据源。生产知识必须通过资源中心上传、Owner 审核、版本治理和知识发布流程。

## 当前开发基线

- 企业长期分支：`feat/youlin-enterprise-ai-platform`
- 上游官方仓库：`upstream` → `lobehub/lobehub`
- 企业 Fork：`origin` → `bestNiu/lobe-chat`
- 文档采用的 LobeHub 版本基线：`v2.2.17`；实际发布以企业 Commit、上游 Commit 与制品 Digest 为准。
- 建设计划峰值：15～19 FTE，须经分周容量表验证；建设约 75～115 人月。
- 按分项校正后的建设 ROM：约 400～1,100 万元；Pilot 运行人力/用量另计，详见 08。

## 建议的后续产物

- `13-security-compliance-blueprint.md`：安全、隐私、GxP 与计算机化系统验证方案
- `14-deployment-runbook.md`：开发、测试、验证、生产环境部署手册
- `15-data-model-and-migration.md`：身份、组织、项目、记忆/上下文、资源、湖仓/Data Product/API 和知识数据模型
- `16-evaluation-and-validation-plan.md`：SSO、权限、多端、Context、RAG、湖仓、API、Tool/Workflow 和业务验收计划
- `17-clinical-scenarios-backlog.md`：TMF、Protocol、CRA、Study Copilot 等 MVP 2 场景池
