import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { youlinSubjects } from '../../schemas/youlinIdentity';
import { youlinIdentityCommands } from '../../schemas/youlinIdentityOperations';
import { IdentityCommandRunner } from './commandRunner';
import {
  identityCommandResultSchema,
  identityIdempotencySchema,
  YoulinIdentityError,
} from './contracts';

const intentSchema = z.union([
  z.object({ employeeNumber: z.string().max(128), userId: z.uuid() }).strict(),
  z
    .object({
      displayName: z.string().max(255).optional(),
      email: z.email(),
      employeeNumber: z.string().max(128),
    })
    .strict(),
]);
const completionSchema = z
  .object({ principalId: z.uuid(), subjectId: z.uuid(), workId: z.uuid() })
  .strict();

/** Durable single-flight through immutable start/completion command bundles, not an expiring lease.
 * A start without completion NEVER automatically takes over or repeats external side effects.
 * Crashes/unknown outcomes require explicit operator reconciliation (not implemented here).
 * This is an internal workflow gate, not authentication or proof of provider cleanup.
 */
export class YoulinManualProviderWork extends IdentityCommandRunner {
  async begin(idempotencyKey: string, input: unknown) {
    const key = identityIdempotencySchema.parse(idempotencyKey);
    const intent = intentSchema.parse(input);
    let owned = false;
    // Enterprise-scoped claim: an uncompleted start by ANY operator blocks a second claim, so two
    // administrators cannot run overlapping external side effects for the same idempotency key.
    await this.execute('identity:provision', 'read_manual_provider_start', async (tx) => {
      const [existing] = await tx
        .select({ actorId: youlinIdentityCommands.actorId })
        .from(youlinIdentityCommands)
        .where(
          and(
            eq(youlinIdentityCommands.enterpriseId, this.enterpriseId),
            eq(youlinIdentityCommands.operation, 'start_manual_provider_work'),
            eq(youlinIdentityCommands.idempotencyKey, key),
          ),
        )
        .limit(1);
      if (existing && existing.actorId !== this.actor.subjectId)
        throw new YoulinIdentityError('PROVIDER_WORK_RECONCILIATION_REQUIRED');
      return existing;
    });
    const start = await this.run('start_manual_provider_work', key, intent, async () => {
      owned = true;
      return {
        detail: { reason: 'manual_provider_work_started' },
        result: {
          employeeNumber: intent.employeeNumber,
          status: 'provider_work_started',
          workId: randomUUID(),
        },
      };
    });
    if (start.status !== 'provider_work_started')
      throw new YoulinIdentityError('INVALID_PROVIDER_WORK_STATE');
    if (owned) return { kind: 'claimed' as const, workId: start.workId };
    return this.execute('identity:provision', 'read_manual_provider_completion', async (tx) => {
      const [row] = await tx
        .select({ result: youlinIdentityCommands.result })
        .from(youlinIdentityCommands)
        .where(
          and(
            eq(youlinIdentityCommands.enterpriseId, this.enterpriseId),
            eq(youlinIdentityCommands.operation, 'complete_manual_provider_work'),
            eq(youlinIdentityCommands.idempotencyKey, key),
          ),
        )
        .limit(1);
      if (!row) throw new YoulinIdentityError('PROVIDER_WORK_RECONCILIATION_REQUIRED');
      const completed = identityCommandResultSchema.parse(row.result);
      if (completed.status !== 'provider_work_completed' || completed.workId !== start.workId)
        throw new YoulinIdentityError('INVALID_PROVIDER_WORK_STATE');
      return {
        kind: 'completed' as const,
        principalId: completed.principalId,
        subjectId: completed.subjectId,
      };
    });
  }

  async complete(idempotencyKey: string, input: unknown) {
    const parsed = completionSchema.parse(input);
    return this.run('complete_manual_provider_work', idempotencyKey, parsed, async (tx) => {
      const [start] = await tx
        .select({ result: youlinIdentityCommands.result })
        .from(youlinIdentityCommands)
        .where(
          and(
            eq(youlinIdentityCommands.enterpriseId, this.enterpriseId),
            eq(youlinIdentityCommands.actorId, this.actor.subjectId),
            eq(youlinIdentityCommands.operation, 'start_manual_provider_work'),
            eq(youlinIdentityCommands.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (start?.result.status !== 'provider_work_started' || start.result.workId !== parsed.workId)
        throw new YoulinIdentityError('INVALID_PROVIDER_WORK_OWNER');
      const [subject] = await tx
        .select()
        .from(youlinSubjects)
        .where(
          and(
            eq(youlinSubjects.id, parsed.subjectId),
            eq(youlinSubjects.enterpriseId, this.enterpriseId),
          ),
        )
        .for('share');
      if (
        !subject ||
        subject.kind !== 'user' ||
        subject.status !== 'active' ||
        subject.authEpoch !== 0 ||
        subject.authorityVersion !== 1 ||
        subject.idpRevocationConfirmedEpoch !== 0
      )
        throw new YoulinIdentityError('ACTIVATION_STATE_UNCONFIRMED');
      return {
        detail: { reason: 'manual_provider_work_completed' },
        result: { ...parsed, status: 'provider_work_completed' },
        subjectId: parsed.subjectId,
      };
    });
  }
}
