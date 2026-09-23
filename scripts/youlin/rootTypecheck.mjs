// Resource-bounded root type check. No dependency installation or production access.
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { runProcess } from './postgresHarness.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const endpoint =
  process.env.DOCKER_HOST ||
  (await runProcess('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']));
if (!endpoint.startsWith('unix://')) throw new Error('Only local Docker is allowed');
const docker = (args, includeStderr = false) =>
  runProcess('docker', ['--host', endpoint, ...args], '', undefined, includeStderr);
const image = await docker([
  'image',
  'inspect',
  'python:3.12-slim-bookworm',
  '--format',
  '{{.Id}}',
]);
const packageDir = await realpath(path.resolve(root, 'node_modules/@typescript/native-preview'));
if (process.platform !== 'linux' || process.arch !== 'x64')
  throw new Error('Linux x64 runner only');
const require = createRequire(path.resolve(packageDir, 'package.json'));
const platformPackage = require.resolve('@typescript/native-preview-linux-x64/package.json');
const executable = await realpath(path.resolve(path.dirname(platformPackage), 'lib/tsgo'));
const entry = path.relative(root, executable);
if (entry.startsWith('..') || entry.startsWith('/'))
  throw new Error('Compiler must be inside checkout');
const limitMs = 60_000;
const container = `youlin-typecheck-${randomUUID()}`;
let result;
let interrupted;
const onInterrupt = () => {
  interrupted = 'SIGINT';
};
const onTerminate = () => {
  interrupted = 'SIGTERM';
};
process.once('SIGINT', onInterrupt);
process.once('SIGTERM', onTerminate);
console.log(`Typecheck container: ${container}`);

try {
  await docker([
    'create',
    '--pull=never',
    '--network=none',
    '--read-only',
    '--memory=4g',
    '--memory-swap=4g',
    '--cpus=2',
    '--pids-limit=512',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '--name',
    container,
    '--label',
    'youlin.typecheck-spike=true',
    '--mount',
    `type=bind,src=${root},dst=/workspace,readonly`,
    '--tmpfs',
    '/workspace/.git:ro,size=1m',
    '--tmpfs',
    '/workspace/docs/youlin-enterprise-ai-platform/know:ro,size=1m',
    '--tmpfs',
    '/tmp:rw,size=128m,mode=1777',
    '-e',
    'GOMAXPROCS=2',
    '-e',
    'GOMEMLIMIT=3GiB',
    '--workdir',
    '/workspace',
    '--entrypoint',
    `/workspace/${entry}`,
    image,
    '--noEmit',
    '--tsBuildInfoFile',
    '/tmp/youlin.tsbuildinfo',
  ]);
  await docker(['start', container]);
  const deadline = Date.now() + limitMs;
  while (true) {
    const state = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', container]));
    if (!state.Running) {
      const logs = await docker(['logs', container], true);
      if (logs) console.log(logs);
      result = {
        exitCode: state.ExitCode,
        oomKilled: state.OOMKilled,
        status: state.ExitCode === 0 ? 'passed' : 'failed',
      };
      break;
    }
    if (interrupted || Date.now() >= deadline) {
      result = { exitCode: null, oomKilled: null, status: interrupted ? 'interrupted' : 'timeout' };
      break;
    }
    await sleep(500);
  }
  console.log(
    JSON.stringify({
      ...result,
      image,
      memoryLimit: '4GiB',
      cpuLimit: 2,
      pidLimit: 512,
      deadlineMs: limitMs,
      scope: 'root tsconfig unchanged; cache redirected to /tmp',
    }),
  );
  process.exitCode =
    result.status === 'passed'
      ? 0
      : interrupted === 'SIGTERM'
        ? 143
        : interrupted === 'SIGINT'
          ? 130
          : 1;
} catch (error) {
  console.error('Typecheck coordinator failed:', error);
  process.exitCode = 1;
} finally {
  try {
    const filter = `name=^/${container}$`;
    const exists = await docker(['ps', '-aq', '--no-trunc', '--filter', filter]);
    if (exists) await docker(['rm', '--force', '--volumes', container]);
    const remaining = await docker(['ps', '-aq', '--no-trunc', '--filter', filter]);
    if (remaining) {
      console.error(`Typecheck cleanup unconfirmed: ${container}`);
      process.exitCode = 1;
    } else console.log('Typecheck container cleanup: verified');
  } catch (error) {
    console.error(`Typecheck cleanup failed; inspect only ${container}:`, error);
    process.exitCode = 1;
  }
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
}
