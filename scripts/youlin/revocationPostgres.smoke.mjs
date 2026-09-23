// Explicit isolated PostgreSQL experiment; never uses an existing database URL.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { createRevocationGate } from '../../apps/server/src/modules/YoulinSecurity/revocationGate.ts';
import { createPostgresHarness, runProcess } from './postgresHarness.mjs';

let db;
before(async () => { db = await createPostgresHarness(); });
after(async () => { await db?.cleanup(); });
beforeEach(async () => {
  await db.query(`TRUNCATE youlin_security_spike.command_receipts,
    youlin_security_spike.outbox_events, youlin_security_spike.audit_events,
    youlin_security_spike.subject_states;
    INSERT INTO youlin_security_spike.subject_states
      (subject_kind, subject_id, auth_epoch, source_version, disabled)
    VALUES ('user','synthetic-a',7,12,false), ('user','synthetic-b',7,12,false),
           ('service','synthetic-a',7,12,false);`);
});

const command = (overrides = {}) => ({
  actor_kind: 'user', actor_id: 'synthetic-admin', key: 'synthetic-key-1',
  subject_kind: 'user', subject_id: 'synthetic-a', expected_epoch: 7,
  source_version: 13, reason: 'employment_ended', request_id: 'synthetic-request-1', ...overrides,
});
const revokeSql = `SELECT youlin_security_spike.revoke_subject(
  :'actor_kind', :'actor_id', :'key', :'subject_kind', :'subject_id',
  :'expected_epoch'::bigint, :'source_version'::bigint, :'reason', :'request_id');`;
const revoke = (overrides) => db.json(revokeSql, command(overrides));
const readState = (id = 'synthetic-a', kind = 'user', signal) => db.json(
  `SELECT youlin_security_spike.read_subject_state(:'kind', :'id');`, { id, kind }, signal);
const counts = () => db.json(`SELECT jsonb_build_array(
  (SELECT count(*) FROM youlin_security_spike.audit_events),
  (SELECT count(*) FROM youlin_security_spike.outbox_events),
  (SELECT count(*) FROM youlin_security_spike.command_receipts));`);
const original = { authEpoch: 7, disabled: false, sourceVersion: 12,
  subjectRef: { kind: 'user', id: 'synthetic-a' } };
const assertUnchanged = async () => {
  assert.deepEqual(await readState(), original);
  assert.deepEqual(await counts(), [0, 0, 0]);
};

test('commits deny, audit, outbox and receipt together; emitted event matches K03', async () => {
  const result = await revoke();
  assert.equal(result.authEpoch, 8);
  assert.deepEqual(await readState(), { ...original, authEpoch: 8, sourceVersion: 13, disabled: true });
  assert.deepEqual(await counts(), [1, 1, 1]);
  const event = await db.json('SELECT payload FROM youlin_security_spike.outbox_events;');
  assert.equal(event.id, result.eventId);
  assert.equal(event.data.auditRef, result.auditId);
  const checker = new URL('../../docs/youlin-enterprise-ai-platform/plan/specs/contracts/executable/', import.meta.url).pathname;
  await runProcess('python3', ['-c',
    'import json,sys; sys.path.insert(0,sys.argv[1]); from check_contracts import validate; validate("SubjectRevokedEvent",json.load(sys.stdin))', checker], JSON.stringify(event));
});

test('retries with a new request ID return the original receipt without duplicate writes', async () => {
  const first = await revoke();
  const retry = await revoke({ request_id: 'synthetic-retry-request' });
  assert.deepEqual(retry, first);
  assert.deepEqual(await counts(), [1, 1, 1]);
});

test('same actor/key with changed payload is an idempotency conflict', async () => {
  await revoke();
  await assert.rejects(revoke({ reason: 'security_response' }), /IDEMPOTENCY_CONFLICT/);
  assert.deepEqual(await counts(), [1, 1, 1]);
});

test('key reuse across subjects cannot revoke the second subject', async () => {
  await revoke();
  await assert.rejects(revoke({ subject_id: 'synthetic-b' }), /IDEMPOTENCY_CONFLICT/);
  assert.equal((await readState('synthetic-b')).disabled, false);
  assert.deepEqual(await counts(), [1, 1, 1]);
});

test('idempotency receipts are actor-bound, not globally shared', async () => {
  await revoke();
  await revoke({ actor_id: 'synthetic-other-admin', subject_id: 'synthetic-b' });
  assert.deepEqual(await counts(), [2, 2, 2]);
});

test('stale source versions are rejected with no partial writes', async () => {
  for (const source_version of [11, 12]) {
    await assert.rejects(revoke({ source_version }), /STALE_SOURCE/);
    await assertUnchanged();
  }
});

test('CAS rejects stale expected epoch without writing audit or outbox', async () => {
  await assert.rejects(revoke({ expected_epoch: 6 }), /EPOCH_CONFLICT/);
  await assertUnchanged();
});

test('unknown subjects are not automatically created or activated', async () => {
  await assert.rejects(revoke({ subject_id: 'synthetic-missing' }), /SUBJECT_NOT_FOUND/);
  assert.equal(await readState('synthetic-missing'), null);
  await assertUnchanged();
});

test('user and service with identical IDs have independent global states', async () => {
  await revoke();
  assert.equal((await readState('synthetic-a', 'service')).disabled, false);
  assert.equal((await readState('synthetic-b')).disabled, false);
});

test('concurrent identical commands produce one transition and one receipt', async () => {
  const [a, b] = await Promise.all([revoke(), revoke()]);
  assert.deepEqual(a, b);
  assert.deepEqual(await counts(), [1, 1, 1]);
  assert.equal((await readState()).authEpoch, 8);
});

test('concurrent reuse of one key across subjects has one winner and no second revocation', async () => {
  const results = await Promise.allSettled([revoke(), revoke({ subject_id: 'synthetic-b' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(results.find((r) => r.status === 'rejected').reason.message, /IDEMPOTENCY_CONFLICT/);
  assert.deepEqual(await counts(), [1, 1, 1]);
  const states = await Promise.all([readState(), readState('synthetic-b')]);
  assert.equal(states.filter((s) => s.disabled).length, 1);
});

test('concurrent different commands on one epoch have exactly one CAS winner', async () => {
  const results = await Promise.allSettled([revoke(), revoke({ key: 'synthetic-key-2', source_version: 14 })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.match(rejected.reason.message, /EPOCH_CONFLICT/);
  assert.deepEqual(await counts(), [1, 1, 1]);
});

test('an audit insert failure rolls back the deny update', async () => {
  await db.query(`ALTER TABLE youlin_security_spike.audit_events
    ADD CONSTRAINT synthetic_audit_failure CHECK (reason_code <> 'security_response');`);
  try {
    await assert.rejects(revoke({ reason: 'security_response' }), /synthetic_audit_failure/);
    await assertUnchanged();
  } finally {
    await db.query('ALTER TABLE youlin_security_spike.audit_events DROP CONSTRAINT synthetic_audit_failure;');
  }
});

test('an outbox failure rolls back deny and audit; the same key can retry after repair', async () => {
  await db.query(`ALTER TABLE youlin_security_spike.outbox_events
    ADD CONSTRAINT synthetic_outbox_failure CHECK (false) NOT VALID;`);
  try {
    await assert.rejects(revoke(), /synthetic_outbox_failure/);
    await assertUnchanged();
  } finally {
    await db.query('ALTER TABLE youlin_security_spike.outbox_events DROP CONSTRAINT synthetic_outbox_failure;');
  }
  await revoke();
  assert.deepEqual(await counts(), [1, 1, 1]);
});

test('a receipt failure rolls back deny, audit and outbox together', async () => {
  await db.query(`ALTER TABLE youlin_security_spike.command_receipts
    ADD CONSTRAINT synthetic_receipt_failure CHECK (false) NOT VALID;`);
  try {
    await assert.rejects(revoke(), /synthetic_receipt_failure/);
    await assertUnchanged();
  } finally {
    await db.query('ALTER TABLE youlin_security_spike.command_receipts DROP CONSTRAINT synthetic_receipt_failure;');
  }
});

test('terminating only the synthetic transaction backend before COMMIT rolls back all writes', async () => {
  await assert.rejects(db.query(`BEGIN; ${revokeSql}
    SELECT pg_terminate_backend(pg_backend_pid()); COMMIT;`, command()), /terminating|closed|lost/i);
  await assertUnchanged();
});

test('an old replay after a newer revocation never restores an older epoch', async () => {
  const first = await revoke();
  await revoke({ key: 'synthetic-key-2', expected_epoch: 8, source_version: 14 });
  assert.deepEqual(await revoke(), first);
  assert.equal((await readState()).authEpoch, 9);
  assert.deepEqual(await counts(), [2, 2, 2]);
});

test('safe-integer exhaustion never wraps the epoch', async () => {
  await db.query(`UPDATE youlin_security_spike.subject_states
    SET auth_epoch=9007199254740991 WHERE subject_kind='user' AND subject_id='synthetic-a';`);
  await assert.rejects(revoke({ expected_epoch: Number.MAX_SAFE_INTEGER }), /EPOCH_EXHAUSTED/);
  assert.equal((await readState()).authEpoch, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(await counts(), [0, 0, 0]);
});

test('quoted synthetic values are bound as data and cannot inject SQL', async () => {
  await assert.rejects(revoke({ subject_id: "synthetic-a'; DELETE FROM youlin_security_spike.subject_states; --" }), /SUBJECT_NOT_FOUND/);
  await assertUnchanged();
});

test('the existing TypeScript gate rereads PostgreSQL and denies after committed revocation', async () => {
  const check = createRevocationGate({ enabled: true, readTimeoutMs: 3000,
    readAuthoritativeState: (subject, signal) => readState(subject.id, subject.kind, signal) });
  const input = { authEpoch: 7, subjectRef: { kind: 'user', id: 'synthetic-a' } };
  assert.deepEqual(await check(input), { status: 'continue_authorization' });
  await revoke();
  assert.deepEqual(await check(input), { reason: 'DISABLED', status: 'deny' });
});
