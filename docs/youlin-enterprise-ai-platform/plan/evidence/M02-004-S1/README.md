# M02-004-S1 身份持久化内核：开发中证据

**状态：进行中、已做独立初审和一次复核、未完成完整 Spec、未部署、未做产品验收。** 此目录只保存合成工程验证，不抵扣正式 AC/UAT；父 Spec 的批准和交付状态不变。

## 当前范围

- 三个候选 schema 模块、九张新增表及正式格式的 **未发布草稿**迁移 `0162_youlin_identity`。
- 稳定 HR person key 注册；企业边界、全局应用账号唯一；注册只创建 pending/unreconciled 主体，不开通权限。
- 服务端派生 actor、实时主体/epoch/grant 校验、主库新 READ COMMITTED 事务、企业锁及可选全局主体锁。
- 状态、幂等回执、审计和 Outbox 同事务；重复回执也重验当前权限；提交结果不能确认时不假称已回滚。
- 撤权先持久 disabled/epoch/凭据时间屏障，删除旧 grant，清除 IdP 撤销确认，再落持久投递意图；尚未投递 IdP。
- epoch 达到安全整数上限时仍可永久拒绝访问；未来激活/审批实现必须拒绝终止版本，不能回绕或重置。

## 已发现并修复的工程问题

1. Docker `cp` 未能读取 OCI tmpfs 产物。改为容器内压缩、exec 有界传输、宿主仅归档；保留首轮失败。
2. Drizzle 将复合外键生成在唯一索引之前，真实 PostgreSQL 首次应用失败。将四个技术性 `(id, enterprise_id)` 外键目标改成表内唯一约束；业务唯一性仍用索引。
3. 环境检查的 `select()` 缺少 `.from()`，尚不是可执行查询。真实 Repository 测试失败后修复。
4. 早期回滚断言可能把“尚未走到审计插入就失败”误当回滚证明；加入测试专用、非事务性 sequence，确认故障触发器确实执行。该 sequence 不进入正式 schema。
5. 定向类型检查首次包装器丢失 stdout，随后发现临时配置位于 `/tmp` 导致 `vitest/globals` 类型根解析失败；显式保留工作区类型根后通过。没有修改仓库 tsconfig 或用排除代码刷绿。

## 迁移来源与边界

Docker 内执行原仓库 `bun run db:generate`，复制生成 SQL/snapshot/journal/DBML；仅进行 IF NOT EXISTS、FK DROP IF EXISTS + ADD、语义化文件名/tag 硬化。正式 SQL 不由测试手写。测试所需现有 `users`/`user_settings` 基线也由真实上游 schema 生成，不是单列替身。

只在无网络、无端口、随机 UUID、可销毁的 PostgreSQL 15 环境验证首次应用与重复执行。未访问业务 DATABASE_URL、未读宿主 .env、未测生产容量或宣称生产锁影响。完整上游迁移链、真实 Dev/生产规模、运行时数据库最小权限仍需另验。不可因 Feature Flag 关闭就推断 DDL 不会部署：发布前必须审查实际自动迁移入口。

## 本轮检查与独立复核

- 最新身份套件 **32/32**：24 项真实 PostgreSQL 场景、8 项纯 DTO 测试；另外工具/隔离检查 13/13、旧真实 PostgreSQL 18/18、旧 SQL 20/20、server 33/33。重复跑次不重复累计。
- 明确文件范围的 Lint、身份入口及依赖闭包类型检查通过；全仓类型仍未完成。
- 原生生成 DBML 含上游生成器风格的行尾空白，`git diff --check` 对该生成文件发出告警；未手改生成结果或把它伪报为全绿。
- Codex 只读初审观察超时（exit 124），不计通过。随后一次 Pi 独立初审指出 P2：缺少安全诊断分类和关联标识；已补 attemptId、命名空间日志和固定分类。回归恢复旧无关联行为时 1 失败/30 通过，修复后 31 通过。
- 单次独立复核确认上述问题解决，并撤回“catch 中 console.error 不合规”的判断（仓库 TS 规则要求该用法）；另指出低可能、非发布阻断 P2：新结果校验错误不应被标为旧回执损坏。已改为中性 `validation`，对应回归修复前 1 失败/31 通过、修复后 32 通过。该最后分类修正未追加独立复核，不虚报第三次独立通过。
- 审查仅覆盖本轮内核，不是全部 M0～M2、安全签收或产品验收。生产迁移编号、完整迁移链、审计最小权限/保留、实际部署连接/锁行为仍须另验。

## 后续仍缺

HR 完整快照处理、绑定及冲突双人审批、正式权威读取与应用 Session/PEP 接入、带租约/fencing 的 Outbox 投递和 IdP 撤销确认、服务身份；真实 HR/企业微信接口及正式 UAT 等输入仍未齐备。高风险审批不得因 Eric 承担多个角色而被视为双人复核。

Repository 测试通过固定私有 Unix socket 和随机环境 marker 接入真实 PostgreSQL；不走可能读取业务连接的全局 `getTestDB()`，也不回退到 mock/PGlite。这是本隔离测试环境的明确例外。

## 可复现入口

```bash
node scripts/youlin/nodePostgres.smoke.mjs --identity
node scripts/youlin/nodePostgres.smoke.mjs --identity --schema-only
node scripts/youlin/dockerNode.mjs -- node /workspace/scripts/youlin/migrations/identityTypes.mjs
node scripts/youlin/dockerNode.mjs -- node --test /workspace/scripts/youlin/migrations/harden.test.mjs
```

`generateIdentityMigration.mjs` 用于生成一个新候选迁移；现有未发布草稿变更时，按仓库迁移规则移除本分支草稿后重新生成，不能手改 SQL 追逐 schema。生成产物先归档到私有 `/tmp/youlin-migration-*`，不直接覆盖宿主源码或访问数据库。
