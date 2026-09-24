import { randomUUID } from 'node:crypto';

import type { YoulinIdentityActor, YoulinIdentityPermission } from '@lobechat/types';
import { pickString, toRecord } from '@lobechat/utils/object';
import debug from 'debug';
import { and, eq, is, sql } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { users } from '../../schemas/user';
import { youlinSubjects } from '../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../schemas/youlinIdentityGovernance';
import type { LobeChatDatabase, Transaction } from '../../type';
import { identityActorSchema, identityEnterpriseSchema, YoulinIdentityError } from './contracts';

export interface IdentityCommandOptions {
  actor: Readonly<YoulinIdentityActor>;
  enabled?: boolean;
  enterpriseId: string;
  lockTimeoutMs: number;
  sqlTimeoutMs: number;
}

const timeout = z.number().int().min(1).max(2_147_483_647);
const log = debug('lobe-server:youlin-identity');

/** Shared control-plane transaction policy, not authentication or the high-volume PEP reader.
 * Supply a server-authenticated actor and pool-backed DB; never a borrowed client/transaction.
 * Subclasses provide fixed operation labels and do no external IO inside work().
 */
export abstract class IdentityAuthorityTransaction {
  readonly actor: Readonly<YoulinIdentityActor>;
  readonly enterpriseId: string;
  private readonly lockTimeoutMs: number;
  private readonly sqlTimeoutMs: number;

  constructor(
    private readonly db: LobeChatDatabase,
    options: IdentityCommandOptions,
  ) {
    if (options.enabled !== true) throw new YoulinIdentityError('FEATURE_DISABLED');
    if (is(db, PgTransaction)) throw new YoulinIdentityError('BORROWED_TRANSACTION_REJECTED');
    this.actor = Object.freeze(identityActorSchema.parse(options.actor));
    this.enterpriseId = identityEnterpriseSchema.parse(options.enterpriseId);
    this.lockTimeoutMs = timeout.parse(options.lockTimeoutMs);
    this.sqlTimeoutMs = timeout.parse(options.sqlTimeoutMs);
    if (this.lockTimeoutMs > this.sqlTimeoutMs)
      throw new YoulinIdentityError('INVALID_TIMEOUT_CONFIGURATION');
  }

  private async assertPermission(
    tx: Transaction,
    permission: YoulinIdentityPermission,
    lock = false,
  ) {
    const actorQuery = tx
      .select({
        authEpoch: youlinSubjects.authEpoch,
        authorityVersion: youlinSubjects.authorityVersion,
        kind: youlinSubjects.kind,
        status: youlinSubjects.status,
        userId: youlinSubjects.userId,
      })
      .from(youlinSubjects)
      .where(
        and(
          eq(youlinSubjects.id, this.actor.subjectId),
          eq(youlinSubjects.enterpriseId, this.enterpriseId),
        ),
      )
      .limit(1);
    const [actor] = lock ? await actorQuery.for('share') : await actorQuery;
    if (
      !actor ||
      actor.status !== 'active' ||
      actor.authEpoch !== this.actor.authEpoch ||
      actor.authEpoch === Number.MAX_SAFE_INTEGER ||
      actor.authorityVersion === Number.MAX_SAFE_INTEGER
    )
      throw new YoulinIdentityError('ACTOR_NOT_AUTHORIZED');
    if (
      (permission === 'identity:deliver' || permission === 'identity:sync-hr') &&
      actor.kind !== 'service'
    )
      throw new YoulinIdentityError('PRIVATE_SERVICE_REQUIRED');
    if (actor.kind === 'user') {
      if (!actor.userId) throw new YoulinIdentityError('ACTOR_NOT_AUTHORIZED');
      const query = tx
        .select({ banned: users.banned })
        .from(users)
        .where(eq(users.id, actor.userId))
        .limit(1);
      const [user] = lock ? await query.for('share') : await query;
      if (!user || user.banned === true) throw new YoulinIdentityError('ACTOR_NOT_AUTHORIZED');
    }
    const [grant] = await tx
      .select({ id: youlinIdentityGrants.id })
      .from(youlinIdentityGrants)
      .where(
        and(
          eq(youlinIdentityGrants.enterpriseId, this.enterpriseId),
          eq(youlinIdentityGrants.subjectId, this.actor.subjectId),
          eq(youlinIdentityGrants.authEpoch, this.actor.authEpoch),
          eq(youlinIdentityGrants.permission, permission),
        ),
      )
      .limit(1);
    if (!grant) throw new YoulinIdentityError('ACTOR_NOT_AUTHORIZED');
  }

  protected async execute<T>(
    permission: YoulinIdentityPermission,
    operation: string,
    work: (tx: Transaction, attemptId: string) => Promise<T>,
    principalLock?: string,
  ): Promise<T> {
    const attemptId = randomUUID();
    try {
      return await this.db.transaction(
        async (tx) => {
          await tx.execute(
            sql`SELECT pg_catalog.set_config('statement_timeout', ${String(this.sqlTimeoutMs)}, true), pg_catalog.set_config('lock_timeout', ${String(this.lockTimeoutMs)}, true)`,
          );
          const [environment] = await tx
            .select({
              isolation: sql<string>`pg_catalog.current_setting('transaction_isolation')`,
              recovery: sql<boolean>`pg_catalog.pg_is_in_recovery()`,
            })
            .from(sql`(SELECT 1) AS identity_environment`);
          if (environment?.recovery !== false || environment.isolation !== 'read committed')
            throw new YoulinIdentityError('AUTHORITATIVE_DATABASE_REQUIRED');
          await this.assertPermission(tx, permission);
          // All control-plane writers take the enterprise lock before any global principal lock.
          await tx.execute(
            sql`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`youlin-identity:${this.enterpriseId}`}, 0))`,
          );
          if (principalLock)
            await tx.execute(
              sql`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`youlin-principal:${principalLock}`}, 0))`,
            );
          // Revalidate after waiting, then fence actor changes/legacy bans against this commit.
          await this.assertPermission(tx, permission, true);
          return work(tx, attemptId);
        },
        { accessMode: 'read write', isolationLevel: 'read committed' },
      );
    } catch (error) {
      if (error instanceof YoulinIdentityError) throw error;
      const cause = toRecord(error instanceof Error ? error.cause : undefined) ?? toRecord(error);
      const code = pickString(cause?.code);
      let category = 'internal_or_commit_unconfirmed';
      if (error instanceof z.ZodError) category = 'validation';
      else if (code === '57014') category = 'sql_timeout';
      else if (code === '55P03') category = 'lock_timeout';
      else if (code?.startsWith('23')) category = 'constraint';
      else if (code?.startsWith('08') || code === 'ECONNRESET' || code === 'ECONNREFUSED')
        category = 'connection';
      const diagnostic = { attemptId, category, operation };
      log('Command failed: %O', diagnostic);
      console.error('[YoulinIdentity] Command result requires reconciliation', diagnostic);
      throw new YoulinIdentityError('COMMAND_OUTCOME_UNCONFIRMED', attemptId);
    }
  }
}
