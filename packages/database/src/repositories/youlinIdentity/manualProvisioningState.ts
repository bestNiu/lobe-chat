import type { YoulinManualProvisioningState } from '@lobechat/types';
import { and, eq, is, isNull, sql } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { account } from '../../schemas/betterAuth';
import {
  youlinIdentityBindings as bindings,
  youlinPersons as persons,
  youlinSubjects as subjects,
} from '../../schemas/youlinIdentity';
import { youlinManualEnrollments as enrollments } from '../../schemas/youlinManualEnrollment';
import type { LobeChatDatabase } from '../../type';
import { identityEnterpriseSchema, YoulinIdentityError } from './contracts';

/** Internal orchestration projection only. Public callers still need actor/resource authorization. */
export class YoulinManualProvisioningStateReader {
  private readonly enterpriseId: string;

  constructor(
    private readonly db: LobeChatDatabase,
    enterpriseId: string,
  ) {
    if (is(db, PgTransaction)) throw new YoulinIdentityError('BORROWED_TRANSACTION_REJECTED');
    this.enterpriseId = identityEnterpriseSchema.parse(enterpriseId);
  }

  async read(subjectIdInput: string): Promise<YoulinManualProvisioningState | null> {
    const subjectId = z.uuid().parse(subjectIdInput);
    return this.db.transaction(
      async (tx) => {
        await tx.execute(
          sql`SELECT pg_catalog.set_config('statement_timeout', '1500', true), pg_catalog.set_config('search_path', 'pg_catalog, public, pg_temp', true)`,
        );
        const [environment] = await tx
          .select({ recovering: sql<boolean>`pg_catalog.pg_is_in_recovery()` })
          .from(sql`(SELECT 1) AS state_environment`);
        if (environment?.recovering !== false)
          throw new YoulinIdentityError('AUTHORITATIVE_DATABASE_REQUIRED');
        const [row] = await tx
          .select({
            subjectId: subjects.id,
            status: subjects.status,
            authEpoch: subjects.authEpoch,
            authorityVersion: subjects.authorityVersion,
            idpRevocationConfirmedEpoch: subjects.idpRevocationConfirmedEpoch,
            issuer: bindings.issuer,
            externalSubject: bindings.externalSubject,
            activeBindingCount: sql<number>`(SELECT count(*)::integer FROM ${bindings} b WHERE b.subject_id = ${subjects.id} AND b.enterprise_id = ${subjects.enterpriseId} AND b.status = 'active')`,
            nativeAccountMatches: sql<boolean>`(SELECT count(*) = 1 FROM ${account} a WHERE a.user_id = ${subjects.userId} AND a.provider_id = 'keycloak' AND a.account_id = ${bindings.externalSubject})`,
          })
          .from(subjects)
          .innerJoin(
            enrollments,
            and(
              eq(enrollments.subjectId, subjects.id),
              eq(enrollments.enterpriseId, subjects.enterpriseId),
              eq(enrollments.userId, subjects.userId),
            ),
          )
          .innerJoin(
            bindings,
            and(
              eq(bindings.subjectId, subjects.id),
              eq(bindings.enterpriseId, subjects.enterpriseId),
              eq(bindings.status, 'active'),
            ),
          )
          .leftJoin(
            persons,
            and(
              eq(persons.subjectId, subjects.id),
              eq(persons.enterpriseId, subjects.enterpriseId),
            ),
          )
          .where(
            and(
              eq(subjects.id, subjectId),
              eq(subjects.enterpriseId, this.enterpriseId),
              eq(subjects.kind, 'user'),
              eq(enrollments.status, subjects.status),
              isNull(persons.id),
            ),
          )
          .limit(1);
        if (!row) return null;
        if (!['active', 'pending', 'disabled'].includes(row.status))
          throw new YoulinIdentityError('INVALID_AUTHORITY_STATE');
        return row;
      },
      { accessMode: 'read only', isolationLevel: 'read committed' },
    );
  }
}
