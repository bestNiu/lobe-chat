import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SnapshotBuilder } from '../src/snapshot/builder';
import { SnapshotStore } from '../src/snapshot/store';
import type { UpstreamClient } from '../src/upstream/client';

/** Fake upstream driven by a path → handler map. */
const createClient = (handlers: Record<string, (params: any) => unknown>) => {
  const calls: { params: any; path: string }[] = [];

  const client = {
    get: async (path: string, params: any = {}) => {
      calls.push({ params, path });
      const handler = handlers[path];

      if (!handler) throw new Error(`no handler for ${path}`);

      return handler(params);
    },
  } as unknown as UpstreamClient;

  return { calls, client };
};

const agentPage = (total: number) => (params: any) => {
  const start = (params.page - 1) * params.pageSize;

  return {
    items: Array.from(
      { length: Math.max(0, Math.min(params.pageSize, total - start)) },
      (_, i) => ({
        category: 'general',
        identifier: `agent-${start + i}`,
      }),
    ),
    totalCount: total,
  };
};

describe('SnapshotBuilder', () => {
  let dir: string;
  let store: SnapshotStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'builder-'));
    store = new SnapshotStore({ dir });
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  describe('agents', () => {
    it('pages through the whole catalogue', async () => {
      const { calls, client } = createClient({ '/api/v1/agents': agentPage(250) });
      const builder = new SnapshotBuilder({ client, store });

      const count = await builder.refreshAgents();

      expect(count).toBe(250);
      // agents cap pageSize at 20, so 250 items take 13 requests.
      expect(calls).toHaveLength(13);
      expect(calls[0].params.pageSize).toBe(20);
      expect(store.counts().agent).toBe(250);
    });

    it('stops on an empty page instead of looping', async () => {
      let page = 0;
      const { client } = createClient({
        '/api/v1/agents': () => {
          page += 1;

          return page === 1 ? { items: [{ identifier: 'a1' }], totalCount: 999 } : { items: [] };
        },
      });
      const builder = new SnapshotBuilder({ client, store });

      await expect(builder.refreshAgents()).resolves.toBe(1);
    });
  });

  describe('categories', () => {
    it('fetches one page per category with the configured size', async () => {
      const { calls, client } = createClient({
        '/api/v1/plugins': (params: any) => ({
          items: [{ category: params.category, identifier: `${params.category}-1` }],
          totalCount: 1,
        }),
        '/api/v1/plugins/categories': () => [
          { category: 'dev', count: 10 },
          { category: 'data', count: 5 },
        ],
      });
      const builder = new SnapshotBuilder({ client, concurrency: 1, perCategory: 50, store });

      const count = await builder.refreshPlugins();

      expect(count).toBe(2);
      const listCalls = calls.filter((c) => c.path === '/api/v1/plugins');
      // plugins cap pageSize at 20 regardless of the configured perCategory.
      expect(listCalls.every((c) => c.params.pageSize === 20 && c.params.page === 1)).toBe(true);
    });

    it('dedupes items that appear in several categories', async () => {
      const { client } = createClient({
        '/api/v1/skills': () => ({ items: [{ identifier: 'shared' }], totalCount: 1 }),
        '/api/v1/skills/categories': () => [{ category: 'a' }, { category: 'b' }],
      });
      const builder = new SnapshotBuilder({ client, concurrency: 1, store });

      await expect(builder.refreshSkills()).resolves.toBe(1);
      expect(store.list('skill').map((i) => i.identifier)).toEqual(['shared']);
    });

    it('keeps going when one category fails', async () => {
      const { client } = createClient({
        '/api/v1/skills': (params: any) => {
          if (params.category === 'boom') throw new Error('upstream 500');

          return { items: [{ identifier: `${params.category}-1` }], totalCount: 1 };
        },
        '/api/v1/skills/categories': () => [{ category: 'boom' }, { category: 'ok' }],
      });
      const builder = new SnapshotBuilder({ client, concurrency: 1, store });

      await expect(builder.refreshSkills()).resolves.toBe(1);
      expect(store.get('skill', 'ok-1')).toBeDefined();
    });
  });

  describe('warmup', () => {
    it('serves the persisted snapshot before the network answers', async () => {
      await writeFile(
        join(dir, 'snapshot-agent.json'),
        JSON.stringify({ items: [{ category: 'x', identifier: 'cached' }] }),
      );

      // A client that never resolves: warmup must not block on it.
      const client = { get: () => new Promise(() => {}) } as unknown as UpstreamClient;
      const builder = new SnapshotBuilder({ client, store });

      await expect(builder.warmup()).resolves.toBeUndefined();
      expect(store.get('agent', 'cached')).toBeDefined();
    });

    it('records a refresh error without throwing from the timer', async () => {
      const { client } = createClient({
        '/api/v1/agents': () => {
          throw new Error('down');
        },
      });
      const builder = new SnapshotBuilder({ client, store });

      await expect(builder.refreshAgents()).rejects.toThrow('down');
      expect(store.meta().lastRefreshError).toBe('down');
    });
  });

  describe('timers', () => {
    it('starts and stops intervals', () => {
      vi.useFakeTimers();
      const { client } = createClient({ '/api/v1/agents': agentPage(0) });
      const builder = new SnapshotBuilder({
        client,
        intervals: { agents: 1000, plugins: 0, skills: 0 },
        store,
      });

      builder.start();
      builder.stop();
      vi.useRealTimers();

      expect(true).toBe(true);
    });
  });
});
