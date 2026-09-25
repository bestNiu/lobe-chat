// Host archives build outputs and coordinates Docker. No credential/config ingestion.
import { randomUUID } from 'node:crypto';
import { access, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { images, localDocker, removeContainer, root } from '../dockerRuntime.mjs';
import { copyImageInputs } from './copyImageInputs.mjs';
import { runLoggedCommand } from './runLoggedCommand.mjs';

if (process.argv.length !== 3)
  throw new Error('Usage: node scripts/youlin/deployment/package.mjs <build-artifacts>');
const artifacts = await realpath(process.argv[2]);
const result = JSON.parse(await readFile(path.join(artifacts, 'result.json'), 'utf8'));
if (
  result.complete !== true ||
  result.interrupted !== false ||
  !['desktop', 'mobile', 'auth', 'workbench', 'share', 'backend', 'cleanup'].every((stage) =>
    result.results.some(
      (entry) => entry.stage === stage && entry.code === 0 && entry.timedOut === false,
    ),
  )
)
  throw new Error('COMPLETE_BUILD_REQUIRED');
await access(path.join(artifacts, 'next/standalone/server.js'));
await access(path.join(artifacts, 'next/standalone/node_modules/pg'));
const docker = await localDocker();
await docker(['image', 'inspect', images.nodeBase, '--format', '{{.Id}}']);
const context = await copyImageInputs(artifacts, root);
const id = randomUUID();
const container = `youlin-package-${id}`;
const image = `youlin-mvp:${id}`;
console.log(
  JSON.stringify({ context, image, credentials: 'not_loaded', productionApproval: false }),
);
const endpoint =
  process.env.DOCKER_HOST ||
  (await docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']));
const controller = new AbortController();
const interrupt = () => controller.abort();
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  const bundle = await runLoggedCommand(
    'docker',
    [
      '--host',
      endpoint,
      'run',
      '--name',
      container,
      '--pull=never',
      '--network=none',
      '--read-only',
      '--memory=1g',
      '--memory-swap=1g',
      '--cpus=1',
      '--pids-limit=64',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--user',
      `${process.getuid()}:${process.getgid()}`,
      '--tmpfs',
      '/tmp:rw,size=64m,mode=1777',
      '--mount',
      `type=bind,src=${path.join(root, 'scripts/migrateServerDB')},dst=/workspace/migrate-source,readonly`,
      '--mount',
      `type=bind,src=${path.join(root, 'node_modules')},dst=/workspace/node_modules,readonly`,
      '--mount',
      `type=bind,src=${context},dst=/output`,
      '--workdir',
      '/workspace',
      '--entrypoint',
      'node',
      images.node,
      '/workspace/node_modules/esbuild/bin/esbuild',
      '/workspace/migrate-source/docker.cjs',
      '--bundle',
      '--platform=node',
      '--format=cjs',
      '--external:pg',
      '--outfile=/output/migrate.cjs',
    ],
    { logPath: path.join(context, 'bundle.log'), timeoutMs: 30_000, signal: controller.signal },
  );
  if (bundle.code !== 0 || bundle.timedOut || bundle.aborted)
    throw new Error('MIGRATION_BUNDLE_FAILED');
  // Legacy builder: packaging consists of COPY only; no unbounded buildkit compilation.
  const build = await runLoggedCommand(
    'docker',
    [
      '--host',
      endpoint,
      'build',
      '--network=none',
      '--pull=false',
      '--memory=1g',
      '--memory-swap=1g',
      '--cpu-period=100000',
      '--cpu-quota=100000',
      '-t',
      image,
      context,
    ],
    {
      logPath: path.join(context, 'image-build.log'),
      timeoutMs: 120_000,
      env: { ...process.env, DOCKER_BUILDKIT: '0' },
      signal: controller.signal,
    },
  );
  if (build.code !== 0 || build.timedOut || build.aborted) throw new Error('IMAGE_BUILD_FAILED');
  const imageId = await docker(['image', 'inspect', image, '--format', '{{.Id}}']);
  await writeFile(
    path.join(context, 'image.json'),
    JSON.stringify(
      {
        image,
        imageId,
        sourceArtifacts: artifacts,
        limitations: [
          'prepared dependency build',
          'not full typecheck',
          'not production approval or UAT',
        ],
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  console.log(JSON.stringify({ image, imageId }));
} catch {
  console.error('Image packaging incomplete; private artifacts retained.');
  process.exitCode = 1;
} finally {
  await removeContainer(docker, container);
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  if (controller.signal.aborted) process.exitCode = 1;
}
