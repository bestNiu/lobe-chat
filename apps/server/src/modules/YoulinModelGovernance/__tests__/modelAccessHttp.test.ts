import { beforeEach, describe, expect, it, vi } from 'vitest';

import { YoulinIdentityError } from '@/database/repositories/youlinIdentity/contracts';

import { createModelAccessHandler } from '../modelAccessHttp';

const mocks = vi.hoisted(() => ({
  config: null as null | Record<string, unknown>,
  enforce: vi.fn(),
  getSession: vi.fn(),
  listAccess: vi.fn(),
  setUserQuota: vi.fn(),
  upsertGrant: vi.fn(),
}));

vi.mock('@/server/modules/YoulinIdentity/featureConfig', () => ({
  getYoulinEnterpriseConfig: () => mocks.config,
}));
vi.mock('@/server/modules/YoulinIdentity/httpSessionEnforcement', () => ({
  enforceYoulinEnterpriseHttpSession: mocks.enforce,
}));
vi.mock('@/server/modules/YoulinIdentity/runtimeDatabase', () => ({
  getYoulinRuntimeDatabase: () => ({}),
}));
vi.mock('@/database/repositories/youlinModelGovernance/governanceTransaction', () => ({
  YoulinModelGovernanceTransaction: class {
    listAccess = mocks.listAccess;
    setUserQuota = mocks.setUserQuota;
    upsertGrant = mocks.upsertGrant;
  },
}));

const ORIGIN = 'http://127.0.0.1:33210';
const jsonRequest = (method: string, url: string, body?: unknown, origin = ORIGIN) =>
  new Request(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin },
    method,
  });
const handler = () => createModelAccessHandler(mocks.getSession as never);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config = {
    appOrigin: ORIGIN,
    enterpriseId: 'youlin-local',
    localTestMode: true,
    manualEnrollment: true,
  };
  mocks.getSession.mockResolvedValue({ session: { id: 'session-a' }, user: { id: 'admin-user' } });
  mocks.enforce.mockResolvedValue({
    context: { authEpoch: 3, subjectId: 'subject-admin' },
    status: 'continue_authentication',
  });
  mocks.listAccess.mockResolvedValue({ grants: [], quota: null, usage: null });
  mocks.upsertGrant.mockResolvedValue({ grantId: 'g1', updated: false });
  mocks.setUserQuota.mockResolvedValue({ monthlyTotalTokenLimit: null });
});

describe('model access operator API', () => {
  it('is unavailable without enterprise local-test configuration and rejects foreign origins', async () => {
    mocks.config = null;
    expect((await handler()(jsonRequest('GET', `${ORIGIN}/x?userId=u`))).status).toBe(404);
    mocks.config = {
      appOrigin: ORIGIN,
      enterpriseId: 'e',
      localTestMode: true,
      manualEnrollment: true,
    };
    const foreign = await handler()(
      jsonRequest('GET', `${ORIGIN}/x?userId=u`, undefined, 'http://evil.example'),
    );
    expect(foreign.status).toBe(403);
    expect((await foreign.json()).code).toBe('REQUEST_ORIGIN_REJECTED');
  });

  it('accepts a same-origin GET without an Origin header and refuses a spoofed host', async () => {
    // Browsers do not send Origin on same-origin GET; the gate must accept Sec-Fetch-Site plus a
    // matching Host, and must never trust the internal request URL. A stub is required because
    // undici strips forbidden header names (Sec-Fetch-*) that real browsers do send.
    const stub = (headers: Record<string, string>, url = `${ORIGIN}/x?userId=target-1`) =>
      ({
        body: undefined,
        headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
        method: 'GET',
        url,
      }) as unknown as Request;
    expect(
      (await handler()(stub({ 'host': '127.0.0.1:33210', 'sec-fetch-site': 'same-origin' })))
        .status,
    ).toBe(200);
    expect(
      (await handler()(stub({ 'host': 'evil.example', 'sec-fetch-site': 'same-origin' }))).status,
    ).toBe(403);
    expect((await handler()(stub({ 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    expect((await handler()(stub({}))).status).toBe(403);
    // The internal container URL must never be what authorizes the request.
    expect(
      (
        await handler()(
          stub(
            { 'host': '127.0.0.1:33210', 'sec-fetch-site': 'same-origin' },
            'http://0.0.0.0:3210/x?userId=target-1',
          ),
        )
      ).status,
    ).toBe(200);
  });

  it('requires a native session that still passes per-request enforcement', async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await handler()(jsonRequest('GET', `${ORIGIN}/x?userId=u`))).status).toBe(401);
    mocks.enforce.mockResolvedValueOnce({ reason: 'DISABLED', status: 'deny' });
    expect((await handler()(jsonRequest('GET', `${ORIGIN}/x?userId=u`))).status).toBe(401);
  });

  it('reads one user authorization with its current period usage', async () => {
    const response = await handler()(jsonRequest('GET', `${ORIGIN}/x?userId=target-1`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.listAccess).toHaveBeenCalledWith('target-1');
    expect((await handler()(jsonRequest('GET', `${ORIGIN}/x`))).status).toBe(400);
  });

  it('writes grants and quotas for the session actor, never for a body-supplied one', async () => {
    const response = await handler()(
      jsonRequest('PUT', `${ORIGIN}/x`, {
        grant: { enabled: true, model: 'qwen3.8-max', monthlyTokenLimit: 1000 },
        quota: { monthlyTotalTokenLimit: null },
        userId: 'target-1',
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.upsertGrant).toHaveBeenCalledWith({
      enabled: true,
      model: 'qwen3.8-max',
      monthlyTokenLimit: 1000,
      targetUserId: 'target-1',
    });
    expect(mocks.setUserQuota).toHaveBeenCalledWith({
      monthlyTotalTokenLimit: null,
      targetUserId: 'target-1',
    });
    // A client that tries to name the actor, a grant row or an epoch is rejected, not ignored.
    for (const extra of [{ actor: 'someone' }, { subjectId: 'x' }, { authEpoch: 9 }])
      expect(
        (
          await handler()(
            jsonRequest('PUT', `${ORIGIN}/x`, {
              grant: { enabled: true, model: 'm' },
              userId: 'target-1',
              ...extra,
            }),
          )
        ).status,
      ).toBe(400);
  });

  it('maps an unauthorized actor to 403 and bounds the request body', async () => {
    mocks.upsertGrant.mockRejectedValueOnce(new YoulinIdentityError('ACTOR_NOT_AUTHORIZED'));
    const denied = await handler()(
      jsonRequest('PUT', `${ORIGIN}/x`, { grant: { enabled: true, model: 'm' }, userId: 't' }),
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe('NOT_AUTHORIZED');

    const huge = await handler()(
      jsonRequest('PUT', `${ORIGIN}/x`, {
        grant: { enabled: true, model: 'm', provider: 'x'.repeat(9000) },
        userId: 't',
      }),
    );
    expect(huge.status).toBe(413);
  });

  it('rejects other methods and malformed JSON without touching the database', async () => {
    expect((await handler()(jsonRequest('POST', `${ORIGIN}/x`, {}))).status).toBe(405);
    const broken = new Request(`${ORIGIN}/x`, {
      body: '{not json',
      headers: { 'content-type': 'application/json', 'origin': ORIGIN },
      method: 'PUT',
    });
    expect((await handler()(broken)).status).toBe(400);
    expect(mocks.upsertGrant).not.toHaveBeenCalled();
  });
});
