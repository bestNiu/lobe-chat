// Host only coordinates Docker. PostgreSQL AND Node/Vitest run in isolated containers.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  createNodeContainer,
  images,
  localDocker,
  removeContainer,
  root,
  runContainer,
} from './dockerRuntime.mjs';
import { loadIdentityMigrationFixture } from './migrations/fixture.mjs';

if (process.platform !== 'linux') throw new Error('Linux Docker environment only');
const args = process.argv.slice(2);
const sqlSuite = args.includes('--sql');
const artifactOption = args.find((arg) => arg.startsWith('--identity-artifacts='));
const artifactDirectory = artifactOption?.slice('--identity-artifacts='.length);
const schemaOnly = args.includes('--schema-only');
const identitySuite = args.includes('--identity') || artifactOption !== undefined;
if (
  args.some(
    (arg) => !['--sql', '--identity', '--schema-only'].includes(arg) && arg !== artifactOption,
  ) ||
  (sqlSuite && identitySuite) ||
  (schemaOnly && !identitySuite)
)
  throw new Error('Unknown or conflicting verification mode');
const identityFixture = identitySuite
  ? await loadIdentityMigrationFixture(root, artifactDirectory)
  : '';
const docker = await localDocker();
const image = await docker(['image', 'inspect', images.postgres, '--format', '{{.Id}}']);
// Preflight the runner image before allocating any environment resources.
await docker(['image', 'inspect', images.node, '--format', '{{.Id}}']);
const runId = randomUUID();
const container = `youlin-nodepg-${runId}`;
const runner = `youlin-nodepg-runner-${runId}`;
const volume = `youlin-nodepg-socket-${runId}`;
const socket = `/tmp/youlin-nodepg-${runId}/socket`;
let interrupted = false;
const interrupt = () => {
  interrupted = true;
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
console.log(
  JSON.stringify({
    container,
    runner,
    volume,
    image,
    network: 'none',
    ports: [],
    hostTestExecution: false,
  }),
);

try {
  await docker([
    'volume',
    'create',
    '--label',
    `youlin.nodepg-spike=${runId}`,
    '--driver',
    'local',
    '--opt',
    'type=tmpfs',
    '--opt',
    'device=tmpfs',
    '--opt',
    'o=size=8m,mode=0777',
    volume,
  ]);
  await docker([
    'create',
    '--pull=never',
    '--network=none',
    '--memory=512m',
    '--memory-swap=512m',
    '--cpus=1',
    '--pids-limit=128',
    '--name',
    container,
    '--label',
    `youlin.nodepg-spike=${runId}`,
    '--tmpfs',
    '/var/lib/postgresql/data:rw,size=256m',
    '--mount',
    `type=volume,src=${volume},dst=/socket`,
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '-e',
    'POSTGRES_DB=youlin_nodepg',
    image,
    'postgres',
    '-c',
    'listen_addresses=',
    '-c',
    'unix_socket_directories=/var/run/postgresql,/socket',
  ]);
  await docker(['start', container]);
  const limits = JSON.parse(
    await docker(['inspect', '--format', '{{json .HostConfig}}', container]),
  );
  const mounts = JSON.parse(await docker(['inspect', '--format', '{{json .Mounts}}', container]));
  const socketVolumes = mounts.filter((m) => m.Type === 'volume');
  const volumeInfo = JSON.parse(
    await docker(['volume', 'inspect', '--format', '{{json .}}', volume]),
  );
  if (
    limits.NetworkMode !== 'none' ||
    limits.Memory !== 512 * 1024 * 1024 ||
    limits.MemorySwap !== limits.Memory ||
    limits.NanoCpus !== 1_000_000_000 ||
    limits.PidsLimit !== 128 ||
    Object.keys(limits.PortBindings || {}).length ||
    mounts.some((m) => m.Type === 'bind') ||
    socketVolumes.length !== 1 ||
    socketVolumes[0].Name !== volume ||
    volumeInfo.Options.type !== 'tmpfs'
  ) {
    throw new Error('Database isolation verification failed');
  }
  console.log('Database isolation verified: no host bind, no network/TCP, RAM socket volume only');
  let ready = false;
  for (let attempt = 0; attempt < 40 && !interrupted; attempt++) {
    try {
      // Ignore the official image entrypoint's temporary bootstrap server.
      const processes = await docker(['top', container, '-eo', 'pid,comm']);
      if (processes.split('\n')[1]?.trim().split(/\s+/)[1] !== 'postgres') {
        await sleep(250);
        continue;
      }
      await docker([
        'exec',
        container,
        'pg_isready',
        '-h',
        '/socket',
        '-U',
        'postgres',
        '-d',
        'youlin_nodepg',
      ]);
      ready = true;
      break;
    } catch (error) {
      if (attempt === 0) console.log('Waiting for database:', error.message);
      await sleep(250);
    }
  }
  if (!ready || interrupted) throw new Error('Database not ready or interrupted');
  const fixture = await readFile(new URL('./fixtures/revocation.sql', import.meta.url), 'utf8');
  const setupOutput = await docker(
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      '/socket',
      '-U',
      'postgres',
      '-d',
      'youlin_nodepg',
    ],
    fixture +
      identityFixture +
      `
CREATE TABLE youlin_security_spike.test_environment_marker (run_id uuid PRIMARY KEY);
INSERT INTO youlin_security_spike.test_environment_marker VALUES ('${runId}');
CREATE ROLE youlin_reader LOGIN;
GRANT USAGE ON SCHEMA youlin_security_spike TO youlin_reader;
GRANT SELECT ON youlin_security_spike.subject_states TO youlin_reader;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA youlin_security_spike FROM PUBLIC;
`,
  );
  if (identitySuite) console.log(setupOutput);
  if (interrupted) throw new Error('Interrupted before runner creation');
  if (schemaOnly) {
    console.log(
      'Generated identity migration fresh apply and replay completed; repository behavior NOT tested',
    );
  } else {
    const metadata = JSON.parse(
      await readFile(path.join(root, 'node_modules/vitest/package.json'), 'utf8'),
    );
    const bin = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin.vitest;
    await createNodeContainer(docker, {
      name: runner,
      workdir: sqlSuite ? '/workspace' : '/workspace/packages/database',
      documents: sqlSuite,
      socketVolume: volume,
      socketPath: socket,
      env: { YOULIN_NODEPG_SOCKET: socket, YOULIN_NODEPG_RUN: runId },
      args: sqlSuite
        ? [
            '--experimental-strip-types',
            '--test',
            '/workspace/scripts/youlin/revocationPostgres.smoke.mjs',
          ]
        : [
            path.posix.join('/workspace/node_modules/vitest', bin),
            'run',
            '--pool=threads',
            '--maxWorkers=1',
            '--reporter=verbose',
            ...(identitySuite
              ? ['src/repositories/youlinIdentity/__tests__']
              : ['src/experimental/youlinSecurity/__tests__/reader.nodepg.test.ts']),
          ],
    });
    if (interrupted) throw new Error('Interrupted before runner start');
    const result = await runContainer(docker, runner, () => interrupted, 45_000);
    if (result.exitCode !== 0 || result.oomKilled || interrupted)
      throw new Error('Containerized node-postgres tests failed/incomplete');
    console.log(
      `Containerized ${sqlSuite ? 'SQL' : identitySuite ? 'identity repository' : 'node-postgres'} integration: passed`,
    );
  }
} catch (error) {
  console.error('Docker verification failed:', error);
  process.exitCode = 1;
} finally {
  let containersRemoved = true;
  for (const name of [runner, container]) {
    try {
      await removeContainer(docker, name);
    } catch (error) {
      console.error(`Inspect only ${name}:`, error);
      containersRemoved = false;
      process.exitCode = 1;
    }
  }
  try {
    if (containersRemoved) {
      if (await docker(['volume', 'ls', '-q', '--filter', `name=^${volume}$`]))
        await docker(['volume', 'rm', volume]);
      if (await docker(['volume', 'ls', '-q', '--filter', `name=^${volume}$`])) {
        console.error('Socket volume cleanup unconfirmed');
        process.exitCode = 1;
      } else console.log('Both containers and RAM socket volume cleanup: verified');
    } else console.error(`Preserve ${volume} until owned containers are removed`);
  } catch (error) {
    console.error('Owned volume cleanup failed:', error);
    process.exitCode = 1;
  }
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
