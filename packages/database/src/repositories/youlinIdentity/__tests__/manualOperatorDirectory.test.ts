import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { users } from '../../../schemas/user';
import { youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinManualEnrollments } from '../../../schemas/youlinManualEnrollment';
import { YoulinManualOperatorDirectory } from '../manualOperatorDirectory';
import { createIdentityTestDatabase } from './database';

// All shard files share one disposable database. Never truncate or assert global row counts here.
const ENTERPRISE = `directory-${randomUUID()}`;
let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;

beforeAll(async () => {
  fixture = await createIdentityTestDatabase();
});
afterAll(async () => {
  await fixture?.close();
});

const directory = (actor: { authEpoch: number; subjectId: string }) =>
  new YoulinManualOperatorDirectory(fixture.db, { actor, enterpriseId: ENTERPRISE });

const seedManualUser = async (employeeNumber: string) => {
  const userId = `directory-${randomUUID()}`;
  const subjectId = randomUUID();
  await fixture.db.insert(users).values({ email: `${userId}@example.invalid`, id: userId });
  await fixture.db.insert(youlinSubjects).values({
    enterpriseId: ENTERPRISE,
    id: subjectId,
    kind: 'user',
    status: 'active',
    userId,
  });
  await fixture.db.insert(youlinManualEnrollments).values({
    employeeNumber,
    enterpriseId: ENTERPRISE,
    status: 'active',
    subjectId,
    userId,
  });
  return { subjectId, userId };
};

describe('manually enrolled directory (real PostgreSQL)', () => {
  it('lists only its enterprise and returns exact user lookup with version fields', async () => {
    const actor = await fixture.seedActor(ENTERPRISE, ['identity:read'], true);
    await expect(directory(actor).canProvision()).rejects.toThrow('ACTOR_NOT_AUTHORIZED');
    const provisioner = await fixture.seedActor(ENTERPRISE, ['identity:provision'], true);
    expect(await directory(provisioner).canProvision()).toBe(true);
    const own = await seedManualUser('DIRECTORY-001');
    const foreign = `foreign-${randomUUID()}`;
    await fixture.db.insert(users).values({ id: foreign });
    await fixture.db.insert(youlinSubjects).values({
      enterpriseId: 'other-enterprise',
      id: randomUUID(),
      kind: 'user',
      status: 'active',
      userId: foreign,
    });
    const result = await directory(actor).list({ userId: own.userId });
    expect(result).toMatchObject({
      items: [
        {
          authEpoch: 0,
          authorityVersion: 0,
          employeeNumber: 'DIRECTORY-001',
          status: 'active',
          subjectId: own.subjectId,
          userId: own.userId,
        },
      ],
      nextCursor: null,
    });
    expect((await directory(actor).list({ employeeNumber: 'DIRECTORY-001' })).items).toHaveLength(
      1,
    );
    expect((await directory(actor).list({ userId: foreign })).items).toEqual([]);
  });

  it('rejects an actor without read permission and an actor using a stale epoch', async () => {
    const actor = await fixture.seedActor(ENTERPRISE, ['identity:model-governance'], true);
    await expect(directory(actor).list({})).rejects.toThrow('ACTOR_NOT_AUTHORIZED');
    const reader = await fixture.seedActor(ENTERPRISE, ['identity:read'], true);
    await expect(
      directory({ ...reader, authEpoch: reader.authEpoch + 1 }).list({}),
    ).rejects.toThrow('ACTOR_NOT_AUTHORIZED');
  });

  it('refuses a disabled actor and an actor with a banned application user', async () => {
    const disabled = await fixture.seedActor(ENTERPRISE, ['identity:read'], true);
    await fixture.db
      .update(youlinSubjects)
      .set({ status: 'disabled' })
      .where(eq(youlinSubjects.id, disabled.subjectId));
    await expect(directory(disabled).list({})).rejects.toThrow('ACTOR_NOT_AUTHORIZED');

    const banned = await fixture.seedActor(ENTERPRISE, ['identity:read'], true);
    await fixture.db
      .update(users)
      .set({ banned: true })
      .where(eq(users.id, `synthetic-${banned.subjectId}`));
    await expect(directory(banned).list({})).rejects.toThrow('ACTOR_NOT_AUTHORIZED');
  });

  it('validates the cursor before accessing authority data', async () => {
    const actor = await fixture.seedActor(ENTERPRISE, ['identity:read'], true);
    expect(() => directory(actor).list({ cursor: 'not-a-uuid' })).toThrow(
      'INVALID_DIRECTORY_FILTER',
    );
  });
});
