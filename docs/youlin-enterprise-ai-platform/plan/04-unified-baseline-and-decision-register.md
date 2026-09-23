# 统一实施基线、依赖切片与决策台账

> 状态：Review 后的实施约束；不是架构已批准、功能已实现或生产验收通过的声明。
> 适用：01～12、18、plan 全部文档。业务事实仍需 Owner/系统证据核验。

## 1. 文档权威与变更规则

| 文档 | 主责 | 不替代 |
| --- | --- | --- |
| 01 | 战略和历史代码分析 | 当前生产事实、实施排期 |
| 02 | 调研模板与证据 | 自动生成生产主数据 |
| 03 | 领域语义、状态、标识 | 已批准物理 Schema |
| 04/05 | 架构、工程与上游同步 | 已完成的企业权限实现 |
| 06/09 | Provider/接口/系统接入约束 | 供应商实际 API 能力 |
| 07 | MVP 功能 FR 与验收 AC | 已上线结果 |
| 08 | 排期、人员、预算与发布门 | 单独承诺的商务报价 |
| 10/11 | 数据/API、Context/记忆专项安全语义 | 扩大 MVP 数据范围 |
| 12 | 完整产品目标与 Stage 投资门 | MVP 全量深度实现 |
| plan/01～03 | Spec WBS、追踪与后续 Epic | 逐任务已批准技术设计 |
| 本文与 plan/05 | 本轮冲突裁决、依赖切片、设计与测试细则 | 真实选型/组织/保留批准 |
| 18 | 综合应用/技术架构、能力中心与执行位置 | 实际部署、组件选型批准 |
| plan/07 与 plan/specs | 全量设计排期、逐项设计状态与共享契约草案 | ADR 批准、代码实现、环境/业务验收 |

同一要求只由主责文档定义，其他文档链接引用。冲突不按“编号大优先”或“文字更详细优先”解决：先守安全和数据硬边界，再由对应 Owner 提交变更，同时更新 FR、AC、Spec、测试和排期。已有验收 ID 不重编号、不删除历史。

## 2. 唯一范围基线

- Stage 0=MVP 1；建设 22～26 周，计划以 W26 发布、W27～W32 Pilot 的保守窗口执行。Pilot 4～6 周不得以测试环境 UAT 代替。
- 企业总规模 300～500 人不等于同时在线或同时生成；Pilot 两个部门、20～50 人、至少两个通用 Project。
- 基线交付 3～5 Skill、至少一个只读 Tool、至少一个低风险固定版本 Dify Workflow、2～3 Agent；问答和清单可复用同一受控 Workflow 分支，不强制两套流程。
- 50～200 份知识为采集目标，不是允许未审核文件凑数；100～200 个黄金问题必须固定版本、分层并独立于调参集。
- 一个低敏 Data Product、内部只读 API、独立 Keycloak 服务 Client。PoC 进入真实 Pilot 后仍须生产级安全、恢复和支持。
- 排除受试者（含去标识化记录）、人遗、PV 病例、高敏临床及 GxP/Part 11 受控记录；禁止任何外部消费者生产数据开放、匿名分享和未批准跨境处理。
- 模型 API 品牌、境内代理或脱敏不自动证明不出境；必须核验实际推理、日志、备份、支持访问链。未证明符合处理边界的路由关闭。
- 正式 OA 终态在泛微；平台 Review 只负责自身 Capability/知识/记忆/数据授权，不能代替正式业务审批。
- 后续旧称 MVP 2/3 为场景桶；统一投资顺序为 Stage 1 采用、Stage 2 经营、Stage 3 Clinical 建议、Stage 4 受控、Stage 5 产品化。

## 3. 统一术语与状态

| 概念 | 统一解释 |
| --- | --- |
| Enterprise / workspaceId | 企业与平台隔离边界不同；MVP 一企业一主 Workspace，通过映射关联 |
| objectId / enterpriseId | objectId 是业务对象；enterpriseId 是企业，不能混用 |
| Project / Study | Project 通用经营单元，允许无 Study；后续关系基数经 ADR 冻结 |
| workstream | 工作分工/专业线，不是 Dify Workflow 或流程实例 |
| PersonalMemory | category=general/project_private；PersonalProjectMemory 为后者领域子类型；共享 ProjectMemory 独立 |
| Context Provider / Assembler | Provider 是接口，Assembler 是装配实现；不是两套权限系统 |
| aud / Audience | aud 为 OAuth 目标服务；Audience 为业务输出接收人集合 |
| Runtime Context | 记录来源/版本/策略；不替代每次读取、Tool 和输出时的当前权限校验 |
| KnowledgeRelease | Youlin 管发布事实；RAG 管派生索引；先审批和质量门禁后在线激活 |
| Feature Flag / Entitlement | 能力开关/授权上限，叠加业务权限；关闭必须覆盖后台任务 |
| Harness | CI/CD 候选，不是采购前置；可使用已批准等价工具 |
| Source of Truth | HR/Project/源业务系统为事实源；湖仓目录不可反向成为人员禁用真源 |

统一 Registry 生命周期：`draft → testing → reviewing → published → deprecated → retired`；拒绝退回 draft，批准保存为 Review Decision。`suspended`/紧急停用是显式阻断标志，不可因 published 仍可调用。Module Registry 可保留 suspended 展示态，但映射同一运行阻断规则。

知识发布可用 `draft/reviewing/publishing/published/failed/withdrawn`，只有 published 且有效版本可检索；这是独立领域状态，不强行与 Registry 混为一张表。任务投影、源 Job 与审批状态同理分开映射。

代码目录仍为建议：MVP 共用 `enterprise-domain/policy/events/context/work-center/audit` 与 `integration-*` 边界，实际目录经 ADR 映射到仓库服务层；后续临床域使用 `clinical-*`，不重复定义身份、Project 和资源模型。不要求本轮创建这些代码包。

## 4. 安全可实现性裁决

### 4.1 身份与失效

- 身份键为 `(issuer, sub)`，关联法人代码+employeeId；employeeId 不可复用。返聘、法人调动、多人多任职须人工核验并保存旧映射，不删除历史账号重建。
- Keycloak 用户禁用/登出不保证所有自包含 JWT 和应用 Session 立即失效。PEP 还须校验用户/成员撤销版本，短 Token、禁用清单/内省或在线策略组合必须实测。
- 权限撤销先持久化 deny/version 并阻断新访问，再异步清理索引；队列故障不能使陈旧索引继续授权。缓存命中仍校验授权版本。若分布式 PEP 无法同步校验最新版本，则必须阻断服务或经 D10 明确可验证的传播窗口，不能声称最终一致缓存是“立即撤销”。
- 紧急停用阻止新步骤、Tool 和输出提交；运行中任务协作取消。已完成外部副作用不假装回滚，进入回执/补偿。

### 4.2 文件访问

普通 OSS 预签名是到期前有效的持有者凭证，停止签发新 URL 不等于撤销旧 URL。MVP 用户预览/下载走可实时鉴权资源网关/代理；每次 Range、新下载和引用都复核资源状态。普通预签名用于隔离区上传和批准服务间传输。上传完成前检查实际大小、Hash、MIME、扫描和配额，不假设签名支持全部限制。

禁止私有响应进入公共 CDN/共享缓存；受保护响应 no-store，Desktop 最小缓存。已展示/下载/截图无法远程收回，策略承诺限于后续访问和受控客户端清理。Legal Hold 阻止物理删除但不授予读取权；备份恢复后先重放撤销/删除账本再开放流量。

### 4.3 Context 与检索

- ACL 必须在召回、全文/向量排序、图遍历和计数之前执行；Provider 不支持时拆权限域或拒绝，不以返回后二次过滤替代。
- project=null 支持员工通用助手；非项目场景不伪造 Membership。所有客户端上下文参数均视为请求而非可信 Claim。
- MVP 默认 Audience 安全交集；个人记忆只用于个人输出。分段共享需完整分段读取/导出/缓存实现后另开 Flag。
- `asOf` 只选择历史事实，不恢复历史权限；preview/explain 不展示无权来源名称、计数或被拒绝成员。
- Context Cache Key 包含 workspace、actor/service、agentVersion、project、purpose、Audience Hash、asOf、来源和策略/成员版本。禁止不同受众共享同一答案缓存。

## 5. 依赖切片与里程碑通过条件

里程碑完成时间不等于接口首次可用时间。每个切片先有契约、Mock 和负向测试，再提供真实集成；Mock 不能用于签收 AC。

| 切片 | 最迟可消费 | 生产者 Spec | 消费者 | 验证/阻断 |
| --- | --- | --- | --- | --- |
| 身份、审计、Flag/队列骨架 | W4 | M01-006～009、011～012 | M2～M11 | 禁止公网必需依赖，消息可恢复 |
| 认证稳定身份与撤销接口 | W5 | M02-001～006 | M3/M4/M5 | 双登录同用户，JWT/应用会话撤销 |
| Project/Membership 与 PDP | W7 | M03-004～010 | M6/M7/M10 | 至少两个项目负向测试 |
| Review 后端核心与职责分离 | W8 | M05-007、M11-006 | M5/M7/M9 | 先领域 API/最小 UI，M11 再统一入口 |
| Context 核心 C0 | W10 | M10-001、003～005 | M5/M7/M8 | 用户/Purpose/私有受众/null Project、Manifest、当前授权 |
| 资源版本/上传/安全访问 API | W11 | M06-001～003、007 | M7/M8 | 完整扫描隔离与版本引用；W14 前完成 M6 全部资源能力 |
| 知识与个人记忆 Context C1 | W15 | M07、M10-003～005 | M8 | RAG/记忆必经 Provider，不能直接拼 Prompt |
| 灯塔真实链 | W16 | M08 | M12/M13 | AC-21，当前权限与引用 |
| Data/API 与 Context C2 | W18 | M09、M10-003～005 | M10/M11 | 真实内部 API、行列/脱敏 |
| 角色/Audience/网络/离项 C3 | W20 | M10-006～012 | M11/M12 | AC-24～27 完整闭环 |
| 首页/任务/统一评审运营 | W22 | M11 | M12 | AC-28～32；AC-33 界面/Runbook 分项 |
| 发布候选证据 | W24 | M12 | M13 | 功能、安全、恢复实测，不要求 AC-15 已运行 |
| Pilot 准入 | W26 | M13 | M14 | 数据/用户/监控/支持准备、发布 Smoke |
| Pilot 结论 | W32 | M14 | 后续 Stage | AC-15 实际运行结果及投资门 |

M5 的 Context C0 如未通过，只能在合成数据 Test 环境联调，不得开放真实 Agent。M8 不必等完整 M10，但必须具备 C1。M7 项目私有记忆提前使用 M3 Membership，不能等 W20 才补安全隔离。

## 6. 发布与缺陷统一口径

- M12/M13：AC-01～14、AC-16～33 实测通过；AC-15 仅 readiness。
- M14：AC-15 完成真实 Pilot 观察并签收；其他 AC 按最终发布版回归证据关联。
- P0/P1 缺陷和 Critical/High 安全风险不得带入发布；产品功能优先级不是缺陷严重度。
- 仅 P2/P3 或 Medium/Low 风险可限期接受，记录具名 Owner、补偿控制、验证和到期日；身份越权、数据泄漏、无恢复、凭证泄漏等硬门禁不可豁免。
- accepted_with_conditions 仅用于不承载真实业务的阶段交付或非阻断项，不能传递为生产 Go。
- AC-33 不在 W22 冒充完成恢复演练；M12 最终签收。上线后发生重大问题立即停用相关能力并重开验收。

## 7. 参数与决策登记（均需实名认领）

“待冻结”不等于可以带空值上线。责任角色在 M0 指定实名；逾期阻断对应 Spec。安全候选值可先用于测试，未经批准不是 SLA。

| ID | 决策 | 责任角色/批准 | 截止 | 阻断及默认安全处理 |
| --- | --- | --- | --- | --- |
| D01 | 部门/岗位唯一真源、员工号复用/返聘/法人调动 | HR、Identity/Security | W2 | M2/M3；冲突禁止自动绑定 |
| D02 | 企业微信 Adapter 或 SPI、Issuer/Session/MFA | Identity、Security | W3 | M2；保留标准 Keycloak 登录 |
| D03 | Project/客户/合同关系、Membership 真源、Facet | Project Owner、Tech/Security | W4 | M3；只有经批准人工导入/双人复核可作 Pilot 真源 |
| D04 | OSS/KMS/预览/扫描/格式和配额 | Resource Owner、SRE/Security | W3 方案/W6 Spike | M6；失败留隔离区 |
| D05 | RAG Provider 与 ACL 预过滤、Dify 固定版本 | AI Lead、Knowledge/Security | W6 | M5/M7；不支持则拆权限域/版本部署或拒绝 |
| D06 | 模型路由、推理/日志/支持访问地域 | Privacy、AI/Security | W4 | M5/M8；未批准路由禁用 |
| D07 | 私有队列、事件、Webhook 和出站清单 | SRE、Tech/Security | W4 | M1/M5；不得依赖未获批公网 QStash |
| D08 | 湖仓表格式/查询/目录/质量/Gateway 与内部产品 | Data Owner、Data Lead/Security | W4 范围/W6 方案 | M9；先合成数据，不扩建完整数仓 |
| D09 | Memory Promotion/离项保留、来源导出策略 | Project/Privacy、Security | W6 | M7/M10；默认私有且离项停止读取 |
| D10 | Audience、asOf、Cache TTL 与撤权 SLA | Security、Context Lead；身份切片与 Identity 联审 | W3 身份撤销合同/W4 PDP 核心/W6 Context 策略 | M2/M3/M10 C0；先按切片批准，不等 W6 才决定 W5 身份回收；默认权限交集、拒绝陈旧授权 |
| D11 | Desktop OS、签名、设备策略、更新源 | IT、Desktop/Security | W3 | M4；未签名版本不能上线 |
| D12 | CRM/OA 接口、Embed/Launch Code 与降级 | Module/OA Owner、Security | W6 | M11；iframe 失败用安全深链接 |
| D13 | 数据分类、保留、Legal Hold、删除和备份 | Data/Privacy、Legal/SRE | W6 初版/W12 冻结 | M6/M7/M12；到期禁止无策略自动清除 |
| D14 | 容量、SLO、RPO/RTO 和故障窗口 | SRE、Product/Security | W4 样本/W12 冻结 | M12；未冻结不可验收 |
| D15 | 黄金集分层、评分和业务成功指标 | Knowledge、QA/Product | W12 集合/W16 阈值 | M8/M14；冻结后不得为通过降低指标 |
| D16 | Review/通知/反馈 SLA、职责分离与支持 | Product、各 Owner | W8 | M11；不替代泛微终态 |
| D17 | 分周容量、实名 RACI、预算与 Pilot 人力 | Product、Tech/财务 | W4 | 日期承诺；按实际资源重排，不削减安全 |

D13 保留表逐类填写：账号映射、会话正文、资源版本、记忆正文、Context Manifest、Agent Run、审计、日志、回收站、备份；字段至少 retentionDays、依据、触发点、Owner、Hold 优先级、销毁任务、回执和恢复再删除。未知值保留为未批准，不凭空填法定年限。

## 8. SLO 测量合同

各项需保存环境/制品、数据规模、峰值并发、请求分布、预热、测试时长、样本数、P50/P95/P99、失败率、依赖延迟与证据链接。300～500 人只是覆盖规模；M12 前必须完成测量合同。

| 项目 | 候选/已列产品目标 | 计时和判定 |
| --- | --- | --- |
| 首页/列表/全局搜索 | P95 3s/2s/2s | 从发起到可交互结果，授权与网络计入，复杂全文单列 |
| RAG/首 Token | P95 5s/5s | 检索与端到端首 Token 分开测；端到端计入授权、检索和模型，不能相加后仍声称 5s |
| 预览 | 普通文件 95% ≤5min | 格式、页数、大小白名单固定；从上传完成到可预览含扫描队列；扫描失败计失败不计成功 |
| HR 同步/离职 | 同步目标 ≤15min；回收候选 ≤15min | 从权威变更持久化起计，总耗时不能各阶段分别放宽；记录源事件及平台收到时间 |
| 平台撤权/停用 | 新请求校验最新 deny/version | 平台撤销提交后不接受陈旧授权；在途中止、投影清理 SLA 由 D10 冻结，队列延迟不放宽访问控制 |
| 通知任务 | 正常依赖下 95% ≤1min | 从源事件到站内可见；渠道受理/实际送达分开记录，去重不承诺供应商 exactly-once |
| 可用性、内部 API | 06 为候选，D14 批准 | 真实请求成功率和黑盒探测；业务拒绝/系统失败分别统计，不删掉超时美化结果 |
| 恢复 | D14 冻结各系统 RPO/RTO | RPO 用实际丢失窗口，RTO 从故障宣告至恢复业务并对账；包括 KMS、身份、策略和撤销账本 |

Pilot 短窗口观测不能证明年度 SLA。黄金集越权为 0 表示已执行样本零泄漏，不代表对所有未知攻击的保证。

## 9. 状态与证据

本轮只修订规划。每个 Spec 必须有独立设计记录和证据状态，使用 plan/05 模板；Spec approved、代码 merged、环境 verified、业务 accepted、released 五种事实分开保存。详细设计采用[工作区双轴状态](./specs/README.md)；41 项已有草案不代表批准，其余 118 项仅设计排期。未决项不得通过批量填“已完成”关闭。
