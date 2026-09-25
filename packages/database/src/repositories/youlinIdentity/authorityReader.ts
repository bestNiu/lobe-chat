import type { YoulinUserAuthority } from '@lobechat/types';
import { toRecord } from '@lobechat/utils/object';
import { and, eq, is, sql } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { z } from 'zod';

import { users } from '../../schemas/user';
import {
  youlinEmploymentStages as stages,
  youlinIdentityBindings as bindings,
  youlinPersons as persons,
  youlinSubjects as subjects,
} from '../../schemas/youlinIdentity';
import { youlinManualEnrollments as manualEnrollments } from '../../schemas/youlinManualEnrollment';
import type { LobeChatDatabase } from '../../type';
import { identityEnterpriseSchema, YoulinIdentityError } from './contracts';

export interface YoulinAuthorityReaderOptions {
  allowManualEnrollment?: boolean;
  enabled?: boolean;
  enterpriseId: string;
  issuer: string;
  maxConcurrentReads: number;
  statementTimeoutMs: number;
}

/** Formal-table projection only, NOT a token verifier, session store or resource PDP.
 * Caller supplies a bounded pg Pool-backed DB (not a borrowed client/transaction),
 * and sub from independently verified identity. No cache or replica fallback.
 */
export class YoulinIdentityAuthorityReader {
  private readonly enterpriseId: string;
  private readonly allowManualEnrollment: boolean;
  private readonly issuer: string;
  private readonly maxConcurrentReads: number;
  private readonly statementTimeoutMs: number;
  private active = 0;

  constructor(
    private readonly db: LobeChatDatabase,
    options: YoulinAuthorityReaderOptions,
  ) {
    if (options.enabled !== true) throw new YoulinIdentityError('FEATURE_DISABLED');
    if (is(db, PgTransaction)) throw new YoulinIdentityError('BORROWED_TRANSACTION_REJECTED');
    const pool = toRecord(db)?.$client;
    if (!(pool instanceof Pool)) throw new YoulinIdentityError('POOL_BACKED_DATABASE_REQUIRED');
    this.enterpriseId = identityEnterpriseSchema.parse(options.enterpriseId);
    this.allowManualEnrollment = options.allowManualEnrollment === true;
    this.issuer = z.url().max(1024).parse(options.issuer);
    this.maxConcurrentReads = z.number().int().min(1).max(16).parse(options.maxConcurrentReads);
    this.statementTimeoutMs = z.number().int().min(1).max(60_000).parse(options.statementTimeoutMs);
    const connectionTimeout = pool.options.connectionTimeoutMillis;
    const queryTimeout = pool.options.query_timeout;
    if (
      !connectionTimeout ||
      connectionTimeout < 1 ||
      connectionTimeout > 60_000 ||
      !queryTimeout ||
      queryTimeout <= this.statementTimeoutMs ||
      queryTimeout > 120_000
    )
      throw new YoulinIdentityError('BOUNDED_POOL_REQUIRED');
  }

  async readUser(
    externalSubject: string,
    signal: AbortSignal,
  ): Promise<YoulinUserAuthority | null> {
    const sub = z.string().min(1).max(255).parse(externalSubject);
    signal.throwIfAborted();
    if (this.active >= this.maxConcurrentReads) throw new YoulinIdentityError('READER_BUSY');
    this.active++;
    try {
      const result = await this.db.transaction(
        async (tx) => {
          signal.throwIfAborted();
          await tx.execute(
            sql`SELECT pg_catalog.set_config('statement_timeout', ${String(this.statementTimeoutMs)}, true), pg_catalog.set_config('search_path', 'pg_catalog, public, pg_temp', true)`,
          );
          const [environment] = await tx
            .select({
              isolation: sql<string>`pg_catalog.current_setting('transaction_isolation')`,
              readOnly: sql<string>`pg_catalog.current_setting('transaction_read_only')`,
              recovering: sql<boolean>`pg_catalog.pg_is_in_recovery()`,
            })
            .from(sql`(SELECT 1) AS authority_environment`);
          if (
            environment?.recovering !== false ||
            environment.readOnly !== 'on' ||
            environment.isolation !== 'read committed'
          )
            throw new YoulinIdentityError('AUTHORITATIVE_DATABASE_REQUIRED');
          signal.throwIfAborted();
          // One MVCC statement joins all eligibility facts; no split reads across commits.
          const [row] = await tx
            .select({
              bindingId: bindings.id,
              subjectId: subjects.id,
              userId: users.id,
              authEpoch: subjects.authEpoch,
              authorityVersion: subjects.authorityVersion,
              credentialsNotBefore: subjects.credentialsNotBefore,
              status: subjects.status,
              bindingStatus: bindings.status,
              banned: sql<boolean>`${users.banned} IS TRUE AND (${users.banExpires} IS NULL OR ${users.banExpires} > pg_catalog.clock_timestamp())`,
              proofEpoch: subjects.idpRevocationConfirmedEpoch,
              personId: persons.id,
              reconciled: persons.requiresReconciliation,
              manualEnrollmentId: manualEnrollments.id,
              manualStatus: manualEnrollments.status,
              manualUserId: manualEnrollments.userId,
              activeStages: sql<number>`(SELECT count(*)::integer FROM ${stages} WHERE ${stages.personId} = ${persons.id} AND ${stages.enterpriseId} = ${subjects.enterpriseId} AND ${stages.status} = 'active')`,
              validStages: sql<number>`(SELECT count(*)::integer FROM ${stages} WHERE ${stages.personId} = ${persons.id} AND ${stages.enterpriseId} = ${subjects.enterpriseId} AND ${stages.status} = 'active' AND (${stages.effectiveFrom} IS NULL OR ${stages.effectiveFrom} <= pg_catalog.clock_timestamp()) AND (${stages.effectiveTo} IS NULL OR ${stages.effectiveTo} > pg_catalog.clock_timestamp()))`,
              unknownStages: sql<number>`(SELECT count(*)::integer FROM ${stages} WHERE ${stages.personId} = ${persons.id} AND ${stages.enterpriseId} = ${subjects.enterpriseId} AND ${stages.status} NOT IN ('active', 'ended'))`,
            })
            .from(bindings)
            .innerJoin(
              subjects,
              and(
                eq(subjects.id, bindings.subjectId),
                eq(subjects.enterpriseId, bindings.enterpriseId),
              ),
            )
            .innerJoin(users, eq(users.id, subjects.userId))
            .leftJoin(
              persons,
              and(
                eq(persons.subjectId, subjects.id),
                eq(persons.enterpriseId, subjects.enterpriseId),
              ),
            )
            .leftJoin(
              manualEnrollments,
              and(
                eq(manualEnrollments.subjectId, subjects.id),
                eq(manualEnrollments.enterpriseId, subjects.enterpriseId),
              ),
            )
            .where(
              and(
                eq(bindings.enterpriseId, this.enterpriseId),
                eq(bindings.issuer, this.issuer),
                eq(bindings.externalSubject, sub),
                eq(subjects.kind, 'user'),
              ),
            )
            .limit(1);
          signal.throwIfAborted();
          if (!row) return null;
          if (
            !Number.isSafeInteger(row.authEpoch) ||
            row.authEpoch < 0 ||
            !Number.isSafeInteger(row.authorityVersion) ||
            row.authorityVersion < 0 ||
            !(row.credentialsNotBefore instanceof Date) ||
            !Number.isFinite(row.credentialsNotBefore.getTime())
          )
            throw new YoulinIdentityError('INVALID_AUTHORITY_STATE');
          // A manual row selects the manual admission path exclusively. Incompatible, pending,
          // disabled, unknown or mixed-source rows must not fall back to an HR person record.
          const admissionDisabled = row.manualEnrollmentId
            ? !this.allowManualEnrollment ||
              row.manualStatus !== 'active' ||
              row.manualUserId !== row.userId ||
              row.personId !== null
            : row.personId === null ||
              row.reconciled !== false ||
              row.activeStages !== 1 ||
              row.validStages !== 1 ||
              row.unknownStages !== 0;
          return {
            bindingId: row.bindingId,
            enterpriseId: this.enterpriseId,
            issuer: this.issuer,
            externalSubject: sub,
            subjectId: row.subjectId,
            userId: row.userId,
            authEpoch: row.authEpoch,
            authorityVersion: row.authorityVersion,
            credentialsNotBefore: row.credentialsNotBefore,
            disabled:
              row.status !== 'active' ||
              row.bindingStatus !== 'active' ||
              row.banned === true ||
              row.proofEpoch !== row.authEpoch ||
              admissionDisabled ||
              row.authEpoch === Number.MAX_SAFE_INTEGER ||
              row.authorityVersion === Number.MAX_SAFE_INTEGER,
          };
        },
        { accessMode: 'read only', isolationLevel: 'read committed' },
      );
      signal.throwIfAborted();
      return result;
    } catch (error) {
      if (error instanceof YoulinIdentityError) throw error;
      console.error('[YoulinIdentity] Authoritative user read failed');
      throw new YoulinIdentityError('AUTHORITY_READ_UNAVAILABLE');
    } finally {
      // Includes transaction commit/rollback; abort does not optimistically release the slot.
      this.active--;
    }
  }
}
