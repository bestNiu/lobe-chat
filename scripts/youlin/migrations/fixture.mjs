// Host fixture composition only. PostgreSQL executes all migration statements in Docker.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const loadIdentityMigrationFixture = async (root, artifactDirectory) => {
  let migration;
  let users;
  let candidateIndex = Number.POSITIVE_INFINITY;
  if (artifactDirectory !== undefined) {
    if (!/^\/tmp\/youlin-migration-[A-Za-z0-9]{6}$/.test(artifactDirectory))
      throw new Error('Only a generated private migration artifact directory is accepted');
    const metadata = JSON.parse(
      await readFile(path.join(artifactDirectory, 'generation.json'), 'utf8'),
    );
    if (!/^\d{4,6}_[\w-]+\.sql$/.test(metadata.migration))
      throw new Error('Invalid generated migration filename');
    candidateIndex = Number(metadata.migration.split('_')[0]);
    migration = await readFile(path.join(artifactDirectory, metadata.migration), 'utf8');
    users = await readFile(path.join(artifactDirectory, 'upstream-users-baseline.sql'), 'utf8');
  } else {
    migration = '';
    users = await readFile(
      path.join(root, 'scripts/youlin/fixtures/identity/upstream-users-baseline.sql'),
      'utf8',
    );
  }
  const journal = JSON.parse(
    await readFile(path.join(root, 'packages/database/migrations/meta/_journal.json'), 'utf8'),
  );
  const prior = journal.entries.filter(
    (entry) =>
      entry.idx < candidateIndex && /^\d+_youlin_(?:identity|session_proofs|manual_enrollments)$/.test(entry.tag),
  );
  const chain = await Promise.all(
    prior.map((entry) =>
      readFile(path.join(root, 'packages/database/migrations', `${entry.tag}.sql`), 'utf8'),
    ),
  );
  migration = [...chain, migration].filter(Boolean).join('\n');
  return `${users}\n\\timing on\nSELECT json_build_object('scope', 'disposable synthetic only', 'usersRows', (SELECT count(*) FROM public.users), 'usersTableBytes', pg_total_relation_size('public.users'));\nBEGIN;\n${migration}\nCOMMIT;\nBEGIN;\n${migration}\nCOMMIT;\n\\timing off\n`;
};
