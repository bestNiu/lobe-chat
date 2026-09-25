import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { users } from '../../schemas/user';
import {
  youlinIdentityBindings,
  youlinPersons,
  youlinSubjects,
} from '../../schemas/youlinIdentity';
import { youlinManualEnrollments } from '../../schemas/youlinManualEnrollment';
import type { LobeChatDatabase } from '../../type';
import type { IdentityCommandOptions } from './commandRunner';
import { IdentityCommandRunner } from './commandRunner';
import {
  manualEnrollmentAuthorityChangeSchema,
  manualEnrollmentReservationSchema,
  YoulinIdentityError,
} from './contracts';
import { invalidateSubjectAuthority } from './lifecycle';

interface ManualEnrollmentOptions extends IdentityCommandOptions {
  /** Issuers whose already-persisted active bindings may satisfy activation admission. */
  allowedIssuers: readonly string[];
}

/** Administrator-controlled admission. It never writes HR facts, calls an IdP, or grants access. */
export class YoulinIdentityManualEnrollment {
  private readonly commands: IdentityCommandRunner;
  private readonly issuers: ReadonlySet<string>;

  constructor(db: LobeChatDatabase, options: ManualEnrollmentOptions) {
    this.commands = new IdentityCommandRunner(db, options);
    this.issuers = new Set(
      z
        .array(z.url().max(1024))
        .min(1)
        .max(16)
        .parse([...options.allowedIssuers]),
    );
  }

  async reserve(idempotencyKey: string, input: unknown) {
    const reservation = manualEnrollmentReservationSchema.parse(input);
    const { enterpriseId } = this.commands;
    const result = await this.commands.run(
      'reserve_manual_enrollment',
      idempotencyKey,
      reservation,
      async (tx) => {
        const userId = 'userId' in reservation ? reservation.userId : randomUUID();
        if (!('userId' in reservation)) {
          await tx.insert(users).values({
            email: reservation.email,
            emailVerified: false,
            fullName: reservation.displayName,
            id: userId,
            normalizedEmail: reservation.email,
            username: reservation.employeeNumber.toLowerCase(),
          });
        }
        const [account] = await tx
          .select({ banned: users.banned, id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
          .for('share');
        if (!account || account.banned === true)
          throw new YoulinIdentityError('ACCOUNT_UNAVAILABLE');

        const [existing] = await tx
          .select({ id: youlinManualEnrollments.id })
          .from(youlinManualEnrollments)
          .where(
            and(
              eq(youlinManualEnrollments.enterpriseId, enterpriseId),
              eq(youlinManualEnrollments.employeeNumber, reservation.employeeNumber),
            ),
          )
          .limit(1);
        const [bound] = await tx
          .select({ id: youlinSubjects.id })
          .from(youlinSubjects)
          .where(eq(youlinSubjects.userId, userId))
          .limit(1);
        if (existing || bound) throw new YoulinIdentityError('ACCOUNT_UNAVAILABLE');

        const subjectId = randomUUID();
        await tx.insert(youlinSubjects).values({
          enterpriseId,
          id: subjectId,
          kind: 'user',
          status: 'pending',
          userId,
        });
        await tx.insert(youlinManualEnrollments).values({
          employeeNumber: reservation.employeeNumber,
          enterpriseId,
          subjectId,
          userId,
        });
        return {
          detail: { authEpoch: 0, needsCredentialRevocation: true },
          result: { status: 'created' as const, subjectId },
          subjectId,
        };
      },
      JSON.stringify([
        'application-account',
        'userId' in reservation ? reservation.userId : reservation.employeeNumber,
      ]),
    );
    if (result.status !== 'created') throw new YoulinIdentityError('INVALID_COMMAND_RECEIPT');
    return result;
  }

  async activate(idempotencyKey: string, input: unknown) {
    const request = manualEnrollmentAuthorityChangeSchema.parse(input);
    const { enterpriseId } = this.commands;
    const result = await this.commands.run(
      'activate_manual_enrollment',
      idempotencyKey,
      request,
      async (tx) => {
        const [subject] = await tx
          .select()
          .from(youlinSubjects)
          .where(
            and(
              eq(youlinSubjects.enterpriseId, enterpriseId),
              eq(youlinSubjects.id, request.subjectId),
            ),
          )
          .limit(1)
          .for('update');
        if (!subject || subject.kind !== 'user' || !subject.userId)
          throw new YoulinIdentityError('SUBJECT_UNAVAILABLE');
        if (
          subject.authEpoch !== request.expectedAuthEpoch ||
          subject.authorityVersion !== request.expectedAuthorityVersion
        )
          throw new YoulinIdentityError('SUBJECT_VERSION_CONFLICT');
        if (
          subject.authEpoch === Number.MAX_SAFE_INTEGER ||
          subject.authorityVersion === Number.MAX_SAFE_INTEGER
        )
          throw new YoulinIdentityError('SUBJECT_TERMINAL');
        if (subject.status !== 'pending') throw new YoulinIdentityError('ACTIVATION_NOT_PENDING');
        if (subject.idpRevocationConfirmedEpoch !== subject.authEpoch)
          throw new YoulinIdentityError('CREDENTIAL_CLEANUP_REQUIRED');

        const [enrollment] = await tx
          .select()
          .from(youlinManualEnrollments)
          .where(
            and(
              eq(youlinManualEnrollments.enterpriseId, enterpriseId),
              eq(youlinManualEnrollments.subjectId, subject.id),
              eq(youlinManualEnrollments.userId, subject.userId),
            ),
          )
          .limit(1)
          .for('update');
        if (!enrollment || enrollment.status !== 'pending')
          throw new YoulinIdentityError('MANUAL_ENROLLMENT_UNAVAILABLE');
        const [person] = await tx
          .select({ id: youlinPersons.id })
          .from(youlinPersons)
          .where(
            and(
              eq(youlinPersons.enterpriseId, enterpriseId),
              eq(youlinPersons.subjectId, subject.id),
            ),
          )
          .limit(1);
        if (person) throw new YoulinIdentityError('MIXED_ADMISSION_SOURCE');
        const bindings = await tx
          .select({ issuer: youlinIdentityBindings.issuer })
          .from(youlinIdentityBindings)
          .where(
            and(
              eq(youlinIdentityBindings.enterpriseId, enterpriseId),
              eq(youlinIdentityBindings.subjectId, subject.id),
              eq(youlinIdentityBindings.status, 'active'),
            ),
          );
        if (bindings.length !== 1 || !this.issuers.has(bindings[0].issuer))
          throw new YoulinIdentityError('TRUSTED_BINDING_REQUIRED');

        const authorityVersion = subject.authorityVersion + 1;
        const [activated] = await tx
          .update(youlinSubjects)
          .set({
            authorityVersion,
            credentialsNotBefore: sql`greatest(${youlinSubjects.credentialsNotBefore}, clock_timestamp())`,
            status: 'active',
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(youlinSubjects.id, subject.id),
              eq(youlinSubjects.enterpriseId, enterpriseId),
              eq(youlinSubjects.status, 'pending'),
              eq(youlinSubjects.authEpoch, request.expectedAuthEpoch),
              eq(youlinSubjects.authorityVersion, request.expectedAuthorityVersion),
            ),
          )
          .returning({ id: youlinSubjects.id });
        if (!activated) throw new YoulinIdentityError('SUBJECT_VERSION_CONFLICT');
        const [admitted] = await tx
          .update(youlinManualEnrollments)
          .set({ status: 'active', updatedAt: sql`clock_timestamp()` })
          .where(
            and(
              eq(youlinManualEnrollments.id, enrollment.id),
              eq(youlinManualEnrollments.status, 'pending'),
            ),
          )
          .returning({ id: youlinManualEnrollments.id });
        if (!admitted) throw new YoulinIdentityError('SUBJECT_VERSION_CONFLICT');
        return {
          detail: { authEpoch: subject.authEpoch },
          result: {
            authEpoch: subject.authEpoch,
            status: 'activated' as const,
            subjectId: subject.id,
          },
          subjectId: subject.id,
        };
      },
    );
    if (result.status !== 'activated') throw new YoulinIdentityError('INVALID_COMMAND_RECEIPT');
    return result;
  }

  async disable(idempotencyKey: string, input: unknown) {
    const request = manualEnrollmentAuthorityChangeSchema.parse(input);
    const { enterpriseId } = this.commands;
    const result = await this.commands.run(
      'disable_manual_enrollment',
      idempotencyKey,
      request,
      async (tx) => {
        const [subject] = await tx
          .select()
          .from(youlinSubjects)
          .where(
            and(
              eq(youlinSubjects.enterpriseId, enterpriseId),
              eq(youlinSubjects.id, request.subjectId),
            ),
          )
          .limit(1)
          .for('update');
        if (!subject || subject.kind !== 'user' || !subject.userId)
          throw new YoulinIdentityError('SUBJECT_UNAVAILABLE');
        if (
          subject.authEpoch !== request.expectedAuthEpoch ||
          subject.authorityVersion !== request.expectedAuthorityVersion
        )
          throw new YoulinIdentityError('SUBJECT_VERSION_CONFLICT');
        const [enrollment] = await tx
          .select()
          .from(youlinManualEnrollments)
          .where(
            and(
              eq(youlinManualEnrollments.enterpriseId, enterpriseId),
              eq(youlinManualEnrollments.subjectId, subject.id),
              eq(youlinManualEnrollments.userId, subject.userId),
            ),
          )
          .limit(1)
          .for('update');
        if (!enrollment || !['pending', 'active'].includes(enrollment.status))
          throw new YoulinIdentityError('MANUAL_ENROLLMENT_UNAVAILABLE');
        const { authEpoch } = await invalidateSubjectAuthority(tx, subject, 'disabled');
        await tx
          .update(youlinManualEnrollments)
          .set({ status: 'disabled', updatedAt: sql`clock_timestamp()` })
          .where(eq(youlinManualEnrollments.id, enrollment.id));
        return {
          detail: { authEpoch, needsCredentialRevocation: true, reason: 'administrative_disable' },
          result: { authEpoch, status: 'revoked' as const, subjectId: subject.id },
          subjectId: subject.id,
        };
      },
    );
    if (result.status !== 'revoked') throw new YoulinIdentityError('INVALID_COMMAND_RECEIPT');
    return result;
  }
}
