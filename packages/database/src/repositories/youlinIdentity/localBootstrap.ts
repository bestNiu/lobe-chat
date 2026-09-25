import { createHash, randomUUID } from 'node:crypto';

import type { YoulinIdentityPermission } from '@lobechat/types';
import { and, eq, inArray, is, or, sql } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { account } from '../../schemas/betterAuth';
import { users } from '../../schemas/user';
import {
  youlinIdentityBindings,
  youlinPersons,
  youlinSubjects,
} from '../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../schemas/youlinIdentityGovernance';
import {
  youlinIdentityAuditEvents,
  youlinIdentityCommands,
  youlinIdentityOutbox,
} from '../../schemas/youlinIdentityOperations';
import { youlinManualEnrollments } from '../../schemas/youlinManualEnrollment';
import type { LobeChatDatabase, Transaction } from '../../type';
import { IdentityCommandRunner } from './commandRunner';
import { identityEnterpriseSchema, YoulinIdentityError } from './contracts';

const administratorPermissions = [
  'identity:provision',
  'identity:bind',
  'identity:activate',
  'identity:revoke',
  'identity:read',
] as const satisfies readonly YoulinIdentityPermission[];
const cleanupPermissions = [
  'identity:record-cleanup',
] as const satisfies readonly YoulinIdentityPermission[];
const initializeOperation = 'initialize_local_bootstrap';
const initializeKey = 'local-bootstrap:initialize';
const administratorKey = 'local-bootstrap:first-administrator';

const optionsSchema = z
  .object({
    bootstrapOperatorId: z.uuid(),
    cleanupWorkerId: z.uuid(),
    enabled: z.literal(true),
    enterpriseId: identityEnterpriseSchema,
    issuer: z.url().max(1024),
    localTestOnlyAcknowledged: z.literal(true),
    lockTimeoutMs: z.number().int().min(1).max(60_000),
    sqlTimeoutMs: z.number().int().min(1).max(60_000),
  })
  .strict()
  .refine((value) => value.bootstrapOperatorId !== value.cleanupWorkerId)
  .refine((value) => value.lockTimeoutMs <= value.sqlTimeoutMs);
const administratorSchema = z.object({ subjectId: z.uuid() }).strict();

export interface LocalBootstrapOptions {
  bootstrapOperatorId: string;
  cleanupWorkerId: string;
  enabled?: boolean;
  enterpriseId: string;
  issuer: string;
  localTestOnlyAcknowledged?: boolean;
  lockTimeoutMs: number;
  sqlTimeoutMs: number;
}

type ParsedOptions = z.infer<typeof optionsSchema>;

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Offline/local-test trust-root ceremony. It performs no provider IO and exposes no HTTP surface. */
export class YoulinIdentityLocalBootstrap {
  private readonly options: Readonly<ParsedOptions>;
  private readonly configHash: string;

  constructor(
    private readonly db: LobeChatDatabase,
    options: LocalBootstrapOptions,
  ) {
    if (is(db, PgTransaction)) throw new YoulinIdentityError('BORROWED_TRANSACTION_REJECTED');
    this.options = Object.freeze(optionsSchema.parse(options));
    this.configHash = hash({
      bootstrapOperatorId: this.options.bootstrapOperatorId,
      cleanupWorkerId: this.options.cleanupWorkerId,
      enterpriseId: this.options.enterpriseId,
      issuer: this.options.issuer,
    });
  }

  private async prepare(tx: Transaction) {
    await tx.execute(
      sql`SELECT pg_catalog.set_config('statement_timeout', ${String(this.options.sqlTimeoutMs)}, true), pg_catalog.set_config('lock_timeout', ${String(this.options.lockTimeoutMs)}, true), pg_catalog.set_config('search_path', 'pg_catalog, public, pg_temp', true)`,
    );
    const [environment] = await tx
      .select({
        isolation: sql<string>`pg_catalog.current_setting('transaction_isolation')`,
        recovery: sql<boolean>`pg_catalog.pg_is_in_recovery()`,
      })
      .from(sql`(SELECT 1) AS bootstrap_environment`);
    if (environment?.recovery !== false || environment.isolation !== 'read committed')
      throw new YoulinIdentityError('AUTHORITATIVE_DATABASE_REQUIRED');
    await tx.execute(
      sql`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`youlin-identity:${this.options.enterpriseId}`}, 0))`,
    );
  }

  private async readInitialization(tx: Transaction) {
    const [receipt] = await tx
      .select()
      .from(youlinIdentityCommands)
      .where(
        and(
          eq(youlinIdentityCommands.enterpriseId, this.options.enterpriseId),
          eq(youlinIdentityCommands.actorId, this.options.bootstrapOperatorId),
          eq(youlinIdentityCommands.operation, initializeOperation),
          eq(youlinIdentityCommands.idempotencyKey, initializeKey),
        ),
      )
      .limit(1);
    if (!receipt) return null;
    if (
      receipt.requestHash !== this.configHash ||
      receipt.result.status !== 'created' ||
      receipt.result.subjectId !== this.options.bootstrapOperatorId
    )
      throw new YoulinIdentityError('BOOTSTRAP_CONFIG_MISMATCH');
    return receipt;
  }

  private async assertServiceState(tx: Transaction, operatorState: 'active' | 'retired') {
    const subjects = await tx
      .select()
      .from(youlinSubjects)
      .where(
        inArray(youlinSubjects.id, [
          this.options.bootstrapOperatorId,
          this.options.cleanupWorkerId,
        ]),
      );
    const grants = await tx
      .select({
        authEpoch: youlinIdentityGrants.authEpoch,
        permission: youlinIdentityGrants.permission,
        subjectId: youlinIdentityGrants.subjectId,
      })
      .from(youlinIdentityGrants)
      .where(
        inArray(youlinIdentityGrants.subjectId, [
          this.options.bootstrapOperatorId,
          this.options.cleanupWorkerId,
        ]),
      );
    const operator = subjects.find(({ id }) => id === this.options.bootstrapOperatorId);
    const cleanup = subjects.find(({ id }) => id === this.options.cleanupWorkerId);
    const exact = (subjectId: string, permissions: readonly YoulinIdentityPermission[]) => {
      const rows = grants.filter((grant) => grant.subjectId === subjectId);
      return (
        rows.length === permissions.length &&
        rows.every((grant) => grant.authEpoch === 0 && permissions.includes(grant.permission))
      );
    };
    if (
      subjects.length !== 2 ||
      !operator ||
      !cleanup ||
      operator.enterpriseId !== this.options.enterpriseId ||
      cleanup.enterpriseId !== this.options.enterpriseId ||
      operator.kind !== 'service' ||
      cleanup.kind !== 'service' ||
      operator.userId !== null ||
      cleanup.userId !== null ||
      cleanup.status !== 'active' ||
      cleanup.authEpoch !== 0 ||
      cleanup.authorityVersion !== 0 ||
      !exact(this.options.cleanupWorkerId, cleanupPermissions) ||
      (operatorState === 'active'
        ? operator.status !== 'active' ||
          operator.authEpoch !== 0 ||
          operator.authorityVersion !== 0 ||
          !exact(this.options.bootstrapOperatorId, administratorPermissions)
        : operator.status !== 'disabled' ||
          operator.authEpoch !== 1 ||
          operator.authorityVersion !== 1 ||
          grants.some((grant) => grant.subjectId === this.options.bootstrapOperatorId))
    )
      throw new YoulinIdentityError('BOOTSTRAP_STATE_MISMATCH');
  }

  async initialize() {
    return this.db.transaction(
      async (tx) => {
        await this.prepare(tx);
        const receipt = await this.readInitialization(tx);
        if (receipt) {
          const [completion] = await tx
            .select({ id: youlinIdentityCommands.id })
            .from(youlinIdentityCommands)
            .where(
              and(
                eq(youlinIdentityCommands.enterpriseId, this.options.enterpriseId),
                eq(youlinIdentityCommands.actorId, this.options.bootstrapOperatorId),
                eq(youlinIdentityCommands.operation, 'assign_first_administrator'),
                eq(youlinIdentityCommands.idempotencyKey, administratorKey),
              ),
            )
            .limit(1);
          await this.assertServiceState(tx, completion ? 'retired' : 'active');
          return { status: 'resumed' as const };
        }
        const [{ count: userCount }] = await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(users);
        const [{ count: subjectCount }] = await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(youlinSubjects);
        if (userCount !== 0 || subjectCount !== 0)
          throw new YoulinIdentityError('BOOTSTRAP_REQUIRES_EMPTY_DATABASE');

        await tx.insert(youlinSubjects).values([
          {
            enterpriseId: this.options.enterpriseId,
            id: this.options.bootstrapOperatorId,
            kind: 'service',
            status: 'active',
          },
          {
            enterpriseId: this.options.enterpriseId,
            id: this.options.cleanupWorkerId,
            kind: 'service',
            status: 'active',
          },
        ]);
        await tx.insert(youlinIdentityGrants).values([
          ...administratorPermissions.map((permission) => ({
            authEpoch: 0,
            enterpriseId: this.options.enterpriseId,
            permission,
            subjectId: this.options.bootstrapOperatorId,
          })),
          {
            authEpoch: 0,
            enterpriseId: this.options.enterpriseId,
            permission: cleanupPermissions[0],
            subjectId: this.options.cleanupWorkerId,
          },
        ]);
        const commandId = randomUUID();
        const auditId = randomUUID();
        await tx.insert(youlinIdentityCommands).values({
          actorId: this.options.bootstrapOperatorId,
          enterpriseId: this.options.enterpriseId,
          id: commandId,
          idempotencyKey: initializeKey,
          operation: initializeOperation,
          requestHash: this.configHash,
          result: { status: 'created', subjectId: this.options.bootstrapOperatorId },
        });
        await tx.insert(youlinIdentityAuditEvents).values({
          actorId: this.options.bootstrapOperatorId,
          commandId,
          detail: { reason: 'local_test_bootstrap_initialized' },
          enterpriseId: this.options.enterpriseId,
          id: auditId,
          operation: initializeOperation,
        });
        await tx
          .insert(youlinIdentityOutbox)
          .values({ auditEventId: auditId, enterpriseId: this.options.enterpriseId });
        return { status: 'initialized' as const };
      },
      { accessMode: 'read write', isolationLevel: 'read committed' },
    );
  }

  private async completedAdministrator(subjectId: string) {
    return this.db.transaction(
      async (tx) => {
        await this.prepare(tx);
        const receipt = await this.readInitialization(tx);
        if (!receipt) throw new YoulinIdentityError('BOOTSTRAP_NOT_INITIALIZED');
        const [completion] = await tx
          .select({ result: youlinIdentityCommands.result })
          .from(youlinIdentityCommands)
          .where(
            and(
              eq(youlinIdentityCommands.enterpriseId, this.options.enterpriseId),
              eq(youlinIdentityCommands.actorId, this.options.bootstrapOperatorId),
              eq(youlinIdentityCommands.operation, 'assign_first_administrator'),
              eq(youlinIdentityCommands.idempotencyKey, administratorKey),
            ),
          )
          .limit(1);
        if (!completion) return null;
        if (completion.result.status !== 'created')
          throw new YoulinIdentityError('BOOTSTRAP_STATE_MISMATCH');
        if (completion.result.subjectId !== subjectId)
          throw new YoulinIdentityError('FIRST_ADMINISTRATOR_ALREADY_ASSIGNED');
        return { status: 'completed' as const, subjectId };
      },
      { accessMode: 'read only', isolationLevel: 'read committed' },
    );
  }

  async assignFirstAdministrator(input: unknown) {
    const { subjectId } = administratorSchema.parse(input);
    const completed = await this.completedAdministrator(subjectId);
    if (completed) return completed;
    const runner = new IdentityCommandRunner(this.db, {
      actor: { authEpoch: 0, subjectId: this.options.bootstrapOperatorId },
      enabled: true,
      enterpriseId: this.options.enterpriseId,
      lockTimeoutMs: this.options.lockTimeoutMs,
      sqlTimeoutMs: this.options.sqlTimeoutMs,
    });
    const result = await runner.run(
      'assign_first_administrator',
      administratorKey,
      { configHash: this.configHash, subjectId },
      async (tx) => {
        if (!(await this.readInitialization(tx)))
          throw new YoulinIdentityError('BOOTSTRAP_NOT_INITIALIZED');
        await this.assertServiceState(tx, 'active');
        const [subject] = await tx
          .select()
          .from(youlinSubjects)
          .where(
            and(
              eq(youlinSubjects.enterpriseId, this.options.enterpriseId),
              eq(youlinSubjects.id, subjectId),
            ),
          )
          .limit(1)
          .for('update');
        if (
          !subject ||
          subject.kind !== 'user' ||
          !subject.userId ||
          subject.status !== 'active' ||
          subject.authEpoch !== 0 ||
          subject.authorityVersion !== 1 ||
          subject.idpRevocationConfirmedEpoch !== 0
        )
          throw new YoulinIdentityError('ADMINISTRATOR_TARGET_INVALID');
        const [enrollment] = await tx
          .select()
          .from(youlinManualEnrollments)
          .where(
            and(
              eq(youlinManualEnrollments.enterpriseId, this.options.enterpriseId),
              eq(youlinManualEnrollments.subjectId, subjectId),
              eq(youlinManualEnrollments.userId, subject.userId),
              eq(youlinManualEnrollments.status, 'active'),
            ),
          )
          .limit(1);
        const persons = await tx
          .select({ id: youlinPersons.id })
          .from(youlinPersons)
          .where(eq(youlinPersons.subjectId, subjectId));
        const bindings = await tx
          .select()
          .from(youlinIdentityBindings)
          .where(
            and(
              eq(youlinIdentityBindings.enterpriseId, this.options.enterpriseId),
              eq(youlinIdentityBindings.subjectId, subjectId),
              eq(youlinIdentityBindings.status, 'active'),
            ),
          );
        if (
          !enrollment ||
          persons.length !== 0 ||
          bindings.length !== 1 ||
          bindings[0].issuer !== this.options.issuer
        )
          throw new YoulinIdentityError('ADMINISTRATOR_TARGET_INVALID');
        const accounts = await tx
          .select()
          .from(account)
          .where(
            and(
              eq(account.providerId, 'keycloak'),
              or(
                eq(account.accountId, bindings[0].externalSubject),
                eq(account.userId, subject.userId),
              ),
            ),
          );
        const targetGrants = await tx
          .select({ id: youlinIdentityGrants.id })
          .from(youlinIdentityGrants)
          .where(eq(youlinIdentityGrants.subjectId, subjectId));
        if (
          accounts.length !== 1 ||
          accounts[0].accountId !== bindings[0].externalSubject ||
          accounts[0].userId !== subject.userId ||
          targetGrants.length !== 0
        )
          throw new YoulinIdentityError('ADMINISTRATOR_TARGET_INVALID');
        await tx.insert(youlinIdentityGrants).values(
          administratorPermissions.map((permission) => ({
            authEpoch: 0,
            enterpriseId: this.options.enterpriseId,
            permission,
            subjectId,
          })),
        );
        const [retired] = await tx
          .update(youlinSubjects)
          .set({
            authEpoch: 1,
            authorityVersion: 1,
            credentialsNotBefore: sql`greatest(${youlinSubjects.credentialsNotBefore}, clock_timestamp())`,
            status: 'disabled',
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(youlinSubjects.id, this.options.bootstrapOperatorId),
              eq(youlinSubjects.enterpriseId, this.options.enterpriseId),
              eq(youlinSubjects.kind, 'service'),
              eq(youlinSubjects.status, 'active'),
              eq(youlinSubjects.authEpoch, 0),
              eq(youlinSubjects.authorityVersion, 0),
            ),
          )
          .returning({ id: youlinSubjects.id });
        if (!retired) throw new YoulinIdentityError('BOOTSTRAP_STATE_MISMATCH');
        await tx
          .delete(youlinIdentityGrants)
          .where(eq(youlinIdentityGrants.subjectId, this.options.bootstrapOperatorId));
        return {
          detail: { authEpoch: 0, reason: 'local_test_first_administrator' },
          result: { status: 'created' as const, subjectId },
          subjectId,
        };
      },
    );
    if (result.status !== 'created' || result.subjectId !== subjectId)
      throw new YoulinIdentityError('INVALID_COMMAND_RECEIPT');
    return { status: 'assigned' as const, subjectId };
  }
}
