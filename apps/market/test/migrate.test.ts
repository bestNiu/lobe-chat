import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../src/db/migrate';

/**
 * These tests need a real PostgreSQL database: migrations are DDL, and a mock
 * would only prove that we called `query`.
 *
 *   MARKET_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/market_test \
 *     vitest run test/migrate.test.ts
 */
const DATABASE_URL = process.env.MARKET_TEST_DATABASE_URL;

describe.skipIf(!DATABASE_URL)('runMigrations', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });

    // Start from a clean schema so `applied` reflects this run.
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
  });

  afterAll(async () => {
    await pool?.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool?.query('CREATE SCHEMA public');
    await pool?.end();
  });

  it('applies every migration once and records the version', async () => {
    const result = await runMigrations(pool);

    expect(result.applied).toEqual(['0001_init']);
    expect(result.skipped).toEqual([]);

    const { rows } = await pool.query<{ version: string }>(
      'SELECT version FROM market_schema_migrations ORDER BY version',
    );
    expect(rows.map((row) => row.version)).toEqual(['0001_init']);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const result = await runMigrations(pool);

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['0001_init']);
  });

  it('creates the resource, version and category tables', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'market_%'
        ORDER BY table_name`,
    );
    const names = rows.map((row) => row.table_name);

    expect(names).toEqual(
      expect.arrayContaining([
        'market_resources',
        'market_resource_versions',
        'market_categories',
        'market_reviewers',
        'market_reviews',
      ]),
    );
  });

  it('rejects a second live resource with the same type and identifier', async () => {
    const insert = `INSERT INTO market_resources
      (id, resource_type, identifier, owner_user_id, name, status)
      VALUES ($1, 'agent', 'dup-check', 'user_a', 'Dup', $2)`;

    await pool.query(insert, ['res_1', 'draft']);
    await expect(pool.query(insert, ['res_2', 'draft'])).rejects.toThrow(/duplicate key/);

    // An archived row frees the identifier again.
    await pool.query('UPDATE market_resources SET status = $1 WHERE id = $2', [
      'archived',
      'res_1',
    ]);
    await expect(pool.query(insert, ['res_3', 'draft'])).resolves.toBeDefined();
  });
});
