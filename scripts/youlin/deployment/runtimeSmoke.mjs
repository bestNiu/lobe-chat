// Host coordinates an isolated synthetic runtime; assertions execute inside containers.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { localDocker } from '../dockerRuntime.mjs';
import { runLoggedCommand } from './runLoggedCommand.mjs';
import { createRuntimeSmokeProfile, runtimeImages } from './runtimeSmokeProfile.mjs';

if (process.argv.length !== 3 || !/^sha256:[a-f0-9]{64}$/.test(process.argv[2]))
  throw new Error('Usage: node scripts/youlin/deployment/runtimeSmoke.mjs <local-image-sha256>');
const docker = await localDocker();
const memory = await readFile('/proc/meminfo', 'utf8');
const availableKiB = Number(memory.match(/^MemAvailable:\s+(\d+) kB$/m)?.[1]);
if (!Number.isFinite(availableKiB) || availableKiB < 6 * 1024 * 1024)
  throw new Error('INSUFFICIENT_HEADROOM: require 6GiB available for the isolated runtime');
for (const image of [process.argv[2], ...Object.values(runtimeImages)])
  await docker(['image', 'inspect', image, '--format', '{{.Id}}']);
const artifacts = await mkdtemp(path.join(os.tmpdir(), 'youlin-runtime-smoke-'));
const project = `youlin-runtime-${randomUUID()}`;
const password = randomBytes(24).toString('hex');
const databaseUrl = `postgres://youlin_fixture:${password}@postgres:5432/youlin_fixture`;
const files = {
  'database.env': `POSTGRES_USER=youlin_fixture\nPOSTGRES_DB=youlin_fixture\nPOSTGRES_PASSWORD=${password}\n`,
  'migration.env': `DATABASE_DRIVER=node\nDATABASE_URL=${databaseUrl}\n`,
  'app.env': `DATABASE_DRIVER=node\nDATABASE_URL=${databaseUrl}\nAUTH_SECRET=${randomBytes(32).toString('hex')}\nKEY_VAULTS_SECRET=${randomBytes(32).toString('base64')}\nAPP_URL=http://app:3210\nREDIS_URL=redis://redis:6379\nAUTH_DISABLE_EMAIL_PASSWORD=1\nNEXT_TELEMETRY_DISABLED=1\n`,
  'compose.json':
    JSON.stringify(createRuntimeSmokeProfile({ artifacts, image: process.argv[2] }), null, 2) +
    '\n',
};
for (const [name, contents] of Object.entries(files))
  await writeFile(path.join(artifacts, name), contents, { mode: 0o600, flag: 'wx' });
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
const controller = new AbortController();
const interrupt = () => controller.abort();
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
const results = [];
console.log(
  JSON.stringify({ project, artifacts, syntheticOnly: true, hostPorts: false, realLogin: false }),
);
const run = async (stage, args, timeoutMs = 60_000, cleanup = false) => {
  const result = {
    stage,
    ...(await runLoggedCommand('docker', [...prefix, ...args], {
      logPath: path.join(artifacts, `${stage}.log`),
      timeoutMs,
      signal: cleanup ? undefined : controller.signal,
    })),
  };
  results.push(result);
  console.log(JSON.stringify(result));
  if (result.code !== 0 || result.timedOut || result.aborted)
    throw new Error('RUNTIME_STAGE_FAILED');
};
const cleanup = async () => {
  await run('cleanup', ['down', '--volumes', '--remove-orphans'], 30_000, true);
  for (const kind of ['container', 'network', 'volume']) {
    const remaining = await docker([
      kind,
      'ls',
      kind === 'container' ? '-aq' : '-q',
      '--filter',
      `label=com.docker.compose.project=${project}`,
    ]);
    if (remaining) throw new Error('OWNED_RESOURCES_REMAIN');
  }
};
try {
  await run('startup', ['up', '-d', '--wait', '--wait-timeout', '150', 'app'], 180_000);
  await run('migration-replay', ['run', '--rm', '--no-deps', 'migrate']);
  await run('http', ['run', '--rm', '--no-deps', 'probe']);
  await run('migration-count', [
    'run',
    '--rm',
    '--no-deps',
    'migrate',
    'node',
    '-e',
    `
    const { Pool } = require('pg');
    const { readFile } = require('node:fs/promises');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    (async () => {
      try {
        const expected = JSON.parse(await readFile('/app/migrations/meta/_journal.json', 'utf8')).entries.length;
        const { rows } = await pool.query('SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations');
        if (rows[0].count !== expected || expected < 1) throw new Error('MIGRATION_COUNT');
        console.log(JSON.stringify({ applied: rows[0].count, expected }));
      } finally { await pool.end(); }
    })().catch(() => { console.error('MIGRATION_COUNT_FAILED'); process.exitCode = 1; });
  `,
  ]);
  // One synthetic sentinel only; this does NOT certify business-data restore or RPO/RTO.
  await run('backup-restore', [
    'exec',
    '-T',
    'postgres',
    'sh',
    '-ec',
    `
    psql -U youlin_fixture -d youlin_fixture -v ON_ERROR_STOP=1 -c "INSERT INTO users(id) VALUES ('youlin-smoke-sentinel')";
    before=$(psql -U youlin_fixture -d youlin_fixture -Atc 'SELECT count(*) FROM drizzle.__drizzle_migrations');
    pg_dump -U youlin_fixture -Fc -f /tmp/youlin-empty.dump youlin_fixture;
    createdb -U youlin_fixture --template=template0 youlin_restore;
    pg_restore -U youlin_fixture --exit-on-error -d youlin_restore /tmp/youlin-empty.dump;
    after=$(psql -U youlin_fixture -d youlin_restore -Atc 'SELECT count(*) FROM drizzle.__drizzle_migrations');
    test "$before" = "$after";
    test "$(psql -U youlin_fixture -d youlin_restore -Atc "SELECT count(*) FROM users WHERE id='youlin-smoke-sentinel'")" = 1;
    printf 'restored migrations=%s; synthetic sentinel=1\\n' "$after";
  `,
  ]);
} catch {
  console.error('Synthetic runtime verification incomplete; private evidence retained.');
  process.exitCode = 1;
} finally {
  try {
    await run('service-logs', ['logs', '--no-color'], 30_000, true);
  } catch {
    process.exitCode = 1;
    console.error('Runtime log capture incomplete');
  }
  try {
    await cleanup();
  } catch {
    process.exitCode = 1;
    console.error(`Owned runtime cleanup unconfirmed: ${project}`);
  }
  await writeFile(
    path.join(artifacts, 'result.json'),
    JSON.stringify(
      {
        project,
        results,
        complete: process.exitCode !== 1 && !controller.signal.aborted,
        limitations: [
          'no browser/login/chat/S3/SMTP',
          'empty-schema plus one synthetic sentinel backup only',
          'not UAT or production deployment',
        ],
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  if (controller.signal.aborted) process.exitCode = 1;
}
