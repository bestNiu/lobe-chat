import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

import type { YoulinSessionBindingContext } from '@lobechat/types';
import { toRecord } from '@lobechat/utils/object';
import { createAuthMiddleware } from 'better-auth/api';
import type { BetterAuthOptions } from 'better-auth/minimal';
import { genericOAuth, type GenericOAuthConfig } from 'better-auth/plugins';
import debug from 'debug';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { YoulinIdentityAuthorityReader } from '@/database/repositories/youlinIdentity/authorityReader';
import { YoulinSessionProofRepository } from '@/database/repositories/youlinIdentity/sessionProof';
import { session as nativeSessions } from '@/database/schemas/betterAuth';
import {
  getYoulinEnterpriseConfig,
  type YoulinEnterpriseConfig,
} from '@/server/modules/YoulinIdentity/featureConfig';
import { enforceYoulinEnterpriseHttpSession } from '@/server/modules/YoulinIdentity/httpSessionEnforcement';
import { createKeycloakAccessVerifier } from '@/server/modules/YoulinIdentity/keycloakAccessVerifier';
import { getYoulinRuntimeDatabase } from '@/server/modules/YoulinIdentity/runtimeDatabase';
import { createYoulinUserCredentialGate } from '@/server/modules/YoulinIdentity/userCredentialGate';

/** Browser-facing failure. Stable code only: the internal reason never leaves the server. */
interface RequestFailure {
  attemptId: string;
  code: string;
}

interface RequestProofStore {
  callback: boolean;
  failure?: RequestFailure;
  proof?: Readonly<YoulinSessionBindingContext>;
}

const log = debug('lobe-app:youlin-enterprise-auth');
const requestProof = new AsyncLocalStorage<RequestProofStore>();
const CALLBACK_PATH = '/api/auth/oauth2/callback/keycloak';
const AUTH_ERROR_PATH = '/auth-error';
// Coarse classes on purpose: telling a browser whether an account is disabled, unknown or stale
// would disclose identity state, so every denial shares one code and one correlatable attempt id.
const ADMISSION_DENIED_CODE = 'youlin_admission_denied';
const LOGIN_UNAVAILABLE_CODE = 'youlin_login_unavailable';

const recordFailure = (code: string, reason: string): RequestFailure => {
  const attemptId = randomBytes(8).toString('hex');
  // Fixed classification for operators. No token, subject, email, cookie or raw exception.
  log('enterprise auth failure code=%s reason=%s attempt=%s', code, reason, attemptId);
  return { attemptId, code };
};

const failWith = (
  store: RequestProofStore | undefined,
  code: string,
  reason: string,
  message: string,
): never => {
  if (store) store.failure = recordFailure(code, reason);
  throw new Error(message);
};

/** Same-origin controlled failure: the browser gets an actionable page, not an opaque 500. */
const controlledFailureResponse = (failure: RequestFailure) => {
  // The target comes from the validated configured origin, never from the internal request URL:
  // inside the container that is `http://0.0.0.0:3210`, which no browser can follow.
  const config = getYoulinEnterpriseConfig();
  if (!config) return undefined;
  const url = new URL(AUTH_ERROR_PATH, config.appOrigin);
  url.searchParams.set('error', failure.code);
  url.searchParams.set('attempt', failure.attemptId);
  return new Response(null, {
    headers: { 'cache-control': 'no-store', 'location': url.toString() },
    status: 303,
  });
};
const isCallbackContext = (path: string | undefined) =>
  path === '/oauth2/callback/:providerId' || path === '/oauth2/callback/keycloak';
const ALLOWED_PATHS = new Set([
  '/api/auth/get-session',
  CALLBACK_PATH,
  '/api/auth/sign-in/oauth2',
  '/api/auth/sign-out',
]);

const userInfoSchema = z.object({
  email: z.email(),
  name: z.string().min(1).optional(),
  preferred_username: z.string().min(1).optional(),
  picture: z.url().optional(),
  sub: z.string().min(1).max(255),
});

const responseWithoutSession = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('set-cookie');
  headers.set('cache-control', 'no-store');
  return new Response('null', {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

const enforceGetSessionResponse = async (response: Response) => {
  if (!response.ok) return response;
  try {
    const body = toRecord(await response.clone().json());
    const session = toRecord(body?.session);
    const user = toRecord(body?.user);
    if (typeof session?.id !== 'string' || typeof user?.id !== 'string')
      return responseWithoutSession(response);
    const decision = await enforceYoulinEnterpriseHttpSession({
      id: session.id,
      userId: user.id,
    });
    return decision.status === 'deny' ? responseWithoutSession(response) : response;
  } catch {
    return responseWithoutSession(response);
  }
};

const createKeycloakProvider = (
  config: YoulinEnterpriseConfig,
  clientSecret: string,
): GenericOAuthConfig => {
  const db = getYoulinRuntimeDatabase();
  const authority = new YoulinIdentityAuthorityReader(db, {
    allowManualEnrollment: config.manualEnrollment,
    enabled: true,
    enterpriseId: config.enterpriseId,
    issuer: config.issuer,
    maxConcurrentReads: 8,
    statementTimeoutMs: 1500,
  });
  const verifyAccessToken = createKeycloakAccessVerifier({
    audience: config.audience,
    authorizedParties: [config.clientId],
    enabled: true,
    issuer: config.issuer,
    testOnlyLoopbackHttp: config.localTestMode,
  });
  const gate = createYoulinUserCredentialGate({
    enabled: true,
    enterpriseId: config.enterpriseId,
    issuer: config.issuer,
    maxClockSkewSeconds: config.localTestMode ? 1 : 30,
    readAuthority: (sub, signal) => authority.readUser(sub, signal),
    timeoutMs: 4000,
    verifyAccessToken,
  });

  return {
    clientId: config.clientId,
    clientSecret,
    disableImplicitSignUp: true,
    disableSignUp: true,
    discoveryUrl: `${config.issuer}/.well-known/openid-configuration`,
    getUserInfo: async (tokens) => {
      const store = requestProof.getStore();
      const token = tokens.accessToken;
      if (!token)
        throw failWith(
          store,
          LOGIN_UNAVAILABLE_CODE,
          'ACCESS_TOKEN_REQUIRED',
          'YOULIN_ACCESS_TOKEN_REQUIRED',
        );
      const decision = await gate(token);
      if (decision.status !== 'continue_authorization')
        throw failWith(store, ADMISSION_DENIED_CODE, decision.reason, 'YOULIN_ADMISSION_DENIED');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(`${config.issuer}/protocol/openid-connect/userinfo`, {
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
          signal: controller.signal,
        });
        if (!response.ok)
          throw failWith(
            store,
            LOGIN_UNAVAILABLE_CODE,
            `USERINFO_HTTP_${response.status}`,
            'YOULIN_USERINFO_UNAVAILABLE',
          );
        const parsedProfile = userInfoSchema.safeParse(await response.json());
        if (!parsedProfile.success)
          throw failWith(
            store,
            LOGIN_UNAVAILABLE_CODE,
            'USERINFO_SCHEMA',
            'YOULIN_USERINFO_UNAVAILABLE',
          );
        const profile = parsedProfile.data;
        if (profile.sub !== decision.context.externalSubject)
          throw failWith(
            store,
            ADMISSION_DENIED_CODE,
            'SUBJECT_MISMATCH',
            'YOULIN_SUBJECT_MISMATCH',
          );
        if (!store?.callback)
          throw failWith(
            store,
            LOGIN_UNAVAILABLE_CODE,
            'CALLBACK_CONTEXT_REQUIRED',
            'YOULIN_CALLBACK_CONTEXT_REQUIRED',
          );
        store.proof = decision.context;
        return {
          email: profile.email,
          emailVerified: false,
          id: profile.sub,
          image: profile.picture,
          name: profile.name ?? profile.preferred_username ?? profile.email,
        };
      } finally {
        clearTimeout(timer);
      }
    },
    issuer: config.issuer,
    pkce: true,
    prompt: 'login',
    providerId: 'keycloak',
    redirectURI: `${config.appOrigin}${CALLBACK_PATH}`,
    requireIssuerValidation: true,
    scopes: ['openid', 'profile', 'email'],
  };
};

/** Mutates options before betterAuth(options), preserving Better Auth's inferred API surface. */
export const configureYoulinEnterpriseAuth = (options: BetterAuthOptions) => {
  const config = getYoulinEnterpriseConfig();
  if (!config) return false;
  const clientSecret = z.string().min(1).parse(process.env.AUTH_KEYCLOAK_SECRET);
  const db = getYoulinRuntimeDatabase();
  const proofRepository = new YoulinSessionProofRepository(db, {
    enabled: true,
    maxConcurrentReads: 8,
    statementTimeoutMs: 1500,
  });
  const oldSessionCreate = options.databaseHooks?.session?.create;

  options.account = {
    ...options.account,
    accountLinking: { allowDifferentEmails: false, enabled: false, trustedProviders: [] },
    encryptOAuthTokens: true,
  };
  options.emailAndPassword = { disableSignUp: true, enabled: false };
  options.socialProviders = {};
  options.trustedOrigins = [config.appOrigin];
  options.user = { ...options.user, changeEmail: { enabled: false } };
  options.session = { ...options.session, cookieCache: { enabled: false } };
  options.plugins = [
    genericOAuth({ config: [createKeycloakProvider(config, clientSecret)] }),
    {
      id: 'youlin-current-session',
      hooks: {
        after: [
          {
            matcher: (context) => context.path === '/get-session',
            handler: createAuthMiddleware(async (context) => {
              const value = toRecord(context.context.returned);
              const session = toRecord(value?.session);
              const user = toRecord(value?.user);
              if (typeof session?.id !== 'string' || typeof user?.id !== 'string')
                return context.json(null);
              try {
                const decision = await enforceYoulinEnterpriseHttpSession({
                  id: session.id,
                  userId: user.id,
                });
                if (decision.status !== 'continue_authentication') return context.json(null);
              } catch {
                return context.json(null);
              }
            }),
          },
        ],
      },
    },
  ];
  options.databaseHooks = {
    ...options.databaseHooks,
    account: {
      ...options.databaseHooks?.account,
      create: { before: async () => false },
    },
    session: {
      ...options.databaseHooks?.session,
      create: {
        after: async (session, context) => {
          const store = requestProof.getStore();
          if (!store?.callback || !isCallbackContext(context?.path) || !store.proof)
            throw failWith(
              store,
              LOGIN_UNAVAILABLE_CODE,
              'SESSION_PROOF_REQUIRED',
              'YOULIN_SESSION_PROOF_REQUIRED',
            );
          if (session.userId !== store.proof.userId)
            throw failWith(
              store,
              ADMISSION_DENIED_CODE,
              'SESSION_USER_MISMATCH',
              'YOULIN_SESSION_USER_MISMATCH',
            );
          // Better Auth commits the native session before this hook runs, so an unbacked session
          // must be removed instead of being left to the deny-first PEP as rollback-sensitive data.
          try {
            await proofRepository.bindSession(session.id, store.proof);
          } catch (error) {
            await db
              .delete(nativeSessions)
              .where(eq(nativeSessions.id, session.id))
              .catch(() =>
                log('Proof bind failed and the unbacked native session remained; it stays denied'),
              );
            if (store) store.failure = recordFailure(LOGIN_UNAVAILABLE_CODE, 'PROOF_BIND_FAILED');
            throw error;
          }
          await oldSessionCreate?.after?.(session, context);
        },
        before: async (session, context) => {
          const store = requestProof.getStore();
          if (!store?.callback || !isCallbackContext(context?.path) || !store.proof)
            throw failWith(
              store,
              LOGIN_UNAVAILABLE_CODE,
              'SESSION_PROOF_REQUIRED',
              'YOULIN_SESSION_PROOF_REQUIRED',
            );
          if (session.userId !== store.proof.userId)
            throw failWith(
              store,
              ADMISSION_DENIED_CODE,
              'SESSION_USER_MISMATCH',
              'YOULIN_SESSION_USER_MISMATCH',
            );
          return oldSessionCreate?.before?.(session, context);
        },
      },
    },
    user: {
      ...options.databaseHooks?.user,
      create: { before: async () => false },
      update: { before: async () => false },
    },
  };
  return true;
};

export const wrapYoulinEnterpriseHandler = (
  handler: (request: Request) => Promise<Response>,
  enabled: boolean,
): ((request: Request) => Promise<Response>) => {
  if (!enabled) return handler;
  return async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (!ALLOWED_PATHS.has(path)) return new Response(null, { status: 403 });
    const store: RequestProofStore = { callback: path === CALLBACK_PATH };
    const response = await requestProof.run(store, () => handler(request));
    if (path === '/api/auth/get-session') return enforceGetSessionResponse(response);
    // A recorded enterprise failure must reach the user as a classified page, never an opaque 500.
    // Only server responses are rewritten; anything else stays exactly as Better Auth produced it.
    if (store.callback && store.failure && response.status >= 500)
      return controlledFailureResponse(store.failure) ?? response;
    return response;
  };
};
