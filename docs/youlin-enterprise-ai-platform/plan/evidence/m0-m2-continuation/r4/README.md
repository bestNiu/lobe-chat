# R4：S2/S3 模型授权与 token 额度的真实强制验证

范围：本机 `login-test` 持久实例，镜像 `sha256:0b381bb8…`，迁移 166 条（含 `0165_youlin_model_governance`）。全部通过**真实浏览器登录 + 真实产品接口** `POST /webapi/chat/openai` 验证，不是直连数据库伪造会话。`YOULIN_MODEL_ACCESS_CONTROL=1` 仅在 login-test 阶段开启。

## 验证矩阵

| 例 | 前置 | 结果 |
| --- | --- | --- |
| A 默认拒绝 | 授权表为空 | **403** `{"error":"MODEL_NOT_GRANTED","periodId":"2026-09"}` |
| B 授权放行 | 播种 1 行授权（`qwen3.8-max`，cap=100000） | **200**，账本由 1 行/81 tokens 增至 **2 行/165 tokens** |
| C1 每模型额度 | `monthly_token_limit` 设为当期已用 165 | **403** `MODEL_QUOTA_EXCEEDED` |
| C2 每用户总额度 | 模型 cap 放开，`youlin_user_quotas.monthly_total_token_limit=165` | **403** `USER_QUOTA_EXCEEDED`（证明模型额度优先、用户总额度独立生效） |
| C3 放开恢复 | 两级额度均放宽 | **200**（证明拒绝由额度触发，不是状态损坏） |

拒绝响应只含固定原因码与自然月 `periodId`，不含模型清单、他人配置或用量数值；`cache-control: no-store`。

## 本轮修复的一个真实缺陷

首次部署后所有请求返回 `INVALID_INPUT` 而非 `MODEL_NOT_GRANTED`：reader 用 `sql<Date>`now()`` 取数据库时钟，实际返回值不是 `Date`，被退化成 Invalid Date，策略层按"计数不可信即拒绝"判为 `INVALID_INPUT`。改为解析器无关的 `(extract(epoch from now()) * 1000)::bigint`，并在 `INVALID_INPUT` 时输出只含类型/布尔的诊断日志（不含任何值）。修复后 A/B/C 全部按预期。fail-closed 语义未放宽：不可信事实仍然拒绝。

## 工程口径与边界

- 单测 12 项（策略分支、月界 `2026-09-30T16:00Z`、额度优先级、fail-closed、空模型拒绝、开关三态）；部署工具 profile 测试含新开关；定向 Lint 通过；六阶段离线构建全 0；`upgrade`+`migrate`+`up` 通过。
- 播种授权行用 `docker exec psql` 直写（**工程验证用途**，非产品流程）：当前还没有 `/admin` 授权管理界面（S4）。验收证据不得用直写数据库替代产品操作。
- 已知边界：轮前累计检查，单个在飞请求可超出自身用量；只守卫主聊天路由，embedding/插件/hetero agent 未接入；未做全仓类型门与远端 CI；未发布任何正式 Acceptance。
