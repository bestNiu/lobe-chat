import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runLoggedCommand } from './runLoggedCommand.mjs';

// These child-process assertions run inside the Docker test runner, not on the host.
test('records success/failure in exclusive private logs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'youlin-command-test-'));
  try {
    const logPath = path.join(directory, 'stdout.log');
    const result = await runLoggedCommand(
      process.execPath,
      ['-e', 'console.log("synthetic"); process.exitCode=3'],
      { logPath, timeoutMs: 3000 },
    );
    assert.equal(result.code, 3);
    assert.equal(result.timedOut, false);
    assert.match(await readFile(logPath, 'utf8'), /synthetic/);
    assert.equal((await stat(logPath)).mode & 0o777, 0o600);
    await assert.rejects(
      runLoggedCommand(process.execPath, ['-e', ''], { logPath, timeoutMs: 3000 }),
      { code: 'EEXIST' },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('bounded deadline terminates a child rather than marking partial output successful', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'youlin-command-timeout-'));
  try {
    const result = await runLoggedCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      logPath: path.join(directory, 'output.log'),
      timeoutMs: 100,
    });
    assert.equal(result.timedOut, true);
    assert.notEqual(result.code, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('abort is distinct from success even if shutdown is graceful', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'youlin-command-abort-'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    const result = await runLoggedCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      logPath: path.join(directory, 'output.log'),
      timeoutMs: 3000,
      signal: controller.signal,
    });
    assert.equal(result.aborted, true);
    assert.equal(result.timedOut, false);
  } finally {
    clearTimeout(timer);
    await rm(directory, { recursive: true, force: true });
  }
});

test('spawn failures and pre-aborted requests reject without hanging', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'youlin-command-errors-'));
  try {
    await assert.rejects(
      runLoggedCommand('/nonexistent-youlin-executable', [], {
        logPath: path.join(directory, 'output.log'),
        timeoutMs: 1000,
      }),
      { code: 'ENOENT' },
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      runLoggedCommand(process.execPath, ['-e', ''], {
        logPath: path.join(directory, 'not-created.log'),
        timeoutMs: 1000,
        signal: controller.signal,
      }),
    );
    await assert.rejects(stat(path.join(directory, 'not-created.log')), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
