import assert from 'node:assert/strict';
import test from 'node:test';

import {
  instanceComposeFile,
  planMigrationConfirmation,
  planPhaseChange,
  planUpgrade,
  renderInstanceProfile,
  scopeInstanceNetwork,
  serializeComposeProfile,
  validateInstanceMetadata,
} from './localInstanceUpgrade.mjs';

const image = `sha256:${'a'.repeat(64)}`;
const next = `sha256:${'b'.repeat(64)}`;
const base = {
  artifacts: '/private/instance',
  identityPort: 33211,
  identityProvisioned: true,
  image,
  migrated: false,
  phase: 'identity-prepared',
  port: 33210,
  project: `youlin-local-${'c'.repeat(8)}-1111-4111-8111-${'d'.repeat(12)}`,
  version: 1,
};

test('upgrade rewrites every reachable phase file and records the previous image', () => {
  const plan = planUpgrade({ metadata: base, nextImage: next });
  assert.deepEqual(
    plan.composeFiles.map(({ file }) => file),
    ['compose-identity-prepared.json', 'compose-login-test.json'],
  );
  assert.equal(plan.metadata.image, next);
  assert.equal(plan.metadata.previousImage, image);
  assert.equal(plan.metadata.migrated, false);
  // The rewritten login-test profile must enable SSO/enforcement with the NEW image only.
  const login = plan.composeFiles.at(-1).profile;
  assert.equal(login.services.app.image, next);
  assert.equal(login.services.app.environment.AUTH_SSO_PROVIDERS, 'keycloak');
  assert.equal(login.services.app.environment.YOULIN_ENTERPRISE_SESSION_ENFORCEMENT, '1');
  const current = plan.composeFiles[0].profile;
  assert.equal(current.services.app.environment.AUTH_SSO_PROVIDERS, '');
  assert.equal(current.services.app.environment.YOULIN_ENTERPRISE_SESSION_ENFORCEMENT, '0');
});

test('upgrade refuses a running rewrite of the same image, foreign references and unknown phases', () => {
  assert.throws(() => planUpgrade({ metadata: base, nextImage: image }), /IMAGE_ALREADY_INSTALLED/);
  assert.throws(
    () => planUpgrade({ metadata: base, nextImage: 'youlin-mvp:latest' }),
    /INVALID_IMAGE_REFERENCE/,
  );
  assert.throws(
    () => planUpgrade({ metadata: { ...base, phase: 'production' }, nextImage: next }),
    /INVALID_INSTANCE_METADATA/,
  );
  assert.throws(
    () => planUpgrade({ metadata: { ...base, project: 'other' }, nextImage: next }),
    /INVALID_INSTANCE_METADATA/,
  );
  // A quarantined instance has no identity files to rewrite and must not invent them.
  const quarantined = planUpgrade({ metadata: { ...base, phase: 'quarantined' }, nextImage: next });
  assert.deepEqual(
    quarantined.composeFiles.map(({ file }) => file),
    ['compose.json'],
  );
});

test('login-test requires confirmed migrations against the installed image and never regresses', () => {
  assert.throws(
    () => planPhaseChange({ metadata: base, phase: 'login-test' }),
    /MIGRATIONS_NOT_CONFIRMED/,
  );
  const migrated = planMigrationConfirmation({ image, metadata: base });
  assert.equal(migrated.migrated, true);
  assert.throws(
    () => planMigrationConfirmation({ image: next, metadata: base }),
    /MIGRATION_IMAGE_MISMATCH/,
  );
  assert.throws(
    () => planMigrationConfirmation({ image, metadata: migrated }),
    /MIGRATIONS_ALREADY_CONFIRMED/,
  );
  const plan = planPhaseChange({ metadata: migrated, phase: 'login-test' });
  assert.equal(plan.loginEnabled, true);
  assert.equal(plan.composeFile, 'compose-login-test.json');
  assert.throws(
    () => planPhaseChange({ metadata: plan.metadata, phase: 'identity-prepared' }),
    /PHASE_REGRESSION_REJECTED/,
  );
  assert.throws(
    () => planPhaseChange({ metadata: plan.metadata, phase: 'login-test' }),
    /PHASE_REGRESSION_REJECTED/,
  );
});

test('Compose serialization escapes shell variables so health probes survive interpolation', () => {
  const rendered = serializeComposeProfile({
    services: {
      keycloak: {
        healthcheck: {
          test: ['CMD', 'bash', '-ec', 'read -r status <&3; [[ "$status" == *" 200 "* ]]'],
        },
      },
    },
  });
  // Compose reads the doubled form back as a single `$`, so the probe keeps its shell variable.
  assert.ok(
    JSON.parse(rendered).services.keycloak.healthcheck.test[3].includes('"$$status"'),
    rendered,
  );
  assert.equal(
    JSON.parse(rendered.replaceAll('$$', '$')).services.keycloak.healthcheck.test[3],
    'read -r status <&3; [[ "$status" == *" 200 "* ]]',
  );
  // A bare `$` that Compose would interpolate away must always be doubled.
  assert.equal(serializeComposeProfile({ v: 'a$b' }).includes('a$$b'), true);
});

test('the identity phase probe survives Compose interpolation', () => {
  const identityMetadata = {
    artifacts: '/private/instance',
    identityPort: 33211,
    identityProvisioned: true,
    image,
    phase: 'identity-prepared',
    port: 33210,
    project: `youlin-local-${'c'.repeat(8)}-1111-4111-8111-${'d'.repeat(12)}`,
    version: 1,
  };
  const rendered = serializeComposeProfile(renderInstanceProfile(identityMetadata));
  // Compose reads `$$` back as a single `$`; without it the probe compared an empty string and
  // the realm was reported unhealthy while actually serving 200.
  // The probe string contains real CR/LF bytes, so assert on the escaped fragment only.
  const composed = JSON.parse(rendered).services.keycloak.healthcheck.test.at(-1);
  assert.ok(composed.includes('read -r status <&3; [[ "$$status" == *" 200 "* ]]'), composed);
  // Compose hands the shell the single-`$` form back, so the probe reads the real status line.
  const probe = JSON.parse(rendered.replaceAll('$$', '$')).services.keycloak.healthcheck.test.at(
    -1,
  );
  assert.ok(probe.includes('read -r status <&3; [[ "$status" == *" 200 "* ]]'), probe);
  // An already-escaped value must not grow into `$$$`, which Compose would pass through literally.
  assert.ok(serializeComposeProfile({ v: 'a$$b' }).includes('"a$$b"'));
  assert.ok(serializeComposeProfile({ v: 'a$b' }).includes('"a$$b"'));
});

test('rendered profiles match the phase gate and file naming used by the lifecycle', () => {
  assert.equal(instanceComposeFile('quarantined'), 'compose.json');
  assert.equal(instanceComposeFile('login-test'), 'compose-login-test.json');
  assert.equal(validateInstanceMetadata(base), base);
  const login = renderInstanceProfile({ ...base, phase: 'login-test' });
  assert.equal(login.services.keycloak.network_mode, 'service:app');
  assert.deepEqual(login.volumes, { database: {}, identity_database: {} });
  // Loopback-only publication is retained for both app and identity ports after an upgrade.
  for (const port of login.services.app.ports) assert.equal(port.host_ip, '127.0.0.1');
});

test('every rendered phase gets its own network so a transition cannot drop service aliases', () => {
  const names = ['quarantined', 'identity-prepared', 'login-test'].map(
    (phase) => renderInstanceProfile({ ...base, phase }).networks.default.name,
  );
  assert.deepEqual(names, [
    `${base.project}_quarantined`,
    `${base.project}_identity-prepared`,
    `${base.project}_login-test`,
  ]);
  // Sharing one name while `internal` differs recreates the network and re-attaches unchanged
  // services without aliases, after which `getaddrinfo postgres` fails inside healthy containers.
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every((name) => !name.endsWith('_default')));
  for (const label of ['', 'a b', 'A_B', '-x', 'x-', 'migrate_1'])
    assert.throws(() => scopeInstanceNetwork({ networks: { default: {} } }, base.project, label));
  assert.throws(() =>
    scopeInstanceNetwork({ networks: { default: {} } }, 'bad project', 'migrate'),
  );
  assert.throws(() => scopeInstanceNetwork({ networks: { default: {} } }, '', 'migrate'));
});
