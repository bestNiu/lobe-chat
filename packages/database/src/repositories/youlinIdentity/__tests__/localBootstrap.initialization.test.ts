import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { users } from '../../../schemas/user';
import { youlinPersons, youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../../schemas/youlinIdentityGovernance';
import {
  youlinIdentityAuditEvents,
  youlinIdentityCommands,
  youlinIdentityOutbox,
} from '../../../schemas/youlinIdentityOperations';
import { YoulinIdentityLocalBootstrap } from '../localBootstrap';
import { createIdentityTestDatabase } from './database';

const enterpriseId = 'synthetic-a';
const bootstrapOperatorId = '10000000-0000-4000-8000-000000000001';
const cleanupWorkerId = '10000000-0000-4000-8000-000000000002';

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)(
  'local identity bootstrap initialization',
  () => {
    let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
    const options = () => ({
      bootstrapOperatorId,
      cleanupWorkerId,
      enabled: true,
      enterpriseId,
      issuer: 'https://idp.synthetic',
      localTestOnlyAcknowledged: true,
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    const bootstrap = () => new YoulinIdentityLocalBootstrap(fixture.db, options());

    beforeAll(async () => {
      fixture = await createIdentityTestDatabase();
    });
    afterAll(async () => {
      if (fixture) await fixture.close();
    });
    beforeEach(async () => {
      await fixture.reset();
    });

    it('requires both explicit local-only gates and strictly parsed configuration', () => {
      expect(
        () => new YoulinIdentityLocalBootstrap(fixture.db, { ...options(), enabled: false }),
      ).toThrow();
      expect(
        () =>
          new YoulinIdentityLocalBootstrap(fixture.db, {
            ...options(),
            localTestOnlyAcknowledged: false,
          }),
      ).toThrow();
      expect(
        () =>
          new YoulinIdentityLocalBootstrap(fixture.db, {
            ...options(),
            cleanupWorkerId: bootstrapOperatorId,
          }),
      ).toThrow();
    });

    it('initializes exactly two services, exact grants, and one atomic evidence bundle', async () => {
      await expect(bootstrap().initialize()).resolves.toEqual({ status: 'initialized' });

      expect(await fixture.db.select().from(users)).toHaveLength(0);
      expect(await fixture.db.select().from(youlinPersons)).toHaveLength(0);
      expect(await fixture.db.select().from(youlinSubjects)).toHaveLength(2);
      const grants = await fixture.db.select().from(youlinIdentityGrants);
      expect(grants).toHaveLength(7);
      expect(
        grants
          .filter(({ subjectId }) => subjectId === bootstrapOperatorId)
          .map(({ permission }) => permission)
          .sort(),
      ).toEqual(
        [
          'identity:activate',
          'identity:bind',
          'identity:model-governance',
          'identity:provision',
          'identity:read',
          'identity:revoke',
        ].sort(),
      );
      expect(grants.filter(({ subjectId }) => subjectId === cleanupWorkerId)).toMatchObject([
        { authEpoch: 0, permission: 'identity:record-cleanup' },
      ]);
      expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(1);
      expect(await fixture.db.select().from(youlinIdentityAuditEvents)).toHaveLength(1);
      expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(1);
    });

    it('resumes only the matching receipt and configuration without duplicate bundles', async () => {
      await bootstrap().initialize();
      await expect(bootstrap().initialize()).resolves.toEqual({ status: 'resumed' });
      expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(1);
      expect(await fixture.db.select().from(youlinIdentityAuditEvents)).toHaveLength(1);
      expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(1);

      const mismatches = [
        { bootstrapOperatorId: randomUUID() },
        { cleanupWorkerId: randomUUID() },
        { enterpriseId: 'synthetic-b' },
        { issuer: 'https://other.synthetic' },
      ];
      for (const mismatch of mismatches) {
        const candidate = new YoulinIdentityLocalBootstrap(fixture.db, {
          ...options(),
          ...mismatch,
        });
        await expect(candidate.initialize()).rejects.toMatchObject({
          code:
            'cleanupWorkerId' in mismatch || 'issuer' in mismatch
              ? 'BOOTSTRAP_CONFIG_MISMATCH'
              : 'BOOTSTRAP_REQUIRES_EMPTY_DATABASE',
        });
      }
    });

    it('rejects nonempty application-user or identity-subject databases', async () => {
      await fixture.db.insert(users).values({ id: 'preexisting-user' });
      await expect(bootstrap().initialize()).rejects.toMatchObject({
        code: 'BOOTSTRAP_REQUIRES_EMPTY_DATABASE',
      });
      await fixture.reset();
      await fixture.db.insert(youlinSubjects).values({
        enterpriseId,
        id: randomUUID(),
        kind: 'service',
      });
      await expect(bootstrap().initialize()).rejects.toMatchObject({
        code: 'BOOTSTRAP_REQUIRES_EMPTY_DATABASE',
      });
    });

    it('fails closed for altered service kinds or privilege sets', async () => {
      await bootstrap().initialize();
      await fixture.db.insert(users).values({ id: 'wrong-bootstrap-kind' });
      await fixture.db
        .update(youlinSubjects)
        .set({ kind: 'user', userId: 'wrong-bootstrap-kind' })
        .where(eq(youlinSubjects.id, bootstrapOperatorId));
      await expect(bootstrap().initialize()).rejects.toMatchObject({
        code: 'BOOTSTRAP_STATE_MISMATCH',
      });
      await fixture.reset();
      await bootstrap().initialize();
      await fixture.db.insert(youlinIdentityGrants).values({
        subjectId: cleanupWorkerId,
        enterpriseId,
        authEpoch: 0,
        permission: 'identity:activate',
      });
      await expect(bootstrap().initialize()).rejects.toMatchObject({
        code: 'BOOTSTRAP_STATE_MISMATCH',
      });
    });

    it('rolls all trust roots and evidence back when the bundle cannot complete', async () => {
      await fixture.pool
        .query(`CREATE FUNCTION public.youlin_test_reject_bootstrap_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic-audit-failure'; END $$;
      CREATE TRIGGER youlin_test_reject_bootstrap_audit BEFORE INSERT ON public.youlin_identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.youlin_test_reject_bootstrap_audit();`);
      try {
        await expect(bootstrap().initialize()).rejects.toThrow();
        expect(await fixture.db.select().from(youlinSubjects)).toHaveLength(0);
        expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(0);
        expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(0);
      } finally {
        await fixture.pool.query(
          'DROP TRIGGER youlin_test_reject_bootstrap_audit ON public.youlin_identity_audit_events; DROP FUNCTION public.youlin_test_reject_bootstrap_audit();',
        );
      }
    });
  },
);
