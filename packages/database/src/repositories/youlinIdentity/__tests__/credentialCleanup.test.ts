import type { YoulinIdentityActor } from '@lobechat/types';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../../schemas/youlinIdentityGovernance';
import {
  youlinIdentityAuditEvents,
  youlinIdentityCommands,
  youlinIdentityOutbox,
} from '../../../schemas/youlinIdentityOperations';
import { YoulinIdentityCredentialCleanup } from '../credentialCleanup';
import { YoulinIdentityRevocation } from '../revocation';
import { createIdentityTestDatabase } from './database';

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)(
  'private credential-cleanup attestation sink',
  () => {
    let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
    let worker: YoulinIdentityActor;
    let subjectId: string;
    let revocation: YoulinIdentityRevocation;
    let cleanup: YoulinIdentityCredentialCleanup;
    let eventId: string;
    const options = (actor: YoulinIdentityActor, enterpriseId = 'a') => ({
      actor,
      enterpriseId,
      enabled: true,
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    const input = () => ({ expectedAuthEpoch: 1, revocationEventId: eventId });
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
      const operator = await fixture.seedActor('a', ['identity:revoke']);
      worker = await fixture.seedActor('a', ['identity:record-cleanup']);
      subjectId = (await fixture.seedActor('a', ['identity:read'])).subjectId;
      revocation = new YoulinIdentityRevocation(fixture.db, options(operator));
      await revocation.revokeSubject('deny', {
        subjectId,
        expectedAuthEpoch: 0,
        reason: 'administrative_disable',
      });
      const [event] = await fixture.db.select().from(youlinIdentityAuditEvents);
      eventId = event.id;
      cleanup = new YoulinIdentityCredentialCleanup(fixture.db, options(worker));
    });

    it('atomically records exact-epoch completion without activation, grants or transport ACK', async () => {
      const before = await state();
      const result = await cleanup.recordCompletion('completion', input());
      expect(result).toEqual({ authEpoch: 1, status: 'cleanup_recorded', subjectId });
      expect(await cleanup.recordCompletion('completion', input())).toEqual(result);
      expect(await state()).toMatchObject({
        authEpoch: 1,
        authorityVersion: before.authorityVersion,
        credentialsNotBefore: before.credentialsNotBefore,
        idpRevocationConfirmedEpoch: 1,
        status: 'disabled',
      });
      expect(
        await fixture.db
          .select()
          .from(youlinIdentityGrants)
          .where(eq(youlinIdentityGrants.subjectId, subjectId)),
      ).toHaveLength(0);
      expect(await fixture.db.select().from(youlinIdentityCommands)).toHaveLength(2);
      const events = await fixture.db.select().from(youlinIdentityAuditEvents);
      expect(events).toHaveLength(2);
      expect(
        events.find((event) => event.operation === 'record_credential_cleanup')?.detail,
      ).toEqual({ authEpoch: 1, sourceEventId: eventId });
      const outbox = await fixture.db.select().from(youlinIdentityOutbox);
      expect(outbox).toHaveLength(2);
      expect(outbox.every((event) => event.status === 'pending')).toBe(true);
    });

    it('does not let a delayed completion or historical replay certify a newer epoch', async () => {
      await cleanup.recordCompletion('completion', input());
      await revocation.revokeSubject('deny-again', {
        subjectId,
        expectedAuthEpoch: 1,
        reason: 'security_response',
      });
      await expect(cleanup.recordCompletion('delayed', input())).rejects.toMatchObject({
        code: 'EPOCH_CONFLICT',
      });
      expect(await cleanup.recordCompletion('completion', input())).toMatchObject({
        authEpoch: 1,
        status: 'cleanup_recorded',
      });
      expect(await state()).toMatchObject({
        authEpoch: 2,
        idpRevocationConfirmedEpoch: null,
        status: 'disabled',
      });
    });

    it('serializes a racing completion and fresh denial without retaining stale confirmation', async () => {
      const [completion, denial] = await Promise.allSettled([
        cleanup.recordCompletion('racing-completion', input()),
        revocation.revokeSubject('racing-denial', {
          subjectId,
          expectedAuthEpoch: 1,
          reason: 'security_response',
        }),
      ]);
      expect(denial.status).toBe('fulfilled');
      if (completion.status === 'rejected')
        expect(completion.reason).toMatchObject({ code: 'EPOCH_CONFLICT' });
      else expect(completion.value).toMatchObject({ authEpoch: 1, status: 'cleanup_recorded' });
      expect(await state()).toMatchObject({
        authEpoch: 2,
        idpRevocationConfirmedEpoch: null,
        status: 'disabled',
      });
    });

    it('binds the attestation to an actual revocation event, not an arbitrary current epoch', async () => {
      await expect(
        cleanup.recordCompletion('wrong-epoch', { ...input(), expectedAuthEpoch: 0 }),
      ).rejects.toMatchObject({ code: 'REVOCATION_EVENT_UNAVAILABLE' });
      await cleanup.recordCompletion('completion', input());
      const [completed] = await fixture.db
        .select()
        .from(youlinIdentityAuditEvents)
        .where(eq(youlinIdentityAuditEvents.operation, 'record_credential_cleanup'));
      await expect(
        cleanup.recordCompletion('recursive', { ...input(), revocationEventId: completed.id }),
      ).rejects.toMatchObject({ code: 'REVOCATION_EVENT_UNAVAILABLE' });
    });

    it('isolates enterprises even when a caller knows the event UUID', async () => {
      const other = await fixture.seedActor('b', ['identity:record-cleanup']);
      await expect(
        new YoulinIdentityCredentialCleanup(fixture.db, options(other, 'b')).recordCompletion(
          'foreign',
          input(),
        ),
      ).rejects.toMatchObject({ code: 'REVOCATION_EVENT_UNAVAILABLE' });
      expect((await state()).idpRevocationConfirmedEpoch).toBeNull();
    });

    it('requires the current dedicated service grant, not a human or relay-only role', async () => {
      const human = await fixture.seedActor('a', ['identity:record-cleanup'], true);
      const relay = await fixture.seedActor('a', ['identity:deliver']);
      await expect(
        new YoulinIdentityCredentialCleanup(fixture.db, options(human)).recordCompletion(
          'human',
          input(),
        ),
      ).rejects.toMatchObject({ code: 'PRIVATE_SERVICE_REQUIRED' });
      await expect(
        new YoulinIdentityCredentialCleanup(fixture.db, options(relay)).recordCompletion(
          'relay',
          input(),
        ),
      ).rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
      await cleanup.recordCompletion('completion', input());
      await fixture.db
        .delete(youlinIdentityGrants)
        .where(eq(youlinIdentityGrants.subjectId, worker.subjectId));
      await expect(cleanup.recordCompletion('completion', input())).rejects.toMatchObject({
        code: 'ACTOR_NOT_AUTHORIZED',
      });
    });

    it('rejects active targets and terminal counters rather than treating them as cleaned', async () => {
      await fixture.db
        .update(youlinSubjects)
        .set({ status: 'active' })
        .where(eq(youlinSubjects.id, subjectId));
      await expect(cleanup.recordCompletion('active', input())).rejects.toMatchObject({
        code: 'SUBJECT_NOT_DENIED',
      });
      await fixture.db
        .update(youlinSubjects)
        .set({ authorityVersion: Number.MAX_SAFE_INTEGER, status: 'disabled' })
        .where(eq(youlinSubjects.id, subjectId));
      await expect(cleanup.recordCompletion('terminal', input())).rejects.toMatchObject({
        code: 'SUBJECT_TERMINAL',
      });
    });

    it('fails closed on an unrecognized persisted status', async () => {
      await fixture.pool.query('UPDATE youlin_subjects SET status = $1 WHERE id = $2', [
        'unrecognized',
        subjectId,
      ]);
      await expect(cleanup.recordCompletion('unknown-status', input())).rejects.toMatchObject({
        code: 'SUBJECT_NOT_DENIED',
      });
      expect((await state()).idpRevocationConfirmedEpoch).toBeNull();
    });

    it('rejects raw provider responses and caller-supplied approval fields', async () => {
      await expect(
        cleanup.recordCompletion('raw', {
          ...input(),
          providerResponse: 'synthetic-sensitive',
          verified: true,
        }),
      ).rejects.toThrow();
      expect((await state()).idpRevocationConfirmedEpoch).toBeNull();
    });

    it('rolls back the confirmation when audit persistence fails after the subject update', async () => {
      await fixture.pool.query(
        "CREATE SEQUENCE cleanup_audit_probe; CREATE FUNCTION fail_cleanup_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation = 'record_credential_cleanup' THEN PERFORM nextval('cleanup_audit_probe'); RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_cleanup_audit BEFORE INSERT ON youlin_identity_audit_events FOR EACH ROW EXECUTE FUNCTION fail_cleanup_audit()",
      );
      try {
        await expect(cleanup.recordCompletion('rollback', input())).rejects.toMatchObject({
          code: 'COMMAND_OUTCOME_UNCONFIRMED',
        });
        expect(
          (await fixture.pool.query('SELECT is_called FROM cleanup_audit_probe')).rows[0].is_called,
        ).toBe(true);
        expect((await state()).idpRevocationConfirmedEpoch).toBeNull();
        expect(
          await fixture.db
            .select()
            .from(youlinIdentityCommands)
            .where(
              and(
                eq(youlinIdentityCommands.enterpriseId, 'a'),
                eq(youlinIdentityCommands.operation, 'record_credential_cleanup'),
              ),
            ),
        ).toHaveLength(0);
      } finally {
        await fixture.pool.query(
          'DROP TRIGGER fail_cleanup_audit ON youlin_identity_audit_events; DROP FUNCTION fail_cleanup_audit(); DROP SEQUENCE cleanup_audit_probe',
        );
      }
    });
  },
);
