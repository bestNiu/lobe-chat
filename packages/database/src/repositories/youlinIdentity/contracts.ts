import {
  youlinBindingCaseStatuses,
  youlinEmploymentStatuses,
} from '@lobechat/types/youlinIdentity';
import { z } from 'zod';

const identifier = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim());
export const identityVersionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const identityActorSchema = z
  .object({ authEpoch: identityVersionSchema, subjectId: z.uuid() })
  .strict();
export const identityEnterpriseSchema = identifier;
export const identityIdempotencySchema = identifier;

const manualEmployeeNumberSchema = z.string().regex(/^[A-Z0-9][A-Z0-9._:-]{0,127}$/);
const manualExistingUserReservationSchema = z
  .object({
    employeeNumber: manualEmployeeNumberSchema,
    userId: identifier.regex(/^[A-Z0-9][\w.:-]*$/i),
  })
  .strict();
const manualNewUserReservationSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255).optional(),
    email: z
      .email()
      .max(320)
      .transform((value) => value.toLowerCase()),
    employeeNumber: manualEmployeeNumberSchema,
  })
  .strict();
export const manualEnrollmentReservationSchema = z.union([
  manualExistingUserReservationSchema,
  manualNewUserReservationSchema,
]);

export const manualPrincipalLinkSchema = z
  .object({
    expectedAuthEpoch: identityVersionSchema,
    expectedAuthorityVersion: identityVersionSchema,
    externalSubject: z.uuid(),
    issuer: z.url().max(1024),
    subjectId: z.uuid(),
  })
  .strict();

export const manualEnrollmentAuthorityChangeSchema = z
  .object({
    expectedAuthEpoch: identityVersionSchema,
    expectedAuthorityVersion: identityVersionSchema,
    subjectId: z.uuid(),
  })
  .strict();

export const bindingProposalSchema = z
  .object({
    externalSubject: z.string().min(1).max(255),
    issuer: z
      .url()
      .max(1024)
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 1024),
    legalEntityCode: identifier,
    personKey: z.string().min(1).max(255),
    subjectId: z.uuid(),
  })
  .strict();

export const registerPersonSchema = z
  .object({
    personKey: z.string().min(1).max(255),
    userId: identifier.regex(/^[A-Z0-9][\w.:-]*$/i),
  })
  .strict();

const employmentStageSchema = z
  .object({
    effectiveFrom: z.iso.datetime({ offset: true }).optional(),
    effectiveTo: z.iso.datetime({ offset: true }).optional(),
    employeeNumber: identifier,
    legalEntityCode: identifier,
    sourceStageKey: z.string().min(1).max(255),
    status: z.enum(youlinEmploymentStatuses),
  })
  .strict()
  .refine(
    (stage) =>
      !stage.effectiveFrom ||
      !stage.effectiveTo ||
      Date.parse(stage.effectiveFrom) <= Date.parse(stage.effectiveTo),
  );

export const employmentSnapshotSchema = z
  .object({
    personKey: z.string().min(1).max(255),
    sourceVersion: identityVersionSchema,
    stages: z.array(employmentStageSchema).max(64),
  })
  .strict()
  .refine(
    (snapshot) =>
      new Set(snapshot.stages.map((stage) => stage.sourceStageKey)).size === snapshot.stages.length,
  );

export const revokeSubjectSchema = z
  .object({
    expectedAuthEpoch: identityVersionSchema,
    reason: z.enum(['employment_ended', 'security_response', 'administrative_disable']),
    subjectId: z.uuid(),
  })
  .strict();

/** Internal adapter attestation only, never a user-supplied or transport-ACK assertion. */
export const credentialCleanupSchema = z
  .object({
    expectedAuthEpoch: identityVersionSchema,
    revocationEventId: z.uuid(),
  })
  .strict();

export const bindingDecisionSchema = z
  .object({
    caseId: z.uuid(),
    decision: z.enum(['approved', 'rejected']),
    evidenceRef: identifier,
    expectedVersion: identityVersionSchema,
  })
  .strict();

export const bindingQueueSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(25),
    status: z.enum(youlinBindingCaseStatuses).default('pending'),
  })
  .strict();

export const identityCommandResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      employeeNumber: z.string().max(128),
      status: z.literal('provider_work_started'),
      workId: z.uuid(),
    })
    .strict(),
  z
    .object({
      principalId: z.uuid(),
      status: z.literal('provider_work_completed'),
      subjectId: z.uuid(),
      workId: z.uuid(),
    })
    .strict(),
  z
    .object({
      revocationEventId: z.uuid().optional(),
      status: z.literal('created'),
      subjectId: z.uuid(),
    })
    .strict(),
  z.object({ bindingId: z.uuid(), status: z.literal('linked'), subjectId: z.uuid() }).strict(),
  z.object({ caseId: z.uuid(), status: z.enum(['conflict', 'review_required']) }).strict(),
  z
    .object({
      authEpoch: identityVersionSchema,
      revocationEventId: z.uuid().optional(),
      status: z.enum(['revoked', 'employment_updated', 'activated', 'cleanup_recorded']),
      subjectId: z.uuid(),
    })
    .strict(),
  z
    .object({
      caseId: z.uuid(),
      decision: z.enum(['approved', 'rejected']),
      status: z.literal('reviewed'),
    })
    .strict(),
]);

export class YoulinIdentityError extends Error {
  constructor(
    public readonly code: string,
    public readonly attemptId?: string,
  ) {
    super(code);
    this.name = 'YoulinIdentityError';
  }
}
