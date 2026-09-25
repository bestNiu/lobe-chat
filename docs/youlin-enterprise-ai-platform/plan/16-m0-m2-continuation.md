# M0～M2 续建：可复用工程部署与正式身份读取

## 本轮推进

### M0

将既有用户确认补入[决策表](11-m0-m2-confirmed-decisions.md)：本机按余量逐服务限额、员工号唯一不复用、测试期不开MFA、人工核实清单开户/停用可先行、首位管理员私有配置、单后端Key、默认模型、每月20美元初始额度和邮件配置已私有保存。不是新增生产批准，也没有把未验证投递、未创建用户写成完成。

### M1

新增 `scripts/youlin/deployment/`，把私有试验转为仓库可复用的离线构建、镜像打包和合成启动工具：

- 桌面/手机/Auth/Workbench/Share及Next standalone六阶段通过；非root、只读、禁网、逐阶段限额和私有日志。
- 生成本地内容寻址候选镜像，内含应用、静态资源和打包后的迁移入口；没有使用真实凭据或发布到Registry。
- 新隔离PostgreSQL/Redis Compose：163条迁移、迁移重放、镜像journal数量断言；登录HTML200及12个同源JS/CSS资源通过。
- `pg_dump`/`pg_restore`恢复163条迁移记录和一个合成用户哨兵；不是业务数据恢复、升级回退或RPO/RTO签收。
- 保留两次运行失败：复制pnpm symlink时转换成宿主绝对路径导致找不到pg；ParadeDB默认模板导致恢复schema冲突。分别保留负向回归/失败日志，修复为保留相对link及template0恢复后通过。
- 每次定向清理自己的容器/网络/卷，无常驻员工实例；本地候选镜像和私有原始构建目录保留。

仍缺：整体输入冻结和冷依赖构建、全仓质量门/真实GitHub CI、HTTPS、对象存储、实际邮件、业务恢复/回退、正式部署与浏览器UAT。**当前打包使用当前工作区迁移，必须同一静止源码，不能跨提交混搭旧产物。**

### M2

- 新正式表 `YoulinIdentityAuthorityReader`：每次新主库只读事务，读取用户/绑定/人员/有效任职/撤权证明，遇到未知/缺失状态拒绝；不再只验证实验表投影。
- 要求有界node-postgres池，拒绝借用client/事务；按数据库时钟判断临时ban过期，同时保留独立的主体deny；固定search_path，补临时表遮蔽攻击负向用例（先失败再修复）。直到事务收尾才释放并发槽。
- 新默认关闭凭据桥接：验证后的issuer/sub → 正式投影 → 停用、时间屏障、现有服务端Session身份与epoch检查。超时/错误拒绝，成功仅 `continue_authorization`。
- **未挂真实登录、Better Auth Session、Chat、worker或PEP；未创建首位管理员，未实现激活/员工号UI/公开注册关闭/真实IdP清理。** 不能拿内核测试当作停用旧产品会话已经生效。

## 工程验证口径

- 身份两片47＋39＝86项：78真实PostgreSQL＋8 DTO，12文件；包含旧75项，不累加重跑。
- Server四文件80项：本轮桥接11＋既有认证器9＋撤权24＋预算36。
- 部署工具11项；真实隔离Keycloak协议14项。定向Lint、身份及服务端身份入口类型闭包通过，不是全仓类型通过。
- 独立初审发现临时ban过期语义及无效凭据误报两项P2，已补先失败后通过的回归并修复。一次独立复核确认两项解决，无新增问题；最终回归和冻结归档见[本轮证据](evidence/m0-m2-continuation/r1/README.md)。父Spec与6个工程切片仍未标完整交付。
- 这是工具及未接线内核增量，没有产品UAT或公共Acceptance发布；未上传真实配置、企业数据或凭据。

## 仍需人工输入的接入门

1. 内网正式访问地址和HTTPS/证书方式，才能确定可信origin、IdP issuer/回调和员工访问入口。
2. 在仓库外私有配置中轮换已在聊天出现的SMTP及网关凭据；现有保存不等于已轮换。本轮未发送邮件或生成请求。
3. 首位管理员初始密码通过本机私有bootstrap/密钥输入，不在聊天或Git中传递；开户、激活及Session/PEP仍需实现后才可接真实账号。
4. 可信模型价格仍阻塞真实美元计费，不阻塞M1/M2工程继续开发；完整HR、MFA、容量/预算及保留政策按对应正式上线门确认。

## 后续增量：身份接线、本机实例升级与首管理员引导（未验收）

- 认证接线：Better Auth 企业插件（Keycloak-only allowlist、禁注册/邮箱密码/account linking/身份变更/cookie 缓存）、逐请求 Session proof 强制、`auth.api.getSession` 与 HTTP `/get-session` 双重覆盖，Chat/TRPC/OpenAPI 拒绝替代认证。默认关闭，未开启时不改变上游行为。
- 手工准入与开通：永久员工号、pending→active→disabled、精确 principal/native account 绑定、企业级不可变 start/completion single-flight（未完成的 start 永不自动接管或重复外部副作用）、IdP 清理需先停用并核验会话与 offline grant 后才出证明。
- 首管理员引导：仅空库、显式 local-test 配置下创建 bootstrap/cleanup 两个服务与精确 grant；首位人类管理员授权后同事务退休 bootstrap 服务。私有 CLI/仪式容器执行，密码不进 argv、不打印。
- 独立初审的 2 项 P1（补偿顺序、并发重放）与 3 项 P2（孤儿原生会话、停用清理未证明、README 与实现矛盾）均已修复，并补先失败后通过的回归；容器内真实 PostgreSQL 两片与 server/app 定向套件、定向类型与定向 Lint 通过（非全仓）。
- 本机实例已升级到本轮镜像、重放 165 个迁移并确认、完成引导仪式、进入 `login-test`；HTTP 侧已观测注册关闭与 OIDC 跳转。**仍无人类登录、无隔离/停用 UAT、无管理员 UI、网关 Key 为空**，因此不得声称员工可用或 M1/M2 交付完成。

## 本轮：首次真实 SSO 登录打通与三项缺陷修复

承接上一节"身份接线、本机实例升级与首管理员引导"，本轮把 login-test 实例从"能打开登录页"推进到"真实登录成功"，并修掉三个各自独立的缺陷。

**登录阻塞根因**：IdP 认证与 code 交换均成功，失败在 `getUserInfo` 的企业准入门。加入固定分类日志后一次复现即得 `reason=INVALID_CREDENTIAL detail=ERR_JWT_CLAIM_VALIDATION_FAILED`，一次性无凭据诊断进一步给出 `claim=sub reason=missing`。Keycloak 26 用 `basic` 客户端作用域的 `oidc-sub-mapper` 发 `sub`；`localIdentityRealm.mjs` 显式写 `defaultClientScopes=['basic','profile','email']` 后导入时 `basic` 被静默丢弃（实测只剩 `email`+`profile`），所有访问令牌因此缺 `sub`，被 verifier 的 `requiredClaims:['sub']` 拒绝。隔离夹具 realm 不覆盖作用域，14 项协议测试因此一直通过、未暴露该缺陷——这是夹具与实例配置漂移的代价。

**修复**：生成器不再手工指定 client scope（保留 Keycloak 默认）并加回归断言；live realm 用 Admin API 的专用作用域分配端点补回 `basic`（批量 client PUT 静默忽略作用域名，第一次尝试无效）。修复后探针确认令牌含 `sub`/`aud=youlin-api`/`azp=youlin-web`/`typ=Bearer`，真实 verifier accepted；隔离浏览器 r7 真实登录成功：`sessionEstablished=true`、落地应用首页、`userEmailMatchesPerson=true`，库内 1 条 session proof 绑定真实原生 session 且 epoch 与 subject 一致。

**受控失败与可诊断性**：准入门输出固定分类（reason+detail），插件把 callback 的企业 5xx 换成 303 `<配置 origin>/auth-error?error=<粗粒度码>&attempt=<id>`（不带 set-cookie），浏览器只见 `youlin_admission_denied`/`youlin_login_unavailable`，内部原因只进服务端日志并按 attempt 关联；分类函数只返回固定码或错误类名，不回显消息体。首版误用容器内部请求 URL（`http://0.0.0.0:3210`）导致浏览器 `ERR_CONNECTION_REFUSED`，已改用经校验的配置 origin，并以先失败后通过的用例锁定。

**打包缺陷**：4 个 SPA shell 路由改 `force-dynamic`；新构建 prerender-manifest 已不含这 4 条路由，部署后 `/signin`、`/auth-error` 均 200 且 `Failed to update prerender cache` 计数为 0，同时避免环境变更后继续服务陈旧的内嵌 auth/feature 配置。

**实例生命周期缺陷**：各 phase 的 compose 共用 `<project>_default` 网络但 `internal` 标志不同（login-test 需发布 loopback 端口 → false；migrate/bootstrap/quarantine → true）。切换 phase 会重建网络并把未变更服务重新挂载而**不带 service alias**，容器内 `getaddrinfo postgres` 失败（实测 `Aliases: null`、migrate 连续 `EAI_AGAIN`，数据库本身健康）。现每个渲染文件使用 phase 独立网络名，一次性迁移/仪式网络不再与在服 phase 争用；用 `down --remove-orphans`（不删卷）清理损坏状态后重放迁移并重启，实测解析正常。

**验证与边界**：插件 12+2 项、准入门 12 项、身份两片 73+53=126 项真实 PostgreSQL、部署工具 32 项、定向 Lint 与身份/路由类型闭包通过；六阶段离线构建、打包、`upgrade`+`migrate`+`up` 与真实浏览器登录均实测。仍缺：停用后旧会话持续拒绝、双账号私人内容隔离、开户/停用管理员 UI、真实网关 Key 与预算接线、HTTPS/对象存储/邮件、全仓质量门与远端 CI。一次成功登录不等于 M02-001/002/004/006 交付完成，也不等于 M0～M2 的 31 项缺口有任何一项关闭。

本轮冻结证据与原始分类日志见 [R2 证据](evidence/m0-m2-continuation/r2/README.md)。最终部署镜像 `sha256:00a61ef9…`（回退点 `sha256:d1959564…`）。一次性 `migrate`/`bootstrap` 另加 `--force-recreate` 与"已确认镜像在触碰容器前拒绝、清理入 `finally`"两条加固，实测重复 `migrate` 立即拒绝且在服栈保持 healthy。

**登录后下一个阻塞（非身份链）**：`GET /trpc/lambda/user.getUserState` 返回 500（`S3 environment variables are not set completely`）。页面可渲染、会话有效，但依赖对象存储的用户状态查询失败；本机实例尚未配置对象存储。这是"登录成功"到"web 端可用"之间的下一个必修项。
