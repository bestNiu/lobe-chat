import type { BetterAuthOptions } from 'better-auth/minimal';
import type { GenericOAuthConfig } from 'better-auth/plugins';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureYoulinEnterpriseAuth, wrapYoulinEnterpriseHandler } from './youlinEnterprise';

const mocks = vi.hoisted(() => ({
  bindSession: vi.fn(),
  config: null as null | Record<string, unknown>,
  deleteSession: vi.fn(),
  enforceSession: vi.fn(),
  gate: vi.fn(),
  genericOAuth: vi.fn((options: { config: GenericOAuthConfig[] }) => ({
    id: 'generic-oauth',
    options,
  })),
}));

vi.mock('better-auth/plugins', () => ({ genericOAuth: mocks.genericOAuth }));
vi.mock('@/database/repositories/youlinIdentity/authorityReader', () => ({
  YoulinIdentityAuthorityReader: class {
    readUser = vi.fn();
  },
}));
vi.mock('@/database/repositories/youlinIdentity/sessionProof', () => ({
  YoulinSessionProofRepository: class {
    bindSession = mocks.bindSession;
  },
}));
vi.mock('@/server/modules/YoulinIdentity/featureConfig', () => ({
  getYoulinEnterpriseConfig: () => mocks.config,
}));
vi.mock('@/server/modules/YoulinIdentity/httpSessionEnforcement', () => ({
  enforceYoulinEnterpriseHttpSession: mocks.enforceSession,
}));
vi.mock('@/server/modules/YoulinIdentity/keycloakAccessVerifier', () => ({
  createKeycloakAccessVerifier: vi.fn(() => vi.fn()),
}));
vi.mock('@/server/modules/YoulinIdentity/runtimeDatabase', () => ({
  getYoulinRuntimeDatabase: vi.fn(() => ({
    delete: mocks.deleteSession.mockReturnValue({
      where: vi.fn(async () => undefined),
    }),
  })),
}));
vi.mock('@/server/modules/YoulinIdentity/userCredentialGate', () => ({
  createYoulinUserCredentialGate: vi.fn(() => mocks.gate),
}));

const binding = (userId: string) => ({
  authEpoch: 7,
  bindingId: '10000000-0000-4000-8000-000000000001',
  enterpriseId: 'enterprise',
  externalSubject: `subject-${userId}`,
  issuer: 'https://id.example.com/realms/enterprise',
  subjectId: '20000000-0000-4000-8000-000000000001',
  userId,
});

const enabledConfig = {
  appOrigin: 'https://app.example.com',
  audience: 'api',
  clientId: 'client',
  enterpriseId: 'enterprise',
  issuer: 'https://id.example.com/realms/enterprise',
  localTestMode: false,
  manualEnrollment: false,
};

describe('Youlin Better Auth policy', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, AUTH_KEYCLOAK_SECRET: 'secret' };
    mocks.config = enabledConfig;
    mocks.enforceSession.mockResolvedValue({ status: 'continue_authentication' });
    mocks.gate.mockImplementation(async (token: string) => {
      const userId = token.replace('token-', '');
      return { context: binding(userId), status: 'continue_authorization' };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const token = String(new Headers(init?.headers).get('Authorization')).replace(
          'Bearer token-',
          '',
        );
        return Response.json({
          email: `${token}@example.com`,
          name: token,
          sub: `subject-${token}`,
        });
      }),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('leaves options and handler behavior unchanged by default', async () => {
    mocks.config = null;
    const options = { plugins: [{ id: 'upstream' }] } as BetterAuthOptions;
    const handler = vi.fn(async () => new Response('upstream'));

    expect(configureYoulinEnterpriseAuth(options)).toBe(false);
    expect(options.plugins).toEqual([{ id: 'upstream' }]);
    expect(wrapYoulinEnterpriseHandler(handler, false)).toBe(handler);
  });

  it('disables alternate native authentication and account mutation surfaces', async () => {
    const options = { plugins: [] } as BetterAuthOptions;
    configureYoulinEnterpriseAuth(options);
    const handler = wrapYoulinEnterpriseHandler(
      vi.fn(async () => new Response('unexpected')),
      true,
    );

    for (const path of [
      '/api/auth/sign-up/email',
      '/api/auth/passkey/register',
      '/api/auth/admin',
    ]) {
      expect((await handler(new Request(`https://app.example.com${path}`))).status).toBe(403);
    }
    expect(options.emailAndPassword).toMatchObject({ disableSignUp: true, enabled: false });
    expect(options.account?.accountLinking).toMatchObject({ enabled: false });
  });

  it('returns no get-session payload when current proof enforcement denies', async () => {
    mocks.enforceSession.mockResolvedValueOnce({ reason: 'SESSION_STALE', status: 'deny' });
    const handler = wrapYoulinEnterpriseHandler(
      async () => Response.json({ session: { id: 'session-a' }, user: { id: 'a' } }),
      true,
    );

    const response = await handler(new Request('https://app.example.com/api/auth/get-session'));

    await expect(response.json()).resolves.toBeNull();
    expect(mocks.enforceSession).toHaveBeenCalledWith({ id: 'session-a', userId: 'a' });
  });

  it('requires callback proof and the exact verified user before session creation', async () => {
    const options = { plugins: [] } as BetterAuthOptions;
    configureYoulinEnterpriseAuth(options);
    const before = options.databaseHooks?.session?.create?.before;

    await expect(before?.({ id: 'session', userId: 'user-a' } as never, null)).rejects.toThrow(
      'YOULIN_SESSION_PROOF_REQUIRED',
    );
  });

  it('isolates concurrent callback proofs and binds each exact real session id', async () => {
    const options = { plugins: [] } as BetterAuthOptions;
    configureYoulinEnterpriseAuth(options);
    const provider = mocks.genericOAuth.mock.calls[0]![0].config[0];
    const hooks = options.databaseHooks?.session?.create;
    const context = { path: '/oauth2/callback/:providerId' } as never;
    const native = async (request: Request) => {
      const userId = new URL(request.url).searchParams.get('user')!;
      await provider.getUserInfo!({ accessToken: `token-${userId}` });
      await hooks?.before?.({ id: `session-${userId}`, userId } as never, context);
      await Promise.resolve();
      await hooks?.after?.({ id: `session-${userId}`, userId } as never, context);
      return new Response(userId);
    };
    const handler = wrapYoulinEnterpriseHandler(native, true);

    await Promise.all([
      handler(new Request(`https://app.example.com/api/auth/oauth2/callback/keycloak?user=a`)),
      handler(new Request(`https://app.example.com/api/auth/oauth2/callback/keycloak?user=b`)),
    ]);

    expect(mocks.bindSession).toHaveBeenCalledWith('session-a', binding('a'));
    expect(mocks.bindSession).toHaveBeenCalledWith('session-b', binding('b'));
  });

  it('rejects a session for a different user and does not bind it', async () => {
    const options = { plugins: [] } as BetterAuthOptions;
    configureYoulinEnterpriseAuth(options);
    const provider = mocks.genericOAuth.mock.calls[0]![0].config[0];
    const before = options.databaseHooks?.session?.create?.before;
    const handler = wrapYoulinEnterpriseHandler(async () => {
      await provider.getUserInfo!({ accessToken: 'token-a' });
      await before?.(
        { id: 'session-b', userId: 'b' } as never,
        { path: '/oauth2/callback/:providerId' } as never,
      );
      return new Response();
    }, true);

    await expect(
      handler(new Request('https://app.example.com/api/auth/oauth2/callback/keycloak')),
    ).rejects.toThrow('YOULIN_SESSION_USER_MISMATCH');
    expect(mocks.bindSession).not.toHaveBeenCalled();
  });

  it('rejects the callback when durable proof binding fails', async () => {
    const options = { plugins: [] } as BetterAuthOptions;
    configureYoulinEnterpriseAuth(options);
    const provider = mocks.genericOAuth.mock.calls[0]![0].config[0];
    const hooks = options.databaseHooks?.session?.create;
    mocks.bindSession.mockRejectedValueOnce(new Error('private database failure'));
    const handler = wrapYoulinEnterpriseHandler(async () => {
      await provider.getUserInfo!({ accessToken: 'token-a' });
      const context = { path: '/oauth2/callback/:providerId' } as never;
      await hooks?.before?.({ id: 'session-a', userId: 'a' } as never, context);
      await hooks?.after?.({ id: 'session-a', userId: 'a' } as never, context);
      return new Response();
    }, true);

    await expect(
      handler(new Request('https://app.example.com/api/auth/oauth2/callback/keycloak')),
    ).rejects.toThrow('private database failure');
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
  });

  it('rejects a token denied by verification/admission before fetching userinfo', async () => {
    mocks.gate.mockResolvedValueOnce({ reason: 'INVALID_CREDENTIAL', status: 'deny' });
    const options = { plugins: [] } as BetterAuthOptions;
    configureYoulinEnterpriseAuth(options);
    const provider = mocks.genericOAuth.mock.calls[0]![0].config[0];

    await expect(provider.getUserInfo!({ accessToken: 'token-a' })).rejects.toThrow(
      'YOULIN_ADMISSION_DENIED',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects userinfo subject mismatch and proof minting outside a callback request', async () => {
    const options = { plugins: [] } as BetterAuthOptions;
    configureYoulinEnterpriseAuth(options);
    const provider = mocks.genericOAuth.mock.calls[0]![0].config[0];
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ email: 'a@example.com', name: 'a', sub: 'different-subject' }),
    );

    await expect(provider.getUserInfo!({ accessToken: 'token-a' })).rejects.toThrow(
      'YOULIN_SUBJECT_MISMATCH',
    );
    await expect(provider.getUserInfo!({ accessToken: 'token-a' })).rejects.toThrow(
      'YOULIN_CALLBACK_CONTEXT_REQUIRED',
    );
  });

  it('turns an admission denial into a controlled same-origin redirect without leaking the reason', async () => {
    mocks.gate.mockResolvedValueOnce({ reason: 'DISABLED', status: 'deny' });
    const options = { plugins: [] } as BetterAuthOptions;
    configureYoulinEnterpriseAuth(options);
    const provider = mocks.genericOAuth.mock.calls[0]![0].config[0];
    const handler = wrapYoulinEnterpriseHandler(async () => {
      await expect(provider.getUserInfo!({ accessToken: 'token-a' })).rejects.toThrow(
        'YOULIN_ADMISSION_DENIED',
      );
      return new Response('denied', { headers: { 'set-cookie': 'partial=1' }, status: 500 });
    }, true);

    const response = await handler(
      new Request('http://127.0.0.1:33210/api/auth/oauth2/callback/keycloak?code=c&state=s'),
    );
    const location = new URL(response.headers.get('location')!);

    expect(response.status).toBe(303);
    // The redirect must use the validated configured origin, not the internal request URL:
    // a container-local `0.0.0.0`/loopback address is not reachable from the employee browser.
    expect(location.origin).toBe('https://app.example.com');
    expect(location.pathname).toBe('/auth-error');
    expect(location.searchParams.get('error')).toBe('youlin_admission_denied');
    expect(location.searchParams.get('attempt')).toMatch(/^[0-9a-f]{16}$/);
    // The internal reason stays server-side and a failed login must not carry cookies forward.
    expect(location.search).not.toContain('DISABLED');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('classifies provider failures as an unavailable login instead of exposing internals', async () => {
    const options = { plugins: [] } as BetterAuthOptions;
    configureYoulinEnterpriseAuth(options);
    const provider = mocks.genericOAuth.mock.calls[0]![0].config[0];
    vi.mocked(fetch).mockResolvedValueOnce(new Response('nope', { status: 503 }));
    const handler = wrapYoulinEnterpriseHandler(async () => {
      await expect(provider.getUserInfo!({ accessToken: 'token-a' })).rejects.toThrow(
        'YOULIN_USERINFO_UNAVAILABLE',
      );
      return new Response('upstream failure', { status: 502 });
    }, true);

    // Deliberately the internal container address: the browser-facing target still comes from config.
    const response = await handler(
      new Request('http://0.0.0.0:3210/api/auth/oauth2/callback/keycloak'),
    );
    const location = new URL(response.headers.get('location')!);

    expect(response.status).toBe(303);
    expect(location.origin).toBe('https://app.example.com');
    expect(location.searchParams.get('error')).toBe('youlin_login_unavailable');
  });

  it('does not mask unrelated server errors or rewrite non-callback responses', async () => {
    const options = { plugins: [] } as BetterAuthOptions;
    configureYoulinEnterpriseAuth(options);
    const handler = wrapYoulinEnterpriseHandler(
      async () => new Response('boom', { status: 503 }),
      true,
    );

    expect(
      (await handler(new Request('https://app.example.com/api/auth/oauth2/callback/keycloak')))
        .status,
    ).toBe(503);
    expect((await handler(new Request('https://app.example.com/api/auth/sign-out'))).status).toBe(
      503,
    );
  });
});
