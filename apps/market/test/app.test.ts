import { createTrustedClientToken, type TrustedClientPayload } from '@lobehub/market-sdk';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import type { MarketConfig } from '../src/config';
import { SnapshotStore } from '../src/snapshot/store';
import type { UpstreamClient } from '../src/upstream/client';

const CLIENT_ID = 'youlin-internal-market';
const SECRET = `lobehub-market_tcs_${'ab'.repeat(32)}`;

const config: MarketConfig = {
  DATABASE_URL: undefined,
  HOST: '127.0.0.1',
  MARKET_REVIEWER_EMAILS: [],
  MARKET_TRUSTED_CLIENT_ID: CLIENT_ID,
  MARKET_TRUSTED_CLIENT_SECRET: SECRET,
  M2M_STATE_PATH: '/tmp/unused-m2m.json',
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

const token = (overrides: Partial<TrustedClientPayload> = {}) =>
  createTrustedClientToken(
    {
      clientId: CLIENT_ID,
      email: 'dev@example.com',
      nonce: 'n1',
      timestamp: Date.now(),
      userId: 'user_test',
      ...overrides,
    },
    SECRET,
  );

const setup = (upstreamResponse: () => Response = () => new Response('{}', { status: 200 })) => {
  const store = new SnapshotStore({ dir: '/tmp/unused-snapshot' });
  const requestRaw = vi.fn(async () => upstreamResponse());
  const upstream = { requestRaw } as unknown as UpstreamClient;
  const app = createApp({ config, store, upstream });

  return { app, requestRaw, store };
};

describe('createApp', () => {
  describe('/health', () => {
    it('answers without a token and reports snapshot counts', async () => {
      const { app, store } = setup();
      store.putMany('agent', [{ identifier: 'a1' }]);

      const res = await app.request('/health');
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        service: 'youlin-market',
        status: 'ok',
        snapshot: { counts: { agent: 1, plugin: 0, skill: 0 } },
      });
    });
  });

  describe('auth', () => {
    it('rejects /api/v1 without a bearer token', async () => {
      const { app, requestRaw } = setup();

      const res = await app.request('/api/v1/agents');

      expect(res.status).toBe(401);
      expect(requestRaw).not.toHaveBeenCalled();
    });

    it('rejects a token signed with another secret', async () => {
      const { app } = setup();
      const forged = createTrustedClientToken(
        { clientId: CLIENT_ID, email: 'x@y.z', nonce: 'n', timestamp: Date.now(), userId: 'u' },
        `lobehub-market_tcs_${'cd'.repeat(32)}`,
      );

      const res = await app.request('/api/v1/agents', {
        headers: { authorization: `Bearer ${forged}` },
      });

      expect(res.status).toBe(401);
    });

    it('proxies authenticated requests upstream', async () => {
      const { app, requestRaw } = setup(
        () => new Response(JSON.stringify({ items: [], totalCount: 0 }), { status: 200 }),
      );

      const res = await app.request('/api/v1/system/config?page=2', {
        headers: { authorization: `Bearer ${token()}` },
      });

      expect(res.status).toBe(200);
      expect(requestRaw).toHaveBeenCalledWith('/api/v1/system/config', {
        body: undefined,
        headers: {},
        method: 'GET',
        query: { page: '2' },
      });
    });

    it('maps an upstream failure to the upstream status', async () => {
      const { app } = setup(() => {
        const error = new Error('upstream down') as Error & { status?: number };
        error.status = 503;

        throw error;
      });

      const res = await app.request('/api/v1/system/config', {
        headers: { authorization: `Bearer ${token()}` },
      });

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toMatchObject({ error: 'upstream_unavailable' });
    });
  });

  describe('routing', () => {
    it('returns 404 for unknown paths', async () => {
      const { app } = setup();

      const res = await app.request('/nope');

      expect(res.status).toBe(404);
    });
  });
});
