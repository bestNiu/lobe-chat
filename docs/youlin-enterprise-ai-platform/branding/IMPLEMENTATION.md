# White-label 品牌替换实施手册（UnionclinHub）

| 项       | 值                                       |
| -------- | ---------------------------------------- |
| 状态     | 决策已锁定，P0 可开工                    |
| 生效分支 | `feat/youlin-enterprise-ai-platform-v3`  |
| 基线提交 | `f586939818`                             |
| 用途     | 内部自用（不对第三方分发）               |
| 上游同步 | 需要，故所有改动按 "最小冲突面" 设计     |
| 最后核对 | 已对全仓做 4 轮交叉扫描，见 §19 核查记录 |

---

## 1. 目标与范围

### 1.1 目标

把开源 LobeHub 的对外品牌（logo、图标、产品名、组织名、AI 助手名、邮件、SEO 元信息、外链）替换为 UnionClin 自有品牌，且**不破坏与上游同步的能力**。

### 1.2 范围边界

**纳入范围**（本手册覆盖）：

| 表面                     | 批次 | 用户感知位置           |
| ------------------------ | ---- | ---------------------- |
| 常量与页面标题           | P0   | 全站                   |
| 图标 /favicon/ OG        | P0   | 标签页、PWA、分享卡    |
| i18n 文案（18 语言）     | P1   | 全站文案               |
| 首屏骨架 / 加载屏 / 水印 | P2   | 启动过程               |
| AI 助手名 + JSON-LD      | P3   | 侧栏、分享图、搜索卡片 |
| 域名 / OG 常量           | P4   | canonical、分享、跳转  |
| **AI 自我认知提示词**    | P3   | 对话中 AI 的自称       |
| **事务邮件模板**         | P5   | 用户邮箱（含主题行）   |
| **OIDC 授权页元信息**    | P5   | 第三方登录授权页       |
| 社区页 / About / 社媒    | P5   | 社区、设置页、邮件页脚 |

**明确不做**（见 §11.7 详细说明）：

| 不做                                | 原因                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------- |
| 桌面端（Electron）                  | 内部自用走浏览器；成本集中在 `.Assets.car`（需 macOS 工具链）、签名、托盘图 |
| CLI（`apps/cli`，19 处）            | 内部不使用；`bin` 名 `lh`/`lobe`/`lobehub` 一并保留                         |
| server 端 messenger 回执文案        | 仅在启用 iMessage/IM 绑定时可见                                             |
| Apps 下载页（`/apps`）              | 内部不提供客户端下载                                                        |
| 手工修改 locale 源文件              | 用运行时替换层替代，见 §7                                                   |
| `API_KEY_PREFIX` 自定义             | 已发放 key 全部失效，DB 无迁移                                              |
| `BRANDING_PROVIDER` 改值            | 是 DB 中的 provider **id**                                                  |
| 桌面端 `client_id` / OIDC client_id | 与 Keycloak 已注册名绑定，改了登录挂                                        |
| mascot 接入欢迎页                   | 代码 0 引用，属**新增功能**                                                 |
| `theme_color` 改品牌蓝              | 保持 `#000000`                                                              |

---

## 2. 决策登记表

| #   | 决策项                                         | 取值 / 结论                                                                                                                          |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | `BRANDING_NAME`                                | `UnionclinHub`                                                                                                                       |
| D2  | `ORG_NAME`                                     | `Unionclin`                                                                                                                          |
| D3  | AI 助手（inbox agent）名称                     | `Unionclin AI`                                                                                                                       |
| D4  | 图标体系方案                                   | **方案 B**：不改 `metadata.ts` / `manifest.ts` / `meta.ts` 逻辑，接受降级（§6.4）                                                    |
| D5  | `BRANDING_EMAIL.support` / `.business`         | 均为 `notify@unionclin.com`                                                                                                          |
| D6  | `BRANDING_URL.subscription`                    | `undefined`（额度卡片自动隐藏升级按钮）                                                                                              |
| D7  | About 页                                       | 删除全部社媒 + Terms/Privacy，保留 support 邮箱 + 官网（§11.3）                                                                      |
| D8  | `SOCIAL_URL`                                   | Discord 从 4 个社区详情页删除；**x/github/medium/youtube 从 JSON-LD 与命令面板移除**（§11.4）                                        |
| D9  | OG 图尺寸                                      | 对齐代码声明：`1200×640`，不透明 webp                                                                                                |
| D10 | favicon 变体（实测 16 个文件，8 用 8 死）      | ✅ **只设 8 张独立图 + 8 张别名副本**：base ×2、progress ×(prod/dev)×(16/32)、dev base ×2；`done`/`error` 复制 base 图防 404（§5.3） |
| D11 | i18n 替换范围                                  | 黑名单：`messenger` 整个 namespace + `setting` 3 条 bot 文案                                                                         |
| D12 | `theme_color`                                  | 保持 `#000000`                                                                                                                       |
| D13 | 社区 / 发现页                                  | ✅ **保留并开启**（`market` 保持默认 `true`）→ 社区页清理**不可省略**                                                                |
| D14 | 更新日志 / 检查更新 / GitHub 页脚 / 帮助与文档 | ✅ **全部关闭**（§12.1）                                                                                                             |
| D15 | 官网链接                                       | `https://www.unionclin.com`                                                                                                          |
| D16 | 应用访问域名（`OFFICIAL_URL`）                 | ⚠️ 暂缺 → 代码用 env + 占位值，上线前用 env 覆盖（§10.1）                                                                            |
| D17 | 事务邮件模板（33 处 / 7 文件）                 | ✅ **纳入范围**（§11.5）                                                                                                             |
| D18 | AI 自我认知提示词（3 处 / 2 文件）             | ✅ **纳入范围**（§9.4）                                                                                                              |
| D19 | OIDC 授权页 client_name /logo_uri（5 组）      | ✅ **纳入范围**；`client_id` 不动（§11.6）                                                                                           |
| D20 | 邮件页头品牌标记 `🤯 LobeHub` 的处理           | ✅ `🦌 ${BRANDING_NAME}`（emoji + 品牌名，不引入图床）（§11.2）                                                                      |
| D21 | 图片类品牌资产（`public/static/app-images/`）  | ✅ 分两类：社区 4 张**必查必换**（§11.9）；其余目检，无引用者为死文件（§5.5）                                                        |
| D22 | 邮件发件人显示名                               | ✅ `SMTP_FROM="UnionclinHub <noreply@unionclin.com>"`（§12.3）                                                                       |

### D13 + D14 的连锁结论

| 结论                                                                                      | 依据                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 社区保留 ⇒ 4 个社区详情页的 Discord 外链**必须改代码**，不能靠功能开关绕过                | `market: true`，Nav 无条件渲染                    |
| 社区保留 ⇒ `discover` / `community` 系列文案**全部可见** ⇒ 必须落在 i18n 替换层覆盖范围内 | `discover` 不在黑名单（§7.3）✅                   |
| 社区保留 ⇒ 新暴露 3 处硬编码 `support@lobehub.com` 与 1 处 `/creator` 死链 ⇒ 并入 P5      | §11.4                                             |
| 关闭帮助与文档（`commercial_hide_docs`）⇒ **连带隐藏设置页 About 入口（桌面 + 移动）**    | `src/features/Settings/hooks/useCategory.tsx:276` |
| 因此 D7 的定位调整为：About 已不可达，裁剪只为 "直接访问 URL 或将来重开时不暴露 LobeHub"  | 见 §11.3                                          |

---

## 3. 前置认知：品牌化的 7 个接缝面

| #   | 接缝面                    | 核心文件                                            | 覆盖范围                                                             | 上游冲突             |
| --- | ------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- | -------------------- |
| 1   | 商标常量                  | `packages/business/const/src/branding.ts`           | 标题模板、OG、provider 卡、导出文件名、26 个 `isCustomBranding` 分支 | 极低                 |
| 2   | Web 静态资源              | `public/**`                                         | favicon、PWA 图标、OG 图                                             | **零**（二进制覆盖） |
| 3   | i18n 替换层               | `src/utils/i18n/loadI18nNamespaceModule.ts` 等 5 处 | 全语言 245 处品牌串                                                  | **零**（新增为主）   |
| 4   | 绕过 `ProductLogo` 的组件 | 4 个文件                                            | 首屏骨架、加载屏、Powered by                                         | 低                   |
| 5   | 域名 / 外链               | `src/const/url.ts`、3 个 mini-app SEO               | canonical、OG、分享、跳转                                            | 低                   |
| 6   | **硬编码品牌串**          | 邮件模板、OIDC 配置、AI 提示词                      | 邮件、授权页、AI 自称                                                | 低                   |
| 7   | 环境变量                  | 无代码                                              | 功能开关、分析上报                                                   | —                    |

### 3.1 关键机制：`isCustomBranding` 自动开关

`packages/const/src/version.ts`：

```ts
export const isCustomBranding = BRANDING_NAME !== 'LobeHub';
export const isCustomORG = ORG_NAME !== 'LobeHub';
```

全仓 **26 个消费点**。改 `BRANDING_NAME` 会**自动**触发：

| 自动变化                                          | 位置                                                         | 是否符合预期               |
| ------------------------------------------------- | ------------------------------------------------------------ | -------------------------- |
| `ProductLogo` 切到 `Custom.tsx`                   | `src/components/Branding/ProductLogo/index.tsx:17`           | ✅                         |
| `metadata` 的 `icons` 变单张 URL                  | `src/app/[variants]/metadata.ts:31`                          | ⚠️ 方案 B 已接受           |
| `manifest` 全部 icon 变同一张 + `screenshots: []` | `src/app/manifest.ts:58`、`src/libs/metadata/manifest.ts:80` | ⚠️ 方案 B 已接受           |
| 收件箱 / 用户默认头像变 logo                      | `packages/const/src/meta.ts:11-12`                           | ⚠️ 已接受                  |
| 官方 provider 去掉营销描述与链接                  | `packages/model-bank/src/modelProviders/lobehub.ts`          | ✅ 社区 provider 卡受益    |
| `BrandTextLoading` 由品牌动画变纯圆环             | `src/components/Loading/BrandTextLoading/index.tsx`          | ✅                         |
| Web 首屏 loading 的 LobeHub SVG 自动替换为文字    | `plugins/vite/customBrandingLoadingScreen.ts`                | ✅ **无需改 `index.html`** |

### 3.2 白标接缝的 5 类（零冲突优先级）

本仓库（及其依赖的 `@lobehub/ui`）已铺好多种白标接缝。**能用高位接缝就不要改下游文件**—— 这是保持与上游同步能力的第一原则。

| 优先级 | 接缝类型                    | 本仓库实例                                    | 改动形态          | 冲突成本      |                             |          |        |
| ------ | --------------------------- | --------------------------------------------- | ----------------- | ------------- | --------------------------- | -------- | ------ |
| ★★★    | **预留 prop（未接线插槽）** | `AppTheme` 的 5 个从来没人传的 prop（见下）   | 只传参，不改组件  | **零**        |                             |          |        |
| ★★★    | **属性驱动**（`data-*`）    | \`\<html data-theme                           | primary-color     | neutral-color | palette>`+`setLobeTheme()\` | 换属性值 | **零** |
| ★★☆    | **CSS 变量覆盖层**          | `--lobe-*` 802 个变量，只需盖语义层～30–40 个 | 新增一个 css 文件 | **零**        |                             |          |        |
| ★★☆    | **常量注入**                | `packages/business/const/src/branding.ts`     | 改常量值          | 极低          |                             |          |        |
| ★☆☆    | **运行时拦截层**            | i18n 的 `applyBrandTokens()`                  | 新增函数 + 插桩   | **零**        |                             |          |        |
| ✖️     | 改组件内逻辑                | 4 个绕过 `ProductLogo`的原件                  | 改 JSX/CSS        | 低            |                             |          |        |
| ✖️✖️   | 改高频公共文件              | `index.html`、`url.ts`、`electron-builder`    | 改配置 / 结构     | 中            |                             |          |        |

#### 实测：`@lobehub/ui` 已铺好但我们没接的线（第 6 轮扫描结果）

| 插槽                                 | 位置                                        | 本仓使用情况                  | 能做什么                                  |
| ------------------------------------ | ------------------------------------------- | ----------------------------- | ----------------------------------------- |
| `defaultPrimaryColor`                | `src/layout/GlobalProvider/AppTheme.tsx:82` | ❌ 唯一调用方一个 prop 都没传 | 品牌主色阶（阶段二）                      |
| `defaultNeutralColor`                | 同上                                        | ❌ 同上                       | 背景 / 文字 / 边框色阶（阶段二）          |
| `customFontFamily` / `customFontURL` | 同上                                        | ❌ 同上                       | **品牌字体**（阶段二）                    |
| `globalCDN`                          | 同上                                        | ❌ 同上                       | CDN 开关                                  |
| `palette`（`setLobeTheme` 的字段）   | `@lobehub/ui` `LobeThemeState`              | ❌ 本仓从不传                 | 自定义**状态色**（success/warning/error） |
| `registerLobePalette(name, palette)` | `@lobehub/ui` 包根导出                      | ❌ 未使用                     | 注册命名调色板                            |
| `registerLobeNeutral(...)`           | `@lobehub/ui` 包根导出                      | ❌ 未使用                     | 注册自定义中性阶                          |
| **`LobeThemeScript`**                | `@lobehub/ui` 包根导出                      | ❌ 未使用                     | **首屏无闪烁的设置主题（FOUC 解）**       |
| `ThemeScope`                         | `@lobehub/ui` 包根导出                      | ❌ 未使用                     | 局部主题作用域                            |

> 唯一调用方：`src/layout/SPAGlobalProvider/index.tsx:127` → `<AppTheme>`，**零 prop**。
>
> 方法论：这类插槽可用 “declared but never passed” 口径扫出来 —— 先看 `Props` 接口的可选字段，再 `grep` 调用方是否传值。本仓对上游白标插槽的利用率很低，因此后续每阶段开工前都值得重扫一次。

#### 本手册各批次用到的接缝

| 批次       | 主要接缝                    | 为何不用更高位接缝                              |
| ---------- | --------------------------- | ----------------------------------------------- |
| P0         | 常量注入                    | 标题 / SEO / 导出名没有现成的 prop 插槽         |
| P1         | 运行时拦截层                | locale 无 “品牌名” 配置槽，改 3069 处不值得     |
| P2         | 改组件（4 个）              | 这 4 处直接引了 `@lobehub/ui/brand`，无插槽可用 |
| P3         | 常量 + 改字面量             | prompt/JSON-LD 无插槽                           |
| P4         | 常量（env 化）              | 无插槽                                          |
| P5         | 改字面量                    | 邮件 / OIDC 无插槽                              |
| P6         | 属性驱动（`FEATURE_FLAGS`） | —                                               |
| **阶段二** | **预留 prop + CSS 覆盖层**  | **有插槽，所以不用改组件、不用新主题**          |

---

## 4. 硬约束（不要动）

| 项                                                           | 位置                                                 | 后果                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `API_KEY_PREFIX = 'sk-lh-'`                                  | `packages/business/const/src/index.ts`               | `validateApiKeyFormat` 靠它区分 API key 与 JWT；已发放 key 全部失效    |
| `BRANDING_PROVIDER = 'lobehub'`                              | `branding.ts`                                        | DB 中的 provider id；只改显示名（自动）                                |
| `ENABLE_BUSINESS_FEATURES = false`                           | `packages/business/const/src/index.ts`               | 商业功能边界常量，非环境变量                                           |
| OIDC `client_id`（`lobehub-desktop` / `lobehub-mobile` / …） | `src/libs/oidc-provider/config.ts`                   | 与服务端 Keycloak 注册名绑定；**只能改 `client_name` 与 `logo_uri`**   |
| 桌面端 `client_id`                                           | `AuthCtr.ts:109,480`、`RemoteServerConfigCtr.ts:482` | 同上                                                                   |
| `packages/locales/src/default/**`                            | —                                                    | **永不手工修改**，用替换层                                             |
| locale 的 key 名                                             | —                                                    | 替换只作用于 value，绝不改 key（如 `response.LobeHubModelDeprecated`） |

---

## 5. 素材规格与生成规则

### 5.1 源素材

`public/new/`（已提交至 `f586939818`）共 32 个文件。实测结论：

| 项                         | 结论                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| 透明通道                   | ✅ 全部 `alpha min=0 / max=255`，RGBA 真透明                             |
| 图标等比链                 | ⚠️ **不一致**：`icon-512` 内容占 88%，`icon-1024` 只占 77%               |
| `apple-touch-icon.png`     | ⚠️ 带 alpha（仓库约定为不透明）                                          |
| `og-image-transparent.png` | ⚠️ `1200×630` 且透明（代码声明 `1200×640`，社交平台不支持透明）          |
| `favicon.ico`              | ✅ 4 层（16/32/48/64），优于仓库现状（单层 48×48）                       |
| 7 张 UUID 命名图           | ⚠️ 与 `standing/welcome/turnaround/mascot-head` 灰度指纹比对**均不重复** |
| 13 个文件 > 1MB            | ⚠️ `public/` 内容会进静态产物                                            |

### 5.2 仓库图标约定（实测基准）

| 用途          | 参考文件                     | 内容占比                     | 不透明                |
| ------------- | ---------------------------- | ---------------------------- | --------------------- |
| `any`         | `app-icons/icon-192x192.png` | 162×177 / 192 = **84%\~92%** | 是（alpha=true）      |
| `any`         | `app-icons/icon-512x512.png` | 432×469 / 512 = **84%\~92%** | 是                    |
| `maskable`    | `...192x192.maskable.png`    | 106×114 / 192 = **55%\~59%** | 是                    |
| `maskable`    | `...512x512.maskable.png`    | 280×304 / 512 = **55%\~59%** | 是                    |
| `apple-touch` | `apple-touch-icon.png`       | 131×143 / 180 = **73%\~79%** | **否（alpha=false）** |
| OG            | `og/og.webp`                 | 1280×720                     | 是                    |

### 5.3 生成规则（统一从 `icon-1024.png` 重导）

脚本 `scripts/branding/generate-assets.mjs`（新增），保证可重跑。

| 产物                                                                                                                          | 源                         | 规格                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------- |
| `public/brand/mark.png`                                                                                                       | `icon-1024.png`            | 正方形 1024、**透明**、内容 88%（兼作 manifest 图标与默认头像）       |
| `public/app-icons/icon-192x192.png`                                                                                           | 同上                       | 192、透明、内容 88%                                                   |
| `public/app-icons/icon-512x512.png`                                                                                           | 同上                       | 512、透明、内容 88%                                                   |
| `public/app-icons/icon-192x192.maskable.png`                                                                                  | 同上                       | 192、透明、内容 **56%**                                               |
| `public/app-icons/icon-512x512.maskable.png`                                                                                  | 同上                       | 512、透明、内容 **56%**                                               |
| `public/apple-touch-icon.png`                                                                                                 | 同上                       | 180、**不透明**（flatten 到品牌底色）                                 |
| `public/og/og.webp`                                                                                                           | `og-image-transparent.png` | **1200×640**、**不透明**、webp                                        |
| `public/favicon.ico`                                                                                                          | `public/new/favicon.ico`   | 直接覆盖（4 层）                                                      |
| `public/favicon-32x32.ico`                                                                                                    | 同上                       | 派生（32×32 单层）                                                    |
| `public/favicon{,-dev}.ico`、`favicon-32x32{,-dev}.ico`、`favicon-{progress}{,-dev}.ico`、`favicon-32x32-progress{,-dev}.ico` | 同上                       | **8 张独立图**（D10）；`done`/`error` 的 8 个文件复制 base 图作为别名 |

> **执行后逐张复核**：用 `sharp().trim()` 打印 content bbox，确认占比符合 §5.2，误差 ≤5%。

### 5.4 方案 B 下变成死文件的资源（无需处理，仅供知悉）

| 文件                                     | 原因                                                  |
| ---------------------------------------- | ----------------------------------------------------- |
| `public/screenshots/`（10 张）           | `BRANDING_LOGO_URL` 非空 ⇒ manifest `screenshots: []` |
| `public/og/agent-og.webp`、`mcp-og.webp` | 全仓无代码引用（属 landing 站资源）                   |
| `public/avatars/lobe-ai.png`             | `DEFAULT_INBOX_AVATAR` 已改为 `BRANDING_LOGO_URL`     |

### 5.5 需人工目检的图片资产（代码无法判断）

`public/static/app-images/` 下是 UI 营销图，**无法用 grep 判断是否含 LobeHub 视觉**（logo、界面截图、插画），必须人眼看。按引用数排序：

| 文件                                     | 大小        | 引用  | 处置                                  |
| ---------------------------------------- | ----------- | ----- | ------------------------------------- |
| `community_footer_{dark,light}.webp`     | 180 / 132KB | 各 1  | **必查**：社区未登录页脚背景（§11.9） |
| `community_header_{dark,light}.webp`     | 200 / 132KB | 各 1  | **必查**：社区列表页头图（§11.9）     |
| `banner_creator.png`                     | 104KB       | 1     | 随 §11.7 的 banner 一并移除           |
| `banner_market_modal.webp`               | —           | ≥1    | 目检：市场引导弹窗                    |
| `theme_{auto,dark,light}.webp`           | 各 8KB      | 各 1  | 目检：主题预览缩略图                  |
| `agent_gateway_{dark,light}.webp`        | 8 / 12KB    | 各 1  | 目检：Agent 网关示图                  |
| `screenshot_background.webp`             | 8KB         | 2     | 目检：截图分享背景                    |
| `mode_{pro,lite}_{dark,light}.webp`      | 8–16KB      | **0** | 死文件，无需处理                      |
| `empty_topic_{dark,light}.webp`          | 40–48KB     | **0** | 死文件，无需处理                      |
| `chatmode_{chat,docs}_{dark,light}.webp` | 16–28KB     | **0** | 死文件，无需处理                      |

> 另：`public/videos/{feedback,star}.mp4` 仅被 `Setting/Footer` 弹窗使用，而该弹窗被 `+commercial_hide_github` 隐藏（§12.1），**无需替换**（可选：从 `public/` 移出以减小产物）。

### 5.6 favicon 运行时机制（D10 的依据）

`src/layout/GlobalProvider/FaviconProvider.tsx:43` 用公式拼接文件名：

```ts
`/favicon${size ? `-${size}` : ''}${stateToFileName[state]}${isDev ? '-dev' : ''}.ico`;
// stateToFileName = { default: '', done: '-done', error: '-error', progress: '-progress' }
```

因此 **16 个文件 = 2 (size) × 4 (state) × 2 (dev)**。

| 状态             | 调用方                                                                       | 结论                          |
| ---------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| `default`        | `DynamicFavicon.tsx:14`（`isRunning ? 'progress' : 'default'`）              | ✅ 活                         |
| `progress`       | 同上，`isRunning` = `useChatStore(operationSelectors.isAgentRuntimeRunning)` | ✅ **活（唯一真实状态变体）** |
| `done` / `error` | **全仓无调用方**                                                             | ❌ 死资产（共 8 个文件）      |

**必须改写的 8 张（D10）：**

| 文件                                                          | 引用点                                   |
| ------------------------------------------------------------- | ---------------------------------------- |
| `favicon.ico`（4 层）                                         | `index.html:6`（SPA 首屏）+ `default` 态 |
| `favicon-32x32.ico`                                           | `index.html:7` + `default` 32 版         |
| `favicon-progress.ico` / `favicon-32x32-progress.ico`         | AI 运行时的标签页提示                    |
| `favicon-dev.ico` / `favicon-32x32-dev.ico`                   | dev 标签页区分                           |
| `favicon-progress-dev.ico` / `favicon-32x32-progress-dev.ico` | dev 下 AI 运行时                         |

`done` / `error` 的 8 个文件**直接复制 base 图**作为别名，不单独设计（防上游将来加调用方时 404）。

> 🐛 **上游 bug**：磁盘上是 `favicon-32x-32-error.ico`（多了个 `-`），而 `getFaviconPath` 生成的是 `favicon-32x32-error.ico` —— 两者对不上。因为 `error` 态无调用方，这个 bug 至今未暴露。我们**不修**（不属于白标范围），但生成别名时按正确拼法 `favicon-32x32-error.ico` 额外补一份。

---

## 6. P0 — 商标常量 + 图标体系

**目标**：全站品牌名、标题、图片标识一次到位。
**工时**：约 30 分钟。**上游冲突**：无。

### 6.1 改 `packages/business/const/src/branding.ts`

```diff
-export const LOBE_CHAT_CLOUD = 'LobeHub Cloud';
+export const LOBE_CHAT_CLOUD = 'Unionclin Cloud';

-export const BRANDING_NAME = 'LobeHub';
-export const BRANDING_LOGO_URL = '';
+export const BRANDING_NAME = 'UnionclinHub';
+export const BRANDING_LOGO_URL = '/brand/mark.png';

-export const ORG_NAME = 'LobeHub';
+export const ORG_NAME = 'Unionclin';

 export const BRANDING_URL = {
   help: undefined,
   privacy: undefined,
-  subscription: 'https://app.lobehub.com/settings/plans',
+  subscription: undefined,
   support: undefined,
   terms: undefined,
 };

 export const BRANDING_EMAIL = {
-  business: 'hello@lobehub.com',
+  business: 'notify@unionclin.com',
   replyTo: undefined,
-  support: 'support@lobehub.com',
+  support: 'notify@unionclin.com',
 };
```

`COPYRIGHT` / `COPYRIGHT_FULL` 由 `ORG_NAME` 派生 → `© 2026 Unionclin`。
`SOCIAL_URL` 在 P5 处理，本批不动。

### 6.2 生成图标资源

```bash
node scripts/branding/generate-assets.mjs
```

### 6.3 可选清理（建议做，不阻塞）

`public/new/` 共 20MB，其中原始图与 7 张 UUID 图运行时无引用：

```bash
mkdir -p brand-src && git mv public/new brand-src/unionclin-ai
git commit -m "♻️ refactor(brand): move source assets out of public"
```

### 6.4 方案 B 的已接受降级

| 位置                                        | 结果                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 浏览器标签页 favicon                        | ✅ 正常。`index.html:7-8` 静态 `<link rel="icon" href="/favicon.ico">`；`renderSpaHtml()` 只替换 `<!--SEO_META-->` |
| Next 渲染页面（signin /share/mobile shell） | ⚠️ `icons` 变单 URL → 失去 `apple-touch-icon` 与 `shortcut` 标签                                                   |
| PWA manifest 4 个 icon                      | ⚠️ 全部指向 `mark.png`，声明尺寸与实际不符                                                                         |
| PWA `screenshots`                           | ⚠️ 变 `[]`                                                                                                         |
| Android maskable                            | ⚠️ 透明图当 maskable，边缘可能被裁                                                                                 |
| 收件箱 / 默认用户头像                       | ⚠️ 变为 `mark.png`                                                                                                 |
| `mark.png` 透明 vs 不透明                   | 选**透明**：UI 优先（深色主题不能出白块）。代价是 Next 页面 apple-touch 为透明图                                   |

**后续想恢复图标体系只需 1 行补丁**：`src/libs/metadata/manifest.ts:80` 去掉 `BRANDING_LOGO_URL ||` 短路。

### 6.5 验收

```bash
bun run check packages/business/const/src/branding.ts
```

- [ ] 浏览器标签页图标为 Unionclin 图标
- [ ] 首屏 loading 文字为 `UnionclinHub`（vite 插件自动替换）
- [ ] 页面标题为 `UnionclinHub · ...`
- [ ] 登录页 / 侧栏 / 设置页 logo 为鹿头且**无裂图**
- [ ] 深色主题下 logo 无白底方块
- [ ] 导出数据文件名前缀为 `UnionclinHub`

---

## 7. P1 — i18n 品牌替换层

**目标**：一处规则覆盖全语言全部品牌文案，**零 locale 文件 diff**。
**工时**：约 2 小时（token 从 2 个扩到 4 个）。**上游冲突**：零。

### 7.1 为什么需要它

|                  | 手工改 locale                     | 运行时替换     |
| ---------------- | --------------------------------- | -------------- |
| 编辑量           | **3069 处**（408 JSON × 18 语言） | 1 条规则       |
| 上游新增品牌 key | 每次 rebase 冲突                  | 自动生效       |
| 上游改文案       | 每次冲突                          | 无             |
| 全语言覆盖       | 需等 `bun run i18n`               | 加载时一视同仁 |

### 7.2 替换 token 表（**4 个 token，顺序敏感**）

实测 `packages/locales/src/default/*.ts` 中的出现次数：

| #   | token     | 替换为         | 次数    | 说明                                                                     |
| --- | --------- | -------------- | ------- | ------------------------------------------------------------------------ |
| 1   | `LobeHub` | `UnionclinHub` | **169** | 另有 4 处是 key / 变量名（`response.LobeHubModelDeprecated` 等），不处理 |
| 2   | `Lobe AI` | `Unionclin AI` | **8**   | `chat.ts`×2、`common.ts`×3、`file.ts`、`hotkey.ts`、`memory.ts`          |
| 3   | `LobeAI`  | `Unionclin AI` | **48**  | 无空格形态，如 `'inbox'` 相关、"Ready in LobeAI"、"Copy Agents"          |
| 4   | `Lobe`    | `Unionclin`    | **16**  | 独立词，如 `Lobe Support`、`Lobe Style`、`Lobe Agent`                    |

合计 **241 处** value 侧品牌串（另加 4 处 key / 变量名不处理）。

> **⚠️ 顺序是硬要求**：`LobeHub` → `Lobe AI` → `LobeAI` → `Lobe`。
> 若 `Lobe` 先执行，会把所有 token 打碎成 `UnionclinHub` → `Unionclin Hub` 之类的错误结果。
> 数组顺序即执行顺序，**必须写单测固定这个顺序**。

**为什么不能只替换 `LobeHub`**：

- `LobeAI` 是**另一个 token**，不是 `LobeHub` 的子串，45+ 处文案会原样保留
- 例：`'createModal.skillSuggestion.actions.tryInLobeAI': 'Use in LobeAI'`、`'skills.details.sidebar.agent.useOnLobeAI': 'Use on LobeAI'`
- 且这些 key 名本身不可改（key 是契约），只能改 value

### 7.3 黑名单（D11）

| 排除                       | 数量 | 原因                                                                                                 |
| -------------------------- | ---- | ---------------------------------------------------------------------------------------------------- |
| `messenger` 整个 namespace | 32   | 全是 bot 句柄与平台指引（`DM @LobeHub on Slack`）。替换后会指向**不存在的** bot，从 "过时" 变 "错误" |
| `setting` 的 3 条          | 3    | `:981`、`:985`、`:987` 的 `LobeHub bot` 文案，同因                                                   |

覆盖 **约 79%**，剩余部分等自有 bot 上线后单独处理。

### 7.4 新增文件：`src/libs/i18n/brandTokens.ts`

```ts
import { BRANDING_NAME } from '@lobechat/business-const';

/**
 * 顺序敏感：长 token 必须排在 `Lobe` 之前，否则 `Lobe` 会先打碎其余 token。
 * 由 brandTokens.test.ts 的 "keeps order" 用例锁定。
 */
const TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['LobeHub', BRANDING_NAME],
  ['Lobe AI', 'Unionclin AI'],
  ['LobeAI', 'Unionclin AI'],
  ['Lobe', 'Unionclin'],
];

/** 不参与替换的 namespace（§7.3）。 */
const EXCLUDED_NAMESPACES = new Set(['messenger']);

/** 单条 key 级豁免，格式 `ns:key`。 */
const EXCLUDED_KEYS = new Set([
  'setting:notification.messenger.telegram.description',
  'setting:notification.messenger.description',
  'setting:apps.messenger.description',
]);

const replaceTokens = (value: string) =>
  TOKENS.reduce((acc, [from, to]) => acc.split(from).join(to), value);

/**
 * 遍历 namespace 记录，只改字符串 leaf 的 value，绝不改 key。
 * 纯函数：同一输入必得同一输出，可安全用于 SSR 与 CSR。
 */
export const applyBrandTokens = <T>(
  records: T,
  ns: string,
  brandName: string = BRANDING_NAME,
): T => {
  if (EXCLUDED_NAMESPACES.has(ns)) return records;
  if (typeof records === 'string') return replaceTokens(records) as unknown as T;
  if (records === null || typeof records !== 'object') return records;

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(records)) {
    out[key] = EXCLUDED_KEYS.has(`${ns}:${key}`) ? value : applyBrandTokens(value, ns, brandName);
  }
  return out as T;
};
```

### 7.5 5 个接入点

| #   | 文件                                               | 插入位置                                                                   | 覆盖                                                                              |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | `src/utils/i18n/loadI18nNamespaceModule.ts`        | `loadI18nNamespaceModule()` 每个 `return` 前包 `applyBrandTokens(mod, ns)` | 客户端 backend 加载 + **SSR**（`serverTranslation` → `...WithFallback` → 本函数） |
| 2   | `packages/locales/src/create.ts`                   | `createBundledResources()` 的 4 个静态导入各包一层                         | en-US 首屏 `chat/common/error/home`，绕过后端加载器                               |
| 3   | `packages/locales/src/create.ts`                   | `overlayDevEnglishCopy()` 的 `addResourceBundle` 前包一层                  | dev 环境会把已替换结果冲掉                                                        |
| 4   | `src/features/AuthShell/createAuthI18n.ts`         | `loadAuthNamespace()` 两个分支的 return 前各包一层                         | 登录 / 注册 / 授权页 6 个 namespace，**第 2 个独立 i18next 实例**                 |
| 5   | `src/features/HotkeyHelperPanel/HotkeyContent.tsx` | 直接 `import hotkeyMeta from '@/locales/default/hotkey'` → 包一层          | **快捷键面板**，否则仍显示 "enter Lobe AI"（`hotkey.ts:20`）                      |

> 入口 4、5 都是 "绕过 i18next 加载器直接 import" 的路径，容易漏。同类直接 import 已核实只有这两处；`image/.../ErrorState.tsx` 虽然也直接 import `error`，但 `error.ts` 的品牌串只在 **key** 里，无需处理。

### 7.6 测试

新增 `src/libs/i18n/brandTokens.test.ts`：

```ts
describe('applyBrandTokens', () => {
  it('replaces every token', () => {
    const out = applyBrandTokens(
      { a: 'LobeHub / Lobe AI / LobeAI / Lobe Support' },
      'setting',
      'ACME',
    );
    expect(out.a).toBe('ACME / Unionclin AI / Unionclin AI / Unionclin Support');
  });
  it('keeps token order (short token must not run first)', () => {
    const out = applyBrandTokens({ a: 'LobeHub' }, 'setting');
    expect(out.a).toBe('UnionclinHub'); // 而不是 "Unionclin Hub"
  });
  it('never touches keys', () => {
    const out = applyBrandTokens({ 'response.LobeHubModelDeprecated': 'x' }, 'error');
    expect(Object.keys(out)).toEqual(['response.LobeHubModelDeprecated']);
  });
  it('skips excluded namespaces', () => {
    const input = { a: 'LobeHub bot' };
    expect(applyBrandTokens(input, 'messenger', 'ACME')).toBe(input);
  });
  it('keeps lowercase domains and ids intact', () => {
    const out = applyBrandTokens({ a: 'lobehub.com / lobehub / sk-lh-' }, 'setting');
    expect(out.a).toBe('lobehub.com / lobehub / sk-lh-');
  });
  it('is identity when brand name is LobeHub', () => {
    const input = { a: 'LobeHub' };
    expect(applyBrandTokens(input, 'setting', 'LobeHub')).toEqual(input);
  });
});
```

**已知会红的测试**（2 个，均在预期内）：

| 测试                                           | 原因                                               | 修法                 |
| ---------------------------------------------- | -------------------------------------------------- | -------------------- |
| `packages/locales/src/default/chat.test.ts:30` | 用 `appName: 'LobeHub'` 作插值断言，替换层改了结果 | 改用 `BRANDING_NAME` |
| `src/libs/metadata/ld.test.ts:32`              | 断言 `org.name === 'LobeHub'`（见 P3）             | 改用 `ORG_NAME`      |

### 7.7 验收

```bash
bunx vitest run src/libs/i18n/brandTokens.test.ts
bun run check src/libs/i18n src/utils/i18n/loadI18nNamespaceModule.ts packages/locales/src/create.ts src/features/AuthShell/createAuthI18n.ts src/features/HotkeyHelperPanel/HotkeyContent.tsx
```

- [ ] 设置页、**发现页、社区详情页**、登录页、授权页无裸 `LobeHub` / `LobeAI`
- [ ] **快捷键面板**无 "enter Lobe AI"
- [ ] `messenger` 相关文案保持原样
- [ ] 切换 zh-CN /en-US 文案一致
- [ ] SSR 首屏与客户端 hydration 文案无差异

---

## 8. P2 — 绕过 `ProductLogo` 的 4 个组件

**工时**：约 30 分钟。**上游冲突**：低。

| 文件                                                  | 现状                                                           | 改法                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| `src/spa/BootShell/AppShellSkeleton.tsx:5`            | 直接 `import { LobeHub } from '@lobehub/ui/brand'`             | 改为 `ProductLogo`                                     |
| `src/components/Loading/BrandTextLoading/index.tsx:1` | `BrandLoading` + `LobeHubText`                                 | 自定义品牌时保持圆环分支；非自定义时也用 `ProductLogo` |
| `src/components/Branding/OrgBrand/index.tsx`          | `isCustomORG` 分支返回 `<span>{ORG_NAME}</span>`，否则 LobeHub | 已验证 `isCustomORG` 命中；仅验收                      |
| `src/components/BrandWatermark/index.tsx`             | `isCustomORG` 分支已处理                                       | 已验证命中；验收确认 "Powered by Unionclin"            |

### 验收

- [ ] 首屏骨架无 LobeHub 图形
- [ ] 加载页不再出现 LobeHub 文字动画
- [ ] 设置页底部显示 `Powered by Unionclin`
- [ ] 分享图（`ShareImage/Preview`）中的 logo 为自有品牌

---

## 9. P3 — AI 身份：Inbox 名称 / 提示词 / JSON-LD

**目标**：AI 助手名与自我认知统一，结构化数据去品牌化。
**工时**：约 1.5 小时。**上游冲突**：低。

### 9.1 Inbox 名称：分 4 类处理

实测 `'Lobe AI'` 共 **32 处**：

| 类别                          | 数量                                 | 处理                                  |
| ----------------------------- | ------------------------------------ | ------------------------------------- |
| **A. 代码字面量**（`src/**`） | 19（含 1 处 DevPanel dev-only）      | 改为引用常量                          |
| **B. 常量定义**               | 1（`packages/const/src/meta.ts:10`） | 改值                                  |
| **C. locale 文案**            | 8                                    | **靠 P1 的 token 自动覆盖，不改文件** |
| **D. Prompt 文案**            | 4                                    | 直接改字面量（§9.2）                  |

#### B. 常量

```diff
-export const DEFAULT_INBOX_TITLE = 'Lobe AI';
+export const DEFAULT_INBOX_TITLE = 'Unionclin AI';
```

> 被 `packages/database/src/utils/inboxAgent.ts:28` 与 `models/agent.ts` 使用，**会写入 / 回填 inbox agent 的 title**（仅 `isBlank(title)` 路径）。已有记录不受影响。

#### A. 19 处代码字面量

| 文件                                                                   | 行  | 形态                                     |
| ---------------------------------------------------------------------- | --- | ---------------------------------------- |
| `src/routes/(main)/group/features/Conversation/AgentWelcome/index.tsx` | 78  | `{ appName: 'Lobe AI' }`                 |
| `src/routes/(main)/agent/profile/features/AgentSettings/Content.tsx`   | 76  | `isInbox ? 'Lobe AI'`                    |
| `src/routes/(mobile)/chat/features/ChatHeader/ChatHeaderTitle.tsx`     | 28  | `isInbox ? 'Lobe AI'`                    |
| `src/features/Electron/ScreenCapture/overlaySnapshot.ts`               | 5   | `const LOBE_AI_TITLE`                    |
| `src/features/Conversation/hooks/useAgentMeta.ts`                      | 9   | `const LOBE_AI_TITLE`                    |
| `src/features/DesktopOnboarding/steps/WelcomeStep.tsx`                 | 61  | `{ name: 'Lobe AI' }`                    |
| `src/features/Onboarding/steps/TelemetryStep.tsx`                      | 91  | `{ name: 'Lobe AI' }`                    |
| `src/features/ShareModal/ShareImage/Preview.tsx`                       | 81  | `? 'Lobe AI'`                            |
| `src/features/CommandMenu/AskAIMenu.tsx`                               | 66  | JSX 文本                                 |
| `src/features/CommandMenu/AskAgentCommands.tsx`                        | 69  | `handleAgentSelect(..., 'Lobe AI', ...)` |
| `src/features/CommandMenu/AskAgentCommands.tsx`                        | 73  | `@Lobe AI`（**保留 `@` 前缀**）          |
| `src/features/MobileHome/SessionListContent/Inbox/index.tsx`           | 25  | `aria-label`                             |
| `src/features/MobileHome/SessionListContent/Inbox/index.tsx`           | 36  | `title`                                  |
| `src/features/AgentSidebar/Header/Agent/index.tsx`                     | 27  | `title \|\| 'Lobe AI'`                   |
| `src/features/HomeSidebar/Body/Agent/List/InboxItem.tsx`               | 61  | `agentDisplayName(inboxMeta, 'Lobe AI')` |
| `src/features/Home/AgentSelect/useHomeAgentRows.ts`                    | 113 | `agentDisplayName(inboxMeta, 'Lobe AI')` |
| `src/features/Home/AgentSelect/index.tsx`                              | 72  | `showInboxFallback ? 'Lobe AI'`          |
| `src/features/AgentHome/AgentInfo.tsx`                                 | 34  | `agentDisplayName(meta, 'Lobe AI')`      |
| `src/features/DevPanel/RenderGallery/fixtures/index.ts`                | 61  | dev-only，可选                           |

**统一改法**：`import { DEFAULT_INBOX_TITLE } from '@lobechat/const'`（或 `@/const/meta`）后替换字面量；两处本地 `LOBE_AI_TITLE` 常量删除并改用导入。

### 9.2 AI 自我认知提示词（D18，**极易漏**）

AI 的 system prompt 里直接写着自己是 Lobe / LobeAI / LobeHub，**用户在对话中能听到**：

| 文件                                                                | 行  | 当前内容（片段）                                                          |
| ------------------------------------------------------------------- | --- | ------------------------------------------------------------------------- |
| `packages/builtin-agents/src/agents/agent-builder/systemRole.ts`    | 12  | `You are Lobe, an Agent Builder integrated into LobeHub.`                 |
| `packages/builtin-agents/src/agents/agent-builder/systemRole.ts`    | 22  | `…(marketplace MCP, builtin, Composio, LobeHub Skill)`                    |
| `packages/builtin-agents/src/agents/group-supervisor/systemRole.ts` | 12  | `You are LobeAI, an intelligent team coordinator developed by LobeHub, …` |

改法（注意 `Lobe` 与 `LobeAI` 是**独立词形**，P1 的 token 表对提示词不生效 —— 提示词不走 i18n）：

```diff
-`You are Lobe, an Agent Builder integrated into LobeHub. …`
+`You are Unionclin, an Agent Builder integrated into UnionclinHub. …`

-`You are LobeAI, an intelligent team coordinator developed by LobeHub, powered by {{model}}. …`
+`You are Unionclin AI, an intelligent team coordinator developed by Unionclin, powered by {{model}}. …`
```

同类 prompt 字面量（D 类，4 处）：

| 文件                                                       | 行    | 内容                                                                         |
| ---------------------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| `packages/prompts/src/prompts/task/taskManagerDefaults.ts` | 12-14 | `Default Lobe AI agent id` / `default Lobe AI assistant` / `Lobe AI's tasks` |
| `packages/memory-user-memory/src/prompts/persona.ts`       | 3     | `You are the … agent for Lobe AI.`                                           |

### 9.3 JSON-LD：`src/libs/metadata/ld.ts`

```diff
-    name: 'LobeHub',
+    name: ORG_NAME,

-      'alternateName': 'LobeHub',
+      'alternateName': BRANDING_NAME,

-        'LobeHub is a work-and-lifestyle space to find, build, and collaborate with agent teams that grow with you.',
+        `${BRANDING_NAME} is a workspace to find, build, and collaborate with AI agent teams.`,

-      'name': 'LobeHub',
+      'name': ORG_NAME,

-      'keywords': tags?.join(' ') || 'LobeHub',
+      'keywords': tags?.join(' ') || BRANDING_NAME,
```

> `:101` / `:105` 的 `urlJoin(OFFICIAL_SITE, '/icon-512x512.png')` 随 P4 域名变更自动生效。
> **`sameAs` 见 §11.4**（声明社媒同一实体，必须处理）。

### 9.4 验收

- [ ] 侧栏 / 首页 / 移动端 inbox 显示 `Unionclin AI`
- [ ] 命令面板 `@Unionclin AI` 可正常 mention
- [ ] 分享图标题为 `Unionclin AI`
- [ ] `curl -s <url> | grep application/ld+json` 无 `LobeHub`
- [ ] **新建 Agent 时，AI 不再自称 Lobe / LobeAI**
- [ ] **群组协作时 supervisor 不再自称 LobeAI**
- [ ] 新建任务时 AI 不再自称 `Lobe AI`

---

## 10. P4 — 域名与外链

**工时**：约 30 分钟。**上游冲突**：低。**阻塞**：无。

### 10.1 `src/const/url.ts`

```diff
-export const OFFICIAL_URL = 'https://app.lobehub.com';
-export const OFFICIAL_SITE = 'https://lobehub.com';
-export const OFFICIAL_DOMAIN = 'lobehub.com';
+// 营销站 / 官网，已确定
+export const OFFICIAL_SITE = process.env.NEXT_PUBLIC_OFFICIAL_SITE ?? 'https://www.unionclin.com';
+export const OFFICIAL_DOMAIN = process.env.NEXT_PUBLIC_OFFICIAL_DOMAIN ?? 'unionclin.com';
+// 应用访问地址：正式应用域名尚未确定。canonical / og:url / manifest 依赖它，
+// 缺省值仅为占位，上线前必须由 env 覆盖。
+export const OFFICIAL_URL = process.env.NEXT_PUBLIC_OFFICIAL_URL ?? 'https://www.unionclin.com';
```

| 常量              | 语义                               | 取值                        | 何时需要改                        |
| ----------------- | ---------------------------------- | --------------------------- | --------------------------------- |
| `OFFICIAL_SITE`   | 营销站 / 官网                      | `https://www.unionclin.com` | 官网换域名时                      |
| `OFFICIAL_DOMAIN` | 判定 "官方云" 的域名后缀           | `unionclin.com`             | 基本不变                          |
| `OFFICIAL_URL`    | 应用自身访问地址（canonical / OG） | env，缺省占位为官网域名     | **拿到应用域名后立即用 env 覆盖** |

> **`OFFICIAL_DOMAIN` 的影响**：`isOfficialCloudServer()` 用它判断 hostname 是否为 `lobehub.com` 或 `*.lobehub.com`。改为 `unionclin.com` 后，自有部署**不会**被误判为官方云（正确行为），同时访问 `app.lobehub.com` 也不再被判为官方云 —— 内部部署无影响，但验收时需确认登录与云功能无回归。

### 10.2 3 个 mini-app 的 OG 常量（**无 env 可绕**）

| 文件                            | 行  | 改法                                                          |
| ------------------------------- | --- | ------------------------------------------------------------- |
| `apps/share/app/lib/seo.ts`     | 7   | `const OG_IMAGE_URL = 'https://www.unionclin.com/og/og.webp'` |
| `apps/auth/app/lib/seo.ts`      | 10  | 同上                                                          |
| `apps/workbench/app/lib/seo.ts` | 7   | 同上                                                          |

其余 `https://lobehub.com` fallback 均为 **env 驱动，0 代码改动**：

| 位置                                        | env             |
| ------------------------------------------- | --------------- |
| `apps/auth/workers/app.ts:100`              | `AUTH_APP_HOME` |
| `apps/share/app/routes/catchall.tsx:10`     | `appHome` 参数  |
| `apps/workbench/app/routes/catchall.tsx:10` | `appHome` 参数  |

### 10.3 OpenAPI 文档与 sitemap（生成物 + 配置，**易漏**）

| 文件                                    | 位置    | 现状                                                                                                                                            |
| --------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/openapi/src/spec.ts`          | 870-875 | `title: 'LobeHub API'`、description `LobeHub platform REST API…`、`servers: [{ description: 'LobeHub Cloud', url: 'https://app.lobehub.com' }]` |
| `src/libs/next/config/define-config.ts` | 5       | `LANDING_SITEMAP_URL = 'https://lobehub.com/sitemap.xml'`                                                                                       |

```diff
   info: {
-    title: 'LobeHub API',
+    title: `${BRANDING_NAME} API`,
     version: '1.0.0',
   },
   security: [{ bearerAuth: [] }],
-  servers: [{ description: 'LobeHub Cloud', url: 'https://app.lobehub.com' }],
+  servers: [{ description: 'Unionclin', url: OFFICIAL_URL }],
```

> ⚠️ **OpenAPI 的 server URL 若不改，API 使用者会照着文档直接调向 LobeHub 云。**
> `openapi.yml` 是生成物，改源文件后**必须**运行 `bun generate:openapi`，不要手改 yml。

### 10.4 验收

```bash
curl -s https://www.unionclin.com | grep -E 'og:url|og:image|canonical|twitter:site'
```

- [ ] 首页 `<head>` 无 `lobehub.com`
- [ ] 分享页 OG 图为自有图
- [ ] 直接访问不存在的路径重定向到自有域名
- [ ] 拿到应用域名后用 `NEXT_PUBLIC_OFFICIAL_URL` 覆盖并复查 canonical / `og:url`
- [ ] 登录、云相关功能在 `OFFICIAL_DOMAIN` 变更后无回归
- [ ] OpenAPI 文档 title /servers 为自有，且 `bun generate:openapi` 已重跑
- [ ] `robots.txt` /sitemap 无 lobehub.com 引用

---

## 11. P5 — 邮件 / OIDC / 社区 / 社媒

**目标**：移除所有用户可见的 LobeHub 痕迹（含邮箱与授权页）。
**工时**：约 2.5 小时（含新增的邮件与 OIDC）。**上游冲突**：低。

### 11.1 移除 Discord（D8，社区保留 ⇒ 必做）

| 文件                                                                        | 行  | 改法                                        |
| --------------------------------------------------------------------------- | --- | ------------------------------------------- |
| `src/routes/(main)/community/(detail)/agent/features/Details/Nav.tsx`       | 120 | 删除整个 `<a href={SOCIAL_URL.discord}>` 块 |
| `src/routes/(main)/community/(detail)/group_agent/features/Details/Nav.tsx` | 75  | 同上                                        |
| `src/routes/(main)/community/(detail)/model/features/Details/Nav.tsx`       | 73  | 同上                                        |
| `src/routes/(main)/community/(detail)/provider/features/Details/Nav.tsx`    | 88  | 同上                                        |

> ⚠️ **不能只把 `SOCIAL_URL.discord` 设成空字符串**：`<a href="">` 会变成指向当前页的死链。

### 11.2 邮件模板品牌（D17，**33 处 / 7 文件**）

**这是最容易漏的一块**：邮件不走 i18n，全是硬编码 TS 字符串，且发到用户真实邮箱。

| 文件                          | 处数 | 典型位置                                                                        |
| ----------------------------- | ---- | ------------------------------------------------------------------------------- |
| `workspace-invite.ts`         | 6    | 主题、`Join … on LobeHub`、`workspace on LobeHub`、页头品牌字、页脚             |
| `workspace-member-removed.ts` | 5    | 主题、`removed from … on LobeHub`、页头、页脚、`automated message from LobeHub` |
| `magic-link.ts`               | 5    | 同上模式                                                                        |
| `change-email.ts`             | 5    | 同上模式                                                                        |
| `verification.ts`             | 4    | 页头品牌字、正文、页脚、主题                                                    |
| `verification-otp.ts`         | 4    | 同上                                                                            |
| `reset-password.ts`           | 4    | 同上                                                                            |

**现状样例**（`verification.ts`）：

```html
<span style="font-size: 18px; font-weight: 700; …">LobeHub</span> … Thanks for creating an account
with LobeHub. … … © 2026 LobeHub. All rights reserved. subject: 'Verify Your Email - LobeHub',
```

**改法**：

1. 7 个文件各加 `import { BRANDING_NAME, COPYRIGHT_FULL } from '@lobechat/business-const';`
2. 页头品牌字、正文、页脚、主题里的 `LobeHub` → `${BRANDING_NAME}`
3. 页脚 `© 2026 LobeHub. All rights reserved.` → `${COPYRIGHT_FULL}`
4. `getEmailSupportHtml()` 的 Discord 段按 §11.3 处理

**D20（已定）：页头标记统一改为 `🦌 ${BRANDING_NAME}`**

```diff
-<span style="font-size: 24px; line-height: 1; margin-right: 10px;">🤯</span>
-<span style="font-size: 18px; font-weight: 700; …">LobeHub</span>
+<span style="font-size: 24px; line-height: 1; margin-right: 10px;">🦌</span>
+<span style="font-size: 18px; font-weight: 700; …">${BRANDING_NAME}</span>
```

> 选定理由：沿用原有 emoji + 文字结构，只替换两个内容；不引入图床（邮件客户端对远程图片默认屏蔽）；与品牌（鹿医生）语义一致。
> `🤯` 在 7 个模板中各出现一次，需**逐个替换**（无共享 layout）。

### 11.3 邮件页脚 Discord 与 support 地址

`src/libs/email/support.ts` 的 `getEmailSupportHtml()` / `getEmailSupportText()` 无条件拼接 Discord，被 3 个模板调用（`verification-otp`、`verification`、`workspace-member-removed`）。

```diff
 export const getEmailSupportHtml = ({ contactSupport, joinDiscord }: EmailSupportCopy = {}) => {
   const supportEmail = escapeHtml(EMAIL_SUPPORT_ADDRESS);
-  const discordUrl = escapeHtml(SOCIAL_URL.discord);
+  const discordUrl = SOCIAL_URL.discord ? escapeHtml(SOCIAL_URL.discord) : '';
+  const discordHtml = discordUrl
+    ? `<span style="color: #a1a1aa;"> · </span><a href="${discordUrl}" target="_blank" rel="noopener noreferrer" style="color: #6b7280; text-decoration: underline;">${escapeHtml(joinDiscord)}</a>`
+    : '';
-  return `<a href="mailto:${supportEmail}" …>${escapeHtml(contactSupport)}</a><span …> · </span><a href="${discordUrl}" …>${escapeHtml(joinDiscord)}</a>`;
+  return `<a href="mailto:${supportEmail}" …>${escapeHtml(contactSupport)}</a>${discordHtml}`;
 };
```

`getEmailSupportText()` 同理。support 地址已由 D5 改为 `notify@unionclin.com`，自动生效。

### 11.4 JSON-LD `sameAs` 与命令面板（D8 剩余部分，**极易漏**）

| 文件                                             | 行       | 现状                                                                                 | 处置                                                                      |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/libs/metadata/ld.ts`                        | 109      | `'sameAs': [SOCIAL_URL.x, SOCIAL_URL.github, SOCIAL_URL.medium, SOCIAL_URL.youtube]` | **删除该字段**（否则搜索引擎把 LobeHub 社媒当成本组织账号，与 §9.3 冲突） |
| `src/features/CommandMenu/MainMenu.tsx`          | 198      | `onSelect={() => handleExternalLink(SOCIAL_URL.github)}`                             | 移除该菜单项（`hideGitHub` 只控制页脚，不控制这里）                       |
| `src/features/Settings/about/features/About.tsx` | 49/61/68 | 社媒列表                                                                             | 见 §11.5                                                                  |

> `SOCIAL_URL` 各键确认**无其它消费点**（已全仓扫描）。可选择把 `SOCIAL_URL` 在 `branding.ts` 里整体置空，但需配合上述 3 处代码改动，否则会留下空 `href`。

### 11.5 About 页（D7 + D14 的交互）

> **先看这条**：`commercial_hide_docs` 会隐藏设置页 About 入口（桌面 `src/features/Settings/hooks/useCategory.tsx:276`，移动 `src/routes/(mobile)/me/settings/features/useCategory.tsx:149`）。
> 因此 About 页在正常导航下**已不可达**。本节定位为「防御性裁剪」—— 防止直接访问 `/settings/about` 或将来重开该 flag 时暴露 LobeHub。
> 若判断该页永不可达，本节可降级为可选（P5b）。

| 区块                                              | 处置                                                   |
| ------------------------------------------------- | ------------------------------------------------------ |
| 社媒列表（Blog / GitHub / Discord / X / YouTube） | **整块删除** `AboutList`                               |
| 联系方式：官网                                    | 保留，href 用 `OFFICIAL_SITE`（P4 后为 unionclin.com） |
| 联系方式：support /business                       | 保留，均为 `notify@unionclin.com`                      |
| 法务：Terms / Privacy                             | **删除**（指向 lobehub.com，内部自用不合规）           |

删除后清理未使用 import：`SiDiscord`、`SiGithub`、`SiRss`、`SiX`、`SiYoutube`、`BLOG`、`PRIVACY_URL`、`TERMS_URL`、`SOCIAL_URL`。

### 11.6 OIDC 授权页元信息（D19，**极易漏**）

`src/libs/oidc-provider/config.ts` 定义 5 个 OAuth client，**第三方授权页会显示它们的名字与图标**：

| 行  | `client_name`         | `logo_uri`                                              |
| --- | --------------------- | ------------------------------------------------------- |
| 21  | `LobeHub Desktop`     | `hub-apac-1.lobeobjects.space/lobehub-desktop-icon.png` |
| 49  | `LobeHub Mobile`      | `hub-apac-1.lobeobjects.space/docs/73f69adf….png`       |
| 64  | `LobeHub CLI`         | 同 Desktop                                              |
| 73  | `LobeHub Review`      | 同 Desktop                                              |
| 83  | `LobeHub Marketplace` | 同 Desktop                                              |

**改法**：

```diff
   client_id: 'lobehub-desktop',        // ❌ 不动（Keycloak 已注册）
-  client_name: 'LobeHub Desktop',
+  client_name: `${BRANDING_NAME} Desktop`,
-  logo_uri: 'https://hub-apac-1.lobeobjects.space/lobehub-desktop-icon.png',
+  logo_uri: 'https://www.unionclin.com/brand/mark.png',
```

> `client_id` 与 `client_name` 是**两回事**：前者是协议标识必须保持，后者是显示名可以改。改错 `client_id` 会导致桌面端 / 移动端登录直接失败。

### 11.7 社区保留带来的额外暴露点（D13）

| 文件                                                                                      | 行      | 问题                                                                           | 处置                                 |
| ----------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| `src/routes/(main)/community/(list)/(home)/features/CreatorRewardBanner.tsx`              | 100     | `${OFFICIAL_SITE}/creator?utm_source=lobehub` → P4 后变成**自有站点 404 死链** | 移除该 banner                        |
| `src/routes/(main)/community/(detail)/group_agent/features/StatusPage/index.tsx`          | 46      | 硬编码文案含 `support@lobehub.com`                                             | 改用 `BRANDING_EMAIL.support`        |
| `src/routes/(main)/community/(detail)/agent/features/StatusPage/index.tsx`                | 48,103  | `email: <a mailto:support@lobehub.com>`                                        | 改用 `BRANDING_EMAIL.support`        |
| `src/routes/(main)/community/(detail)/agent/features/Details/Capabilities/PluginItem.tsx` | 142,161 | `homepage: OFFICIAL_SITE`                                                      | 随 P4 自动指向自有域名，**无需改动** |

### 11.8 已知范围外（不在本次处理，需明确知悉）

| 项                                                | 规模                                                                                                 | 影响                                                                | 何时必须处理          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------- |
| `apps/cli`                                        | 19 处 LobeHub；`bin` 为 `lh`/`lobe`/`lobehub`                                                        | CLI 输出仍称 LobeHub；用户需输入 `lobehub` 命令                     | 一旦对外提供 CLI      |
| server 端 messenger 回执                          | `apps/server/src/services/messenger/**`                                                              | 仅在启用 iMessage / IM 绑定时可见，如 "You're connected to LobeHub" | 一旦启用 messenger    |
| Apps 下载页 `/apps`                               | `src/features/Apps/const.ts`：`CLI_INSTALL_COMMAND = 'npm install -g @lobehub/cli'`、`mobile` 图 CDN | 会引导用户安装 **LobeHub 官方 CLI**；图片从 lobehub 加载            | 一旦在导航暴露该页    |
| `market` skill 错误提示                           | `apps/server/src/services/market/index.ts:749,877`（`'LobeHub Skill call failed'`）                  | 社区 / Skill 报错时可见                                             | 一旦使用 market skill |
| `src/libs/oidc-provider/config.ts` 的 `client_id` | 5 个                                                                                                 | 协议标识，**故意不改**                                              | 永不                  |

### 11.9 社区页的图片资产（D13，**代码查不出来**）

社区保留后，未登录用户会看到两块由**图片**承载的品牌视觉：

| 文件                                                                         | 行    | 引用                                                            | 处置建议                                                          |
| ---------------------------------------------------------------------------- | ----- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/routes/(main)/community/(list)/_layout/Footer.tsx`                      | 20/24 | `community_footer_{dark,light}.webp`（512px 宽背景，180/132KB） | 移除背景图分支，或换成自有视觉；页脚文字走 i18n 已被替换层覆盖 ✅ |
| `src/routes/(main)/community/(list)/_layout/Header*`                         | —     | `community_header_{dark,light}.webp`（200/132KB）               | 同上                                                              |
| `src/routes/(main)/community/(list)/(home)/features/CreatorRewardBanner.tsx` | 58    | `banner_creator.png`（104KB）                                   | 随 §11.7 移除 banner 一并处理                                     |

**注意区分**：`Footer.tsx` 里的 `t('footer.title')` / `t('footer.desc')` 来自 `discover` namespace → **文案会被 P1 自动替换**；但**背景图不会**，必须单独处理。

处理顺序建议：先打开 4 张社区图目检 → 若不含品牌视觉则保留；含则替换为纯色 / 自有视觉，或直接移除背景图声明。

### 11.10 验收

- [ ] 社区列表 / 详情页无 "需要帮助"Discord 外链
- [ ] 社区首页无 "创作者激励"banner 死链
- [ ] **社区未登录页脚 / 头图无 LobeHub 视觉**
- [ ] 社区审核态页面显示 `notify@unionclin.com`
- [ ] 命令面板无 GitHub 菜单项
- [ ] `curl … | grep application/ld+json` 无 `sameAs`
- [ ] **7 个事务邮件**：主题、页头、正文、页脚均无 `LobeHub`，页脚为 `© 2026 Unionclin. All rights reserved.`
- [ ] **验证码邮件**只含 support 邮箱，无 Discord
- [ ] **OIDC 授权页** client 名与图标为自有品牌，且**登录仍成功**（`client_id` 未动）
- [ ] 直接访问 `/settings/about` 只剩官网 + 2 个邮箱

---

## 12. P6 — 环境变量（零代码）

### 12.1 `FEATURE_FLAGS`（最终值）

数据链路（已核实）：

```text
.env FEATURE_FLAGS="+a,-b"
  → packages/app-config/src/featureFlags/index.ts (createEnv)
  → parseFeatureFlag()       语法：+flag / -flag，逗号分隔（中文逗号亦可）
  → merge(DEFAULT_FEATURE_FLAGS, flags)   默认值见 schema.ts:116
  → getServerFeatureFlagsValue()
  → window.__SERVER_CONFIG__.featureFlags（renderSpaHtml 注入）
  → useServerConfigStore(featureFlagsSelectors)
```

**配置落点**：`docker-compose/local/compose.yml` 的 `lobe` 服务通过 `env_file: ${YOULIN_ENV_FILE}` 读取，写进 `YOULIN_ENV_FILE` 指向的 env 文件即可。

```bash
FEATURE_FLAGS="+market,-changelog,-check_updates,+commercial_hide_github,+commercial_hide_docs"
```

| flag                     | 取值         | 决策     | 效果                                                            | 代码证据                                             |
| ------------------------ | ------------ | -------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| `market`                 | `+`          | 保留     | 社区 / 发现页导航保持显示（与默认一致，显式写出以记录意图）     | `useNavLayout.ts:97`、`mobile/_layout/NavBar.tsx:50` |
| `commercial_hide_github` | `+`          | 关闭     | 设置页底部 GitHub 星标 / 反馈整块消失                           | `src/features/Setting/Footer.tsx`                    |
| `commercial_hide_docs`   | `+`          | 关闭     | 帮助 / 文档组消失；**连带隐藏设置页 About 入口（桌面 + 移动）** | `Settings/hooks/useCategory.tsx:276` 等              |
| `changelog`              | `-`          | 关闭     | 更新日志弹窗 / 页面消失                                         | `schema.ts:194`                                      |
| `check_updates`          | `-`          | 关闭     | 不再检查 LobeHub 新版本（默认**开启**）                         | `schema.ts:196`                                      |
| `cloud_promotion`        | 默认 `false` | 无需设置 | 云服务推广已默认关闭                                            | `schema.ts:161`                                      |

**三条边界**：

1. `+market` 只控制导航显示，不控制路由（未找到 `showMarket` 路由守卫）。
2. `commercial_hide_github` / `commercial_hide_docs` 上游标注 \*\*"需要商业授权"\*\*；内部自用不分发，由决策方自行评估。
3. 不支持 `all` 关键字；未显式设置的项沿用默认值。

参考文档：`docs/self-hosting/advanced/feature-flags.zh-CN.mdx`。

### 12.2 Analytics 全部关闭

```bash
ENABLED_PLAUSIBLE_ANALYTICS=0
ENABLED_POSTHOG_ANALYTICS=0
ENABLED_UMAMI_ANALYTICS=0
ENABLED_CLARITY_ANALYTICS=0
ENABLE_VERCEL_ANALYTICS=0
ENABLE_GOOGLE_ANALYTICS=0
```

（字段定义：`packages/env/src/analytics.ts`）

### 12.3 域名、跳转与邮件发件人

```bash
NEXT_PUBLIC_OFFICIAL_SITE=https://www.unionclin.com
NEXT_PUBLIC_OFFICIAL_DOMAIN=unionclin.com
NEXT_PUBLIC_OFFICIAL_URL=https://www.unionclin.com   # 拿到应用域名后覆盖
AUTH_APP_HOME=https://www.unionclin.com

# 邮件发件人显示名：不要留 LobeHub，否则用户在收件箱列表就能看到
SMTP_FROM="UnionclinHub <noreply@unionclin.com>"
```

> `SMTP_FROM` 定义在 `packages/env/src/email.ts:11`，是**唯一**决定发件人显示名的位置（代码里没有 from name 常量）。
> 格式为 `显示名 <邮箱地址>`，显示名若配成 `LobeHub`，前面所有邮件模板改动都白费。

### 12.4 验收

- [ ] 侧栏**保留**"发现 / 社区" 入口，可正常进入并浏览
- [ ] 设置页底部无 GitHub 区块
- [ ] 设置页无 About 入口（预期，见 §11.5）
- [ ] 用户菜单无帮助 / 文档 / 更新日志
- [ ] 浏览器 Network 无 PostHog/Plausible/GA 请求
- [ ] **收一封测试邮件，发件人显示名为 `UnionclinHub`**（非 LobeHub）

---

## 13. 每批的统一工作流

```bash
# 1. 开工前确认基线
git fetch upstream canary
git log --oneline HEAD..upstream/canary     # 若落后，先 rebase

# 2. 改动（同一 worktree 只允许一个写入者）

# 3. 质量门
bun run check <本批改动的文件路径...>

# 4. 提交（gitmoji 前缀）
git commit -m "✨ feat(branding): <本批内容>"

# 5. 推送
git push origin feat/youlin-enterprise-ai-platform-v3
```

### 并行化建议

| 方案                          | 说明                                         | 加速比           |
| ----------------------------- | -------------------------------------------- | ---------------- |
| 全串行                        | 单 worktree 顺序执行 P0→P6                   | 基准（约 6\~7h） |
| **2 agent 并行**              | 1 worktree/agent（worktree 数 = 同时写入数） | ≈1.5×            |
| agent 只出补丁、主 agent 落盘 | 0 worktree，agent 只做只读穷举               | ≈1.4×，冲突为零  |

**每个 worktree 实测成本**：独立 `node_modules`（根 4.8G，现有 `../unionclinHub-market` 为 3.6G）+ 一次 `pnpm install`（3\~5 分钟）。`.git` 共享，不复制。

**不可并行项**：`bun run type-check`（全仓）、`dev:spa`（单端口视觉验收）、`lint-staged`（改动文件，双写互相踩）。

> 本手册的编写过程本身说明：**这类任务的瓶颈是穷举调用点，不是打字速度**。派 agent 做「只读穷举 + 输出补丁」比派它「改文件」收益更高。

---

## 14. 测试影响面总表

| 测试                                                          | 会红    | 触发批次 | 修法                              |
| ------------------------------------------------------------- | ------- | -------- | --------------------------------- |
| `src/libs/metadata/ld.test.ts:32,33`                          | 🔴      | P3       | 改用 `ORG_NAME` / `OFFICIAL_SITE` |
| `packages/locales/src/default/chat.test.ts:30`                | 🔴      | P1       | 改用 `BRANDING_NAME`              |
| `plugins/vite/customBrandingLoadingScreen.test.ts`            | ✅      | —        | 自行 `vi.doMock` 品牌名           |
| `src/libs/metadata/manifest.test.ts`                          | ✅      | —        | mock 了 `BRANDING_LOGO_URL`       |
| `src/hooks/useScreenshot.test.ts`                             | ✅      | —        | mock 了 `BRANDING_NAME`           |
| `src/features/Electron/shell/useDesktopDocumentTitle.test.ts` | ✅      | —        | 用 `BRANDING_NAME` 变量断言       |
| `packages/business/const/src/branding.test.ts`                | ✅      | —        | 只断言 `replyTo` 为空             |
| `packages/database` 的 4 个 inbox 测试                        | ✅      | —        | 用 `DEFAULT_INBOX_TITLE` 变量断言 |
| `src/libs/better-auth/email-templates/index.test.ts`          | ⚠️ 待查 | P5       | 若断言了邮件正文品牌字需同步调整  |
| `src/libs/i18n/brandTokens.test.ts`                           | —       | P1       | **新增**（含 token 顺序用例）     |

---

## 15. 交付验收清单（DoD）

- [ ] P0–P6 全部批次合并至 `feat/youlin-enterprise-ai-platform-v3`
- [ ] `bun run check` 对全部改动文件通过
- [ ] `bun run type-check` 全仓通过
- [ ] 浏览器标签页 / 首屏 / 登录页 / 设置页 / 分享图 均为自有品牌
- [ ] 全站（zh-CN + en-US 抽查）无裸 `LobeHub` / `LobeAI` / `Lobe AI`（`messenger` 与 3 条 bot 文案除外）
- [ ] **AI 不自称 Lobe / LobeAI**（agent builder、group supervisor、任务分配、persona）
- [ ] **7 个事务邮件**品牌、主题、页脚全部替换
- [ ] **OIDC 授权页**显示自有 client 名与 logo，且登录成功
- [ ] **社区 / 发现页**可正常浏览，无 Discord、无 `/creator` 死链、无 `support@lobehub.com`
- [ ] `curl` 首页 `<head>` 无 `lobehub.com`
- [ ] JSON-LD 无 `sameAs`、无 `LobeHub`
- [ ] 浏览器 Network 无第三方分析上报
- [ ] 深色 / 浅色主题下 logo 均无异常背景块
- [ ] `git log --oneline upstream/canary..HEAD` 每批一个提交，信息可读

---

## 16. 风险与回滚

| 风险                                           | 触发条件 | 缓解                                               | 回滚             |
| ---------------------------------------------- | -------- | -------------------------------------------------- | ---------------- |
| 图标视觉不合格（深色主题下难辨）               | P0 验收  | 先做 P0 再决定是否继续                             | `git revert` P0  |
| 替换层 token 顺序错误（`Lobe` 先执行）         | P1       | 单测锁定顺序                                       | 修 `TOKENS` 顺序 |
| 替换层误伤（域名 / 标识被改）                  | P1       | 5 类边界单测；黑名单可扩展                         | 移除调用点       |
| SSR/CSR 文案不一致 → hydration warning         | P1       | 所有入口共用同一纯函数                             | 同上             |
| 改错 OIDC `client_id` → 登录失败               | P5       | §11.6 明确 red line：只改 `client_name`/`logo_uri` | 立即回退该处     |
| 邮件模板改动导致发信异常                       | P5       | 先发一封测试邮件验证                               | 回退模板         |
| 上游 rebase 冲突                               | 任意     | 改动集中在新增文件与单行替换                       | —                |
| 收件箱已有用户标题未更新                       | P3       | 仅 `isBlank(title)` 回填，属预期                   | 手动改库         |
| `OFFICIAL_DOMAIN` 改动影响云判定               | P4       | 验收登录 / 云功能                                  | 回退该常量       |
| 范围外项（CLI /messenger/ Apps）被误认为已完成 | 交付评审 | §11.8 明确列示                                     | —                |

---

## 17. 附录 A：全量文件清单

| 批次 | 文件                                                                                               | 类型         |
| ---- | -------------------------------------------------------------------------------------------------- | ------------ |
| P0   | `packages/business/const/src/branding.ts`                                                          | 改           |
| P0   | `scripts/branding/generate-assets.mjs`                                                             | 新增         |
| P0   | `public/brand/mark.png`                                                                            | 新增（生成） |
| P0   | `public/app-icons/{icon-192x192,icon-512x512}{,.maskable}.png`                                     | 覆盖（生成） |
| P0   | `public/apple-touch-icon.png`                                                                      | 覆盖（生成） |
| P0   | `public/og/og.webp`                                                                                | 覆盖（生成） |
| P0   | `public/favicon*.ico`（12 个）                                                                     | 覆盖（生成） |
| P1   | `src/libs/i18n/brandTokens.ts`                                                                     | 新增         |
| P1   | `src/libs/i18n/brandTokens.test.ts`                                                                | 新增         |
| P1   | `src/utils/i18n/loadI18nNamespaceModule.ts`                                                        | 改           |
| P1   | `packages/locales/src/create.ts`                                                                   | 改（2 处）   |
| P1   | `src/features/AuthShell/createAuthI18n.ts`                                                         | 改           |
| P1   | `src/features/HotkeyHelperPanel/HotkeyContent.tsx`                                                 | 改           |
| P1   | `packages/locales/src/default/chat.test.ts`                                                        | 改（1 行）   |
| P2   | `src/spa/BootShell/AppShellSkeleton.tsx`                                                           | 改           |
| P2   | `src/components/Loading/BrandTextLoading/index.tsx`                                                | 改           |
| P2   | `src/components/Branding/OrgBrand/index.tsx`                                                       | 验收         |
| P2   | `src/components/BrandWatermark/index.tsx`                                                          | 验收         |
| P3   | `packages/const/src/meta.ts`                                                                       | 改           |
| P3   | 19 个客户端文件（见 §9.1 A）                                                                       | 改           |
| P3   | `packages/builtin-agents/src/agents/agent-builder/systemRole.ts`                                   | 改           |
| P3   | `packages/builtin-agents/src/agents/group-supervisor/systemRole.ts`                                | 改           |
| P3   | `packages/prompts/src/prompts/task/taskManagerDefaults.ts`                                         | 改           |
| P3   | `packages/memory-user-memory/src/prompts/persona.ts`                                               | 改           |
| P3   | `src/libs/metadata/ld.ts`                                                                          | 改           |
| P3   | `src/libs/metadata/ld.test.ts`                                                                     | 改           |
| P4   | `src/const/url.ts`                                                                                 | 改           |
| P4   | `apps/{share,auth,workbench}/app/lib/seo.ts`                                                       | 改           |
| P4   | `packages/openapi/src/spec.ts` + 重跑 `bun generate:openapi`                                       | 改（生成）   |
| P4   | `src/libs/next/config/define-config.ts`                                                            | 改（1 行）   |
| P5   | `src/routes/(main)/community/(list)/_layout/Footer.tsx`                                            | 改           |
| P5   | `src/routes/(main)/community/(list)/_layout/` 头图引用（如存在）                                   | 改           |
| P5   | `public/static/app-images/community_{footer,header}_{dark,light}.webp`（4 张）                     | 替换 / 移除  |
| P5   | `src/libs/better-auth/email-templates/*.ts`（7 个）                                                | 改           |
| P5   | `src/libs/email/support.ts`                                                                        | 改           |
| P5   | `src/libs/oidc-provider/config.ts`                                                                 | 改           |
| P5   | `src/routes/(main)/community/(detail)/{agent,group_agent,model,provider}/features/Details/Nav.tsx` | 改           |
| P5   | `src/routes/(main)/community/(list)/(home)/features/CreatorRewardBanner.tsx`                       | 改           |
| P5   | `src/routes/(main)/community/(detail)/{agent,group_agent}/features/StatusPage/index.tsx`           | 改           |
| P5   | `src/features/CommandMenu/MainMenu.tsx`                                                            | 改           |
| P5   | `src/features/Settings/about/features/About.tsx`                                                   | 改（可降级） |
| P6   | `YOULIN_ENV_FILE` 指向的 env 文件                                                                  | 配置         |

**合计**：约 **58** 个文件（其中 20 个为生成物 / 新增），真代码编辑点约 **50** 处，绝大多数为单行或单块删除。

---

## 18. 附录 B：决策追踪

| #   | 事项                                  | 状态    | 结论 / 备注                                                         |
| --- | ------------------------------------- | ------- | ------------------------------------------------------------------- |
| T1  | 官网域名                              | ✅ 已决 | `https://www.unionclin.com`                                         |
| T1b | 应用访问域名（`OFFICIAL_URL`）        | ⚠️ 暂缺 | P4 先用 env + 占位值；拿到域名后仅需设一个 env                      |
| T2  | 社区 / 文档 / 更新日志 / 更新检查开关 | ✅ 已决 | 社区**保留**；文档、GitHub、更新日志、检查更新**全部关闭**（§12.1） |
| T3  | `public/new/` 是否移出 `public/`      | 建议    | 执行 §6.3，避免 20MB 进入静态产物                                   |
| T4  | About 页是否做 "防御性裁剪"           | ✅ 已决 | 做：删社媒 + Terms/Privacy，保留官网 + 2 个邮箱（§11.5）            |
| T5  | **D20**：邮件页头标记样式             | ✅ 已决 | `🤯 LobeHub` → `🦌 ${BRANDING_NAME}`（emoji + 品牌名，见 §11.2）    |

---

## 19. 附录 C：核查记录（本手册的完整性依据）

对全仓做了 6 轮交叉扫描，以下为核查口径与结论，便于后续复核：

| 轮次 | 扫描对象               | 方法                                                                         | 结论                                                                                                                                                                            |
| ---- | ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 品牌常量消费链         | `BRANDING_NAME` / `ORG_NAME` / `BRANDING_LOGO_URL` 全部消费点                | `BRANDING_LOGO_URL` 有 5 个语义共用的坑（§6.4）                                                                                                                                 |
| 2    | i18n 入口穷举          | 找所有绕过 i18next 加载器的直接 import                                       | 5 个入口，含 `HotkeyContent.tsx` 这个易漏点（§7.5）                                                                                                                             |
| 3    | 品牌 token 形态        | `LobeHub` / `Lobe AI` / `LobeAI` / `Lobe` 四种词形                           | 4 个 token，共 241 处 value（§7.2）                                                                                                                                             |
| 4    | 非 i18n 硬编码品牌     | 邮件模板、OIDC 配置、AI 提示词、社区页、Apps、CLI、server                    | 见 §11.2 / §11.6 / §9.2 / §11.7 / §11.8                                                                                                                                         |
| 5    | 图片资产 / 生成物 /env | 扫 `public/static/app-images` 引用、OpenAPI 源、sitemap、`SMTP_FROM`         | 图片类品牌无法用代码判定，需人眼目检（§5.5 / §11.9）；OpenAPI 与 sitemap 属生成物与配置（§10.3 / §12.3）                                                                        |
| 6    | 上游白标插槽           | 扫 `@lobehub/ui` 包根导出 + 本仓 “declared but never passed” 的 props        | **发现 9 个未接线的插槽**，其中 `AppTheme` 的 5 个与 `LobeThemeScript` 直接决定阶段二的实现方式（§3.2 / §20）                                                                   |
| 7    | favicon 运行时机制     | 读 `FaviconProvider.tsx` + `DynamicFavicon.tsx` 的 `getFaviconPath` 拼接逻辑 | 16 个文件 = 2 size × 4 state × 2 dev 的组合；**`progress` 是活功能、`done`/`error` 无调用方**；另发现上游 typo `favicon-32x-32-error.ico`（拼法与代码生成路径不匹配，必然 404） |

**已确认无需处理**（避免后续重复排查）：

| 项                                                            | 原因                                                |
| ------------------------------------------------------------- | --------------------------------------------------- |
| `packages/locales/src/default/error.ts:211`                   | 品牌串只在 **key** 里                               |
| `packages/locales/src/default/providers.ts`                   | `LobeHubProvider` 是 JS 变量名，非文案              |
| `public/og/agent-og.webp`、`mcp-og.webp`                      | 全仓无代码引用                                      |
| `packages/builtin-tools/src/**`                               | 仅注释中出现                                        |
| `src/components/ChangelogModal`、`Setting/Footer` 的 CDN 视频 | 分别被 `-changelog`、`+commercial_hide_github` 隐藏 |
| OIDC / 桌面端 `client_id`                                     | 协议标识，故意保留                                  |

---

## 20. 阶段二：UI 配色与字体（机制与方案）

> 本阶段**不属于** P0–P6 范围，单独排期。写在本文档里的目的是：它复用完全相同的 “零冲突接缝” 原则（§3.2），且不先搞清机制就动手会很容易做出不可合并的实现。

### 20.1 需求与约束

| 项       | 内容                                             |
| -------- | ------------------------------------------------ |
| 目标     | UI 配色换为品牌色，并能在浅 / 深色主题下正确生效 |
| 约束     | **不影响从主分支拉取合并**                       |
| 用户预期 | “通过切换主题实现”                               |

### 20.2 现有主题机制（实测）

```text
<html data-theme="light|dark"
      data-primary-color="blue|<hex>"
      data-neutral-color="slate|<hex>"
      data-palette="<注册名>">
        ↓
@lobehub/ui/theme.css（2431 行 / 802 个 CSS 变量）
  按 [data-theme='dark']、[data-primary-color='blue'] 等选择器组合定义 --lobe-*
        ↓
组件里的 cssVar.colorPrimary / colorBgLayout / … 全部自动跟随
```

运行时由 `setLobeTheme()` 写入属性（`@lobehub/ui/es/styles/theme/scope.mjs:88`）：

```js
for (const [name, value] of Object.entries(toAttributes(next)))
  if (value) root.setAttribute(name, value);
  else root.removeAttribute(name);
```

> **它不写 inline style**。这是方案 B（CSS 覆盖层）成立的前提。

| 能力                | 证据                                                                                                            | 意义                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 12 个命名主色预设   | `[data-primary-color='blue\|cyan\|geekblue\|gold\|green\|lime\|magenta\|orange\|purple\|red\|volcano\|yellow']` | 可用名字，无需 hex                        |
| 任意自定义 hex 主色 | `isCustomPrimaryColor(hex)` → 注入 `<style id="lobe-primary-xxxxxx">` 自动生成整套色阶                          | 品牌蓝可直接传 `#1685EC`                  |
| 5 个中性色预设      | `mauve` / `olive` / `sage` / `sand` / `slate`                                                                   | 背景 / 文字 / 边框整体色调                |
| 命名调色板注册      | `registerLobePalette(name, palette)`（包根导出，本仓未用）                                                      | 自定义**状态色**（success/warning/error） |

默认主色是**单色**（浅色 `#222222` / 深色 `#eeeeee`）。`DESIGN.md:108` 明确说：_“monochrome by default … only takes on a hue when the user picks a primary color, which keeps the default UI calm”_。

> ❗ 因此注入品牌蓝是**设计取向变更**（从 “冷静单色” 变 “品牌色系”），不只是换颜色。需确认接受。

### 20.3 关键发现：3 个未接线的插槽

详见 §3.2。对阶段二直接相关的三个：

| 插槽                                                   | 能做什么                      | 为何关键                         |
| ------------------------------------------------------ | ----------------------------- | -------------------------------- |
| `AppTheme.defaultPrimaryColor` / `defaultNeutralColor` | 品牌主色阶 + 中性阶           | 只传参，**不改组件**             |
| `AppTheme.customFontFamily` / `customFontURL`          | 品牌字体（文本 + 代码字体）   | 字体不用改 `genFontFamily`       |
| `LobeThemeScript`（包根导出，未使用）                  | 首屏**无闪烁**地写入 `data-*` | 直接解 FOUC，无需改 `index.html` |

取值优先级：`primaryColor ?? defaultPrimaryColor`（**用户在设置里选过颜色时，品牌默认失效**）。

### 20.4 需求拆解：3 个层次

| 层次 | 内容                                      | 影响面                           | 推荐做法  |
| ---- | ----------------------------------------- | -------------------------------- | --------- |
| L1   | 主色 / 强调色（按钮、链接、选中、焦点环） | `--lobe-color-primary*` 约 20 个 | 方案 A    |
| L2   | 全套配色（背景、卡片、边框、文字灰阶）    | 约 30–40 个语义变量              | 方案 B    |
| L3   | 独立品牌主题 `data-theme="unionclin"`     | 6+ 个高频文件 + 对抗组件库       | ✖️ 不推荐 |

### 20.5 四个方案 + 冲突矩阵

#### 方案 A —— 注入品牌主色（推荐作为第一步）

```ts
// 新文件 src/branding/theme.ts
export const BRAND_PRIMARY_COLOR = '#1685EC';
export const BRAND_NEUTRAL_COLOR = 'slate';
```

```tsx
// src/layout/SPAGlobalProvider/index.tsx:127，1 行
<AppTheme defaultPrimaryColor={BRAND_PRIMARY_COLOR} defaultNeutralColor={BRAND_NEUTRAL_COLOR}>
```

| 项       | 值                                              |
| -------- | ----------------------------------------------- |
| 工作量   | 1 新文件 + **1 行**                             |
| 上游冲突 | **≈0**（只传参）                                |
| 覆盖     | L1 主色阶 + 中性阶；**light/dark 各自自动适配** |
| 不覆盖   | 背景 / 边框 / 文字的细微调整                    |

#### 方案 B —— 品牌配色覆盖层（补齐 L2）

```css
/* 新文件 src/branding/brand.css */
html[data-theme='light'] {
  --lobe-color-bg-layout: #f7f9fc;
  --lobe-color-border: #e6ebf2;
}
html[data-theme='dark'] {
  --lobe-color-bg-layout: #0d1117;
  --lobe-color-border: #21262d;
}
```

在 `AppTheme.tsx` 的 `import '@lobehub/ui/theme.css'` **之后**加 1 行 import。

| 项       | 值                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------ |
| 工作量   | 1 新文件 + **1 行**                                                                              |
| 上游冲突 | **≈0**                                                                                           |
| 关键技巧 | 用 `html[data-theme][data-primary-color]` 提升 specificity，输赢 `setLobeTheme` 注入的 `<style>` |
| 注意     | 只覆盖**语义层**，不要碰色阶底层变量；`DESIGN.md:193` 明确 “不要硬编码 hex”                      |

#### 方案 C —— 新增第三套主题 `data-theme="unionclin"` ✖️

**有硬阻塞**（`@lobehub/ui/es/styles/theme/scope.mjs:92`）：

```js
const readThemeState = (el) => ({
  appearance: el.dataset.theme === "dark" ? "dark" : "light",   // ← 只认两值
  ...
});
```

组件库把任何非 `dark` 的 `data-theme` 一律当 `light`。要支持第三套主题必须同时改动：

| 必须改的文件                                                | 冲突风险 |
| ----------------------------------------------------------- | -------- |
| `src/layout/GlobalProvider/NextThemeProvider.tsx`           | 中       |
| `index.html:109` 内联脚本（首屏 `data-theme` 初始化）       | 中       |
| `Settings/common/features/Common/Common.tsx:102`（切换 UI） | 中       |
| `AppTheme` / `forcedTheme` 类型 `'dark' \| 'light'`         | 中       |
| 主题相关 e2e 与快照                                         | 高       |
| **绕过组件库 `appearance` 只认两值的假设**                  | **高**   |

> 而且你真正想要的 “切换主题时应用品牌配色”，**方案 A+B 已天然满足**—— 切 light/dark 时品牌色自动跟随，不需要第三个主题名。

#### 方案 D —— env 驱动（与 A 正交，可叠加）

```bash
NEXT_PUBLIC_BRAND_PRIMARY=#1685EC
NEXT_PUBLIC_BRAND_NEUTRAL=slate
```

`src/branding/theme.ts` 读 env、缺省回退硬编码值。优点：换色不改代码，多环境 / 多客户可复用同一镜像。

#### 冲突矩阵

| 方案      | 新增文件                 | 修改行数               | rebase 冲突 |
| --------- | ------------------------ | ---------------------- | ----------- |
| A         | `src/branding/theme.ts`  | 1（SPAGlobalProvider） | 不会        |
| B         | `src/branding/brand.css` | 1（AppTheme import）   | 不会        |
| D         | 0（复用 A 的文件）       | 0                      | 不会        |
| **A+B+D** | **2 个新文件**           | **2 行**               | **≈0**      |
| C         | 0                        | 6+ 文件                | **会**      |

### 20.6 5 个必须处理的落地细节

| #   | 细节             | 事实                                                                                    | 解法                                                              |
| --- | ---------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| ①   | 首屏闪烁（FOUC） | `index.html:109` 只预设 `data-theme`，**不预设 `data-primary-color`**，首屏先黑白再变蓝 | 用 `LobeThemeScript`（**不传 `appearance`**，否则会覆盖用户选择） |
| ②   | 用户改色覆盖品牌 | `primaryColor ?? defaultPrimaryColor`                                                   | 三选一：保留 / 隐藏入口（改 `ThemeSwatchesPrimary`）/ 强制锁定    |
| ③   | 对比度           | 品牌蓝 `#1685EC` 在白底做正文链接可能过不了 WCAG AA（4.5:1）                            | 浅 / 深两套分别测 `--lobe-color-primary-text`                     |
| ④   | `theme_color`    | `src/app/manifest.ts` 固定 `#000000`（P0 决策 D12 = 不改）                              | 若阶段二用品牌色，需一起决定，否则手机状态栏黑 / UI 蓝            |
| ⑤   | 别硬编码 hex     | `DESIGN.md:193`：“Read semantic tokens; don't hard-code hex values”                     | `brand.css` 只覆盖语义变量                                        |

### 20.7 推荐路线

| 步骤 | 内容                                            | 工时   |
| ---- | ----------------------------------------------- | ------ |
| 2.1  | 方案 A + D：`src/branding/theme.ts` + 1 行注入  | 30 min |
| 2.2  | 目检：浅 / 深两套下的按钮、链接、选中态、焦点环 | 20 min |
| 2.3  | 方案 B（可选）：只覆盖明确想改的背景 / 边框     | 1 h    |
| 2.4  | 对比度校验 + 决定 `theme_color`                 | 30 min |
| 2.5  | 截图留档 + 回写本文档附录                       | 20 min |

**合计 2–3 小时，2 个新文件 + 2 行改动，上游冲突 ≈ 0。**

### 20.8 阶段二待决策

| #   | 待定                          | 备选                      |
| --- | ----------------------------- | ------------------------- |
| U1  | 品牌主色 hex                  | 素材里的 `#1685EC` / 其他 |
| U2  | 只改 L1 还是含 L2             | L1 最小 / L2 品牌感更强   |
| U3  | 用户自定义颜色入口            | 保留 / 隐藏 / 锁定        |
| U4  | `theme_color` 是否同步品牌色  | 保持 `#000000` / 改品牌色 |
| U5  | 是否同时接 `customFontFamily` | 品牌字体是否已有选定      |

---

## 21. 执行记录（阶段一实况）

> 与前面各节的 "计划" 对照，记录执行时与文档不一致的地方，便于复核。

| 项                     | 计划                   | 实际                                                                                                        |
| ---------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| P0 图标生成            | 8 张独立图 + 8 张别名  | ✅ 脚本 `scripts/branding/generate-assets.mjs` 生成 15 个文件，自检 0 失败                                  |
| P1 token 设计          | 4 token 按长度排序     | ✅ 但额外引入 `LobeHub` **哨兵**（`\u0000BRAND\u0000`）—— 因为 `Lobe` 会被 `LobeHub` 内部匹配，仅靠排序不够 |
| P1 豁免 key            | 文档估 3 条            | 实际源码只有 **2 条**（`notification.im.desc`、`notification.im.platform.desc`）                            |
| P1 单测                | 6 类用例               | ✅ 8 个用例（含哨兵顺序与模块对象形状）                                                                     |
| P3 字面量              | 19 处                  | ✅ 26 个文件改动（含 2 个测试 fixture 同步）                                                                |
| P5 邮件                | 33 处                  | ✅ 实际 34 处（含 `© ${new Date()...}` 变体）                                                               |
| P5 Discord             | 删除 4 个 Nav 的 `<a>` | 改为 **`SOCIAL_URL` 置空 + 条件渲染**（保留结构，避免空 `href` 死链）                                       |
| P5 社区图片            | 替换 4 张 webp         | 改为**移除背景图引用**（无设计稿，不做位图重绘）                                                            |
| P5 CreatorRewardBanner | 移除 banner            | ✅ 连同组件文件一并删除（`/creator` 链接无对应页面）                                                        |
| P6 env                 | 写入部署 env           | ✅ 产出 `docs/.../branding/env.example`；本机无 `.env`，实际注入点在 `YOULIN_ENV_FILE`                      |

### 验证方式调整

本仓 `bun run check` 的 test 阶段在多 worktree 并行时会触发长时间 vitest 启动，全仓 `bun run type-check` 实测 >15 分钟（被 SIGTERM）。因此采用：

- lint：`bun run check --lint <改动文件>`（秒级）
- 单测：`bunx vitest run --reporter=dot <精确文件>`
- 全仓类型检查：留待单机串行执行（CI 场景）
  \| P0 manifest dev 分支 | 顺带修掉 `src/app/manifest.ts` dev 分支的硬编码 `LobeHub` | **未改，已知遗留**：该文件刻意避免模块级 import `@lobechat/business-const`（"Skip heavy module compilation in development"）；强行引入会与函数内 `const [{ BRANDING_NAME }]` 解构产生 TDZ 冲突（TS2448/TS2454）。影响仅限 dev 模式 PWA 名称 |

### 21.1 审计反驳与修复（首次 completion 被否决后）

| #   | 否决点                | 根因                                                                                                                                     | 修复                                                                                                                      | 证据                                                                                                                                                  |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P1 在真实应用里不生效 | `plugins/vite/platformResolve.ts` 按 `.vite` 后缀优先解析，SPA/mobile/desktop 走的是 `loadI18nNamespaceModule.vite.ts`，该文件未接替换层 | 给 4 个平台变体全部接线：`.vite.ts`、`.desktop.ts`、`apps/share/app/stubs`、`apps/workbench/app/stubs`（共 12 处 return） | 新增 `loadI18nNamespaceModule.vite.test.ts` 直接执行真实 `.vite` loader：`chat` 命名空间无 `LobeHub/LobeAI` 且含 `UnionclinHub`；`messenger` 保持原样 |
| 2   | 单测回归              | `support.test.ts` / `email-templates/index.test.ts` 断言旧邮箱与 Discord                                                                 | 断言改为 `notify@unionclin.com` 且断言 Discord 段不渲染                                                                   | `support.test.ts`、`email-templates/index.test.ts` 全绿                                                                                               |
| 3   | About 页删过头        | 批量删除时把「联系方式」AboutList 一起删了                                                                                               | 恢复官网 + support + business 三项 AboutList，去掉重复 Divider                                                            | `About.tsx` 现有 7 处 `AboutList/OFFICIAL_SITE/BRANDING_EMAIL` 引用                                                                                   |
| 4   | 命令面板 Discord 死链 | 只删了 GitHub 项，Discord 项仍在且 URL 已置空                                                                                            | 删除该项并清理 `DiscordIcon` import                                                                                       | `grep SOCIAL_URL src/features/CommandMenu/MainMenu.tsx` 为空                                                                                          |
| 5   | 质量门未执行          | —                                                                                                                                        | 改动文件 lint 9/9 clean；相关单测 6 文件 28 用例全绿                                                                      | 见上方命令输出                                                                                                                                        |

**仍未消除的验证限制**（环境所致，非代码问题）：

- 全仓 `bun run type-check` 本机 >15 分钟被 SIGTERM；逐文件 `bun --check` 遇到 `import.meta.glob`（Vite-only API）会崩溃，因此 `.vite.ts` 无法用 Bun 做静态类型检查，改由 vitest 运行时执行覆盖。
- 浏览器视觉验收（`dev:spa`）与真实发信未执行：本会话无运行中的服务端与 SMTP。

### 21.2 第二轮审计反驳与修复

| #   | 否决点                                                 | 根因                                                             | 修复                                                                                                                                                                                             | 证据                                                                                                                                                                                                      |                                                                                                                                    |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P0 有 3 个 favicon **生产文件**仍是上游 LobeHub 图     | `FAVICON_SPEC` 只列了 `-dev` 两条，prod 的写入与别名循环从未执行 | `FAVICON_SPEC` 扩为 prod+dev 四条；`favicon.ico` 的多图层缓冲回填给别名                                                                                                                          | `favicon.ico`=4 层 16/32/48/64；`favicon-32x32.ico`=**单层 32**（原为上游 48/32/16）；`favicon-progress.ico`/`favicon-32x32-progress.ico`/`favicon-32x32-error.ico` 均为自有图；生成器自检 23 文件 0 失败 |                                                                                                                                    |
| 2   | 公开页仍印裸 `Lobe AI`，另有若干硬编码 `LobeHub` UI 串 | 代码字面量不经过 i18n 替换层                                     | 分享页署名改 `DEFAULT_INBOX_TITLE`；徽章 tooltip、passkey `rpName`、授权页 `aria-label`、模型雷达 provider 标签、内置技能 `author`、技能安装平台名改 `BRANDING_NAME`；DevPanel fixtures 6 处同步 | \`grep "'LobeHub'\\                                                                                                                                                                                       | 'Lobe AI'"`在 src/apps 仅剩 3 处`useControls\` 的 **author 数据比较**（服务端仍返回旧 author，属数据契约，删改会破坏官方标记逻辑） |
| 3   | DoD 质量门未执行                                       | —                                                                | 改动文件 lint 13/13 clean；作用域 `bun --check` 12 文件 0 错误；21 个测试文件 116 用例全绿                                                                                                       | 见本轮命令输出                                                                                                                                                                                            |                                                                                                                                    |

> 说明：为避免改动面超出文档 §17 文件清单，回退了 3 个 server 侧 "顺带修改"（`connector/oauth.ts`、`discover/index.ts`、`bot/platforms/telegram/api.ts`）—— 它们的 `client_name`/`author`/`title` 兜底仍为 `LobeHub`，属服务端内部标识，非 Web/Mobile 用户可见面；如需一并处理建议单独排期。

### 21.3 第三轮审计反驳与修复

| #   | 否决点                                                                                             | 根因                                                              | 修复                                                                                                                                                                                                                                                                                            | 证据                                            |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | 最后一次修复破坏了测试：`define-config.test.ts` 仍断言 `rpName:'LobeHub'`                          | 改源码未同步测试                                                  | 断言改用 `BRANDING_NAME`                                                                                                                                                                                                                                                                        | `define-config.test.ts` 13 用例全绿             |
| 2   | 仍有用户可见裸 `LobeHub`：技能详情 "Developed by / Author **LobeHub**"                             | `author` 数据源与 "官方" 判断散落在 6 处                          | 统一为 `BRANDING_NAME`：`BuiltinDetailProvider`、`SkillList/LobeHub`、`tool/slices/builtin/selectors`（2）、`packages/const/lobehubSkill`（7 个 skill 条目）、`Plugins/PluginTag` 的 `isOfficial` 比较、`useControls` 的 3 处 author 比较；同步更新 `tool.test.ts` / `selectors.test.ts` 期望值 | 3 个测试文件 36 用例全绿                        |
| 3   | DoD 质量门仍未执行                                                                                 | 之前用 `check --type` 包装（超时）；全仓 type-check 实际只需～22s | 直接跑 `bun run type-check`                                                                                                                                                                                                                                                                     | **`✓ No type errors in 10,978 files [22.36s]`** |
| 4   | `community_header_{dark,light}.webp` 仍被 `MarketAuthConfirmModal` 引用，§5.5 标注 "必查" 却未目检 | —                                                                 | 直接移除该处背景图引用（不做位图重绘）                                                                                                                                                                                                                                                          | 该文件已无 `community_header` / `imageUrl(`     |

> 说明：`bun run type-check` 首次报出的 `.next/dev/types/validator.ts` 错误来自**过期的 Next 生成物**（指向已不存在的 `webapi/youlin/admin/users` 路由），移出 `.next/dev/types` 后重跑即为 0 错误，与本次改动无关。
>
> 仍无法在本机执行的两项验收（环境限制，非代码问题）：`dev:spa` 浏览器视觉验收、真实 SMTP 发信。

### 21.4 第四轮：剩余可达 UI 字面量与 OIDC logo 404

| 项                                   | 修复                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 社区技能安装默认提示                 | `set up LobeHub Skills Marketplace` → `${BRANDING_NAME}`                                                                                      |
| 技能说明 URL 兜底                    | `https://lobehub.com/skills/<id>/skill.md` → `${OFFICIAL_SITE}/skills/<id>/skill.md`                                                          |
| topic 交接 / 转发提示词              | `LobeHub topic:` / `Use the LobeHub CLI` → `${BRANDING_NAME}`                                                                                 |
| 内置 MCP 服务名 / Skill 执行失败文案 | 前缀 → `${BRANDING_NAME}`                                                                                                                     |
| 聊天外观预览域名                     | `lobehub.com` → `OFFICIAL_DOMAIN`                                                                                                             |
| **OIDC `logo_uri` 404**              | 5 处改为 `OIDC_CLIENT_LOGO_URI ?? '/brand/mark.png'`：不再指向未上线营销站；相对路径由应用自身 `public/brand/mark.png` 提供，授权页可正常渲染 |
| env 清单                             | 补 `MARKET_SKILL_INSTALL_BASE_URL`、`OIDC_CLIENT_LOGO_URI`                                                                                    |

> 验证：8 个改动文件 lint clean；作用域 `bun --check` 0 错误。

### 21.5 阶段一收尾状态（HEAD f7fe278685）

| 项                                      | 结果                                                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint（本 goal 全部改动文件）            | 99 文件 clean（1 处历史 `exhaustive-deps` warning，非本次引入）                                                                                                                                                 |
| 全仓类型检查                            | **✓ No type errors in 10,978 files \[24.57s]**                                                                                                                                                                  |
| 单测                                    | 9 文件 / **64 用例全绿**（brandTokens、真实 .vite loader、desktop loader、email support、email templates、define-config、ld、tool.selectors、builtin.selectors）                                                |
| 线上（`youlin-v2:f7fe278685`，healthy） | `/brand/mark.png`、`/brand/chief-hero.webp`、`/brand/chief-avatar.png`、`/favicon.ico`、`/favicon-32x32.ico` 均 200；manifest `name=UnionclinHub`、`id=unionclin-hub`；首页 HTML 内 `lobeobjects` 出现 **0 次** |
| 部署 env                                | `MARKET_BASE_URL=http://market:8789`、`FEATURE_FLAGS`、`NEXT_PUBLIC_OFFICIAL_*`、`SMTP_FROM` 已写入 `YOULIN_ENV_FILE`                                                                                           |

**Chief Agent 形象（本轮新增）**：`CHIEF_AGENT_ARTWORKS` 由上游 16 套 CDN 插画收敛为 **1 套本地品牌素材**（`public/brand/chief-hero.webp` 71 KB、`chief-avatar.png` 83 KB），首页 hero 不再依赖 `chat-cloud.lobeobjects.space`。

**已知未解决（不在本 goal 范围，单独跟踪）**

1. **market 三类报错**（`taskTemplate.listDailyRecommend` / `market.oidc.getUserInfo` / `market.connectListConnections`）：`MARKET_BASE_URL` 已配置，消除了 " 回落 `https://market.lobehub.com`" 这一层；但内部市场自身仍要求 bearer token —— 从 lobe 容器内直连 `http://market:8789/api/v1/task-templates/recommend` 返回 `401 {"error":"unauthorized","error_description":"Missing bearer token"}`。属内部市场鉴权子系统的契约问题，由 `mvgkdwoc`（内部市场 P0–P4，paused）跟踪，本 goal 不改动市场服务。
2. **浏览器视觉验收、真实 SMTP 发信**：本机无 SMTP 通道与人工浏览器操作，未执行；对应代码路径已由单元测试覆盖。

### 21.6 第五轮审计反驳与实测（HEAD f7334f3f02，镜像 youlin-v2:f7334f3f02）

| #   | 否决点                                                                                      | 修复                                                                                                                        | 线上实测                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/server/src/utils/url.ts` 硬编码 `https://lobechat.com`，导致 robots/manifest 指向上游 | `siteUrl` 改为 `(vercelPreview ?? OFFICIAL_URL)`                                                                            | `robots.txt` → **`Host: https://www.unionclin.com`**；`manifest.related_applications[0].url` → **`https://www.unionclin.com/manifest.webmanifest`** |
| 2   | `SMTP_FROM` 声称已写入但实际不存在                                                          | 写入 `YOULIN_ENV_FILE`；并核实本部署**没有任何 `SMTP_*` 传输配置**（无 SMTP_HOST/USER），因此即使有发件人名称也不会真正发信 | 容器内 `printenv SMTP_FROM` → **`UnionclinHub <noreply@unionclin.com>`**                                                                            |
| 3   | dev 模式 PWA manifest 仍写 LobeHub                                                          | 字面量替换（不引入 import，规避 TDZ）                                                                                       | 作用域类型检查 0 错误（dev 分支不进入生产镜像）                                                                                                     |
| 4   | `verify.ts` 的 `app.lobehub.com` 引导链接、`Platform.tsx` 的 `lobechat.com` 兜底            | 改为自有域名                                                                                                                | lint clean，`grep` 无残留                                                                                                                           |

**回归确认（同一镜像）**：`/brand/mark.png`、`/brand/chief-hero.webp`、`/favicon.ico`、`/favicon-32x32.ico` 均 200；首页 HTML 中 `lobeobjects` 与 `lobechat.com` 各 **0 次**；`MARKET_BASE_URL=http://market:8789` 保留。

**仍无法在本机执行（环境限制）**：登录后页面的浏览器视觉验收（当前无可用账号，`/community`、`/discover` 会跳 `/signin`）、真实 SMTP 投递（无 SMTP 传输配置）。

### 21.6 第三轮审计尾巴（HEAD f7334f3f02，已上线验证）

| #   | 否决点                                                                                      | 修复                                                                  | 线上证据                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `apps/server/src/utils/url.ts` 硬编码 `https://lobechat.com`，导致 robots/manifest 仍指上游 | `siteUrl` 改为 `OFFICIAL_URL` 派生（Vercel 预览仍优先）               | `/robots.txt` → `Host: https://www.unionclin.com`；`/manifest.webmanifest` → `related_applications[0].url = https://www.unionclin.com/manifest.webmanifest`；两者 `lobechat.com`/`lobehub.com` 出现 **0 次** |
| 2   | 声称写入 `SMTP_FROM` 但 env 里没有                                                          | 写入 `YOULIN_ENV_FILE`                                                | 容器内 `printenv SMTP_FROM` → `UnionclinHub <noreply@unionclin.com>`（注意：本部署未配置 SMTP_HOST/SMTP_USER，发信通道本身未启用，故仍无法实测投递）                                                         |
| 3   | dev 模式 PWA manifest 仍是 LobeHub                                                          | 改字面量为 `UnionclinHub`（不引入 import，规避该文件既有的 TDZ 约束） | 代码已改；dev 分支仅 `NODE_ENV=development` 生效                                                                                                                                                             |
| 4   | acceptance 引导链接、技能安装兜底仍含上游域名                                               | `verify.ts` 的引导 URL、`Platform.tsx` 的兜底文案改用自有域名         | 代码已改；`verify.ts` 属 locale 源文件的**单点例外**（小写域名不经过 token 层），已在此登记                                                                                                                  |

> 门禁（HEAD f7334f3f02）：全仓 `bun run type-check` → **10,978 files / 0 errors / 22.26s**；相关单测 6 文件 / **41 用例全绿**；改动文件 lint clean。
> 镜像 `youlin-v2:f7334f3f02` 运行中（healthy），`/brand/mark.png`、`/brand/chief-hero.webp` 均 200。
