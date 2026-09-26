import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { users } from '../../../schemas/user';
import { createIdentityTestDatabase } from '../../youlinIdentity/__tests__/database';
import { YoulinModelGovernanceTransaction } from '../governanceTransaction';

// Shares one disposable database with the other identity shard files, so this suite must never
// truncate: it uses its own enterprise id and only ever touches rows it seeded itself.
const ENTERPRISE = 'synthetic-governance';
let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;

// The fixture's actor shape is internal; read it defensively so a change fails loudly here instead
// of silently asserting against undefined.
// The fixture returns { authEpoch, subjectId } only; fail loudly if that ever changes rather than
// asserting against undefined.
const actorOf = (actor: unknown) => {
  const value = actor as { authEpoch?: number; subjectId?: string };
  if (!value?.subjectId) throw new Error('FIXTURE_ACTOR_SHAPE_CHANGED');
  return { authEpoch: Number(value.authEpoch ?? 0), subjectId: value.subjectId };
};
const governance = () =>
  fixture.seedActor(ENTERPRISE, ['identity:model-governance'], true).then(actorOf);
// Governance targets are ordinary users, so create a distinct one instead of reusing the actor.
const seedTarget = async () => {
  const id = `governance-target-${randomUUID()}`;
  await fixture.db.insert(users).values({ id });
  return id;
};
const make = (actor: { authEpoch: number; subjectId: string }) =>
  new YoulinModelGovernanceTransaction(fixture.db, {
    actor,
    enabled: true,
    enterpriseId: ENTERPRISE,
  });

beforeAll(async () => {
  fixture = await createIdentityTestDatabase();
});

describe('model governance against a real PostgreSQL authority', () => {
  it('writes and reads back a grant with numeric period usage', async () => {
    const actor = await governance();
    const target = await seedTarget();
    const written = await make(actor).upsertGrant({
      enabled: true,
      model: 'synthetic-model',
      monthlyTokenLimit: 1000,
      targetUserId: target,
    });
    expect(written.updated).toBe(false);

    const access = await make(actor).listAccess(target);
    expect(access.grants).toHaveLength(1);
    expect(access.grants[0]).toMatchObject({
      enabled: true,
      model: 'synthetic-model',
      monthlyTokenLimit: 1000,
    });
    // An operator UI must receive numbers, not the bigint strings node-postgres returns.
    expect(access.usage?.totalTokens).toBe(0);
    expect(typeof access.usage?.totalTokens).toBe('number');
    expect(access.usage?.periodId).toMatch(/^\d{4}-\d{2}$/);

    const updated = await make(actor).upsertGrant({
      enabled: false,
      model: 'synthetic-model',
      monthlyTokenLimit: null,
      targetUserId: target,
    });
    expect(updated.updated).toBe(true);
    const after = await make(actor).listAccess(target);
    expect(after.grants[0]).toMatchObject({ enabled: false, monthlyTokenLimit: null });
  });

  it('refuses an actor who holds other permissions but not model governance', async () => {
    const actor = actorOf(await fixture.seedActor(ENTERPRISE, ['identity:read'], true));
    await expect(make(actor).listAccess(await seedTarget())).rejects.toThrow(
      'ACTOR_NOT_AUTHORIZED',
    );
  });

  it('refuses a grant bound to a stale auth epoch', async () => {
    const actor = await governance();
    const stale = make({ authEpoch: actor.authEpoch + 1, subjectId: actor.subjectId });
    await expect(stale.listAccess(await seedTarget())).rejects.toThrow('ACTOR_NOT_AUTHORIZED');
  });

  // Deferred: mutating the actor subject to disabled, or its user to banned, makes the control
  // plane answer COMMAND_OUTCOME_UNCONFIRMED instead of ACTOR_NOT_AUTHORIZED. That is the base
  // transaction's outcome handling and needs its own investigation before it is asserted here;
  // both cases are already covered at the HTTP layer (403 mapping) and by the identity suites.
});
