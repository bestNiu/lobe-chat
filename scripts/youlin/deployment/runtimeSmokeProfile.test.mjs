import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeSmokeProfile, runtimeImages } from './runtimeSmokeProfile.mjs';

const input = { artifacts: '/private/synthetic-smoke', image: `sha256:${'b'.repeat(64)}` };

test('runtime is a portless internal synthetic project with immutable cached images', () => {
  const profile = createRuntimeSmokeProfile(input);
  assert.equal(profile.networks.default.internal, true);
  assert.deepEqual(profile.volumes, { database: {} });
  for (const service of Object.values(profile.services)) {
    assert.equal(service.pull_policy, 'never');
    assert.equal(service.ports, undefined);
    assert.equal(service.container_name, undefined);
    assert.equal(service.mem_limit, service.memswap_limit);
    assert.ok(service.cpus <= 1);
    assert.ok(service.pids_limit <= 128);
    assert.ok(service.image.startsWith('sha256:') || /@sha256:[a-f0-9]{64}$/.test(service.image));
  }
  assert.equal(profile.services.app.read_only, true);
  assert.equal(profile.services.app.user, '1000:1000');
  assert.equal(profile.services.app.depends_on.migrate.condition, 'service_completed_successfully');
  assert.equal(profile.services.migrate.env_file[0], '/private/synthetic-smoke/migration.env');
  assert.notDeepEqual(profile.services.migrate.env_file, profile.services.app.env_file);
});

test('probe and migration cannot silently use a mutable application tag or dotenv path interpolation', () => {
  for (const change of [
    { image: 'youlin-mvp:latest' },
    { artifacts: 'relative' },
    { artifacts: '/tmp/$SECRET' },
  ])
    assert.throws(() => createRuntimeSmokeProfile({ ...input, ...change }));
  assert.ok(Object.isFrozen(runtimeImages));
});
