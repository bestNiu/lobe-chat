import type { YoulinIdentityActor } from '@lobechat/types';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../../schemas/youlinIdentityGovernance';
import {
  youlinIdentityAuditEvents,
  youlinIdentityCommands,
  youlinIdentityOutbox,
} from '../../../schemas/youlinIdentityOperations';
import { YoulinIdentityRevocation } from '../revocation';
import { createIdentityTestDatabase } from './database';

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('persistent identity revocation', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let revocation: YoulinIdentityRevocation;
  let target: YoulinIdentityActor;
  const request = () => ({
    expectedAuthEpoch: target.authEpoch,
    reason: 'administrative_disable',
    subjectId: target.subjectId,
  });
  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  beforeEach(async () => {
    await fixture.reset();
    const actor = await fixture.seedActor('synthetic-a');
    target = await fixture.seedActor('synthetic-a');
    revocation = new YoulinIdentityRevocation(fixture.db, {
      actor,
      enabled: true,
      enterpriseId: 'synthetic-a',
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
  });

  it('atomically denies, increments epoch, removes grants and persists durable provider intent', async () => {
    await fixture.db
      .update(youlinSubjects)
      .set({ idpRevocationConfirmedEpoch: 0 })
      .where(eq(youlinSubjects.id, target.subjectId));
    const result = await revocation.revokeSubject('revoke', request());
    expect(result).toEqual({ authEpoch: 1, status: 'revoked', subjectId: target.subjectId });
    const [subject] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, target.subjectId));
    expect(subject).toMatchObject({
      authEpoch: 1,
      authorityVersion: 1,
      idpRevocationConfirmedEpoch: null,
      status: 'disabled',
    });
    expect(
      await fixture.db
        .select()
        .from(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, target.subjectId)),
    ).toHaveLength(0);
    const [audit] = await fixture.db.select().from(youlinIdentityAuditEvents);
    expect(audit.detail).toEqual({
      authEpoch: 1,
      needsCredentialRevocation: true,
      reason: 'administrative_disable',
    });
    expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(1);
    expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(1);
    expect(await revocation.revokeSubject('revoke', request())).toEqual(result);
  });

  it('serializes competing CAS commands: only one advances the target epoch', async () => {
    const results = await Promise.allSettled([
      revocation.revokeSubject('a', request()),
      revocation.revokeSubject('b', request()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'EPOCH_CONFLICT' },
    });
    expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(1);
  });

  it('cannot revoke another enterprise subject', async () => {
    target = await fixture.seedActor('synthetic-b');
    await expect(revocation.revokeSubject('foreign', request())).rejects.toMatchObject({
      code: 'SUBJECT_UNAVAILABLE',
    });
    const [subject] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, target.subjectId));
    expect(subject.status).toBe('active');
    expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(0);
  });

  it('fails closed at epoch exhaustion rather than overflowing or leaving access active', async () => {
    await fixture.db
      .update(youlinSubjects)
      .set({ authEpoch: Number.MAX_SAFE_INTEGER, authorityVersion: Number.MAX_SAFE_INTEGER })
      .where(eq(youlinSubjects.id, target.subjectId));
    target.authEpoch = Number.MAX_SAFE_INTEGER;
    await revocation.revokeSubject('exhausted', request());
    const [subject] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, target.subjectId));
    expect(subject).toMatchObject({
      authEpoch: Number.MAX_SAFE_INTEGER,
      authorityVersion: Number.MAX_SAFE_INTEGER,
      status: 'disabled',
    });
    expect(
      await fixture.db
        .select()
        .from(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, target.subjectId)),
    ).toHaveLength(0);
  });
});
