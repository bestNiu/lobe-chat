import { createDecipheriv, createHash } from 'node:crypto';

import type { TrustedClientPayload } from '@lobehub/market-sdk';
import type { Context, MiddlewareHandler } from 'hono';

import { getConfig } from '../config';
import type { MarketActor } from '../types';

/**
 * Verifies `@lobehub/market-sdk` trusted-client tokens.
 *
 * The SDK only ships the encrypting side (`createTrustedClientToken`), so the
 * decrypting half lives here and must stay byte-compatible with it:
 *   key      = sha256(secret) when the secret carries the SDK prefix
 *   token    = base64(iv[12] || ciphertext || authTag[16])
 *   algorithm= aes-256-gcm
 */
const CRYPTO = {
  ALGORITHM: 'aes-256-gcm',
  AUTH_TAG_LENGTH: 16,
  IV_LENGTH: 12,
  KEY_LENGTH: 32,
} as const;

const SECRET_PREFIX = 'lobehub-market_tcs_';

/** Tokens are minted per request; a short window bounds replay. */
export const DEFAULT_TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * Synthetic ids used by local evals/smoke scripts. Market rejects them because
 * no real account carries these prefixes, and the app already refuses to sign
 * them — reject again here so a hand-made token cannot slip through.
 */
const SYNTHETIC_USER_ID_PATTERN = /^(?:eval|qstash_smoke)_/;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 = 401,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export const deriveKey = (secret: string): Buffer => {
  if (secret.startsWith(SECRET_PREFIX)) {
    return createHash('sha256').update(secret).digest();
  }

  const key = Buffer.from(secret, 'hex');

  if (key.length !== CRYPTO.KEY_LENGTH) {
    throw new AuthError(`Invalid trusted client secret length: expected 32 bytes`);
  }

  return key;
};

export const decryptTrustedClientToken = (token: string, secret: string): TrustedClientPayload => {
  let raw: Buffer;

  try {
    raw = Buffer.from(token, 'base64');
  } catch {
    throw new AuthError('Malformed trusted client token');
  }

  if (raw.length <= CRYPTO.IV_LENGTH + CRYPTO.AUTH_TAG_LENGTH) {
    throw new AuthError('Malformed trusted client token');
  }

  const iv = raw.subarray(0, CRYPTO.IV_LENGTH);
  const authTag = raw.subarray(raw.length - CRYPTO.AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(CRYPTO.IV_LENGTH, raw.length - CRYPTO.AUTH_TAG_LENGTH);

  try {
    const decipher = createDecipheriv(CRYPTO.ALGORITHM, deriveKey(secret), iv);

    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    );

    return JSON.parse(plaintext) as TrustedClientPayload;
  } catch (error) {
    if (error instanceof AuthError) throw error;

    // A wrong key or a mutated byte fails the GCM tag, which surfaces here.
    throw new AuthError('Trusted client token failed verification');
  }
};

export interface VerifyOptions {
  clientId: string;
  now?: number;
  secret: string;
  ttlMs?: number;
}

export const verifyTrustedClientToken = (token: string, options: VerifyOptions) => {
  const { secret, clientId, now = Date.now(), ttlMs = DEFAULT_TOKEN_TTL_MS } = options;
  const payload = decryptTrustedClientToken(token, secret);

  if (!payload || typeof payload !== 'object') {
    throw new AuthError('Trusted client token payload is invalid');
  }

  if (payload.clientId !== clientId) {
    throw new AuthError('Trusted client token was issued for a different client');
  }

  if (!payload.userId || typeof payload.userId !== 'string') {
    throw new AuthError('Trusted client token has no userId');
  }

  if (SYNTHETIC_USER_ID_PATTERN.test(payload.userId)) {
    throw new AuthError('Synthetic userId is not a market account');
  }

  if (typeof payload.timestamp !== 'number' || !Number.isFinite(payload.timestamp)) {
    throw new AuthError('Trusted client token has no timestamp');
  }

  const age = now - payload.timestamp;

  if (age > ttlMs) throw new AuthError('Trusted client token expired');

  // A token from the future is either a broken clock or a forgery attempt; the
  // GCM tag already rules out tampering, so allow a small skew only.
  if (age < -ttlMs) throw new AuthError('Trusted client token is not yet valid');

  return payload;
};

export const extractBearerToken = (authorization: string | undefined): string | undefined => {
  if (!authorization) return undefined;

  // Split instead of a backtracking regex: `Bearer   <token>` is the only
  // accepted shape and a linear scan cannot be exploited.
  const parts = authorization.trim().split(/[ \t]+/);

  if (parts[0]?.toLowerCase() !== 'bearer') return undefined;

  const token = parts.slice(1).join(' ').trim();

  return token || undefined;
};

/**
 * Both headers carry the same trusted-client token.
 *
 * `@lobehub/market-sdk` sends it as `x-lobe-trust-token` (headers are copied from
 * the MarketService options), while hand-rolled callers use `Authorization:
 * Bearer`. Accepting either keeps the SDK contract intact.
 */
export const extractTrustedToken = (
  trustedHeader: string | undefined,
  authorization: string | undefined,
): string | undefined => {
  const fromHeader = trustedHeader?.trim();

  if (fromHeader) return fromHeader;

  return extractBearerToken(authorization);
};

// ---------------------------------------------------------------------------
// Hono integration
// ---------------------------------------------------------------------------

export interface AuthVariables {
  actor: MarketActor;
}

export type MarketEnv = { Variables: AuthVariables };

export type ActorResolver = (payload: TrustedClientPayload) => Promise<MarketActor>;

/**
 * Default resolver. Roles come from the market's own tables because the
 * open-source LobeHub build seeds no RBAC roles.
 */
export const createDefaultActorResolver =
  (lookup: {
    isAdmin: (payload: TrustedClientPayload) => Promise<boolean>;
    isReviewer: (payload: TrustedClientPayload) => Promise<boolean>;
    teamIds: (userId: string) => Promise<string[]>;
  }): ActorResolver =>
  async (payload) => {
    const [isAdmin, isReviewer, teamIds] = await Promise.all([
      lookup.isAdmin(payload),
      lookup.isReviewer(payload),
      lookup.teamIds(payload.userId),
    ]);

    return {
      email: payload.email || undefined,
      isAdmin,
      isReviewer,
      name: payload.name,
      teamIds,
      userId: payload.userId,
    };
  };

export const createAuthMiddleware = (
  resolveActor: ActorResolver,
  /** Injected by the app so this middleware never reads global config. */
  credentials?: { clientId: string; secret: string },
): MiddlewareHandler<MarketEnv> => {
  return async (c, next) => {
    const { clientId, secret } = credentials ?? {
      clientId: getConfig().MARKET_TRUSTED_CLIENT_ID,
      secret: getConfig().MARKET_TRUSTED_CLIENT_SECRET,
    };
    const token = extractTrustedToken(
      c.req.header('x-lobe-trust-token'),
      c.req.header('authorization'),
    );

    if (!token) {
      return c.json({ error: 'unauthorized', error_description: 'Missing bearer token' }, 401);
    }

    try {
      const payload = verifyTrustedClientToken(token, { clientId, secret });

      c.set('actor', await resolveActor(payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid trusted client token';

      return c.json({ error: 'unauthorized', error_description: message }, 401);
    }

    await next();
  };
};

/** Read the actor in a route handler; throws if the middleware was skipped. */
export const requireActor = (c: Context<MarketEnv>): MarketActor => {
  const actor = c.get('actor');

  if (!actor) throw new AuthError('No actor resolved for this request', 401);

  return actor;
};
