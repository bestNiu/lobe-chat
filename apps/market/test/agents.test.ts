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

const agent = (identifier: string, extra: Record<string, unknown> = {}) => ({
  author: 'tester',
  avatar: '🤖',
  category: 'writing',
  config: { systemRole: 'You write reports' },
  createdAt: '2026-01-01T00:00:00.000Z',
  description: `desc ${identifier}`,
  identifier,
  installCount: 1,
  name: identifier,
  tags: ['writing'],
  ...extra,
});

const setup = (
  options: { seeded?: boolean; upstreamGet?: (path: string, params: any) => unknown } = {},
) => {
  const store = new SnapshotStore({ dir: '/tmp/unused-snapshot' });

  if (options.seeded !== false) {
    store.putMany('agent', [
      agent('a1'),
      agent('a2', { installCount: 50 }),
      agent('a3', { category: 'coding' }),
    ]);
  }

  const get = vi.fn(async (path: string, params: any = {}) => {
    if (options.upstreamGet) return options.upstreamGet(path, params);

    return { items: [], totalCount: 0 };
  });
  const upstream = { get, requestRaw: vi.fn() } as unknown as UpstreamClient;
  const app = createApp({ config, store, upstream });

  return { app, get, store };
};

describe('agent routes', () => {
  describe('GET /api/v1/agents', () => {
    it('serves the snapshot with contract-shaped items', async () => {
      const { app, get } = setup();

      const res = await app.request('/api/v1/agents', { headers: auth() });
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.totalCount).toBe(3);
      expect(body.items[0]).toMatchObject({
        identifier: expect.any(String),
        manifestUrl: expect.stringContaining('/api/v1/agents/'),
        name: expect.any(String),
      });
      expect(get).not.toHaveBeenCalled();
    });

    it('paginates', async () => {
      const { app } = setup();

      const res = await app.request('/api/v1/agents?page=2&pageSize=2', { headers: auth() });
      const body = (await res.json()) as any;

      expect(body).toMatchObject({ currentPage: 2, pageSize: 2, totalCount: 3, totalPages: 2 });
      expect(body.items).toHaveLength(1);
    });

    it('proxies and backfills when the snapshot is empty', async () => {
      const { app, store } = setup({
        seeded: false,
        upstreamGet: () => ({ items: [agent('remote1')], totalCount: 1 }),
      });

      const res = await app.request('/api/v1/agents', { headers: auth() });

      expect(res.status).toBe(200);
      expect(store.get('agent', 'remote1')).toBeDefined();
    });

    it('returns 502 when both snapshot and upstream are unavailable', async () => {
      const { app } = setup({
        seeded: false,
        upstreamGet: () => {
          throw new Error('down');
        },
      });

      const res = await app.request('/api/v1/agents', { headers: auth() });

      expect(res.status).toBe(502);
    });
  });

  describe('GET /api/v1/agents/categories', () => {
    it('counts categories from the snapshot', async () => {
      const { app } = setup();

      const res = await app.request('/api/v1/agents/categories', { headers: auth() });
      const body = (await res.json()) as any[];

      expect(body).toEqual(
        expect.arrayContaining([
          { category: 'writing', count: 2 },
          { category: 'coding', count: 1 },
        ]),
      );
    });
  });

  describe('GET /api/v1/agents/:identifier', () => {
    it('returns the detail with a non-empty config', async () => {
      const { app } = setup();

      const res = await app.request('/api/v1/agents/detail/a1', { headers: auth() });
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.config.systemRole).toBeTruthy();
      expect(body.avatar).toBe('🤖');
    });

    it('recovers a deep-linked agent through the q search', async () => {
      const { app, store } = setup({
        seeded: false,
        upstreamGet: () => ({ items: [agent('deep')], totalCount: 1 }),
      });

      const res = await app.request('/api/v1/agents/detail/deep', { headers: auth() });

      expect(res.status).toBe(200);
      expect(store.get('agent', 'deep')).toBeDefined();
    });

    it('returns 404 when nothing can supply the detail', async () => {
      const { app } = setup({ seeded: false });

      const res = await app.request('/api/v1/agents/detail/missing', { headers: auth() });

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toMatchObject({ error: 'not_in_snapshot' });
    });
  });

  describe('POST /api/v1/agents/:identifier/fork', () => {
    it('returns a contract-shaped fork receipt', async () => {
      const { app } = setup();

      const res = await app.request('/api/v1/agents/a1/fork', {
        body: JSON.stringify({ identifier: 'copy1', name: 'Copy' }),
        headers: { ...auth(), 'content-type': 'application/json' },
        method: 'POST',
      });
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.agent).toMatchObject({ identifier: 'copy1', name: 'Copy' });
      expect(body.source.identifier).toBe('a1');
      expect(typeof body.agent.id).toBe('number');
    });

    it('tolerates an empty body', async () => {
      const { app } = setup();

      const res = await app.request('/api/v1/agents/a1/fork', {
        headers: auth(),
        method: 'POST',
      });

      expect(res.status).toBe(200);
    });

    it('returns 404 for an unknown source', async () => {
      const { app } = setup();

      const res = await app.request('/api/v1/agents/nope/fork', {
        headers: auth(),
        method: 'POST',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/agents/onboarding-full', () => {
    it('falls back to featured snapshot entries', async () => {
      const { app } = setup({
        upstreamGet: () => {
          throw new Error('down');
        },
      });

      const res = await app.request('/api/v1/agents/onboarding-full', { headers: auth() });
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body).toHaveProperty('featured');
    });
  });

  describe('GET /api/v1/agents/:identifier/versions', () => {
    it('synthesises a single version when upstream rejects the call', async () => {
      const { app } = setup({
        upstreamGet: () => {
          throw new Error('401');
        },
      });

      const res = await app.request('/api/v1/agents/a1/versions', { headers: auth() });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toHaveLength(1);
    });
  });
});
