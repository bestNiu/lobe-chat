import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../../../schemas/betterAuth';
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
import { YoulinIdentityLocalBootstrap } from '../localBootstrap';
import { createIdentityTestDatabase } from './database';

const enterpriseId = 'synthetic-a';
const issuer = 'https://idp.synthetic';
const bootstrapOperatorId = '20000000-0000-4000-8000-000000000001';
const cleanupWorkerId = '20000000-0000-4000-8000-000000000002';

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('local first-administrator bootstrap', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let bootstrap: YoulinIdentityLocalBootstrap;
  const createTarget = async (
    overrides: {
      bindingCount?: number;
      cleanupEpoch?: number | null;
      enrollmentStatus?: 'active' | 'disabled' | 'pending';
      mixed?: boolean;
      nativeMismatch?: boolean;
      status?: 'active' | 'disabled' | 'pending';
    } = {},
  ) => {
    const subjectId = randomUUID();
    const userId = `synthetic-${subjectId}`;
    const externalSubject = randomUUID();
    await fixture.db.insert(users).values({ id: userId });
    await fixture.db.insert(youlinSubjects).values({
      authEpoch: 0,
      authorityVersion: 1,
      enterpriseId,
      id: subjectId,
      idpRevocationConfirmedEpoch:
        overrides.cleanupEpoch === undefined ? 0 : overrides.cleanupEpoch,
      kind: 'user',
      status: overrides.status ?? 'active',
      userId,
    });
    await fixture.db.insert(youlinManualEnrollments).values({
      employeeNumber: `EMP-${subjectId.slice(0, 8).toUpperCase()}`,
      enterpriseId,
      status: overrides.enrollmentStatus ?? 'active',
      subjectId,
      userId,
    });
    const bindingCount = overrides.bindingCount ?? 1;
    for (let index = 0; index < bindingCount; index++) {
      await fixture.db.insert(youlinIdentityBindings).values({
        enterpriseId,
        externalSubject: index === 0 ? externalSubject : randomUUID(),
        issuer: index === 0 ? issuer : 'https://other.synthetic',
        subjectId,
      });
    }
    await fixture.db.insert(account).values({
      accountId: overrides.nativeMismatch ? randomUUID() : externalSubject,
      id: randomUUID(),
      providerId: 'keycloak',
      updatedAt: new Date(),
      userId,
    });
    if (overrides.mixed)
      await fixture.db.insert(youlinPersons).values({
        enterpriseId,
        personKey: `person-${subjectId}`,
        source: 'synthetic',
        subjectId,
      });
    return subjectId;
  };

  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  beforeEach(async () => {
    await fixture.reset();
    bootstrap = new YoulinIdentityLocalBootstrap(fixture.db, {
      bootstrapOperatorId,
      cleanupWorkerId,
      enabled: true,
      enterpriseId,
      issuer,
      localTestOnlyAcknowledged: true,
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    await bootstrap.initialize();
  });

  it.each([
    ['pending subject', { status: 'pending' as const }],
    ['pending enrollment', { enrollmentStatus: 'pending' as const }],
    ['missing cleanup', { cleanupEpoch: null }],
    ['multiple bindings', { bindingCount: 2 }],
    ['mixed HR admission', { mixed: true }],
    ['mismatched native account', { nativeMismatch: true }],
  ])('rejects an invalid target: %s', async (_label, targetOptions) => {
    const subjectId = await createTarget(targetOptions);
    await expect(bootstrap.assignFirstAdministrator({ subjectId })).rejects.toMatchObject({
      code: 'ADMINISTRATOR_TARGET_INVALID',
    });
    expect(
      await fixture.db
        .select()
        .from(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, subjectId)),
    ).toHaveLength(0);
  });

  it('atomically grants the exact human permissions and retires only the operator', async () => {
    const subjectId = await createTarget();
    await expect(bootstrap.assignFirstAdministrator({ subjectId })).resolves.toEqual({
      status: 'assigned',
      subjectId,
    });
    const humanGrants = await fixture.db
      .select()
      .from(youlinIdentityGrants)
      .where(eq(youlinIdentityGrants.subjectId, subjectId));
    expect(humanGrants.map(({ permission }) => permission).sort()).toEqual(
      [
        'identity:activate',
        'identity:bind',
        // Model authorization and quota administration is its own permission: reading identity is
        // not the right to change a quota, and provisioning an account is not model governance.
        'identity:model-governance',
        'identity:provision',
        'identity:read',
        'identity:revoke',
      ].sort(),
    );
    expect(
      await fixture.db
        .select()
        .from(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, bootstrapOperatorId)),
    ).toHaveLength(0);
    const [operator] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, bootstrapOperatorId));
    expect(operator).toMatchObject({
      authEpoch: 1,
      authorityVersion: 1,
      kind: 'service',
      status: 'disabled',
    });
    expect(
      await fixture.db
        .select()
        .from(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, cleanupWorkerId)),
    ).toMatchObject([{ authEpoch: 0, permission: 'identity:record-cleanup' }]);
    expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(2);
    expect(await fixture.db.select().from(youlinIdentityAuditEvents)).toHaveLength(2);
    expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(2);
    expect(JSON.stringify(await fixture.db.select().from(youlinIdentityAuditEvents))).not.toMatch(
      /password|@example/i,
    );
  });

  it('returns only the recorded target after retirement and never grants a second human', async () => {
    const first = await createTarget();
    await bootstrap.assignFirstAdministrator({ subjectId: first });
    await expect(bootstrap.assignFirstAdministrator({ subjectId: first })).resolves.toEqual({
      status: 'completed',
      subjectId: first,
    });
    const second = await createTarget();
    await expect(bootstrap.assignFirstAdministrator({ subjectId: second })).rejects.toMatchObject({
      code: 'FIRST_ADMINISTRATOR_ALREADY_ASSIGNED',
    });
    expect(
      await fixture.db
        .select()
        .from(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, second)),
    ).toHaveLength(0);
    await expect(bootstrap.initialize()).resolves.toEqual({ status: 'resumed' });
  });

  it('rolls human grants and operator retirement back when evidence insertion fails', async () => {
    const subjectId = await createTarget();
    await fixture.pool
      .query(`CREATE FUNCTION public.youlin_test_reject_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic-audit-failure'; END $$;
      CREATE TRIGGER youlin_test_reject_admin_audit BEFORE INSERT ON public.youlin_identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.youlin_test_reject_admin_audit();`);
    try {
      await expect(bootstrap.assignFirstAdministrator({ subjectId })).rejects.toMatchObject({
        code: 'COMMAND_OUTCOME_UNCONFIRMED',
      });
      expect(
        await fixture.db
          .select()
          .from(youlinIdentityGrants)
          .where(eq(youlinIdentityGrants.subjectId, subjectId)),
      ).toHaveLength(0);
      const [operator] = await fixture.db
        .select()
        .from(youlinSubjects)
        .where(eq(youlinSubjects.id, bootstrapOperatorId));
      expect(operator).toMatchObject({ authEpoch: 0, authorityVersion: 0, status: 'active' });
      expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(1);
      expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(1);
    } finally {
      await fixture.pool.query(
        'DROP TRIGGER youlin_test_reject_admin_audit ON public.youlin_identity_audit_events; DROP FUNCTION public.youlin_test_reject_admin_audit();',
      );
    }
  });
});
