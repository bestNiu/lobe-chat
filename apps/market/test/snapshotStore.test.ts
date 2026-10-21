import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SnapshotStore } from '../src/snapshot/store';

const item = (identifier: string, extra: Record<string, unknown> = {}) => ({
  category: 'tools',
  identifier,
  name: identifier,
  ...extra,
});

describe('SnapshotStore', () => {
  let dir: string;
  let store: SnapshotStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'snapshot-'));
    store = new SnapshotStore({ dir });
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  describe('indexes', () => {
    it('gets an item by identifier', () => {
      store.put('agent', item('a1'));

      expect(store.get('agent', 'a1')).toMatchObject({ identifier: 'a1' });
      expect(store.get('plugin', 'a1')).toBeUndefined();
    });

    it('lists by type without leaking across types', () => {
      store.putMany('agent', [item('a1'), item('a2')]);
      store.putMany('skill', [item('s1')]);

      expect(store.list('agent')).toHaveLength(2);
      expect(store.list('skill')).toHaveLength(1);
      expect(store.counts()).toMatchObject({ agent: 2, skill: 1, plugin: 0 });
    });

    it('lists by category and re-buckets when the category changes', () => {
      store.put('agent', item('a1', { category: 'writing' }));
      expect(store.listByCategory('agent', 'writing')).toHaveLength(1);

      store.put('agent', item('a1', { category: 'coding' }));

      expect(store.listByCategory('agent', 'writing')).toHaveLength(0);
      expect(store.listByCategory('agent', 'coding')).toHaveLength(1);
    });

    it('replaces a whole type and drops its category buckets', () => {
      store.putMany('agent', [item('old1'), item('old2')]);
      store.replace('agent', [item('new1')]);

      expect(store.list('agent').map((i) => i.identifier)).toEqual(['new1']);
      expect(store.listByCategory('agent', 'tools')).toHaveLength(1);
      expect(store.counts().agent).toBe(1);
    });
  });

  describe('paging', () => {
    beforeEach(() => {
      store.putMany(
        'agent',
        Array.from({ length: 5 }, (_, index) =>
          item(`a${index}`, { createdAt: `2026-01-0${index + 1}`, installCount: index }),
        ),
      );
    });

    it('paginates and reports stable totals', () => {
      const first = store.page('agent', { page: 1, pageSize: 2 });

      expect(first).toMatchObject({ currentPage: 1, pageSize: 2, totalCount: 5, totalPages: 3 });
      expect(first.items).toHaveLength(2);
    });

    it('returns an empty page beyond the end but keeps the total', () => {
      const result = store.page('agent', { page: 99, pageSize: 2 });

      expect(result.items).toEqual([]);
      expect(result.totalCount).toBe(5);
      expect(result.currentPage).toBe(99);
    });

    it('caps pageSize at the upstream limit', () => {
      expect(store.page('agent', { pageSize: 5000 }).pageSize).toBe(100);
    });

    it('sorts by installCount descending by default order', () => {
      const result = store.page('agent', { sort: 'installCount' });

      expect(result.items.map((i) => i.identifier)).toEqual(['a4', 'a3', 'a2', 'a1', 'a0']);
    });

    it('filters by query across name and identifier', () => {
      store.put('agent', item('writer', { name: 'Report Writer' }));

      expect(store.page('agent', { q: 'WRIT' }).items.map((i) => i.identifier)).toContain('writer');
    });

    it('ignores an unknown sort key', () => {
      expect(() => store.page('agent', { sort: 'nope' })).not.toThrow();
    });
  });

  describe('persistence', () => {
    it('writes each type atomically and reloads it', async () => {
      store.putMany('agent', [item('a1'), item('a2')]);
      store.markRefreshed(new Date('2026-10-21T00:00:00.000Z'));
      await store.flush();

      const raw = JSON.parse(await readFile(join(dir, 'snapshot-agent.json'), 'utf8'));
      expect(raw.items).toHaveLength(2);

      const reloaded = new SnapshotStore({ dir });
      await reloaded.load();

      expect(reloaded.list('agent')).toHaveLength(2);
      expect(reloaded.meta().refreshedAt).toBe('2026-10-21T00:00:00.000Z');
    });

    it('skips a corrupt snapshot file instead of failing', async () => {
      await writeFile(join(dir, 'snapshot-agent.json'), '{not json');

      await expect(store.load()).resolves.toBeUndefined();
      expect(store.list('agent')).toEqual([]);
    });

    it('loads nothing when the directory has no snapshots', async () => {
      await expect(store.load()).resolves.toBeUndefined();
      expect(store.counts()).toEqual({ agent: 0, plugin: 0, skill: 0 });
    });

    it('does not rewrite files when nothing changed', async () => {
      store.putMany('agent', [item('a1')]);
      await store.flush();

      const first = await readFile(join(dir, 'snapshot-agent.json'), 'utf8');
      await store.flush(); // no changes since the last flush
      const second = await readFile(join(dir, 'snapshot-agent.json'), 'utf8');

      expect(second).toBe(first);
    });

    it('records and clears refresh errors', () => {
      store.recordError(new Error('upstream down'));
      expect(store.meta().lastRefreshError).toBe('upstream down');

      store.clearError();
      expect(store.meta().lastRefreshError).toBeUndefined();
    });
  });
});
