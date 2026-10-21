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
  M2M_STATE_PATH: '/tmp/unused.json',
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
  SNAPSHOT_DIR: '/tmp/unused-snap',
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
    { clientId: CLIENT_ID, email: 'd@e.f', nonce: 'n', timestamp: Date.now(), userId: 'u' },
    SECRET,
  )}`,
});

const setup = (opts: { seeded?: boolean; getImpl?: () => unknown } = {}) => {
  const store = new SnapshotStore({ dir: '/tmp/unused-snap' });
  if (opts.seeded !== false) {
    store.putMany('agent', [
      { category: 'x', config: { systemRole: 's' }, identifier: 'a1', name: 'a1' },
    ]);
  }
  const get = vi.fn(async () => {
    if (opts.getImpl) return opts.getImpl();
    throw new Error('upstream down');
  });
  const upstream = { get, requestRaw: vi.fn() } as unknown as UpstreamClient;
  return { app: createApp({ config, store, upstream }), get, store };
};

describe('degradation', () => {
  it('serves a stale snapshot instead of failing when upstream is down', async () => {
    const { app, store } = setup();
    store.recordError(new Error('refresh failed'));

    const res = await app.request('/api/v1/agents?pageSize=1', { headers: auth() });

    expect(res.status).toBe(200);
    expect(res.headers.get('x-snapshot-stale')).toBe('true');
    await expect(res.json()).resolves.toMatchObject({ totalCount: 1 });
  });

  it('does not mark a healthy snapshot as stale', async () => {
    const { app } = setup();

    const res = await app.request('/api/v1/agents?pageSize=1', { headers: auth() });

    expect(res.status).toBe(200);
    expect(res.headers.get('x-snapshot-stale')).toBeNull();
  });

  it('returns 502 (not 500) when both snapshot and upstream are unavailable', async () => {
    const { app } = setup({ seeded: false });

    const res = await app.request('/api/v1/agents?pageSize=1', { headers: auth() });

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: 'upstream_unavailable' });
  });

  it('returns 404 (not 500) for an unknown detail with no snapshot and no upstream hit', async () => {
    const { app } = setup({ getImpl: () => ({ items: [], totalCount: 0 }), seeded: false });

    const res = await app.request('/api/v1/agents/detail/ghost', { headers: auth() });

    expect(res.status).toBe(404);
  });

  it('propagates a token-refresh failure as 502 rather than crashing', async () => {
    const { app } = setup({
      seeded: false,
      getImpl: () => {
        const e: any = new Error('401');
        e.status = 401;
        throw e;
      },
    });

    const res = await app.request('/api/v1/plugins?pageSize=1', { headers: auth() });

    expect(res.status).toBe(502);
  });

  it('returns 404 (not 500) when a skill has no downloadable archive', async () => {
    const store = new SnapshotStore({ dir: '/tmp/unused-snap' });
    store.putMany('skill', [{ category: 'x', identifier: 'no-gh' }]);
    const upstream = { get: vi.fn(), requestRaw: vi.fn() } as unknown as UpstreamClient;
    const app = createApp({ config, store, upstream });

    const res = await app.request('/api/v1/skills/no-gh/download', { headers: auth() });

    expect(res.status).toBe(404);
  });
});
