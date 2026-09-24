# Docker 优先的隔离测试环境

## 授权与执行约束

用户最新要求：**“测试的环境统一使用docker容器部署推进，除非必须本机的”**。

从本轮开始，测试服务、测试进程、质量检查和文档校验默认在 Docker 内执行。宿主仅做编辑/Git、Docker 编排、观察和证据归档；这些控制操作不是测试工作负载。确需原生系统的签名、设备、桌面集成或模拟器测试，须先说明不可容器化原因、范围、资源及清理方式，不得仅因容器配置缺失就改回宿主跑测试。

仍只允许合成身份与隔离开发；不表示生产、真实数据、D01～D17 或正式身份映射已获批准。当前没有员工可访问的 Web 地址。

## 本机 UAT 与当前工程环境的区别

最新确认将 UAT 放在本机 Docker 环境；其他目标环境完整部署后续推进。下表只是已运行的临时工程测试，不是完整 UAT 栈。应用、持久依赖、浏览器驱动、完整迁移链及真实用户流程的准备与门禁见[完整部署手册](./12-deployment-and-local-uat-runbook.md)。禁止直接复用已有 CRM/Dify/文档处理容器；完整栈总资源上限与应用镜像仍需落实。

## 当前部署形态

| 部分 | 实际部署 | 限制 |
| --- | --- | --- |
| PostgreSQL 15.19 | 独立容器 | 512 MiB、1 CPU、128 PID，数据 tmpfs 256 MiB |
| Node 22.23.1 / Vitest | 独立非 root 容器 | 2 GiB、2 CPU、128 PID、无额外 swap，单 worker |
| 显式文件 `bun run check` | 工具容器 | 4 GiB、2 CPU、128 PID；不代表全仓检查 |
| 私有 socket | Docker 命名 tmpfs 卷 | 8 MiB，仅挂到这两个容器；测试容器只读挂载，仍可连接 socket |
| 缓存/临时文件 | 容器 tmpfs | HOME/XDG 指向 `/tmp`，不读写宿主个人工具缓存 |
| 宿主 Node | 控制器 | 只调用本地 Docker API，不运行 Vitest、业务用例、模型或数据库驱动 |

测试容器无网络、无发布端口、只读根文件系统、丢弃 capabilities，开启 no-new-privileges；数据库关闭 TCP，不挂宿主目录。测试容器按允许列表只读挂载源码和已有工作区依赖，不挂 Docker socket、宿主 `.git` 或根 `.env`。文档校验按需挂载 docs，但遮蔽 `know/` 原件。源码子目录仍不是通用 Secret 沙箱，不能放真实凭据/业务记录。

只读 socket 挂载不等于数据库只读；SQL 权限仍由角色/事务控制。合成环境的 trust 认证不用于生产。Docker 管理员仍是可信边界。

## 镜像、依赖与复现

镜像定义及命令见 [Docker 工具说明](../../../scripts/youlin/docker/README.md)。首次准备拉取固定摘要的官方 Node 镜像，并在不含源码/凭据的构建上下文中安装 Git/Python/jsonschema。构建可以联网获取依赖；测试运行禁网、禁止隐式拉镜像。

实际工具镜像 ID 固定在 [images.json](../../../scripts/youlin/docker/images.json)。APT 包未做仓库快照锁定，因此不能宣称未来重建逐字节一致；更换/重建镜像须记录新 ID 和包版本，重新验证。当前复用已有工作区 node_modules，不声称已完成全容器依赖安装或 CI 环境冻结。

```bash
# 宿主控制器；数据库及18项真实驱动测试均在容器内
node scripts/youlin/nodePostgres.smoke.mjs

# 环境约束的5项真实检查
node scripts/youlin/dockerNode.mjs -- node --test /workspace/scripts/youlin/dockerRuntime.smoke.mjs

# 按所属数据库配置运行13+11项测试
node scripts/youlin/dockerNode.mjs --check --test packages/database/src/experimental/youlinSecurity/__tests__/reader.test.ts packages/database/src/experimental/youlinSecurity/__tests__/ownedReader.test.ts

# 原根配置的 server 项目，24项；不启动无关 app 项目
node scripts/youlin/dockerNode.mjs -- node /workspace/node_modules/vitest/vitest.mjs run --project=server --pool=threads --maxWorkers=1 apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.test.ts

node scripts/youlin/dockerNode.mjs --docs -- python3 docs/youlin-enterprise-ai-platform/plan/validate_docs.py
```

`--check` 仅接受显式文件，使用临时空 Git 元数据满足检查入口定位，不挂载真实 Git 凭据；不提供提交差异、基线或新增文件 Git advisory。Lint 只对显式目标开放写入，自动修复 diff 输出到日志供复核。全仓类型仍使用原有 `rootTypecheck.mjs` 容器入口，不能借选择性挂载冒充全仓通过。

## 本轮工程结果与边界

见 [M1 r4 证据](./evidence/M01-001-S1/r4-manifest.json)。18项真实 pg/Drizzle/gate 联调、13项 PGlite、11项配置、24项内核测试在容器中通过；环境检查另计5项。没有将重复运行累加或抵扣752条正式 Spec 用例。

首次运行因 Vitest 无法在只读 HOME 创建 token 失败，改用临时 HOME/XDG 后通过。初版允许列表漏了格式配置，发现引起格式漂移，已补齐并还原业务测试文件；没有把漂移作为业务修改提交。未限定项目的根测试在90秒观察窗口内未完成；定向原配置的 server 项目通过。没有扩大资源预算或修改产品 tsconfig 排除代码。

正常完成、失败、超时，以及观测到 SQL 锁等待后的 SIGTERM 均执行定向清理；中断返回失败，不计测试通过。控制器轮询截止不是宿主故障下的绝对硬墙钟保证。SIGKILL/宿主/Docker 故障可能遗留，须依据日志中的 UUID 核对两个容器及 socket 卷后定向清理，禁止全局 prune。镜像保留用于复用，测试数据不保留。

最新增量已将原 S2 的20项 SQL 断言全部迁入容器并通过：`node scripts/youlin/nodePostgres.smoke.mjs --sql`。直接宿主运行旧入口仍禁止。另增加真实 Keycloak 容器14项协议用例、9项认证器配置用例及中断清理；见[M02-001-S1证据](./evidence/M02-001-S1/README.md)。普通容器无网络；身份测试容器仅共享本次 Keycloak 的隔离网络命名空间，通过 loopback 通信，均无公网/宿主端口。

新增代码仍未接产品，无产品可见行为，不执行公共产品 Acceptance；独立静态代码审查不等于独立企业验收。正式 Schema、身份映射、TLS/复制拓扑、即时 SQL 取消、实际企业 IdP/PDP/PEP、全仓类型与员工助手端到端仍待完成。

## 历史轮次

- [S3 r2](./evidence/M02-006-S3/r2-manifest.json)：9项真实驱动验证；当时 PostgreSQL 在 Docker，Node 在宿主，socket 父目录0700。这是历史配置，不再作为默认执行方式。
- [S3 r3](./evidence/M02-006-S3/r3-manifest.json)：增至18项，并加入自有池配置、逐次只读事务、单实例准入和取消/关闭测试。通用 Reader 的旧快照反例仍保留；AbortSignal 不证明即时中断 SQL，客户端释放也不等于服务器确认后端立即结束。
