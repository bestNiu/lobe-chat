import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { users } from '../../../schemas/user';
import {
  youlinIdentityBindings,
  youlinPersons,
  youlinSubjects,
} from '../../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../../schemas/youlinIdentityGovernance';
import {
  youlinIdentityAuditEvents,
  youlinIdentityCommands,
  youlinIdentityOutbox,
} from '../../../schemas/youlinIdentityOperations';
import { youlinManualEnrollments } from '../../../schemas/youlinManualEnrollment';
import { YoulinIdentityManualEnrollment } from '../manualEnrollment';
import { createIdentityTestDatabase } from './database';

const enterpriseId = 'synthetic-a';
const issuer = 'https://idp.synthetic';

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('manual identity enrollment', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let enrollment: YoulinIdentityManualEnrollment;

  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  beforeEach(async () => {
    await fixture.reset();
    const actor = await fixture.seedActor(enterpriseId);
    enrollment = new YoulinIdentityManualEnrollment(fixture.db, {
      actor,
      allowedIssuers: [issuer],
      enabled: true,
      enterpriseId,
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    await fixture.db.insert(users).values([{ id: 'manual-user-a' }, { id: 'manual-user-b' }]);
  });

  const reserve = () =>
    enrollment.reserve('reserve-a', {
      employeeNumber: 'MANUAL-001',
      userId: 'manual-user-a',
    });

  it('reserves a new pending subject without inventing HR facts or grants', async () => {
    const result = await reserve();
    const [row] = await fixture.db.select().from(youlinManualEnrollments);
    const [subject] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, result.subjectId));
    expect(row).toMatchObject({
      employeeNumber: 'MANUAL-001',
      enterpriseId,
      status: 'pending',
      subjectId: result.subjectId,
      userId: 'manual-user-a',
    });
    expect(subject).toMatchObject({ status: 'pending', userId: 'manual-user-a' });
    expect(await fixture.db.select().from(youlinPersons)).toHaveLength(0);
    expect(
      await fixture.db
        .select()
        .from(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, result.subjectId)),
    ).toHaveLength(0);
    expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(1);
    expect(await fixture.db.select().from(youlinIdentityAuditEvents)).toHaveLength(1);
    expect((await fixture.db.select().from(youlinIdentityAuditEvents))[0].detail).toEqual({
      authEpoch: 0,
      needsCredentialRevocation: true,
    });
    expect(result).toHaveProperty('revocationEventId');
    expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(1);
  });

  it('atomically provisions a canonical native account without adopting by email', async () => {
    const result = await enrollment.reserve('new-account', {
      displayName: 'Manual Person',
      email: 'PERSON@EXAMPLE.COM',
      employeeNumber: 'EMPLOYEE-09',
    });
    const [created] = await fixture.db
      .select()
      .from(users)
      .where(eq(users.username, 'employee-09'));
    expect(created).toMatchObject({
      email: 'person@example.com',
      emailVerified: false,
      fullName: 'Manual Person',
      normalizedEmail: 'person@example.com',
    });
    expect(created.id).not.toBe('manual-user-a');
    expect(
      (
        await fixture.db
          .select()
          .from(youlinSubjects)
          .where(eq(youlinSubjects.id, result.subjectId))
      )[0],
    ).toMatchObject({ status: 'pending', userId: created.id });

    await expect(
      enrollment.reserve('duplicate-email', {
        email: 'person@example.com',
        employeeNumber: 'EMPLOYEE-10',
      }),
    ).rejects.toMatchObject({ code: 'COMMAND_OUTCOME_UNCONFIRMED' });
    expect(await fixture.db.select().from(youlinManualEnrollments)).toHaveLength(1);
  });

  it('replays the receipt, rejects changed input, and rolls failed work back as a bundle', async () => {
    const first = await reserve();
    expect(await reserve()).toEqual(first);
    await expect(
      enrollment.reserve('reserve-a', {
        employeeNumber: 'MANUAL-002',
        userId: 'manual-user-b',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      enrollment.activate('activation-fails', {
        expectedAuthEpoch: 0,
        expectedAuthorityVersion: 0,
        subjectId: first.subjectId,
      }),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_CLEANUP_REQUIRED' });
    const [subject] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, first.subjectId));
    expect(subject).toMatchObject({ authorityVersion: 0, status: 'pending' });
    expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(1);
    expect(await fixture.db.select().from(youlinIdentityAuditEvents)).toHaveLength(1);
    expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(1);
  });

  it('requires current fences, cleanup proof, a trusted binding and the same tenant', async () => {
    const reserved = await reserve();
    await fixture.db
      .update(youlinSubjects)
      .set({ idpRevocationConfirmedEpoch: 0 })
      .where(eq(youlinSubjects.id, reserved.subjectId));
    await expect(
      enrollment.activate('no-binding', {
        expectedAuthEpoch: 0,
        expectedAuthorityVersion: 0,
        subjectId: reserved.subjectId,
      }),
    ).rejects.toMatchObject({ code: 'TRUSTED_BINDING_REQUIRED' });
    await fixture.db.insert(youlinIdentityBindings).values({
      enterpriseId,
      externalSubject: 'manual-principal',
      issuer,
      subjectId: reserved.subjectId,
    });
    await fixture.db.insert(youlinIdentityBindings).values({
      enterpriseId,
      externalSubject: 'unexpected-second-principal',
      issuer: 'https://other.synthetic',
      subjectId: reserved.subjectId,
    });
    await expect(
      enrollment.activate('ambiguous', {
        expectedAuthEpoch: 0,
        expectedAuthorityVersion: 0,
        subjectId: reserved.subjectId,
      }),
    ).rejects.toMatchObject({ code: 'TRUSTED_BINDING_REQUIRED' });
    await fixture.db
      .delete(youlinIdentityBindings)
      .where(eq(youlinIdentityBindings.externalSubject, 'unexpected-second-principal'));
    await expect(
      enrollment.activate('stale', {
        expectedAuthEpoch: 0,
        expectedAuthorityVersion: 1,
        subjectId: reserved.subjectId,
      }),
    ).rejects.toMatchObject({ code: 'SUBJECT_VERSION_CONFLICT' });
    const foreignActor = await fixture.seedActor('synthetic-b');
    const foreign = new YoulinIdentityManualEnrollment(fixture.db, {
      actor: foreignActor,
      allowedIssuers: [issuer],
      enabled: true,
      enterpriseId: 'synthetic-b',
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    await expect(
      foreign.activate('foreign', {
        expectedAuthEpoch: 0,
        expectedAuthorityVersion: 0,
        subjectId: reserved.subjectId,
      }),
    ).rejects.toMatchObject({ code: 'SUBJECT_UNAVAILABLE' });
  });

  it('activates without adding grants, then disables monotonically without restoring them', async () => {
    const reserved = await reserve();
    await fixture.db
      .update(youlinSubjects)
      .set({ idpRevocationConfirmedEpoch: 0 })
      .where(eq(youlinSubjects.id, reserved.subjectId));
    await fixture.db.insert(youlinIdentityBindings).values({
      enterpriseId,
      externalSubject: 'manual-principal',
      issuer,
      subjectId: reserved.subjectId,
    });
    expect(
      await enrollment.activate('activate', {
        expectedAuthEpoch: 0,
        expectedAuthorityVersion: 0,
        subjectId: reserved.subjectId,
      }),
    ).toEqual({ authEpoch: 0, status: 'activated', subjectId: reserved.subjectId });
    const [activated] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, reserved.subjectId));
    expect(activated).toMatchObject({
      authorityVersion: 1,
      idpRevocationConfirmedEpoch: 0,
      status: 'active',
    });
    expect(
      await fixture.db
        .select()
        .from(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, reserved.subjectId)),
    ).toHaveLength(0);
    await fixture.db.insert(youlinIdentityGrants).values({
      authEpoch: 0,
      enterpriseId,
      permission: 'identity:read',
      subjectId: reserved.subjectId,
    });
    await enrollment.disable('disable', {
      expectedAuthEpoch: 0,
      expectedAuthorityVersion: 1,
      subjectId: reserved.subjectId,
    });
    const [subject] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, reserved.subjectId));
    const [row] = await fixture.db.select().from(youlinManualEnrollments);
    expect(subject).toMatchObject({
      authEpoch: 1,
      authorityVersion: 2,
      idpRevocationConfirmedEpoch: null,
      status: 'disabled',
    });
    expect(row.status).toBe('disabled');
    expect(
      await fixture.db
        .select()
        .from(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, reserved.subjectId)),
    ).toHaveLength(0);
  });

  it('keeps employee numbers permanently reserved, including disabled rows', async () => {
    const reserved = await reserve();
    await enrollment.disable('disable-pending', {
      expectedAuthEpoch: 0,
      expectedAuthorityVersion: 0,
      subjectId: reserved.subjectId,
    });
    await expect(
      enrollment.reserve('reserve-b', {
        employeeNumber: 'MANUAL-001',
        userId: 'manual-user-b',
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' });
    expect(await fixture.db.select().from(youlinManualEnrollments)).toHaveLength(1);
  });

  it('enforces the current actor permission contract', async () => {
    const actor = await fixture.seedActor(enterpriseId, []);
    const unauthorized = new YoulinIdentityManualEnrollment(fixture.db, {
      actor,
      allowedIssuers: [issuer],
      enabled: true,
      enterpriseId,
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    await expect(
      unauthorized.reserve('unauthorized', {
        employeeNumber: 'MANUAL-999',
        userId: 'manual-user-a',
      }),
    ).rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
    expect(await fixture.db.select().from(youlinManualEnrollments)).toHaveLength(0);
  });
});
