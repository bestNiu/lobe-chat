import assert from 'node:assert/strict';
import test from 'node:test';

import { getAuthConfig } from '../../../packages/env/src/auth.ts';
import { createLocalInstanceProfile } from './localInstanceProfile.mjs';

const input = { artifacts: '/private/instance', image: `sha256:${'a'.repeat(64)}`, port: 33210 };

test('persistent quarantine publishes only loopback and retains the authoritative database volume', () => {
  const profile = createLocalInstanceProfile(input);
  assert.deepEqual(profile.services.app.ports, [
    { host_ip: '127.0.0.1', published: '33210', target: 3210 },
  ]);
  assert.deepEqual(profile.volumes, { database: {} });
  assert.equal(profile.services.postgres.volumes[0].type, 'volume');
  for (const name of ['app', 'postgres', 'redis'])
    assert.equal(profile.services[name].restart, 'unless-stopped');
  assert.equal(profile.services.postgres.ports, undefined);
  assert.equal(profile.services.redis.ports, undefined);
  assert.equal(profile.networks.default.internal, true);
  assert.equal(profile.services.probe, undefined);
});

test('quarantine overrides env files to keep password registration, SSO and gateway inactive', () => {
  const { environment } = createLocalInstanceProfile(input).services.app;
  assert.equal(environment.AUTH_DISABLE_EMAIL_PASSWORD, '1');
  assert.equal(environment.AUTH_SSO_PROVIDERS, '');
  assert.equal(environment.AUTH_ENABLE_MAGIC_LINK, '0');
  assert.equal(environment.OPENAI_API_KEY, '');
  assert.equal(environment.APP_URL, 'http://127.0.0.1:33210');
});

test('enables only the two fixed Youlin debug namespaces so a denial is diagnosable', () => {
  const { DEBUG } = createLocalInstanceProfile(input).services.app.environment;
  assert.equal(DEBUG, 'lobe-app:youlin-enterprise-auth,lobe-server:youlin-identity');
  for (const namespace of DEBUG.split(',')) {
    assert.ok(namespace.startsWith('lobe-'), 'namespace must stay in the Youlin/Lobe scope');
    assert.ok(!namespace.includes('*'), 'wildcard debugging is not allowed in the instance');
    assert.ok(!namespace.includes('better-auth'), 'upstream auth internals stay off');
  }
});

test('upstream auth parser actually disables password enrollment in quarantine', () => {
  const keys = ['AUTH_DISABLE_EMAIL_PASSWORD', 'AUTH_ENABLE_MAGIC_LINK', 'AUTH_SSO_PROVIDERS'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const { environment } = createLocalInstanceProfile(input).services.app;
  try {
    for (const key of keys) process.env[key] = environment[key];
    const auth = getAuthConfig();
    assert.equal(auth.AUTH_DISABLE_EMAIL_PASSWORD, true);
    assert.equal(auth.AUTH_ENABLE_MAGIC_LINK, false);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('rejects invalid ports and mutable images', () => {
  for (const port of [0, 80, 65536, 33210.5, NaN, '33210'])
    assert.throws(() => createLocalInstanceProfile({ ...input, port }));
  assert.throws(() => createLocalInstanceProfile({ ...input, image: 'youlin:latest' }));
});
