import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { users } from '../../../schemas/user';
import { youlinPersons, youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../../schemas/youlinIdentityGovernance';
import { youlinIdentityCommands } from '../../../schemas/youlinIdentityOperations';
import { YoulinIdentityRegistration } from '../registration';
import { createIdentityTestDatabase } from './database';

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('HR-anchored registration', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let registration: YoulinIdentityRegistration;
  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  beforeEach(async () => {
    await fixture.reset();
    const actor = await fixture.seedActor('synthetic-a');
    registration = new YoulinIdentityRegistration(fixture.db, {
      actor,
      enabled: true,
      enterpriseId: 'synthetic-a',
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    await fixture.db.insert(users).values([{ id: 'employee-one' }, { id: 'employee-two' }]);
  });

  it('creates one pending, unreconciled subject with no inherited permissions', async () => {
    const result = await registration.registerPerson('create', {
      personKey: 'stable-hr-1',
      userId: 'employee-one',
    });
    expect(result.status).toBe('created');
    const [person] = await fixture.db.select().from(youlinPersons);
    const [subject] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, person.subjectId));
    expect(person).toMatchObject({
      requiresReconciliation: true,
      source: 'xinrenxinshi',
      sourceVersion: 0,
    });
    expect(subject).toMatchObject({
      authEpoch: 0,
      idpRevocationConfirmedEpoch: null,
      status: 'pending',
      userId: 'employee-one',
    });
    expect(
      await fixture.db
        .select()
        .from(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, subject.id)),
    ).toHaveLength(0);
  });

  it('deduplicates concurrent registration without creating a second natural person', async () => {
    const input = { personKey: 'stable-hr-1', userId: 'employee-one' };
    const [first, second] = await Promise.all([
      registration.registerPerson('a', input),
      registration.registerPerson('b', input),
    ]);
    expect(first).toEqual(second);
    expect(await fixture.db.select().from(youlinPersons)).toHaveLength(1);
  });

  it('does not silently merge two HR anchors into one application account', async () => {
    await registration.registerPerson('a', { personKey: 'stable-hr-1', userId: 'employee-one' });
    await expect(
      registration.registerPerson('b', { personKey: 'stable-hr-2', userId: 'employee-one' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' });
    await expect(
      registration.registerPerson('c', { personKey: 'stable-hr-1', userId: 'employee-two' }),
    ).rejects.toMatchObject({ code: 'HR_ANCHOR_CONFLICT' });
    expect(await fixture.db.select().from(youlinPersons)).toHaveLength(1);
    expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(1);
  });

  it('does not allow cross-enterprise rebinding or reveal the other enterprise', async () => {
    await registration.registerPerson('a', { personKey: 'stable-hr-1', userId: 'employee-one' });
    const actor = await fixture.seedActor('synthetic-b');
    const other = new YoulinIdentityRegistration(fixture.db, {
      actor,
      enabled: true,
      enterpriseId: 'synthetic-b',
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    await expect(
      other.registerPerson('b', { personKey: 'stable-hr-1', userId: 'employee-one' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' });
    expect(await fixture.db.select().from(youlinPersons)).toHaveLength(1);
  });

  it('rejects missing and banned accounts without a partial subject or receipt', async () => {
    await fixture.db.update(users).set({ banned: true }).where(eq(users.id, 'employee-one'));
    for (const userId of ['employee-one', 'missing'])
      await expect(
        registration.registerPerson(userId, { personKey: 'stable-hr-1', userId }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' });
    expect(await fixture.db.select().from(youlinPersons)).toHaveLength(0);
    expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(0);
  });
});
