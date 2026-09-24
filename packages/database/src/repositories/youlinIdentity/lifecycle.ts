import { and, eq, sql } from 'drizzle-orm';

import { youlinSubjects } from '../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../schemas/youlinIdentityGovernance';
import type { Transaction } from '../../type';
import { YoulinIdentityError } from './contracts';

type Subject = typeof youlinSubjects.$inferSelect;

/** Used only inside an authorized command with its target row locked. The caller appends the
 * audit/receipt/outbox bundle in the SAME transaction. No provider IO or implicit reactivation.
 */
export const invalidateSubjectAuthority = async (
  tx: Transaction,
  subject: Subject,
  nextStatus: 'disabled' | 'pending',
) => {
  const authEpoch =
    subject.authEpoch === Number.MAX_SAFE_INTEGER ? subject.authEpoch : subject.authEpoch + 1;
  const authorityVersion =
    subject.authorityVersion === Number.MAX_SAFE_INTEGER
      ? subject.authorityVersion
      : subject.authorityVersion + 1;
  const status =
    authEpoch === Number.MAX_SAFE_INTEGER || authorityVersion === Number.MAX_SAFE_INTEGER
      ? 'disabled'
      : nextStatus;
  const [updated] = await tx
    .update(youlinSubjects)
    .set({
      authEpoch,
      authorityVersion,
      credentialsNotBefore: sql`greatest(${youlinSubjects.credentialsNotBefore}, date_trunc('second', clock_timestamp()) + interval '1 second')`,
      idpRevocationConfirmedEpoch: null,
      status,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(youlinSubjects.id, subject.id),
        eq(youlinSubjects.enterpriseId, subject.enterpriseId),
        eq(youlinSubjects.authEpoch, subject.authEpoch),
        eq(youlinSubjects.authorityVersion, subject.authorityVersion),
      ),
    )
    .returning({
      authEpoch: youlinSubjects.authEpoch,
      authorityVersion: youlinSubjects.authorityVersion,
      status: youlinSubjects.status,
    });
  if (!updated) throw new YoulinIdentityError('SUBJECT_VERSION_CONFLICT');
  await tx
    .delete(youlinIdentityGrants)
    .where(
      and(
        eq(youlinIdentityGrants.enterpriseId, subject.enterpriseId),
        eq(youlinIdentityGrants.subjectId, subject.id),
      ),
    );
  return updated;
};
