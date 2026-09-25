import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { users } from '../../../schemas/user';
import {
  youlinEmploymentStages,
  youlinIdentityBindings,
  youlinPersons,
  youlinSubjects,
} from '../../../schemas/youlinIdentity';
import { youlinManualEnrollments } from '../../../schemas/youlinManualEnrollment';
import { YoulinIdentityAuthorityReader } from '../authorityReader';
import { YoulinIdentityRevocation } from '../revocation';
import { createIdentityTestDatabase } from './database';

const options = {
  enabled: true,
  enterpriseId: 'a',
  issuer: 'https://idp.synthetic',
  maxConcurrentReads: 2,
  statementTimeoutMs: 1000,
};

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('formal identity authority reader', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let reader: YoulinIdentityAuthorityReader;
  let subjectId: string;
  let userId: string;
  let personId: string;
  const read = () => reader.readUser('principal-a', new AbortController().signal);
  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  beforeEach(async () => {
    await fixture.reset();
    subjectId = (await fixture.seedActor('a', [], true)).subjectId;
    const [subject] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, subjectId));
    userId = subject.userId!;
    await fixture.db
      .update(youlinSubjects)
      .set({ idpRevocationConfirmedEpoch: 0 })
      .where(eq(youlinSubjects.id, subjectId));
    personId = randomUUID();
    await fixture.db.insert(youlinPersons).values({
      id: personId,
      enterpriseId: 'a',
      subjectId,
      source: 'synthetic-roster',
      personKey: 'person-a',
      requiresReconciliation: false,
    });
    await fixture.db.insert(youlinEmploymentStages).values({
      enterpriseId: 'a',
      personId,
      sourceStageKey: 'stage-a',
      employeeNumber: 'synthetic-001',
      legalEntityCode: 'entity-a',
      status: 'active',
    });
    await fixture.db.insert(youlinIdentityBindings).values({
      enterpriseId: 'a',
      subjectId,
      issuer: options.issuer,
      externalSubject: 'principal-a',
    });
    reader = new YoulinIdentityAuthorityReader(fixture.db, options);
  });

  it('projects the formal tables without treating this as resource authorization', async () => {
    expect(await read()).toMatchObject({
      enterpriseId: 'a',
      userId,
      subjectId,
      authEpoch: 0,
      authorityVersion: 0,
      disabled: false,
    });
    expect((await read())?.credentialsNotBefore).toBeInstanceOf(Date);
  });
  it('isolates enterprise, issuer and principal mappings', async () => {
    expect(
      await new YoulinIdentityAuthorityReader(fixture.db, {
        ...options,
        enterpriseId: 'b',
      }).readUser('principal-a', new AbortController().signal),
    ).toBeNull();
    expect(
      await new YoulinIdentityAuthorityReader(fixture.db, {
        ...options,
        issuer: 'https://other.synthetic',
      }).readUser('principal-a', new AbortController().signal),
    ).toBeNull();
    expect(await reader.readUser('missing', new AbortController().signal)).toBeNull();
  });
  it('fails closed on legacy bans, pending subjects and revoked bindings', async () => {
    await fixture.db.update(users).set({ banned: true }).where(eq(users.id, userId));
    expect((await read())?.disabled).toBe(true);
    await fixture.db.update(users).set({ banned: false }).where(eq(users.id, userId));
    await fixture.db
      .update(youlinSubjects)
      .set({ status: 'pending' })
      .where(eq(youlinSubjects.id, subjectId));
    expect((await read())?.disabled).toBe(true);
    await fixture.db
      .update(youlinSubjects)
      .set({ status: 'active' })
      .where(eq(youlinSubjects.id, subjectId));
    await fixture.db.update(youlinIdentityBindings).set({ status: 'revoked' });
    expect((await read())?.disabled).toBe(true);
  });
  it('honors expiration of temporary bans without weakening persistent subject denial', async () => {
    await fixture.db
      .update(users)
      .set({ banned: true, banExpires: new Date(0) })
      .where(eq(users.id, userId));
    expect((await read())?.disabled).toBe(false);
    await fixture.db
      .update(users)
      .set({ banExpires: new Date('2099-01-01') })
      .where(eq(users.id, userId));
    expect((await read())?.disabled).toBe(true);
    await fixture.db
      .update(users)
      .set({ banExpires: new Date(0) })
      .where(eq(users.id, userId));
    await fixture.db
      .update(youlinSubjects)
      .set({ status: 'disabled' })
      .where(eq(youlinSubjects.id, subjectId));
    expect((await read())?.disabled).toBe(true);
  });

  it('requires HR reconciliation, an effective stage and exact cleanup proof', async () => {
    await fixture.db.update(youlinPersons).set({ requiresReconciliation: true });
    expect((await read())?.disabled).toBe(true);
    await fixture.db.update(youlinPersons).set({ requiresReconciliation: false });
    await fixture.db.update(youlinEmploymentStages).set({ effectiveTo: new Date(0) });
    expect((await read())?.disabled).toBe(true);
    await fixture.db.update(youlinEmploymentStages).set({ effectiveTo: null });
    await fixture.db
      .update(youlinSubjects)
      .set({ idpRevocationConfirmedEpoch: null })
      .where(eq(youlinSubjects.id, subjectId));
    expect((await read())?.disabled).toBe(true);
  });
  it('admits an active matching manual enrollment only when explicitly enabled', async () => {
    await fixture.db.delete(youlinEmploymentStages);
    await fixture.db.delete(youlinPersons);
    await fixture.db.insert(youlinManualEnrollments).values({
      employeeNumber: 'MANUAL-READER-001',
      enterpriseId: 'a',
      status: 'active',
      subjectId,
      userId,
    });
    expect((await read())?.disabled).toBe(true);
    const manualReader = new YoulinIdentityAuthorityReader(fixture.db, {
      ...options,
      allowManualEnrollment: true,
    });
    expect(await manualReader.readUser('principal-a', new AbortController().signal)).toMatchObject({
      disabled: false,
      subjectId,
      userId,
    });
  });
  it('fails closed for pending, disabled and unknown manual status without HR fallback', async () => {
    await fixture.db.insert(youlinManualEnrollments).values({
      employeeNumber: 'MANUAL-READER-002',
      enterpriseId: 'a',
      status: 'pending',
      subjectId,
      userId,
    });
    const manualReader = new YoulinIdentityAuthorityReader(fixture.db, {
      ...options,
      allowManualEnrollment: true,
    });
    expect(
      (await manualReader.readUser('principal-a', new AbortController().signal))?.disabled,
    ).toBe(true);
    await fixture.db.update(youlinManualEnrollments).set({ status: 'disabled' });
    expect(
      (await manualReader.readUser('principal-a', new AbortController().signal))?.disabled,
    ).toBe(true);
    await fixture.pool.query("UPDATE youlin_manual_enrollments SET status = 'unrecognized'");
    expect(
      (await manualReader.readUser('principal-a', new AbortController().signal))?.disabled,
    ).toBe(true);
  });
  it('rejects mixed manual and HR admission sources', async () => {
    await fixture.db.insert(youlinManualEnrollments).values({
      employeeNumber: 'MANUAL-READER-003',
      enterpriseId: 'a',
      status: 'active',
      subjectId,
      userId,
    });
    const manualReader = new YoulinIdentityAuthorityReader(fixture.db, {
      ...options,
      allowManualEnrollment: true,
    });
    expect(
      (await manualReader.readUser('principal-a', new AbortController().signal))?.disabled,
    ).toBe(true);
  });
  it('rejects parallel active employment even if only one stage is effective now', async () => {
    await fixture.db.insert(youlinEmploymentStages).values({
      enterpriseId: 'a',
      personId,
      sourceStageKey: 'stage-b',
      employeeNumber: 'synthetic-002',
      legalEntityCode: 'entity-b',
      status: 'active',
      effectiveFrom: new Date('2099-01-01'),
    });
    expect((await read())?.disabled).toBe(true);
  });
  it('rejects unknown persisted status and exhausted version counters', async () => {
    await fixture.pool.query('UPDATE youlin_employment_stages SET status = $1', ['unrecognized']);
    expect((await read())?.disabled).toBe(true);
    await fixture.db.update(youlinEmploymentStages).set({ status: 'active' });
    await fixture.db
      .update(youlinSubjects)
      .set({ authorityVersion: Number.MAX_SAFE_INTEGER })
      .where(eq(youlinSubjects.id, subjectId));
    expect((await read())?.disabled).toBe(true);
  });
  it('reads committed denial despite an unrelated older repeatable-read snapshot', async () => {
    const actor = await fixture.seedActor('a');
    const revoker = new YoulinIdentityRevocation(fixture.db, {
      actor,
      enabled: true,
      enterpriseId: 'a',
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 2000,
    });
    const stale = await fixture.pool.connect();
    try {
      await stale.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await stale.query('SELECT status FROM youlin_subjects WHERE id=$1', [subjectId]);
      await revoker.revokeSubject('disable', {
        subjectId,
        expectedAuthEpoch: 0,
        reason: 'administrative_disable',
      });
      expect(
        (await stale.query('SELECT status FROM youlin_subjects WHERE id=$1', [subjectId])).rows[0]
          .status,
      ).toBe('active');
      expect(await read()).toMatchObject({ disabled: true, authEpoch: 1 });
    } finally {
      await stale.query('ROLLBACK');
      stale.release();
    }
  });
  it('cannot authenticate a principal through a temporary-table shadow left on pooled sessions', async () => {
    const clients = await Promise.all(Array.from({ length: 4 }, () => fixture.pool.connect()));
    try {
      await Promise.all(
        clients.map(async (client) => {
          await client.query(
            'CREATE TEMP TABLE youlin_identity_bindings AS SELECT * FROM public.youlin_identity_bindings',
          );
          await client.query(
            "UPDATE pg_temp.youlin_identity_bindings SET external_subject = 'unbound-attacker'",
          );
        }),
      );
    } finally {
      clients.forEach((client) => client.release());
    }
    try {
      expect(await reader.readUser('unbound-attacker', new AbortController().signal)).toBeNull();
    } finally {
      const cleanup = await Promise.all(Array.from({ length: 4 }, () => fixture.pool.connect()));
      try {
        await Promise.all(
          cleanup.map((client) =>
            client.query('DROP TABLE IF EXISTS pg_temp.youlin_identity_bindings'),
          ),
        );
      } finally {
        cleanup.forEach((client) => client.release());
      }
    }
  });

  it('rejects borrowed clients/transactions and defaults off', async () => {
    expect(
      () => new YoulinIdentityAuthorityReader(fixture.db, { ...options, enabled: false }),
    ).toThrow('FEATURE_DISABLED');
    await fixture.db.transaction(async (tx) => {
      expect(() => new YoulinIdentityAuthorityReader(tx, options)).toThrow(
        'BORROWED_TRANSACTION_REJECTED',
      );
    });
    const client = await fixture.pool.connect();
    try {
      expect(() => new YoulinIdentityAuthorityReader(drizzle(client), options)).toThrow(
        'POOL_BACKED_DATABASE_REQUIRED',
      );
    } finally {
      client.release();
    }
  });
  it('honors abort and keeps capacity occupied while IO has not unwound', async () => {
    const limited = new YoulinIdentityAuthorityReader(fixture.db, {
      ...options,
      maxConcurrentReads: 1,
    });
    const blocker = await fixture.pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('LOCK TABLE youlin_identity_bindings IN ACCESS EXCLUSIVE MODE');
    const controller = new AbortController();
    try {
      const pending = limited.readUser('principal-a', controller.signal);
      const rejection = expect(pending).rejects.toThrow();
      await vi.waitFor(
        async () => {
          const waiting = await fixture.pool.query(
            "SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%youlin_identity_bindings%'",
          );
          expect(waiting.rows[0].count).toBeGreaterThan(0);
        },
        { timeout: 500, interval: 10 },
      );
      controller.abort();
      await expect(limited.readUser('principal-a', new AbortController().signal)).rejects.toThrow(
        'READER_BUSY',
      );
      await blocker.query('ROLLBACK');
      await rejection;
      expect((await limited.readUser('principal-a', new AbortController().signal))?.disabled).toBe(
        false,
      );
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
  });
});
