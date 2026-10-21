import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MarketEnv } from '../src/middleware/auth';
import { registerSkillRoutes, type SkillRouteDeps } from '../src/routes/skills';
import { type SnapshotItem, SnapshotStore } from '../src/snapshot/store';
import type { UpstreamClient } from '../src/upstream/client';

const skill = (identifier: string, extra: Record<string, unknown> = {}) => ({
  category: 'coding-agents-ides',
  commentCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  description: `desc ${identifier}`,
  github: { stars: 12, url: 'https://github.com/acme/skills' },
  homepage: 'https://github.com/acme/skills/tree/main/skills/writer',
  identifier,
  installCount: 5,
  name: `Skill ${identifier}`,
  tags: ['writing'],
  updatedAt: '2026-02-01T00:00:00.000Z',
  version: '1.2.3',
  ...extra,
});

const buildApp = (deps: SkillRouteDeps) => {
  const app = new Hono<MarketEnv>();

  registerSkillRoutes(app, deps);

  return app;
};

const setup = (
  options: {
    downloadMode?: SkillRouteDeps['downloadMode'];
    items?: SnapshotItem[];
    seeded?: boolean;
    upstreamGet?: (path: string, params?: Record<string, unknown>) => unknown;
  } = {},
) => {
  const store = new SnapshotStore({ dir: '/tmp/unused-snapshot' });

  if (options.seeded !== false) {
    store.putMany(
      'skill',
      options.items ?? [
        skill('s1'),
        skill('s2', { category: 'data-analytics', installCount: 40 }),
        skill('s3'),
      ],
    );
  }

  const get = vi.fn(async (path: string, params: Record<string, unknown> = {}) => {
    if (options.upstreamGet) return options.upstreamGet(path, params);

    return { items: [], totalCount: 0 };
  });
  const upstream = { get, requestRaw: vi.fn() } as unknown as UpstreamClient;
  const app = buildApp({
    downloadMode: options.downloadMode ?? 'redirect',
    store,
    upstream,
  });

  return { app, get, store };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('skill routes', () => {
  describe('GET /api/v1/skills', () => {
    it('serves a page from the snapshot with contract-shaped items', async () => {
      const { app, get } = setup();

      const res = await app.request('/api/v1/skills?page=2&pageSize=2');
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body).toMatchObject({ currentPage: 2, pageSize: 2, totalCount: 3, totalPages: 2 });
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        commentCount: expect.any(Number),
        createdAt: expect.any(String),
        description: expect.any(String),
        identifier: expect.any(String),
        installCount: expect.any(Number),
        manifestUrl: expect.stringContaining('/api/v1/skills/'),
        name: expect.any(String),
        updatedAt: expect.any(String),
        version: expect.any(String),
      });
      expect(get).not.toHaveBeenCalled();
    });

    it('lists every snapshot category on the response', async () => {
      const { app } = setup();

      const res = await app.request('/api/v1/skills');
      const body = (await res.json()) as any;

      expect(body.categories).toEqual(['coding-agents-ides', 'data-analytics']);
    });

    it('proxies and backfills when the snapshot is empty', async () => {
      const { app, get, store } = setup({
        seeded: false,
        upstreamGet: () => ({ items: [skill('remote1')], totalCount: 1 }),
      });

      const res = await app.request('/api/v1/skills?q=remote1');
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(get).toHaveBeenCalledWith('/api/v1/skills', expect.objectContaining({ q: 'remote1' }));
      expect(store.get('skill', 'remote1')).toBeDefined();
      expect(body.totalCount).toBe(1);
    });

    it('returns 502 when both snapshot and upstream are unavailable', async () => {
      const { app } = setup({
        seeded: false,
        upstreamGet: () => {
          throw new Error('down');
        },
      });

      const res = await app.request('/api/v1/skills');

      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toMatchObject({ error: 'upstream_unavailable' });
    });
  });

  describe('GET /api/v1/skills/categories', () => {
    it('counts categories from the snapshot in descending order', async () => {
      const { app, get } = setup();

      const res = await app.request('/api/v1/skills/categories');

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual([
        { category: 'coding-agents-ides', count: 2 },
        { category: 'data-analytics', count: 1 },
      ]);
      expect(get).not.toHaveBeenCalled();
    });

    it('proxies upstream categories while the snapshot is empty', async () => {
      const { app } = setup({
        seeded: false,
        upstreamGet: () => [
          { category: 'finance', count: 9 },
          { category: 'gaming', count: 1 },
        ],
      });

      const res = await app.request('/api/v1/skills/categories');

      await expect(res.json()).resolves.toEqual([
        { category: 'finance', count: 9 },
        { category: 'gaming', count: 1 },
      ]);
    });

    it('returns an empty list when upstream categories fail', async () => {
      const { app } = setup({
        seeded: false,
        upstreamGet: () => {
          throw new Error('down');
        },
      });

      const res = await app.request('/api/v1/skills/categories');

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual([]);
    });
  });

  describe('GET /api/v1/skills/:identifier', () => {
    it('returns a snapshot detail with a non-empty manifestUrl and content', async () => {
      const { app } = setup();

      const res = await app.request('http://market.local/api/v1/skills/s1');
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.identifier).toBe('s1');
      expect(body.manifestUrl).toBe('http://market.local/api/v1/skills/s1');
      expect(body.content).toBe('');
      expect(body.manifest).toMatchObject({ description: 'desc s1', name: 'Skill s1' });
      expect(body.versions).toHaveLength(1);
    });

    it('recovers a deep-linked skill through the q search and backfills it', async () => {
      const { app, store } = setup({
        seeded: false,
        upstreamGet: () => ({ items: [skill('deep')], totalCount: 1 }),
      });

      const res = await app.request('/api/v1/skills/deep');

      expect(res.status).toBe(200);
      expect(store.get('skill', 'deep')).toBeDefined();
    });

    it('ignores a fuzzy q match that is not the requested identifier', async () => {
      const { app, store } = setup({
        seeded: false,
        upstreamGet: () => ({ items: [skill('something-else')], totalCount: 1 }),
      });

      const res = await app.request('/api/v1/skills/wanted');

      expect(res.status).toBe(404);
      expect(store.get('skill', 'something-else')).toBeUndefined();
    });

    it('returns 404 not_in_snapshot when neither source can supply the detail', async () => {
      const { app } = setup({
        seeded: false,
        upstreamGet: () => {
          throw new Error('401 Unauthorized');
        },
      });

      const res = await app.request('/api/v1/skills/missing');

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toMatchObject({
        error: 'not_in_snapshot',
        identifier: 'missing',
      });
    });
  });

  describe('GET /api/v1/skills/:identifier/versions', () => {
    it('proxies the upstream version list', async () => {
      const { app } = setup({
        upstreamGet: () => ({
          data: [{ createdAt: 'x', isLatest: true, version: '2.0.0', versionNumber: 2 }],
        }),
      });

      const res = await app.request('/api/v1/skills/s1/versions');

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ data: [{ version: '2.0.0' }] });
    });

    it('synthesises a single version when upstream rejects the call', async () => {
      const { app } = setup({
        upstreamGet: () => {
          throw new Error('401 Unauthorized');
        },
      });

      const res = await app.request('/api/v1/skills/s1/versions');

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual([
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          isLatest: true,
          version: '1.2.3',
          versionNumber: 1,
        },
      ]);
    });
  });

  describe('GET /api/v1/skills/:identifier/comments', () => {
    it('returns an empty page when upstream comments fail', async () => {
      const { app } = setup({
        upstreamGet: () => {
          throw new Error('down');
        },
      });

      const res = await app.request('/api/v1/skills/s1/comments');

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        currentPage: 1,
        items: [],
        pageSize: 20,
        totalCount: 0,
        totalPages: 0,
      });
    });
  });

  describe('GET /api/v1/skills/:identifier/download', () => {
    it('redirects to the GitHub archive in redirect mode', async () => {
      const { app } = setup();

      const res = await app.request('/api/v1/skills/s1/download');

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toMatch(
        /^https:\/\/github\.com\/acme\/skills\/archive\/refs\/heads\/main\.zip$/,
      );
    });

    it('returns 404 not_downloadable when the snapshot row has no github.url', async () => {
      const { app } = setup({ items: [skill('nogithub', { github: undefined })] });

      const res = await app.request('/api/v1/skills/nogithub/download');

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toMatchObject({ error: 'not_downloadable' });
    });

    it('returns 404 not_downloadable when the identifier is not snapshotted', async () => {
      const { app } = setup({ seeded: false });

      const res = await app.request('/api/v1/skills/ghost/download');

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toMatchObject({ error: 'not_downloadable' });
    });

    it('streams the archive bytes in stream mode', async () => {
      const fetchMock = vi.fn(
        async () => new Response('zip-binary', { headers: { 'content-type': 'application/zip' } }),
      );

      vi.stubGlobal('fetch', fetchMock);

      const { app } = setup({ downloadMode: 'stream' });

      const res = await app.request('/api/v1/skills/s1/download');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/zip');
      await expect(res.text()).resolves.toBe('zip-binary');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://github.com/acme/skills/archive/refs/heads/main.zip',
      );
    });

    it('returns 502 when the archive host fails in stream mode', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('nope', { status: 500 })),
      );

      const { app } = setup({ downloadMode: 'stream' });

      const res = await app.request('/api/v1/skills/s1/download');

      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toMatchObject({ error: 'upstream_unavailable' });
    });
  });
});
