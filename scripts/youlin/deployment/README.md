# Youlin 本机工程部署工具（不是生产部署或 UAT）

只协调本机 Docker；不读取仓库根 `.env`、仓库外真实 MVP 配置或其他业务服务。不要给这些工具传入真实凭据。必须预置根依赖和固定镜像；不自动安装、拉取或回退到宿主构建。

```bash
node scripts/youlin/deployment/build.mjs
# 从上一步输出取得新的私有 artifacts 路径
node scripts/youlin/deployment/package.mjs /tmp/youlin-build-XXXXXX
# 从打包输出取得本地不可变 imageId，不能传 latest/tag
node scripts/youlin/deployment/runtimeSmoke.mjs sha256:<image-id>
```

## 资源与清理

- 构建：五个 Vite 入口和 Next 串行；每阶段 6GiB / 2CPU / 无 Swap / 128 PID / 420秒。每阶段检查至少8GiB available；不驱逐其他业务缓存或停止服务。
- 构建容器非 root、只读、禁网、源码允许列表挂载；不挂载根目录、`.git`、根 `.env`。拒绝 Vite 可自动加载的 micro-app 环境文件。只在仓库外生成可写 app/public/config 副本。
- 打包：保留 standalone 的相对 pnpm symlink，离线捆绑迁移入口；Dockerfile 无安装或 RUN。COPY 镜像组装不是冷构建；Docker daemon 的镜像导入开销不等同编译容器的资源限额。
- 合成启动：独立 internal 网络/数据库卷，无宿主端口。Postgres 2GiB、Redis 256MiB、应用 2GiB、迁移 1GiB、探针128MiB，各至多1CPU且禁 Swap；开始前至少6GiB available。密码和合成密钥只在新建700目录/600文件内生成。Redis仅用于此无业务数据的内部探针，不是生产ACL配置。
- 合成验证：应用镜像迁移/重放、镜像内 journal 数量断言、登录HTML与同源JS/CSS、`pg_dump`/`pg_restore`及单个合成用户哨兵。恢复目标从 `template0` 创建，避免 ParadeDB 模板已含 schema 的冲突。
- SIGINT/SIGTERM触发有界退出和本次UUID资源清理；清理失败报告保留项目名。只删本次Compose容器/网络/卷，不做全局prune。原始日志、失败目录及交付镜像保留，不能拿失败镜像放流量。

## 已知交付边界

- 必须在静止的可信工作区使用。当前依赖预置，源码/依赖输入未整体冻结；打包时迁移取当前工作区，不可跨提交拼接旧构建。尚不是冷安装可重复发布流水线。
- 上游 Next 构建跳过类型检查；成功不代表全仓 types/Lint 通过。GitHub远端CI仍待实跑。
- 合成配置关闭密码认证、未配任何真实IdP/网关/S3/SMTP；它只证明镜像启动，不证明邮箱/员工号登录或问答。
- 镜像没有开放员工流量的批准。缺 HTTPS、对象存储、真实邮件、首位管理员安全初始化、正式 Session/PEP、业务数据恢复/升级回退和浏览器 UAT。
- 输出目录含合成凭据及原始服务日志，只可私有保管。提交证据时仅归档已审查的非凭据日志，禁止上传 env 文件或企业数据至公共 Acceptance。
- 每个渲染的 compose 文件使用 **phase 独立网络名**（`<project>_<phase>`、`_migrate`、`_bootstrap`）。不要手工改回共用 `<project>_default`：各 phase 的 `internal` 标志不同（login-test 必须发布 loopback 端口），共用一个网络会让 Compose 在切换时重建网络并把未变更服务重新挂载而**丢失 service alias**，容器内随即出现 `getaddrinfo EAI_AGAIN postgres`（数据库其实健康）。已经损坏时用 `down --remove-orphans`（绝不加 `-v`）清理容器与网络，再 `migrate` → `up`。同理，一次性 `migrate`/`bootstrap` 的 `up` 必须带 `--force-recreate`：服务配置哈希不含网络名，Compose 会直接重启上一 phase 的停止容器，使本次网络没有可解析的 `postgres` 别名。
- SPA shell 路由（`spa`、`spa-auth`、`spa-share`、`spa-workbench`）必须保持 `force-dynamic`：镜像只读，Next 写 prerender cache 会失败刷日志，且 ISR 会在环境变更后继续服务陈旧的内嵌 auth/feature 配置。
