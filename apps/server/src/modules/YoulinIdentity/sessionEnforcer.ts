import type { YoulinSessionProof, YoulinUserAuthority } from '@lobechat/types';
import debug from 'debug';
import { z } from 'zod';

const log = debug('lobe-server:youlin-identity');

interface YoulinSessionEnforcerOptions {
  enabled?: boolean;
  enterpriseId?: string;
  issuer?: string;
  readAuthority: (sub: string, signal: AbortSignal) => Promise<YoulinUserAuthority | null>;
  readProof: (
    sessionId: string,
    userId: string,
    signal: AbortSignal,
  ) => Promise<YoulinSessionProof | null>;
  timeoutMs: number;
}

const safeEpoch = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const proofSchema = z.object({
  authEpoch: safeEpoch,
  bindingId: z.uuid(),
  enterpriseId: z.string().min(1).max(128),
  externalSubject: z.string().min(1).max(255),
  issuer: z.url().max(1024),
  sessionId: z.string().min(1).max(255),
  subjectId: z.uuid(),
  userId: z.string().min(1).max(128),
});
const authoritySchema = proofSchema.omit({ sessionId: true }).extend({
  authorityVersion: safeEpoch,
  credentialsNotBefore: z.date(),
  disabled: z.boolean(),
});

/** Revalidates a native session's immutable enterprise proof against current formal state. */
export const createYoulinSessionEnforcer = (options: YoulinSessionEnforcerOptions) => {
  if (options.enabled !== true) {
    return async () => ({ status: 'not_enforced' as const });
  }
  const enterpriseId = z.string().min(1).max(128).parse(options.enterpriseId);
  const issuer = z.url().max(1024).parse(options.issuer);
  const timeoutMs = z.number().int().min(1).max(60_000).parse(options.timeoutMs);
  return async (sessionInput: Readonly<{ id: string; userId: string }>) => {
    const deny = (reason: string) => ({ reason, status: 'deny' as const });
    const session = z
      .object({ id: z.string().min(1).max(255), userId: z.string().min(1).max(128) })
      .safeParse(sessionInput);
    if (!session.success) return deny('INVALID_SESSION');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = Symbol('timeout');
    try {
      const work = async () => {
        const proofResult = await options.readProof(
          session.data.id,
          session.data.userId,
          controller.signal,
        );
        if (proofResult === null) return deny('SESSION_PROOF_MISSING');
        const proof = proofSchema.parse(proofResult);
        if (
          proof.sessionId !== session.data.id ||
          proof.userId !== session.data.userId ||
          proof.enterpriseId !== enterpriseId ||
          proof.issuer !== issuer
        )
          return deny('SESSION_PROOF_MISMATCH');
        controller.signal.throwIfAborted();
        const authorityResult = await options.readAuthority(
          proof.externalSubject,
          controller.signal,
        );
        if (authorityResult === null) return deny('SESSION_STALE');
        const authority = authoritySchema.parse(authorityResult);
        controller.signal.throwIfAborted();
        if (authority.disabled) return deny('DISABLED');
        if (
          authority.enterpriseId !== proof.enterpriseId ||
          authority.issuer !== proof.issuer ||
          authority.externalSubject !== proof.externalSubject ||
          authority.bindingId !== proof.bindingId ||
          authority.subjectId !== proof.subjectId ||
          authority.userId !== proof.userId ||
          authority.authEpoch !== proof.authEpoch
        )
          return deny('SESSION_STALE');
        return {
          context: Object.freeze({
            authEpoch: proof.authEpoch,
            enterpriseId: proof.enterpriseId,
            subjectId: proof.subjectId,
            userId: proof.userId,
          }),
          status: 'continue_authentication' as const,
        };
      };
      const result = await Promise.race([
        work(),
        new Promise<typeof timeout>((resolve) => {
          timer = setTimeout(() => resolve(timeout), timeoutMs);
        }),
      ]);
      if (result === timeout) return deny('STATE_UNAVAILABLE');
      return result;
    } catch {
      log('Session proof/current-state enforcement unavailable');
      return deny('STATE_UNAVAILABLE');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    }
  };
};
