// Private offline LOCAL TEST entrypoint. Not imported by HTTP routes or used as browser evidence.
import { lstat, readFile } from 'node:fs/promises';

import { z } from 'zod';

import { YoulinIdentityLocalBootstrap } from '@/database/repositories/youlinIdentity/localBootstrap';

import { getYoulinEnterpriseConfig } from './featureConfig';
import { createManualProvisioningService } from './manualProvisioningFactory';
import { getYoulinRuntimeDatabase } from './runtimeDatabase';

const readPrivate = async (file: string) => {
  const stat = await lstat(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 0o077 ||
    stat.size > 8192
  )
    throw new Error('UNTRUSTED_PRIVATE_INPUT');
  return readFile(file, 'utf8');
};

export const main = async () => {
  const config = getYoulinEnterpriseConfig();
  if (!config?.localTestMode || !config.manualEnrollment)
    throw new Error('LOCAL_TEST_CONFIGURATION_REQUIRED');
  // Read and validate the owner's private password BEFORE opening a database or creating actors.
  const initialPassword = z
    .string()
    .min(12)
    .max(1024)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/\d/)
    .refine((value) => !/[\r\n]/.test(value))
    .parse((await readPrivate('/private/first-administrator.password')).replace(/\r?\n$/, ''));
  const person = z
    .object({
      displayName: z.string().min(1).max(255).optional(),
      email: z.email(),
      employeeNumber: z.string().regex(/^[A-Z0-9][A-Z0-9._:-]{0,127}$/),
    })
    .strict()
    .parse(JSON.parse(await readPrivate('/private/first-administrator.json')));
  const installation = z
    .object({
      bootstrapSubjectId: z.uuid(),
      cleanupSubjectId: z.uuid(),
      instanceProject: z.string().regex(/^youlin-local-[a-f0-9-]{36}$/),
    })
    .parse(JSON.parse(await readPrivate('/private/installation.json')));
  if (installation.cleanupSubjectId !== process.env.YOULIN_CLEANUP_SUBJECT_ID)
    throw new Error('CLEANUP_CONFIGURATION_MISMATCH');
  const bootstrap = new YoulinIdentityLocalBootstrap(getYoulinRuntimeDatabase(), {
    bootstrapOperatorId: installation.bootstrapSubjectId,
    cleanupWorkerId: installation.cleanupSubjectId,
    enabled: true,
    enterpriseId: config.enterpriseId,
    issuer: config.issuer,
    localTestOnlyAcknowledged: true,
    lockTimeoutMs: 1000,
    sqlTimeoutMs: 1500,
  });
  await bootstrap.initialize();
  const service = createManualProvisioningService(
    { authEpoch: 0, subjectId: installation.bootstrapSubjectId },
    { ownerSuppliedInitialPassword: true },
  );
  const user = await service.provision({
    ...person,
    initialPassword,
    idempotencyKey: 'initial-administrator-v1',
  });
  const result = await bootstrap.assignFirstAdministrator({ subjectId: user.subjectId });
  // Never echo the password or any credential; only non-secret ceremony facts leave this process.
  const outcome = Object.freeze({
    browserLoginVerified: false,
    credentialStatus: user.credentialStatus,
    privatePasswordPrinted: false,
    provisioningStatus: user.status,
    result: result.status,
    subjectId: user.subjectId,
  } as const);
  console.info(JSON.stringify(outcome));
  return outcome;
};
