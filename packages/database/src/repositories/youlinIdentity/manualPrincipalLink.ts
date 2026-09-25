import { randomUUID } from 'node:crypto';

import { and, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { account } from '../../schemas/betterAuth';
import {
  youlinIdentityBindings,
  youlinPersons,
  youlinSubjects,
} from '../../schemas/youlinIdentity';
import { youlinManualEnrollments } from '../../schemas/youlinManualEnrollment';
import type { LobeChatDatabase } from '../../type';
import type { IdentityCommandOptions } from './commandRunner';
import { IdentityCommandRunner } from './commandRunner';
import { manualPrincipalLinkSchema, YoulinIdentityError } from './contracts';

interface ManualPrincipalLinkOptions extends IdentityCommandOptions {
  issuer: string;
}

/** Links only a freshly provisioned principal to an already pending manual reservation. */
export class YoulinIdentityManualPrincipalLink {
  private readonly commands: IdentityCommandRunner;
  private readonly issuer: string;

  constructor(db: LobeChatDatabase, options: ManualPrincipalLinkOptions) {
    this.commands = new IdentityCommandRunner(db, options);
    this.issuer = z.url().max(1024).parse(options.issuer);
  }

  async link(idempotencyKey: string, input: unknown) {
    const request = manualPrincipalLinkSchema.parse(input);
    if (request.issuer !== this.issuer) throw new YoulinIdentityError('UNTRUSTED_ISSUER');
    const { enterpriseId } = this.commands;
    const result = await this.commands.run(
      'bind_manual_principal',
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
        if (subject.status !== 'pending') throw new YoulinIdentityError('ACTIVATION_NOT_PENDING');
        if (
          subject.authEpoch !== request.expectedAuthEpoch ||
          subject.authorityVersion !== request.expectedAuthorityVersion
        )
          throw new YoulinIdentityError('SUBJECT_VERSION_CONFLICT');
        const [enrollment] = await tx
          .select({ id: youlinManualEnrollments.id })
          .from(youlinManualEnrollments)
          .where(
            and(
              eq(youlinManualEnrollments.enterpriseId, enterpriseId),
              eq(youlinManualEnrollments.subjectId, subject.id),
              eq(youlinManualEnrollments.userId, subject.userId),
              eq(youlinManualEnrollments.status, 'pending'),
            ),
          )
          .limit(1);
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
        if (!enrollment || person) throw new YoulinIdentityError('MIXED_ADMISSION_SOURCE');

        const [binding] = await tx
          .select()
          .from(youlinIdentityBindings)
          .where(
            and(
              eq(youlinIdentityBindings.issuer, request.issuer),
              eq(youlinIdentityBindings.externalSubject, request.externalSubject),
            ),
          )
          .limit(1);
        // The legacy accounts table has no provider/account uniqueness constraint. This rare
        // control-plane write must serialize all account inserts so a concurrent auth callback
        // cannot pass the collision check and create a second owner before commit.
        await tx.execute(sql`LOCK TABLE ${account} IN SHARE ROW EXCLUSIVE MODE`);
        const providerAccounts = await tx
          .select()
          .from(account)
          .where(
            and(
              eq(account.providerId, 'keycloak'),
              or(
                eq(account.accountId, request.externalSubject),
                eq(account.userId, subject.userId),
              ),
            ),
          )
          .for('update');
        const principalAccount = providerAccounts.find(
          (candidate) => candidate.accountId === request.externalSubject,
        );
        const userAccount = providerAccounts.find(
          (candidate) => candidate.userId === subject.userId,
        );
        if (binding || principalAccount || userAccount) {
          if (
            binding?.subjectId === subject.id &&
            binding.status === 'active' &&
            providerAccounts.length === 1 &&
            principalAccount?.userId === subject.userId &&
            userAccount?.accountId === request.externalSubject
          )
            return {
              detail: { bindingId: binding.id },
              result: { bindingId: binding.id, status: 'linked' as const, subjectId: subject.id },
              subjectId: subject.id,
            };
          throw new YoulinIdentityError('PRINCIPAL_OR_ACCOUNT_IN_USE');
        }

        const bindingId = randomUUID();
        await tx.insert(youlinIdentityBindings).values({
          enterpriseId,
          externalSubject: request.externalSubject,
          id: bindingId,
          issuer: request.issuer,
          subjectId: subject.id,
        });
        await tx.insert(account).values({
          accountId: request.externalSubject,
          id: randomUUID(),
          providerId: 'keycloak',
          updatedAt: new Date(),
          userId: subject.userId,
        });
        return {
          detail: { bindingId },
          result: { bindingId, status: 'linked' as const, subjectId: subject.id },
          subjectId: subject.id,
        };
      },
      JSON.stringify([request.issuer, request.externalSubject]),
    );
    if (result.status !== 'linked') throw new YoulinIdentityError('INVALID_COMMAND_RECEIPT');
    return result;
  }
}
