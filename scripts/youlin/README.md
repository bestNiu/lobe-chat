# Youlin 隔离工程测试工具

这些工具只服务于尚未接入产品的工程切片，不是生产启动/迁移脚本，不加载项目 `.env`、不接受业务数据库连接串。

## 固定工具链

[独立锁定工具链](./toolchain/README.md)已运行内核严格类型、隔离 ESLint 和 Vitest。根依赖现已安装，根 preset 对内核/测试三个文件的 Lint 和 24 项测试通过；全仓类型检查仍未完成，不能混称全部质量门通过。

## 撤权内核行为测试

```bash
node --experimental-strip-types --test scripts/youlin/revocationGate.smoke.mjs
```

运行与 Vitest 入口相同的 24 项合成行为测试；Node 类型擦除不代替 TypeScript 检查。

## PostgreSQL 原子撤权试验

```bash
node --experimental-strip-types --test scripts/youlin/revocationPostgres.smoke.mjs
```

前置条件：Node 22.23.1、可访问的本机 Docker Unix socket、已经批准并缓存的 `postgres:15-alpine` 镜像，以及本仓合同检查器使用的 Python/jsonschema 环境。工具会解析并使用本地 image ID，**不拉取镜像**，不连接远程 Docker。已有 `DATABASE_URL` 不会被读取。

隔离措施：

- 唯一随机名称/标签；只操作本次创建并返回 ID 的容器。
- `--network=none`，不映射端口、不绑定宿主目录；临时 PostgreSQL 数据目录为 tmpfs。
- `trust` 仅用于这个无网络、无真实数据的试验容器，绝非部署建议。
- 512 MiB 内存、1 CPU、256 MiB 数据 tmpfs；测试连接的 statement/lock timeout 仅为试验保护，不是生产 SLA。
- 正常完成、用例失败或创建后的初始化失败均清理容器/匿名卷，并检查容器消失。强制杀死测试进程或 Docker 故障仍可能遗留；人工清理前应先核对 `youlin.revocation-spike` 标签和本次容器 ID，禁止全局 prune。

### 已实现的试验逻辑

[fixtures/revocation.sql](./fixtures/revocation.sql)创建独立 `youlin_security_spike` schema：

1. 按全局 `(subject_kind, subject_id)` 唯一定位状态；所有表用 UUID 单列主键，不使用自增或复合主键。
2. 按 actor/operation/idempotencyKey 获取事务级 advisory lock，JSONB 规范化参数逐值核对；新 Request ID 不改变同一操作的幂等语义。
3. 幂等重放先于旧 epoch 检查；新命令再行锁主体，校验 expectedEpoch、递增 sourceVersion 和安全整数上限。
4. deny/epoch、审计、CloudEvents Outbox、幂等回执在同一 PostgreSQL 事务写入；任何写失败全部回滚。
5. 重放旧回执不把旧 epoch 写回当前状态；未知主体不自动创建。

20 项真实 PostgreSQL 试验覆盖成功写入、重试/参数冲突、主体与 actor 隔离、并发竞争、审计/Outbox/回执写失败、仅终止自身试验事务连接的回滚、旧回执重放及整数溢出。最后将实际查询结果接到 TypeScript gate，验证提交禁用前后同一合成凭据的检查结果改变。一次输出事件同时交给 K03 Schema 校验。

### 不能据此推断的能力

- 使用的是试验 schema 和超级用户夹具，**不是**正式 Drizzle Schema、生产迁移、最小权限角色或应用数据库 Adapter。`psql` 的参数引用是测试传输，不是服务器驱动实现。
- 核验现有 `users.banned`、`auth_sessions.user_id` 与 `accounts` 接点后，确认正式用户仍由上游表管理。本试验没有复制或修改这些表；企业主体映射/外键、再启用、保留和角色权限仍待批准。
- SQL 函数不认证其 actor 参数；正式服务每次调用（含幂等重放）必须先验证当前调用者权限。
- sourceVersion 仍假设为同一主体的规范化身份序列，不可直接比较不同上游系统计数。
- 仅验证 Outbox **写入**，未实现发送、Broker、Inbox、DLQ、外部副作用或防篡改审计归档。
- 未证明主机断电、存储丢失、备份恢复、HA、生产吞吐、撤权 SLA 或 Keycloak/Web/Desktop/Worker 全路径行为。

正式落库须按本仓 Drizzle 流程定义 schema、生成并审查迁移，不得把此 fixture 复制进迁移目录或生产直接执行。

最新结果见 [r4 原始 TAP](../../docs/youlin-enterprise-ai-platform/plan/evidence/M02-006-S2/r4.tap)及[源码 Hash/环境清单](../../docs/youlin-enterprise-ai-platform/plan/evidence/M02-006-S2/r4-manifest.json)；r1/r2/r3 保留为历史轮次。这些是工程测试材料，不是产品 Acceptance；内部试验没有用户可见接点，未发布公共 Acceptance。

## Drizzle 读取原型

[实验目录](../../packages/database/src/experimental/youlinSecurity/README.md)新增状态映射与只读 Adapter，13 项 PGlite 测试通过。它不进入正式 Drizzle schema 目录、不生成生产迁移；底层 SQL 取消、node-postgres 与真实身份链仍待验证。

## 有限资源全仓类型检查

```bash
node scripts/youlin/rootTypecheck.mjs
node --test scripts/youlin/processHarness.smoke.mjs
```

仅 Linux x64 / 本地 Docker；使用根已安装的原生 tsgo 和缓存 `python:3.12-slim-bookworm` 的 image ID，直接运行静态编译器二进制（不运行 Python、npm 脚本或下载）。无网络、只读仓库挂载、隐藏 `.git` 和私有分析原件；不通过环境变量注入数据库/模型凭据。容器仍可读取挂载的源码树，不能视为 Secret 沙箱；运行前不得在源码树放真实业务记录或额外凭据。4 GiB 硬内存、无额外 swap、2 CPU、512 PID，输出含 stdout/stderr。

60 秒是协调器观察截止，Docker 控制/清理另有时延；不是绝对墙钟保证。本轮已实际验证截止和 SIGTERM 清理；尚未获得完整全仓编译结束的证据。SIGKILL/宿主或 Docker 故障仍可能留下容器：按终端打印的本次 `youlin-typecheck-<uuid>` 名称及 `youlin.typecheck-spike` 标签核验，仅清理该容器，禁止全局 prune。

当前结果仍是类型检查 **timeout / incomplete**，不是通过；不要在共享宿主无限提高预算。见 [M1 r3 证据](../../docs/youlin-enterprise-ai-platform/plan/evidence/M01-001-S1/r3-manifest.json)。
