# Youlin 企业化 AI 中台建设资料

本目录用于集中存放 Youlin 企业化 AI 中台二次开发、部署、架构、产品设计、数据治理和实施计划等后续产物。

## 文档索引

1. [CRO AI 原生工作台：项目分析、目标架构与二开路线](./01-cro-ai-native-workbench-strategy.md)
2. [企业现状盘点与调研执行手册](./02-current-state-inventory.md)
3. [CRO 企业本体、主数据、事件与指标字典](./03-cro-domain-ontology.md)
4. [基于 LobeHub 的临床 CRO 企业版二开架构与实施路线](./04-lobehub-extension-architecture-and-roadmap.md)
5. [企业二开分支与 LobeHub 上游同步规范](./05-upstream-sync-and-development-guide.md)
6. [Dify、RAGFlow、BPM 与 Tool Gateway 集成契约](./06-integration-contracts.md)
7. [MVP PRD：Study 启动文件接收与 TMF 智能质检闭环](./07-mvp-product-spec.md)
8. [交付路线：人力、排期、预算、采购与风险](./08-delivery-roadmap.md)

## 当前开发基线

- 企业长期分支：`feat/youlin-enterprise-ai-platform`
- 上游官方仓库：`upstream` → `lobehub/lobehub`
- 企业 Fork：`origin` → `bestNiu/lobe-chat`
- 当前 LobeHub 基线：`v2.2.17`

## 建议的后续产物

- `09-security-compliance-blueprint.md`：安全、隐私、GxP 与计算机化系统验证方案
- `10-deployment-runbook.md`：开发、测试、验证、生产环境部署手册
- `11-data-model-and-migration.md`：Study、文件、Finding、审批和证据包数据模型
- `12-evaluation-and-validation-plan.md`：RAG、AI、业务验收和 CSV 验证计划
