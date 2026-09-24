import type { YoulinIdentityOutboxClaim, YoulinIdentityOutboxLease } from '@lobechat/types';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinIdentityOutbox } from '../../../schemas/youlinIdentityOperations';
import { YoulinIdentityOutbox as Outbox } from '../outbox';
import { YoulinIdentityRevocation } from '../revocation';
import { createIdentityTestDatabase } from './database';

const owned = (claim: YoulinIdentityOutboxClaim): YoulinIdentityOutboxLease => {
  if (!claim || claim.status !== 'leased') throw new Error('Expected synthetic lease');
  return claim;
};
const token = (claim: YoulinIdentityOutboxLease) => ({
  leaseToken: claim.leaseToken,
  outboxId: claim.outboxId,
});

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('private identity event outbox', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let outbox: Outbox;
  let targetId: string;
  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  beforeEach(async () => {
    await fixture.reset();
    const operator = await fixture.seedActor('a', ['identity:revoke']);
    const target = await fixture.seedActor('a');
    targetId = target.subjectId;
    const worker = await fixture.seedActor('a', ['identity:deliver']);
    const options = { enabled: true, enterpriseId: 'a', lockTimeoutMs: 1000, sqlTimeoutMs: 3000 };
    await new YoulinIdentityRevocation(fixture.db, { ...options, actor: operator }).revokeSubject(
      'event',
      { expectedAuthEpoch: 0, reason: 'administrative_disable', subjectId: targetId },
    );
    outbox = new Outbox(
      fixture.db,
      { ...options, actor: worker },
      { leaseMs: 10_000, maxAttempts: 2 },
    );
  });

  it('lets only one racing relay lease an event; delivery is not IdP cleanup proof', async () => {
    const results = await Promise.all([outbox.claim(), outbox.claim()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const claim = owned(results.find(Boolean)!);
    expect(claim.attempts).toBe(1);
    await outbox.acknowledge(token(claim));
    const [subject] = await fixture.db
      .select()
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, targetId));
    expect(subject).toMatchObject({
      authEpoch: 1,
      idpRevocationConfirmedEpoch: null,
      status: 'disabled',
    });
    expect(await outbox.claim()).toBeNull();
    expect(await fixture.db.select().from(youlinIdentityOutbox)).toHaveLength(1);
  });

  it('reclaims an expired lease with a new token and rejects the old worker', async () => {
    const first = owned(await outbox.claim());
    await fixture.db
      .update(youlinIdentityOutbox)
      .set({ leaseExpiresAt: sql`clock_timestamp() - interval '1 second'` })
      .where(eq(youlinIdentityOutbox.id, first.outboxId));
    await expect(outbox.acknowledge(token(first))).rejects.toMatchObject({ code: 'LEASE_LOST' });
    const second = owned(await outbox.claim());
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(second.attempts).toBe(2);
    await expect(outbox.retry(token(first), 0)).rejects.toMatchObject({ code: 'LEASE_LOST' });
    await outbox.acknowledge(token(second));
  });

  it('bounds retries and retains exhausted events as dead, not silently discarded', async () => {
    const first = owned(await outbox.claim());
    expect(await outbox.retry(token(first), 0)).toEqual({ status: 'pending' });
    const second = owned(await outbox.claim());
    expect(await outbox.retry(token(second), 0)).toEqual({ status: 'dead' });
    expect(await outbox.claim()).toBeNull();
    const [row] = await fixture.db.select().from(youlinIdentityOutbox);
    expect(row).toMatchObject({
      attempts: 2,
      deliveredAt: null,
      leaseExpiresAt: null,
      leaseToken: null,
      status: 'dead',
    });
  });

  it('marks a crash-expired final attempt dead instead of leasing indefinitely', async () => {
    const first = owned(await outbox.claim());
    await fixture.db
      .update(youlinIdentityOutbox)
      .set({ attempts: 2, leaseExpiresAt: sql`clock_timestamp() - interval '1 second'` })
      .where(eq(youlinIdentityOutbox.id, first.outboxId));
    expect(await outbox.claim()).toEqual({ outboxId: first.outboxId, status: 'dead' });
  });

  it('rejects acknowledgement when a lease expires while waiting for the control lock', async () => {
    const claim = owned(await outbox.claim());
    const blocker = await fixture.pool.connect();
    let outcome: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended('youlin-identity:a', 0))");
      outcome = Promise.allSettled([outbox.acknowledge(token(claim))]);
      await vi.waitFor(
        async () => {
          const result = await fixture.pool.query(
            "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory'",
          );
          expect(result.rows[0].count).toBeGreaterThan(0);
        },
        { interval: 20, timeout: 500 },
      );
      // This instant postdates the waiting transaction's now(), but predates its eventual UPDATE.
      await fixture.db
        .update(youlinIdentityOutbox)
        .set({ leaseExpiresAt: sql`clock_timestamp()` })
        .where(eq(youlinIdentityOutbox.id, claim.outboxId));
      await blocker.query('COMMIT');
      expect((await outcome)[0]).toMatchObject({
        status: 'rejected',
        reason: { code: 'LEASE_LOST' },
      });
    } finally {
      try {
        await blocker.query('ROLLBACK');
      } finally {
        blocker.release(true);
      }
      if (outcome) await outcome;
    }
  });

  it('honors backoff using database time', async () => {
    const first = owned(await outbox.claim());
    await outbox.retry(token(first), 60_000);
    expect(await outbox.claim()).toBeNull();
  });

  it('does not claim or acknowledge another enterprise even with its token', async () => {
    const first = owned(await outbox.claim());
    const actor = await fixture.seedActor('b', ['identity:deliver']);
    const other = new Outbox(
      fixture.db,
      { actor, enabled: true, enterpriseId: 'b', lockTimeoutMs: 1000, sqlTimeoutMs: 3000 },
      { leaseMs: 10_000, maxAttempts: 2 },
    );
    expect(await other.claim()).toBeNull();
    await expect(other.acknowledge(token(first))).rejects.toMatchObject({ code: 'LEASE_LOST' });
    await outbox.acknowledge(token(first));
  });
});
