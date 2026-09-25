# Youlin token 计量接入（默认关闭；只统计，不拦截）

企业 MVP 的计量口径是 **token**：每用户总量 + 每用户每模型用量，窗口为 Asia/Shanghai 自然月、不结转。美元预算规则保留在 `YoulinModelAccess`，等可信价格确认后再接；本模块不做金额换算、不猜价格。

## 为什么需要这个模块

上游主聊天路径 `src/app/(backend)/webapi/chat/[provider]/route.ts` 把 runtime 的流式响应直接透传给浏览器，`agent_quota_usage_ledger` 只由 heterogeneous-agent 的**客户端** transport 经 TRPC 写入。因此主聊天路径此前完全不进账本，而客户端记账不可信，不能作为额度强制依据。

## 采集点：runtime 的 `onUsage`，不是 SSE 旁路

第一版实现在路由外层用 `TransformStream` 解析 SSE 找 `usage`，**实测拿不到**：runtime 会规范化 provider 分片，出去的 SSE 已不含 provider 的 usage 帧（同一网关直连 `stream_options.include_usage=true` 时确实返回 `prompt_tokens/completion_tokens/reasoning_tokens`）。正确层级是 `ChatMethodOptions.callback.onUsage`（`packages/model-runtime/src/types/chat.ts`），runtime 自己请求 usage 并聚合，还提供 `usageMissingDiagnostics`。路由在开启计量时合并该回调，保留既有 tracing 回调并链式调用。

## 组成

- `featureConfig.ts`：严格三态开关 `YOULIN_USAGE_ACCOUNTING`（未设/`0` 关，`1` 开，其他值抛错），避免拼写错误静默改变计量行为。
- `usageMapping.ts`：`ModelTokensUsage` → 账本 token 分类（`totalInputTokens`→input、`totalOutputTokens`→output、`inputCachedTokens`→cacheRead、`inputWriteCacheTokens`→cacheWrite5m、`outputReasoningTokens`→reasoning）。**没有用量就返回 undefined，绝不写 0**（0 会静默少记消费，之后让额度不可强制）。缓存输入是输入的子集，不重复计数。
- `recordChatUsage.ts`：`newUsageOperationId()` 作为幂等键（主路径此时还没有客户端 message id；上游 `recordUsage` 按 `externalEventId` 幂等）；`writeUsageToLedger` 用**动态 import** 加载 `AgentQuotaService`，单元测试因此不会拉入数据库/模型价格依赖图；账本故障只记固定分类日志，不打断回答、不回显提示词/用户/原始数据库错误。

## 边界与验证注意

- **只统计**：不拦截、不限流、不改写响应、不做授权判断。模型授权与 token 额度是后续切片，必须读这个账本。
- 依赖 provider/runtime 回报 usage；若某网关不回报，则本轮不入账（不产生假数据），接入新网关时需核实。
- `cost_usd` 仍走上游 `claudeModelPrice`，非 Claude 模型为 `null`，不要据此推算美元消耗。
- 测试用 `dockerNode.mjs --check --test <file>`（4 GiB）；通用 2 GiB 入口在本项目会 OOM。
