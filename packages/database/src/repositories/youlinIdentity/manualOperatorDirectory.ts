import { and, asc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';

import { users } from '../../schemas/user';
import { youlinSubjects as subjects } from '../../schemas/youlinIdentity';
import { youlinManualEnrollments as enrollments } from '../../schemas/youlinManualEnrollment';
import type { LobeChatDatabase } from '../../type';
import { IdentityAuthorityTransaction } from './authorityTransaction';
import { YoulinIdentityError } from './contracts';

const filterSchema = z.object({
  cursor: z.uuid().optional(),
  employeeNumber: z.string().min(1).max(128).optional(),
  userId: z.string().min(1).max(255).optional(),
});

/** Read-only projection of manually enrolled accounts. No credentials or external principal IDs. */
export class YoulinManualOperatorDirectory extends IdentityAuthorityTransaction {
  constructor(
    db: LobeChatDatabase,
    options: { actor: { authEpoch: number; subjectId: string }; enterpriseId: string },
  ) {
    super(db, { ...options, enabled: true, lockTimeoutMs: 1500, sqlTimeoutMs: 5000 });
  }

  /** A read grant does not imply the right to create or disable an account. */
  canProvision = () =>
    this.execute('identity:provision', 'manual-directory.capability', async () => true);

  list = (filter: { cursor?: string; employeeNumber?: string; userId?: string }) => {
    const parsed = filterSchema.safeParse(filter);
    if (!parsed.success) throw new YoulinIdentityError('INVALID_DIRECTORY_FILTER');
    return this.execute('identity:read', 'manual-directory.read', async (tx) => {
      const { cursor, employeeNumber, userId } = parsed.data;
      const rows = await tx
        .select({
          authEpoch: subjects.authEpoch,
          authorityVersion: subjects.authorityVersion,
          displayName: users.fullName,
          email: users.email,
          employeeNumber: enrollments.employeeNumber,
          status: subjects.status,
          subjectId: subjects.id,
          userId: enrollments.userId,
        })
        .from(enrollments)
        .innerJoin(
          subjects,
          and(
            eq(subjects.enterpriseId, enrollments.enterpriseId),
            eq(subjects.id, enrollments.subjectId),
            eq(subjects.kind, 'user'),
          ),
        )
        .innerJoin(users, eq(users.id, enrollments.userId))
        .where(
          and(
            eq(enrollments.enterpriseId, this.enterpriseId),
            cursor ? gt(subjects.id, cursor) : undefined,
            employeeNumber ? eq(enrollments.employeeNumber, employeeNumber) : undefined,
            userId ? eq(enrollments.userId, userId) : undefined,
          ),
        )
        .orderBy(asc(subjects.id))
        .limit(51);
      return {
        items: rows.slice(0, 50),
        nextCursor: rows.length > 50 ? rows[49].subjectId : null,
      };
    });
  };
}
