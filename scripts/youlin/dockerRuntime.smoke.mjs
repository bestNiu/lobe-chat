// Must run through dockerNode.mjs, never as a host-side environment test.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('runtime is a non-root container', () => {
  assert.ok(existsSync('/.dockerenv'));
  assert.notEqual(process.getuid(), 0);
});

test('runtime has no external network and has enforced resource caps', () => {
  assert.deepEqual(readdirSync('/sys/class/net'), ['lo']);
  assert.equal(readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim(), '2147483648');
  assert.equal(readFileSync('/sys/fs/cgroup/memory.swap.max', 'utf8').trim(), '0');
  assert.equal(readFileSync('/sys/fs/cgroup/pids.max', 'utf8').trim(), '128');
  const [quota, period] = readFileSync('/sys/fs/cgroup/cpu.max', 'utf8')
    .trim()
    .split(' ')
    .map(Number);
  assert.equal(quota / period, 2);
});

test('host environment, credentials, private documents and Docker socket are absent', () => {
  for (const key of ['DATABASE_URL', 'PGHOST', 'PGPASSWORD'])
    assert.equal(process.env[key], undefined);
  for (const file of [
    '/workspace/.git/credentials',
    '/workspace/.env',
    '/workspace/docs/youlin-enterprise-ai-platform/know',
    '/var/run/docker.sock',
  ]) {
    assert.equal(existsSync(file), false, file);
  }
});

test('real formatting configs are mounted and source is read-only', () => {
  for (const file of [
    'prettier.config.mjs',
    '.editorconfig',
    'eslint.config.mjs',
    'eslint-suppressions.json',
  ]) {
    accessSync(`/workspace/${file}`, constants.R_OK);
  }
  assert.throws(() => accessSync('/workspace/scripts/youlin/dockerRuntime.mjs', constants.W_OK), {
    code: 'EROFS',
  });
});

test('home and tool data directories are writable ephemeral locations', () => {
  for (const base of [homedir(), process.env.XDG_DATA_HOME, process.env.XDG_CACHE_HOME]) {
    assert.ok(base.startsWith('/tmp'));
    const scratch = path.join(base, `youlin-${randomUUID()}`);
    try {
      mkdirSync(scratch, { recursive: true });
      writeFileSync(path.join(scratch, 'probe'), 'synthetic');
      assert.equal(readFileSync(path.join(scratch, 'probe'), 'utf8'), 'synthetic');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
