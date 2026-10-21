import { createTrustedClientToken, type TrustedClientPayload } from '@lobehub/market-sdk';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { type MarketConfig, setConfigForTest } from '../src/config';
import {
  AuthError,
  createAuthMiddleware,
  decryptTrustedClientToken,
  deriveKey,
  extractBearerToken,
  type MarketEnv,
  requireActor,
  verifyTrustedClientToken,
} from '../src/middleware/auth';
import type { MarketActor } from '../src/types';

const CLIENT_ID = 'youlin-internal-market';
// 83 chars: SDK derives sha256(secret) for prefixed secrets.
const SECRET = `lobehub-market_tcs_${'ab'.repeat(32)}`;

const testConfig: MarketConfig = {
  DATABASE_URL: 'postgresql://unused',
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
const USER_ID = 'user_abc123';

const basePayload = (overrides: Partial<TrustedClientPayload> = {}): TrustedClientPayload => ({
  clientId: CLIENT_ID,
  email: 'dev@example.com',
  name: 'Dev',
  nonce: 'deadbeef',
  timestamp: Date.now(),
  userId: USER_ID,
  ...overrides,
});

const sign = (payload: TrustedClientPayload, secret = SECRET) =>
  createTrustedClientToken(payload, secret);

describe('deriveKey', () => {
  it('hashes secrets that carry the SDK prefix', () => {
    expect(deriveKey(SECRET)).toHaveLength(32);
  });

  it('requires exactly 32 bytes for hex secrets', () => {
    expect(deriveKey('cd'.repeat(32))).toHaveLength(32);
    expect(() => deriveKey('deadbeef')).toThrow(AuthError);
  });
});

describe('decryptTrustedClientToken', () => {
  it('round-trips a token produced by the SDK', () => {
    const payload = basePayload();
    const decrypted = decryptTrustedClientToken(sign(payload), SECRET);

    expect(decrypted).toMatchObject({ clientId: CLIENT_ID, userId: USER_ID });
  });

  it('rejects a token signed with another secret', () => {
    const token = sign(basePayload(), `lobehub-market_tcs_${'cd'.repeat(32)}`);

    expect(() => decryptTrustedClientToken(token, SECRET)).toThrow(AuthError);
  });

  it('rejects a truncated token', () => {
    expect(() => decryptTrustedClientToken('not-a-token', SECRET)).toThrow(AuthError);
  });
});

describe('verifyTrustedClientToken', () => {
  const verify = (
    token: string,
    overrides: Partial<Parameters<typeof verifyTrustedClientToken>[1]> = {},
  ) => verifyTrustedClientToken(token, { clientId: CLIENT_ID, secret: SECRET, ...overrides });

  it('accepts a fresh token from the configured client', () => {
    expect(verify(sign(basePayload())).userId).toBe(USER_ID);
  });

  it('rejects a tampered token', () => {
    const token = sign(basePayload());
    const raw = Buffer.from(token, 'base64');
    raw[raw.length - 1] ^= 0xff; // flip a byte of the GCM tag

    expect(() => verify(raw.toString('base64'))).toThrow(AuthError);
  });

  it('rejects an expired token', () => {
    const token = sign(basePayload({ timestamp: Date.now() - 11 * 60 * 1000 }));

    expect(() => verify(token)).toThrow(/expired/);
  });

  it('rejects a token issued for a different client', () => {
    const token = sign(basePayload({ clientId: 'someone-else' }));

    expect(() => verify(token)).toThrow(/different client/);
  });

  it.each(['eval_deadbeef', 'qstash_smoke_1'])('rejects synthetic userId %s', (userId) => {
    const token = sign(basePayload({ userId }));

    expect(() => verify(token)).toThrow(/Synthetic userId/);
  });
});

describe('extractBearerToken', () => {
  it('parses a bearer header', () => {
    expect(extractBearerToken('Bearer abc.def')).toBe('abc.def');
    expect(extractBearerToken('bearer  x ')).toBe('x');
  });

  it('returns undefined for missing or malformed headers', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
    expect(extractBearerToken('Basic abc')).toBeUndefined();
    expect(extractBearerToken('Bearer   ')).toBeUndefined();
  });
});

describe('createAuthMiddleware', () => {
  const resolveActor = async (): Promise<MarketActor> => ({
    isAdmin: false,
    isReviewer: true,
    teamIds: ['team_1'],
    userId: USER_ID,
  });

  const buildApp = () => {
    const app = new Hono<MarketEnv>();

    app.use('*', createAuthMiddleware(resolveActor));
    app.get('/whoami', (c) => c.json(requireActor(c)));

    return app;
  };

  afterEach(() => {
    setConfigForTest(undefined);
  });

  it('injects the resolved actor for a valid token', async () => {
    setConfigForTest(testConfig);

    const res = await buildApp().request('/whoami', {
      headers: { authorization: `Bearer ${sign(basePayload())}` },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ isReviewer: true, userId: USER_ID });
  });

  it('returns 401 without a token', async () => {
    setConfigForTest(testConfig);

    const res = await buildApp().request('/whoami');

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: 'unauthorized' });
  });
});
