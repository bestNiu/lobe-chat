import assert from 'node:assert/strict';
import test from 'node:test';

import { parseVerificationMode } from './verificationMode.mjs';

test('default and SQL modes keep their distinct scopes', () => {
  assert.equal(parseVerificationMode([]).identitySuite, false);
  assert.equal(parseVerificationMode(['--sql']).sqlSuite, true);
});
test('unsharded identity remains available without changing the suite selector', () => {
  assert.equal(parseVerificationMode(['--identity']).identitySuite, true);
  assert.equal(parseVerificationMode(['--identity']).identityShard, undefined);
});
test('both complementary identity shards are accepted', () => {
  for (const shard of ['1/2', '2/2']) {
    const mode = parseVerificationMode(['--identity', `--identity-shard=${shard}`]);
    assert.equal(mode.identityShard, shard);
    assert.equal(mode.identitySuite, true);
    assert.equal(mode.schemaOnly, false);
  }
});
test('invalid or duplicated shard selectors fail before environment allocation', () => {
  for (const shard of ['', '0/2', '3/2', '1/1', '1/100', '1/2 --exclude tests'])
    assert.throws(() => parseVerificationMode(['--identity', `--identity-shard=${shard}`]));
  assert.throws(() =>
    parseVerificationMode(['--identity', '--identity-shard=1/2', '--identity-shard=2/2']),
  );
});
test('shards cannot disguise SQL or schema-only checks as identity behavior coverage', () => {
  for (const args of [
    ['--identity-shard=1/2'],
    ['--sql', '--identity-shard=1/2'],
    ['--identity', '--schema-only', '--identity-shard=1/2'],
    ['--identity', '--sql'],
  ])
    assert.throws(() => parseVerificationMode(args));
});
test('artifact and schema-only modes are retained and unknown flags rejected', () => {
  assert.equal(
    parseVerificationMode(['--identity-artifacts=/tmp/synthetic', '--schema-only']).schemaOnly,
    true,
  );
  for (const args of [
    ['--schema-only'],
    ['--identity-artifacts='],
    ['--identity', '--identity'],
    ['--exclude=tests'],
  ])
    assert.throws(() => parseVerificationMode(args));
});
