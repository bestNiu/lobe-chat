# Youlin 多系统融合接入与可产品化模块建设规范

> 状态：指导性规范 1.0  
> 适用范围：Youlin Clinical AI Hub、现有企业系统、新建业务系统、可独立销售模块  
> 身份基线：Keycloak 私有部署，Youlin 通过 Generic OIDC 接入  
> 关联文档：[企业版二开架构](./04-lobehub-extension-architecture-and-roadmap.md) · [集成契约](./06-integration-contracts.md) · [MVP PRD](./07-mvp-product-spec.md)

## 1. 文档目的

本规范用于统一回答以下问题：

1. 现有 HR、OA、CRM、CTMS、EDC、eTMF、IWRS、QMS、LMS、PV、财务等系统如何进入企业 AI 工作台；
2. 如何实现统一登录，而不在工作台中保存或传递其他系统的用户名和密码；
3. 哪些系统适合 iframe 内嵌，哪些系统应使用 SSO 深链接或 API 融合；
4. 后续新系统如何同时支持“工作台模块”和“独立产品”两种交付形态；
5. 身份、权限、接口、事件、数据、安全、审计、部署和版本需要遵守什么契约；
6. 一个系统达到什么条件后，才允许进入生产工作台或作为独立产品交付。

本规范不要求把所有系统重写为同一种技术栈，也不要求把所有页面塞进 iframe。融合的目标是统一入口、身份、任务、数据契约和治理，而不是把多个系统视觉拼接成一个“大页面”。

---

## 2. 规范关键词

本文使用以下约束级别：

- **MUST/必须**：生产接入强制要求，不满足不得上线；
- **MUST NOT/禁止**：明确禁止；
- **SHOULD/应该**：默认采用，偏离时必须记录 ADR；
- **MAY/可以**：按场景选择。

---

## 3. 总体原则

### 3.1 七条原则

1. **统一身份，不共享密码**：所有可改造系统统一接入 Keycloak；禁止工作台代填或保存业务系统密码。
2. **独立系统，不共享前端 Session**：每个系统自行建立安全 Session，SSO 只消除重复登录。
3. **契约集成，不直连数据库**：系统之间通过版本化 API、事件或受控数据服务连接。
4. **独立部署，组合呈现**：新模块必须可独立运行，工作台只是可选宿主。
5. **后端授权，不信任前端**：菜单、按钮和 iframe 可见性不能替代服务端权限检查。
6. **最小数据，不出边界**：数据不出境、不越出批准处理边界；只传递完成任务所需字段。
7. **渐进融合，不强制重构**：现有系统从 SSO 深链接开始，具备条件后再升级为内嵌或原生融合。

### 3.2 明确禁止

- 禁止在 URL、iframe 参数、前端存储或 `postMessage` 中传递长期 Access Token、Refresh Token、密码或共享 Secret；
- 禁止仅按姓名、手机号或邮箱自动合并账号；
- 禁止使用 `*` 配置生产 CORS、`frame-ancestors` 或消息来源；
- 禁止工作台直接查询业务系统生产数据库；
- 禁止多个模块共同拥有同一业务表并绕过 API 修改；
- 禁止把 Keycloak Role 当作全部业务对象授权；
- 禁止为了内嵌而关闭 CSRF、XSS、点击劫持或浏览器 Cookie 安全控制；
- 禁止未经数据分类和审批，将业务原文发送到外部模型 Provider。

---

## 4. 目标架构

```text
新人新事 HR ──人员同步服务──────────────┐
                                         ▼
企业微信 ──身份适配器──────────────► Keycloak
                                         │ OIDC / SAML
                  ┌──────────────────────┼──────────────────────┐
                  ▼                      ▼                      ▼
           Youlin 工作台             现有业务系统             新建产品模块
          Web / Desktop        泛微/CRM/CTMS/用友等       Standalone + Embedded
                  │                      │                      │
                  └──────── Module Registry / API / Event ─────┘
                                         │
                              Integration / Tool Gateway
                                         │
                         审计、可观测、数据策略和凭证治理
```

### 4.1 组件职责

| 组件 | 核心职责 | 不承担的职责 |
| --- | --- | --- |
| Keycloak | 认证、Token、Session、MFA、外部身份绑定 | HR 主数据、业务对象授权、业务审批终态 |
| 新人新事 | 员工号、人员状态和候选组织主数据 | 应用 Session、工作台资源权限 |
| 企业微信身份适配器 | 企业微信 OAuth/API 与 Keycloak 身份映射 | 自行建立第二套企业账号 |
| Youlin 工作台 | 门户、应用目录、统一任务、AI、资源入口和审计入口 | 替代所有源业务系统 |
| Module Registry | 模块元数据、入口、版本、权限、健康和启停 | 保存模块业务数据 |
| Integration Gateway | API、事件、凭证、限流、审计和协议适配 | 成为新的业务事实源 |
| 业务系统/模块 | 自身业务规则、数据、授权和审计 | 信任工作台前端决定访问权限 |

---

## 5. 系统接入模式

每个系统可以组合使用多种模式，但必须指定一个主要用户入口。

### 5.1 L1：SSO 深链接

工作台展示应用卡片或业务链接，用户在新标签页进入目标系统，目标系统通过 Keycloak 自动完成 SSO。

适用：

- 供应商系统无法修改 CSP 或前端布局；
- 财务、EDC、PV/安全数据库等高敏系统；
- 尚未完成内嵌安全验证的系统；
- 需要完整使用原系统导航的场景。

这是现有系统的默认接入方式，也是所有内嵌方案的降级入口。

### 5.2 L2：iframe 页面内嵌

工作台的应用容器通过 iframe 加载目标系统的专用页面。

适用：

- 系统支持 Keycloak OIDC/SAML；
- 可以配置 CSP、Cookie、回调地址和嵌入页面；
- 页面有明确任务边界，例如待办、表单、项目概览、报表；
- 供应商和安全负责人允许被指定域名嵌入。

不建议一开始整站内嵌。应该优先内嵌特定任务页面，并保留“在独立窗口打开”。

### 5.3 L3：API/事件融合

工作台不展示原系统页面，而是通过 API 或事件获取待办、状态、指标和业务上下文，形成统一任务或 AI 工具。

适用：

- 统一待办；
- 跨系统搜索；
- 项目风险与里程碑聚合；
- 只读 Tool；
- AI 获取最小必要业务上下文。

该模式用户体验最好，但必须明确数据权威源、缓存时效和写回责任。

### 5.4 L4：工作台原生模块

功能直接使用 Youlin 的页面、组件和领域服务实现。

只适合：

- 工作台首页与应用中心；
- AI Agent、Skill、Tool、Workflow；
- 统一任务、通知、搜索和审计；
- 与工作台生命周期完全一致的企业能力。

计划独立销售的业务系统不应只提供 L4 形态。

### 5.5 L5：微前端或组件级融合

只有在双方前端均由企业控制、发布节奏协调且确有高交互需求时，才考虑 Module Federation、Web Component 或共享运行时。

该模式不是默认方案，因为它会引入：

- React/路由/依赖版本耦合；
- 样式污染；
- 宿主升级兼容成本；
- 独立销售和独立部署困难；
- 安全边界模糊。

对外销售模块优先使用“独立应用 + Embedded Mode”，而不是依赖宿主运行时的微前端。

---

## 6. 接入模式决策规则

| 条件 | 深链接 | iframe | API/事件 | 原生模块 |
| --- | :---: | :---: | :---: | :---: |
| 无法修改供应商系统 | 首选 | 通常不可用 | 视接口而定 | 不适用 |
| 支持 OIDC/SAML | 适合 | 基础条件 | 不充分 | 不充分 |
| 支持 CSP/嵌入配置 | 不要求 | 必须 | 不要求 | 不要求 |
| 高敏或受控系统 | 首选 | 谨慎 | 最小字段 | 不建议复制业务终态 |
| 需要统一待办 | 可作为详情入口 | 可选 | 首选 | 工作台聚合层可用 |
| 计划独立出售 | 支持 | 推荐 Embedded Mode | 必须 | 不应作为唯一形态 |
| 需要大量跨页面交互 | 一般 | 适合专用页面 | 适合数据交互 | 仅核心工作台能力 |

### 6.1 当前系统建议

| 系统 | 首期方式 | 后续方式 | 说明 |
| --- | --- | --- | --- |
| 新人新事 | API 同步 + 管理深链接 | 指定页面内嵌可评估 | 人员数据真源，不复制完整 HR 功能 |
| 泛微 OA | SSO 深链接 | 待办/表单 iframe + API/事件 | 泛微承担正式流程与审批终态 |
| 自研 CRM | Keycloak SSO + iframe Pilot | API/事件 + Embedded Mode | 最适合作为首个融合验证系统 |
| CTMS/eTMF/IWRS | SSO 深链接 | 指定页面内嵌与只读 API | MVP 1 不处理受控记录和生产写回 |
| EDC | SSO 深链接 | 后续按验证范围接入 | 不建议首期整站内嵌 |
| 用友 | SSO 深链接 | 报表/单据定向接入 | 取决于具体版本与厂商能力 |
| QMS/LMS | 深链接 | 待办、培训任务和文档接入 | 接口与供应商待核验 |
| PV/安全数据库 | 独立打开 | 最小必要 API | 默认不把病例原文带入工作台 |

---

## 7. 统一身份与 SSO 规范

### 7.1 身份权威

- Keycloak 是认证身份、Token、Session、MFA 和外部身份绑定的权威系统；
- 新人新事是员工号和在职状态的权威源；
- 部门/岗位只能选择一个主源，核验前不得同时双向覆盖；
- Youlin 与业务模块以 Keycloak `sub` 引用认证身份；
- 企业人员稳定关联键使用 `legalEntityCode + employeeId`；
- 企业微信 `userid/open_userid/unionid` 只作为外部身份标识。

### 7.2 协议优先级

1. 新系统必须使用 OIDC Authorization Code Flow；
2. Web/Desktop 公共客户端必须使用 PKCE；
3. 仅支持 SAML 的现有系统由 Keycloak 进行协议代理；
4. 不支持 OIDC/SAML 的遗留系统可评估认证代理，但必须记录风险和退出计划；
5. 禁止新建基于共享 Cookie、URL Token 或固定账号的 SSO。

### 7.3 Keycloak Client 基线

每个独立系统必须使用独立 Client，并配置：

- 唯一 `client_id`；
- 精确 Redirect URI，不使用生产通配符；
- 精确 Web Origin；
- 最小 Scope；
- 短生命周期 Access Token；
- Refresh Token 轮换和撤销策略；
- 前后端 Client 分离；
- Secret 存入 Secret Manager；
- Dev/Test/UAT/Prod 环境隔离；
- 管理员、普通用户和服务账号分离。

### 7.4 Claims 基线

建议最小 Claims：

```json
{
  "sub": "keycloak-stable-subject",
  "employee_id": "E12345",
  "legal_entity": "YOU-LIN-SH",
  "department_id": "D001",
  "employment_status": "active",
  "groups": ["clinical-ops"]
}
```

要求：

- Token 不携带手机号、证件号等非必要字段；
- 不把大规模项目权限列表放入 Token；
- Token 中的部门与组是认证时快照，业务系统仍需执行服务端授权；
- Claim 变更必须版本化并提供兼容窗口。

### 7.5 企业微信接入

企业微信通过以下方式之一接入 Keycloak：

- 独立企业微信 OAuth/OIDC Adapter；
- 经安全评估的 Keycloak Identity Provider SPI。

要求：

- 不修改 Keycloak 核心源码；
- 企业微信 Secret 仅保存在服务端；
- 绑定必须匹配稳定员工号或进入人工冲突队列；
- 禁止仅按姓名、邮箱或手机号自动合并；
- 记录绑定、解绑、冲突和管理员处理审计；
- 企业微信不可用时保留标准 Keycloak OIDC 登录降级路径。

### 7.6 入转调离

```text
新人新事 API
  → 身份同步服务
  → Keycloak Admin API
  → Youlin/模块组织与权限投影
  → Session 撤销与审计回执
```

Keycloak 不应被假设原生提供完整 SCIM。若使用第三方 SCIM 扩展，必须单独评估维护、安全和升级兼容性。

---

## 8. iframe 内嵌规范

### 8.1 域名规划

推荐统一在企业主域下：

```text
hub.unionclin.com
crm.apps.unionclin.com
oa.apps.unionclin.com
ctms.apps.unionclin.com
```

同一主域可以降低部分浏览器 Cookie 和信任配置复杂度，但不同子域仍然是不同 Origin，必须执行 CORS、CSP 和消息来源校验。

### 8.2 被嵌系统要求

被嵌系统必须：

- 全站 HTTPS；
- 支持 Keycloak SSO；
- 提供专用 `/embed/*` 页面；
- Embedded Mode 隐藏重复顶部导航，不删除业务安全控制；
- 配置精确 CSP，例如：

```http
Content-Security-Policy: frame-ancestors https://hub.unionclin.com
```

- 不返回冲突的 `X-Frame-Options: DENY` 或 `SAMEORIGIN`；
- Cookie 使用 `Secure`、`HttpOnly` 和经过验证的 `SameSite` 设置；
- 提供加载中、无权限、Session 过期和系统不可用页面；
- 支持“在独立窗口打开”；
- 通过浏览器兼容性和第三方 Cookie 限制测试。

不得使用已废弃且兼容性不足的 `X-Frame-Options: ALLOW-FROM` 作为主要控制。

### 8.3 工作台应用容器要求

应用容器必须：

- 从 Module Registry 解析 URL，不接受用户输入任意 iframe 地址；
- 对模块、用户、部门和权限进行服务端校验；
- 限制 iframe `allow` 能力；
- 根据模块风险配置 `sandbox`；
- 校验所有 `postMessage` 的 `origin`、模块 ID 和消息版本；
- 展示来源系统、模块版本和独立打开入口；
- 模块异常时不影响工作台其他区域；
- 记录模块打开、失败、退出和敏感动作审计。

### 8.4 页面通信协议

统一消息信封：

```json
{
  "specVersion": "1.0",
  "type": "youlin.module.resize",
  "moduleId": "youlin-crm",
  "requestId": "uuid",
  "timestamp": "2026-08-06T08:00:00Z",
  "payload": {
    "height": 960
  }
}
```

允许的基础事件：

- `youlin.module.ready`；
- `youlin.module.resize`；
- `youlin.module.titleChanged`；
- `youlin.module.navigate`；
- `youlin.module.openExternal`；
- `youlin.module.dirtyStateChanged`；
- `youlin.host.themeChanged`；
- `youlin.host.localeChanged`；
- `youlin.host.sessionExpiring`。

禁止通过消息传递：

- Access/Refresh Token；
- 密码、Secret；
- 未脱敏业务原文；
- 无 Schema 的任意命令；
- 绕过模块后端授权的操作结果。

### 8.5 一次性启动码

如果模块必须取得工作台启动上下文，使用一次性 Launch Code：

```text
Browser → Youlin Backend: 请求打开模块
Youlin Backend → Launch Service: 创建一次性短时码
Browser → Module: 只携带 launch_code
Module Backend → Launch Service: 交换并立即作废
Module Backend: 再次执行用户、模块、权限和资源校验
```

要求：

- 有效期建议不超过 60 秒；
- 只能使用一次；
- 绑定用户、模块、目标路径和客户端；
- 不包含长期 Token；
- 交换和失败均记录审计。

---

## 9. 反向代理规范

只有在目标系统明确支持基础路径、代理头和回调配置时，才允许使用：

```text
https://hub.unionclin.com/apps/<module>/
```

上线前必须验证：

- 静态资源基础路径；
- 前端路由与刷新；
- OAuth/SAML 回调；
- WebSocket/SSE；
- 文件上传下载；
- Cookie Path/Domain；
- 绝对 URL 和重定向；
- CSP、CORS、CSRF；
- 超时、重试和大文件限制；
- 客户端 IP 与审计头的可信代理链。

反向代理不得用于绕过目标系统原有授权或厂商部署限制。

---

## 10. Module Registry 规范

### 10.1 模块清单

每个模块必须提交版本化 Manifest：

```json
{
  "schemaVersion": "1.0",
  "id": "youlin-project-workbench",
  "name": "项目管理工作台",
  "version": "1.0.0",
  "owner": "project-platform-team",
  "launchMode": ["standalone", "embedded"],
  "standaloneUrl": "https://pm.unionclin.com",
  "embeddedUrl": "https://pm.unionclin.com/embed",
  "identity": {
    "protocol": "oidc",
    "issuer": "https://id.unionclin.com/realms/youlin",
    "clientId": "youlin-project-workbench"
  },
  "requiredPermissions": ["project.read"],
  "allowedHostOrigins": ["https://hub.unionclin.com"],
  "healthUrl": "https://pm.unionclin.com/health",
  "apiSpecUrl": "https://pm.unionclin.com/openapi.json",
  "dataClassification": "internal",
  "supportContact": "project-platform-team@unionclin.com"
}
```

### 10.2 必填治理字段

- 模块 ID、名称、语义版本和 Owner；
- Standalone/Embedded 入口；
- Keycloak Client 与允许 Origin；
- 所需平台权限和数据等级；
- API、事件和 UI 协议版本；
- 健康检查与依赖；
- 适用部门、企业、环境和发布状态；
- 数据 Owner、安全 Owner 和支持联系人；
- 上线、停用、回滚和数据导出方式。

### 10.3 生命周期

```text
draft → testing → reviewing → published → suspended → deprecated → retired
```

生产工作台只加载 `published` 模块。暂停或退役不得删除历史审计和业务记录。

---

## 11. 新系统双模式建设规范

### 11.1 必须同时支持

```text
Standalone Mode
独立域名、导航、登录、部署、运维，可独立销售

Embedded Mode
专用嵌入路由，隐藏重复外壳，由工作台提供门户和导航
```

示例：

```text
https://pm.unionclin.com/             # 独立模式
https://pm.unionclin.com/embed/tasks  # 内嵌模式
```

### 11.2 独立性要求

新模块必须拥有：

- 独立构建和发布流水线；
- 独立容器镜像与部署包；
- 独立 Keycloak Client；
- 独立配置和 Secret；
- 独立数据库或明确隔离的 Schema；
- 独立迁移、备份和恢复；
- 独立健康检查、日志、指标和 Trace；
- 独立版本、升级、回滚和支持周期；
- 独立数据导入导出能力；
- 工作台不可用时的独立访问入口。

模块不得要求直接访问 Youlin 数据库才能完成自身核心业务。

### 11.3 推荐技术栈

企业自研模块默认采用：

| 层级 | 推荐技术 |
| --- | --- |
| 前端 | React、Next.js、TypeScript、Ant Design/Lobe UI |
| 后端 | Node.js、TypeScript、Hono/tRPC；外部接口使用 REST/OpenAPI |
| 数据 | PostgreSQL、Drizzle ORM |
| 缓存/任务 | Redis 与受控异步任务平台 |
| 文件 | S3 兼容对象存储 |
| 身份 | Keycloak OIDC |
| 可观测 | OpenTelemetry、结构化日志、统一 Trace ID |
| 部署 | Docker、Helm/Kubernetes 或受控容器平台 |

第三方模块可以使用其他技术栈，但必须遵守身份、API、事件、安全、审计和部署契约。

规模可控时优先采用模块化单体，不为“技术先进”过早拆分大量微服务。

### 11.4 UI 规范

- Standalone 与 Embedded 复用业务组件，不复制两套业务逻辑；
- Embedded Mode 不显示重复主导航、品牌页脚和账号菜单；
- 必须支持工作台主题、语言和尺寸变化；
- 必须有空状态、无权限、失败、超时和 Session 过期状态；
- 关键动作必须展示目标系统、影响对象和最终结果；
- 不得让工作台样式直接覆盖模块内部 DOM；
- 无障碍、浏览器支持和响应式范围必须写入产品验收标准。

---

## 12. API 集成规范

### 12.1 基础要求

- 外部 API 使用 HTTPS 和版本化路径，例如 `/api/v1/...`；
- 使用 OpenAPI 3.x 描述并纳入契约测试；
- 服务身份优先使用 OAuth2 Client Credentials 或工作负载身份；
- 代表用户执行时同时记录用户身份与服务身份；
- 写请求支持 `Idempotency-Key`；
- 并发更新支持版本号或 ETag；
- 返回统一错误结构；
- 分页、过滤、排序和时间格式统一；
- 所有请求携带或生成 Trace ID；
- API 不泄漏供应商私有表结构。

### 12.2 建议请求头

```http
Authorization: Bearer <access-token>
X-Request-Id: <uuid>
X-Trace-Id: <trace-id>
Idempotency-Key: <uuid>
X-Youlin-Module-Id: <module-id>
```

### 12.3 统一错误格式

```json
{
  "code": "RESOURCE_FORBIDDEN",
  "message": "当前用户无权访问该资源",
  "requestId": "uuid",
  "retryable": false,
  "details": []
}
```

禁止把堆栈、数据库语句、内部地址或敏感字段返回浏览器。

### 12.4 数据一致性

- 源业务系统继续保存权威业务事实；
- 工作台聚合数据必须携带来源、源 ID、源版本和取得时间；
- 跨系统长事务使用 Saga、补偿或对账，不使用跨库事务；
- 写回必须返回源系统回执；
- 缓存必须声明时效，不把缓存状态展示为实时终态。

### 12.5 数据产品和外部 API

面向数据消费的 API 必须绑定已发布 Data Product 和 Data Contract，不得将 Bronze/Silver、底层表或任意 SQL 直接包装为外部接口。

```text
内部调用：Keycloak Client → Internal Gateway → Policy → Data Service → Gold Data Product
外部调用：External Client + mTLS/IP → External Gateway/DMZ → Policy → Data Service → 批准的数据产品
```

内部与外部 API 使用不同域名、网络区、Client、配额和审计策略。外部接口还需绑定接收主体、合同、目的、字段、地域、有效期、保留和删除要求。当前不出境边界下，境外访问默认拒绝。

Youlin 负责目录、订阅、申请、审批、发布状态和运营展示，不向模块提供 Trino、数据库、OSS 或消息系统的直接凭证。详细规范见[湖仓与 API 治理蓝图](./10-lakehouse-data-platform-and-api-governance.md)。

---

## 13. 事件集成规范

### 13.1 事件格式

推荐采用 CloudEvents 1.0 结构：

```json
{
  "specversion": "1.0",
  "id": "uuid",
  "source": "youlin.crm",
  "type": "com.unionclin.crm.opportunity.updated.v1",
  "subject": "opportunity/OPP-001",
  "time": "2026-08-06T08:00:00Z",
  "datacontenttype": "application/json",
  "data": {
    "opportunityId": "OPP-001",
    "version": 12
  }
}
```

### 13.2 事件要求

- 事件名称和 Schema 版本化；
- 事件不可依赖消费者执行顺序；
- 消费者必须幂等；
- 提供重试、死信、回放和对账；
- 事件只携带最小字段，敏感详情由授权 API 获取；
- 记录生产者、消费者、处理状态和 Trace ID；
- 删除或改变语义必须升主版本。

建议基础事件：

```text
employee.activated
employee.transferred
employee.deactivated
task.assigned
task.completed
approval.completed
document.published
project.updated
module.published
module.suspended
```

事件名称和 Schema 必须在发布前通过 Schema Registry 校验；事件一旦发布不得直接复用为其他语义。

---

## 14. 权限规范

### 14.1 三层授权

```text
Keycloak：认证、基础 Realm/Client Role
Youlin：Workspace、部门、模块与平台资源权限
业务模块：业务对象、项目、Study、记录和字段权限
```

### 14.2 强制要求

- 每次服务端请求重新验证用户和资源范围；
- 模块不能因为来自工作台 iframe 就默认信任；
- 高风险操作不得仅依赖 Keycloak Role；
- 服务账号和用户代理调用必须区分；
- 项目/Study 权限不能用前端参数自行声明；
- 离职、禁用和高风险撤权必须撤销 Keycloak Session 并同步模块；
- 建立跨部门、跨 Workspace、跨项目和水平越权负向测试。

### 14.3 Project Context 与 Agent 权限

Project 是经营/交付与矩阵权限单元，业务模块必须传递稳定 `projectId` 并由服务端验证 Membership、角色、数据 Facet、Purpose 和有效期。PM/管理层的项目共享上下文权限不得隐式包含成员个人项目记忆。

```text
Agent Effective Permission
= User ∩ Agent Manifest ∩ Project Membership/Scope
∩ Resource/Data ∩ Tool ∩ Purpose ∩ Environment/Time
```

模块向 Agent 暴露上下文时必须通过 Context Provider，返回来源、版本、分类、Audience、Policy Decision 和 expiry；不允许使用共享服务账号绕过用户权限。

---

## 15. 数据与文件规范

### 15.1 数据边界

- 当前所有企业数据不出境、不越出批准处理边界；
- MVP 1 不处理受试者、人遗和 GxP/Part 11 受控记录；
- 模块接入前必须标记数据分类、用途、Owner、保留期和允许流向；
- 外部模型调用必须经过企业 Model Gateway 和字段白名单；
- Prompt、日志、Trace 和错误信息同样受数据分类约束。

### 15.2 数据所有权

- 模块只拥有自身业务数据；
- 跨模块引用使用稳定企业 ID 和源系统 ID；
- 工作台不复制不必要的完整业务表；
- 我的任务中心只保存任务投影和目标链接，泛微/业务模块继续保存正式待办与终态；
- 分析副本、搜索索引和向量库不得成为业务终态真源；
- 数据修正回到源系统完成，并通过事件或同步刷新投影。

### 15.3 文件

- 大文件通过对象存储预签名 URL 或受控流式接口传输；
- 文件必须执行类型、大小、恶意内容和权限检查；
- 文件引用必须包含企业资源 ID、版本、Hash、来源和密级；
- 下载前重新鉴权，不因用户拿到历史 URL 而永久可访问；
- 模块间不复制文件时，使用受控资源引用和短时访问凭证。

### 15.4 企业资源中心统一接入

所有新模块和现有系统集成在需要保存文件时，应该优先接入 Youlin Resource API，而不是各自新建不可治理的附件桶：

- 指定资源范围：`personal / team / enterprise / project`；
- 原件、不可变版本、预览衍生物、记忆附件/快照和 AI/Workflow 产出物保存到企业 OSS；
- PostgreSQL 保存资源元数据、目录、权限、分享、版本、保留和对象映射；
- 模块保存企业资源 ID 和确定版本 ID，不保存可长期访问的 OSS URL；
- 资源分享使用 ShareGrant，不把预签名 URL 当作分享链接；
- 模块删除业务记录前必须声明关联资源是级联回收、解除引用还是保留归档；
- Agent/Workflow 产出物必须携带 Run ID、模型/流程版本、来源资源和审批状态；
- 个人记忆正文快照和附件进入 OSS `memory` 区，索引按用户严格隔离；
- 普通资源只有经过知识发布流程后才能进入 RAG，不得因上传自动成为企业知识。

独立销售模块可以使用自己的对象存储实现，但必须实现相同的 Resource Provider 契约，并在嵌入 Youlin 时提供资源 ID、版本、权限、短时访问和审计映射。

### 15.5 记忆与上下文统一接入

- 个人通用/项目私有记忆只能由本人授权给 Agent，模块不能直接读取记忆表；
- 项目共享记忆通过 Promotion/发布接口写入，不把个人备注自动当项目资产；
- 项目事实、共享记忆和企业关系通过 Context Provider 组装，不由各模块复制大段上下文；
- 多人会话和共享产出物必须声明 Audience，并按权限交集或分段授权；
- 成员退出/项目关闭事件触发模块缓存、索引、引用和令牌失效；
- 搜索、图关系、计数和自动补全不得泄漏无权项目。

详细规范见[记忆与上下文治理蓝图](./11-context-memory-and-agent-authorization-governance.md)。

---

## 16. 安全规范

### 16.1 Web 安全

必须覆盖：

- OIDC `state`、`nonce`、PKCE 和签名校验；
- CSRF、XSS、SSRF、点击劫持和开放重定向防护；
- 精确 CORS/CSP；
- Cookie `Secure`、`HttpOnly`、`SameSite`；
- 文件上传和解析沙箱；
- API 限流、超时和请求大小限制；
- 依赖、镜像和制品扫描；
- Secret 轮换和最小权限。

### 16.2 iframe 特有风险

必须测试：

- 点击劫持；
- 父子窗口消息伪造；
- 恶意跳转和弹窗；
- 浏览器第三方 Cookie 限制；
- Session 过期循环；
- iframe 内文件下载、摄像头、麦克风和剪贴板权限；
- 被嵌系统逃逸到未授权页面；
- 工作台与模块的登出一致性。

### 16.3 供应商系统

供应商系统不能满足安全基线时：

1. 降级为 SSO 深链接；
2. 限制为只读 API；
3. 通过隔离代理补强；
4. 暂缓接入。

不得为了“统一界面”接受不可控制的高风险内嵌。

---

## 17. 审计与可观测规范

### 17.1 审计最小字段

```text
actorUserId
actorKeycloakSub
serviceIdentity
moduleId
sourceSystem
operation
resourceType/resourceId
result
reason
requestId/traceId
sourceIp/device
occurredAt
sourceVersion
```

必须审计：

- 登录、绑定、解绑、失败和登出；
- 模块打开、权限拒绝和异常；
- 敏感数据查询和导出；
- Tool/API 写操作和回执；
- 配置、权限和模块发布变更；
- 管理员代理和紧急账号操作。

### 17.2 可观测

每个模块必须提供：

- `/health` 存活检查；
- `/ready` 就绪检查；
- 结构化日志；
- 请求、错误、延迟和依赖指标；
- OpenTelemetry Trace；
- 模块版本和构建信息；
- 不包含敏感原文的诊断信息。

工作台必须能识别“模块不可用”与“用户无权限”，禁止统一显示为未知错误。

---

## 18. 部署、版本与升级规范

### 18.1 环境隔离

至少设置：

```text
Dev → Test → UAT → Pilot/Prod
```

各环境必须隔离：

- Keycloak Realm 或 Client 配置；
- 数据库和对象存储；
- Secret；
- 域名与回调；
- 日志与审计；
- 外部系统测试账号。

### 18.2 版本

- 模块、API、事件、Manifest 和数据库 Schema 独立版本化；
- 使用语义版本；
- 生产工作台解析到确定模块版本；
- 破坏性变更提供迁移和兼容期；
- 支持上一稳定版本回滚；
- 数据迁移必须可验证，必要时前向修复而不是直接回滚数据库。

### 18.3 发布门禁

发布前必须通过：

- OIDC/企业微信登录回归；
- Session 过期、撤销与离职回收；
- 权限负向测试；
- iframe/CSP/Cookie/浏览器兼容测试；
- API 和事件契约测试；
- Secret、依赖、镜像和制品扫描；
- 备份恢复和回滚验证；
- 审计与 Trace 完整性检查。

---

## 19. 独立销售与产品化规范

### 19.1 产品边界

可独立销售模块必须：

- 不依赖 Youlin 前端才能完成核心业务；
- 提供独立登录页和 Keycloak/OIDC 配置能力；
- 支持客户自有 IdP；
- 支持独立品牌、域名和通知配置；
- 支持独立部署、升级、备份、恢复和监控；
- 支持客户数据导入、导出和迁移；
- 提供明确的管理员、审计员和普通用户角色；
- 将企业定制放入配置、Adapter 或扩展点，不进入通用核心硬编码。

### 19.2 多租户与单租户

模块至少明确支持模式：

- 客户独立实例；
- 单实例多租户；
- 企业内部单租户。

如果尚未完成严格租户隔离验证，默认采用客户独立实例，不得仅凭表中存在 `tenantId` 宣称支持多租户。

### 19.3 商业能力

模块应具备：

- Edition/Feature Flag；
- Entitlement/套餐控制；
- 用户数、容量和调用量计量；
- 到期、宽限和停用策略；
- 不影响客户数据导出的停用机制；
- 支持与实施责任边界；
- 版本支持周期和升级策略。

商业控制必须在服务端执行，不能只隐藏前端菜单。

---

## 20. 现有系统接入流程

### 阶段 A：发现

收集：

- 系统 Owner、供应商、版本和部署位置；
- OIDC/SAML/自定义认证能力；
- CSP、iframe、Cookie、回调和反向代理能力；
- API、Webhook、消息和导出能力；
- 数据分类、GxP、审计和合同约束；
- 目标用户、页面、待办和业务对象。

### 阶段 B：定级

输出：

- 接入模式：深链接/iframe/API/原生；
- 身份模式：OIDC/SAML/代理/暂不接入；
- 数据流和权威源；
- 风险级别；
- 降级入口；
- Owner 与排期。

### 阶段 C：技术验证

至少验证：

1. Keycloak 登录；
2. 唯一账号映射；
3. iframe 或深链接；
4. Session 过期与单点退出；
5. 权限拒绝；
6. 浏览器兼容；
7. API/事件；
8. 审计与 Trace；
9. 故障降级；
10. 离职回收。

### 阶段 D：发布

必须具备：

- Module Manifest；
- 安全评审；
- 契约测试；
- 运维 Runbook；
- 回滚方案；
- 数据 Owner 和支持 Owner；
- UAT 与上线批准。

---

## 21. 新模块建设流程

```text
产品边界确认
→ Standalone/Embedded 信息架构
→ Keycloak Client 与权限模型
→ API/事件/Manifest 契约
→ 独立数据与部署设计
→ 安全和数据分类
→ 开发与契约测试
→ 工作台集成测试
→ 独立部署验收
→ 发布与运营
```

架构评审必须同时回答：

1. 工作台不可用时，模块能否独立运行；
2. 模块独立出售时，需要替换哪些企业 Adapter；
3. 模块如何接入客户自有 IdP；
4. 模块是否直接依赖 Youlin 数据库或内部源码；
5. 数据如何导出、迁移和删除；
6. Embedded Mode 是否只是显示变化，而不是安全能力降级。

---

## 22. 验收清单

### 22.1 身份

- [ ] Keycloak Client 独立且环境隔离；
- [ ] OIDC Authorization Code + PKCE 验证通过；
- [ ] 企业微信账号映射不依赖姓名；
- [ ] 离职/禁用可撤销 Session；
- [ ] 紧急账号启用 MFA 并独立审计；
- [ ] Token 不包含非必要个人信息。

### 22.2 内嵌

- [ ] CSP `frame-ancestors` 精确配置；
- [ ] 无冲突 `X-Frame-Options`；
- [ ] Cookie 在目标浏览器可用；
- [ ] `postMessage` 校验 Origin 和 Schema；
- [ ] 不传递长期 Token 或 Secret；
- [ ] 有独立打开和故障降级入口；
- [ ] Session 过期不会产生无限重定向。

### 22.3 API/数据

- [ ] OpenAPI 和版本策略明确；
- [ ] 文件通过 Resource API 或兼容 Provider 保存，未持久化长期 OSS URL；
- [ ] 原件、版本、预览、个人记忆附件和产出物具备 OSS 对象与元数据映射；
- [ ] 服务端授权和越权测试通过；
- [ ] 写操作支持幂等与回执；
- [ ] 权威源、缓存时效和数据 Owner 明确；
- [ ] 无跨系统生产数据库直连；
- [ ] 数据流满足不出境、不越界要求；
- [ ] Project/Membership、Purpose、Audience 和 Context Facet 由服务端验证；
- [ ] 个人项目记忆不会被 PM/管理层、其他成员或跨项目 Agent 读取；
- [ ] 离项后的引用、搜索、向量、节点/边、计数和缓存失效通过。

### 22.4 产品化

- [ ] Standalone Mode 可独立运行；
- [ ] Embedded Mode 可由工作台加载；
- [ ] 独立部署、数据库、配置和备份；
- [ ] 支持客户 IdP 配置；
- [ ] 版本、升级和回滚可验证；
- [ ] 客户数据可导出和迁移；
- [ ] 套餐和 Feature Flag 在服务端执行。

### 22.5 运维

- [ ] 模块任务可投影到我的任务且源系统仍保存正式状态；
- [ ] 通知具备稳定事件 ID、去重、订阅和敏感内容控制；
- [ ] 需要平台评审的对象已接入统一评审中心和职责分离；
- [ ] 用户反馈和报障可携带 Trace ID 并闭环；
- [ ] Feature Flag/Entitlement 在服务端执行；
- [ ] Health/Ready、日志、指标、Trace 可用；
- [ ] 模块 Owner、安全 Owner、数据 Owner 明确；
- [ ] 故障、降级、回滚和恢复 Runbook 完成；
- [ ] 依赖、镜像和制品扫描通过；
- [ ] 告警与支持渠道已配置。

---

## 23. 首批实施建议

1. 完成 Keycloak Dev/Test 私有部署；
2. 完成新人新事同步服务和企业微信身份适配器 Spike；
3. 建设 Module Registry、应用中心和统一应用容器；
4. 选择自研 CRM 验证 OIDC、iframe、Launch Code、权限和审计；
5. 选择泛微一个待办或表单页面验证 SSO 深链接与定向内嵌；
6. 医渡定制系统和用友先采用 SSO 深链接，逐个核验供应商能力；
7. 建设统一 API/事件契约测试模板；
8. 以员工工作指引为导航建设“有临员工工作助手”，收集当前有效制度、非 GxP SOP/WI、OA 通知和系统指引，所有业务入口通过受控深链接打开；
9. 盘点企业微信现有“了解有临”机器人，统一知识来源、历史问题评测集和内容 Owner，避免双口径；
10. 选择一个低敏数据源建设 Bronze/Silver/Gold、Data Product 和内部只读 API，验证 Keycloak Client、Scope、配额、行列权限、脱敏和审计；
11. 冻结 Internal/External Gateway、Data Service 和湖仓的网络与凭证边界，外部生产数据开放后置；
12. 冻结 Project/Membership、个人/项目共享记忆、Context Facet、Purpose/Audience 和离项回收；
13. 建设 Context Provider Spike，验证跨项目隔离、PM/管理层视图、多人输出和 Agent 权限交集；
14. 建设全局搜索、任务/通知、统一评审和反馈契约，明确泛微正式待办终态边界；
15. 所有新模块从第一天提供 Standalone/Embedded 双模式；
16. MVP 1 不将 EDC、PV、受试者、人遗或 GxP 受控记录带入工作台；
17. Pilot 后再决定哪些系统从深链接升级为 iframe 或 API 深度融合。

---

## 24. 架构决策摘要

| 决策 | 结论 |
| --- | --- |
| 企业统一 IdP | Keycloak 私有部署 |
| HR 人员真源 | 新人新事 |
| 企业微信 | Keycloak 身份适配入口，不单独建立企业账号体系 |
| LobeHub 登录 | Generic OIDC，仅对接 Keycloak |
| 现有系统默认接入 | SSO 深链接优先，iframe 按条件开放 |
| 新系统形态 | Standalone + Embedded 双模式 |
| 模块融合 | Module Registry + 应用容器 + API/事件 |
| 微前端 | 非默认，仅限企业完全控制且确有必要的场景 |
| 系统数据集成 | API/事件，不直连生产数据库 |
| 工作台与湖仓 | 工作台是控制面，不是存储/计算引擎 |
| 数据服务 | Gold Data Product + Data Service + API Gateway，不直接暴露底层表 |
| 外部 API | 独立 Gateway/DMZ 和逐产品审批，不因内部能力完成而自动开放 |
| Project | 经营/交付和矩阵权限单元，不等同 Department/Workspace/Study |
| 记忆与上下文 | 个人私有、项目共享、运行时上下文分层，Context Provider 统一装配 |
| Agent 权限 | 用户、Agent、Project、资源/数据、Tool、Purpose 和时间策略取交集 |
| 任务与通知 | 工作台聚合投影和通知，源系统保留正式任务/审批终态 |
| 完整产品路线 | MVP 闭环后按 Employee、Project、Clinical、Knowledge、AI、Data、Integration、Trust 演进 |
| 数据边界 | 不出境、不越出批准处理边界 |
| GxP 范围 | MVP 1 排除，后续逐场景验证 |

本规范作为现有系统接入、新模块立项、架构评审、供应商技术评估和上线验收的共同依据。偏离 MUST 条款必须经过安全与架构负责人书面批准；偏离 SHOULD 条款必须记录 ADR、风险、补偿控制和退出计划。
