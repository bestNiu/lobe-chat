import { and, eq, sql } from 'drizzle-orm';

import { youlinSubjects } from '../../schemas/youlinIdentity';
import { youlinIdentityAuditEvents } from '../../schemas/youlinIdentityOperations';
import type { LobeChatDatabase } from '../../type';
import type { IdentityCommandOptions } from './commandRunner';
import { IdentityCommandRunner } from './commandRunner';
import { credentialCleanupSchema, YoulinIdentityError } from './contracts';

/** Private attestation sink, NOT an IdP client or verifier of external side effects.
 * Only a server-authenticated, narrowly granted cleanup adapter may call this, AFTER verifying
 * cleanup of ALL provider credentials affected by this event/epoch, outside the DB transaction.
 * A queue ACK, HTTP request body, or timed-out/ambiguous provider result is not such evidence.
 * No public route is registered. Replay is a historical receipt, never current eligibility.
 */
export class YoulinIdentityCredentialCleanup {
  private readonly commands: IdentityCommandRunner;

  constructor(db: LobeChatDatabase, options: IdentityCommandOptions) {
    this.commands = new IdentityCommandRunner(db, options);
  }

  async recordCompletion(idempotencyKey: string, input: unknown) {
    const request = credentialCleanupSchema.parse(input);
    const { enterpriseId } = this.commands;
    return this.commands.run('record_credential_cleanup', idempotencyKey, request, async (tx) => {
      const [event] = await tx
        .select()
        .from(youlinIdentityAuditEvents)
        .where(
          and(
            eq(youlinIdentityAuditEvents.enterpriseId, enterpriseId),
            eq(youlinIdentityAuditEvents.id, request.revocationEventId),
          ),
        )
        .limit(1);
      if (
        !event ||
        !event.subjectId ||
        event.detail.needsCredentialRevocation !== true ||
        event.detail.authEpoch !== request.expectedAuthEpoch
      )
        throw new YoulinIdentityError('REVOCATION_EVENT_UNAVAILABLE');
      const [subject] = await tx
        .select()
        .from(youlinSubjects)
        .where(
          and(
            eq(youlinSubjects.enterpriseId, enterpriseId),
            eq(youlinSubjects.id, event.subjectId),
          ),
        )
        .limit(1)
        .for('update');
      if (!subject) throw new YoulinIdentityError('SUBJECT_UNAVAILABLE');
      if (subject.authEpoch !== request.expectedAuthEpoch)
        throw new YoulinIdentityError('EPOCH_CONFLICT');
      // Saturated versions cannot distinguish repeated invalidations. Never certify them.
      if (
        subject.authEpoch === Number.MAX_SAFE_INTEGER ||
        subject.authorityVersion === Number.MAX_SAFE_INTEGER
      )
        throw new YoulinIdentityError('SUBJECT_TERMINAL');
      if (subject.status !== 'pending' && subject.status !== 'disabled')
        throw new YoulinIdentityError('SUBJECT_NOT_DENIED');
      await tx
        .update(youlinSubjects)
        .set({
          idpRevocationConfirmedEpoch: subject.authEpoch,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(
          and(eq(youlinSubjects.id, subject.id), eq(youlinSubjects.enterpriseId, enterpriseId)),
        );
      return {
        detail: { authEpoch: subject.authEpoch, sourceEventId: event.id },
        result: { authEpoch: subject.authEpoch, status: 'cleanup_recorded', subjectId: subject.id },
        subjectId: subject.id,
      };
    });
  }
}
