import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { getRequestListener } from '@hono/node-server';
import { createTrustedClientToken, MarketSDK } from '@lobehub/market-sdk';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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

const agentRow = {
  avatar: '🤖',
  category: 'writing',
  config: { systemRole: 'You are a writer' },
  createdAt: '2026-01-01T00:00:00.000Z',
  description: 'agent one',
  identifier: 'a1',
  installCount: 4,
  name: 'Agent One',
  tags: ['writing'],
};

const pluginRow = {
  category: 'developer',
  connectionType: 'local',
  createdAt: '2026-01-01T00:00:00.000Z',
  description: 'plugin one',
  github: { url: 'https://github.com/acme/plugin' },
  identifier: 'p1',
  installCount: 2,
  manifestUrl: 'https://market.test/api/v1/plugins/p1/manifest',
  name: 'Plugin One',
};

const skillRow = {
  category: 'coding',
  commentCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  description: 'skill one',
  github: { url: 'https://github.com/acme/skill' },
  identifier: 's1',
  installCount: 1,
  name: 'Skill One',
  ratingCount: 0,
  version: '1.0.0',
};

describe('MarketSDK contract', () => {
  let server: Server;
  let sdk: MarketSDK;
  let store: SnapshotStore;

  const trustedToken = () =>
    createTrustedClientToken(
      {
        clientId: CLIENT_ID,
        email: 'dev@example.com',
        nonce: 'n',
        timestamp: Date.now(),
        userId: 'user_contract',
      },
      SECRET,
    );

  beforeAll(async () => {
    store = new SnapshotStore({ dir: '/tmp/unused-snapshot-contract' });
    store.putMany('agent', [agentRow]);
    store.putMany('plugin', [pluginRow]);
    store.putMany('skill', [skillRow]);

    const upstream = {
      get: vi.fn(async (path: string) => {
        if (path.includes('/manifest')) {
          return { deploymentOptions: [{ connection: { type: 'http', url: 'https://mcp.test' } }] };
        }

        return { items: [], totalCount: 0 };
      }),
      requestRaw: vi.fn(),
    } as unknown as UpstreamClient;

    const app = createApp({ config, store, upstream });

    server = createServer(getRequestListener(app.fetch));
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const { port } = server.address() as AddressInfo;

    // The SDK sends the trusted token as `x-lobe-trust-token`, which is exactly
    // the header path the proxy must support.
    sdk = new MarketSDK({
      baseURL: `http://127.0.0.1:${port}`,
      trustedClientToken: trustedToken(),
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('authenticates the SDK’s x-lobe-trust-token header', async () => {
    const list = await sdk.agents.getAgentList({ pageSize: 10 });

    expect(list.totalCount).toBe(1);
  });

  it('parses an agent list', async () => {
    const list = await sdk.agents.getAgentList({ pageSize: 10 });

    expect(list.items[0]).toMatchObject({ identifier: 'a1', name: 'Agent One' });
    expect(list.items[0].manifestUrl).toContain('/api/v1/agents/');
  });

  it('parses agent detail including config', async () => {
    const detail = await sdk.agents.getAgentDetail('a1');

    expect(detail.config).toMatchObject({ systemRole: 'You are a writer' });
  });

  it('parses a plugin list', async () => {
    const list = await sdk.plugins.getPluginList({ pageSize: 10 });

    expect(list.totalCount).toBe(1);
    expect(Array.isArray((list as unknown as { categories: string[] }).categories)).toBe(true);
  });

  it('parses plugin detail', async () => {
    const detail = await sdk.plugins.getPluginDetail({ identifier: 'p1' });

    // `PluginItemDetail` omits manifestUrl; identity plus version is enough here.
    expect(detail).toMatchObject({ identifier: 'p1', version: expect.any(String) });
  });

  it('parses a plugin manifest with deployment options', async () => {
    const manifest = await sdk.plugins.getPluginManifest({ identifier: 'p1' });

    expect(manifest.deploymentOptions).toHaveLength(1);
  });

  it('parses a skill list', async () => {
    const list = await sdk.marketSkills.getSkillList({ pageSize: 10 });

    expect(list.totalCount).toBe(1);
    expect(list.items[0]).toMatchObject({ identifier: 's1' });
  });

  it('parses skill detail', async () => {
    const detail = await sdk.marketSkills.getSkillDetail('s1');

    expect(detail.identifier).toBe('s1');
  });

  it('rejects a request without a token', async () => {
    const anonymous = new MarketSDK({ baseURL: sdk['baseUrl'] as string });

    await expect(anonymous.agents.getAgentList({ pageSize: 1 })).rejects.toThrow();
  });
});
