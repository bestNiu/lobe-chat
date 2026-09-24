import type { YoulinBindingProposal, YoulinIdentityActor } from '@lobechat/types';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { users } from '../../../schemas/user';
import {
  youlinEmploymentStages,
  youlinIdentityBindings,
  youlinSubjects,
} from '../../../schemas/youlinIdentity';
import { youlinBindingCases } from '../../../schemas/youlinIdentityGovernance';
import { YoulinIdentityBinding } from '../binding';
import { YoulinIdentityEmployment } from '../employment';
import { YoulinIdentityRegistration } from '../registration';
import { createIdentityTestDatabase } from './database';

const issuer = 'https://idp.example.invalid/realms/synthetic';

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('HR anchored principal binding', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let actor: YoulinIdentityActor;
  let binding: YoulinIdentityBinding;
  let first: YoulinBindingProposal;
  let second: YoulinBindingProposal;
  const options = () => ({
    actor,
    allowedIssuers: [issuer],
    enabled: true,
    enterpriseId: 'a',
    lockTimeoutMs: 1000,
    sqlTimeoutMs: 3000,
  });
  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  beforeEach(async () => {
    await fixture.reset();
    actor = await fixture.seedActor('a', [
      'identity:provision',
      'identity:sync-hr',
      'identity:bind',
    ]);
    const registration = new YoulinIdentityRegistration(fixture.db, options());
    const hr = new YoulinIdentityEmployment(fixture.db, options());
    const proposals: YoulinBindingProposal[] = [];
    for (const suffix of ['1', '2']) {
      const personKey = `person-${suffix}`;
      const userId = `employee-${suffix}`;
      await fixture.db.insert(users).values({ id: userId });
      const result = await registration.registerPerson(personKey, { personKey, userId });
      if (result.status !== 'created') throw new Error('Expected synthetic subject');
      await hr.applySnapshot(personKey, {
        personKey,
        sourceVersion: 1,
        stages: [
          {
            employeeNumber: `YY202600${suffix}`,
            legalEntityCode: 'entity-a',
            sourceStageKey: 'first',
            status: 'active',
          },
        ],
      });
      proposals.push({
        externalSubject: 'principal',
        issuer,
        legalEntityCode: 'entity-a',
        personKey,
        subjectId: result.subjectId,
      });
    }
    [first, second] = proposals;
    binding = new YoulinIdentityBinding(fixture.db, options());
  });

  it('links a verified service proposal but invalidates credentials and never activates the employee', async () => {
    const result = await binding.propose('bind', first);
    expect(result.status).toBe('linked');
    const [subject] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, first.subjectId));
    expect(subject).toMatchObject({
      authEpoch: 2,
      idpRevocationConfirmedEpoch: null,
      status: 'pending',
    });
    expect(await binding.propose('same-mapping', first)).toEqual(result);
    expect(await fixture.db.select().from(youlinIdentityBindings)).toHaveLength(1);
    const [unchanged] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, first.subjectId));
    expect(unchanged.authEpoch).toBe(2);
  });

  it('serializes two candidates for the same principal without overwriting the first mapping', async () => {
    const results = await Promise.all([binding.propose('a', first), binding.propose('b', second)]);
    expect(results.filter((result) => result.status === 'linked')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'conflict')).toHaveLength(1);
    const [mapping] = await fixture.db.select().from(youlinIdentityBindings);
    const linked = results.find((result) => result.status === 'linked');
    expect(mapping.subjectId).toBe(linked?.subjectId);
    const [candidate] = await fixture.db.select().from(youlinBindingCases);
    expect(candidate.reason).toBe('principal_in_use');
  });

  it('routes human proposals to review without creating a binding', async () => {
    const human = await fixture.seedActor('a', ['identity:bind'], true);
    const manual = new YoulinIdentityBinding(fixture.db, { ...options(), actor: human });
    expect((await manual.propose('manual', first)).status).toBe('review_required');
    expect(await fixture.db.select().from(youlinIdentityBindings)).toHaveLength(0);
  });

  it.each(['same-owner', 'other-owner'])(
    'requires human review of an existing %s reservation without changing it',
    async (owner) => {
      await binding.propose('service-binding', first);
      const mappings = await fixture.db.select().from(youlinIdentityBindings);
      const subjects = await fixture.db
        .select()
        .from(youlinSubjects)
        .where(eq(youlinSubjects.id, first.subjectId));
      const human = await fixture.seedActor('a', ['identity:bind'], true);
      const manual = new YoulinIdentityBinding(fixture.db, { ...options(), actor: human });
      const proposal = owner === 'same-owner' ? first : second;
      const result = await manual.propose('manual-existing', proposal);
      expect(result.status).toBe('review_required');
      expect(await manual.propose('manual-existing', proposal)).toEqual(result);
      const cases = await fixture.db.select().from(youlinBindingCases);
      expect(cases).toHaveLength(1);
      expect(cases[0]).toMatchObject({
        status: 'pending',
        submitterId: human.subjectId,
        subjectId: proposal.subjectId,
      });
      expect(await fixture.db.select().from(youlinIdentityBindings)).toEqual(mappings);
      expect(
        await fixture.db
          .select()
          .from(youlinSubjects)
          .where(eq(youlinSubjects.id, first.subjectId)),
      ).toEqual(subjects);
    },
  );

  it('rejects mismatched HR persons and legal entities instead of trusting the requested anchor', async () => {
    await expect(
      binding.propose('wrong-person', { ...first, personKey: second.personKey }),
    ).rejects.toMatchObject({ code: 'HR_ANCHOR_MISMATCH' });
    await expect(
      binding.propose('wrong-entity', { ...first, legalEntityCode: 'entity-b' }),
    ).rejects.toMatchObject({ code: 'HR_ANCHOR_MISMATCH' });
    expect(await fixture.db.select().from(youlinIdentityBindings)).toHaveLength(0);
  });

  it('rejects an expired employment stage even when the stored stage status says active', async () => {
    await fixture.db
      .update(youlinEmploymentStages)
      .set({ effectiveTo: new Date('2000-01-01T00:00:00Z') });
    await expect(binding.propose('expired', first)).rejects.toMatchObject({
      code: 'HR_ANCHOR_MISMATCH',
    });
  });

  it('rejects unregistered issuers before creating a mapping', async () => {
    await expect(
      binding.propose('issuer', { ...first, issuer: 'https://other.example.invalid' }),
    ).rejects.toMatchObject({ code: 'UNTRUSTED_ISSUER' });
  });

  it('cannot use a foreign enterprise subject even with a bind grant', async () => {
    const foreignActor = await fixture.seedActor('b', ['identity:bind']);
    const foreign = new YoulinIdentityBinding(fixture.db, {
      ...options(),
      actor: foreignActor,
      enterpriseId: 'b',
    });
    await expect(foreign.propose('foreign', first)).rejects.toMatchObject({
      code: 'SUBJECT_UNAVAILABLE',
    });
  });
});
