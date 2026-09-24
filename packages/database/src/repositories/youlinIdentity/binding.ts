import { createHash, randomUUID } from 'node:crypto';

import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  youlinEmploymentStages,
  youlinIdentityBindings,
  youlinPersons,
  youlinSubjects,
} from '../../schemas/youlinIdentity';
import { youlinBindingCases } from '../../schemas/youlinIdentityGovernance';
import type { LobeChatDatabase } from '../../type';
import type { IdentityCommandOptions } from './commandRunner';
import { IdentityCommandRunner } from './commandRunner';
import { bindingProposalSchema, YoulinIdentityError } from './contracts';
import { invalidateSubjectAuthority } from './lifecycle';

interface IdentityBindingOptions extends IdentityCommandOptions {
  allowedIssuers: readonly string[];
}

/** Internal verified-provider/HR binding use case, not a JWT verifier or public request adapter.
 * Trusted services may introduce a new principal. Human proposals and existing reservations go
 * to review; this class cannot approve them, move another owner's binding or activate a user.
 */
export class YoulinIdentityBinding {
  private readonly commands: IdentityCommandRunner;
  private readonly issuers: ReadonlySet<string>;

  constructor(db: LobeChatDatabase, options: IdentityBindingOptions) {
    this.commands = new IdentityCommandRunner(db, options);
    this.issuers = new Set(
      z
        .array(bindingProposalSchema.shape.issuer)
        .min(1)
        .max(16)
        .parse([...options.allowedIssuers]),
    );
  }

  async propose(idempotencyKey: string, input: unknown) {
    const proposal = bindingProposalSchema.parse(input);
    if (!this.issuers.has(proposal.issuer)) throw new YoulinIdentityError('UNTRUSTED_ISSUER');
    const { enterpriseId } = this.commands;
    return this.commands.run(
      'bind_principal',
      idempotencyKey,
      proposal,
      async (tx) => {
        const [subject] = await tx
          .select()
          .from(youlinSubjects)
          .where(
            and(
              eq(youlinSubjects.id, proposal.subjectId),
              eq(youlinSubjects.enterpriseId, enterpriseId),
            ),
          )
          .limit(1)
          .for('update');
        if (!subject || subject.kind !== 'user')
          throw new YoulinIdentityError('SUBJECT_UNAVAILABLE');
        if (
          subject.authEpoch === Number.MAX_SAFE_INTEGER ||
          subject.authorityVersion === Number.MAX_SAFE_INTEGER
        )
          throw new YoulinIdentityError('SUBJECT_TERMINAL');
        if (subject.status === 'disabled')
          throw new YoulinIdentityError('REACTIVATION_REVIEW_REQUIRED');
        const [person] = await tx
          .select()
          .from(youlinPersons)
          .where(
            and(
              eq(youlinPersons.enterpriseId, enterpriseId),
              eq(youlinPersons.subjectId, subject.id),
              eq(youlinPersons.source, 'xinrenxinshi'),
            ),
          )
          .limit(1);
        if (!person || person.personKey !== proposal.personKey)
          throw new YoulinIdentityError('HR_ANCHOR_MISMATCH');
        if (person.requiresReconciliation) throw new YoulinIdentityError('HR_NOT_RECONCILED');
        const stages = await tx
          .select()
          .from(youlinEmploymentStages)
          .where(
            and(
              eq(youlinEmploymentStages.enterpriseId, enterpriseId),
              eq(youlinEmploymentStages.personId, person.id),
              eq(youlinEmploymentStages.status, 'active'),
              or(
                isNull(youlinEmploymentStages.effectiveFrom),
                lte(youlinEmploymentStages.effectiveFrom, sql`clock_timestamp()`),
              ),
              or(
                isNull(youlinEmploymentStages.effectiveTo),
                gt(youlinEmploymentStages.effectiveTo, sql`clock_timestamp()`),
              ),
            ),
          )
          .limit(2);
        if (stages.length !== 1 || stages[0].legalEntityCode !== proposal.legalEntityCode)
          throw new YoulinIdentityError('HR_ANCHOR_MISMATCH');
        const [existing] = await tx
          .select()
          .from(youlinIdentityBindings)
          .where(
            and(
              eq(youlinIdentityBindings.issuer, proposal.issuer),
              eq(youlinIdentityBindings.externalSubject, proposal.externalSubject),
            ),
          )
          .limit(1);
        const [actor] = await tx
          .select({ kind: youlinSubjects.kind })
          .from(youlinSubjects)
          .where(eq(youlinSubjects.id, this.commands.actor.subjectId))
          .limit(1);
        if (
          actor.kind === 'service' &&
          existing?.subjectId === subject.id &&
          existing.status === 'active'
        )
          return {
            detail: { bindingId: existing.id },
            result: { bindingId: existing.id, status: 'linked', subjectId: subject.id },
            subjectId: subject.id,
          };
        if (existing || actor.kind !== 'service') {
          const caseId = randomUUID();
          const reason = existing ? 'principal_in_use' : 'manual_binding_request';
          await tx.insert(youlinBindingCases).values({
            candidateHash: createHash('sha256').update(JSON.stringify(proposal)).digest('hex'),
            enterpriseId,
            externalSubject: proposal.externalSubject,
            id: caseId,
            issuer: proposal.issuer,
            personKey: person.personKey,
            reason,
            subjectId: subject.id,
            subjectVersion: subject.authorityVersion,
            submitterId: this.commands.actor.subjectId,
          });
          // No previous-owner identifier, tenant or profile is disclosed in the candidate or result.
          return {
            detail: { caseId, reason },
            result: { caseId, status: actor.kind === 'service' ? 'conflict' : 'review_required' },
            subjectId: subject.id,
          };
        }
        const bindingId = randomUUID();
        await tx.insert(youlinIdentityBindings).values({
          enterpriseId,
          externalSubject: proposal.externalSubject,
          id: bindingId,
          issuer: proposal.issuer,
          subjectId: subject.id,
        });
        const { authEpoch } = await invalidateSubjectAuthority(tx, subject, 'pending');
        return {
          detail: { authEpoch, bindingId, needsCredentialRevocation: true },
          result: { bindingId, status: 'linked', subjectId: subject.id },
          subjectId: subject.id,
        };
      },
      JSON.stringify([proposal.issuer, proposal.externalSubject]),
    );
  }
}
