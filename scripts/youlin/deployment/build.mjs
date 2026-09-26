// Host coordinates Docker only; all compilation runs in bounded, offline containers.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { images, localDocker, root } from '../dockerRuntime.mjs';
import { runProcess } from '../postgresHarness.mjs';
import { prepareBuild } from './prepare.mjs';
import { frontendVariants } from './profiles.mjs';
import { runLoggedCommand } from './runLoggedCommand.mjs';

const KNOWN_FLAGS = new Set(['--full', '--no-cache']);
const flags = new Set(process.argv.slice(2));
for (const flag of flags)
  if (!KNOWN_FLAGS.has(flag)) throw new Error(`Unknown builder flag: ${flag}`);
// --full ignores a cached frontend bundle; --no-cache neither reads nor publishes one.
// Release and evidence builds must use both so the artifact is provably built from this tree.
const fullBuild = flags.has('--full');
const useCache = !flags.has('--no-cache');

/**
 * Paths that cannot influence the five Vite frontend bundles. Deliberately narrow: anything not
 * listed here forces a frontend rebuild, so a missed input degrades to slower, never to stale.
 */
const FRONTEND_IRRELEVANT = [
  /^\.agents\//,
  /^\.github\//,
  /^apps\/server\//,
  /^changelog\//,
  /^docs\//,
  /^e2e\//,
  /^packages\/database\//,
  /^scripts\//,
  /^src\/app\/\(backend\)\//,
  /^src\/server\//,
  /^tests\//,
  /\/__tests__\//,
  /\.md$/,
  /\.test\.[cm]?[jt]sx?$/,
];
const FRONTEND_CACHE_ROOT = path.join(os.homedir(), '.cache', 'youlin-build', 'frontend-dist');
const FRONTEND_CACHE_KEEP = 3;

const frontendInputDigest = async () => {
  const listing = await runProcess(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    root,
  );
  const hash = createHash('sha256');
  let counted = 0;
  for (const relative of listing.split('\0').filter(Boolean).sort()) {
    if (FRONTEND_IRRELEVANT.some((pattern) => pattern.test(relative))) continue;
    const absolute = path.join(root, relative);
    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile()) continue;
    hash.update(relative);
    hash.update(await readFile(absolute));
    counted += 1;
  }
  return { digest: hash.digest('hex'), files: counted };
};

const cacheComplete = async (directory) => {
  const marker = path.join(directory, 'youlin-frontend-complete.json');
  const raw = await readFile(marker, 'utf8').catch(() => null);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return (
      Array.isArray(parsed.variants) &&
      frontendVariants.every((variant) => parsed.variants.includes(variant))
    );
  } catch {
    return false;
  }
};

const publishFrontendCache = async (directory, digest) => {
  const temporary = `${directory}.partial-${randomUUID()}`;
  await rm(temporary, { force: true, recursive: true });
  await cp(path.join(artifacts, 'dist'), temporary, { recursive: true });
  await writeFile(
    path.join(temporary, 'youlin-frontend-complete.json'),
    `${JSON.stringify({ digest, variants: [...frontendVariants] }, null, 2)}\n`,
  );
  await rm(directory, { force: true, recursive: true });
  await mkdir(path.dirname(directory), { recursive: true });
  await renameSafe(temporary, directory);
  const entries = await readdir(FRONTEND_CACHE_ROOT).catch(() => []);
  const aged = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(FRONTEND_CACHE_ROOT, entry);
      const info = await stat(target).catch(() => null);
      return { mtime: info?.mtimeMs ?? 0, target };
    }),
  );
  for (const entry of aged.sort((a, b) => a.mtime - b.mtime).slice(0, -FRONTEND_CACHE_KEEP))
    await rm(entry.target, { force: true, recursive: true });
  // Tool caches (Vite/Next) are namespaced by lockfile+config digest; keep the same bounded count.
  const toolRoot = path.join(os.homedir(), '.cache', 'youlin-build', 'caches');
  const toolEntries = await readdir(toolRoot).catch(() => []);
  const toolAged = await Promise.all(
    toolEntries.map(async (entry) => {
      const target = path.join(toolRoot, entry);
      const info = await stat(target).catch(() => null);
      return { mtime: info?.mtimeMs ?? 0, target };
    }),
  );
  for (const entry of toolAged.sort((a, b) => a.mtime - b.mtime).slice(0, -FRONTEND_CACHE_KEEP))
    await rm(entry.target, { force: true, recursive: true });
};

const renameSafe = async (from, to) => {
  const { rename } = await import('node:fs/promises');
  await rename(from, to);
};
const docker = await localDocker();
await docker(['image', 'inspect', images.node, '--format', '{{.Id}}']);
// Reserve headroom for existing services. Do not reclaim caches or touch their containers.
const STAGE_MEMORY_GIB = 6;
const HEADROOM_MARGIN_GIB = 2;
// Observed twice: with two concurrent `compose run` invocations on one project, the longer stage
// received SIGTERM (exit 143) while its sibling succeeded. Until that race is understood, the
// operator can pin serial builds; the default stays parallel and memory-derived.
const REQUESTED_CONCURRENCY = Number(process.env.YOULIN_BUILD_CONCURRENCY ?? 3);
const MAX_FRONTEND_CONCURRENCY =
  Number.isInteger(REQUESTED_CONCURRENCY) &&
  REQUESTED_CONCURRENCY >= 1 &&
  REQUESTED_CONCURRENCY <= 3
    ? REQUESTED_CONCURRENCY
    : 3;

const availableGiB = async () => {
  const memory = await readFile('/proc/meminfo', 'utf8');
  const availableKiB = Number(memory.match(/^MemAvailable:\s+(\d+) kB$/m)?.[1]);
  if (!Number.isFinite(availableKiB)) throw new Error('UNREADABLE_MEMORY_INFO');
  return availableKiB / 1024 / 1024;
};

const requireHeadroom = async (concurrent = 1) => {
  const required = concurrent * STAGE_MEMORY_GIB + HEADROOM_MARGIN_GIB;
  const available = await availableGiB();
  // Never reclaim caches or stop other business services: shrink concurrency instead.
  if (available < required)
    throw new Error(
      `INSUFFICIENT_HEADROOM: require ${required}GiB available for ${concurrent} concurrent ${STAGE_MEMORY_GIB}GiB stage(s), have ${available.toFixed(1)}GiB`,
    );
  return available;
};

/** Concurrency is derived from real available memory, capped by policy. */
const planConcurrency = async () => {
  const available = await availableGiB();
  const affordable = Math.floor((available - HEADROOM_MARGIN_GIB) / STAGE_MEMORY_GIB);
  return Math.max(1, Math.min(MAX_FRONTEND_CONCURRENCY, affordable));
};
await requireHeadroom(1);
// Cache namespace: dependency lockfile plus the configs that decide how bundles are produced.
// A change to any of them starts a fresh cache instead of reusing a stale one.
const cacheKeySource = ['pnpm-lock.yaml', 'package.json', 'vite.config.ts', 'next.config.ts']
  .map((name) => path.join(root, name))
  .filter((file) => existsSync(file))
  .map((file) => `${path.basename(file)}\0${readFileSync(file)}`)
  .join('\n');
const cacheKey = createHash('sha256').update(cacheKeySource).digest('hex').slice(0, 32);
const caches = useCache
  ? { root: path.join(os.homedir(), '.cache', 'youlin-build', 'caches', cacheKey) }
  : undefined;
const artifacts = await prepareBuild({ repository: root, image: images.node, caches });
const project = `youlin-build-${randomUUID()}`;
const endpoint =
  process.env.DOCKER_HOST ||
  (await docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']));
const prefix = [
  '--host',
  endpoint,
  'compose',
  '--env-file',
  '/dev/null',
  '--project-directory',
  artifacts,
  '-p',
  project,
  '-f',
  path.join(artifacts, 'compose.json'),
];
const results = [];
let plannedConcurrency = 1;
let frontendSource = 'built';
let interrupted = false;
const controller = new AbortController();
const interrupt = () => {
  interrupted = true;
  controller.abort();
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
console.log(
  JSON.stringify({
    project,
    artifacts,
    memoryGiB: 6,
    cpus: 2,
    stageLimitSeconds: 420,
    network: 'none',
    credentials: 'not_mounted',
  }),
);

const run = async (name, args, deadline = 420_000) => {
  const result = {
    stage: name,
    ...(await runLoggedCommand('docker', [...prefix, ...args], {
      logPath: path.join(artifacts, `${name}.log`),
      timeoutMs: deadline,
      signal: name === 'cleanup' ? undefined : controller.signal,
    })),
  };
  results.push(result);
  console.log(JSON.stringify(result));
  if (result.code !== 0 || result.timedOut || result.aborted) throw new Error('BUILD_STAGE_FAILED');
};

const cleanup = async () => {
  await run('cleanup', ['down', '--remove-orphans'], 30_000);
  if (await docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]))
    throw new Error('OWNED_CONTAINERS_REMAIN');
};

const { digest: frontendHash, files: frontendFiles } = await frontendInputDigest();
const frontendCacheDir = path.join(FRONTEND_CACHE_ROOT, frontendHash);
const canReuse = useCache && !fullBuild && (await cacheComplete(frontendCacheDir));
if (canReuse) {
  await cp(frontendCacheDir, path.join(artifacts, 'dist'), { recursive: true });
  await rm(path.join(artifacts, 'dist', 'youlin-frontend-complete.json'), { force: true });
  frontendSource = 'reused';
  console.log(
    JSON.stringify({
      frontendCacheDir,
      frontendHash,
      frontendSource: 'reused',
      skippedStages: [...frontendVariants],
    }),
  );
}

try {
  if (!canReuse) {
    // The five frontend variants are independent; only the backend stage consumes their output.
    // Parallelism is bounded by measured available memory, so a busy host degrades to serial
    // instead of starving other business services.
    const concurrency = await planConcurrency();
    plannedConcurrency = concurrency;
    console.log(JSON.stringify({ frontendConcurrency: concurrency }));
    let next = 0;
    const worker = async () => {
      while (next < frontendVariants.length) {
        if (interrupted) throw new Error('BUILD_INTERRUPTED');
        const stage = frontendVariants[next++];
        await requireHeadroom(concurrency);
        await run(stage, ['run', '--rm', '--no-deps', stage]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, frontendVariants.length) }, () => worker()),
    );
    if (interrupted) throw new Error('BUILD_INTERRUPTED');
    if (useCache) await publishFrontendCache(frontendCacheDir, frontendHash);
  }
  if (interrupted) throw new Error('BUILD_INTERRUPTED');
  await requireHeadroom(1);
  await run('backend', ['run', '--rm', '--no-deps', 'backend']);
} catch {
  console.error('Build incomplete; inspect the private artifact directory. No runtime deployed.');
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch {
    console.error(`Owned project cleanup unconfirmed: ${project}`);
    process.exitCode = 1;
  }
  await writeFile(
    path.join(artifacts, 'result.json'),
    JSON.stringify(
      {
        project,
        interrupted,
        results,
        complete: !interrupted && process.exitCode !== 1,
        frontend: {
          cache: useCache ? (fullBuild ? 'ignored' : 'allowed') : 'disabled',
          digest: frontendHash,
          inputFiles: frontendFiles,
          source: frontendSource,
        },
        frontendConcurrency: plannedConcurrency,
        toolCaches: caches ? { enabled: true, key: cacheKey } : { enabled: false },
        limitations: [
          'prepared dependencies, not cold build',
          'Next upstream skips types',
          'not a release image, runtime deployment or UAT',
        ],
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  if (interrupted) process.exitCode = 1;
}
