import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createBootstrapRunner,
  migrateService,
  planBootstrapCompose,
  planMigrationRun,
  prepareBootstrapInputs,
} from './localInstanceBootstrap.mjs';
import { renderInstanceProfile } from './localInstanceUpgrade.mjs';

const image = `sha256:${'a'.repeat(64)}`;
const metadata = {
  artifacts: '/private/instance',
  identityPort: 33211,
  identityProvisioned: true,
  image,
  migrated: false,
  phase: 'identity-prepared',
  port: 33210,
  project: `youlin-local-${'c'.repeat(8)}-1111-4111-8111-${'d'.repeat(12)}`,
  provisioned: true,
  version: 1,
};

test('migration replay uses the installed image only and never serves app traffic', async () => {
  const plan = planMigrationRun({ artifacts: metadata.artifacts, metadata });
  assert.equal(plan.composeFile, 'compose-migrate.json');
  assert.deepEqual(Object.keys(plan.profile.services).sort(), ['migrate', 'postgres', 'redis']);
  assert.equal(plan.profile.services.migrate.image, image);
  assert.equal(plan.profile.services.migrate.command.join(' '), 'node migrate.cjs');
  assert.equal(plan.profile.services.migrate.read_only, true);
  assert.equal(plan.profile.services.migrate.restart, 'no');
  assert.equal(plan.profile.networks.default.internal, true);
  assert.throws(
    () =>
      planMigrationRun({
        artifacts: metadata.artifacts,
        metadata: { ...metadata, phase: 'quarantined' },
      }),
    /IDENTITY_NOT_PREPARED/,
  );
  // The migration entrypoint is shared with the ceremony, so it must stay identical.
  assert.deepEqual(
    migrateService({ artifacts: metadata.artifacts, image }),
    plan.profile.services.migrate,
  );
});

test('the ceremony profile keeps the loopback issuer, drops host publication and adds a relay', async () => {
  const { profile } = await planBootstrapCompose({ artifacts: metadata.artifacts, metadata });
  const { keycloak, relay } = profile.services;
  assert.equal(keycloak.network_mode, undefined);
  assert.equal(keycloak.ports, undefined);
  assert.equal(profile.networks.default.internal, true);
  assert.ok(keycloak.command.includes('--hostname=http://127.0.0.1:33211'));
  // The health probe must stay byte-identical to the live profile: a rewritten probe silently
  // broke an earlier ceremony (dash has no /dev/tcp and the image has no curl).
  const loginProfile = renderInstanceProfile({ ...metadata, phase: 'login-test' });
  assert.deepEqual(keycloak.healthcheck.test, loginProfile.services.keycloak.healthcheck.test);
  assert.equal(profile.services.app.ports, undefined);
  assert.equal(profile.services.app.image, image);
  assert.equal(relay.environment.RELAY_TARGET_HOST, 'keycloak');
  assert.equal(relay.environment.RELAY_PORT, '33211');
  assert.equal(relay.read_only, true);
  assert.deepEqual(profile.volumes, { database: {}, identity_database: {} });
  // Only the login-test phase may be reachable from the host browser, and then only via loopback.
  assert.equal(loginProfile.networks.default.internal, false);
  for (const published of loginProfile.services.app.ports)
    assert.equal(published.host_ip, '127.0.0.1');
  assert.equal(
    renderInstanceProfile({ ...metadata, phase: 'identity-prepared' }).networks.default.internal,
    true,
  );
  assert.equal(profile.services.runner, undefined);
  assert.deepEqual(
    profile.services.migrate,
    migrateService({ artifacts: metadata.artifacts, image }),
  );
  await assert.rejects(
    () =>
      planBootstrapCompose({
        artifacts: metadata.artifacts,
        metadata: { ...metadata, identityProvisioned: false },
      }),
    /IDENTITY_NOT_PREPARED/,
  );
});

test('the runner joins the relay namespace, mounts the repo and private inputs read-only', async () => {
  const relayId = '9'.repeat(64);
  const docker = async (args) => {
    if (args[0] === 'image') return image;
    if (args.includes('{{json .HostConfig}}'))
      return JSON.stringify({
        Memory: 2048 * 1024 * 1024,
        MemorySwap: 2048 * 1024 * 1024,
        NetworkMode: `container:${relayId}`,
        PidsLimit: 256,
        PortBindings: null,
        ReadonlyRootfs: true,
      });
    if (args.includes('{{json .Mounts}}'))
      return JSON.stringify([{ Destination: '/private', RW: false, Type: 'bind' }]);
    if (args.includes('{{.Id}}')) return `${relayId}\n`;
    if (args.includes('{{.State.Running}}')) return 'true\n';
    return '';
  };
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'youlin-repo-'));
  const name = `youlin-bootstrap-${'e'.repeat(8)}-2222-4222-8222-${'f'.repeat(12)}`;
  const created = [];
  const recording = async (args) => {
    created.push(...args);
    return docker(args);
  };
  assert.equal(
    await createBootstrapRunner(recording, {
      artifacts: metadata.artifacts,
      metadata,
      repositoryRoot,
      runnerName: name,
    }),
    name,
  );
  const joined = created.join(' ');
  assert.ok(
    joined.includes(`container:${metadata.project}-relay-1`),
    'must share the relay namespace',
  );
  assert.ok(joined.includes('/private,readonly'), 'private inputs are read-only');
  assert.ok(joined.includes('--read-only') && joined.includes('--cap-drop=ALL'));
  assert.ok(
    joined.includes('localBootstrapRun.test.ts'),
    'runs the repository entrypoint in Docker',
  );
  assert.ok(
    !joined.includes('first-administrator.password'),
    'never passes a secret as an argument',
  );
  await assert.rejects(
    () =>
      createBootstrapRunner(recording, {
        artifacts: metadata.artifacts,
        metadata,
        repositoryRoot,
        runnerName: 'attacker',
      }),
    /INVALID_RUNNER_NAME/,
  );
});

test('ceremony inputs must be private, owner-owned and exactly the documented shape', async () => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'youlin-bootstrap-'));
  await writeFile(
    path.join(artifacts, 'database.env'),
    'POSTGRES_PASSWORD=synthetic-database-password\n',
    { mode: 0o600 },
  );
  await writeFile(path.join(artifacts, 'instance.json'), `${JSON.stringify(metadata)}\n`, {
    mode: 0o600,
  });
  await mkdir(path.join(artifacts, 'identity'), { recursive: true });
  await writeFile(
    path.join(artifacts, 'identity/installation.json'),
    JSON.stringify({
      instanceProject: metadata.project,
      bootstrapSubjectId: '10000000-0000-4000-8000-000000000001',
      cleanupSubjectId: '10000000-0000-4000-8000-000000000002',
      identityPort: 33211,
    }),
    { mode: 0o600 },
  );
  await writeFile(
    path.join(artifacts, 'identity/app.env'),
    [
      'AUTH_KEYCLOAK_SECRET=synthetic',
      'YOULIN_CLEANUP_SUBJECT_ID=10000000-0000-4000-8000-000000000002',
      'YOULIN_IDP_ADMIN_CLIENT_ID=youlin-identity-control',
      'YOULIN_IDP_ADMIN_CLIENT_SECRET=synthetic',
    ].join('\n'),
    { mode: 0o600 },
  );
  const person = path.join(artifacts, 'person.json');
  const password = path.join(artifacts, 'password.txt');
  await writeFile(
    person,
    JSON.stringify({
      displayName: 'First Administrator',
      email: 'first.administrator@example.invalid',
      employeeNumber: 'YYYY2026001',
    }),
    { mode: 0o600 },
  );
  await writeFile(password, 'Synthetic Ceremony Password 1\n', { mode: 0o600 });
  const prepared = await prepareBootstrapInputs({
    artifacts,
    metadata,
    passwordFile: password,
    personFile: person,
  });
  assert.equal(prepared.credentialsPrinted, false);
  assert.equal(prepared.written, 4);
  const runnerEnv = await readFile(path.join(artifacts, 'bootstrap/runner.env'), 'utf8');
  assert.ok(runnerEnv.includes('YOULIN_BOOTSTRAP_RUN=1'));
  assert.ok(runnerEnv.includes('AUTH_KEYCLOAK_ISSUER=http://127.0.0.1:33211/realms/youlin-local'));
  assert.ok(
    runnerEnv.includes(
      'DATABASE_URL=postgres://youlin_fixture:synthetic-database-password@postgres:5432/youlin_fixture',
    ),
  );
  assert.ok(!runnerEnv.includes('Synthetic Ceremony Password'));
  const copied = JSON.parse(
    await readFile(path.join(artifacts, 'bootstrap/installation.json'), 'utf8'),
  );
  assert.equal(copied.instanceProject, metadata.project);
  await writeFile(
    path.join(artifacts, 'identity/installation.json'),
    JSON.stringify({
      instanceProject: 'youlin-local-11111111-1111-4111-8111-111111111111',
      bootstrapSubjectId: '10000000-0000-4000-8000-000000000001',
      cleanupSubjectId: '10000000-0000-4000-8000-000000000002',
    }),
    { mode: 0o600 },
  );
  await assert.rejects(
    () =>
      prepareBootstrapInputs({ artifacts, metadata, passwordFile: password, personFile: person }),
    /INSTALLATION_MISMATCH/,
  );
  await writeFile(
    path.join(artifacts, 'identity/installation.json'),
    JSON.stringify({
      instanceProject: metadata.project,
      bootstrapSubjectId: '10000000-0000-4000-8000-000000000001',
      cleanupSubjectId: '10000000-0000-4000-8000-000000000002',
      identityPort: 33211,
    }),
    { mode: 0o600 },
  );
  await assert.rejects(
    () =>
      prepareBootstrapInputs({
        artifacts,
        metadata,
        passwordFile: password,
        personFile: person.replace('person.json', 'missing.json'),
      }),
    /ENOENT|UNTRUSTED/,
  );
  await writeFile(
    person,
    JSON.stringify({
      email: 'first.administrator@example.invalid',
      employeeNumber: 'lowercase-01',
    }),
    { mode: 0o600 },
  );
  await assert.rejects(
    () =>
      prepareBootstrapInputs({ artifacts, metadata, passwordFile: password, personFile: person }),
    /INVALID_ADMINISTRATOR_PERSON/,
  );
  await writeFile(
    person,
    JSON.stringify({
      email: 'first.administrator@example.invalid',
      employeeNumber: 'YYYY2026001',
      role: 'admin',
    }),
    { mode: 0o600 },
  );
  await assert.rejects(
    () =>
      prepareBootstrapInputs({ artifacts, metadata, passwordFile: password, personFile: person }),
    /INVALID_ADMINISTRATOR_PERSON/,
  );
  await writeFile(
    person,
    JSON.stringify({ email: 'first.administrator@example.invalid', employeeNumber: 'YYYY2026001' }),
    { mode: 0o600 },
  );
  await writeFile(password, 'short1A\n', { mode: 0o600 });
  await assert.rejects(
    () =>
      prepareBootstrapInputs({ artifacts, metadata, passwordFile: password, personFile: person }),
    /INVALID_ADMINISTRATOR_PASSWORD_SHAPE/,
  );
  await rm(artifacts, { recursive: true, force: true });
});

test('one-shot migration and ceremony networks never share a name with a serving phase', async () => {
  const { profile: ceremony } = await planBootstrapCompose({
    artifacts: metadata.artifacts,
    metadata,
  });
  const migration = planMigrationRun({ artifacts: metadata.artifacts, metadata });
  const serving = renderInstanceProfile({ ...metadata, phase: 'login-test' });
  assert.equal(ceremony.networks.default.name, `${metadata.project}_bootstrap`);
  assert.equal(migration.profile.networks.default.name, `${metadata.project}_migrate`);
  assert.equal(serving.networks.default.name, `${metadata.project}_login-test`);
  assert.equal(
    new Set([ceremony, migration.profile, serving].map((p) => p.networks.default.name)).size,
    3,
  );
  assert.equal(ceremony.networks.default.internal, true);
  assert.equal(migration.profile.networks.default.internal, true);
  assert.equal(serving.networks.default.internal, false);
});
