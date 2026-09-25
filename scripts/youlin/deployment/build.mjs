// Host coordinates Docker only; all compilation runs in bounded, offline containers.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { images, localDocker, root } from '../dockerRuntime.mjs';
import { prepareBuild } from './prepare.mjs';
import { frontendVariants } from './profiles.mjs';
import { runLoggedCommand } from './runLoggedCommand.mjs';

if (process.argv.length !== 2) throw new Error('This bounded builder accepts no overrides');
const docker = await localDocker();
await docker(['image', 'inspect', images.node, '--format', '{{.Id}}']);
// Reserve headroom for existing services. Do not reclaim caches or touch their containers.
const requireHeadroom = async () => {
  const memory = await readFile('/proc/meminfo', 'utf8');
  const availableKiB = Number(memory.match(/^MemAvailable:\s+(\d+) kB$/m)?.[1]);
  if (!Number.isFinite(availableKiB) || availableKiB < 8 * 1024 * 1024)
    throw new Error('INSUFFICIENT_HEADROOM: require 8GiB available for a 6GiB serial builder');
};
await requireHeadroom();
const artifacts = await prepareBuild({ repository: root, image: images.node });
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

try {
  for (const stage of [...frontendVariants, 'backend']) {
    if (interrupted) throw new Error('BUILD_INTERRUPTED');
    await requireHeadroom();
    await run(stage, ['run', '--rm', '--no-deps', stage]);
  }
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
