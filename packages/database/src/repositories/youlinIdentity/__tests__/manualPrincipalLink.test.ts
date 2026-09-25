import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../../../schemas/betterAuth';
import { users } from '../../../schemas/user';
import { youlinIdentityBindings, youlinPersons } from '../../../schemas/youlinIdentity';
import {
  youlinIdentityAuditEvents,
  youlinIdentityCommands,
  youlinIdentityOutbox,
} from '../../../schemas/youlinIdentityOperations';
import { YoulinIdentityManualEnrollment } from '../manualEnrollment';
import { YoulinIdentityManualPrincipalLink } from '../manualPrincipalLink';
import { createIdentityTestDatabase } from './database';

const enterpriseId = 'manual-link-a';
const issuer = 'https://idp.synthetic/realms/enterprise';

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('manual principal link', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;

  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => fixture?.close());
  beforeEach(async () => fixture.reset());

  const setup = async () => {
    const actor = await fixture.seedActor(
      enterpriseId,
      ['identity:provision', 'identity:bind'],
      true,
    );
    await fixture.db.insert(users).values({ id: 'manual-link-user' });
    const options = {
      actor,
      enabled: true,
      enterpriseId,
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    };
    const reserved = await new YoulinIdentityManualEnrollment(fixture.db, {
      ...options,
      allowedIssuers: [issuer],
    }).reserve('reserve', { employeeNumber: 'LINK-01', userId: 'manual-link-user' });
    return {
      link: new YoulinIdentityManualPrincipalLink(fixture.db, { ...options, issuer }),
      reserved,
    };
  };

  it('atomically creates the exact binding and Better Auth provider mapping', async () => {
    const { link, reserved } = await setup();
    const input = {
      expectedAuthEpoch: 0,
      expectedAuthorityVersion: 0,
      externalSubject: '00000000-0000-4000-8000-000000000101',
      issuer,
      subjectId: reserved.subjectId,
    };
    const result = await link.link('bind', input);
    expect(await link.link('bind', input)).toEqual(result);
    expect(await fixture.db.select().from(youlinIdentityBindings)).toMatchObject([
      { externalSubject: input.externalSubject, issuer, subjectId: reserved.subjectId },
    ]);
    expect(await fixture.db.select().from(account)).toMatchObject([
      { accountId: input.externalSubject, providerId: 'keycloak', userId: 'manual-link-user' },
    ]);
    expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(2);
    expect(await fixture.db.select().from(youlinIdentityAuditEvents)).toHaveLength(2);
    expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(2);
  });

  it('rejects collisions, mixed HR state, stale fences and untrusted issuers', async () => {
    const { link, reserved } = await setup();
    const input = {
      expectedAuthEpoch: 0,
      expectedAuthorityVersion: 0,
      externalSubject: '00000000-0000-4000-8000-000000000102',
      issuer,
      subjectId: reserved.subjectId,
    };
    await fixture.db.insert(account).values({
      accountId: input.externalSubject,
      id: 'existing-account',
      providerId: 'keycloak',
      updatedAt: new Date(),
      userId: 'manual-link-user',
    });
    await expect(link.link('collision', input)).rejects.toMatchObject({
      code: 'PRINCIPAL_OR_ACCOUNT_IN_USE',
    });
    await fixture.db.delete(account).where(eq(account.id, 'existing-account'));
    await fixture.db.insert(youlinPersons).values({
      enterpriseId,
      personKey: 'forbidden-hr-anchor',
      source: 'test',
      subjectId: reserved.subjectId,
    });
    await expect(link.link('mixed', input)).rejects.toMatchObject({
      code: 'MIXED_ADMISSION_SOURCE',
    });
    await fixture.db.delete(youlinPersons);
    await expect(
      link.link('stale', { ...input, expectedAuthorityVersion: 1 }),
    ).rejects.toMatchObject({ code: 'SUBJECT_VERSION_CONFLICT' });
    await expect(
      link.link('issuer', { ...input, issuer: 'https://untrusted.example/realms/wrong' }),
    ).rejects.toMatchObject({ code: 'UNTRUSTED_ISSUER' });
  });
});
