# Youlin 身份接入内核（默认关闭；本机 login-test 候选，未完成验收）

所有能力由显式环境变量开启，未开启时不改变上游行为。开启不代表已验收：真实人类登录、双账号隔离、停用生效与产品数据持久化仍需本机 UAT 与独立复核。

## 认证与授权边界

- `keycloakAccessVerifier.ts`：RS256/JWKS、issuer/audience/azp/必需claims认证。签名通过不等于当前授权。
- `userCredentialGate.ts`：把经验证的 issuer/sub 接到正式身份投影；逐次读取、隔离企业与principal、检查停用、凭据时间屏障及服务端保存的 Session user/subject/epoch。配置时显式给出时钟偏差上界；从签发时间减去偏差再比较屏障，不给旧凭据放宽窗口。依赖故障/超时拒绝；每个拒绝都在 `lobe-server:youlin-identity` 下输出固定分类（`reason` 加 `detail`，例如 `INVALID_CREDENTIAL`/`ERR_JWT_AUD_VALIDATION`/`READER_BUSY`），一次复现即可定位；不回显token、claim值、主体或原始异常文本。
- `packages/database/src/repositories/youlinIdentity/authorityReader.ts`：正式 users/subjects/bindings/persons/employment 查询。仅接受有连接/查询超时的 node-postgres Pool-backed DB，拒绝借用事务或client；每次新 READ COMMITTED READ ONLY 事务、主库检查、显式 `pg_catalog, public, pg_temp`，防止池中临时表遮蔽。单条MVCC查询获取资格事实，不缓存。
- Reader 要求 active主体/绑定、未处于有效ban（数据库时钟判断banExpires）、HR已核对或显式允许的**纯手工准入**（`allowManualEnrollment`，默认关闭；混合HR或未知状态fail closed）、唯一且生效的active任职、精确cleanup epoch及非terminal版本。缺数据/证明不放行。Reader借用的是**池**，不是借用事务；池由应用拥有和关闭。
- Reader并发槽直到事务收尾才释放；上层超时不会把仍在运行的IO当已结束。Pool需由可信启动代码配置且运行时不能修改其超时/驱动策略。
- `youlin_session_proofs`：一条不可变记录绑定一个 `auth_sessions.id`、应用user、企业subject、稳定issuer/sub binding及认证当时的auth epoch。proof不使用Session `createdAt` 推断epoch；绑定前重新核对原生Session、subject、binding与捕获epoch，逐请求再与Reader当前状态比较，因此“先允许、后停用、再创建Session”不能把旧结论升级成新会话。
- `sessionEnforcer.ts` / `httpSessionEnforcement.ts`：无缓存逐请求读取proof和当前authority；缺proof、scope/identity/epoch不符、disabled、超时或依赖故障均拒绝。成功仅表示认证可继续，不授予资源权限。`runtimeDatabase.ts` 提供独立lazy有界Pool（不修改上游全局Pool）。
- `src/app/(backend)/middleware/auth/index.ts`：`YOULIN_ENTERPRISE_SESSION_ENFORCEMENT=1` 时仅接受带有效proof的原生Better Auth Session；现有开发mock/debug header及CLI OIDC header不作为回退。未精确设置为`1`时完全不改变现有认证路径。Chat/TRPC/OpenAPI 同样在企业模式下拒绝替代认证（API key、OIDC debug、mock header）。
- `src/libs/better-auth/plugins/youlinEnterprise.ts`：企业模式下 Better Auth 仅保留 allowlist 路径（Keycloak sign-in/callback、get-session、sign-out）。禁止注册、邮箱密码、account linking、身份变更与cookie缓存。callback 内每请求 AsyncLocalStorage 保存已验证token与最终 `session.id`；`session.create.before/after` 校验同一 user，proof绑定失败时删除已提交的孤儿原生Session（删除失败仅记录，该Session仍被deny-first拒绝）。`youlin-current-session` hook 与外层wrapper共同覆盖 `auth.api.getSession` 与HTTP `/get-session`，两者都逐请求执行enforcement。
- 回调失败是受控失败：企业失败先记入本请求 store，外层 wrapper 把 callback 的 5xx 换成同源 303 跳转 `/auth-error?error=<粗粒度码>&attempt=<关联id>`，且不带 set-cookie。浏览器只看到 `youlin_admission_denied` / `youlin_login_unavailable` 两类码，内部 reason 仅进服务端日志并按 attempt 关联，避免向浏览器泄露账号是否存在或已停用等身份状态；未记录企业失败的 5xx 不被掩盖。

成功只返回 `continue_authorization` / `continue_authentication` 的服务端上下文，**不是资源授权**。禁止将客户端自报的actor/session字段传入；issuer/sub必须来自独立校验后的凭据。Session proof只能用`userCredentialGate`成功返回的服务端context和Better Auth服务端返回的`session.id`写入。

## 手工准入与开通（本机 login-test 范围）

- `youlin_manual_enrollments`（迁移0164）：员工号在企业内永久唯一，pending/disabled仍占用，不硬删除、不复用、不转绑。不写伪造HR记录。
- `manualEnrollment.ts`：reserve → activate（仅pending，版本/epoch屏障，不恢复既有grant）→ disable（先持久deny、epoch递增并产生真实cleanup因果事件）。
- `manualPrincipalLink.ts`：把pending手工subject与可信Keycloak principal及原生 `accounts` 映射原子绑定；企业→principal锁、原生account碰撞检查、禁止按邮箱匹配。
- `manualProvisioningState.ts`：内部当前状态投影（binding数、epoch/version、cleanup epoch、原生account精确匹配）。不是grant，也不是认证结果。
- `manualProviderWork.ts`：不可变 start/completion 命令束实现的持久single-flight。start未complete**永不自动接管、不重复外部副作用**；进程崩溃或provider结果未知需显式运维对账（尚未实现），此时native session PEP保持deny-first。
- `keycloakAdministration.ts`：专用realm service client、有界fetch；创建即disabled并带 subject/command 标签，409仅接受精确标签+username+email匹配，重试不改密码。`cleanupSessions` 先要求用户已disabled，再logout并校验会话为空、对realm内client做有界offline-session普查，最后复核仍为disabled；ACK、超时或不确定结果都不算清理证明。
- `manualProvisioningService.ts`：reserve → provider创建(disabled) → link → 真实清理 → service cleanup证明 → activate → 复核状态 → provider enable → 再次复核；失败先deny再关provider。这是本机login-test编排，不是完整崩溃恢复/saga。
- `manualProvisioningFactory.ts` / `adminHttp.ts` / `webapi/youlin/admin/users/route.ts`：actor只能来自已验证的原生Session proof（或私有离线bootstrap），HTTP不接受客户端提供的actor、grant、binding或cleanup字段。路由默认404，仅在local-test+manual-enrollment显式开启且Origin精确匹配本机应用时可用；body按实际字节数限制，错误统一分类且不回显原始异常。
- `localBootstrap.ts` + `localBootstrapCli.ts`：离线、显式local-test确认的信任根引导。仅空库可初始化；创建两个service（bootstrap operator、cleanup worker）与精确grant；首位human管理员授权后同事务退休bootstrap service，不允许第二个管理员或复活。私有CLI在打开数据库前先校验0600私有输入文件；不打印密码。

## 尚未完成 / 已知缺口

- 首位human管理员账号已由私有bootstrap仪式创建，并已在 `login-test` 实例完成**一次真实 SSO 登录**（隔离浏览器 r7：session 建立、落地首页、session proof 绑定真实原生 session 且 epoch 与 subject 一致）。仍缺：停用后旧会话持续拒绝、双账号私人内容隔离、开户/停用管理员 UI（当前仅 `POST /webapi/youlin/admin/users`）、退出/单点登出串联。

历史阻塞已修复：r4～r6 的 `GET /api/auth/oauth2/callback/keycloak` 500（`YOULIN_ADMISSION_DENIED`）根因是 Keycloak 26 由 `basic` 客户端作用域的 `oidc-sub-mapper` 发 `sub`，而实例 realm 的 `youlin-web` 导入后只剩 `email`+`profile`，令牌缺 `sub` 被 verifier 的 `requiredClaims` 拒绝。生成器不再手工指定 client scope；已存在的 realm 需用 Admin API 的专用作用域分配端点补 `basic`（批量 client PUT 会静默忽略）。准入门现输出固定分类（`reason`+`detail`），插件把企业 5xx 换成 303 `<配置 origin>/auth-error?error=<粗粒度码>&attempt=<id>`；不要用容器内部请求 URL 作为跳转目标。
- provider-work 的崩溃/未知结果对账、`disable` 的长期凭证轮换闭环、模型预算与Chat全路径接线未实现。
- 0163/0164 已随 165 条 journal 迁移在持久实例重放；隔离库重放与rollback探针不等于生产升级/回退批准。
- 启用前必须使用node-postgres主库Pool，并配置非零 `connectionTimeoutMillis` 及大于1500ms的 `query_timeout`；普通Neon driver或无界Pool会故障关闭。不要仅设置feature flag就开放员工访问。
