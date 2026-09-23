import { createHash, randomUUID } from 'node:crypto';

import type {
  YoulinIdentityActor,
  YoulinIdentityAuditDetail,
  YoulinIdentityCommandResult,
  YoulinIdentityPermission,
} from '@lobechat/types';
import { pickString, toRecord } from '@lobechat/utils/object';
import debug from 'debug';
import { and, eq, is, sql } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { users } from '../../schemas/user';
import { youlinSubjects } from '../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../schemas/youlinIdentityGovernance';
import {
  youlinIdentityAuditEvents,
  youlinIdentityCommands,
  youlinIdentityOutbox,
} from '../../schemas/youlinIdentityOperations';
import type { LobeChatDatabase, Transaction } from '../../type';
import {
  identityActorSchema,
  identityCommandResultSchema,
  identityEnterpriseSchema,
  identityIdempotencySchema,
  YoulinIdentityError,
} from './contracts';

const log = debug('lobe-server:youlin-identity');

const permissions = {
  activate_subject: 'identity:activate',
  bind_principal: 'identity:bind',
  register_person: 'identity:provision',
  review_binding: 'identity:review',
  revoke_subject: 'identity:revoke',
  update_employment: 'identity:provision',
} as const satisfies Record<string, YoulinIdentityPermission>;

type IdentityOperation = keyof typeof permissions;

export interface IdentityCommandOptions {
  actor: Readonly<YoulinIdentityActor>;
  enabled?: boolean;
  enterpriseId: string;
  lockTimeoutMs: number;
  sqlTimeoutMs: number;
}

interface CommandChange {
  detail: YoulinIdentityAuditDetail;
  result: YoulinIdentityCommandResult;
  subjectId?: string;
}

const timeout = z.number().int().min(1).max(2_147_483_647);

/**
 * Internal command boundary, not authentication. The caller must supply its server-authenticated
 * actor and a pool-backed database, never a borrowed client/transaction. No external IO in work().
 */
export class IdentityCommandRunner {
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

  async assertPermission(tx: Transaction, permission: YoulinIdentityPermission, lock = false) {
    const actorQuery = tx
      .select({
        authEpoch: youlinSubjects.authEpoch,
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
    if (!actor || actor.status !== 'active' || actor.authEpoch !== this.actor.authEpoch)
      throw new YoulinIdentityError('ACTOR_NOT_AUTHORIZED');
    if (actor.kind === 'user') {
      if (!actor.userId) throw new YoulinIdentityError('ACTOR_NOT_AUTHORIZED');
      const userQuery = tx
        .select({ banned: users.banned })
        .from(users)
        .where(eq(users.id, actor.userId))
        .limit(1);
      const [user] = lock ? await userQuery.for('share') : await userQuery;
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

  async run(
    operation: IdentityOperation,
    idempotencyKey: string,
    normalizedInput: unknown,
    work: (tx: Transaction) => Promise<CommandChange>,
    principalLock?: string,
  ): Promise<YoulinIdentityCommandResult> {
    const key = identityIdempotencySchema.parse(idempotencyKey);
    const requestHash = createHash('sha256').update(JSON.stringify(normalizedInput)).digest('hex');
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
          await this.assertPermission(tx, permissions[operation]);
          // All control-plane writers take the enterprise lock before any global principal lock.
          // Protected reads do not take these locks. A 64-bit hash collision only adds serialization.
          await tx.execute(
            sql`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`youlin-identity:${this.enterpriseId}`}, 0))`,
          );
          if (principalLock)
            await tx.execute(
              sql`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`youlin-principal:${principalLock}`}, 0))`,
            );
          // Permission may have changed while waiting. Lock the actor only after control-plane locks,
          // also fencing legacy user bans against this command's commit.
          await this.assertPermission(tx, permissions[operation], true);
          const [receipt] = await tx
            .select()
            .from(youlinIdentityCommands)
            .where(
              and(
                eq(youlinIdentityCommands.enterpriseId, this.enterpriseId),
                eq(youlinIdentityCommands.actorId, this.actor.subjectId),
                eq(youlinIdentityCommands.operation, operation),
                eq(youlinIdentityCommands.idempotencyKey, key),
              ),
            )
            .limit(1);
          if (receipt) {
            if (receipt.requestHash !== requestHash)
              throw new YoulinIdentityError('IDEMPOTENCY_CONFLICT');
            return identityCommandResultSchema.parse(receipt.result);
          }
          const change = await work(tx);
          const result = identityCommandResultSchema.parse(change.result);
          const commandId = attemptId;
          const auditId = randomUUID();
          await tx.insert(youlinIdentityCommands).values({
            actorId: this.actor.subjectId,
            enterpriseId: this.enterpriseId,
            id: commandId,
            idempotencyKey: key,
            operation,
            requestHash,
            result,
          });
          await tx.insert(youlinIdentityAuditEvents).values({
            actorId: this.actor.subjectId,
            commandId,
            detail: change.detail,
            enterpriseId: this.enterpriseId,
            id: auditId,
            operation,
            subjectId: change.subjectId,
          });
          await tx
            .insert(youlinIdentityOutbox)
            .values({ auditEventId: auditId, enterpriseId: this.enterpriseId });
          return result;
        },
        { accessMode: 'read write', isolationLevel: 'read committed' },
      );
    } catch (error) {
      if (error instanceof YoulinIdentityError) throw error;
      // Classify only known codes; never forward SQL, messages, parameters or cause objects.
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
      // Catch-path console reporting is required by the TypeScript skill even when DEBUG is off.
      console.error('[YoulinIdentity] Command result requires reconciliation', diagnostic);
      throw new YoulinIdentityError('COMMAND_OUTCOME_UNCONFIRMED', attemptId);
    }
  }
}
