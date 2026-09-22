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

## 当前 MVP 定位

MVP 1 先建设企业级 SSO、企业微信、唯一账号、组织权限、Web/Desktop、Skill、Tool、Workflow、Agent、企业资源中心、通用知识库，以及湖仓与 API 控制面的最小骨架。资源中心覆盖个人、团队、企业和项目级资源库；湖仓 PoC 覆盖独立 OSS 分区、一个低敏数据源、Bronze/Silver/Gold、一个内部数据产品和一个只读 API；Youlin 只承担数据目录、权限申请、API 发布和运营展示，不直接充当计算引擎。首期以资源中心和“有临员工工作助手”作为 AI 灯塔场景。完整企业数仓、外部生产 API、CTMS/EDC/eTMF/ePRO/IWRS 等 GxP/Part 11 受控场景及 TMF、Protocol、CRA、Study Copilot 进入后续阶段。

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
- 当前 LobeHub 基线：`v2.2.17`

## 建议的后续产物

- `11-security-compliance-blueprint.md`：安全、隐私、GxP 与计算机化系统验证方案
- `12-deployment-runbook.md`：开发、测试、验证、生产环境部署手册
- `13-data-model-and-migration.md`：身份、组织、权限、资源、湖仓/Data Product/API、Registry 和知识数据模型
- `14-evaluation-and-validation-plan.md`：SSO、权限、多端、RAG、湖仓、API、Tool/Workflow 和业务验收计划
- `15-clinical-scenarios-backlog.md`：TMF、Protocol、CRA、Study Copilot 等 MVP 2 场景池
