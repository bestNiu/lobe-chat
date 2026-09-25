import type { YoulinIdentityActor } from '@lobechat/types';
import { z } from 'zod';

import { YoulinIdentityCredentialCleanup } from '@/database/repositories/youlinIdentity/credentialCleanup';
import { YoulinIdentityManualEnrollment } from '@/database/repositories/youlinIdentity/manualEnrollment';
import { YoulinIdentityManualPrincipalLink } from '@/database/repositories/youlinIdentity/manualPrincipalLink';
import { YoulinManualProviderWork } from '@/database/repositories/youlinIdentity/manualProviderWork';
import { YoulinManualProvisioningStateReader } from '@/database/repositories/youlinIdentity/manualProvisioningState';

import { getYoulinEnterpriseConfig } from './featureConfig';
import { KeycloakAdministration } from './keycloakAdministration';
import { ManualProvisioningService } from './manualProvisioningService';
import { getYoulinRuntimeDatabase } from './runtimeDatabase';

/** Actor is captured from verified native-session proof or the private offline bootstrap, never JSON. */
export const createManualProvisioningService = (
  actor: Readonly<YoulinIdentityActor>,
  bootstrapOptions?: { ownerSuppliedInitialPassword: boolean },
) => {
  const config = getYoulinEnterpriseConfig();
  if (!config?.manualEnrollment || !config.localTestMode)
    throw new Error('LOCAL_MANUAL_CONTROL_DISABLED');
  const db = getYoulinRuntimeDatabase();
  const issuer = config.issuer;
  const options = {
    actor,
    enabled: true,
    enterpriseId: config.enterpriseId,
    lockTimeoutMs: 1000,
    sqlTimeoutMs: 1500,
  };
  const cleanup = new YoulinIdentityCredentialCleanup(db, {
    ...options,
    actor: { authEpoch: 0, subjectId: z.uuid().parse(process.env.YOULIN_CLEANUP_SUBJECT_ID) },
  });
  const state = new YoulinManualProvisioningStateReader(db, config.enterpriseId);
  const service = new ManualProvisioningService({
    work: new YoulinManualProviderWork(db, options),
    cleanup: {
      recordCompletion: async (key, input) => {
        const result = await cleanup.recordCompletion(key, input);
        if (result.status !== 'cleanup_recorded') throw new Error('INVALID_CLEANUP_RECEIPT');
        return result;
      },
    },
    enrollment: new YoulinIdentityManualEnrollment(db, {
      ...options,
      allowedIssuers: [issuer],
    }),
    idp: new KeycloakAdministration({
      adminClientId: z.string().min(1).parse(process.env.YOULIN_IDP_ADMIN_CLIENT_ID),
      adminClientSecret: z.string().min(32).parse(process.env.YOULIN_IDP_ADMIN_CLIENT_SECRET),
      fetch,
      issuer,
      realm: new URL(issuer).pathname.split('/').at(-1)!,
      testOnlyLoopbackHttp: config.localTestMode,
      temporaryInitialPassword: bootstrapOptions?.ownerSuppliedInitialPassword !== true,
    }),
    issuer,
    link: new YoulinIdentityManualPrincipalLink(db, { ...options, issuer }),
    readState: (subjectId) => state.read(subjectId),
  });
  return service;
};
