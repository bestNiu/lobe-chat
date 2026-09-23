// Local synthetic environment only. Never consumes DATABASE_URL or product migrations.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { runProcess } from './postgresHarness.mjs';

if (process.platform !== 'linux') throw new Error('Linux local socket environment only');
const root = fileURLToPath(new URL('../../', import.meta.url));
const endpoint =
  process.env.DOCKER_HOST ||
  (await runProcess('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']));
if (!endpoint.startsWith('unix://')) throw new Error('Only local Docker is allowed');
const docker = (args, input = '') => runProcess('docker', ['--host', endpoint, ...args], input);
const image = await docker(['image', 'inspect', 'postgres:15-alpine', '--format', '{{.Id}}']);
const runId = randomUUID();
const container = `youlin-nodepg-${runId}`;
const temp = await mkdtemp('/tmp/youlin-nodepg-');
const socket = path.join(temp, 'socket');
let child;
let interrupted;
const killTests = () => {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') {
      console.error('Test process group cleanup failed:', error);
      process.exitCode = 1;
    }
  }
};
const interrupt = () => {
  interrupted = true;
  killTests();
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
console.log(
  JSON.stringify({ container, temp, image, memoryMiB: 512, cpus: 1, network: 'none', ports: [] }),
);

try {
  await chmod(temp, 0o700);
  await mkdir(socket, { mode: 0o777 });
  await chmod(socket, 0o777);
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
    `type=bind,src=${socket},dst=/socket`,
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '-e',
    'POSTGRES_DB=youlin_nodepg',
    '-e',
    'PGHOST=/socket',
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
  const binds = mounts.filter((mount) => mount.Type === 'bind');
  const parentMode = (await stat(temp)).mode & 0o777;
  if (
    limits.NetworkMode !== 'none' ||
    limits.Memory !== 512 * 1024 * 1024 ||
    limits.MemorySwap !== limits.Memory ||
    limits.NanoCpus !== 1_000_000_000 ||
    limits.PidsLimit !== 128 ||
    Object.keys(limits.PortBindings || {}).length !== 0 ||
    parentMode !== 0o700 ||
    binds.length !== 1 ||
    binds[0].Source !== socket ||
    binds[0].Destination !== '/socket' ||
    mounts.some((mount) => mount.Type === 'volume')
  ) {
    throw new Error('Local environment isolation does not match the intended limits');
  }
  console.log(
    JSON.stringify({
      verifiedIsolation: true,
      network: limits.NetworkMode,
      memoryBytes: limits.Memory,
      nanoCpus: limits.NanoCpus,
      pidLimit: limits.PidsLimit,
      socketParentMode: parentMode.toString(8),
      persistentVolumes: 0,
      publishedPorts: 0,
    }),
  );
  let ready = false;
  for (let attempt = 0; attempt < 40 && !interrupted; attempt++) {
    try {
      // The entrypoint starts a temporary socket server during init. Wait for
      // PID 1 to exec the final postgres before declaring the database ready.
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
      if (attempt === 0) console.log('Waiting for private socket readiness:', error.message);
      await sleep(250);
    }
  }
  if (!ready || interrupted) throw new Error('Synthetic environment not ready or interrupted');
  const fixture = await readFile(new URL('./fixtures/revocation.sql', import.meta.url), 'utf8');
  await docker(
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
      `
CREATE TABLE youlin_security_spike.test_environment_marker (run_id uuid PRIMARY KEY);
INSERT INTO youlin_security_spike.test_environment_marker VALUES ('${runId}');
CREATE ROLE youlin_reader LOGIN;
GRANT USAGE ON SCHEMA youlin_security_spike TO youlin_reader;
GRANT SELECT ON youlin_security_spike.subject_states TO youlin_reader;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA youlin_security_spike FROM PUBLIC;
`,
  );
  if (interrupted) throw new Error('Interrupted before tests');
  const vitestPackage = JSON.parse(
    await readFile(path.join(root, 'node_modules/vitest/package.json'), 'utf8'),
  );
  const bin = typeof vitestPackage.bin === 'string' ? vitestPackage.bin : vitestPackage.bin.vitest;
  if (interrupted) throw new Error('Interrupted before spawning tests');
  const code = await new Promise((resolve, reject) => {
    child = spawn(
      process.execPath,
      [
        path.join(root, 'node_modules/vitest', bin),
        'run',
        '--pool=threads',
        '--maxWorkers=1',
        '--reporter=verbose',
        'src/experimental/youlinSecurity/__tests__/reader.nodepg.test.ts',
      ],
      {
        cwd: path.join(root, 'packages/database'),
        detached: true,
        stdio: 'inherit',
        env: { ...process.env, YOULIN_NODEPG_SOCKET: socket, YOULIN_NODEPG_RUN: runId },
      },
    );
    const timer = setTimeout(killTests, 45_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  if (code !== 0 || interrupted) throw new Error(`Node-postgres tests incomplete/failed: ${code}`);
  console.log('Node-postgres integration: passed');
} catch (error) {
  console.error('Local node-postgres verification failed:', error);
  try {
    console.error(
      await runProcess(
        'docker',
        ['--host', endpoint, 'logs', '--tail=40', container],
        '',
        undefined,
        true,
      ),
    );
  } catch (logError) {
    console.error('Synthetic container diagnostics unavailable:', logError);
  }
  process.exitCode = 1;
} finally {
  killTests();
  try {
    const filter = `name=^/${container}$`;
    if (await docker(['ps', '-aq', '--filter', filter]))
      await docker(['rm', '--force', '--volumes', container]);
    if (await docker(['ps', '-aq', '--filter', filter])) {
      console.error(`Container cleanup unconfirmed: ${container}; preserve ${temp} for inspection`);
      process.exitCode = 1;
    } else {
      await rm(temp, { recursive: true, force: true });
      console.log('Node-postgres container / volume / socket directory cleanup: verified');
    }
  } catch (error) {
    console.error(`Cleanup failed; inspect only ${container} and ${temp}:`, error);
    process.exitCode = 1;
  }
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
