// @vitest-environment node
import { setTimeout as sleep } from 'node:timers/promises';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRevocationGate } from '../../../../../../apps/server/src/modules/YoulinSecurity/revocationGate';
import { createExperimentalOwnedReader } from '../ownedReader';
import { createExperimentalRevocationReader } from '../reader';
import type { ExperimentalOwnedReaderOptions } from '../types';

const socket = process.env.YOULIN_NODEPG_SOCKET;
const runId = process.env.YOULIN_NODEPG_RUN;

// Only the local harness may opt in. Normal root checks must not discover a DB via env fallbacks.
describe.skipIf(!socket)('real node-postgres + Drizzle + revocation gate', () => {
  let admin: Pool;
  let poolA: Pool;
  let poolB: Pool;
  let ownedOptions: ExperimentalOwnedReaderOptions;
  const ownedReaders = new Set<ReturnType<typeof createExperimentalOwnedReader>>();
  const newOwned = (config = ownedOptions) => {
    const reader = createExperimentalOwnedReader(config);
    ownedReaders.add(reader);
    return reader;
  };
  afterEach(async () => {
    await Promise.all([...ownedReaders].map((reader) => reader.close()));
    ownedReaders.clear();
  });
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
    ownedOptions = {
      enabled: true,
      connection: {
        socketPath: socket,
        port: 5432,
        database: 'youlin_nodepg',
        user: 'youlin_reader',
        password: 'synthetic-only',
      },
      maxConnections: 1,
      connectionTimeoutMs: 1000,
      statementTimeoutMs: 1000,
      queryTimeoutMs: 2000,
    };
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

  const waitForOwnedLock = async () => {
    const deadline = Date.now() + 800;
    while (Date.now() < deadline) {
      const activity = await admin.query(
        "SELECT 1 FROM pg_stat_activity WHERE application_name='youlin-owned-reader' AND wait_event_type='Lock'",
      );
      if (activity.rowCount) return;
      await sleep(10);
    }
    throw new Error('Owned reader did not reach the controlled lock');
  };

  it('owned pool does not inherit hostile ambient connection/session/replication settings', async () => {
    vi.stubEnv('PGHOST', '/tmp/not-the-approved-socket');
    vi.stubEnv('PGDATABASE', 'not_the_database');
    vi.stubEnv('PGUSER', 'not_the_user');
    vi.stubEnv('PGPASSWORD', 'not_the_password');
    vi.stubEnv('PGOPTIONS', '-c statement_timeout=1 -c default_transaction_read_only=off');
    vi.stubEnv('PGREPLICATION', 'database');
    vi.stubEnv('PGSSLNEGOTIATION', 'direct');
    const owned = newOwned();
    try {
      expect((await owned.readAuthoritativeState(subject, signal()))?.authEpoch).toBe(7);
    } finally {
      await owned.close();
      vi.unstubAllEnvs();
    }
  });

  it('abort during acquisition rejects and releases capacity for a subsequent read', async () => {
    const owned = newOwned();
    const abort = new AbortController();
    const pending = owned.readAuthoritativeState(subject, abort.signal);
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect((await owned.readAuthoritativeState(subject, signal()))?.authEpoch).toBe(7);
  });

  it('close during acquisition does not deliver a successful result or leave shutdown pending', async () => {
    const owned = newOwned();
    const pending = owned.readAuthoritativeState(subject, signal());
    const closing = owned.close();
    await expect(pending).rejects.toThrow();
    await closing;
    await expect(owned.readAuthoritativeState(subject, signal())).rejects.toThrow('READER_CLOSED');
  });

  it('owned pool overrides role repeatable-read defaults and returns no idle transaction', async () => {
    const owned = newOwned();
    try {
      await admin.query(
        "ALTER ROLE youlin_reader SET default_transaction_isolation='repeatable read'",
      );
      expect((await owned.readAuthoritativeState(subject, signal()))?.disabled).toBe(false);
      await admin.query(revokeSql, revokeArgs);
      expect((await owned.readAuthoritativeState(subject, signal()))?.disabled).toBe(true);
      const sessions = await admin.query(
        "SELECT state, xact_start FROM pg_stat_activity WHERE application_name='youlin-owned-reader'",
      );
      expect(sessions.rows).toEqual([{ state: 'idle', xact_start: null }]);
    } finally {
      await owned.close();
      await admin.query('ALTER ROLE youlin_reader RESET default_transaction_isolation');
    }
  });

  it('owned pool snapshots config and subject input rather than retaining mutable bindings', async () => {
    if (!ownedOptions.connection) throw new Error('Missing fixture connection');
    const config = { ...ownedOptions, connection: { ...ownedOptions.connection } };
    const owned = newOwned(config);
    const mutable = { id: subject.id as string, kind: 'user' as const };
    try {
      config.connection.socketPath = '/tmp/nonexistent-mutated-socket';
      config.maxConnections = 0;
      const pending = owned.readAuthoritativeState(mutable, signal());
      mutable.id = 'missing';
      expect((await pending)?.subjectRef).toEqual(subject);
    } finally {
      await owned.close();
    }
  });

  it('owned pool retains its capacity slot after abort until bounded SQL cleanup; surplus requests fail closed', async () => {
    const owned = newOwned();
    const locker = await admin.connect();
    const abort = new AbortController();
    try {
      await locker.query('BEGIN');
      await locker.query(
        'LOCK TABLE youlin_security_spike.subject_states IN ACCESS EXCLUSIVE MODE',
      );
      const pending = owned.readAuthoritativeState(subject, abort.signal);
      const rejected = expect(pending).rejects.toMatchObject({ cause: { code: '57014' } });
      await waitForOwnedLock();
      abort.abort();
      await expect(owned.readAuthoritativeState(subject, signal())).rejects.toThrow('READER_BUSY');
      const gate = createRevocationGate({
        enabled: true,
        readAuthoritativeState: owned.readAuthoritativeState,
        readTimeoutMs: 100,
      });
      expect(await gate(context)).toEqual({ status: 'deny', reason: 'STATE_UNAVAILABLE' });
      await rejected;
    } finally {
      try {
        await locker.query('ROLLBACK');
      } finally {
        locker.release();
      }
      await owned.close();
    }
  });

  it('owned pool recovers after a server timeout instead of reusing an aborted transaction', async () => {
    const owned = newOwned();
    const locker = await admin.connect();
    try {
      await locker.query('BEGIN');
      await locker.query(
        'LOCK TABLE youlin_security_spike.subject_states IN ACCESS EXCLUSIVE MODE',
      );
      await expect(owned.readAuthoritativeState(subject, signal())).rejects.toMatchObject({
        cause: { code: '57014' },
      });
    } finally {
      try {
        await locker.query('ROLLBACK');
      } finally {
        locker.release();
      }
    }
    try {
      expect((await owned.readAuthoritativeState(subject, signal()))?.authEpoch).toBe(7);
    } finally {
      await owned.close();
    }
  });

  it('closing an owned pool rejects new work and discards an in-flight result before shutdown completes', async () => {
    const owned = newOwned();
    const locker = await admin.connect();
    let closing: Promise<void> | undefined;
    try {
      await locker.query('BEGIN');
      await locker.query(
        'LOCK TABLE youlin_security_spike.subject_states IN ACCESS EXCLUSIVE MODE',
      );
      const pending = owned.readAuthoritativeState(subject, signal());
      const rejected = expect(pending).rejects.toThrow('READER_UNAVAILABLE');
      await waitForOwnedLock();
      closing = owned.close();
      await expect(owned.readAuthoritativeState(subject, signal())).rejects.toThrow(
        'READER_CLOSED',
      );
      await locker.query('ROLLBACK');
      await rejected;
      await closing;
    } finally {
      try {
        await locker.query('ROLLBACK');
      } finally {
        locker.release();
      }
      await owned.close();
    }
  });

  it('owned pool denies permission failures and can recover after permission is restored', async () => {
    const owned = newOwned();
    try {
      await admin.query('REVOKE SELECT ON youlin_security_spike.subject_states FROM youlin_reader');
      const gate = createRevocationGate({
        enabled: true,
        readAuthoritativeState: owned.readAuthoritativeState,
        readTimeoutMs: 2000,
      });
      expect(await gate(context)).toEqual({ status: 'deny', reason: 'STATE_UNAVAILABLE' });
      await admin.query('GRANT SELECT ON youlin_security_spike.subject_states TO youlin_reader');
      expect((await owned.readAuthoritativeState(subject, signal()))?.authEpoch).toBe(7);
    } finally {
      await owned.close();
    }
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
