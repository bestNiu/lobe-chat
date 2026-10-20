# UnionClin AI 鹿医生透明品牌素材包

来源：用户提供的鹿医生三视图、标准站立、眨眼 OK 姿态。

## 主体透明素材

- `standing-transparent.png` / `.webp`：标准站立，欢迎页、登录页
- `welcome-transparent.png` / `.webp`：眨眼 OK，默认助手头像、空状态
- `turnaround-transparent.png` / `.webp`：三视图，设计资产
- `mascot-head-transparent.png`：头部裁切，导航和 Logo

## 图标

- `icon-{16,32,48,64,128,180,192,256,384,512,1024}.png`：透明背景的尺寸图标
- `favicon.ico`：浏览器图标（16/32/48/64）
- `apple-touch-icon.png`：iOS 180×180
- `pwa-192.png`, `pwa-512.png`：PWA 原始透明资源
- `og-image-transparent.png`：透明背景分享图示例，部分社交平台建议再生成不透明底版本

## 推荐拷贝到 LobeHub 二开的路径

将所需文件放在 `public/brand/`（如为 Monorepo，则在具体 Web 应用对应的 public 下），并根据实际源码修改共享 Logo 组件、登录欢迎页、metadata/icons、PWA manifest。

## 注意

- PNG 是真正包含 alpha 通道的透明背景；WebP 采用无损透明格式。
- 主体抠图使用自动分割，在透明材质鹿角和毛发边缘仍可能有轻微白边，正式品牌发布请由设计师人工检查。
- 图标仍是原始 3D 图像的位图缩放，不是矢量 SVG。16×16 的小图标适合另制作极简鹿头矢量版。
- 浏览器及 PWA 对透明图标处理存在差异，安装图标建议后续增加品牌纯色背景的 maskable 版本。
