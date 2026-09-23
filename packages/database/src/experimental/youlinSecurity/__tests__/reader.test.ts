// @vitest-environment node
import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createExperimentalRevocationReader } from '../reader';
import { experimentalSubjectStates as states } from '../schema';

// Intentionally isolated: getTestDB() installs the product migration chain.
// This experiment must not add unapproved tables to that chain or use DATABASE_TEST_URL.
const client = new PGlite();
const db = drizzle(client);
const read = createExperimentalRevocationReader(db);
const user = { id: 'synthetic-a', kind: 'user' } as const;
const signal = () => new AbortController().signal;

beforeAll(async () => {
  const fixture = new URL(
    '../../../../../../scripts/youlin/fixtures/revocation.sql',
    import.meta.url,
  );
  await client.exec(await readFile(fixture, 'utf8'));
}, 30_000);

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec(`TRUNCATE youlin_security_spike.command_receipts,
    youlin_security_spike.outbox_events, youlin_security_spike.audit_events,
    youlin_security_spike.subject_states;`);
  await db.insert(states).values([
    {
      subjectId: 'synthetic-a',
      subjectKind: 'user',
      authEpoch: 7,
      sourceVersion: 12,
      disabled: false,
    },
    {
      subjectId: 'synthetic-b',
      subjectKind: 'user',
      authEpoch: 8,
      sourceVersion: 13,
      disabled: true,
    },
    {
      subjectId: 'synthetic-a',
      subjectKind: 'service',
      authEpoch: 2,
      sourceVersion: 3,
      disabled: true,
    },
  ]);
});

describe('experimental Drizzle authoritative-state reader', () => {
  it('maps real SQL rows to the K01 state shape without exposing internal row IDs', async () => {
    expect(await read(user, signal())).toEqual({
      authEpoch: 7,
      disabled: false,
      sourceVersion: 12,
      subjectRef: user,
    });
  });

  it('does not confuse two users or a service with the same identifier', async () => {
    expect((await read({ kind: 'user', id: 'synthetic-b' }, signal()))?.authEpoch).toBe(8);
    expect((await read({ kind: 'service', id: 'synthetic-a' }, signal()))?.authEpoch).toBe(2);
    expect((await read(user, signal()))?.disabled).toBe(false);
  });

  it('returns null for an unknown subject and does not create a row', async () => {
    expect(await read({ kind: 'user', id: 'synthetic-missing' }, signal())).toBeNull();
    expect(await db.select().from(states)).toHaveLength(3);
  });

  it('rereads a committed revocation instead of caching an active result', async () => {
    expect((await read(user, signal()))?.disabled).toBe(false);
    await db
      .update(states)
      .set({ authEpoch: 8, sourceVersion: 13, disabled: true })
      .where(and(eq(states.subjectKind, user.kind), eq(states.subjectId, user.id)));
    expect(await read(user, signal())).toEqual({
      authEpoch: 8,
      sourceVersion: 13,
      disabled: true,
      subjectRef: user,
    });
  });

  it('uses bound parameters rather than interpolating an injected identifier', async () => {
    expect(
      await read(
        { kind: 'user', id: "x'; DELETE FROM youlin_security_spike.subject_states; --" },
        signal(),
      ),
    ).toBeNull();
    expect(await db.select().from(states)).toHaveLength(3);
  });

  it('rejects an already aborted operation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(read(user, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('discards a result if cancellation happens during asynchronous database IO', async () => {
    const controller = new AbortController();
    const pending = read(user, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('snapshots the subject binding before awaiting IO', async () => {
    const input = { kind: 'user' as const, id: 'synthetic-a' };
    const pending = read(input, signal());
    input.id = 'synthetic-b';
    expect((await pending)?.subjectRef).toEqual(user);
  });

  it('round-trips the maximum safe integer without truncation', async () => {
    await db
      .update(states)
      .set({ authEpoch: Number.MAX_SAFE_INTEGER })
      .where(and(eq(states.subjectKind, user.kind), eq(states.subjectId, user.id)));
    expect((await read(user, signal()))?.authEpoch).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('enforces the SQL version bound and leaves the previous state intact on failure', async () => {
    await expect(
      db
        .update(states)
        .set({ authEpoch: -1 })
        .where(and(eq(states.subjectKind, user.kind), eq(states.subjectId, user.id))),
    ).rejects.toThrow();
    expect((await read(user, signal()))?.authEpoch).toBe(7);
  });

  it.each(['authEpoch', 'sourceVersion'] as const)(
    'rejects unsafe %s even if a DB constraint has drifted',
    async (column) => {
      await expect(
        db.transaction(async (tx) => {
          const constraint =
            column === 'authEpoch'
              ? 'subject_states_auth_epoch_check'
              : 'subject_states_source_version_check';
          await tx.execute(
            sql`ALTER TABLE youlin_security_spike.subject_states DROP CONSTRAINT ${sql.identifier(constraint)}`,
          );
          await tx
            .update(states)
            .set({ [column]: Number.MAX_SAFE_INTEGER + 1 })
            .where(and(eq(states.subjectKind, user.kind), eq(states.subjectId, user.id)));
          await createExperimentalRevocationReader(tx)(user, signal());
        }),
      ).rejects.toThrow('Invalid authoritative revocation state');
      expect((await read(user, signal()))?.authEpoch).toBe(7);
    },
  );

  it('propagates storage failure rather than returning an active fallback', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute('DROP TABLE youlin_security_spike.subject_states CASCADE');
        const txRead = createExperimentalRevocationReader(tx);
        await txRead(user, signal());
      }),
    ).rejects.toThrow();
    // The failed transaction rolls back the DROP; the baseline remains readable.
    expect((await read(user, signal()))?.authEpoch).toBe(7);
  });
});
