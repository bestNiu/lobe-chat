# 内部市场：文档索引

三份文档，按读取顺序：

| 文档                                                                     | 内容                                                                          | 何时读                 |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------- |
| **[`PHASE-1-IMPLEMENTATION-PLAN.md`](./PHASE-1-IMPLEMENTATION-PLAN.md)** | 阶段一**落地规划**：里程碑、端点清单、缓存策略、部署、验收                    | **要开工时读这个**     |
| [`DESIGN.md`](./DESIGN.md)                                               | 设计文档：第一部分 = 阶段一设计（含实测权限矩阵），第二部分 = 阶段二 UGC 市场 | 想理解「为什么这样做」 |
| 本页                                                                     | 索引与现状摘要                                                                | —                      |

## 阶段 1 关键结论（详见 DESIGN.md 第一部分）

| tab    | 数据来源                            | 需要市场吗                  |
| ------ | ----------------------------------- | --------------------------- |
| 模型   | 本地 model-bank                     | ❌                          |
| 服务商 | 本地 model-bank                     | ❌                          |
| 助理   | `npmmirror` 公域索引（505 条）      | ✅ 代理                     |
| MCP    | `chat-plugins.lobehub.com`（40 条） | ✅ 代理 + manifest 转发     |
| Skill  | **自建索引（GitHub 坐标）**         | ✅ 代理 + 302 到 GitHub zip |

三个探索结论：

1. 助理有完整公域索引，无需官方凭据。
2. MCP 有公域索引，但 manifest 域名被 SNI 阻断，需网络修复 + 预缓存。
3. **Skill 的 `identifier` 就是 GitHub 坐标（`github.owner.repo`），安装只需市场返回一个 download URL** —— 因此 Skill 不需要官方数据源，自建索引 + 302 到 GitHub archive 即可。

## 共用不变的部分

1. **鉴权只有一个 secret**：`MARKET_TRUSTED_CLIENT_ID` + `MARKET_TRUSTED_CLIENT_SECRET`（83 字符 = `lobehub-market_tcs_` + 64 hex，AES-256-GCM）。
2. 服务端必须严格匹配 `@lobehub/market-sdk@0.42.0` 契约。
3. 不依赖 LobeHub 的 workspace / RBAC（开源版均为 cloud-only stub，见 `DESIGN.md` §1.3）。
4. 禁止匿名访问，不存在 `public` 可见级别。

## 当前实现状态

工作区 `/home/ulyy/app/unionclinRag/unionclinHub-market`（分支 `feat/internal-market`）：

| 模块          | 文件                                         | 状态                           |
| ------------- | -------------------------------------------- | ------------------------------ |
| 配置校验      | `apps/market/src/config.ts`                  | ✅ secret 严格 83 字符         |
| 共享类型      | `apps/market/src/types.ts`                   | ✅ SDK 类型仅 re-export        |
| 验签中间件    | `apps/market/src/middleware/auth.ts`         | ✅ 19 个测试全绿               |
| 迁移执行器    | `apps/market/src/db/migrate.ts`              | ✅ 幂等，4 个测试（阶段 2 用） |
| 数据库 schema | `apps/market/src/db/{schema.ts,migrations/}` | ⏸ 阶段 2 用；阶段 1 无 DB      |

阶段 1 待做：公域源客户端、缓存层、契约映射、路由、manifest 代理、skill 索引与下载重定向、契约测试、compose 集成。
