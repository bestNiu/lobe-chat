// @vitest-environment node
// Real Better Auth request/API machinery; synthetic in-memory sessions, NOT product acceptance.
import { memoryAdapter } from 'better-auth/adapters/memory';
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureYoulinEnterpriseAuth, wrapYoulinEnterpriseHandler } from './youlinEnterprise';

const decision = vi.hoisted(() => vi.fn());
vi.mock('@/server/modules/YoulinIdentity/featureConfig', () => ({
  getYoulinEnterpriseConfig: () => ({
    appOrigin: 'http://127.0.0.1:33210',
    audience: 'web',
    clientId: 'web',
    enterpriseId: 'synthetic-sdk',
    issuer: 'http://127.0.0.1:33211/realms/test',
    localTestMode: true,
    manualEnrollment: true,
  }),
}));
vi.mock('@/server/modules/YoulinIdentity/httpSessionEnforcement', () => ({
  enforceYoulinEnterpriseHttpSession: decision,
}));
vi.mock('@/server/modules/YoulinIdentity/runtimeDatabase', () => ({
  getYoulinRuntimeDatabase: () => ({}),
}));
vi.mock('@/database/repositories/youlinIdentity/authorityReader', () => ({
  YoulinIdentityAuthorityReader: class {},
}));
vi.mock('@/database/repositories/youlinIdentity/sessionProof', () => ({
  YoulinSessionProofRepository: class {},
}));

const setup = async () => {
  const storage: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };
  const options: BetterAuthOptions = {
    baseURL: 'http://127.0.0.1:33210',
    database: memoryAdapter(storage),
    emailAndPassword: { enabled: true },
    secret: 'synthetic-sdk-secret-not-used-by-any-real-installation',
    session: { cookieCache: { enabled: false } },
  };
  // Obtain a genuine SDK cookie through signup BEFORE enabling enterprise mode. No forged cookie.
  const original = betterAuth(options);
  const signup = await original.handler(
    new Request('http://127.0.0.1:33210/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'origin': 'http://127.0.0.1:33210', 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Synthetic SDK',
        email: 'sdk@example.invalid',
        password: 'SyntheticSdkPassword123',
      }),
    }),
  );
  expect(signup.status).toBe(200);
  const cookie = signup.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(cookie).toBeTruthy();
  const headers = new Headers({ cookie });
  configureYoulinEnterpriseAuth(options);
  const enterprise = betterAuth(options);
  return { enterprise, headers };
};

beforeEach(() => {
  vi.stubEnv('AUTH_KEYCLOAK_SECRET', 'synthetic-oidc-secret');
  decision.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('real SDK getSession enforcement', () => {
  it('preserves current sessions for both internal SDK and HTTP callers', async () => {
    const { enterprise, headers } = await setup();
    decision.mockResolvedValue({ status: 'continue_authentication' });
    expect((await enterprise.api.getSession({ headers }))?.user.email).toBe('sdk@example.invalid');
    const response = await wrapYoulinEnterpriseHandler(
      enterprise.handler,
      true,
    )(new Request('http://127.0.0.1:33210/api/auth/get-session', { headers }));
    expect((await response.json())?.user.email).toBe('sdk@example.invalid');
    expect(decision).toHaveBeenCalled();
  });
  it('removes a revoked session from internal SDK calls, not only the outer HTTP wrapper', async () => {
    const { enterprise, headers } = await setup();
    decision.mockResolvedValue({ status: 'deny', reason: 'SESSION_STALE' });
    expect(await enterprise.api.getSession({ headers })).toBeNull();
    const response = await wrapYoulinEnterpriseHandler(
      enterprise.handler,
      true,
    )(new Request('http://127.0.0.1:33210/api/auth/get-session', { headers }));
    expect(await response.json()).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
