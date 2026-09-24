import { createHash, randomUUID } from 'node:crypto';

import type { YoulinBindingConflictReason, YoulinEmploymentSnapshot } from '@lobechat/types';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import {
  youlinEmploymentStages,
  youlinPersons,
  youlinSubjects,
} from '../../schemas/youlinIdentity';
import { youlinBindingCases } from '../../schemas/youlinIdentityGovernance';
import type { LobeChatDatabase, Transaction } from '../../type';
import type { IdentityCommandOptions } from './commandRunner';
import { IdentityCommandRunner } from './commandRunner';
import { employmentSnapshotSchema, YoulinIdentityError } from './contracts';
import { invalidateSubjectAuthority } from './lifecycle';

interface ConflictContext {
  fingerprint: string;
  person: typeof youlinPersons.$inferSelect;
  reason: YoulinBindingConflictReason;
  snapshot: YoulinEmploymentSnapshot;
  subject: typeof youlinSubjects.$inferSelect;
}

/** Accepts a complete normalized snapshot from the authenticated HR service, not HR API wire data.
 * Source versions must be genuine ordered revisions, never a local fetch timestamp invented to
 * hide provider ordering gaps. No snapshot grants access or clears an existing disabled state.
 */
export class YoulinIdentityEmployment {
  private readonly commands: IdentityCommandRunner;

  constructor(db: LobeChatDatabase, options: IdentityCommandOptions) {
    this.commands = new IdentityCommandRunner(db, options);
  }

  async applySnapshot(idempotencyKey: string, input: unknown) {
    const parsed = employmentSnapshotSchema.parse(input);
    const snapshot = {
      ...parsed,
      stages: parsed.stages
        .map((stage) => ({
          ...stage,
          effectiveFrom: stage.effectiveFrom
            ? new Date(stage.effectiveFrom).toISOString()
            : undefined,
          effectiveTo: stage.effectiveTo ? new Date(stage.effectiveTo).toISOString() : undefined,
        }))
        .sort((a, b) =>
          a.sourceStageKey < b.sourceStageKey ? -1 : a.sourceStageKey > b.sourceStageKey ? 1 : 0,
        ),
    };
    // Metadata-only revision changes do not invalidate an otherwise unchanged security snapshot.
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ personKey: snapshot.personKey, stages: snapshot.stages }))
      .digest('hex');
    const { enterpriseId } = this.commands;
    return this.commands.run('update_employment', idempotencyKey, snapshot, async (tx) => {
      const [person] = await tx
        .select()
        .from(youlinPersons)
        .where(
          and(
            eq(youlinPersons.enterpriseId, enterpriseId),
            eq(youlinPersons.source, 'xinrenxinshi'),
            eq(youlinPersons.personKey, snapshot.personKey),
          ),
        )
        .limit(1)
        .for('update');
      if (!person) throw new YoulinIdentityError('PERSON_UNAVAILABLE');
      const [subject] = await tx
        .select()
        .from(youlinSubjects)
        .where(
          and(
            eq(youlinSubjects.enterpriseId, enterpriseId),
            eq(youlinSubjects.id, person.subjectId),
          ),
        )
        .limit(1)
        .for('update');
      if (!subject || subject.kind !== 'user') throw new YoulinIdentityError('SUBJECT_UNAVAILABLE');
      if (snapshot.sourceVersion < person.sourceVersion)
        throw new YoulinIdentityError('STALE_SOURCE_VERSION');
      if (snapshot.sourceVersion === person.sourceVersion && person.snapshotHash !== null) {
        if (person.requiresReconciliation) {
          const [pending] = await tx
            .select({ id: youlinBindingCases.id })
            .from(youlinBindingCases)
            .where(
              and(
                eq(youlinBindingCases.enterpriseId, enterpriseId),
                eq(youlinBindingCases.subjectId, subject.id),
                eq(youlinBindingCases.status, 'pending'),
                eq(youlinBindingCases.subjectVersion, subject.authorityVersion),
                inArray(youlinBindingCases.reason, [
                  'parallel_employment',
                  'employee_key_in_use',
                  'source_version_conflict',
                  'employment_history_mismatch',
                ]),
              ),
            )
            .limit(1);
          if (!pending) throw new YoulinIdentityError('SOURCE_RECONCILIATION_REQUIRED');
          return {
            detail: { caseId: pending.id },
            result: { caseId: pending.id, status: 'conflict' },
            subjectId: subject.id,
          };
        }
        if (fingerprint !== person.snapshotHash)
          return this.quarantine(tx, {
            fingerprint,
            person,
            reason: 'source_version_conflict',
            snapshot,
            subject,
          });
      }
      if (fingerprint === person.snapshotHash && !person.requiresReconciliation) {
        await tx
          .update(youlinPersons)
          .set({ sourceVersion: snapshot.sourceVersion, updatedAt: sql`clock_timestamp()` })
          .where(eq(youlinPersons.id, person.id));
        return {
          detail: { sourceVersion: snapshot.sourceVersion },
          result: {
            authEpoch: subject.authEpoch,
            status: 'employment_updated',
            subjectId: subject.id,
          },
          subjectId: subject.id,
        };
      }
      const active = snapshot.stages.filter((stage) => stage.status === 'active');
      if (active.length > 1)
        return this.quarantine(tx, {
          fingerprint,
          person,
          reason: 'parallel_employment',
          snapshot,
          subject,
        });
      const previous = await tx
        .select()
        .from(youlinEmploymentStages)
        .where(
          and(
            eq(youlinEmploymentStages.enterpriseId, enterpriseId),
            eq(youlinEmploymentStages.personId, person.id),
          ),
        );
      for (const stage of snapshot.stages) {
        const old = previous.find((candidate) => candidate.sourceStageKey === stage.sourceStageKey);
        // Rehire/transfer use distinct stages. Do not rewrite the employee/legal-entity anchor
        // or resurrect an ended stage under the guise of a complete snapshot.
        if (
          old &&
          (old.employeeNumber !== stage.employeeNumber ||
            old.legalEntityCode !== stage.legalEntityCode ||
            (old.status === 'ended' && stage.status === 'active'))
        )
          return this.quarantine(tx, {
            fingerprint,
            person,
            reason: 'employment_history_mismatch',
            snapshot,
            subject,
          });
      }
      if (active[0]) {
        const [collision] = await tx
          .select({ id: youlinEmploymentStages.id })
          .from(youlinEmploymentStages)
          .where(
            and(
              eq(youlinEmploymentStages.enterpriseId, enterpriseId),
              eq(youlinEmploymentStages.legalEntityCode, active[0].legalEntityCode),
              eq(youlinEmploymentStages.employeeNumber, active[0].employeeNumber),
              eq(youlinEmploymentStages.status, 'active'),
              ne(youlinEmploymentStages.personId, person.id),
            ),
          )
          .limit(1);
        if (collision)
          return this.quarantine(tx, {
            fingerprint,
            person,
            reason: 'employee_key_in_use',
            snapshot,
            subject,
          });
      }
      // Omitted stages end but remain as history. Replace current projections atomically so a
      // legitimate stage transition can reuse this person's employee number without a transient collision.
      await tx
        .update(youlinEmploymentStages)
        .set({ status: 'ended', updatedAt: sql`clock_timestamp()` })
        .where(
          and(
            eq(youlinEmploymentStages.enterpriseId, enterpriseId),
            eq(youlinEmploymentStages.personId, person.id),
          ),
        );
      const stages = snapshot.stages.map((stage) => ({
        effectiveFrom: stage.effectiveFrom ? new Date(stage.effectiveFrom) : null,
        effectiveTo: stage.effectiveTo ? new Date(stage.effectiveTo) : null,
        employeeNumber: stage.employeeNumber,
        enterpriseId,
        legalEntityCode: stage.legalEntityCode,
        personId: person.id,
        sourceStageKey: stage.sourceStageKey,
        status: stage.status,
        updatedAt: sql`clock_timestamp()`,
      }));
      if (stages.length)
        await tx
          .insert(youlinEmploymentStages)
          .values(stages)
          .onConflictDoUpdate({
            target: [youlinEmploymentStages.personId, youlinEmploymentStages.sourceStageKey],
            set: {
              effectiveFrom: sql`excluded.effective_from`,
              effectiveTo: sql`excluded.effective_to`,
              employeeNumber: sql`excluded.employee_number`,
              legalEntityCode: sql`excluded.legal_entity_code`,
              status: sql`excluded.status`,
              updatedAt: sql`clock_timestamp()`,
            },
          });
      await tx
        .update(youlinPersons)
        .set({
          requiresReconciliation: false,
          snapshotHash: fingerprint,
          sourceVersion: snapshot.sourceVersion,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(eq(youlinPersons.id, person.id));
      const nextStatus =
        subject.status === 'disabled' || active.length === 0 ? 'disabled' : 'pending';
      const { authEpoch } = await invalidateSubjectAuthority(tx, subject, nextStatus);
      return {
        detail: {
          authEpoch,
          needsCredentialRevocation: true,
          sourceVersion: snapshot.sourceVersion,
        },
        result: { authEpoch, status: 'employment_updated', subjectId: subject.id },
        subjectId: subject.id,
      };
    });
  }

  private async quarantine(tx: Transaction, context: ConflictContext) {
    const { fingerprint, person, reason, snapshot, subject } = context;
    const version = await invalidateSubjectAuthority(
      tx,
      subject,
      subject.status === 'disabled' ? 'disabled' : 'pending',
    );
    await tx
      .update(youlinPersons)
      .set({
        requiresReconciliation: true,
        snapshotHash:
          snapshot.sourceVersion > person.sourceVersion || person.snapshotHash === null
            ? fingerprint
            : person.snapshotHash,
        sourceVersion: snapshot.sourceVersion,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(eq(youlinPersons.id, person.id));
    const caseId = randomUUID();
    await tx.insert(youlinBindingCases).values({
      candidateHash: fingerprint,
      enterpriseId: this.commands.enterpriseId,
      id: caseId,
      personKey: person.personKey,
      reason,
      subjectId: subject.id,
      subjectVersion: version.authorityVersion,
      submitterId: this.commands.actor.subjectId,
    });
    return {
      detail: {
        authEpoch: version.authEpoch,
        caseId,
        needsCredentialRevocation: true,
        reason,
        sourceVersion: snapshot.sourceVersion,
      },
      result: { caseId, status: 'conflict' as const },
      subjectId: subject.id,
    };
  }
}
