import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { users } from '../../../schemas/user';
import {
  youlinEmploymentStages,
  youlinIdentityBindings,
  youlinPersons,
  youlinSubjects,
} from '../../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../../schemas/youlinIdentityGovernance';
import { createIdentityTestDatabase } from './database';

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('generated identity schema integrity', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let subjectId: string;
  let personId: string;
  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  beforeEach(async () => {
    await fixture.reset();
    subjectId = randomUUID();
    personId = randomUUID();
    await fixture.db.insert(users).values({ id: 'synthetic-person-account' });
    await fixture.db
      .insert(youlinSubjects)
      .values({
        enterpriseId: 'a',
        id: subjectId,
        kind: 'user',
        userId: 'synthetic-person-account',
      });
    await fixture.db
      .insert(youlinPersons)
      .values({
        enterpriseId: 'a',
        id: personId,
        personKey: 'person-1',
        source: 'xinrenxinshi',
        subjectId,
      });
  });

  it('rejects cross-enterprise bindings and grants at the database boundary', async () => {
    await expect(
      fixture.db
        .insert(youlinIdentityBindings)
        .values({
          enterpriseId: 'b',
          externalSubject: 'sub',
          issuer: 'https://idp.example.invalid',
          subjectId,
        }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await expect(
      fixture.db
        .insert(youlinIdentityGrants)
        .values({ authEpoch: 0, enterpriseId: 'b', permission: 'identity:read', subjectId }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('reserves a principal globally, even after its binding is revoked', async () => {
    const principal = {
      enterpriseId: 'a',
      externalSubject: 'sub',
      issuer: 'https://idp.example.invalid',
      subjectId,
    };
    await fixture.db.insert(youlinIdentityBindings).values({ ...principal, status: 'revoked' });
    await expect(fixture.db.insert(youlinIdentityBindings).values(principal)).rejects.toMatchObject(
      { cause: { code: '23505' } },
    );
  });

  it('enforces current legal-entity employee-number uniqueness without guessing global uniqueness', async () => {
    const stage = {
      employeeNumber: 'YY2026001',
      enterpriseId: 'a',
      legalEntityCode: 'entity-a',
      personId,
      sourceStageKey: 'first',
      status: 'active' as const,
    };
    await fixture.db.insert(youlinEmploymentStages).values(stage);
    await expect(
      fixture.db.insert(youlinEmploymentStages).values({ ...stage, sourceStageKey: 'duplicate' }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    await fixture.db
      .insert(youlinEmploymentStages)
      .values({ ...stage, legalEntityCode: 'entity-b', sourceStageKey: 'other-entity' });
    await fixture.db
      .insert(youlinEmploymentStages)
      .values({ ...stage, sourceStageKey: 'history', status: 'ended' });
    expect(await fixture.db.select().from(youlinEmploymentStages)).toHaveLength(3);
  });
});
