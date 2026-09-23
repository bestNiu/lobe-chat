import assert from 'node:assert/strict';

import { createRevocationGate } from '../revocationGate.ts';

const context = () => ({ authEpoch: 7, subjectRef: { id: 'synthetic-user-1', kind: 'user' } });
const state = () => ({ ...context(), disabled: false, sourceVersion: 12 });
const gate = (readAuthoritativeState = async () => state(), extra = {}) =>
  createRevocationGate({ enabled: true, readAuthoritativeState, readTimeoutMs: 1000, ...extra });
const denied = (reason) => ({ reason, status: 'deny' });
const next = { status: 'continue_authorization' };

// Shared behavioral suite: Vitest in the normal repository toolchain, Node's
// native runner for an explicitly scoped, dependency-free smoke run.
export function registerRevocationGateTests(test) {
  test('defaults off and performs no state read', async () => {
    let calls = 0;
    const check = createRevocationGate({
      readAuthoritativeState: async () => {
        calls++;
        return state();
      },
    });
    assert.deepEqual(await check(context()), denied('FEATURE_DISABLED'));
    assert.equal(calls, 0);
  });

  test('only boolean true enables the gate', async () => {
    for (const enabled of [false, undefined, 'true', 1]) {
      assert.deepEqual(await gate(undefined, { enabled })(context()), denied('FEATURE_DISABLED'));
    }
  });

  test('requires an explicit reader and valid bounded timeout', async () => {
    const configurations = [
      { readAuthoritativeState: undefined },
      ...[undefined, null, '100', 0, -1, 1.5, Infinity, 2_147_483_648].map((readTimeoutMs) => ({
        readTimeoutMs,
      })),
    ];
    for (const config of configurations) {
      assert.deepEqual(await gate(undefined, config)(context()), denied('NOT_CONFIGURED'));
    }
  });

  test('a current active user may only CONTINUE authorization, not receive allow', async () => {
    assert.deepEqual(await gate()(context()), next);
    assert.equal('allow' in (await gate()(context())), false);
  });

  test('supports an explicitly authenticated service subject without granting workload rights', async () => {
    const input = context();
    input.subjectRef.kind = 'service';
    const current = { ...input, disabled: false, sourceVersion: 12 };
    assert.deepEqual(await gate(async () => current)(input), next);
  });

  test('disabled subjects are denied even when epochs match', async () => {
    assert.deepEqual(
      await gate(async () => ({ ...state(), disabled: true }))(context()),
      denied('DISABLED'),
    );
  });

  test('old credential epoch is rejected', async () => {
    assert.deepEqual(
      await gate(async () => ({ ...state(), authEpoch: 8 }))(context()),
      denied('EPOCH_MISMATCH'),
    );
  });

  test('a credential from a future epoch is also rejected', async () => {
    assert.deepEqual(await gate()({ ...context(), authEpoch: 8 }), denied('EPOCH_MISMATCH'));
  });

  test('a missing subject state does not default to active', async () => {
    assert.deepEqual(await gate(async () => null)(context()), denied('STATE_UNAVAILABLE'));
  });

  test('malformed state and unsafe versions fail closed', async () => {
    for (const current of [
      undefined,
      {},
      'invalid',
      [],
      { ...state(), disabled: 'false' },
      { ...state(), disabled: undefined },
      { ...state(), authEpoch: -1 },
      { ...state(), authEpoch: 1.5 },
      { ...state(), authEpoch: Number.MAX_SAFE_INTEGER + 1 },
      { ...state(), sourceVersion: -1 },
      { ...state(), sourceVersion: true },
      { ...state(), subjectRef: null },
    ]) {
      assert.deepEqual(await gate(async () => current)(context()), denied('STATE_UNAVAILABLE'));
    }
  });

  test('a state for a different subject cannot authorize the requested subject', async () => {
    const current = state();
    current.subjectRef.id = 'synthetic-other';
    assert.deepEqual(await gate(async () => current)(context()), denied('STATE_UNAVAILABLE'));
  });

  test('same ID with different subject kind is not interchangeable', async () => {
    const current = state();
    current.subjectRef.kind = 'service';
    assert.deepEqual(await gate(async () => current)(context()), denied('STATE_UNAVAILABLE'));
  });

  test('malformed authenticated context is denied before IO', async () => {
    let calls = 0;
    const check = gate(async () => {
      calls++;
      return state();
    });
    for (const input of [
      null,
      undefined,
      {},
      { ...context(), authEpoch: true },
      { ...context(), authEpoch: -1 },
    ]) {
      assert.deepEqual(await check(input), denied('INVALID_CONTEXT'));
    }
    for (const id of ['', 'a\n', 'has space', '../id', 'a'.repeat(129)]) {
      assert.deepEqual(
        await check({ ...context(), subjectRef: { id, kind: 'user' } }),
        denied('INVALID_CONTEXT'),
      );
    }
    assert.equal(calls, 0);
  });

  test('reader rejection does not escape or disclose the adapter error', async () => {
    const check = gate(async () => {
      throw new Error('synthetic-sensitive-provider-detail');
    });
    assert.deepEqual(await check(context()), denied('STATE_UNAVAILABLE'));
  });

  test('synchronous reader failure also fails closed', async () => {
    const check = gate(() => {
      throw new Error('synthetic-sync-failure');
    });
    assert.deepEqual(await check(context()), denied('STATE_UNAVAILABLE'));
  });

  test('a hung read times out and is signalled to abort', async () => {
    let signal;
    const check = gate(
      async (_subject, abortSignal) => {
        signal = abortSignal;
        return new Promise(() => {});
      },
      { readTimeoutMs: 5 },
    );
    assert.deepEqual(await check(context()), denied('STATE_UNAVAILABLE'));
    assert.equal(signal.aborted, true);
  });

  test('a late successful read cannot change the already denied result', async () => {
    let finish;
    const check = gate(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      { readTimeoutMs: 5 },
    );
    const result = await check(context());
    finish(state());
    await Promise.resolve();
    assert.deepEqual(result, denied('STATE_UNAVAILABLE'));
  });

  test('a late rejection after timeout is handled by the race', async () => {
    let fail;
    const check = gate(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
      { readTimeoutMs: 5 },
    );
    assert.deepEqual(await check(context()), denied('STATE_UNAVAILABLE'));
    fail(new Error('synthetic-late-rejection'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test('each call rereads state instead of caching a previous success', async () => {
    let current = state();
    let reads = 0;
    const check = gate(async () => {
      reads++;
      return current;
    });
    assert.deepEqual(await check(context()), next);
    current = { ...current, authEpoch: 8, disabled: true };
    assert.deepEqual(await check(context()), denied('DISABLED'));
    assert.equal(reads, 2);
  });

  test('concurrent subjects cannot exchange state', async () => {
    const pending = new Map();
    const check = gate((subject) => new Promise((resolve) => pending.set(subject.id, resolve)));
    const a = context();
    const b = { ...context(), subjectRef: { id: 'synthetic-user-2', kind: 'user' } };
    const resultA = check(a);
    const resultB = check(b);
    pending.get(b.subjectRef.id)({ ...b, disabled: true, sourceVersion: 12 });
    pending.get(a.subjectRef.id)(state());
    assert.deepEqual(await resultA, next);
    assert.deepEqual(await resultB, denied('DISABLED'));
  });

  test('caller mutation during a read cannot change the checked subject or epoch', async () => {
    let finish;
    const input = context();
    const check = gate(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = check(input);
    input.subjectRef.id = 'synthetic-other';
    input.authEpoch = 99;
    finish(state());
    assert.deepEqual(await pending, denied('INVALID_CONTEXT'));
  });

  test('the adapter receives an immutable subject reference', async () => {
    const check = gate(async (subject) => {
      assert.equal(Object.isFrozen(subject), true);
      assert.throws(() => {
        subject.id = 'synthetic-other';
      }, TypeError);
      return state();
    });
    assert.deepEqual(await check(context()), next);
  });

  test('the maximum safe epoch is compared without truncation or wrapping', async () => {
    const input = { ...context(), authEpoch: Number.MAX_SAFE_INTEGER };
    const current = { ...state(), authEpoch: Number.MAX_SAFE_INTEGER };
    assert.deepEqual(await gate(async () => current)(input), next);
  });

  test('configuration changes require constructing a new gate', async () => {
    const options = {
      enabled: false,
      readAuthoritativeState: async () => state(),
      readTimeoutMs: 1000,
    };
    const check = createRevocationGate(options);
    options.enabled = true;
    assert.deepEqual(await check(context()), denied('FEATURE_DISABLED'));
    assert.deepEqual(await createRevocationGate(options)(context()), next);
  });
}
