// Runs only inside the isolated generation container. No database connection is opened.
import { access, cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

import { runProcess } from '../postgresHarness.mjs';
import { hardenIdentityMigration } from './harden.mjs';

const root = '/workspace';
const output = '/tmp/youlin-generated';
process.env.PATH = `${root}/scripts/youlin/toolchain/node_modules/@oven/bun-linux-x64/bin:${process.env.PATH}`;
process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:5432/youlin_generation';
process.env.GOMAXPROCS = '2';
const baseline = await readdir('/migration-source');
for (const entry of baseline)
  await cp(
    path.join('/migration-source', entry),
    path.join(root, 'packages/database/migrations', entry),
    { recursive: true },
  );

console.log(await runProcess('bun', ['run', 'db:generate'], '', undefined, true));
const generated = (await readdir(`${root}/packages/database/migrations`)).filter(
  (name) => name.endsWith('.sql') && !baseline.includes(name),
);
if (generated.length !== 1 || !/^\d{4,6}_[\w-]+\.sql$/.test(generated[0]))
  throw new Error('Expected exactly one new generated migration; review the schema delta');

await mkdir(output);
const migration = generated[0];
const prefix = migration.split('_')[0];
const rawSql = await readFile(`${root}/packages/database/migrations/${migration}`, 'utf8');
await writeFile(`${output}/${prefix}_generated_before_hardening.sql`, rawSql);
await writeFile(`${output}/${migration}`, hardenIdentityMigration(rawSql));
await cp(
  `${root}/packages/database/migrations/meta/${prefix}_snapshot.json`,
  `${output}/${prefix}_snapshot.json`,
);
await cp(`${root}/packages/database/migrations/meta/_journal.json`, `${output}/_journal.json`);
await cp(`${root}/docs/development/database-schema.dbml`, `${output}/database-schema.dbml`);

// The integration fixture's upstream users table is generated from its actual schema,
// not copied by hand or substituted with a one-column mock. Apply the new migration after it.
await writeFile(
  '/tmp/youlin-users.config.cjs',
  `module.exports = ${JSON.stringify({
    dialect: 'postgresql',
    out: '/tmp/youlin-users-baseline',
    schema: `${root}/packages/database/src/schemas/user.ts`,
    strict: true,
  })};\n`,
);
console.log(
  await runProcess(
    'node',
    [
      `${root}/node_modules/drizzle-kit/bin.cjs`,
      'generate',
      '--config=/tmp/youlin-users.config.cjs',
    ],
    '',
    undefined,
    true,
  ),
);
const usersSql = (await readdir('/tmp/youlin-users-baseline')).filter((name) =>
  name.endsWith('.sql'),
);
if (usersSql.length !== 1) throw new Error('Expected one generated upstream-user baseline');
await cp(`/tmp/youlin-users-baseline/${usersSql[0]}`, `${output}/upstream-users-baseline.sql`);
await writeFile(
  `${output}/generation.json`,
  JSON.stringify(
    {
      command: 'bun run db:generate',
      migration,
      snapshot: `${prefix}_snapshot.json`,
      usersBaselineSource: 'packages/database/src/schemas/user.ts',
      hardening:
        'IF NOT EXISTS for tables/indexes; DROP IF EXISTS before FK recreation; snapshots unchanged',
      scope: 'Generated artifacts only; full SQL review and real database replay still required',
    },
    null,
    2,
  ),
);
const bundle = [];
for (const name of await readdir(output))
  bundle.push({ name, base64: (await readFile(path.join(output, name))).toString('base64') });
await writeFile('/tmp/youlin-generated.bundle', await promisify(gzip)(JSON.stringify(bundle)));
await writeFile('/tmp/youlin-generation.ready', 'ready');
console.log('Generation ready for coordinator archival; no host source files changed');
// tmpfs disappears at container exit. Keep it alive only while the coordinator copies artifacts.
const deadline = Date.now() + 90_000;
while (true) {
  try {
    await access('/tmp/youlin-generation.release');
    break;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (Date.now() >= deadline) throw new Error('Artifact archival was not acknowledged');
  await sleep(200);
}
console.log(`Archived ${migration}; database replay NOT performed by generation`);
