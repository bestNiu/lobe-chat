# 本机隔离测试环境：首轮 node-postgres 验证

## 授权与范围

用户授权：“继续推进，本机机器可以部署测试环境测试验证等等”。首轮仅部署可重复创建/销毁的 PostgreSQL 驱动验证环境，使用合成身份；不是完整 LobeHub/Keycloak/员工助手部署，也不代表生产或真实数据审批。

- 本地 Docker Unix socket；仅使用已有缓存镜像，不下载、不发布端口。
- 独立 PostgreSQL 容器，512 MiB / 1 CPU / 256 MiB 数据 tmpfs，无网络且关闭 TCP 监听。
- 宿主仅共享新建的私有临时目录内的 Unix socket 子目录，不挂载源码、业务库、Secret 或已有数据目录。
- Node/Vitest 在宿主执行，明确使用该 socket、测试数据库和角色；不调用 getTestDB，不使用 DATABASE_URL，不运行产品迁移。
- 父临时目录为 0700，socket 子目录允许容器 PostgreSQL 用户创建 socket。trust 仅限这个合成环境；不等于生产认证配置。
- 测试退出、失败或常规中断后清理本次子进程组、容器、卷和临时目录。SIGKILL/宿主故障须核对本次 UUID 后人工清理，禁止全局 prune。

## 预先定义的验证项

1. Node + pg + Drizzle 正确读取合成主体，并接到既有撤权 gate；user/service 同 ID 不串读。
2. PostgreSQL 原子撤权提交后，两个独立读取连接池都拒绝同一旧凭据；审计/Outbox/回执各一条。
3. 未提交的撤权不提前可见；回滚后状态和副作用记录保持原状。
4. 只读数据库角色可读状态，不能写状态、读审计或执行撤权函数。
5. 未知主体和参数化恶意标识不产生放行或 SQL 副作用。
6. 记录 repeatable-read 旧快照反例：主库连接本身不保证新鲜度，不把该反例算作生产安全能力。
7. 表锁阻塞时 gate 先拒绝；确认 SQL 仍在等待，之后由 PostgreSQL statement_timeout 终止；连接池可恢复后续读取（不保证同一物理连接）。这不证明 AbortSignal 能立即取消 SQL。
8. 存储权限失效时 gate fail-closed。
9. 安全整数上限在真实 pg 驱动中不截断，数据库拒绝越界写入。

## 证据与验收边界

保存真实终端输出、退出码、版本、环境限制、清理结果和源码 SHA-256。未提供独立评审代理，本轮无独立验收评审。工程测试不作为产品 Acceptance；不上传公共 Acceptance 或公共 Debug Proxy。全仓类型、正式迁移、真实身份链和员工助手端到端验收仍单独待办。

## 实际结果与复现

```bash
node scripts/youlin/nodePostgres.smoke.mjs
```

- PostgreSQL 15.19 / Node 22.23.1 / pg 8.23.0：上述 9 项测试通过，见 [r2 证据清单](./evidence/M02-006-S3/r2-manifest.json)和[实际终端输出](./evidence/M02-006-S3/r2-nodepg.txt)。
- Docker inspect 确认内存/CPU/PID、无网络/端口/持久卷；stat 确认父目录 0700；数据库确认关闭 TCP 监听。
- 新测试默认跳过，只有专用入口创建并验证 UUID 标记的环境后才执行；非法 socket 配置返回失败。
- 正常退出、SQL 阻塞期间中断均已确认清理；中断轮次返回 1，不计为测试通过。独立核验测试子进程 PID 和 socket 父目录均已消失。
- 两个连接池不是两个已部署服务；试验只读角色不是完整生产权限审查。旧快照反例和 AbortSignal 不即时取消 SQL 的限制仍然存在。
- 容器限额不包括宿主测试进程；宿主 Vitest 仅启用一个线程 worker，测试阶段 45 秒看门狗终止本次独立进程组。协调器遭 SIGKILL 时仍需按打印的本次名称清理。
- 环境为按需临时部署，测试后不保留常驻服务，没有可供员工访问的 Web 地址。
