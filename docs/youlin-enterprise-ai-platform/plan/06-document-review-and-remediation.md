# 文档与开发计划 Review 修订记录

> Review 输入基线：`2b8e4b966c`；本记录不表示业务方已签署技术选型或任何功能已实现。
> 范围：01～12、主 README、plan 原有四份文档；新增统一基线、设计细则及文档校验工具。

## 1. 总体结论

原文档产品方向一致，但存在范围历史残留、依赖晚于消费者、验收时间不可能满足、权限失效实现假设和 WBS 覆盖不足等问题。当前修订使规划可用于责任认领和设计评审；**仍不能跳过 ADR、系统 Spike、逐 Spec 设计与真实验收直接宣称开发就绪**。

know/ 三份资料保持原件，不改写企业事实。此次检查文件完整性和引用/使用边界；没有重新认定组织、人事、制度或报价内容为当前有效生产事实。有效性须由 HR、知识 Owner、财务等独立确认。

## 2. 发现与修订

| ID | 等级 | 发现 | 修订位置与结论 |
| --- | --- | --- | --- |
| RV-01 | 高 | 01 旧 Phase 工期与 08/12 的 MVP/Stage 冲突 | 01 标明并行工作分组并映射统一路线；plan/04 固定 W26/W32 保守基线 |
| RV-02 | 高 | 24～36 个月与全阶段串行总时长不符 | 12、plan/03 明确为滚动投资窗口，Stage 0～4 串行约 28～42 个月，Stage 5/部分受控阶段可越出窗口 |
| RV-03 | 高 | 上线前要求 AC-15 已运行 4～6 周 | 07/08、plan/01/02/04 拆 readiness 与 M14 运行签收 |
| RV-04 | 高 | W10/W16 Agent 依赖 W20 Context，W10 发布依赖 W22 评审 | plan/04 增加 W8 Review、W10 C0、W15 C1、W18 C2、W20 C3 切片及禁止绕过规则 |
| RV-05 | 高 | 04 将 RBAC/Workspace 基础描述成可直接复用 | 改为待实测能力；本次复核 withRbacPermission 仍为直接 opts.next 的占位实现 |
| RV-06 | 高 | 预签名 URL 被视作可以取消分享后即时失效 | 04/06/07/09、M6 改用户可撤权网关，普通 OSS 签名仅隔离上传/服务间；明确已下载不能回收 |
| RV-07 | 高 | 04 摄取图和 06 上传流程暗示上传自动进 RAG | 增加 Owner/确定版本/审核/质量门禁和原子激活 |
| RV-08 | 高 | 06 检索只过滤 KB，不足以隔离同 KB 不同 ACL | 要求文档版本预过滤；Provider 不支持则隔离权限域或拒绝 |
| RV-09 | 高 | asOf/preview/explain/共享缓存可能形成权限旁路 | 11 与 plan/04 增加当前权限、安全解释、Audience Hash、运行中复核和 fail-closed |
| RV-10 | 高 | 非项目员工助手与必填 Project 冲突 | project=null 的 Context C0 支持，项目场景仍强制 Membership |
| RV-11 | 高 | 禁用 Keycloak Session 被等同全部 JWT/应用 Session 失效 | plan/04/05 要求撤销版本/内省/deny-list 与负向用例 |
| RV-12 | 高 | 高风险/P1 有的可接受、有的必须阻断 | 08、plan 统一无开放 P0/P1/Critical/High，较低风险方可限期接受 |
| RV-13 | 中 | 角色 FTE 求和与峰值口径不符；预算下限不匹配分项 | 08 明确角色满配 15.9～22.9、计划峰值须错峰；345～890 加预备金=396.75～1,068，ROM 取 400～1,100 万 |
| RV-14 | 中 | RACI 同一行多个 A | 08 每项单 A，保留 Security/Owner 强制签收，实名待认领 |
| RV-15 | 中 | 03 enterpriseId 同时作企业/对象 ID，Memory 子类型不一致 | 区分 objectId/workspaceId；PersonalMemory 聚合、project_private 子类型与 ProjectMemory 分开 |
| RV-16 | 中 | Project 强制一个 Study 与通用项目冲突 | 03/11 允许无 Study，后续基数待 ADR；workstream 与 Workflow 分离 |
| RV-17 | 中 | Registry approved/published 等状态冲突 | 06/07 与 plan/04 统一发布状态，批准作为版本绑定决定 |
| RV-18 | 高 | Dify version 字段被当成已固定执行版本 | 06 增加按供应商能力固定版本或独立不可变部署/DSL Hash Spike |
| RV-19 | 中 | JSON Issuer/Scope、用途、错误信封和事件映射不一致 | 06/09 统一信任来源、scope、directory_sync、错误、W3C Trace 与 CloudEvents 映射 |
| RV-20 | 高 | 目录湖仓用于 authorization_projection 可能延迟撤权 | 06/10 移除实时授权用途；组织目录字段须最小化批准，先合成数据 |
| RV-21 | 高 | “不大规模开放”可能允许小规模外部生产数据 | 07/10 与 plan/04 明确 MVP 禁止任何外部消费者生产数据，Sandbox 只用合成数据 |
| RV-22 | 中 | 企业微信 SPI 被要求独立服务部署 | 07 区分独立 Adapter 服务与 Keycloak SPI 插件 |
| RV-23 | 中 | 开发 WBS 缺会话、模块融合、私有队列、审计完整性、文本编辑/格式矩阵 | 新增 7 项 Spec，原 152 项增至 159 项；FR-H04/K07 与 AC-28 补充，不重编号既有 AC |
| RV-24 | 高 | 工程验收可误将企业数据送至上游 Debug Proxy/公共证据站点 | 05 与 plan 增加私有环境、证据和出口门禁 |
| RV-25 | 中 | merge 后 bun check 可能因干净工作区无变更而漏测 | 05 明确使用同步起始 SHA 的实际变更路径，并独立跑企业链回归 |
| RV-26 | 中 | 02 风险维度已高分优先却再次反向计分 | 改为风险可控性/集成可实施性并定义百分制公式 |
| RV-27 | 中 | 02 泛微仍待选型、90 天与 MVP 周期混淆 | 正式终态职责已定，接口仍待核验；四周调研并行，90 天仅滚动 Backlog |
| RV-28 | 中 | 01 后续文档编号旧名、08 阶段 C 外部开放残留 | 修正 13/14 后续编号与湖仓阶段 D；补十域映射的商业化域 |
| RV-29 | 高 | 阈值无分母、保留/SLO 一直待定可能导致不可验收 | plan/04 增 17 个决策、责任/截止/阻断；plan/05 定义 AC-21 分母与 26 条具体测试场景 |
| RV-30 | 中 | 技术 Spec 行清单被误作完整设计 | plan/05 增 DoR 模板、数据约束、迁移/事件失败语义、FR→Spec 映射，明确逐项签收 |

等级为本轮文档风险，不表示已发现生产漏洞或发生了数据事件。

## 3. 本轮仍未冻结的真实决策

不以补文字代替以下实际批准：

- HR/组织/Project 权威接口、账号返聘和法人变更规则；
- Keycloak Adapter/SPI、RAG 预过滤、Dify 版本固定和私有队列 Spike；
- OSS/KMS、预览格式、大小/并发/配额、保留和 Legal Hold；
- 模型实际处理边界、目录个人信息字段和 Data Product Owner；
- Facet/Purpose/Audience、撤权 SLA、缓存 TTL、个人记忆离项保留；
- 企业真实容量、SLO/RPO/RTO、逐周人员、Pilot 人力和业务成功阈值。

这些项集中在 plan/04 D01～D17，必须由指定角色实名认领。没有证据不得标为“已批准”，逾期按依赖阻断，而不是将风险静默留给上线。

## 4. 校验与限制

使用 `python3 docs/youlin-enterprise-ai-platform/plan/validate_docs.py` 检查：

- 本地 Markdown 文件链接、围栏、JSON 示例；
- M0～M14、Spec ID 唯一/连续、PRD AC-01～33 与追踪表对应；
- PRD FR 编号唯一、补充映射覆盖、Spec 引用范围；
- know/ DOCX/XLSX 容器完整性，参考 PNG 文件头；
- `git diff --check` 另行检查空白。

校验不访问外网、不验证外部参考链接时效、不运行应用测试，不证明接口、权限、性能、法务或业务事实已通过验收。本轮不修改应用代码、数据库或参考资料原件。新增文档校验是静态回归，不替代人工 Review。
