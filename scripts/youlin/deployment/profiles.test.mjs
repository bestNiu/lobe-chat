import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareBuild } from './prepare.mjs';
import { createBuildProfile, frontendVariants, sourceEntries } from './profiles.mjs';

const options = {
  repository: '/checkout',
  artifacts: '/artifacts/run',
  uid: 1000,
  gid: 1000,
  image: `sha256:${'a'.repeat(64)}`,
};

test('all six build services are bounded, offline and non-root without real credentials', () => {
  const { services } = createBuildProfile(options);
  assert.deepEqual(Object.keys(services), [...frontendVariants, 'backend']);
  for (const service of Object.values(services)) {
    assert.equal(service.mem_limit, '6g');
    assert.equal(service.memswap_limit, '6g');
    assert.equal(service.cpus, 2);
    assert.equal(service.pids_limit, 128);
    assert.equal(service.network_mode, 'none');
    assert.equal(service.read_only, true);
    assert.equal(service.user, '1000:1000');
    assert.equal(service.pull_policy, 'never');
    assert.equal(service.env_file, undefined);
    assert.equal(service.ports, undefined);
    assert.equal(service.environment.OPENAI_API_KEY, undefined);
    assert.equal(service.environment.SMTP_PASS, undefined);
    assert.deepEqual(service.cap_drop, ['ALL']);
    for (const volume of service.volumes)
      if (volume.source.startsWith('/checkout/')) assert.equal(volume.read_only, true);
    assert.ok(
      !service.volumes.some(
        ({ source }) =>
          source === '/checkout' || source.endsWith('/.env') || source.endsWith('/.git'),
      ),
    );
  }
  assert.ok(sourceEntries.includes('index.html'));
  assert.equal(services.mobile.environment.MOBILE, 'true');
  assert.equal(services.auth.environment.AUTH, 'true');
  assert.equal(services.backend.environment.WORKBENCH_REQUIRED, '1');
  assert.equal(services.backend.environment.SHARE_REQUIRED, '1');
});

test('rejects privileged/unpinned/in-checkout output profiles', () => {
  for (const change of [
    { uid: 0 },
    { image: 'node:latest' },
    { artifacts: '/checkout' },
    { artifacts: '/checkout/build' },
    { artifacts: '/checkout/..hidden' },
    { artifacts: 'relative' },
  ])
    assert.throws(() => createBuildProfile({ ...options, ...change }));
});

test('preparation preserves originals, excludes desktop only in the private copy and never copies root env', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'youlin-profile-test-'));
  const repository = path.join(temporary, 'repo');
  try {
    await mkdir(path.join(repository, 'src/app/desktop'), { recursive: true });
    await mkdir(path.join(repository, 'public'), { recursive: true });
    await writeFile(path.join(repository, 'tsconfig.json'), '{}');
    await writeFile(path.join(repository, 'src/app/desktop/page.tsx'), 'synthetic');
    await writeFile(path.join(repository, '.env'), 'SYNTHETIC_DO_NOT_COPY=fixture');
    const artifacts = await prepareBuild({ repository, parent: temporary, image: options.image });
    assert.equal((await stat(artifacts)).mode & 0o777, 0o700);
    assert.equal((await stat(path.join(artifacts, 'compose.json'))).mode & 0o777, 0o600);
    await stat(path.join(repository, 'src/app/desktop/page.tsx'));
    await assert.rejects(stat(path.join(artifacts, 'source-app/desktop')), { code: 'ENOENT' });
    await assert.rejects(stat(path.join(artifacts, '.env')), { code: 'ENOENT' });
    const profile = JSON.parse(await readFile(path.join(artifacts, 'compose.json'), 'utf8'));
    assert.equal(Object.keys(profile.services).length, 6);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('rejects auto-loadable micro-app env files before creating build artifacts', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'youlin-profile-env-test-'));
  const repository = path.join(temporary, 'repo');
  try {
    await mkdir(path.join(repository, 'apps/share'), { recursive: true });
    await writeFile(path.join(repository, 'apps/share/.env.production'), 'SYNTHETIC=fixture');
    await assert.rejects(
      prepareBuild({ repository, parent: temporary, image: options.image }),
      /APP_LOCAL_ENV_FILE_PRESENT/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
