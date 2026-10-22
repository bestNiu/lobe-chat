#!/usr/bin/env node
/**
 * White-label 图标资产生成器（UnionclinHub）。
 *
 * 单一母版 → 全部产物，保证：
 *   1. 尺寸与内容占比符合仓库既有约定（见 IMPLEMENTATION.md §5.2）
 *   2. 可重复运行，结果稳定（幂等）
 *   3. 不依赖设计软件，只需 `public/new/icon-1024.png`
 *
 * 用法：
 *   node scripts/branding/generate-assets.mjs            # 生成 + 自检
 *   node scripts/branding/generate-assets.mjs --dry-run  # 只自检现有产物
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SRC_ICON = path.join(ROOT, 'public/new/icon-1024.png');
const SRC_OG = path.join(ROOT, 'public/new/og-image-transparent.png');

/** 品牌强调色，用于 progress 状态的角标。 */
const ACCENT = '#1685EC';
/** 不透明产物（apple-touch / og 的底色）。 */
const FLATTEN_BG = { alpha: 1, b: 255, g: 255, r: 255 };

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * 仓库约定（实测自 LobeHub 原素材，见 IMPLEMENTATION.md §5.2）：
 *   any        → 内容最长边占画布 84%~92%
 *   maskable   → 内容最长边占画布 55%~59%
 *   apple-touch→ 内容最长边占画布 73%~79%，且**不透明**
 */
const spec = [
  { file: 'public/brand/mark.png', ratio: 0.88, size: 1024 },
  { file: 'public/app-icons/icon-192x192.png', ratio: 0.88, size: 192 },
  { file: 'public/app-icons/icon-512x512.png', ratio: 0.88, size: 512 },
  { file: 'public/app-icons/icon-192x192.maskable.png', ratio: 0.56, size: 192 },
  { file: 'public/app-icons/icon-512x512.maskable.png', ratio: 0.56, size: 512 },
  { file: 'public/apple-touch-icon.png', opaque: true, ratio: 0.76, size: 180 },
];

/** favicon 主图：小尺寸下尽量占满画布，仅留 2% 安全边。 */
const FAVICON_SPEC = [
  // prod 与 dev 两套都必须生成：index.html 直接把 /favicon.ico 与
  // /favicon-32x32.ico 作为 link，FaviconProvider 运行时会切到 *-progress。
  { file: 'public/favicon.ico', size: 16 },
  { file: 'public/favicon-32x32.ico', size: 32 },
  { file: 'public/favicon-dev.ico', size: 16 },
  { file: 'public/favicon-32x32-dev.ico', size: 32 },
];

/** 图标画布：把母版内容按 ratio 居中放到正方形 canvas 上。 */
const renderIcon = async ({ opaque = false, ratio, size }) => {
  const trimmed = await sharp(SRC_ICON, { limitInputPixels: false }).trim().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();

  const longest = Math.max(width, height);
  const scale = (size * ratio) / longest;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const resized = await sharp(trimmed)
    .resize({ height: h, kernel: 'lanczos3', width: w })
    .toBuffer();

  const canvas = sharp({
    create: {
      background: opaque ? FLATTEN_BG : { alpha: 0, b: 0, g: 0, r: 0 },
      channels: 4,
      height: size,
      width: size,
    },
  }).composite([
    { input: resized, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) },
  ]);

  // 仓库约定：apple-touch-icon 必须真正无 alpha 通道（iOS 会把透明渲染成黑色）
  return (opaque ? canvas.flatten({ background: '#ffffff' }).removeAlpha() : canvas)
    .png()
    .toBuffer();
};

/** progress 角标：右下角品牌色圆点 + 白色描边，16px 下仍可辨识。 */
const progressBadge = (size) => {
  const r = size * 0.28;
  const pad = size * 0.03;
  const cx = size - r - pad;
  const cy = size - r - pad;
  const stroke = Math.max(1, size * 0.09);

  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
       <circle cx="${cx}" cy="${cy}" r="${r}" fill="${ACCENT}" stroke="#ffffff" stroke-width="${stroke}"/>
     </svg>`,
  );
};

/** sharp 不产出 .ico，这里手写 ICO 容器（PNG-in-ICO，Vista+ 支持）。 */
const toIco = (pngs) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ data, size }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
};

const write = async (file, data) => {
  const abs = path.join(ROOT, file);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return abs;
};

/** 自检：确认尺寸、内容占比、透明度符合 §5.2。 */
const verify = async (file, expectation) => {
  const abs = path.join(ROOT, file);
  const { width, height, hasAlpha } = await sharp(abs, { limitInputPixels: false }).metadata();

  let content = null;
  try {
    const { info } = await sharp(abs, { limitInputPixels: false })
      .trim()
      .toBuffer({ resolveWithObject: true });
    content = { height: info.height, width: info.width };
  } catch {
    // 完全铺满/全透明时 trim 无内容可裁，视为无内容边界
  }

  const ratio = content ? Math.max(content.width, content.height) / Math.max(width, height) : null;
  const problems = [];

  if (width !== height) problems.push(`非正方形 ${width}×${height}`);
  if (expectation.size && width !== expectation.size) {
    problems.push(`期望 ${expectation.size}px，实际 ${width}px`);
  }
  if (expectation.ratio && ratio !== null) {
    const delta = Math.abs(ratio - expectation.ratio);
    if (delta > 0.05)
      problems.push(
        `内容占比 ${(ratio * 100).toFixed(1)}% 偏离目标 ${(expectation.ratio * 100).toFixed(0)}%`,
      );
  }
  if (expectation.opaque && hasAlpha) problems.push('应为不透明，却带 alpha 通道');
  if (expectation.transparent && !hasAlpha) problems.push('应保留透明通道');

  return { content, hasAlpha, height, ok: problems.length === 0, problems, ratio, width };
};

/** sharp 不支持多图层 ICO 输入，直接解容器头。 */
const readIcoLayers = async (file) => {
  const buf = await readFile(path.join(ROOT, file));
  const count = buf.readUInt16LE(4);
  const layers = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    layers.push({ height: buf[entry + 1] || 256, width: buf[entry] || 256 });
  }
  return layers;
};

const main = async () => {
  const generated = [];

  if (!DRY_RUN) {
    // 1. 主图标族（any / maskable / apple-touch）
    for (const item of spec) {
      const buf = await renderIcon(item);
      await write(item.file, buf);
      generated.push({ ...item, file: item.file });
    }

    // 2. brand mark 兼作 manifest 图标与默认头像，需保留透明
    // 3. OG：1200×640 不透明（代码声明尺寸，社交平台不支持透明）
    const og = await sharp(SRC_OG, { limitInputPixels: false })
      .flatten({ background: '#ffffff' })
      .resize(1200, 640, { fit: 'contain', background: '#ffffff', position: 'center' })
      .webp({ quality: 92 })
      .toBuffer();
    await write('public/og/og.webp', og);

    // 4. favicon：16 / 32 两档，每档含 default / progress / dev / progress-dev
    const favSources = {};
    for (const { file, size } of FAVICON_SPEC) {
      const isDev = file.includes('-dev');
      const base = await renderIcon({ ratio: 0.98, size });
      const progress = await sharp(base)
        .composite([{ input: progressBadge(size), left: 0, top: 0 }])
        .png()
        .toBuffer();

      const suffix = isDev ? '-dev' : '';
      const baseIco = toIco([{ data: base, size }]);
      const progressIco = toIco([{ data: progress, size }]);
      const name = size === 16 ? 'favicon' : 'favicon-32x32';

      await write(`public/${name}${suffix}.ico`, baseIco);
      await write(`public/${name}-progress${suffix}.ico`, progressIco);

      favSources[`${name}${suffix}`] = baseIco;
      generated.push(
        { file: `public/${name}${suffix}.ico` },
        { file: `public/${name}-progress${suffix}.ico` },
      );
    }

    // 5. 主 favicon.ico 用 4 层（16/32/48/64），与上游现状一致但层次更多
    const layers = await Promise.all(
      [16, 32, 48, 64].map(async (size) => ({
        data: await renderIcon({ ratio: 0.98, size }),
        size,
      })),
    );
    const multiLayer = toIco(layers);
    await write('public/favicon.ico', multiLayer);
    // 别名（done/error）应复制真正的多图层 base，而不是循环里的单层版本
    favSources['favicon'] = multiLayer;
    generated.push({ file: 'public/favicon.ico' });

    // 6. done / error 别名：上游当前无调用方，复制 base 防未来 404（IMPLEMENTATION.md §5.6）
    for (const base of ['favicon', 'favicon-32x32', 'favicon-dev', 'favicon-32x32-dev']) {
      const buf = favSources[base];
      if (!buf) continue;
      for (const state of ['done', 'error']) {
        // favicon → favicon-done.ico ；favicon-32x32-dev → favicon-32x32-done-dev.ico
        const target = base.includes('-dev')
          ? `public/${base.replace('-dev', `-${state}-dev`)}.ico`
          : `public/${base}-${state}.ico`;
        await write(target, buf);
        generated.push({ aliasOf: base, file: target });
      }
    }
  }

  // ---- 自检 ----
  console.log('\n产物自检（IMPLEMENTATION.md §5.2 约定）\n');
  console.log(
    '文件'.padEnd(46),
    '尺寸'.padEnd(10),
    '内容'.padEnd(10),
    '占比'.padEnd(8),
    'alpha',
    '结果',
  );
  console.log('-'.repeat(96));

  let failed = 0;
  const checks = [
    ...spec.map((s) => ({ expectation: { ...s, transparent: !s.opaque }, file: s.file })),
    { expectation: { ratio: 0.88, size: 1024, transparent: true }, file: 'public/brand/mark.png' },
  ];

  for (const { expectation, file } of checks) {
    const r = await verify(file, expectation);
    if (!r.ok) failed++;
    console.log(
      file.padEnd(46),
      `${r.width}×${r.height}`.padEnd(10),
      (r.content ? `${r.content.width}×${r.content.height}` : '—').padEnd(10),
      (r.ratio === null ? '—' : `${(r.ratio * 100).toFixed(1)}%`).padEnd(8),
      String(r.hasAlpha).padEnd(5),
      r.ok ? '✅' : `❌ ${r.problems.join('；')}`,
    );
  }

  const ogMeta = await sharp(path.join(ROOT, 'public/og/og.webp'), {
    limitInputPixels: false,
  }).metadata();
  const ogOk = ogMeta.width === 1200 && ogMeta.height === 640 && !ogMeta.hasAlpha;
  if (!ogOk) failed++;
  console.log(
    'public/og/og.webp'.padEnd(46),
    `${ogMeta.width}×${ogMeta.height}`.padEnd(10),
    '—'.padEnd(10),
    '—'.padEnd(8),
    String(ogMeta.hasAlpha ?? false).padEnd(5),
    ogOk ? '✅' : '❌ 期望 1200×640 且不透明',
  );

  const faviconLayers = await readIcoLayers('public/favicon.ico');
  const faviconOk = faviconLayers.length === 4 && faviconLayers.every((l) => l.width === l.height);
  if (!faviconOk) failed++;
  console.log(
    'public/favicon.ico'.padEnd(46),
    `${faviconLayers.length} 层`.padEnd(10),
    faviconLayers
      .map((l) => l.width)
      .join('/')
      .padEnd(10),
    '—'.padEnd(8),
    '—'.padEnd(5),
    faviconOk ? '✅' : '❌ 期望 4 层正方形',
  );
  console.log(`\n生成 ${generated.length} 个文件，自检失败 ${failed} 项`);

  if (failed > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
