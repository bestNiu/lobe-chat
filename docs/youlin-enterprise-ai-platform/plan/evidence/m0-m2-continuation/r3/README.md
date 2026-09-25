# R3：S1 服务端 token 计量（主聊天路径）

**结论**：主聊天路径此前完全不进账本（只有 heterogeneous-agent 的客户端 transport 会写）。本轮改为在 runtime 的 `onUsage` 回调处服务端记账，默认由 `YOULIN_USAGE_ACCOUNTING` 严格三态开关控制，并在本机 login-test 实例用真实对话验证落库。

## 采集点选择（含一次失败的设计）

- 第一版在路由外层用 `TransformStream` 解析 SSE 找 `usage`：**实测拿不到**（`usageChunkSeen=false`，账本 0 行）。原因是 runtime 会规范化 provider 分片，出去的 SSE 已不含 provider 的 usage 帧。
- 直连网关验证 `stream_options.include_usage=true` 时确实返回用量（`prompt_tokens=66, completion_tokens=37, reasoning_tokens=34`），证明不是网关问题，而是采集层级错误。
- 改用 `ChatMethodOptions.callback.onUsage`（runtime 自己请求并聚合 usage，另有 `usageMissingDiagnostics`），路由合并既有 tracing 回调后链式调用。

## 实测（真实浏览器登录 + 真实产品接口，非直连数据库）

- `POST /webapi/chat/openai`（真实会话 cookie，企业 session proof 强制生效）→ 200，流式返回。
- `agent_quota_usage_ledger` 新增 1 行：`provider=openai, model=qwen3.8-max, input_tokens=66, output_tokens=15, reasoning_tokens=11, cost_usd=NULL, user_id 非空, external_event_id 非空`。
- `cost_usd` 为 NULL 是预期：上游 `claudeModelPrice` 不认识该模型时不猜价格；MVP 口径只统计 token。
- 部署镜像 `sha256:025b8a38…`；六阶段离线构建全 0；`upgrade`+`migrate`(165 journal)+`up` 通过；`YOULIN_USAGE_ACCOUNTING=1`。

## 边界

只统计、不拦截、不限流、不改写响应。模型授权（自有授权表）、每模型/每用户 token 额度（Asia/Shanghai 自然月）、`/admin` 管理界面均为后续切片。测试用 `--check --test`（4 GiB）入口；通用 2 GiB 入口在本项目会 OOM（已记录）。截图与原始浏览器事件留在私有实例目录，未入库。
