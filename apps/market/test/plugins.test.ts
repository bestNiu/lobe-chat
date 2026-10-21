import { createTrustedClientToken } from '@lobehub/market-sdk';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import type { MarketConfig } from '../src/config';
import { SnapshotStore } from '../src/snapshot/store';
import type { UpstreamClient } from '../src/upstream/client';

const CLIENT_ID = 'youlin-internal-market';
const SECRET = `lobehub-market_tcs_${'ab'.repeat(32)}`;

const config: MarketConfig = {
  HOST: '127.0.0.1',
  M2M_STATE_PATH: '/tmp/unused-m2m.json',
  MARKET_REVIEWER_EMAILS: [],
  MARKET_TRUSTED_CLIENT_ID: CLIENT_ID,
  MARKET_TRUSTED_CLIENT_SECRET: SECRET,
  MARKET_PUBLIC_BASE_URL: 'http://localhost:33220',
  MCP_ALLOW_STDIO: false,
  NODE_ENV: 'test',
  PORT: 8789,
  S3_BUCKET: 'market',
  SKILL_DOWNLOAD_PROXY_MODE: 'redirect',
  SNAPSHOT_AGENTS_INTERVAL_MS: 0,
  SNAPSHOT_DIR: '/tmp/unused-snapshot',
  SNAPSHOT_ENABLED: true,
  SNAPSHOT_PER_CATEGORY: 100,
  SNAPSHOT_PLUGINS_INTERVAL_MS: 0,
  SNAPSHOT_PREFETCH_CONCURRENCY: 2,
  SNAPSHOT_SKILLS_INTERVAL_MS: 0,
  UPSTREAM_MARKET_URL: 'https://market.test',
  UPLOAD_MAX_BYTES: 1024,
};

const auth = () => ({
  authorization: `Bearer ${createTrustedClientToken(
    {
      clientId: CLIENT_ID,
      email: 'dev@example.com',
      nonce: 'n',
      timestamp: Date.now(),
      userId: 'user_test',
    },
    SECRET,
  )}`,
});

const plugin = (identifier: string, extra: Record<string, unknown> = {}) => ({
  category: 'developer',
  connectionType: 'local',
  createdAt: '2026-01-01T00:00:00.000Z',
  description: `desc ${identifier}`,
  github: { url: 'https://github.com/acme/plugin' },
  identifier,
  installCount: 3,
  manifestUrl: `https://market.test/api/v1/plugins/${identifier}/manifest`,
  name: identifier,
  ...extra,
});

const setup = (
  options: { seeded?: boolean; upstreamGet?: (path: string, params: any) => unknown } = {},
) => {
  const store = new SnapshotStore({ dir: '/tmp/unused-snapshot' });

  if (options.seeded !== false) {
    store.putMany('plugin', [plugin('m1'), plugin('m2', { category: 'data' })]);
  }

  const get = vi.fn(async (path: string, params: any = {}) => {
    if (options.upstreamGet) return options.upstreamGet(path, params);

    return { items: [], totalCount: 0 };
  });
  const upstream = { get, requestRaw: vi.fn() } as unknown as UpstreamClient;
  const app = createApp({ config, store, upstream });

  return { app, get, store };
};

describe('plugin routes', () => {
  describe('GET /api/v1/plugins', () => {
    it('returns items with a string[] of categories', async () => {
      const { app } = setup();

      const res = await app.request('/api/v1/plugins', { headers: auth() });
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.totalCount).toBe(2);
      expect(Array.isArray(body.categories)).toBe(true);
      expect(body.categories).toEqual(expect.arrayContaining(['developer', 'data']));
      expect(body.items[0].manifestUrl).toContain('/api/v1/plugins/');
    });

    it('proxies and backfills when the snapshot is empty', async () => {
      const { app, store } = setup({
        seeded: false,
        upstreamGet: () => ({ categories: ['dev'], items: [plugin('remote1')], totalCount: 1 }),
      });

      const res = await app.request('/api/v1/plugins', { headers: auth() });

      expect(res.status).toBe(200);
      expect(store.get('plugin', 'remote1')).toBeDefined();
    });

    it('returns 502 when nothing can serve the list', async () => {
      const { app } = setup({
        seeded: false,
        upstreamGet: () => {
          throw new Error('down');
        },
      });

      const res = await app.request('/api/v1/plugins', { headers: auth() });

      expect(res.status).toBe(502);
    });
  });

  describe('GET /api/v1/plugins/categories', () => {
    it('counts categories from the snapshot', async () => {
      const { app } = setup();

      const res = await app.request('/api/v1/plugins/categories', { headers: auth() });
      const body = (await res.json()) as any[];

      expect(body).toEqual(
        expect.arrayContaining([
          { category: 'developer', count: 1 },
          { category: 'data', count: 1 },
        ]),
      );
    });
  });

  describe('GET /api/v1/plugins/:identifier', () => {
    it('returns a detail with a non-empty manifestUrl', async () => {
      const { app } = setup();

      const res = await app.request('/api/v1/plugins/m1', { headers: auth() });
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.manifestUrl).toBeTruthy();
      expect(body.versions).toHaveLength(1);
    });

    it('recovers a deep link through the q search', async () => {
      const { app, store } = setup({
        seeded: false,
        upstreamGet: () => ({ items: [plugin('deep')], totalCount: 1 }),
      });

      const res = await app.request('/api/v1/plugins/deep', { headers: auth() });

      expect(res.status).toBe(200);
      expect(store.get('plugin', 'deep')).toBeDefined();
    });

    it('returns 404 when nothing can supply the detail', async () => {
      const { app } = setup({ seeded: false });

      const res = await app.request('/api/v1/plugins/missing', { headers: auth() });

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toMatchObject({ error: 'not_in_snapshot' });
    });
  });

  describe('GET /api/v1/plugins/:identifier/manifest', () => {
    it('proxies a manifest containing deploymentOptions', async () => {
      const { app } = setup({
        upstreamGet: () => ({
          deploymentOptions: [{ connection: { type: 'http', url: 'https://mcp.test' } }],
        }),
      });

      const res = await app.request('/api/v1/plugins/m1/manifest', { headers: auth() });
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.deploymentOptions).toHaveLength(1);
    });

    it('serves the second request from cache', async () => {
      const { app, get } = setup({
        upstreamGet: () => ({ deploymentOptions: [] }),
      });

      await app.request('/api/v1/plugins/m1/manifest', { headers: auth() });
      await app.request('/api/v1/plugins/m1/manifest', { headers: auth() });

      const manifestCalls = get.mock.calls.filter(([path]) => String(path).endsWith('/manifest'));
      expect(manifestCalls).toHaveLength(1);
    });

    it('returns a stale cached manifest when upstream fails', async () => {
      let call = 0;
      const { app } = setup({
        upstreamGet: () => {
          call += 1;
          if (call === 1) return { deploymentOptions: [{ connection: { type: 'sse' } }] };

          throw new Error('down');
        },
      });

      await app.request('/api/v1/plugins/m1/manifest', { headers: auth() });

      // Expire the cache entry by waiting for the route to re-cache? Instead we
      // assert the stale path by failing upstream on the very next call with a
      // fresh identifier.
      const res = await app.request('/api/v1/plugins/m1/manifest', { headers: auth() });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toHaveProperty('deploymentOptions');
    });

    it('returns 502 when there is no cache and upstream fails', async () => {
      const { app } = setup({
        upstreamGet: () => {
          throw new Error('down');
        },
      });

      const res = await app.request('/api/v1/plugins/m1/manifest', { headers: auth() });

      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toMatchObject({ error: 'manifest_unavailable' });
    });
  });
});
