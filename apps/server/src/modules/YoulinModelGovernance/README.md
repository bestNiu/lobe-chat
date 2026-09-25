# Youlin 模型授权与 token 额度（默认关闭；服务端强制）

管理员维护"哪个用户可以用哪些模型、每个模型每月多少 token、该用户每月总共多少 token"。**授权来源是平台自有表，不是 Keycloak realm role**：Keycloak 只负责认证。

## 数据与口径

- `youlin_model_grants`（`userId + model` 唯一，可选 `provider` 收窄，`enabled`，`monthly_token_limit`）与 `youlin_user_quotas`（`monthly_total_token_limit`）。迁移 `0165_youlin_model_governance.sql`，幂等风格与既有迁移一致。
- **没有授权行 = 不可调用**（deny by default）；`enabled=false` 保持禁用，不回退到其他行；`limit` 为 `null` 表示不限，**绝不把未配置当成 0**。
- 窗口是 **Asia/Shanghai 自然月**、不结转；周期边界与计数器一律取自**数据库时钟**（`now() AT TIME ZONE 'Asia/Shanghai'`），容器时钟漂移不能移动额度窗口。
- 计数来自 S1 的服务端账本 `agent_quota_usage_ledger`，按 `coalesce(input_tokens,0)+coalesce(output_tokens,0)` 汇总；cache/reasoning 是 input/output 的子集，不再相加以免重复计数。**绝不采信客户端上报的用量。**

## 判定与失败语义

- `policy.ts` 是纯函数：授权 → 每模型额度 → 用户总额度，到限即拒（含等号）；计数器缺失/负数/非整数一律 `INVALID_INPUT`，不读成 0。
- `accessControl.ts` **fail-closed**：授权表或账本读不到就返回 `ACCESS_UNAVAILABLE` 并拒绝，而不是在数据库故障期间放行无上限消费。
- 路由 `/webapi/chat/[provider]` 在**任何 provider 调用之前**判定；拒绝返回 403（`INVALID_INPUT` 为 400）+ 固定原因码，不带缓存。
- 开关 `YOULIN_MODEL_ACCESS_CONTROL` 为严格三态（未设/`0` 关，`1` 开，其他抛错），拼写错误不会静默关闭强制。

## 已知边界（不要夸大）

- 这是**轮前累计用量检查**：触顶那一轮是最后允许的一轮，单个在飞请求可能超出自身用量。并发下的硬隔离需要原子预占（`YoulinModelAccess/reservation.ts` 的骨架可复用），属后续切片。
- 当前只在主聊天路由强制；embedding、插件/工具调用、heterogeneous agent 等入口尚未接入。
- 没有授权行管理界面之前**不要打开开关**：开启后未授权模型会全部 403。`/admin`（S4）负责开户/授权/额度维护。
- `cost_usd` 与本模块无关：MVP 口径只统计与限制 token，不做美元换算。
