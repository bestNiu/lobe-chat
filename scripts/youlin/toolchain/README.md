# 固定版本的隔离工程工具链（Linux x64）

这不是全仓依赖安装，也不改变根 `package.json`、workspace 配置或应用依赖解析。它只检查当前没有第三方运行时依赖的 `YoulinSecurity/revocationGate.ts`。

## 历史安装与执行

以下记录旧轮次的工具链准备方式，不是当前宿主测试执行建议。新规则要求测试默认在 Docker，见[当前容器入口](../docker/README.md)；不要因尚未迁移某个脚本就退回宿主跑测试。

历史命令：

```bash
pnpm --dir scripts/youlin/toolchain install --frozen-lockfile --ignore-scripts
export PATH="$PWD/scripts/youlin/toolchain/node_modules/@oven/bun-linux-x64/bin:$PATH"
(cd scripts/youlin/toolchain && bun run check:security)
```

- Bun 1.4.2、pnpm 12.3.4、TypeScript 6.0.3、Vitest 5.0.0、ESLint 10.0.2、typescript-eslint 8.70.1。
- TypeScript/Vitest/ESLint 版本对应当前根清单；Bun 和隔离规则版本为本次开发工具选择，不表示企业生产选型获批。
- 工具依赖由 pnpm 安装；脚本由 Bun 执行。独立 `pnpm-lock.yaml` 固定传递依赖与完整性值，安装禁用生命周期脚本。
- 本轮仅向 npm registry 请求工具包，没有提交企业数据；未设置全局 Bun、未修改 shell 启动配置。
- 平台包明确为 Linux x64；不宣称 Windows/macOS/ARM 可运行。其他平台须单独制定工具安装方式。

## 检查范围

| 检查 | 范围 | 不包含 |
| --- | --- | --- |
| TypeScript strict | 撤权内核与 4 个编译期负向断言；noEmit、精确可选字段与索引检查 | 全仓、数据库 Adapter、JS 夹具的静态检查 |
| ESLint strictTypeChecked | 仅撤权内核；零警告；明确指定隔离配置 | 完整 LobeHub lint preset、格式化、所有脚本 |
| Vitest | 仓库现有 revocationGate.test.ts 注册的同一组 24 项行为测试 | 根 Vitest 配置中的全局 setup、真实 IdP、产品验收 |

ESLint 初次调用发现配置目录以外的文件会被忽略并只给警告，因此命令固定从仓库根执行，并设置 `--max-warnings=0`。另外运行了选择范围外 TS 文件的负向探针，确认它以非零退出，不能出现“实际未检查却绿色”的结果。

运行时仍保留不可信 JS 调用及异步输入突变的防御检查。根 preset 会删除其未启用规则的内联 suppression，因此隔离配置仅对这个边界模块关闭 `no-unnecessary-condition`，避免两套工具反复增删注释；没有为通过 lint 删除安全检查。其他 strictTypeChecked 规则保持启用。

## 与根质量门的关系

r1 曾因缺少根依赖返回 exit 2。r2 已执行 `pnpm install --ignore-scripts`，根清单/workspace 未修改；跳过生命周期脚本意味着完整应用构建/启动仍未证明。根配置的实际命令为：

```bash
bun run check --lint --test --type \
  apps/server/src/modules/YoulinSecurity/revocationGate.ts \
  apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.test.ts \
  apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.cases.mjs
```

指定文件 **Lint clean、24 tests passed**；整体 exit 1，因为全仓 `tsgo --noEmit` 被 SIGKILL。原因未确认，不直接归因 OOM。一次限时/软内存限制重试也未完成，观察到约 7.3 GiB RSS，已定向清理本次所属进程；没有修改根 tsconfig 排除项来绕过问题。

根安装的原生编译器另以严格 CLI 参数仅检查 `revocationGate.ts`，exit 0；它不是全仓类型结果。后续全仓检查须在资源隔离的 Runner 上执行，不能在共享宿主无限重试。`GOMEMLIMIT` 不是硬内存上限，超时还需强制终止兜底和进程清理核验。

最新已增加[硬资源限制 Runner](../README.md)，根 tsconfig 保持不变，但 4 GiB / 2 CPU 预算下仍在观察截止时停止；SIGTERM 清理也已验证。详见 [r3 证据](../../../docs/youlin-enterprise-ai-platform/plan/evidence/M01-001-S1/r3-manifest.json)。

新增 Drizzle Reader 使用根依赖、数据库包原生 Vitest 和定向原生类型检查，没有扩大本隔离工具链范围。当模块引用真实数据库/应用别名/插件时，必须走所属仓库质量链，不能借此小工具链掩盖集成缺口。

本轮为开发工具与内部无行为变化的规范修订，没有用户可见功能或生产接点；不把工程检查上传为产品 Acceptance。实际日志见 [M01-001-S1 工具证据](../../../docs/youlin-enterprise-ai-platform/plan/evidence/M01-001-S1/r2-manifest.json)。
