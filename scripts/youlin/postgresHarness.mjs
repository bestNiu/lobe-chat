// Synthetic-only local harness. No DATABASE_URL, ports, mounts, networks or pulls.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

export const runProcess = (file, args, input = '', signal) => new Promise((resolve, reject) => {
  const child = execFile(file, args, { maxBuffer: 1024 * 1024, signal, timeout: 30_000 },
    (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout.trim());
    });
  // All inputs are generated fixtures. Never use this harness with real records.
  child.stdin.on('error', (error) => reject(error));
  child.stdin.end(input);
});

export async function createPostgresHarness() {
  const endpoint = process.env.DOCKER_HOST || await runProcess('docker', [
    'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}',
  ]);
  if (!endpoint.startsWith('unix://')) throw new Error('Only a local Docker Unix socket is allowed');
  const docker = (args, input, signal) => runProcess('docker', ['--host', endpoint, ...args], input, signal);
  const image = await docker(['image', 'inspect', 'postgres:15-alpine', '--format', '{{.Id}}']);
  const runId = randomUUID();
  let container;

  const query = (sql, params = {}, signal) => {
    const values = Object.entries(params).map(([key, value]) => {
      if (!/^[a-z_]+$/.test(key)) throw new Error('Invalid fixture parameter name');
      return `--set=${key}=${String(value)}`;
    });
    return docker(['exec', '-i', '-e', 'PGOPTIONS=-c statement_timeout=5000 -c lock_timeout=3000',
      container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d',
      'youlin_synthetic', ...values], sql, signal);
  };
  const json = async (sql, params, signal) => {
    const output = await query(sql, params, signal);
    return output === '' ? null : JSON.parse(output);
  };
  const cleanup = async () => {
    if (!container) return;
    await docker(['rm', '--force', '--volumes', container]);
    const remaining = await docker(['ps', '-aq', '--no-trunc', '--filter', `id=${container}`]);
    if (remaining) throw new Error('Disposable container cleanup was not confirmed');
    console.log('Disposable PostgreSQL cleanup: verified');
    container = undefined;
  };

  try {
    container = await docker(['create', '--pull=never', '--network=none', '--memory=512m', '--cpus=1',
      '--tmpfs', '/var/lib/postgresql/data:rw,size=256m',
      '--name', `youlin-revocation-${runId}`, '--label', `youlin.revocation-spike=${runId}`,
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=youlin_synthetic', image]);
    await docker(['start', container]);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        await docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'youlin_synthetic']);
        ready = true;
        break;
      } catch {
        if (attempt === 0) console.log('Waiting for disposable PostgreSQL readiness');
        await sleep(250);
      }
    }
    if (!ready) throw new Error('Disposable PostgreSQL did not become ready');
    await query(await readFile(new URL('./fixtures/revocation.sql', import.meta.url), 'utf8'));
    console.log(`Synthetic PostgreSQL image: ${image}; server: ${await query('SHOW server_version;')}`);
    return { cleanup, json, query };
  } catch (error) {
    console.error('Disposable PostgreSQL setup failed; cleaning up');
    await cleanup();
    throw error;
  }
}
