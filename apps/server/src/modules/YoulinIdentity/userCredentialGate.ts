import type { YoulinUserAuthority } from '@lobechat/types';
import debug from 'debug';
import { z } from 'zod';

import {
  type createKeycloakAccessVerifier,
  InvalidKeycloakCredentialError,
  isInvalidKeycloakCredential,
} from './keycloakAccessVerifier';

const log = debug('lobe-server:youlin-identity');

type VerifiedPrincipal = Awaited<ReturnType<ReturnType<typeof createKeycloakAccessVerifier>>>;

interface UserCredentialGateOptions {
  enabled?: boolean;
  enterpriseId: string;
  issuer: string;
  /** Explicit measured deployment bound, not permission to accept stale credentials. */
  maxClockSkewSeconds: number;
  readAuthority: (sub: string, signal: AbortSignal) => Promise<YoulinUserAuthority | null>;
  timeoutMs: number;
  verifyAccessToken: (token: string) => Promise<VerifiedPrincipal>;
}

const safeEpoch = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const authoritySchema = z.object({
  authEpoch: safeEpoch,
  authorityVersion: safeEpoch,
  bindingId: z.uuid(),
  credentialsNotBefore: z.date(),
  disabled: z.boolean(),
  enterpriseId: z.string().min(1),
  externalSubject: z.string().min(1).max(255),
  issuer: z.url(),
  subjectId: z.uuid(),
  userId: z.string().min(1),
});
const principalSchema = z.object({
  issuedAt: z.number().int().min(0).max(8_000_000_000_000),
  expiresAt: z.number().int().positive().max(8_000_000_000_000),
  issuer: z.url(),
  subject: z.string().min(1).max(255),
});

const FIXED_CODE = /^[A-Z][A-Z0-9_]*$/;
const JOSE_CODE = /^ERR_[A-Z0-9_]+$/;

/**
 * Reduces any failure to a fixed classification so an operator can name a denial from logs.
 * It deliberately never returns a message body: messages can carry tokens, claim values,
 * subjects or SQL text. Unknown shapes collapse to the error class name.
 */
export const classifyYoulinCredentialError = (error: unknown): string => {
  const candidate = error as { code?: unknown; message?: unknown; name?: unknown } | null;
  if (error instanceof InvalidKeycloakCredentialError)
    return typeof candidate?.message === 'string' && FIXED_CODE.test(candidate.message)
      ? candidate.message
      : 'UNCLASSIFIED_CREDENTIAL';
  if (typeof candidate?.code === 'string' && JOSE_CODE.test(candidate.code)) return candidate.code;
  if (
    candidate?.name === 'YoulinIdentityError' &&
    typeof candidate.code === 'string' &&
    FIXED_CODE.test(candidate.code)
  )
    return candidate.code;
  if (error instanceof Error) return error.name;
  return 'UNKNOWN';
};

/** Bridges verified Keycloak claims to current formal-table identity.
 * Does NOT create sessions, activate subjects or grant resources. Its server-only context is the
 * sole accepted input to YoulinSessionProofRepository.bindSession after native session creation.
 * Recheck every request, and for an existing session supply its SERVER-STORED identity/epoch.
 */
export const createYoulinUserCredentialGate = (options: UserCredentialGateOptions) => {
  const { enabled, verifyAccessToken, readAuthority } = options;
  const enterpriseId = z.string().min(1).max(128).parse(options.enterpriseId);
  const issuer = z.url().parse(options.issuer);
  const timeoutMs = z.number().int().min(1).max(60_000).parse(options.timeoutMs);
  const skew = z.number().int().min(0).max(300).parse(options.maxClockSkewSeconds) * 1000;
  return async (
    token: string,
    session?: Readonly<{ authEpoch: number; subjectId: string; userId: string }>,
  ) => {
    const deny = (reason: string) => ({ reason, status: 'deny' as const });
    const denied = (reason: string, detail: string) => {
      // Operator diagnosability without disclosure: fixed codes only, no credential or row data.
      log('credential eligibility denied reason=%s detail=%s', reason, detail);
      return deny(reason);
    };
    if (enabled !== true) return deny('FEATURE_DISABLED');
    if (typeof token !== 'string' || !token || token.length > 16_384)
      return deny('INVALID_CREDENTIAL');
    const expectedSession = session ? { ...session } : undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = Symbol('timeout');
    try {
      const work = async () => {
        let verified;
        try {
          verified = await verifyAccessToken(token);
        } catch (error) {
          if (isInvalidKeycloakCredential(error))
            return denied('INVALID_CREDENTIAL', classifyYoulinCredentialError(error));
          throw error;
        }
        const parsed = principalSchema.safeParse(verified);
        if (!parsed.success) return denied('INVALID_CREDENTIAL', 'VERIFIER_PRINCIPAL_SCHEMA');
        const principal = parsed.data;
        if (principal.issuer !== issuer || principal.expiresAt <= principal.issuedAt)
          return denied('INVALID_CREDENTIAL', 'ISSUER_OR_LIFESPAN');
        controller.signal.throwIfAborted();
        const authority = await readAuthority(principal.subject, controller.signal);
        if (authority === null) return denied('IDENTITY_MISMATCH', 'AUTHORITY_NOT_FOUND');
        const state = authoritySchema.parse(authority);
        controller.signal.throwIfAborted();
        if (
          state.enterpriseId !== enterpriseId ||
          state.issuer !== issuer ||
          state.externalSubject !== principal.subject
        )
          return denied('IDENTITY_MISMATCH', 'AUTHORITY_TENANT_MISMATCH');
        if (state.disabled) return denied('DISABLED', 'AUTHORITY_DISABLED');
        if (
          expectedSession &&
          (expectedSession.userId !== state.userId ||
            expectedSession.subjectId !== state.subjectId ||
            expectedSession.authEpoch !== state.authEpoch)
        )
          return denied('SESSION_STALE', 'SESSION_IDENTITY_STALE');
        const now = Date.now();
        if (principal.expiresAt * 1000 <= now || principal.issuedAt * 1000 > now + skew)
          return denied('INVALID_CREDENTIAL', 'CREDENTIAL_WINDOW');
        // Earliest possible real issuance must not predate the DB revocation barrier.
        if (principal.issuedAt * 1000 - skew < state.credentialsNotBefore.getTime())
          return denied('CREDENTIAL_TOO_OLD', 'CREDENTIAL_TOO_OLD');
        return {
          status: 'continue_authorization' as const,
          context: Object.freeze({
            authEpoch: state.authEpoch,
            bindingId: state.bindingId,
            enterpriseId,
            externalSubject: state.externalSubject,
            issuer: state.issuer,
            subjectId: state.subjectId,
            userId: state.userId,
          }),
        };
      };
      const result = await Promise.race([
        work(),
        new Promise<typeof timeout>((resolve) => {
          timer = setTimeout(() => resolve(timeout), timeoutMs);
        }),
      ]);
      if (result === timeout) return denied('STATE_UNAVAILABLE', 'GATE_TIMEOUT');
      return result;
    } catch (error) {
      if (isInvalidKeycloakCredential(error))
        return denied('INVALID_CREDENTIAL', classifyYoulinCredentialError(error));
      log(
        'User credential eligibility unavailable detail=%s',
        classifyYoulinCredentialError(error),
      );
      return deny('STATE_UNAVAILABLE');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    }
  };
};
