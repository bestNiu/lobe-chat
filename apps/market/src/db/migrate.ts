import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pool } from 'pg';

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

const MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS market_schema_migrations (
    version     TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applies every `*.sql` file in lexical order, once.
 *
 * Each file also uses `IF NOT EXISTS`, so a half-applied database (or an
 * operator running the SQL by hand) converges instead of erroring.
 */
export const runMigrations = async (
  pool: Pool,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<MigrationResult> => {
  await pool.query(MIGRATION_TABLE_SQL);

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const { rows } = await pool.query<{ version: string }>(
    'SELECT version FROM market_schema_migrations',
  );
  const done = new Set(rows.map((row) => row.version));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');

    if (done.has(version)) {
      skipped.push(version);
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO market_schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      applied.push(version);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return { applied, skipped };
};
