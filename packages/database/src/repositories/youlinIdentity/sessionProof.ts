import type { YoulinSessionBindingContext, YoulinSessionProof } from '@lobechat/types';
import { toRecord } from '@lobechat/utils/object';
import { and, eq, gt, is, sql } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { z } from 'zod';

import { session as authSessions } from '../../schemas/betterAuth';
import {
  youlinIdentityBindings as bindings,
  youlinSubjects as subjects,
} from '../../schemas/youlinIdentity';
import { youlinSessionProofs as proofs } from '../../schemas/youlinIdentitySession';
import type { LobeChatDatabase } from '../../type';
import { identityEnterpriseSchema, identityVersionSchema, YoulinIdentityError } from './contracts';

export interface YoulinSessionProofRepositoryOptions {
  enabled?: boolean;
  maxConcurrentReads: number;
  statementTimeoutMs: number;
}

const bindingContextSchema = z
  .object({
    authEpoch: identityVersionSchema.max(Number.MAX_SAFE_INTEGER - 1),
    bindingId: z.uuid(),
    enterpriseId: identityEnterpriseSchema,
    externalSubject: z.string().min(1).max(255),
    issuer: z.url().max(1024),
    subjectId: z.uuid(),
    userId: z.string().min(1).max(128),
  })
  .strict();

/** Durable, immutable bridge from verified enterprise identity to a native auth session. */
export class YoulinSessionProofRepository {
  private activeReads = 0;
  private readonly maxConcurrentReads: number;
  private readonly statementTimeoutMs: number;

  constructor(
    private readonly db: LobeChatDatabase,
    options: YoulinSessionProofRepositoryOptions,
  ) {
    if (options.enabled !== true) throw new YoulinIdentityError('FEATURE_DISABLED');
    if (is(db, PgTransaction)) throw new YoulinIdentityError('BORROWED_TRANSACTION_REJECTED');
    const pool = toRecord(db)?.$client;
    if (!(pool instanceof Pool)) throw new YoulinIdentityError('POOL_BACKED_DATABASE_REQUIRED');
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

  bindSession = async (
    sessionIdInput: string,
    contextInput: Readonly<YoulinSessionBindingContext>,
  ): Promise<YoulinSessionProof> => {
    const sessionId = z.string().min(1).max(255).parse(sessionIdInput);
    const context = bindingContextSchema.parse(contextInput);
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_catalog.set_config('statement_timeout', ${String(this.statementTimeoutMs)}, true), pg_catalog.set_config('search_path', 'pg_catalog, public, pg_temp', true)`,
      );
      const [eligible] = await tx
        .select({ id: authSessions.id })
        .from(authSessions)
        .innerJoin(
          subjects,
          and(
            eq(subjects.id, context.subjectId),
            eq(subjects.enterpriseId, context.enterpriseId),
            eq(subjects.userId, authSessions.userId),
            eq(subjects.authEpoch, context.authEpoch),
            eq(subjects.status, 'active'),
          ),
        )
        .innerJoin(
          bindings,
          and(
            eq(bindings.id, context.bindingId),
            eq(bindings.enterpriseId, context.enterpriseId),
            eq(bindings.subjectId, context.subjectId),
            eq(bindings.issuer, context.issuer),
            eq(bindings.externalSubject, context.externalSubject),
            eq(bindings.status, 'active'),
          ),
        )
        .where(
          and(
            eq(authSessions.id, sessionId),
            eq(authSessions.userId, context.userId),
            gt(authSessions.expiresAt, sql`pg_catalog.clock_timestamp()`),
          ),
        )
        .for('update')
        .limit(1);
      if (!eligible) throw new YoulinIdentityError('SESSION_BINDING_MISMATCH');
      const [created] = await tx
        .insert(proofs)
        .values({ sessionId, ...context })
        .returning({
          authEpoch: proofs.authEpoch,
          bindingId: proofs.bindingId,
          enterpriseId: proofs.enterpriseId,
          externalSubject: proofs.externalSubject,
          issuer: proofs.issuer,
          sessionId: proofs.sessionId,
          subjectId: proofs.subjectId,
          userId: proofs.userId,
        });
      if (!created) throw new YoulinIdentityError('SESSION_PROOF_WRITE_FAILED');
      return created;
    });
  };

  readSession = async (
    sessionIdInput: string,
    userIdInput: string,
    signal: AbortSignal,
  ): Promise<YoulinSessionProof | null> => {
    const sessionId = z.string().min(1).max(255).parse(sessionIdInput);
    const userId = z.string().min(1).max(128).parse(userIdInput);
    signal.throwIfAborted();
    if (this.activeReads >= this.maxConcurrentReads) throw new YoulinIdentityError('READER_BUSY');
    this.activeReads++;
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
            .from(sql`(SELECT 1) AS proof_environment`);
          if (
            environment?.recovering !== false ||
            environment.readOnly !== 'on' ||
            environment.isolation !== 'read committed'
          )
            throw new YoulinIdentityError('AUTHORITATIVE_DATABASE_REQUIRED');
          const [proof] = await tx
            .select({
              authEpoch: proofs.authEpoch,
              bindingId: proofs.bindingId,
              enterpriseId: proofs.enterpriseId,
              externalSubject: proofs.externalSubject,
              issuer: proofs.issuer,
              sessionId: proofs.sessionId,
              subjectId: proofs.subjectId,
              userId: proofs.userId,
            })
            .from(proofs)
            .innerJoin(
              authSessions,
              and(eq(authSessions.id, proofs.sessionId), eq(authSessions.userId, proofs.userId)),
            )
            .innerJoin(
              subjects,
              and(
                eq(subjects.id, proofs.subjectId),
                eq(subjects.enterpriseId, proofs.enterpriseId),
                eq(subjects.userId, proofs.userId),
              ),
            )
            .innerJoin(
              bindings,
              and(
                eq(bindings.id, proofs.bindingId),
                eq(bindings.enterpriseId, proofs.enterpriseId),
                eq(bindings.subjectId, proofs.subjectId),
                eq(bindings.issuer, proofs.issuer),
                eq(bindings.externalSubject, proofs.externalSubject),
              ),
            )
            .where(
              and(
                eq(proofs.sessionId, sessionId),
                eq(proofs.userId, userId),
                gt(authSessions.expiresAt, sql`pg_catalog.clock_timestamp()`),
              ),
            )
            .limit(1);
          signal.throwIfAborted();
          return proof ?? null;
        },
        { accessMode: 'read only', isolationLevel: 'read committed' },
      );
      signal.throwIfAborted();
      return result;
    } catch (error) {
      if (error instanceof YoulinIdentityError) throw error;
      console.error('[YoulinIdentity] Session proof read failed');
      throw new YoulinIdentityError('SESSION_PROOF_UNAVAILABLE');
    } finally {
      this.activeReads--;
    }
  };
}
