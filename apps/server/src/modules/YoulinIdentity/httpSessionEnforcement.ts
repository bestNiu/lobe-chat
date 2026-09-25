import { YoulinIdentityAuthorityReader } from '@/database/repositories/youlinIdentity/authorityReader';
import { YoulinSessionProofRepository } from '@/database/repositories/youlinIdentity/sessionProof';

import {
  getYoulinEnterpriseConfig,
  isYoulinEnterpriseSessionEnforcementEnabled,
} from './featureConfig';
import { getYoulinRuntimeDatabase } from './runtimeDatabase';
import { createYoulinSessionEnforcer } from './sessionEnforcer';

export { isYoulinEnterpriseSessionEnforcementEnabled } from './featureConfig';

let enforcement: ReturnType<typeof createYoulinSessionEnforcer> | undefined;

const createEnforcer = () => {
  const config = getYoulinEnterpriseConfig();
  if (!config) throw new Error('YOULIN_ENTERPRISE_SESSION_ENFORCEMENT_DISABLED');
  const db = getYoulinRuntimeDatabase();
  const proofRepository = new YoulinSessionProofRepository(db, {
    enabled: true,
    maxConcurrentReads: 8,
    statementTimeoutMs: 1500,
  });
  const authorityReader = new YoulinIdentityAuthorityReader(db, {
    allowManualEnrollment: config.manualEnrollment,
    enabled: true,
    enterpriseId: config.enterpriseId,
    issuer: config.issuer,
    maxConcurrentReads: 8,
    statementTimeoutMs: 1500,
  });
  return createYoulinSessionEnforcer({
    enabled: true,
    enterpriseId: config.enterpriseId,
    issuer: config.issuer,
    readAuthority: (sub, signal) => authorityReader.readUser(sub, signal),
    readProof: (sessionId, userId, signal) =>
      proofRepository.readSession(sessionId, userId, signal),
    timeoutMs: 4000,
  });
};

/** Default-off HTTP adapter. Enabled mode has no debug, API-key, OIDC or cache fallback. */
export const enforceYoulinEnterpriseHttpSession = async (
  session: Readonly<{ id: string; userId: string }>,
) => {
  try {
    if (!isYoulinEnterpriseSessionEnforcementEnabled()) return { status: 'not_enforced' as const };
    enforcement ??= createEnforcer();
    return await enforcement(session);
  } catch {
    return { reason: 'STATE_UNAVAILABLE', status: 'deny' as const };
  }
};
