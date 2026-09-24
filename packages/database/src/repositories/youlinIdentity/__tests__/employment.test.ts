import type { YoulinIdentityActor } from '@lobechat/types';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { users } from '../../../schemas/user';
import {
  youlinEmploymentStages,
  youlinPersons,
  youlinSubjects,
} from '../../../schemas/youlinIdentity';
import { youlinBindingCases } from '../../../schemas/youlinIdentityGovernance';
import { YoulinIdentityEmployment } from '../employment';
import { YoulinIdentityRegistration } from '../registration';
import { createIdentityTestDatabase } from './database';

const active = {
  employeeNumber: 'YY2026001',
  legalEntityCode: 'entity-a',
  sourceStageKey: 'stage-1',
  status: 'active' as const,
};

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('normalized authoritative HR snapshots', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let hr: YoulinIdentityEmployment;
  let actor: YoulinIdentityActor;
  let subjectId: string;
  const options = () => ({
    actor,
    enabled: true,
    enterpriseId: 'a',
    lockTimeoutMs: 1000,
    sqlTimeoutMs: 3000,
  });
  const snapshot = (sourceVersion: number, stages = [active]) => ({
    personKey: 'person-1',
    sourceVersion,
    stages,
  });
  const state = async () =>
    (await fixture.db.select().from(youlinSubjects).where(eq(youlinSubjects.id, subjectId)))[0];
  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  beforeEach(async () => {
    await fixture.reset();
    actor = await fixture.seedActor('a', ['identity:provision', 'identity:sync-hr']);
    await fixture.db.insert(users).values([{ id: 'employee-1' }, { id: 'employee-2' }]);
    const registration = new YoulinIdentityRegistration(fixture.db, options());
    const result = await registration.registerPerson('person-1', {
      personKey: 'person-1',
      userId: 'employee-1',
    });
    if (result.status !== 'created') throw new Error('Expected synthetic registration');
    subjectId = result.subjectId;
    await registration.registerPerson('person-2', { personKey: 'person-2', userId: 'employee-2' });
    hr = new YoulinIdentityEmployment(fixture.db, options());
  });

  it('accepts the first complete snapshot without automatically activating or granting access', async () => {
    expect(await hr.applySnapshot('first', snapshot(1))).toEqual({
      authEpoch: 1,
      status: 'employment_updated',
      subjectId,
    });
    expect(await state()).toMatchObject({
      authEpoch: 1,
      idpRevocationConfirmedEpoch: null,
      status: 'pending',
    });
    const [person] = await fixture.db
      .select()
      .from(youlinPersons)
      .where(eq(youlinPersons.personKey, 'person-1'));
    expect(person).toMatchObject({ requiresReconciliation: false, sourceVersion: 1 });
  });

  it('preserves the natural person/account and ended stages through offboarding and rehire', async () => {
    await hr.applySnapshot('first', snapshot(1));
    await hr.applySnapshot('ended', snapshot(2, []));
    await hr.applySnapshot('rehired', snapshot(3, [{ ...active, sourceStageKey: 'stage-2' }]));
    expect(await state()).toMatchObject({
      authEpoch: 3,
      id: subjectId,
      status: 'disabled',
      userId: 'employee-1',
    });
    const stages = await fixture.db.select().from(youlinEmploymentStages);
    expect(stages).toHaveLength(2);
    expect(stages.find((stage) => stage.sourceStageKey === 'stage-1')?.status).toBe('ended');
    expect(stages.find((stage) => stage.sourceStageKey === 'stage-2')?.status).toBe('active');
  });

  it('does not rotate credentials for an unchanged snapshot with a newer source revision', async () => {
    await hr.applySnapshot('first', snapshot(1));
    await hr.applySnapshot('observed', snapshot(2));
    expect((await state()).authEpoch).toBe(1);
  });

  it('normalizes equivalent timestamps and stage order before hashing', async () => {
    const stages = [
      { ...active, effectiveFrom: '2026-01-01T08:00:00+08:00' },
      { ...active, sourceStageKey: 'history', status: 'ended' },
    ];
    await hr.applySnapshot('first', { personKey: 'person-1', sourceVersion: 1, stages });
    await hr.applySnapshot('same', {
      personKey: 'person-1',
      sourceVersion: 2,
      stages: [stages[1], { ...stages[0], effectiveFrom: '2026-01-01T00:00:00Z' }],
    });
    expect((await state()).authEpoch).toBe(1);
  });

  it('rejects stale revisions and quarantines contradictory content at the same revision', async () => {
    await hr.applySnapshot('first', snapshot(2));
    await expect(hr.applySnapshot('stale', snapshot(1))).rejects.toMatchObject({
      code: 'STALE_SOURCE_VERSION',
    });
    const conflict = await hr.applySnapshot(
      'contradiction',
      snapshot(2, [{ ...active, employeeNumber: 'YY2026999' }]),
    );
    expect(conflict.status).toBe('conflict');
    expect(
      await hr.applySnapshot(
        'repeat-contradiction',
        snapshot(2, [{ ...active, employeeNumber: 'YY2026999' }]),
      ),
    ).toEqual(conflict);
    expect((await state()).authEpoch).toBe(2);
    const [stage] = await fixture.db.select().from(youlinEmploymentStages);
    expect(stage.employeeNumber).toBe('YY2026001');
    const [person] = await fixture.db
      .select()
      .from(youlinPersons)
      .where(eq(youlinPersons.personKey, 'person-1'));
    expect(person.requiresReconciliation).toBe(true);
  });

  it('does not resurrect an ended stage by reusing its old stage key', async () => {
    await hr.applySnapshot('first', snapshot(1));
    await hr.applySnapshot('ended', snapshot(2, []));
    expect((await hr.applySnapshot('bad-rehire', snapshot(3))).status).toBe('conflict');
    expect((await state()).status).toBe('disabled');
    const [conflict] = await fixture.db.select().from(youlinBindingCases);
    expect(conflict.reason).toBe('employment_history_mismatch');
  });

  it('quarantines unapproved parallel employment without choosing an arbitrary winner', async () => {
    expect(
      (
        await hr.applySnapshot(
          'parallel',
          snapshot(1, [
            active,
            { ...active, sourceStageKey: 'stage-2', legalEntityCode: 'entity-b' },
          ]),
        )
      ).status,
    ).toBe('conflict');
    expect(await fixture.db.select().from(youlinEmploymentStages)).toHaveLength(0);
  });

  it('serializes competing employee keys and quarantines exactly one candidate', async () => {
    const results = await Promise.all([
      hr.applySnapshot('a', snapshot(1)),
      hr.applySnapshot('b', { ...snapshot(1), personKey: 'person-2' }),
    ]);
    expect(results.filter((result) => result.status === 'employment_updated')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'conflict')).toHaveLength(1);
    expect(await fixture.db.select().from(youlinEmploymentStages)).toHaveLength(1);
    expect(await fixture.db.select().from(youlinPersons)).toHaveLength(2);
  });

  it('isolates enterprise anchors even for a privileged HR service', async () => {
    const other = await fixture.seedActor('b', ['identity:sync-hr']);
    const foreign = new YoulinIdentityEmployment(fixture.db, {
      ...options(),
      actor: other,
      enterpriseId: 'b',
    });
    await expect(foreign.applySnapshot('foreign', snapshot(1))).rejects.toMatchObject({
      code: 'PERSON_UNAVAILABLE',
    });
  });

  it('does not let ordinary provisioning permission or a human account impersonate the HR service', async () => {
    const provisioner = await fixture.seedActor('a', ['identity:provision']);
    await expect(
      new YoulinIdentityEmployment(fixture.db, { ...options(), actor: provisioner }).applySnapshot(
        'wrong-role',
        snapshot(1),
      ),
    ).rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
    const human = await fixture.seedActor('a', ['identity:sync-hr'], true);
    await expect(
      new YoulinIdentityEmployment(fixture.db, { ...options(), actor: human }).applySnapshot(
        'human',
        snapshot(1),
      ),
    ).rejects.toMatchObject({ code: 'PRIVATE_SERVICE_REQUIRED' });
  });
});
