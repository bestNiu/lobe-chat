import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { users } from '../../schemas/user';
import { youlinPersons, youlinSubjects } from '../../schemas/youlinIdentity';
import type { LobeChatDatabase } from '../../type';
import type { IdentityCommandOptions } from './commandRunner';
import { IdentityCommandRunner } from './commandRunner';
import { registerPersonSchema, YoulinIdentityError } from './contracts';

/** HR-anchored provisioning only. Does not bind an IdP principal, activate or grant permissions. */
export class YoulinIdentityRegistration {
  private readonly commands: IdentityCommandRunner;

  constructor(db: LobeChatDatabase, options: IdentityCommandOptions) {
    this.commands = new IdentityCommandRunner(db, options);
  }

  async registerPerson(idempotencyKey: string, input: unknown) {
    const person = registerPersonSchema.parse(input);
    const { enterpriseId } = this.commands;
    return this.commands.run(
      'register_person',
      idempotencyKey,
      person,
      async (tx) => {
        const [existing] = await tx
          .select({ subjectId: youlinPersons.subjectId, userId: youlinSubjects.userId })
          .from(youlinPersons)
          .innerJoin(youlinSubjects, eq(youlinPersons.subjectId, youlinSubjects.id))
          .where(
            and(
              eq(youlinPersons.enterpriseId, enterpriseId),
              eq(youlinPersons.source, 'xinrenxinshi'),
              eq(youlinPersons.personKey, person.personKey),
            ),
          )
          .limit(1);
        if (existing) {
          if (existing.userId !== person.userId)
            throw new YoulinIdentityError('HR_ANCHOR_CONFLICT');
          return {
            detail: {},
            result: { status: 'created', subjectId: existing.subjectId },
            subjectId: existing.subjectId,
          };
        }
        const [account] = await tx
          .select({ id: users.id, banned: users.banned })
          .from(users)
          .where(eq(users.id, person.userId))
          .limit(1)
          .for('share');
        if (!account || account.banned === true)
          throw new YoulinIdentityError('ACCOUNT_UNAVAILABLE');
        const [bound] = await tx
          .select({ id: youlinSubjects.id })
          .from(youlinSubjects)
          .where(eq(youlinSubjects.userId, person.userId))
          .limit(1);
        // Do not disclose the enterprise or person owning an unavailable account.
        if (bound) throw new YoulinIdentityError('ACCOUNT_UNAVAILABLE');
        const subjectId = randomUUID();
        await tx.insert(youlinSubjects).values({
          enterpriseId,
          id: subjectId,
          kind: 'user',
          status: 'pending',
          userId: person.userId,
        });
        await tx
          .insert(youlinPersons)
          .values({ enterpriseId, personKey: person.personKey, source: 'xinrenxinshi', subjectId });
        return { detail: {}, result: { status: 'created', subjectId }, subjectId };
      },
      JSON.stringify(['application-account', person.userId]),
    );
  }
}
