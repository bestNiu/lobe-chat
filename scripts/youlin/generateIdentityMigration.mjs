// Host orchestration/artifact archival only. Generation runs in a network-disabled container.
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

import { createNodeContainer, localDocker, removeContainer } from './dockerRuntime.mjs';

const docker = await localDocker();
const name = `youlin-migration-${randomUUID()}`;
const destination = await mkdtemp('/tmp/youlin-migration-');
let interrupted = false;
const interrupt = () => {
  interrupted = true;
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
console.log(JSON.stringify({ container: name, artifacts: destination, repositoryWrites: false }));
try {
  await createNodeContainer(docker, {
    name,
    migrationArtifacts: true,
    args: ['/workspace/scripts/youlin/migrations/generate.mjs'],
    env: { GOMAXPROCS: '2' },
  });
  await docker(['start', name]);
  const deadline = Date.now() + 90_000;
  while (true) {
    if (interrupted || Date.now() >= deadline)
      throw new Error('Generation interrupted or observation deadline reached');
    const state = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', name]));
    if (!state.Running)
      throw new Error(
        `Generation exited before archival: ${state.ExitCode}; OOM=${state.OOMKilled}`,
      );
    const marker = await docker([
      'exec',
      name,
      'sh',
      '-c',
      'if test -f /tmp/youlin-generation.ready; then printf ready; fi',
    ]);
    if (marker === 'ready') break;
    await sleep(200);
  }
  // Docker archive/cp cannot reliably see this OCI tmpfs mount. Transfer a bounded bundle
  // through exec while the process is live; decoding and writing artifacts is host archival.
  const encoded = await docker([
    'exec',
    name,
    'node',
    '--input-type=module',
    '-e',
    "import { readFile } from 'node:fs/promises'; process.stdout.write((await readFile('/tmp/youlin-generated.bundle')).toString('base64'));",
  ]);
  const bundle = JSON.parse(
    (
      await promisify(gunzip)(Buffer.from(encoded, 'base64'), { maxOutputLength: 32 * 1024 * 1024 })
    ).toString(),
  );
  const allowed =
    /^(?:\d{4,6}_[\w-]+\.sql|\d{4,6}_snapshot\.json|_journal\.json|database-schema\.dbml|upstream-users-baseline\.sql|generation\.json)$/;
  if (
    !Array.isArray(bundle) ||
    bundle.length !== 7 ||
    new Set(bundle.map((file) => file.name)).size !== 7 ||
    bundle.some((file) => !allowed.test(file.name) || typeof file.base64 !== 'string')
  )
    throw new Error('Unexpected generated artifact names');
  for (const file of bundle)
    await writeFile(path.join(destination, file.name), Buffer.from(file.base64, 'base64'), {
      flag: 'wx',
      mode: 0o600,
    });
  if (interrupted) throw new Error('Interrupted during artifact archival');
  await docker(['exec', name, 'touch', '/tmp/youlin-generation.release']);
  while (true) {
    if (interrupted || Date.now() >= deadline) throw new Error('Generation completion unconfirmed');
    const state = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', name]));
    if (!state.Running) {
      if (state.ExitCode !== 0 || state.OOMKilled)
        throw new Error('Generation process failed after archival');
      break;
    }
    await sleep(200);
  }
  console.log(await docker(['logs', name], '', true));
  console.log(`Generated artifacts archived at ${destination}; NOT installed or deployed`);
} catch (error) {
  console.error('Migration generation failed:', error);
  try {
    console.error(await docker(['logs', name], '', true));
  } catch {
    console.error('Generation logs unavailable');
  }
  process.exitCode = 1;
} finally {
  await removeContainer(docker, name);
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  console.log('Migration container cleanup: verified; generated artifacts retained for review');
}
