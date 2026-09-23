// Compile-time contracts only; this file is never imported by the product.
import { createRevocationGate } from '../../../apps/server/src/modules/YoulinSecurity/revocationGate.ts';
import type {
  AuthenticatedSubjectContext,
  RevocationGateOptions,
  RevocationGateResult,
} from '../../../apps/server/src/modules/YoulinSecurity/revocationGate.ts';

const options: RevocationGateOptions = {
  enabled: true,
  readAuthoritativeState: async (subject, signal) => {
    signal.throwIfAborted();
    return { authEpoch: 7, disabled: false, sourceVersion: 12, subjectRef: subject };
  },
  readTimeoutMs: 1000,
};
const context: AuthenticatedSubjectContext = {
  authEpoch: 7,
  subjectRef: { id: 'synthetic-user', kind: 'user' },
};
const result: Promise<RevocationGateResult> = createRevocationGate(options)(context);
void result;

// @ts-expect-error Only boolean true can enable a gate.
createRevocationGate({ enabled: 'true' });
// @ts-expect-error Credentials must carry a numeric epoch.
createRevocationGate()({ ...context, authEpoch: '7' });
// @ts-expect-error Schema validation is not an allow authorization result.
const allow: RevocationGateResult = { status: 'allow' };
void allow;
// @ts-expect-error A reader must be async and return the typed state or null.
createRevocationGate({ readAuthoritativeState: () => ({ disabled: false }) });
