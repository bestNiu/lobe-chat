import { and, eq } from 'drizzle-orm';

import { youlinSubjects } from '../../schemas/youlinIdentity';
import type { LobeChatDatabase } from '../../type';
import type { IdentityCommandOptions } from './commandRunner';
import { IdentityCommandRunner } from './commandRunner';
import { revokeSubjectSchema, YoulinIdentityError } from './contracts';
import { invalidateSubjectAuthority } from './lifecycle';

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
      const { authEpoch } = await invalidateSubjectAuthority(tx, subject, 'disabled');
      return {
        detail: { authEpoch, needsCredentialRevocation: true, reason: request.reason },
        result: { authEpoch, status: 'revoked', subjectId: subject.id },
        subjectId: subject.id,
      };
    });
  }
}
