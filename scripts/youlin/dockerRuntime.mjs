// Host-side Docker orchestration only. All supplied commands execute in containers.
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { runProcess } from './postgresHarness.mjs';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const images = JSON.parse(
  await readFile(new URL('./docker/images.json', import.meta.url), 'utf8'),
);

export const localDocker = async () => {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid() === 0)
    throw new Error('This runner requires a non-root Linux x64 coordinator');
  const endpoint =
    process.env.DOCKER_HOST ||
    (await runProcess('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']));
  if (!endpoint.startsWith('unix://')) throw new Error('Only a local Docker socket is allowed');
  return (args, input = '', includeStderr = false) =>
    runProcess('docker', ['--host', endpoint, ...args], input, undefined, includeStderr);
};

export const removeContainer = async (docker, name) => {
  const filter = `name=^/${name}$`;
  if (await docker(['ps', '-aq', '--filter', filter]))
    await docker(['rm', '--force', '--volumes', name]);
  if (await docker(['ps', '-aq', '--filter', filter]))
    throw new Error(`Cleanup unconfirmed: ${name}`);
};

export const createNodeContainer = async (
  docker,
  {
    name,
    args,
    env = {},
    workdir = '/workspace',
    socketVolume,
    socketPath,
    writableFiles = [],
    memoryMiB = 2048,
    gitMetadata = false,
    documents = false,
    networkContainer,
    migrationArtifacts = false,
  },
) => {
  const image = await docker(['image', 'inspect', images.node, '--format', '{{.Id}}']);
  let network = 'none';
  if (networkContainer) {
    const [peer] = JSON.parse(await docker(['inspect', networkContainer]));
    if (peer.HostConfig.NetworkMode !== 'none' || !peer.Config.Labels?.['youlin.identity-lab'])
      throw new Error('Only an owned, network-disabled identity container may share its namespace');
    network = `container:${peer.Id}`;
  }
  const mounts = [];
  // No checkout-root mount: .git, root .env files, docs/know and Docker socket
  // are not exposed. Nested source directories are not a general Secret sandbox.
  for (const entry of [
    'apps',
    'packages',
    'src',
    'tests',
    'scripts',
    'node_modules',
    '.agents/scripts',
    '.github/workflows/youlin-verify.yml',
    'package.json',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'drizzle.config.ts',
    'vitest.config.mts',
    'eslint.config.mjs',
    'eslint-suppressions.json',
    'prettier.config.mjs',
    'stylelint.config.mjs',
    '.stylelintignore',
    '.prettierignore',
    '.editorconfig',
  ]) {
    mounts.push(
      '--mount',
      `type=bind,src=${path.join(root, entry)},dst=/workspace/${entry},readonly`,
    );
  }
  if (migrationArtifacts) {
    if (documents || writableFiles.length || networkContainer || socketVolume)
      throw new Error('Migration generation cannot combine write/network/service profiles');
    mounts.push(
      '--mount',
      `type=bind,src=${path.join(root, 'packages/database/migrations')},dst=/migration-source,readonly`,
      '--tmpfs',
      '/workspace/packages/database/migrations:rw,size=256m,mode=1777',
      '--tmpfs',
      '/workspace/docs/development:rw,size=32m,mode=1777',
    );
  }
  if (documents) {
    mounts.push(
      '--mount',
      `type=bind,src=${path.join(root, 'docs')},dst=/workspace/docs,readonly`,
      '--tmpfs',
      '/workspace/docs/youlin-enterprise-ai-platform/know:ro,size=1m',
    );
  }
  for (const file of writableFiles) {
    if (
      path.isAbsolute(file) ||
      file.split('/').includes('..') ||
      !/\.(?:mjs|ts|mts|tsx)$/.test(file)
    )
      throw new Error('Invalid lint write target');
    mounts.push('--mount', `type=bind,src=${path.join(root, file)},dst=/workspace/${file}`);
  }
  for (const cache of [
    'node_modules/.vite',
    'node_modules/.vite-temp',
    'packages/database/node_modules/.vite',
    'packages/database/node_modules/.vite-temp',
    'packages/trpc/node_modules/.vite',
    'packages/trpc/node_modules/.vite-temp',
    'packages/openapi/node_modules/.vite',
    'packages/openapi/node_modules/.vite-temp',
  ]) {
    // Mountpoints only, not host test execution or host-side dependency install.
    await mkdir(path.join(root, cache), { recursive: true });
    mounts.push('--tmpfs', `/workspace/${cache}:rw,size=128m,mode=1777`);
  }
  if (socketVolume)
    mounts.push('--mount', `type=volume,src=${socketVolume},dst=${socketPath},readonly`);
  if (gitMetadata) mounts.push('--tmpfs', '/workspace/.git:rw,size=16m,mode=1777');
  const variables = Object.entries({
    HOME: '/tmp',
    XDG_DATA_HOME: '/tmp/data',
    XDG_CACHE_HOME: '/tmp/cache',
    NO_COLOR: '1',
    VITEST_MAX_WORKERS: '1',
    ...env,
  }).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  await docker([
    'create',
    '--pull=never',
    '--init',
    '--read-only',
    `--network=${network}`,
    `--memory=${memoryMiB}m`,
    `--memory-swap=${memoryMiB}m`,
    '--cpus=2',
    '--pids-limit=128',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '--tmpfs',
    '/tmp:rw,size=256m,mode=1777',
    '--name',
    name,
    '--label',
    'youlin.docker-test=true',
    ...mounts,
    ...variables,
    '--workdir',
    workdir,
    '--entrypoint',
    'node',
    image,
    ...args,
  ]);
  const info = JSON.parse(await docker(['inspect', '--format', '{{json .HostConfig}}', name]));
  const actualMounts = JSON.parse(await docker(['inspect', '--format', '{{json .Mounts}}', name]));
  if (
    info.NetworkMode !== network ||
    !info.ReadonlyRootfs ||
    info.Memory !== memoryMiB * 1024 * 1024 ||
    info.MemorySwap !== info.Memory ||
    info.NanoCpus !== 2_000_000_000 ||
    info.PidsLimit !== 128 ||
    Object.keys(info.PortBindings || {}).length ||
    actualMounts.some(
      (m) =>
        m.Type === 'bind' &&
        m.RW &&
        !writableFiles.some((f) => m.Destination === `/workspace/${f}`),
    )
  ) {
    throw new Error('Node runner isolation verification failed');
  }
  console.log(
    JSON.stringify({
      nodeContainer: name,
      image,
      memoryMiB,
      cpus: 2,
      network,
      readonlyRoot: true,
      writableFiles,
      inheritedHostEnvironment: false,
    }),
  );
};

export const runContainer = async (
  docker,
  name,
  interrupted = () => false,
  deadlineMs = 60_000,
) => {
  await docker(['start', name]);
  const deadline = Date.now() + deadlineMs;
  let result;
  while (true) {
    const state = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', name]));
    if (!state.Running) {
      result = {
        exitCode: state.ExitCode,
        oomKilled: state.OOMKilled,
        status: 'exited',
      };
      break;
    }
    if (interrupted() || Date.now() >= deadline) {
      result = {
        exitCode: null,
        status: interrupted() ? 'interrupted' : 'timeout',
      };
      break;
    }
    await sleep(200);
  }
  console.log(await docker(['logs', name], '', true));
  console.log(JSON.stringify({ container: name, ...result }));
  return result;
};
