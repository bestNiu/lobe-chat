import { AgentRuntimeError } from '@lobechat/model-runtime';
import { ChatErrorType } from '@lobechat/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auth as nativeAuth } from '@/auth';
import { assertOIDCUserActive } from '@/libs/oidc-provider/access-control';
import { validateOIDCJWT } from '@/libs/oidc-provider/jwt';
import {
  enforceYoulinEnterpriseHttpSession,
  isYoulinEnterpriseSessionEnforcementEnabled,
} from '@/server/modules/YoulinIdentity/httpSessionEnforcement';
import { createErrorResponse } from '@/utils/errorResponse';

import { checkAuth, type RequestHandler } from './index';

vi.mock('@lobechat/model-runtime', () => ({
  AgentRuntimeError: {
    createError: vi.fn((type: string) => ({ errorType: type })),
  },
}));

vi.mock('@lobechat/types', () => ({
  ChatErrorType: {
    InternalServerError: 'InternalServerError',
    Unauthorized: 'Unauthorized',
  },
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

vi.mock('@/utils/errorResponse', () => ({
  createErrorResponse: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/libs/observability/traceparent', () => ({
  extractTraceContext: vi.fn(),
  injectActiveTraceHeaders: vi.fn(),
}));

vi.mock('@lobechat/observability-otel/api', () => ({
  context: { with: vi.fn((_ctx: any, fn: () => any) => fn()) },
}));

vi.mock('@/libs/oidc-provider/jwt', () => ({
  validateOIDCJWT: vi.fn(),
}));

vi.mock('@/libs/oidc-provider/access-control', () => ({
  assertOIDCUserActive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/server/modules/YoulinIdentity/httpSessionEnforcement', () => ({
  enforceYoulinEnterpriseHttpSession: vi.fn().mockResolvedValue({ status: 'not_enforced' }),
  isYoulinEnterpriseSessionEnforcementEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/envs/auth', () => ({
  LOBE_CHAT_OIDC_AUTH_HEADER: 'Oidc-Auth',
}));

describe('checkAuth', () => {
  const mockHandler: RequestHandler = vi.fn();
  const mockRequest = new Request('https://example.com');
  const mockOptions = { params: Promise.resolve({ provider: 'mock' }) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nativeAuth.api.getSession).mockReset().mockResolvedValue(null);
    vi.mocked(enforceYoulinEnterpriseHttpSession).mockResolvedValue({ status: 'not_enforced' });
    vi.mocked(isYoulinEnterpriseSessionEnforcementEnabled).mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should authenticate an active OIDC JWT and run the handler', async () => {
    const oidcRequest = new Request('https://example.com/webapi/chat/lobehub', {
      headers: { 'Oidc-Auth': 'valid-token' },
    });
    vi.mocked(validateOIDCJWT).mockResolvedValueOnce({
      tokenData: { sub: 'oidc-user' },
      userId: 'oidc-user',
    } as Awaited<ReturnType<typeof validateOIDCJWT>>);
    vi.mocked(assertOIDCUserActive).mockResolvedValueOnce(undefined);
    vi.mocked(mockHandler).mockResolvedValueOnce(new Response('ok'));

    await checkAuth(mockHandler)(oidcRequest, mockOptions);

    expect(assertOIDCUserActive).toHaveBeenCalledWith(expect.any(Object), 'oidc-user');
    expect(mockHandler).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        jwtPayload: { userId: 'oidc-user' },
        userId: 'oidc-user',
      }),
    );
  });

  it('should reject an inactive OIDC user without running the handler', async () => {
    const oidcRequest = new Request('https://example.com/webapi/chat/lobehub', {
      headers: { 'Oidc-Auth': 'valid-token' },
    });
    const inactiveError = Object.assign(new Error('OIDC user is no longer active'), {
      code: 'UNAUTHORIZED',
    });
    vi.mocked(validateOIDCJWT).mockResolvedValueOnce({
      tokenData: { sub: 'banned-user' },
      userId: 'banned-user',
    } as Awaited<ReturnType<typeof validateOIDCJWT>>);
    vi.mocked(assertOIDCUserActive).mockRejectedValueOnce(inactiveError);

    await checkAuth(mockHandler)(oidcRequest, mockOptions);

    expect(createErrorResponse).toHaveBeenCalledWith(ChatErrorType.Unauthorized, {
      error: inactiveError,
      provider: 'mock',
    });
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should return error response when no session is available', async () => {
    await checkAuth(mockHandler)(mockRequest, mockOptions);

    expect(AgentRuntimeError.createError).toHaveBeenCalledWith(ChatErrorType.Unauthorized);
    expect(createErrorResponse).toHaveBeenCalledWith(ChatErrorType.Unauthorized, {
      error: { errorType: ChatErrorType.Unauthorized },
      provider: 'mock',
    });
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('enforces current enterprise state for the native Better Auth session id', async () => {
    const { auth } = await import('@/auth');
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      session: { id: 'native-session-a' },
      user: { id: 'user-a' },
    } as Awaited<ReturnType<typeof auth.api.getSession>>);
    vi.mocked(isYoulinEnterpriseSessionEnforcementEnabled).mockReturnValueOnce(true);
    vi.mocked(enforceYoulinEnterpriseHttpSession).mockResolvedValueOnce({
      context: { authEpoch: 3, enterpriseId: 'a', subjectId: 'subject-a', userId: 'user-a' },
      status: 'continue_authentication',
    });
    vi.mocked(mockHandler).mockResolvedValueOnce(new Response('ok'));

    await checkAuth(mockHandler)(mockRequest, mockOptions);

    expect(enforceYoulinEnterpriseHttpSession).toHaveBeenCalledWith({
      id: 'native-session-a',
      userId: 'user-a',
    });
    expect(mockHandler).toHaveBeenCalled();
  });

  it('rejects missing/stale enterprise proof and does not use OIDC or debug fallback', async () => {
    const { auth } = await import('@/auth');
    vi.mocked(isYoulinEnterpriseSessionEnforcementEnabled).mockReturnValue(true);
    vi.mocked(enforceYoulinEnterpriseHttpSession).mockResolvedValue({
      reason: 'SESSION_PROOF_MISSING',
      status: 'deny',
    });
    vi.mocked(auth.api.getSession).mockResolvedValue({
      session: { id: 'native-session-a' },
      user: { id: 'user-a' },
    } as Awaited<ReturnType<typeof auth.api.getSession>>);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENABLE_MOCK_DEV_USER', '1');

    await checkAuth(mockHandler)(
      new Request('https://example.com', {
        headers: { 'lobe-auth-dev-backend-api': '1', 'Oidc-Auth': 'ignored' },
      }),
      mockOptions,
    );

    expect(validateOIDCJWT).not.toHaveBeenCalled();
    expect(enforceYoulinEnterpriseHttpSession).toHaveBeenCalled();
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should return unauthorized when OIDC JWT validation throws UNAUTHORIZED', async () => {
    const oidcRequest = new Request('https://example.com', {
      headers: { 'Oidc-Auth': 'expired-token' },
    });
    const oidcError = Object.assign(new Error('JWT token validation failed'), {
      code: 'UNAUTHORIZED',
    });
    vi.mocked(validateOIDCJWT).mockRejectedValueOnce(oidcError);

    await checkAuth(mockHandler)(oidcRequest, mockOptions);

    expect(createErrorResponse).toHaveBeenCalledWith(ChatErrorType.Unauthorized, {
      error: oidcError,
      provider: 'mock',
    });
    expect(consoleInfoSpy).toHaveBeenCalledWith('[auth] OIDC authentication failed', {
      clientId: undefined,
      code: 'UNAUTHORIZED',
      path: '/',
      provider: 'mock',
      userAgent: null,
      xClientType: null,
    });
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should return 500 when OIDC JWKS infrastructure fails (plain Error, no UNAUTHORIZED code)', async () => {
    const oidcRequest = new Request('https://example.com', {
      headers: { 'Oidc-Auth': 'any-token' },
    });
    // Simulates getVerificationKey() throwing due to misconfigured JWKS_KEY —
    // a plain Error without `code: 'UNAUTHORIZED'` must bubble up as 500,
    // not 401, so ops gets paged instead of the client being asked to re-auth.
    const infraError = new Error('JWKS_KEY public key retrieval failed: invalid JWK');
    vi.mocked(validateOIDCJWT).mockRejectedValueOnce(infraError);

    await checkAuth(mockHandler)(oidcRequest, mockOptions);

    expect(createErrorResponse).toHaveBeenCalledWith(ChatErrorType.InternalServerError, {
      error: infraError,
      provider: 'mock',
    });
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should log decoded OIDC client info when auth fails with OIDC header', async () => {
    const payload = Buffer.from(
      JSON.stringify({ client_id: 'lobehub-desktop', sub: 'user-123' }),
      'utf8',
    ).toString('base64url');
    const oidcRequest = new Request('https://example.com/webapi/chat/lobehub', {
      headers: {
        'Oidc-Auth': `header.${payload}.signature`,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'x-client-type': 'desktop',
      },
    });
    const oidcError = Object.assign(new Error('JWT token validation failed'), {
      code: 'UNAUTHORIZED',
    });
    vi.mocked(validateOIDCJWT).mockRejectedValueOnce(oidcError);

    await checkAuth(mockHandler)(oidcRequest, mockOptions);

    expect(consoleInfoSpy).toHaveBeenCalledWith('[auth] OIDC authentication failed', {
      clientId: 'lobehub-desktop',
      code: 'UNAUTHORIZED',
      path: '/webapi/chat/lobehub',
      provider: 'mock',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      xClientType: 'desktop',
    });
  });

  it('should not log OIDC auth info for better-auth session failures', async () => {
    await checkAuth(mockHandler)(mockRequest, mockOptions);

    expect(consoleInfoSpy).not.toHaveBeenCalled();
  });

  describe('mock dev user', () => {
    it('should use MOCK_DEV_USER_ID when ENABLE_MOCK_DEV_USER is enabled', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('ENABLE_MOCK_DEV_USER', '1');
      vi.stubEnv('MOCK_DEV_USER_ID', 'mock-user-123');

      await checkAuth(mockHandler)(mockRequest, mockOptions);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.any(Request),
        expect.objectContaining({
          jwtPayload: { userId: 'mock-user-123' },
          userId: 'mock-user-123',
        }),
      );
    });

    it('should fall back to DEV_USER when MOCK_DEV_USER_ID is not set', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('ENABLE_MOCK_DEV_USER', '1');
      delete process.env.MOCK_DEV_USER_ID;

      await checkAuth(mockHandler)(mockRequest, mockOptions);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.any(Request),
        expect.objectContaining({
          jwtPayload: { userId: 'DEV_USER' },
          userId: 'DEV_USER',
        }),
      );
    });

    it('should use MOCK_DEV_USER_ID with debug header', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('MOCK_DEV_USER_ID', 'mock-user-456');

      const debugRequest = new Request('https://example.com', {
        headers: { 'lobe-auth-dev-backend-api': '1' },
      });

      await checkAuth(mockHandler)(debugRequest, mockOptions);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.any(Request),
        expect.objectContaining({
          jwtPayload: { userId: 'mock-user-456' },
          userId: 'mock-user-456',
        }),
      );
    });

    it('should not mock user in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ENABLE_MOCK_DEV_USER', '1');
      vi.stubEnv('MOCK_DEV_USER_ID', 'mock-user-123');

      await checkAuth(mockHandler)(mockRequest, mockOptions);

      expect(mockHandler).not.toHaveBeenCalled();
    });
  });
});
