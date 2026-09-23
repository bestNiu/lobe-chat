# 固定版本的隔离工程工具链（Linux x64）

这不是全仓依赖安装，也不改变根 `package.json`、workspace 配置或应用依赖解析。它只检查当前没有第三方运行时依赖的 `YoulinSecurity/revocationGate.ts`。

## 安装与执行

从仓库根运行：

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

运行时仍保留不可信 JS 调用及异步输入突变的防御检查；只在对应几行说明静态 `no-unnecessary-condition` 规则的局限，没有为通过 lint 删除这些安全检查。其他 strictTypeChecked 规则保持启用。

## 与根质量门的关系

已实际尝试：

```bash
bun run check --test apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.test.ts
```

结果为 **exit 2 / blocked**：根 `node_modules/.bin/vitest` 缺失。隔离工具目录不会伪装成根依赖，也不改路由算法或为整个项目增加豁免。全仓 lint/type/check 仍待按批准的依赖策略安装根环境后执行。

当模块开始引用真实数据库/应用别名/插件时，应转入完整仓库质量链，不能继续扩大此小工具链来掩盖集成缺口。

本轮为开发工具与内部无行为变化的规范修订，没有用户可见功能或生产接点；不把工程检查上传为产品 Acceptance。实际日志见 [M01-001-S1 工具证据](../../../docs/youlin-enterprise-ai-platform/plan/evidence/M01-001-S1/r1-manifest.json)。
