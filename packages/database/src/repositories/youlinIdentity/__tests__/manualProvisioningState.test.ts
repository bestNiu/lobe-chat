import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../../../schemas/betterAuth';
import { users } from '../../../schemas/user';
import { youlinPersons, youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinManualEnrollments } from '../../../schemas/youlinManualEnrollment';
import { YoulinIdentityManualEnrollment } from '../manualEnrollment';
import { YoulinIdentityManualPrincipalLink } from '../manualPrincipalLink';
import { YoulinManualProvisioningStateReader } from '../manualProvisioningState';
import { createIdentityTestDatabase } from './database';

const issuer = 'https://idp.synthetic/realms/manual';
const enterpriseId = 'manual-state';
describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('manual provisioning state projection', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let subjectId: string;
  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => fixture?.close());
  beforeEach(async () => {
    await fixture.reset();
    const actor = await fixture.seedActor(
      enterpriseId,
      ['identity:provision', 'identity:bind'],
      true,
    );
    await fixture.db.insert(users).values({ id: 'projection-user' });
    const options = { actor, enabled: true, enterpriseId, lockTimeoutMs: 1000, sqlTimeoutMs: 3000 };
    const result = await new YoulinIdentityManualEnrollment(fixture.db, {
      ...options,
      allowedIssuers: [issuer],
    }).reserve('reserve', { employeeNumber: 'PROJECTION-01', userId: 'projection-user' });
    subjectId = result.subjectId;
    await new YoulinIdentityManualPrincipalLink(fixture.db, { ...options, issuer }).link('link', {
      expectedAuthEpoch: 0,
      expectedAuthorityVersion: 0,
      subjectId,
      issuer,
      externalSubject: '00000000-0000-4000-8000-000000000911',
    });
  });
  it('projects the exact binding and native account without treating pending state as admission', async () => {
    const reader = new YoulinManualProvisioningStateReader(fixture.db, enterpriseId);
    expect(await reader.read(subjectId)).toMatchObject({
      subjectId,
      status: 'pending',
      authEpoch: 0,
      activeBindingCount: 1,
      nativeAccountMatches: true,
      idpRevocationConfirmedEpoch: null,
    });
    expect(
      await new YoulinManualProvisioningStateReader(fixture.db, 'other-enterprise').read(subjectId),
    ).toBeNull();
  });
  it('observes denial and native mapping removal on the next read', async () => {
    const reader = new YoulinManualProvisioningStateReader(fixture.db, enterpriseId);
    await reader.read(subjectId);
    await fixture.db
      .update(youlinSubjects)
      .set({ status: 'disabled', authEpoch: 1 })
      .where(eq(youlinSubjects.id, subjectId));
    await fixture.db
      .update(youlinManualEnrollments)
      .set({ status: 'disabled' })
      .where(eq(youlinManualEnrollments.subjectId, subjectId));
    await fixture.db.delete(account).where(eq(account.userId, 'projection-user'));
    expect(await reader.read(subjectId)).toMatchObject({
      status: 'disabled',
      authEpoch: 1,
      nativeAccountMatches: false,
    });
  });
  it('rejects mixed manual/HR provenance', async () => {
    await fixture.db
      .insert(youlinPersons)
      .values({ enterpriseId, subjectId, source: 'synthetic-hr', personKey: 'person-1' });
    expect(
      await new YoulinManualProvisioningStateReader(fixture.db, enterpriseId).read(subjectId),
    ).toBeNull();
  });
});
