import { and, eq, sql } from 'drizzle-orm';

import { youlinSubjects } from '../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../schemas/youlinIdentityGovernance';
import type { LobeChatDatabase } from '../../type';
import type { IdentityCommandOptions } from './commandRunner';
import { IdentityCommandRunner } from './commandRunner';
import { revokeSubjectSchema, YoulinIdentityError } from './contracts';

/** Persist denial before any asynchronous provider work. Does not claim IdP/session cleanup. */
export class YoulinIdentityRevocation {
  private readonly commands: IdentityCommandRunner;

  constructor(db: LobeChatDatabase, options: IdentityCommandOptions) {
    this.commands = new IdentityCommandRunner(db, options);
  }

  async revokeSubject(idempotencyKey: string, input: unknown) {
    const request = revokeSubjectSchema.parse(input);
    const { enterpriseId } = this.commands;
    return this.commands.run('revoke_subject', idempotencyKey, request, async (tx) => {
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
      if (!subject) throw new YoulinIdentityError('SUBJECT_UNAVAILABLE');
      if (subject.authEpoch !== request.expectedAuthEpoch)
        throw new YoulinIdentityError('EPOCH_CONFLICT');
      // Exhaustion must not prevent an emergency denial. MAX is a terminal epoch: activation
      // must reject it, never wrap/reset it. This path still deletes grants and clears IdP proof.
      const authEpoch =
        subject.authEpoch === Number.MAX_SAFE_INTEGER ? subject.authEpoch : subject.authEpoch + 1;
      const authorityVersion =
        subject.authorityVersion === Number.MAX_SAFE_INTEGER
          ? subject.authorityVersion
          : subject.authorityVersion + 1;
      await tx
        .update(youlinSubjects)
        .set({
          authEpoch,
          authorityVersion,
          credentialsNotBefore: sql`greatest(${youlinSubjects.credentialsNotBefore}, date_trunc('second', clock_timestamp()) + interval '1 second')`,
          idpRevocationConfirmedEpoch: null,
          status: 'disabled',
          updatedAt: sql`clock_timestamp()`,
        })
        .where(eq(youlinSubjects.id, subject.id));
      await tx
        .delete(youlinIdentityGrants)
        .where(
          and(
            eq(youlinIdentityGrants.enterpriseId, enterpriseId),
            eq(youlinIdentityGrants.subjectId, subject.id),
          ),
        );
      return {
        detail: { authEpoch, needsCredentialRevocation: true, reason: request.reason },
        result: { authEpoch, status: 'revoked', subjectId: subject.id },
        subjectId: subject.id,
      };
    });
  }
}
