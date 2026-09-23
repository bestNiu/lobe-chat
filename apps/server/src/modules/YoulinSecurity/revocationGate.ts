/**
 * Experimental, opt-in global revocation gate. NOT a PDP or token validator.
 * Not wired into any route, session provider, worker or production environment.
 * A successful check only permits the caller to CONTINUE current authorization.
 */
export interface SubjectRef {
  id: string;
  kind: 'service' | 'user';
}

export interface AuthenticatedSubjectContext {
  /** Derived from verified server-side identity, NEVER from request body/headers. */
  authEpoch: number;
  subjectRef: Readonly<SubjectRef>;
}

export interface RevocationState {
  authEpoch: number;
  disabled: boolean;
  sourceVersion: number;
  subjectRef: Readonly<SubjectRef>;
}

export type RevocationGateResult =
  | { status: 'continue_authorization' }
  | {
      reason:
        | 'DISABLED'
        | 'EPOCH_MISMATCH'
        | 'FEATURE_DISABLED'
        | 'INVALID_CONTEXT'
        | 'NOT_CONFIGURED'
        | 'STATE_UNAVAILABLE';
      status: 'deny';
    };

export interface RevocationGateOptions {
  /** Defaults OFF. Enabling this module is not approval to enable a production feature. */
  enabled?: boolean;
  /**
   * Must perform an authoritative global-subject read on EVERY invocation.
   * No stale replica/cache fallback. Adapter must validate storage responses and
   * honor abort; this module cannot prove source freshness or terminate ignored IO.
   */
  readAuthoritativeState?: (
    subject: Readonly<SubjectRef>,
    signal: AbortSignal,
  ) => Promise<Readonly<RevocationState> | null>;
  /** Explicit deployment parameter, not an invented revocation SLA. */
  readTimeoutMs?: number;
}

const isVersion = (value: number) => Number.isSafeInteger(value) && value >= 0;
const isSubject = (subject: Readonly<SubjectRef> | undefined) =>
  (subject?.kind === 'user' || subject?.kind === 'service') &&
  typeof subject.id === 'string' &&
  subject.id.length <= 128 &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(subject.id) &&
  !/\s/.test(subject.id);

/** Configuration is snapshotted; reconstruct the gate after a configuration change. */
export const createRevocationGate = (options: Readonly<RevocationGateOptions> = {}) => {
  const { enabled, readAuthoritativeState, readTimeoutMs } = options;

  return async (
    context: Readonly<AuthenticatedSubjectContext>,
  ): Promise<RevocationGateResult> => {
    if (enabled !== true) return { reason: 'FEATURE_DISABLED', status: 'deny' };
    if (
      typeof readAuthoritativeState !== 'function' ||
      typeof readTimeoutMs !== 'number' ||
      !Number.isSafeInteger(readTimeoutMs) ||
      readTimeoutMs <= 0 ||
      readTimeoutMs > 2_147_483_647
    ) {
      return { reason: 'NOT_CONFIGURED', status: 'deny' };
    }
    // JS callers and deserialized values can violate the TypeScript contract.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!isSubject(context?.subjectRef) || !isVersion(context?.authEpoch)) {
      return { reason: 'INVALID_CONTEXT', status: 'deny' };
    }

    // Prevent caller/adapter mutation across the asynchronous read from switching
    // the identity or epoch being checked. This is not a credential cache.
    const subject = Object.freeze({
      id: context.subjectRef.id,
      kind: context.subjectRef.kind,
    });
    const epoch = context.authEpoch;
    const controller = new AbortController();
    const timedOut = Symbol('timedOut');
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeout = new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => {
          resolve(timedOut);
        }, readTimeoutMs);
      });
      const state = await Promise.race([
        readAuthoritativeState(subject, controller.signal),
        timeout,
      ]);
      if (state === timedOut) {
        console.error('[YoulinSecurity] Authoritative state read timed out');
        return { reason: 'STATE_UNAVAILABLE', status: 'deny' };
      }
      if (
        !state ||
        !isSubject(state.subjectRef) ||
        state.subjectRef.id !== subject.id ||
        state.subjectRef.kind !== subject.kind ||
        !isVersion(state.authEpoch) ||
        !isVersion(state.sourceVersion) ||
        typeof state.disabled !== 'boolean'
      ) {
        return { reason: 'STATE_UNAVAILABLE', status: 'deny' };
      }
      // Keep these runtime checks: JS callers can mutate the input during IO.
      /* eslint-disable @typescript-eslint/no-unnecessary-condition */
      const contextChanged =
        context?.authEpoch !== epoch ||
        context?.subjectRef?.id !== subject.id ||
        context?.subjectRef?.kind !== subject.kind;
      /* eslint-enable @typescript-eslint/no-unnecessary-condition */
      if (contextChanged) {
        return { reason: 'INVALID_CONTEXT', status: 'deny' };
      }
      if (state.disabled) return { reason: 'DISABLED', status: 'deny' };
      if (state.authEpoch !== epoch) return { reason: 'EPOCH_MISMATCH', status: 'deny' };
      return { status: 'continue_authorization' };
    } catch {
      // Do not log raw adapter errors: they may contain SQL, credentials or PII.
      console.error('[YoulinSecurity] Authoritative state read failed');
      return { reason: 'STATE_UNAVAILABLE', status: 'deny' };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    }
  };
};
