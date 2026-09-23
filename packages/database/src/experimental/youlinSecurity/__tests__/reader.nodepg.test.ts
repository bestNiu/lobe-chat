// @vitest-environment node
import { setTimeout as sleep } from 'node:timers/promises';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createRevocationGate } from '../../../../../../apps/server/src/modules/YoulinSecurity/revocationGate';
import { createExperimentalRevocationReader } from '../reader';

const socket = process.env.YOULIN_NODEPG_SOCKET;
const runId = process.env.YOULIN_NODEPG_RUN;

// Only the local harness may opt in. Normal root checks must not discover a DB via env fallbacks.
describe.skipIf(!socket)('real node-postgres + Drizzle + revocation gate', () => {
  let admin: Pool;
  let poolA: Pool;
  let poolB: Pool;
  const subject = { id: 'synthetic-a', kind: 'user' } as const;
  const context = { authEpoch: 7, subjectRef: subject };
  const signal = () => new AbortController().signal;
  const revokeSql = 'SELECT youlin_security_spike.revoke_subject($1,$2,$3,$4,$5,$6,$7,$8,$9)';
  const revokeArgs = [
    'user',
    'synthetic-admin',
    'synthetic-command',
    'user',
    'synthetic-a',
    7,
    13,
    'administrative_disable',
    'synthetic-request',
  ];
  const readA = (s = subject, abort = signal()) =>
    createExperimentalRevocationReader(drizzle(poolA))(s, abort);
  const gateA = () =>
    createRevocationGate({
      enabled: true,
      readAuthoritativeState: createExperimentalRevocationReader(drizzle(poolA)),
      readTimeoutMs: 2000,
    });

  beforeAll(async () => {
    if (
      !socket ||
      !/^\/tmp\/youlin-nodepg-[\w-]+\/socket$/.test(socket) ||
      !runId ||
      !/^[\da-f-]{36}$/.test(runId)
    ) {
      throw new Error(
        'Use scripts/youlin/nodePostgres.smoke.mjs; arbitrary database endpoints are forbidden',
      );
    }
    const config = {
      host: socket,
      port: 5432,
      database: 'youlin_nodepg',
      password: 'synthetic-only',
      ssl: false,
      connectionTimeoutMillis: 2000,
      query_timeout: 6000,
      idle_in_transaction_session_timeout: 5000,
    };
    admin = new Pool({
      ...config,
      user: 'postgres',
      max: 2,
      statement_timeout: 5000,
      lock_timeout: 2000,
    });
    // Verify the harness marker before any test mutation. No getTestDB/product migrations.
    const marker = await admin.query(
      'SELECT run_id FROM youlin_security_spike.test_environment_marker',
    );
    expect(marker.rows).toEqual([{ run_id: runId }]);
    const database = await admin.query('SELECT current_database() AS name');
    expect(database.rows[0].name).toBe('youlin_nodepg');
    expect((await admin.query('SHOW listen_addresses')).rows[0].listen_addresses).toBe('');
    poolA = new Pool({
      ...config,
      user: 'youlin_reader',
      max: 1,
      statement_timeout: 1500,
      lock_timeout: 0,
      application_name: 'youlin-reader-a',
    });
    poolB = new Pool({
      ...config,
      user: 'youlin_reader',
      max: 1,
      statement_timeout: 1500,
      lock_timeout: 0,
      application_name: 'youlin-reader-b',
    });
    console.log(
      'Synthetic server:',
      (await admin.query('SHOW server_version')).rows[0].server_version,
    );
    console.log('Node runtime:', process.version);
  });

  afterAll(async () => {
    await Promise.all([poolA?.end(), poolB?.end(), admin?.end()]);
  });

  beforeEach(async () => {
    await admin.query(`GRANT SELECT ON youlin_security_spike.subject_states TO youlin_reader;
      TRUNCATE youlin_security_spike.command_receipts, youlin_security_spike.outbox_events,
        youlin_security_spike.audit_events, youlin_security_spike.subject_states;
      INSERT INTO youlin_security_spike.subject_states(subject_kind,subject_id,auth_epoch,source_version,disabled)
      VALUES ('user','synthetic-a',7,12,false),('service','synthetic-a',2,3,true);`);
  });

  it('reads through pg/Drizzle and does not confuse service and user identities', async () => {
    expect(await readA()).toEqual({
      authEpoch: 7,
      sourceVersion: 12,
      disabled: false,
      subjectRef: subject,
    });
    expect(await gateA()(context)).toEqual({ status: 'continue_authorization' });
    expect(
      await gateA()({ authEpoch: 2, subjectRef: { id: subject.id, kind: 'service' } }),
    ).toEqual({ status: 'deny', reason: 'DISABLED' });
  });

  it('two independent connection pools observe committed atomic revocation and one set of side effects', async () => {
    const gateB = createRevocationGate({
      enabled: true,
      readAuthoritativeState: createExperimentalRevocationReader(drizzle(poolB)),
      readTimeoutMs: 2000,
    });
    expect(await gateB(context)).toEqual({ status: 'continue_authorization' });
    await admin.query(revokeSql, revokeArgs);
    expect(await gateA()(context)).toEqual({ status: 'deny', reason: 'DISABLED' });
    expect(await gateB(context)).toEqual({ status: 'deny', reason: 'DISABLED' });
    const counts = await admin.query(`SELECT
      (SELECT count(*)::int FROM youlin_security_spike.audit_events) AS audit,
      (SELECT count(*)::int FROM youlin_security_spike.outbox_events) AS outbox,
      (SELECT count(*)::int FROM youlin_security_spike.command_receipts) AS receipts`);
    expect(counts.rows[0]).toEqual({ audit: 1, outbox: 1, receipts: 1 });
  });

  it('does not expose uncommitted revocation; rollback removes state changes and side effects', async () => {
    const writer = await admin.connect();
    try {
      await writer.query('BEGIN');
      await writer.query(revokeSql, revokeArgs);
      expect((await readA())?.disabled).toBe(false);
    } finally {
      try {
        await writer.query('ROLLBACK');
      } finally {
        writer.release();
      }
    }
    expect((await readA())?.authEpoch).toBe(7);
    expect(
      (await admin.query('SELECT count(*)::int AS n FROM youlin_security_spike.audit_events'))
        .rows[0].n,
    ).toBe(0);
    expect(
      (await admin.query('SELECT count(*)::int AS n FROM youlin_security_spike.outbox_events'))
        .rows[0].n,
    ).toBe(0);
    expect(
      (await admin.query('SELECT count(*)::int AS n FROM youlin_security_spike.command_receipts'))
        .rows[0].n,
    ).toBe(0);
  });

  it('the reader role cannot write, read audit or invoke the mutation function', async () => {
    await expect(
      poolA.query('UPDATE youlin_security_spike.subject_states SET disabled=true'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      poolA.query('SELECT * FROM youlin_security_spike.audit_events'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(poolA.query(revokeSql, revokeArgs)).rejects.toMatchObject({ code: '42501' });
    expect((await readA())?.disabled).toBe(false);
  });

  it('unknown and malicious subject identifiers do not authorize or execute injected SQL', async () => {
    const reader = createExperimentalRevocationReader(drizzle(poolA));
    expect(
      await reader(
        { kind: 'user', id: "x'; DELETE FROM youlin_security_spike.subject_states; --" },
        signal(),
      ),
    ).toBeNull();
    expect(await gateA()({ authEpoch: 7, subjectRef: { kind: 'user', id: 'missing' } })).toEqual({
      status: 'deny',
      reason: 'STATE_UNAVAILABLE',
    });
    expect(
      (await admin.query('SELECT count(*)::int AS n FROM youlin_security_spike.subject_states'))
        .rows[0].n,
    ).toBe(2);
  });

  it('demonstrates the unsupported repeatable-read stale snapshot; a primary alone is insufficient', async () => {
    const pinned = await poolA.connect();
    try {
      await pinned.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const staleReader = createExperimentalRevocationReader(drizzle(pinned));
      expect((await staleReader(subject, signal()))?.disabled).toBe(false);
      await admin.query(revokeSql, revokeArgs);
      expect((await staleReader(subject, signal()))?.disabled).toBe(false);
      expect(
        (await createExperimentalRevocationReader(drizzle(poolB))(subject, signal()))?.disabled,
      ).toBe(true);
    } finally {
      try {
        await pinned.query('ROLLBACK');
      } finally {
        pinned.release();
      }
    }
    expect((await readA())?.disabled).toBe(true);
  });

  it('gate denies a blocked read before server statement_timeout ends SQL; the pool remains reusable', async () => {
    const locker = await admin.connect();
    let work: ReturnType<ReturnType<typeof createExperimentalRevocationReader>> | undefined;
    try {
      await locker.query('BEGIN');
      await locker.query(
        'LOCK TABLE youlin_security_spike.subject_states IN ACCESS EXCLUSIVE MODE',
      );
      const reader = createExperimentalRevocationReader(drizzle(poolA));
      const gate = createRevocationGate({
        enabled: true,
        readTimeoutMs: 150,
        readAuthoritativeState: (s, abort) => {
          work = reader(s, abort);
          return work;
        },
      });
      const decision = gate(context);
      const deadline = Date.now() + 1000;
      let waiting = false;
      while (Date.now() < deadline) {
        const activity = await admin.query(
          "SELECT 1 FROM pg_stat_activity WHERE application_name='youlin-reader-a' AND wait_event_type='Lock'",
        );
        if (activity.rowCount) {
          waiting = true;
          break;
        }
        await sleep(10);
      }
      expect(waiting).toBe(true);
      expect(await decision).toEqual({ status: 'deny', reason: 'STATE_UNAVAILABLE' });
      // Gate's AbortSignal does not cancel the pg query: verify it is still waiting.
      expect(
        (
          await admin.query(
            "SELECT 1 FROM pg_stat_activity WHERE application_name='youlin-reader-a' AND wait_event_type='Lock'",
          )
        ).rowCount,
      ).toBe(1);
      await expect(work).rejects.toMatchObject({ cause: { code: '57014' } });
      expect(
        (
          await admin.query(
            "SELECT 1 FROM pg_stat_activity WHERE application_name='youlin-reader-a' AND wait_event_type='Lock'",
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      try {
        await locker.query('ROLLBACK');
      } finally {
        locker.release();
      }
    }
    expect((await readA())?.authEpoch).toBe(7);
    expect(poolA.totalCount).toBe(1);
  });

  it('storage permission failure is fail-closed rather than an active-state fallback', async () => {
    await admin.query('REVOKE SELECT ON youlin_security_spike.subject_states FROM youlin_reader');
    expect(await gateA()(context)).toEqual({ status: 'deny', reason: 'STATE_UNAVAILABLE' });
  });

  it('round-trips the safe integer maximum and rejects an out-of-range stored epoch', async () => {
    await admin.query(
      'UPDATE youlin_security_spike.subject_states SET auth_epoch=$1 WHERE subject_kind=$2',
      [Number.MAX_SAFE_INTEGER, 'user'],
    );
    expect((await readA())?.authEpoch).toBe(Number.MAX_SAFE_INTEGER);
    await expect(
      admin.query(
        'UPDATE youlin_security_spike.subject_states SET auth_epoch=$1 WHERE subject_kind=$2',
        [Number.MAX_SAFE_INTEGER + 1, 'user'],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect((await readA())?.authEpoch).toBe(Number.MAX_SAFE_INTEGER);
  });
});
