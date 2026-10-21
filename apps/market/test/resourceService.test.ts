import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createMarketDb, type MarketDbHandle } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { marketCategories, marketResources, marketResourceVersions } from '../src/db/schema';
import {
  findLatestVersion,
  findResource,
  listCategoryCounts,
  listResources,
  listVersions,
} from '../src/services/resourceService';

const DATABASE_URL = process.env.MARKET_TEST_DATABASE_URL;

const insertResource = async (
  handle: MarketDbHandle,
  overrides: Partial<typeof marketResources.$inferInsert> & { id: string; identifier: string },
) => {
  await handle.db.insert(marketResources).values({
    category: 'productivity',
    description: `desc for ${overrides.identifier}`,
    name: overrides.identifier,
    ownerUserId: 'user_owner',
    resourceType: 'agent',
    status: 'published',
    ...overrides,
  } as typeof marketResources.$inferInsert);
};

describe.skipIf(!DATABASE_URL)('resourceService', () => {
  let handle: MarketDbHandle;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await runMigrations(pool);
    handle = createMarketDb(DATABASE_URL!);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pool?.end();
  });

  beforeEach(async () => {
    await handle.db.delete(marketResourceVersions);
    await handle.db.delete(marketResources);
    await handle.db.delete(marketCategories);
  });

  describe('listResources', () => {
    it('returns an empty envelope when nothing is published', async () => {
      const result = await listResources(handle.db, 'agent');

      expect(result).toMatchObject({
        currentPage: 1,
        items: [],
        totalCount: 0,
        totalPages: 0,
      });
    });

    it('never lists rows that are not published', async () => {
      await insertResource(handle, { id: 'r1', identifier: 'published-one' });
      await insertResource(handle, { id: 'r2', identifier: 'draft-one', status: 'draft' });
      await insertResource(handle, { id: 'r3', identifier: 'submitted-one', status: 'submitted' });
      await insertResource(handle, { id: 'r4', identifier: 'archived-one', status: 'archived' });

      const result = await listResources(handle.db, 'agent');

      expect(result.items.map((item) => item.identifier)).toEqual(['published-one']);
      expect(result.totalCount).toBe(1);
    });

    it('filters by resource type', async () => {
      await insertResource(handle, { id: 'r1', identifier: 'agent-a' });
      await insertResource(handle, {
        id: 'r2',
        identifier: 'skill-a',
        resourceType: 'skill',
      });

      const agents = await listResources(handle.db, 'agent');
      const skills = await listResources(handle.db, 'skill');

      expect(agents.items).toHaveLength(1);
      expect(skills.items[0].identifier).toBe('skill-a');
    });

    it('paginates and reports stable totals', async () => {
      await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          insertResource(handle, {
            id: `r${index}`,
            identifier: `agent-${index}`,
            installCount: index,
          }),
        ),
      );

      const first = await listResources(handle.db, 'agent', { page: 1, pageSize: 2 });
      expect(first).toMatchObject({ currentPage: 1, pageSize: 2, totalCount: 5, totalPages: 3 });
      expect(first.items).toHaveLength(2);

      const last = await listResources(handle.db, 'agent', { page: 3, pageSize: 2 });
      expect(last.items).toHaveLength(1);
    });

    it('returns an empty page but the real total beyond the last page', async () => {
      await Promise.all(
        Array.from({ length: 3 }, (_, index) =>
          insertResource(handle, { id: `r${index}`, identifier: `agent-${index}` }),
        ),
      );

      const result = await listResources(handle.db, 'agent', { page: 99, pageSize: 2 });

      expect(result.items).toEqual([]);
      expect(result.totalCount).toBe(3);
      expect(result.totalPages).toBe(2);
      expect(result.currentPage).toBe(99);
    });

    it('sorts by install count descending', async () => {
      await insertResource(handle, { id: 'r1', identifier: 'low', installCount: 1 });
      await insertResource(handle, { id: 'r2', identifier: 'high', installCount: 99 });
      await insertResource(handle, { id: 'r3', identifier: 'mid', installCount: 10 });

      const result = await listResources(handle.db, 'agent', { sort: 'installCount' });

      expect(result.items.map((item) => item.identifier)).toEqual(['high', 'mid', 'low']);
    });

    it('searches name and description case-insensitively', async () => {
      await insertResource(handle, { id: 'r1', identifier: 'writer', name: 'Report Writer' });
      await insertResource(handle, { id: 'r2', identifier: 'coder', description: 'writes code' });
      await insertResource(handle, { id: 'r3', identifier: 'misc' });

      const result = await listResources(handle.db, 'agent', { q: 'WRIT' });

      expect(result.items.map((item) => item.identifier).sort()).toEqual(['coder', 'writer']);
    });

    it('filters by category', async () => {
      await insertResource(handle, { id: 'r1', identifier: 'a', category: 'support' });
      await insertResource(handle, { id: 'r2', identifier: 'b', category: 'writing' });

      const result = await listResources(handle.db, 'agent', { category: 'support' });

      expect(result.items.map((item) => item.identifier)).toEqual(['a']);
    });
  });

  describe('findResource', () => {
    it('returns a published row by identifier', async () => {
      await insertResource(handle, { id: 'r1', identifier: 'found-me' });

      await expect(findResource(handle.db, 'agent', 'found-me')).resolves.toMatchObject({
        identifier: 'found-me',
      });
    });

    it('hides unpublished rows', async () => {
      await insertResource(handle, { id: 'r1', identifier: 'hidden', status: 'submitted' });

      await expect(findResource(handle.db, 'agent', 'hidden')).resolves.toBeUndefined();
    });

    it('returns undefined for an unknown identifier', async () => {
      await expect(findResource(handle.db, 'agent', 'nope')).resolves.toBeUndefined();
    });
  });

  describe('versions', () => {
    it('returns the newest published version only', async () => {
      await insertResource(handle, { id: 'r1', identifier: 'agent-v' });
      await handle.db.insert(marketResourceVersions).values([
        {
          createdBy: 'user_owner',
          id: 'v1',
          payload: { version: 1 },
          resourceId: 'r1',
          status: 'published',
          versionNo: 1,
        },
        {
          createdBy: 'user_owner',
          id: 'v2',
          payload: { version: 2 },
          resourceId: 'r1',
          status: 'published',
          versionNo: 2,
        },
        {
          createdBy: 'user_owner',
          id: 'v3',
          payload: { version: 3 },
          resourceId: 'r1',
          status: 'draft',
          versionNo: 3,
        },
      ]);

      await expect(findLatestVersion(handle.db, 'r1')).resolves.toMatchObject({ versionNo: 2 });

      const all = await listVersions(handle.db, 'r1');
      expect(all.map((row) => row.versionNo)).toEqual([2, 1]);
    });
  });

  describe('listCategoryCounts', () => {
    it('counts only published rows and drops uncategorised ones', async () => {
      await insertResource(handle, { id: 'r1', identifier: 'a', category: 'support' });
      await insertResource(handle, { id: 'r2', identifier: 'b', category: 'support' });
      await insertResource(handle, { id: 'r3', identifier: 'c', category: 'writing' });
      await insertResource(handle, {
        id: 'r4',
        identifier: 'd',
        category: 'support',
        status: 'draft',
      });
      await insertResource(handle, { id: 'r5', identifier: 'e', category: null });

      const counts = await listCategoryCounts(handle.db, 'agent');

      expect(counts).toEqual([
        { category: 'support', count: 2 },
        { category: 'writing', count: 1 },
      ]);
    });

    it('returns an empty array when nothing is published', async () => {
      await expect(listCategoryCounts(handle.db, 'agent')).resolves.toEqual([]);
    });
  });
});
