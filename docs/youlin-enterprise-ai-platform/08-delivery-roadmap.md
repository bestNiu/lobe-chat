# 企业 AI 工作台 MVP 交付路线

> 状态：交付基线 2.0（已按平台优先策略重构）
>
> 对应 PRD：[企业 AI 工作台基础平台](./07-mvp-product-spec.md)
>
> 建设周期：14～16 周
>
> Pilot：4～6 周
>
> 估算精度：ROM，误差可能为 ±30%～50%

## 1. 交付目标

第一阶段交付可供真实员工使用的企业 AI 基础平台：

1. 企业 SSO 和企业微信登录；
2. 唯一企业账号和身份绑定；
3. 部门、员工和在职状态同步；
4. Workspace、角色、用户组和资源权限；
5. Web 与 Desktop/Electron 客户端；
6. 企业 Skill、Tool、Workflow 和 Agent Registry；
7. 企业/部门/个人通用知识库；
8. 带版本和引用的企业制度/SOP 助手；
9. 模型、凭证、配额、审计和可观测；
10. 私有部署、备份、恢复和发布规范。

TMF、Protocol、CRA、Study Copilot 等业务场景进入第二阶段，不进入首期关键路径。

## 2. 规划假设

- LobeHub 企业分支持续同步官方上游；
- HR 使用新人新事、OA 使用泛微，企业微信可提供登录/通讯录能力；
- 组织权威源尚需在 HR、企业 SSO 和企业微信之间冻结；
- 首期一个企业主 Workspace，复杂 Study 权限后置；
- 首期知识不包含 PHI、受试者数据和高敏客户资料；
- 首期只接一个只读 Tool 和一个低风险 Dify Workflow；
- Web 与 Desktop 连接同一企业服务端；
- “本地运行”同时包含开发/私有部署和 Desktop 客户端，不代表企业数据完全离线；
- Pilot 20～50 人、2 个部门、50～200 份知识文件。

## 3. 总体时间线

```text
W1-2    决策、身份/组织调研、架构和环境设计
W3-5    企业 SSO、企业微信、账号绑定
W4-7    组织同步、RBAC、资源权限和审计
W3-8    Web/私有部署、Desktop 登录与升级基线
W6-10   Skill/Tool/Workflow/Agent Registry
W7-11   企业知识库、RAG、引用与评测
W10-12  制度/SOP 助手、只读 Tool、低风险 Workflow
W12-14  安全、性能、故障、备份恢复和 UAT
W15-16  发布准备、培训和 Pilot 上线
W17-22  Pilot 运行、评估和 MVP 2 决策
```

采用并行工作流，但身份、权限和审计必须先于企业能力开放。

## 4. 工作流与阶段

### 阶段 0：决策与基线，W1～W2

交付：

- SSO、企业微信和 Identity Broker ADR；
- 员工/部门权威源决策；
- 账号唯一标识和关联规则；
- Workspace/部门/用户组/资源权限模型；
- Web、Desktop、私有部署拓扑；
- 数据分类、知识白名单和保留策略；
- Pilot 部门、用户和知识范围；
- 外部平台版本、接口、部署和技术支持信息核验；
- WBS、RACI、风险和预算基线。

退出门槛：

- HR、IT、安全、业务和法务共同确认身份数据用途；
- 明确企业微信应用申请人和管理员；
- Pilot Owner 和数据 Owner 确认；
- 不存在阻断实施的身份、数据、接口或基础设施问题。

### 阶段 1：工程与运行环境，W1～W4

交付：

- Dev/Test/UAT/Pilot 环境；
- PostgreSQL、Redis、S3、日志和 Trace；
- CI/CD、SBOM、依赖/镜像扫描；
- Secret Manager 和配置分层；
- 数据库备份、恢复和迁移流程；
- 上游同步和分支保护；
- Web 企业域名和 TLS；
- Desktop 开发构建、签名和升级通道设计。

退出门槛：

- 环境可自动或按 Runbook 重建；
- Secret 不进入 Git、镜像和前端包；
- 基础监控、告警和备份可验证；
- Web 和 Desktop 测试制品可构建。

### 阶段 2：身份、企业微信和账号，W3～W5

交付：

- 标准 OIDC SSO；
- 企业微信扫码/授权登录；
- SSO 与企业微信账号绑定；
- 登录冲突管理；
- Session、登出、禁用和紧急账号；
- 登录审计；
- Web 和 Desktop 登录回调。

退出门槛：

- 同一员工两种登录方式对应同一 `userId`；
- 重放、state/nonce、回调和 Session 安全测试通过；
- 禁用员工在目标时限内失去访问；
- Desktop 能安全完成登录且不保存共享密钥。

### 阶段 3：组织与权限，W4～W7

交付：

- HR/通讯录全量和增量同步；
- Department Tree、Group 和 Workspace Member；
- Owner/Admin/Member/Viewer；
- Agent/Skill/Tool/Workflow/KB/Document 资源权限；
- 权限管理界面；
- 组织和授权审计；
- 跨部门/Workspace 越权测试。

退出门槛：

- 部门调动和离职可正确同步；
- 搜索、Agent、引用和 Tool 使用同一授权边界；
- 不存在已知跨部门/Workspace 数据泄漏；
- 审计能还原管理员授权变更。

### 阶段 4：Web、Desktop 和私有部署，W3～W8

交付：

- 企业品牌和 Web 入口；
- Web 与 Desktop 连接同一服务端；
- Desktop Deep Link 或 Device Flow；
- Desktop 本地文件选择和目录授权；
- Desktop 版本、设备和更新策略；
- Docker Compose 开发/演示部署；
- Pilot 目标环境部署拓扑；
- 出站网络白名单。

退出门槛：

- 同一账号在 Web/Desktop 看到一致资源和权限；
- 本地能力不绕过 Tool 策略；
- Desktop 制品可签名、升级和回滚；
- 私有环境部署、备份和恢复演练通过。

### 阶段 5：企业能力 Registry，W6～W10

#### Skill

- Agent Skills/SKILL.md 导入和编辑；
- 企业、部门、个人范围；
- 草稿、审核、发布、废弃和回滚；
- 版本、Owner、来源和安全元数据。

#### Tool

- MCP/HTTP/内置 Tool 注册；
- 输入输出 Schema；
- 风险、权限、凭证、超时和审计；
- 一个只读企业 Tool。

#### Workflow

- Dify Adapter 和 Registry；
- 固定版本和 Schema；
- 草稿、测试、审核、发布和停用；
- 一个低风险 Workflow。

#### Agent

- 企业 Agent 发布；
- 绑定模型、Skill、Tool、Workflow、知识库；
- 运行版本快照。

退出门槛：

- 未发布能力不能进入生产 Agent；
- Creator 不能自行批准高风险能力；
- 回滚后历史运行仍能定位原版本；
- Tool/Workflow 失败不会被记录为成功。

### 阶段 6：企业通用知识，W7～W11

交付：

- 企业、部门、个人知识库；
- 文件、版本、状态和权限；
- 原生 RAG 或 RAGFlow Adapter；
- 混合检索和权限过滤；
- 文件版本、页码/章节和原文引用；
- 撤回和失效处理；
- 用户反馈；
- RAG 金标准评测集。

退出门槛：

- 无权文件不进入搜索和 Agent 上下文；
- 引用再次打开时执行鉴权；
- 过期/撤回版本不会作为当前有效依据；
- 引用可定位率和正确率达到 Pilot 阈值。

### 阶段 7：灯塔场景，W10～W12

交付：

- 企业制度/SOP 助手；
- 已授权有效文件检索；
- 带引用回答；
- “生成执行清单”低风险 Workflow；
- 用户反馈、成本和质量 Dashboard；
- Web/Desktop 端到端链路。

退出门槛：

- 20～50 个固定问题评测通过；
- 无依据时明确拒答；
- 用户无权资源不出现在答案或引用中；
- 一次端到端运行可关联身份、权限、模型、知识、Workflow 和审计。

### 阶段 8：硬化、UAT 和发布，W12～W16

交付：

- 单元、契约、集成和 E2E 测试；
- OIDC、IDOR、SSRF、Webhook、Prompt Injection 测试；
- 性能和容量测试；
- 外部服务故障与恢复测试；
- Desktop 安装、升级和签名测试；
- 运维、安全、管理员和用户手册；
- UAT、培训、Go/No-Go；
- Pilot 发布。

退出门槛：

- PRD AC-01～AC-15 通过；
- 无未接受 Critical/High 安全风险；
- 备份、恢复、回滚和应急禁用演练通过；
- Product、IT、安全和业务 Owner 批准。

### 阶段 9：Pilot，W17～W22

- 2 个部门、20～50 名员工；
- 50～200 份制度/SOP；
- 3～5 个 Skill、1 个 Tool、1 个 Workflow、2～3 个 Agent；
- 每周复盘登录、账号、权限、质量、成本和体验；
- 不立即替代原知识和业务系统；
- 形成 MVP 2 临床场景优先级和投入建议。

## 5. 里程碑

| 里程碑 | 时间 | 验证产物 |
| --- | ---: | --- |
| M0 范围与身份决策 | W2 | ADR、权威源、Pilot 和预算基线 |
| M1 工程基线 | W4 | 环境、CI/CD、监控、Web/Desktop 构建 |
| M2 统一登录 | W5 | SSO、企业微信、账号绑定、禁用 |
| M3 组织权限 | W7 | 组织同步、RBAC、ACL、越权测试 |
| M4 多端可用 | W8 | Web/Desktop/私有部署链路 |
| M5 能力中心 | W10 | Skill/Tool/Workflow/Agent 发布治理 |
| M6 企业知识 | W11 | 版本、权限、检索、引用和评测 |
| M7 灯塔闭环 | W12 | SOP 助手 + Tool + Workflow + 审计 |
| M8 发布候选 | W14 | 安全、性能、恢复、UAT 候选 |
| M9 Pilot 上线 | W16 | Go/No-Go、培训、发布和支持 |
| M10 Pilot 结论 | W22 | 指标、TCO、风险和 MVP 2 建议 |

里程碑以证据通过为准，不以“编码完成”作为完成。

## 6. 团队配置

| 角色 | 建议 FTE | 职责 |
| --- | ---: | --- |
| Product Owner | 1.0 | 范围、用户、验收和价值 |
| Tech Lead/Architect | 1.0 | 架构、上游同步、身份和安全边界 |
| 后端工程师 | 2.0～3.0 | Auth、组织、权限、Registry、知识和审计 |
| 前端工程师 | 1.5～2.0 | Web 管理台、员工端和 Desktop 集成 |
| AI/RAG 工程师 | 1.0～1.5 | 知识、评测、Dify、模型策略 |
| QA/SDET | 1.0～1.5 | 权限、契约、E2E、性能和回归 |
| DevOps/SRE | 0.5～1.0 | 环境、CI/CD、监控、备份和 Desktop 发布 |
| Security/Privacy | 0.3～0.5 | 身份、Tool、数据和供应链安全 |
| UX/设计 | 0.3～0.5 | 登录、管理和核心工作流体验 |
| HR/IT/企业微信管理员 | 0.2～0.5 | 权威源、应用和同步接口 |
| 知识管理员/业务 SME | 0.3～0.5 | 首批内容、问题集和 UAT |

峰值约 **8～11 FTE**，建设投入约 **35～55 人月**。若身份平台、企业微信接口或 Desktop 发布链路需要从零建设，投入接近上限。

## 7. RACI

| 工作 | Product | Tech Lead | Dev | AI/RAG | QA | HR/IT | Security | 知识 Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MVP 范围 | A/R | C | I | C | C | C | C | C |
| 身份权威源 | C | C | I | I | I | A/R | C | I |
| SSO/企业微信 | I | A | R | I | R | R | C | I |
| 组织权限 | C | A | R | I | R | R | C | I |
| Registry | A | R | R | R | C | I | C | C |
| 企业知识 | C | C | R | R | R | I | C | A/R |
| 安全发布 | I | C | R | C | R | C | A/R | I |
| Pilot Go/No-Go | A | C | I | C | R | C | R | R |

## 8. 预算 ROM

### 8.1 MVP 一次性预算（人民币，不含税）

| 类别 | ROM | 说明 |
| --- | ---: | --- |
| 研发与测试人力 | 120～280 万 | 35～55 人月，视内部/外包综合成本 |
| 环境、存储、数据库和监控 | 10～40 万 | Dev/Test/UAT/Pilot |
| 模型、Embedding 和评测 | 5～30 万 | 首期通用知识规模 |
| Identity Broker/企业微信/桌面发布 | 5～35 万 | 支持、证书、签名、MDM 等 |
| 安全测试和供应链 | 8～30 万 | 身份、越权、MCP、Desktop |
| 培训、上线和支持准备 | 5～15 万 | 管理员、员工和运维 |
| 风险预备金 | 上述的 15%～20% | 接口、Desktop、身份和安全不确定性 |

综合 ROM：**约 180～500 万元**，不包括大规模私有 GPU 集群。

### 8.2 年度运行成本

| 类别 | 年度 ROM |
| --- | ---: |
| 平台运维与持续开发 | 80～220 万 |
| 云/机房、存储、备份和监控 | 15～80 万 |
| 模型与 Embedding | 10～120 万 |
| 外部平台技术支持与升级维护 | 0～80 万 |
| 安全、审计和桌面签名维护 | 10～50 万 |

Pilot 后按每活跃用户、每千次问答、每千页解析和每 Workflow Run 建立单位成本。

## 9. 采购与外部依赖

### 9.1 W1～W4 必须落实

| 项目 | 截止 | 关键内容 |
| --- | ---: | --- |
| 企业 SSO/Identity Broker | W1 | OIDC、企业微信、账号关联、HA |
| 企业微信自建应用 | W1 | Corp ID、Agent、可信域名、回调、Secret |
| HR/组织接口 | W2 | 新人新事 API、字段、频率、状态 |
| LobeHub/Dify/RAGFlow 技术基线 | W2 | 版本、接口、部署、升级和支持联系人 |
| 域名、TLS、邮件/通知 | W2 | 企业域名和回调地址 |
| Secret Manager | W3 | 加密、轮换、审计 |
| Desktop 代码签名 | W3 | Windows/macOS 证书和发布主体 |
| Model Provider/Gateway | W3 | 数据用途、区域、配额和价格 |
| 对象存储与备份 | W3 | 加密、版本、容量、恢复 |
| 安全与监控产品 | W4 | SAST/SCA、镜像、日志、Trace、告警 |

### 9.2 Desktop 特别依赖

- Windows 代码签名证书；
- macOS Developer ID/Notarization（如支持 macOS）；
- 企业软件分发或 MDM；
- 自动更新域名和制品存储；
- Deep Link/协议注册安全评审；
- 最低版本和紧急停止本地 Tool 的策略。

## 10. 风险台账

| ID | 风险 | 概率 | 影响 | 应对 | Owner |
| --- | --- | :---: | :---: | --- | --- |
| R01 | SSO 与企业微信产生重复账号 | 高 | 高 | 稳定 employeeId、显式绑定、冲突队列、禁止姓名合并 | Identity Lead |
| R02 | HR 与企业微信组织不一致 | 高 | 高 | 冻结唯一真源、差异报告、人工处理例外 | HR/IT |
| R03 | 离职权限回收不及时 | 中 | 极高 | 增量同步、Session 回收、告警和定期对账 | Security |
| R04 | LobeHub 现有权限路径不完整 | 中 | 极高 | 服务端统一授权、越权测试、RLS 评估 | Tech Lead |
| R05 | Desktop 本地能力绕过企业策略 | 中 | 极高 | 设备、目录、Tool 三层策略和审计 | Desktop/Security |
| R06 | 平台先行演变为无用户的大平台 | 中 | 高 | 强制制度/SOP 灯塔场景和真实 Pilot | Product |
| R07 | Skill/Tool/Workflow 无审核即发布 | 中 | 高 | 状态机、职责分离、生产只加载 published | AI Admin |
| R08 | 第三方 MCP/Skill 引发供应链风险 | 高 | 高 | 来源和完整性审查、沙箱、出站白名单、禁止自动安装 | Security |
| R09 | 知识权限在检索或引用阶段泄漏 | 中 | 极高 | 前后双重过滤、引用鉴权、跨部门测试 | Backend |
| R10 | 企业微信 API/回调限制影响登录 | 中 | 中 | 尽早技术 Spike、Broker 备选、监控和重试 | Identity Lead |
| R11 | Dify/RAGFlow 升级破坏契约 | 中 | 高 | Adapter、固定版本、契约测试、升级环境 | Tech Lead |
| R12 | Desktop 签名/发布采购延误 | 中 | 中 | W1 启动证书申请，Web 作为降级入口 | PM |
| R13 | 模型数据用途不满足企业要求 | 中 | 极高 | DPA、数据分级、Gateway、私有模型备选 | Privacy |
| R14 | `@know` 资料含内部敏感信息 | 中 | 高 | 仓库访问控制、分类、禁止公开发布和日志暴露 | Data Owner |
| R15 | 上游同步导致企业能力回归 | 高 | 中 | 独立包/Adapter、双周同步、E2E 回归 | Tech Lead |
| R16 | Pilot 知识质量差导致用户不信任 | 中 | 高 | Owner、版本、生效状态、评测集和引用 | Knowledge Owner |

## 11. 质量门禁

每个合并请求：

- lint、类型检查和相关测试；
- 权限、身份和数据模型变更专项 Review；
- 新 Tool/Workflow 必须有 Schema 和风险等级；
- 用户可见流程提供实际验收证据。

每个发布候选：

- SSO/企业微信回归；
- 账号绑定和离职回收；
- 跨部门/Workspace 越权；
- Skill/Tool/Workflow 发布与回滚；
- 知识检索和引用；
- Web/Desktop 一致性；
- Secret/供应链扫描；
- 外部依赖故障和恢复；
- 备份、恢复、升级和回滚。

## 12. Go/No-Go

### Go

- PRD AC-01～AC-15 通过；
- 同一员工 SSO/企业微信唯一账号验证通过；
- 禁用和权限回收达到 SLA；
- 无跨部门/Workspace 泄漏；
- Web/Desktop 和私有部署链路可用；
- Registry 发布治理和回滚通过；
- 知识回答引用达到阈值；
- 无未接受 Critical/High 风险；
- Pilot Owner、IT、安全和业务共同批准。

### No-Go

- 身份权威源不明确；
- 存在重复账号或离职用户继续访问；
- 浏览器/Desktop 泄漏共享密钥；
- 未发布 Tool/Workflow 可被生产调用；
- 知识检索发生越权；
- Desktop 无签名或安全升级渠道；
- 没有真实 Pilot 用户和知识 Owner。

## 13. Pilot 评价与 MVP 2 决策

Pilot 结束输出：

- 登录成功率、重复账号和禁用时效；
- Web/Desktop 活跃和任务完成；
- 知识正确引用率、无依据率和用户反馈；
- Skill/Tool/Workflow 使用和发布效率；
- 平台稳定性、安全事件和单位成本；
- 用户访谈和继续使用意愿；
- MVP 2 场景评分。

只有平台质量达到门槛后，才进入 TMF QC、Protocol Assistant、CRA Assistant 和 Study Copilot。业务场景进入顺序由价值、数据、风险和 Owner 共同决定，不按技术展示效果决定。

## 14. 立即行动

1. 指定 Product、Identity、Security、Knowledge Owner；
2. 确认新人新事、企业微信、SSO 的权威边界；
3. 申请企业微信测试应用和回调域名；
4. 决定 Identity Broker 方案；
5. 确认 Web/Desktop 支持的操作系统和分发方式；
6. 选择 2 个 Pilot 部门和 50～200 份知识；
7. 选择 1 个只读 Tool、1 个低风险 Workflow；
8. 冻结登录、权限、知识和审计验收数据集；
9. 按实际团队容量拆解 Sprint；
10. 将 TMF PRD 移入 MVP 2 Backlog，而非删除。
