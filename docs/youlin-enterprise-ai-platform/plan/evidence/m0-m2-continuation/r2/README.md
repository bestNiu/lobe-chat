# M0～M2 续建工程证据 R2：登录阻塞根因与三项缺陷修复

本轮把 `login-test` 实例从"能打开登录页但回调 500"推进到**首位管理员真实 SSO 登录成功**，并修掉四个互相独立的缺陷。全部为工程验证，不是产品验收；`acceptance: not_published`。

## 根因（一次复现即命名）

上一轮结束时回调 500 只知道 `YOULIN_ADMISSION_DENIED`，原因被丢弃。本轮先补固定分类日志，再一次复现即得：

```text
reason=INVALID_CREDENTIAL detail=ERR_JWT_CLAIM_VALIDATION_FAILED
```

一次性无凭据诊断（真实协议流 + 仓库自己的 verifier，脚本用后删除）进一步给出 `claim=sub reason=missing`：

- Keycloak 26 通过 **`basic` 客户端作用域的 `oidc-sub-mapper`** 发出 `sub`；
- `localIdentityRealm.mjs` 显式写 `defaultClientScopes=['basic','profile','email']`，导入后该 client 实际只剩 `email`+`profile`（`basic` 被静默丢弃）；
- 于是每个访问令牌都缺 `sub`，被 verifier 的 `requiredClaims:['sub',...]` 拒绝 → 准入门 deny → Better Auth 抛错 → 500。
- 隔离夹具 realm 不覆盖 client scope，14 项协议测试因此一直通过：这是**夹具与实例配置漂移**的代价，不是测试造假。

修复：生成器不再手工指定 client scope（保留 Keycloak 默认，`basic` 随之分配）并加回归断言；已存在的 realm 用 Admin API 的**专用作用域分配端点**补回 `basic`（批量 client PUT 会静默忽略作用域名，第一次尝试无效）。修复后令牌含 `sub`/`aud=youlin-api`/`azp=youlin-web`/`typ=Bearer`，verifier `accepted`。

## 同时修复的三项缺陷

1. **回调失败是 500，不是受控失败**：企业失败先记入本请求 store，wrapper 把 callback 的 5xx 换成 303 `<经校验的配置 origin>/auth-error?error=<粗粒度码>&attempt=<关联id>`，不带 set-cookie。浏览器只见 `youlin_admission_denied` / `youlin_login_unavailable`，内部 reason 只进服务端日志（不泄露账号是否存在/已停用）。首版误用容器内部请求 URL（`http://0.0.0.0:3210`）导致浏览器 `ERR_CONNECTION_REFUSED`，已改用配置 origin，并以先失败后通过的用例锁定。
2. **只读镜像上的 prerender cache 写入失败**：4 个 SPA shell 路由改 `force-dynamic`。新构建的 prerender-manifest 已完全不含这 4 条路由（旧构建在 `dynamicRoutes` 内）；部署后访问 `/signin`、`/auth-error` 均 200，`Failed to update prerender cache` 计数为 **0**。同时消除 ISR 在环境变更后继续服务陈旧内嵌 auth/feature 配置的风险。
3. **实例生命周期网络缺陷**：各 phase 的 compose 共用 `<project>_default` 但 `internal` 不同（login-test 需发布 loopback 端口 → false；migrate/bootstrap/quarantine → true）。切换 phase 会重建网络并把未变更服务重新挂载而**丢失 service alias**，容器内出现 `getaddrinfo EAI_AGAIN postgres`（数据库其实健康，见 `migrate-network-alias-before.log`）。改为每个渲染文件使用 phase 独立网络名，并给一次性 `migrate`/`bootstrap` 的 `up` 加 `--force-recreate`（服务配置哈希不含网络名，否则 Compose 会直接重启上一 phase 的停止容器）。`migrate` 另外：已确认过的镜像**在触碰任何容器前**直接拒绝，且清理放入 `finally`，避免把 `postgres` 留在一次性网络上使在服 phase 无法解析。

## 实测验证

- 真实浏览器登录（隔离容器浏览器，凭据只来自挂载的 0600 文件）：`login-r9` → `sessionEstablished=true`、`sessionStatus=200`、落地 `http://127.0.0.1:33210/`、`userEmailMatchesPerson=true`。
- 数据库侧：3 条 `youlin_session_proofs` 绑定 3 条真实原生 `auth_sessions`，epoch 全部与 subject 当前 `auth_epoch` 一致。
- app 容器内 `postgres` 解析正常；`DEBUG` 仅含两个 Youlin 命名空间（无通配符）。
- 六阶段离线构建全 0 退出、打包为 `sha256:00a61ef9…`、`upgrade`+`migrate`（165 条 journal 重放）+`up` 全部通过；`migrate` 重复执行按预期在触碰容器前拒绝且不影响在服栈。
- 定向测试：插件 12+2、准入门 12、身份两片 73+53=126（真实 PostgreSQL）、部署工具 32；定向 Lint 与身份/路由类型闭包通过。

## 边界与未验收项

- **登录后仍有产品级缺陷**：`GET /trpc/lambda/user.getUserState` 返回 500（`S3 environment variables are not set completely`）。页面能渲染、会话有效，但依赖对象存储的用户状态查询失败；本机实例尚未配置对象存储。
- 未做：停用后旧会话持续拒绝、双账号私人内容隔离、开户/停用管理员 UI、退出/单点登出串联、真实网关 Key 与预算接线、HTTPS/SMTP、全仓类型与远端 CI、任何产品 UAT 发布。
- 一次成功登录不关闭 M02-001/002/004/006 中任何一项，也不改变 31 项完整交付缺口的状态。
- 截图与原始浏览器事件留在私有实例目录（可能含管理员邮箱），不归档到仓库；本轮无独立复核（未被要求），仅主 Agent diff 自检。

`manifest.json` 冻结本轮源文件与归档工件的 SHA-256。R1 及更早证据未改写。
