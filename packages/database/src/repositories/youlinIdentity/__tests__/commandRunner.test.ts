import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';

import type { YoulinIdentityActor } from '@lobechat/types';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { users } from '../../../schemas/user';
import { youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../../schemas/youlinIdentityGovernance';
import {
  youlinIdentityAuditEvents,
  youlinIdentityCommands,
  youlinIdentityOutbox,
} from '../../../schemas/youlinIdentityOperations';
import { IdentityCommandRunner } from '../commandRunner';
import { createIdentityTestDatabase } from './database';

// These cases require real PostgreSQL locking/transactions, not a mocked driver or PGlite fallback.
describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)(
  'identity transactional command boundary',
  () => {
    let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
    let actor: YoulinIdentityActor;
    const options = () => ({
      actor,
      enabled: true,
      enterpriseId: 'synthetic-a',
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    const runner = () => new IdentityCommandRunner(fixture.db, options());
    const createSubject = (key: string, input: unknown = { intent: 'synthetic' }) =>
      runner().run('register_person', key, input, async (tx) => {
        const id = randomUUID();
        await tx
          .insert(youlinSubjects)
          .values({ enterpriseId: 'synthetic-a', id, kind: 'service' });
        return { detail: {}, result: { status: 'created', subjectId: id }, subjectId: id };
      });
    beforeAll(async () => {
      fixture = await createIdentityTestDatabase();
    });
    afterAll(async () => {
      if (fixture) await fixture.close();
    });
    beforeEach(async () => {
      await fixture.reset();
      actor = await fixture.seedActor('synthetic-a');
    });

    it('is explicitly opt-in and refuses an already borrowed Drizzle transaction', async () => {
      expect(
        () => new IdentityCommandRunner(fixture.db, { ...options(), enabled: undefined }),
      ).toThrow('FEATURE_DISABLED');
      await fixture.db.transaction(async (tx) => {
        expect(() => new IdentityCommandRunner(tx, options())).toThrow(
          'BORROWED_TRANSACTION_REJECTED',
        );
      });
    });

    it('commits state, receipt, audit and outbox together and deduplicates concurrent retries', async () => {
      const [a, b] = await Promise.all([
        createSubject('same-command'),
        createSubject('same-command'),
      ]);
      expect(a).toEqual(b);
      expect(await fixture.db.select().from(youlinSubjects)).toHaveLength(2);
      expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(1);
      expect(await fixture.db.select().from(youlinIdentityAuditEvents)).toHaveLength(1);
      expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(1);
    });

    it('rejects reuse with different arguments without an extra mutation', async () => {
      await createSubject('same-key', { value: 1 });
      await expect(createSubject('same-key', { value: 2 })).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
      expect(await fixture.db.select().from(youlinSubjects)).toHaveLength(2);
    });

    it('requires current permission even for a previously committed receipt', async () => {
      await createSubject('receipt');
      await fixture.db
        .delete(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, actor.subjectId));
      await expect(createSubject('receipt')).rejects.toMatchObject({
        code: 'ACTOR_NOT_AUTHORIZED',
      });
    });

    it('denies stale epochs, disabled actors and cross-enterprise actor reuse', async () => {
      const foreign = new IdentityCommandRunner(fixture.db, {
        ...options(),
        enterpriseId: 'synthetic-b',
      });
      await expect(
        foreign.run('register_person', 'foreign', {}, async () => {
          throw new Error('Must never run');
        }),
      ).rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
      await fixture.db
        .update(youlinSubjects)
        .set({ authEpoch: 1 })
        .where(eq(youlinSubjects.id, actor.subjectId));
      await expect(createSubject('stale')).rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
      await fixture.db
        .update(youlinSubjects)
        .set({ authEpoch: 0, status: 'disabled' })
        .where(eq(youlinSubjects.id, actor.subjectId));
      await expect(createSubject('disabled')).rejects.toMatchObject({
        code: 'ACTOR_NOT_AUTHORIZED',
      });
      expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(0);
    });

    it('does not restore old grants just because the actor has a fresh epoch', async () => {
      await fixture.db
        .update(youlinSubjects)
        .set({ authEpoch: 1 })
        .where(eq(youlinSubjects.id, actor.subjectId));
      actor = { ...actor, authEpoch: 1 };
      await expect(createSubject('old-grant')).rejects.toMatchObject({
        code: 'ACTOR_NOT_AUTHORIZED',
      });
      expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(0);
    });

    it('rechecks authority after waiting on the enterprise lock', async () => {
      const blocker = await fixture.pool.connect();
      let outcome: Promise<PromiseSettledResult<unknown>[]> | undefined;
      try {
        await blocker.query('BEGIN');
        await blocker.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('youlin-identity:synthetic-a', 0))",
        );
        // Attach a rejection handler immediately; a failed test must not leave an unhandled task.
        outcome = Promise.allSettled([createSubject('waiting')]);
        await vi.waitFor(
          async () => {
            const waiting = await fixture.pool.query(
              "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory'",
            );
            expect(waiting.rows[0].count).toBeGreaterThan(0);
          },
          { interval: 20, timeout: 500 },
        );
        await fixture.db
          .update(youlinSubjects)
          .set({ status: 'disabled' })
          .where(eq(youlinSubjects.id, actor.subjectId));
        await blocker.query('COMMIT');
        expect((await outcome)[0]).toMatchObject({
          status: 'rejected',
          reason: { code: 'ACTOR_NOT_AUTHORIZED' },
        });
        expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(0);
      } finally {
        try {
          await blocker.query('ROLLBACK');
        } finally {
          blocker.release(true);
        }
        if (outcome) await outcome;
      }
    });

    it('does not let a legacy banned application user act through an otherwise active registry', async () => {
      actor = await fixture.seedActor('synthetic-a', undefined, true);
      const [subject] = await fixture.db
        .select()
        .from(youlinSubjects)
        .where(eq(youlinSubjects.id, actor.subjectId));
      await fixture.db.update(users).set({ banned: true }).where(eq(users.id, subject.userId!));
      await expect(createSubject('banned')).rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
    });

    it('rolls back all state on an audit insertion failure', async () => {
      await fixture.pool.query(`CREATE SEQUENCE public.youlin_test_audit_hits;
          CREATE FUNCTION public.youlin_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('public.youlin_test_audit_hits'); RAISE EXCEPTION 'synthetic-audit-failure'; END $$;
      CREATE TRIGGER youlin_test_reject_audit BEFORE INSERT ON public.youlin_identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.youlin_test_reject_audit();`);
      try {
        await expect(createSubject('rollback')).rejects.toMatchObject({
          code: 'COMMAND_OUTCOME_UNCONFIRMED',
        });
        // A sequence is test-only instrumentation: unlike a row insert, its increment survives rollback.
        expect(
          (await fixture.pool.query('SELECT is_called FROM public.youlin_test_audit_hits')).rows[0]
            .is_called,
        ).toBe(true);
        expect(await fixture.db.select().from(youlinSubjects)).toHaveLength(1);
        expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(0);
        expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(0);
      } finally {
        await fixture.pool.query(
          'DROP TRIGGER youlin_test_reject_audit ON public.youlin_identity_audit_events; DROP FUNCTION public.youlin_test_reject_audit(); DROP SEQUENCE public.youlin_test_audit_hits;',
        );
      }
    });

    it('correlates unexpected failures without logging private error messages', async () => {
      const output = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const [outcome] = await Promise.allSettled([
          runner().run('register_person', 'diagnostic', {}, async () => {
            throw new Error('synthetic-private-credential');
          }),
        ]);
        expect(outcome.status).toBe('rejected');
        if (outcome.status !== 'rejected') throw new Error('Expected failure');
        expect(outcome.reason).toMatchObject({
          code: 'COMMAND_OUTCOME_UNCONFIRMED',
          attemptId: expect.any(String),
        });
        expect(output).toHaveBeenCalledWith(
          '[YoulinIdentity] Command result requires reconciliation',
          {
            attemptId: outcome.reason.attemptId,
            category: 'internal_or_commit_unconfirmed',
            operation: 'register_person',
          },
        );
        expect(inspect(output.mock.calls, { depth: 10 })).not.toContain(
          'synthetic-private-credential',
        );
        expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(0);
      } finally {
        output.mockRestore();
      }
    });

    it('labels malformed fresh results as validation failures, not stored corruption', async () => {
      const output = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await expect(
          runner().run('register_person', 'invalid-result', {}, async () => ({
            detail: {},
            result: { status: 'created', subjectId: 'invalid-uuid' },
          })),
        ).rejects.toMatchObject({ code: 'COMMAND_OUTCOME_UNCONFIRMED' });
        expect(output).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ category: 'validation' }),
        );
        expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(0);
      } finally {
        output.mockRestore();
      }
    });

    it('revalidates database-stored receipts instead of forwarding unknown allow payloads', async () => {
      await createSubject('corrupt');
      await fixture.db.execute(
        sql`UPDATE ${youlinIdentityCommands} SET result = '{"status":"allow"}'::jsonb WHERE idempotency_key = 'corrupt'`,
      );
      await expect(createSubject('corrupt')).rejects.toMatchObject({
        code: 'COMMAND_OUTCOME_UNCONFIRMED',
      });
    });
  },
);
