# MVP PRD：企业 AI 工作台基础平台

> 状态：产品需求基线 2.0（已按平台优先策略重构）
>
> 产品：Youlin Clinical AI Hub
>
> 目标版本：MVP 1.0
>
> 目标周期：建设 14～16 周，Pilot 4～6 周
>
> 关联文档：[企业版二开架构](./04-lobehub-extension-architecture-and-roadmap.md) · [集成契约](./06-integration-contracts.md)
>
> 后续阶段：TMF、Protocol、CRA、Study Copilot 等临床业务场景

## 1. 产品定位

首个 MVP 不直接建设单一临床业务系统，而是基于 LobeHub 建设企业统一 AI 工作台基础平台：

```text
企业身份与组织
+ Web/Desktop 多端工作台
+ 企业模型与 Agent
+ Skill / Tool / Workflow 能力中心
+ 企业通用知识库
+ 权限、审计、配额和发布治理
```

同时用“企业制度与 SOP 知识助手”作为灯塔场景，验证从登录、授权、知识检索、引用回答、Workflow、Tool 到审计的最小完整链路。

### 1.1 一句话目标

> 企业员工使用 SSO 或企业微信登录同一个账号，在 Web 和 Desktop 中安全使用经过企业审核的知识、Skill、Tool、Workflow 和 Agent。

### 1.2 为什么平台优先

- 企业组织和权限是所有 CRO 场景的共同前置能力；
- Skill、Tool、Workflow 和知识库需要统一注册、审核、发布和回滚；
- 先验证账号、权限、多端、知识和治理，可降低后续业务场景返工；
- 企业约 300～500 人，组织资料显示存在多部门、多专业线、多岗位和矩阵项目协作，不能用简单用户列表代替组织权限；
- 先从通用知识和低风险能力开始，更容易受控 Pilot。

## 2. MVP 目标与非目标

### 2.1 产品目标

1. 支持企业标准 SSO 和企业微信登录；
2. 同一员工不同登录方式关联到唯一企业账号；
3. 同步部门、员工、在职状态和基础角色；
4. 提供企业私有部署的 Web 服务；
5. 提供连接同一企业服务端的 Desktop/Electron 客户端；
6. 建立企业 Skill、Tool、Workflow 和 Agent 的注册与发布治理；
7. 建立企业级、部门级和个人级通用知识库；
8. 知识回答提供文件版本、页码和来源；
9. 建立模型、权限、凭证、配额、审计和可观测基础；
10. 通过一个通用灯塔场景完成真实用户 Pilot。

### 2.2 非目标

MVP 1.0 不包含：

- CTMS、EDC、eTMF、ePRO、IWRS、QMS 的 GxP/Part 11 受控记录处理和生产写回；
- TMF 智能质检正式业务闭环；
- SAE、医学监查、受试者诊疗等高风险决策；
- 受试者级 PHI 数据处理；
- 完整 OA/BPM 替代；
- 全企业全部知识一次性迁移；
- 用户自由安装未经审核的生产 MCP/Tool；
- Desktop 完全离线的企业数据副本；
- 多法人、多客户复杂租户计费；
- 任何受试者、人遗、跨境协作数据处理或未经网关策略批准的数据外发。

这些能力进入 MVP 2/3，且必须在预期用途、数据分类和验证范围确认后实施。

## 3. 产品边界与系统关系

```text
企业 HR（新人新事）/企业通讯录
             │
       身份与组织同步
             ▼
企业 SSO / Identity Broker ← 企业微信
             │ OIDC
             ▼
      Youlin Web/API
       ├── Web SPA
       ├── Desktop/Electron
       ├── Skill/Tool/Workflow Registry
       ├── Knowledge Gateway
       ├── Model Gateway
       └── Audit/Tracing
             │
       RAGFlow / Dify / MCP / Pi Runner
```

### 3.1 身份权威源

必须在实施前确认唯一权威：

- 员工和在职状态建议以 HR“新人新事”为真源；
- 部门结构可由 HR 或企业微信通讯录提供，但只能确定一个主源；
- 企业微信作为登录和协作渠道，不应默认成为所有人事事实真源；
- LobeHub 保存身份映射和权限投影，不成为人事主数据源。

### 3.2 已知企业系统与边界

- HR：新人新事，提供员工与在职状态候选真源；
- OA/BPM：泛微，后续在其中重塑正式流程，Youlin 不替代其审批终态；
- CRM：有临自研系统；
- 临床系统：医渡科技定制 CTMS、EDC、IWRS、eTMF，MVP 1 不接入受控记录；
- 财务：用友；QMS、LMS、PV/安全数据库的供应商和接口待核验；
- 数据：各系统理论上可取数，但版本、接口、部署、Owner 和 SLA 必须在接入前验证；
- 模型：统一通过现有企业模型网关接入 OpenAI/阿里云百炼，业务数据不得出境或越出批准边界。

## 4. 用户与角色

| 角色 | 目标 | 核心权限 |
| --- | --- | --- |
| 普通员工 | 查询知识、使用已授权 Agent/能力 | 使用，不管理企业资源 |
| 部门知识管理员 | 管理本部门知识 | 上传、版本、发布、撤回 |
| Skill Creator | 创建和测试 Skill | 管理本人草稿 |
| Tool/Workflow Creator | 接入和测试能力 | 管理本人草稿和测试版本 |
| Reviewer | 审核企业能力 | 评审、退回、批准发布 |
| AI 平台管理员 | 配置模型、能力和策略 | 企业 AI 配置和运行治理 |
| 企业管理员 | 管理组织和 Workspace | 成员、角色、权限和策略 |
| Auditor | 检查关键操作 | 只读审计和导出 |
| Desktop 用户 | 使用本地文件/受控工具 | 受设备与目录策略约束 |

角色可叠加，但审批者不能审批自己提交的高风险 Tool/Workflow。

## 5. 范围 A：企业登录与账号

### FR-A01 标准 SSO

- LobeHub 通过 OIDC 接入企业 IdP 或 Identity Broker；
- 支持授权码 + PKCE；
- 校验 issuer、audience、nonce、state 和签名；
- 支持企业域名、回调地址和 Session 策略；
- 生产环境禁止绕过 SSO 的普通注册；
- 保留受控、可审计的紧急管理员账号机制。

### FR-A02 企业微信登录

- Web 支持企业微信扫码或企业内授权登录；
- 企业微信凭证只保存在服务端 Secret Manager；
- 登录成功后通过稳定员工标识查找或绑定企业账号；
- 禁止仅按姓名自动合并；
- 绑定冲突进入管理员处理队列；
- 记录登录 Provider、外部 Subject、时间和结果。

推荐通过 Identity Broker 聚合企业 SSO 与企业微信，再统一向 LobeHub 提供 OIDC。若企业现有 SSO 已支持企业微信，则不重复建设 Broker。

### FR-A03 唯一账号和身份关联

建议身份结构：

```text
User
├── Identity(provider=enterprise-oidc, subject=...)
├── Identity(provider=wecom, subject=...)
└── Employee(employeeId=..., status=active)
```

必须支持：

- 首次登录自动建号或待审批建号；
- SSO 与企业微信绑定同一 User；
- 解绑、冲突处理和账号合并审计；
- 禁用用户立即阻止新登录；
- 根据风险配置回收现有 Session；
- 不因邮箱或手机号变化创建第二账号。

### FR-A04 账号生命周期

状态：

```text
pending → active → suspended → deactivated
```

- 新员工可按规则自动开通；
- 部门调动更新组织关系但不丢失个人数据；
- 离职/禁用同步后撤销访问；
- 同步失败告警且不静默恢复已禁用账号；
- 所有自动变更记录来源和批次。

## 6. 范围 B：组织与权限

### FR-B01 组织同步

- 支持全量初始化和增量同步；
- 同步部门、员工、负责人、在职状态；
- 外部 ID 稳定映射，不用部门名称作为主键；
- 组织变更有差异预览、失败重试和审计；
- 删除优先软删除或失效，不物理删除历史责任记录；
- `@know` 文件作为需求和核验输入，不直接作为生产导入源。

### FR-B02 组织模型

MVP 支持：

```text
Enterprise
├── Department（可形成树）
├── Group（跨部门权限组）
├── Workspace
└── Member
```

首期建议一个企业对应一个主 Workspace。Study/Project 级复杂权限在 MVP 2 扩展。

### FR-B03 权限模型

采用：

```text
平台角色 + Workspace RBAC + Resource ACL
```

资源级动作：

```text
view / use / edit / manage / publish
```

资源类型：

- Agent；
- Skill；
- Tool；
- Workflow；
- Knowledge Base；
- Document；
- Model；
- Credential 元数据。

### FR-B04 权限安全

- 所有服务端查询强制带 Workspace 范围；
- 部门知识访问由成员关系和资源授权共同决定；
- 搜索、引用、Agent 上下文和 Tool 调用使用同一授权结果；
- 浏览器隐藏按钮不能代替服务端鉴权；
- 越权响应不泄漏资源名称和元数据；
- 建立跨部门和跨 Workspace 自动化测试。

## 7. 范围 C：Web、Desktop 与私有部署

### FR-C01 Web

- 企业域名访问；
- SSO/企业微信登录；
- Agent、知识、Skill、Tool、Workflow 和管理控制台；
- 主流企业浏览器兼容；
- SSE 流式响应和断线恢复。

### FR-C02 Desktop/Electron

- Desktop 连接同一企业服务端；
- 支持系统浏览器 SSO、回调 Deep Link 或设备授权流程；
- Web 与 Desktop 使用同一用户、权限、对话和企业资源；
- 本地文件访问必须用户主动选择；
- 本地 Tool 按设备、目录和风险策略授权；
- 企业资源不默认完整离线落盘；
- 支持企业签名、升级通道和版本最低要求。

### FR-C03 本地/私有部署

“本地端”同时覆盖企业私有部署：

- 开发环境可使用 Docker Compose；
- Pilot/生产环境根据容量选择 Kubernetes 或受控容器平台；
- PostgreSQL、Redis、S3、RAG、Dify、模型网关可在企业网络部署；
- 环境配置和 Secret 分离；
- 支持备份、恢复、日志、指标和 Trace；
- 对外网络出口使用白名单。

## 8. 范围 D：企业 Skill 中心

### FR-D01 Skill 定义

Skill 是 Agent Skills 格式的领域说明和标准方法，不是可执行 API。

最少字段：

```text
id / name / description / SKILL.md / version / owner
scope / tags / riskLevel / status / reviewers / changelog
```

### FR-D02 生命周期

```text
draft → reviewing → approved → published → deprecated
             ↘ rejected
```

- Creator 只能管理草稿；
- 发布必须审核；
- 生产 Agent 默认只使用 published 版本；
- Agent 运行记录确定 Skill 版本；
- 支持回滚和废弃，不静默覆盖已发布版本；
- 支持企业、部门和个人范围。

### FR-D03 Skill 安全

- 导入 Skill 时校验路径、压缩包和文件大小；
- Skill 中的外部指令视为不可信内容；
- Skill 不能自行提升 Tool 权限；
- 第三方 Skill 需要来源、完整性和安全审核。

## 9. 范围 E：企业 Tool 中心

### FR-E01 Tool Registry

支持注册：

- MCP HTTP/SSE；
- 企业 HTTP API；
- 内置 Tool；
- Dify Workflow Tool；
- Pi Runner/本地 Tool（受控试验）。

每个 Tool 包含输入输出 Schema、版本、Owner、权限、风险、凭证引用、超时、数据策略和审批策略。

### FR-E02 风险策略

| 等级 | 示例 | 默认策略 |
| --- | --- | --- |
| Low | 查询公开制度 | 自动执行并审计 |
| Medium | 生成文档草稿 | 执行后人工确认 |
| High | 发送消息、写业务系统 | 执行前明确审批 |
| Prohibited | 代签、删除受控记录 | 阻断 |

MVP 灯塔场景至少接入一个只读 Tool，不接生产写回。

### FR-E03 Credential

- Credential 值保存在 Secret Manager 或加密存储；
- 普通用户不能看到明文；
- Tool 只获得调用所需短期凭证；
- 支持轮换、失效和使用审计；
- Desktop 不下发企业共享长期密钥。

## 10. 范围 F：企业 Workflow 中心

### FR-F01 Workflow Registry

- 统一注册 Dify 或其他引擎 Workflow；
- 保存输入输出 Schema、固定版本、Owner、权限和风险；
- LobeHub 管元数据、发布和权限，Dify 管流程节点；
- 生产运行不自动跟随 Dify 草稿最新版。

### FR-F02 生命周期

```text
draft → testing → reviewing → published → deprecated
```

- 测试环境与生产凭证隔离；
- 发布前通过 Schema、权限、安全和样例测试；
- 记录每次运行的 Workflow/模型/Prompt 版本；
- 支持取消、超时、重试和运行查询；
- 输出明确标记为 AI 生成或 Workflow 结果。

### FR-F03 MVP Workflow

首期至少实现一个低风险 Workflow，例如：

```text
输入制度主题
→ 检索授权知识
→ 生成带引用的制度摘要
→ 用户确认
→ 导出受控格式草稿
```

不自动发送、不自动审批、不写入临床生产系统。

## 11. 范围 G：企业通用知识库

### FR-G01 范围

支持：

- 企业知识库；
- 部门知识库；
- 个人知识库；
- 后续可扩展 Project/Study 知识库。

### FR-G02 文件和版本

- 上传 PDF、DOCX、XLSX、TXT/Markdown 等白名单格式；
- 保存文件 Hash、版本、Owner、密级和生效状态；
- 新版本不覆盖旧版本；
- 支持撤回、失效和重新解析；
- 文件内容经过恶意扫描和解析隔离；
- 浏览和检索使用同一资源权限。

### FR-G03 检索与回答

- 可选 Lobe 原生 RAG 或 RAGFlow Adapter；
- 支持全文、向量和混合检索；
- 按 Workspace、部门、知识库、状态和版本过滤；
- 回答必须展示文件、版本、页码/章节和引用；
- 无足够依据时明确表示无法确认；
- 用户可以反馈有帮助、引用错误和答案错误；
- 建立固定 RAG 评测集。

### FR-G04 首批知识范围

建议纳入：

- 企业制度、员工手册；
- 信息安全与 IT 使用说明；
- 通用 SOP；
- 部门职责和常用模板。

首批排除：PHI、受试者数据、高敏客户材料、未脱敏人事材料和未经授权业务数据库。

## 12. 范围 H：Agent、模型与治理

### FR-H01 企业 Agent

- 创建 Agent 并绑定模型、Skill、Tool、Workflow 和知识库；
- Agent 有企业、部门、个人范围；
- 发布版本可审核和回滚；
- 运行时解析并记录确定版本；
- Agent 不能绕过底层资源权限。

### FR-H02 模型

- 通过统一 Model Runtime/Gateway 接入；
- 按角色和资源范围授权模型；
- 支持默认模型、禁用模型、配额和预算；
- 默认禁止向外部模型发送业务原文；企业网关必须按“不出境、不越界”基线执行 Provider、字段与用途白名单；
- 记录 Provider、模型版本、Token、延迟和成本。

### FR-H03 审计与可观测

至少记录：

- 登录、绑定、登出、禁用；
- 组织同步和权限变更；
- Skill/Tool/Workflow/Agent 发布；
- 文件和知识库变更；
- Tool 和 Workflow 调用；
- 管理员配置和 Credential 元数据操作；
- 模型调用摘要、用量和策略结果。

敏感内容默认不完整写入普通日志；审计、业务记录和调试日志分开治理。

## 13. 灯塔场景：企业制度与 SOP 助手

### 13.1 主流程

```text
员工使用 SSO/企业微信登录
→ 系统解析唯一账号与部门
→ 员工打开企业制度助手
→ 提问制度/SOP 问题
→ 仅检索其有权限且当前有效的文件
→ 返回带版本、页码和原文引用的答案
→ 用户查看引用并反馈
→ 管理员查看质量、成本和审计
```

### 13.2 扩展流程

```text
员工选择“生成执行清单” Workflow
→ Workflow 使用当前回答和授权引用
→ 生成草稿
→ 用户确认
→ 下载或保存个人文档
```

### 13.3 不允许

- 根据过期文件给出未标记的确定答案；
- 引用用户无权浏览的文件；
- 自动批准或对外发送；
- 把用户问题自动写入长期记忆而不遵守记忆策略；
- 将敏感制度全文发送到未批准模型。

## 14. 页面范围

员工端：

1. 登录与账号绑定；
2. 首页/Agent 工作台；
3. 企业知识问答；
4. Skill/Tool/Workflow 浏览；
5. 个人知识和文件；
6. Desktop 设备与本地能力提示；
7. 个人用量和授权。

管理端：

1. 组织和成员同步；
2. 角色、用户组和资源权限；
3. Skill Registry；
4. Tool/MCP Registry；
5. Workflow Registry；
6. Agent 发布；
7. 企业知识库；
8. 模型、凭证、配额；
9. 审计、运行和集成健康状态。

## 15. 非功能需求

### 15.1 安全

- 服务端强制鉴权和资源范围；
- 浏览器不持有企业微信、Dify、RAGFlow 和共享 Tool 密钥；
- OIDC 防 CSRF、重放和回调劫持；
- 文件扫描、SSRF 防护、MCP 出站策略；
- 高风险工具有人工审批；
- Secret 可轮换；
- 依赖、镜像和桌面制品有供应链扫描。

### 15.2 性能候选

容量基线按 300～500 名企业员工可覆盖设计；Pilot 为 20～50 人。峰值并发、文档规模和模型吞吐尚无实测数据，必须通过容量采样和压测冻结。

- 登录完成后首页 P95 ≤ 3 秒；
- 普通列表 P95 ≤ 2 秒；
- 知识检索 P95 ≤ 5 秒，不含模型生成；
- 流式回答首 Token P95 ≤ 5 秒；
- 组织增量同步在 15 分钟内生效；
- 禁用用户访问回收时间由安全评估冻结，建议 ≤ 15 分钟。

### 15.3 可用性

- 外部 RAG/Dify 不可用时明确降级，不伪造成功；
- 异步任务可查询、重试和人工恢复；
- Web 服务故障不破坏已存文件和审计；
- Desktop 版本过旧时可阻止高风险本地能力；
- Pilot 前完成备份和恢复演练。

### 15.4 隐私

- 只同步业务所需员工字段；
- 手机、邮箱等字段按用途控制和脱敏；
- 明确日志、对话、文件和审计的保留期；
- 支持账号停用后的数据归属和个人数据处理；
- `@know` 资料按内部资料治理，不公开暴露。

## 16. 核心验收标准

### AC-01 唯一账号

同一员工分别使用企业 SSO 和企业微信登录，系统映射到同一 `userId`，不会创建重复个人空间和权限。

### AC-02 生命周期

HR/权威源将员工标记为离职或禁用后，在约定时限内禁止新登录并回收会话；操作有审计。

### AC-03 组织同步

部门新增、调动和失效可增量同步；失败可重试；组织历史责任记录不因同步被物理删除。

### AC-04 权限隔离

部门 A 用户通过页面、API、搜索、Agent、引用和 Tool 均无法访问仅授权部门 B 的资源。

### AC-05 Web/Desktop 一致性

同一用户在 Web 和 Desktop 看到相同企业资源、权限和会话；本地 Tool 额外受设备和本地策略限制。

### AC-06 Skill 发布

Creator 提交 Skill 后需 Reviewer 批准才能成为企业 published 版本；回滚后历史 Agent Run 仍能定位原版本。

### AC-07 Tool 治理

只读 Tool 可按授权调用；高风险 Tool 未批准不能执行；调用记录含用户、Agent、参数摘要、结果和策略。

### AC-08 Workflow 版本

生产 Workflow 固定到已发布版本；Dify 草稿变化不影响生产运行；输出通过 Schema 校验。

### AC-09 知识权限

知识检索仅返回用户有权查看且状态有效的文件片段，引用链接再次执行权限检查。

### AC-10 引用可靠性

灯塔场景答案展示文件名、版本、页码/章节和原文；无依据时不生成伪造引用。

### AC-11 密钥安全

浏览器包、网络响应、普通日志和 Desktop 配置中不存在企业共享服务明文密钥。

### AC-12 审计

Auditor 能还原账号绑定、权限变更、资源发布、知识变更、Tool/Workflow 调用和管理员操作。

### AC-13 故障降级

RAGFlow、Dify、模型或 Tool 超时/不可用时，用户看到真实状态且可恢复，不记录虚假成功。

### AC-14 私有部署

在目标企业环境按 Runbook 完成部署、升级、备份和恢复，环境 Secret 与代码/镜像分离。

### AC-15 Pilot

至少两个部门、20～50 名用户完成 4～6 周 Pilot，无重大权限/安全事件，核心任务完成率达到约定阈值。

## 17. 产品指标

| 维度 | 指标候选 |
| --- | --- |
| 身份 | 登录成功率、重复账号数、禁用生效时间 |
| 采用 | 周活用户、知识问答任务完成率、重复使用率 |
| 知识 | 引用可定位率、正确引用率、无依据回答率 |
| 能力治理 | 发布周期、回滚成功率、未授权调用数 |
| 稳定性 | P95 延迟、错误率、异步任务恢复率 |
| 安全 | 越权事件、密钥泄漏、高风险 Tool 绕过数 |
| 成本 | 每活跃用户、每次回答、每个 Workflow 的成本 |

不以 Token 总量、Agent 数量或聊天次数作为单独成功标准。

## 18. Pilot 方案

- 选择 2 个部门，覆盖普通员工、知识管理员和平台管理员；
- 20～50 名用户；
- 50～200 份已审查的通用制度/SOP；
- 3～5 个企业 Skill；
- 1 个只读 Tool；
- 1 个低风险 Dify Workflow；
- 2～3 个已发布 Agent；
- 同时验证 Web 和少量受控 Desktop 设备；
- 运行 4～6 周，每周复盘身份、权限、质量、成本和体验。

## 19. 后续阶段

### MVP 2：临床业务场景

- TMF 智能质检；
- Protocol Assistant；
- CRA Assistant；
- Study Project Copilot；
- BPM 审批和 Evidence Package。

### MVP 3：深度系统集成

- CTMS/eTMF/EDC/ePRO/IWRS/QMS；
- 受控写回；
- 多 Study/项目级 ABAC；
- 更高风险 Agent 和 GxP 验证。

## 20. 待冻结决策

1. 企业 SSO/Identity Broker 产品；
2. HR“新人新事”和企业微信中哪个是部门结构真源；
3. 企业微信登录采用 Broker 还是 LobeHub 自定义 Provider；
4. 一个 Workspace 是否代表整个企业；
5. Desktop 登录采用 Deep Link 还是设备授权；
6. 原生 RAG 与 RAGFlow 的首期选择；
7. Dify 首期 Workflow；
8. 现有企业 Model Gateway 的 OpenAI/阿里云百炼路由、部署区域和不出境控制；
9. Pilot 部门、知识范围和数据密级；
10. 用户、对话、文件、日志和审计保留期限。
