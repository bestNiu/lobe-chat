import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runProcess } from './postgresHarness.mjs';

const output = "process.stdout.write('synthetic-out'); process.stderr.write('synthetic-err');";

test('default stdout remains parseable without successful stderr diagnostics', async () => {
  assert.equal(await runProcess(process.execPath, ['-e', output]), 'synthetic-out');
});

test('diagnostic callers can capture successful stderr (docker logs uses both streams)', async () => {
  assert.equal(
    await runProcess(process.execPath, ['-e', output], '', undefined, true),
    'synthetic-outsynthetic-err',
  );
});

test('a failed process is rejected with its diagnostic', async () => {
  await assert.rejects(
    runProcess(process.execPath, [
      '-e',
      "process.stderr.write('synthetic-failure'); process.exit(3);",
    ]),
    /synthetic-failure/,
  );
});

test('abort rejects a pending child instead of returning a successful empty result', async () => {
  const controller = new AbortController();
  const pending = runProcess(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    '',
    controller.signal,
  );
  controller.abort();
  await assert.rejects(pending, /abort/i);
});
