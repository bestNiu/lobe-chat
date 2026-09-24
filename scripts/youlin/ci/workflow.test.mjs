import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseDocument } from 'yaml';

const path = new URL('../../../.github/workflows/youlin-verify.yml', import.meta.url);
const document = parseDocument(await readFile(path, 'utf8'), { uniqueKeys: true });
assert.deepEqual(document.errors, []);
const workflow = document.toJS();
const gate =
  "${{ vars.YOULIN_SYNTHETIC_CI == 'true' && github.ref_protected && github.ref_type == 'branch' && github.ref_name == github.event.repository.default_branch }}";

const assertTrustBoundary = (candidate) => {
  assert.deepEqual(Object.keys(candidate.on), ['workflow_dispatch']);
  assert.deepEqual(candidate.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(candidate.jobs), ['verify']);
  assert.equal(candidate.jobs.verify.if, gate);
  assert.deepEqual(candidate.jobs.verify['runs-on'], [
    'self-hosted',
    'linux',
    'x64',
    'youlin-synthetic-docker',
  ]);
  assert.equal(candidate.jobs.verify.environment, 'youlin-synthetic-ci');
  assert.equal(candidate.concurrency['cancel-in-progress'], false);
  assert.equal(candidate.jobs.verify['timeout-minutes'], 20);
  assert.equal(JSON.stringify(candidate).includes('secrets.'), false);
  assert.equal(
    candidate.jobs.verify.steps.some((step) => step.uses),
    false,
  );
};

test('workflow is opt-in, serialized and restricted to a protected default branch', () => {
  assertTrustBoundary(workflow);
});

test('contract rejects fork-trigger and unprotected-ref regressions', () => {
  const fork = structuredClone(workflow);
  fork.on.pull_request_target = {};
  assert.throws(() => assertTrustBoundary(fork));
  const unprotected = structuredClone(workflow);
  unprotected.jobs.verify.if = '${{ always() }}';
  assert.throws(() => assertTrustBoundary(unprotected));
});

test('prepared runner must match the dispatched commit and reject dirty source', () => {
  const preflight = workflow.jobs.verify.steps[0].run;
  for (const requirement of [
    'git rev-parse HEAD',
    '$EXPECTED_SHA',
    'git diff --exit-code --quiet',
    'git diff --cached --exit-code --quiet',
    'git ls-files --others --exclude-standard',
    'test ! -e .env',
    'umask 077',
  ])
    assert.ok(preflight.includes(requirement), requirement);
  assert.equal(workflow.jobs.verify.env.EXPECTED_SHA, '${{ github.sha }}');
});

test('all test, type and document workloads use Docker coordinators', () => {
  const checks = workflow.jobs.verify.steps.slice(1, -1);
  assert.equal(checks.length, 10);
  for (const step of checks) {
    assert.match(
      step.run,
      /^node scripts\/youlin\/(dockerNode|nodePostgres\.smoke|identity\.smoke)\.mjs /,
    );
    assert.match(step.run, /\$EVIDENCE_DIR\/[a-z-]+\.txt/);
    assert.doesNotMatch(
      step.run,
      /(?:sudo|prune|curl|wget|\|\||bun run test|pnpm install|npm install)/,
    );
    assert.equal(step['continue-on-error'], undefined);
  }
  const shards = checks.filter(({ run }) => run.includes('nodePostgres.smoke.mjs --identity'));
  assert.equal(shards.length, 2);
  assert.ok(shards[0].run.includes('--identity-shard=1/2'));
  assert.ok(shards[1].run.includes('--identity-shard=2/2'));
  assert.ok(checks.some(({ run }) => run.includes('identityTypes.mjs')));
});

test('raw artifacts remain private and completion does not claim UAT', () => {
  const summary = workflow.jobs.verify.steps.at(-1);
  assert.equal(summary.if, 'always()');
  assert.match(summary.run, /not full repository gates or product UAT/);
  assert.match(summary.run, /including on cancellation/);
});
