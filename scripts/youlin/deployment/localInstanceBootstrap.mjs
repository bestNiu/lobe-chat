import { randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { images } from '../dockerRuntime.mjs';
import {
  planMigrationConfirmation,
  planUpgrade,
  renderInstanceProfile,
  scopeInstanceNetwork,
} from './localInstanceUpgrade.mjs';

const VITE_CACHES = Object.freeze([
  'node_modules/.vite',
  'node_modules/.vite-temp',
  'packages/database/node_modules/.vite',
  'packages/database/node_modules/.vite-temp',
  'packages/trpc/node_modules/.vite',
  'packages/trpc/node_modules/.vite-temp',
  'packages/openapi/node_modules/.vite',
  'packages/openapi/node_modules/.vite-temp',
]);

export const bootstrapDirectory = (artifacts) => path.join(artifacts, 'bootstrap');
export const runnerEnvFile = (artifacts) => path.join(bootstrapDirectory(artifacts), 'runner.env');
const IDENTITY_ENV_KEYS = Object.freeze([
  'AUTH_KEYCLOAK_SECRET',
  'YOULIN_CLEANUP_SUBJECT_ID',
  'YOULIN_IDP_ADMIN_CLIENT_ID',
  'YOULIN_IDP_ADMIN_CLIENT_SECRET',
]);

const assertPrivateDirectory = async (target) => {
  const stat = await lstat(target).catch(() => null);
  if (!stat) {
    await mkdir(target, { mode: 0o700 });
    return;
  }
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077
  )
    throw new Error('UNTRUSTED_BOOTSTRAP_DIRECTORY');
};

/** Read a 0600, owner-owned, non-symlink file without echoing it. */
const readPrivateFile = async (file) => {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || stat.mode & 0o077)
    throw new Error('UNTRUSTED_PRIVATE_INPUT');
  const contents = await readFile(file, 'utf8');
  if (contents.length > 8192) throw new Error('PRIVATE_INPUT_TOO_LARGE');
  return contents;
};

/**
 * Exclusive temp write, then replace. Re-preparing a ceremony backs the previous private file up
 * instead of merging into it or silently reusing stale content.
 */
const atomicWrite = async (target, contents, mode = 0o600) => {
  const temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, contents, { flag: 'wx', mode });
  await rename(target, `${target}.bak-${randomBytes(4).toString('hex')}`).catch(() => {});
  await rename(temporary, target);
  await chmod(target, mode);
};

/**
 * Prepare the private ceremony inputs from files the operator already created with 0600.
 * Values are copied, never printed; the password is validated for shape only.
 */
export const prepareBootstrapInputs = async ({ artifacts, metadata, passwordFile, personFile }) => {
  if (metadata.phase === 'quarantined' || !metadata.identityProvisioned)
    throw new Error('IDENTITY_NOT_PREPARED');
  if (!Number.isInteger(metadata.identityPort)) throw new Error('INVALID_IDENTITY_PORT');
  const person = JSON.parse(await readPrivateFile(personFile));
  if (
    typeof person?.email !== 'string' ||
    !/^[^@\s]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(person.email) ||
    typeof person.employeeNumber !== 'string' ||
    !/^[A-Z0-9][A-Z0-9._:-]{0,127}$/.test(person.employeeNumber) ||
    (person.displayName !== undefined && typeof person.displayName !== 'string') ||
    Object.keys(person).some((key) => !['displayName', 'email', 'employeeNumber'].includes(key))
  )
    throw new Error('INVALID_ADMINISTRATOR_PERSON');
  const password = (await readPrivateFile(passwordFile)).replace(/\r?\n$/, '');
  if (
    password.length < 12 ||
    password.length > 1024 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password) ||
    /[\r\n]/.test(password)
  )
    throw new Error('INVALID_ADMINISTRATOR_PASSWORD_SHAPE');
  const target = bootstrapDirectory(artifacts);
  await assertPrivateDirectory(target);
  const databasePassword = (await readPrivateFile(path.join(artifacts, 'database.env'))).match(
    /^POSTGRES_PASSWORD=(.+)$/m,
  )?.[1];
  if (!databasePassword) throw new Error('DATABASE_PASSWORD_UNAVAILABLE');
  const identityEnv = (await readPrivateFile(path.join(artifacts, 'identity/app.env')))
    .split('\n')
    .filter((line) => IDENTITY_ENV_KEYS.includes(line.split('=')[0]));
  if (identityEnv.length !== IDENTITY_ENV_KEYS.length) throw new Error('IDENTITY_ENV_INCOMPLETE');
  // identity/installation.json carries only non-secret identifiers (bootstrap/cleanup subject ids
  // and the project name); the ceremony CLI cross-checks the project before touching the database.
  const installation = JSON.parse(
    await readPrivateFile(path.join(artifacts, 'identity/installation.json')),
  );
  if (installation.instanceProject !== metadata.project) throw new Error('INSTALLATION_MISMATCH');
  const subjectId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (
    !subjectId.test(installation.bootstrapSubjectId ?? '') ||
    !subjectId.test(installation.cleanupSubjectId ?? '')
  )
    throw new Error('INVALID_INSTALLATION_SUBJECTS');
  await atomicWrite(
    path.join(target, 'installation.json'),
    `${JSON.stringify(installation, null, 2)}\n`,
  );
  await atomicWrite(
    path.join(target, 'first-administrator.json'),
    `${JSON.stringify(person, null, 2)}\n`,
  );
  await atomicWrite(path.join(target, 'first-administrator.password'), `${password}\n`);
  // Private 0600 runner environment: never passed on a command line and never printed.
  await atomicWrite(
    runnerEnvFile(artifacts),
    [
      'DATABASE_DRIVER=node',
      `DATABASE_URL=postgres://youlin_fixture:${databasePassword}@postgres:5432/youlin_fixture`,
      'YOULIN_BOOTSTRAP_RUN=1',
      'YOULIN_ENTERPRISE_SESSION_ENFORCEMENT=1',
      'YOULIN_MANUAL_ENROLLMENT=1',
      'YOULIN_LOCAL_TEST_MODE=1',
      'YOULIN_ENTERPRISE_ID=youlin-local',
      'YOULIN_KEYCLOAK_AUDIENCE=youlin-api',
      'AUTH_KEYCLOAK_ID=youlin-web',
      `AUTH_KEYCLOAK_ISSUER=http://127.0.0.1:${metadata.identityPort}/realms/youlin-local`,
      `APP_URL=http://127.0.0.1:${metadata.port}`,
      ...identityEnv,
      'NEXT_TELEMETRY_DISABLED=1',
      '',
    ].join('\n'),
  );
  await chmod(path.join(target, 'installation.json'), 0o600);
  await chmod(path.join(target, 'first-administrator.json'), 0o600);
  await chmod(path.join(target, 'first-administrator.password'), 0o600);
  await chmod(runnerEnvFile(artifacts), 0o600);
  return { credentialsPrinted: false, written: 4 };
};

/** The ceremony Compose is derived from the login-test profile of the CURRENT instance image. */
export const planBootstrapCompose = async ({ artifacts, metadata }) => {
  if (metadata.phase === 'quarantined' || !metadata.identityProvisioned)
    throw new Error('IDENTITY_NOT_PREPARED');
  const { createLocalBootstrapProfile } = await import('./localBootstrapCompose.mjs');
  const profile = createLocalBootstrapProfile({
    identityPort: metadata.identityPort,
    loginProfile: renderInstanceProfile({ ...metadata, phase: 'login-test' }),
  });
  // The app must stay defined: Keycloak shares its network namespace in the persistent profile,
  // and the ceremony replays migrations through the same image before touching the database.
  profile.services.migrate = migrateService({ artifacts, image: metadata.image });
  scopeInstanceNetwork(profile, metadata.project, 'bootstrap');
  return { composeFile: 'compose-bootstrap.json', profile };
};

/**
 * Migration gate: the same image that will serve traffic replays the authoritative migration
 * chain against the persistent database, and only that exact image can be marked as migrated.
 */
/** One-shot migration replay by the SAME image that will serve traffic. */
export const migrateService = ({ artifacts, image }) => ({
  cap_drop: ['ALL'],
  command: ['node', 'migrate.cjs'],
  cpus: 1,
  depends_on: { postgres: { condition: 'service_healthy' } },
  env_file: [path.join(artifacts, 'migration.env')],
  environment: { NODE_OPTIONS: '--max-old-space-size=768' },
  image,
  mem_limit: '1g',
  memswap_limit: '1g',
  pids_limit: 128,
  pull_policy: 'never',
  read_only: true,
  restart: 'no',
  security_opt: ['no-new-privileges:true'],
  tmpfs: ['/tmp:size=128m,mode=1777', '/app/.next/cache:size=128m,mode=1777'],
  user: '1000:1000',
});

export const planMigrationRun = ({ artifacts, metadata }) => {
  if (metadata.phase === 'quarantined') throw new Error('IDENTITY_NOT_PREPARED');
  const profile = renderInstanceProfile({ ...metadata, phase: 'identity-prepared' });
  delete profile.services.app;
  delete profile.services.keycloak;
  delete profile.services['identity-db'];
  delete profile.services.probe;
  profile.services.migrate = migrateService({ artifacts, image: metadata.image });
  // Own network: a one-shot migration must never recreate the serving phase's network and
  // silently drop the `postgres` service alias from surviving containers.
  scopeInstanceNetwork(profile, metadata.project, 'migrate');
  return { composeFile: 'compose-migrate.json', profile, target: 'migrate' };
};

/**
 * The ceremony runs the repository's own TypeScript entrypoint through the project's Vitest
 * server project inside a bounded, read-only container. Nothing is executed on the host and no
 * secret is passed as an argument: the private 0600 runner env file is the only source.
 */
/**
 * The ceremony runs the repository's own TypeScript entrypoint through the project's Vitest
 * server project inside a bounded, read-only container on the instance's private network.
 * Nothing executes on the host and no secret is passed as an argument: the 0600 runner env file
 * is the only source. The container is verified before it is started.
 */
export const createBootstrapRunner = async (
  docker,
  { artifacts, metadata, repositoryRoot, runnerName },
) => {
  if (metadata.phase === 'quarantined' || !metadata.identityProvisioned)
    throw new Error('IDENTITY_NOT_PREPARED');
  if (!/^youlin-bootstrap-[a-f0-9-]{36}$/.test(runnerName)) throw new Error('INVALID_RUNNER_NAME');
  const image = await docker(['image', 'inspect', images.node, '--format', '{{.Id}}']);
  // Same allowlist as the container test harness: the Vitest dep optimizer resolves test mocks,
  // so `tests` and the shared lint/prettier/stylelint configs must be present or the run cannot
  // even start. Nothing outside this list (no .git, no root .env, no docs/know) is exposed.
  const entries = [
    'apps',
    'packages',
    'src',
    'tests',
    'scripts',
    'node_modules',
    '.agents/scripts',
    '.github/workflows/youlin-verify.yml',
    'package.json',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'drizzle.config.ts',
    'vitest.config.mts',
    'eslint.config.mjs',
    'eslint-suppressions.json',
    'prettier.config.mjs',
    'stylelint.config.mjs',
    '.stylelintignore',
    '.prettierignore',
    '.editorconfig',
  ];
  for (const cache of VITE_CACHES)
    await mkdir(path.join(repositoryRoot, cache), { recursive: true });
  const mounts = entries.map(
    (entry) => `type=bind,src=${path.join(repositoryRoot, entry)},dst=/workspace/${entry},readonly`,
  );
  mounts.push(`type=bind,src=${bootstrapDirectory(artifacts)},dst=/private,readonly`);
  await docker([
    'create',
    '--pull=never',
    '--init',
    '--name',
    runnerName,
    '--label',
    `com.docker.compose.project=${metadata.project}`,
    '--label',
    'youlin.local-bootstrap=true',
    // Share the relay namespace: 127.0.0.1:<identityPort> is the realm's configured issuer, while
    // the relay namespace stays attached to the instance network for `postgres` DNS.
    '--network',
    `container:${metadata.project}-relay-1`,
    '--user',
    '1000:1000',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--cpus=2',
    '--pids-limit=256',
    '--memory=2048m',
    '--memory-swap=2048m',
    '--tmpfs',
    '/tmp:rw,size=512m,mode=1777',
    ...VITE_CACHES.flatMap((cache) => ['--tmpfs', `/workspace/${cache}:rw,size=128m,mode=1777`]),
    '--workdir',
    '/workspace',
    '--env-file',
    runnerEnvFile(artifacts),
    '-e',
    'HOME=/tmp',
    '-e',
    'XDG_DATA_HOME=/tmp/data',
    '-e',
    'XDG_CACHE_HOME=/tmp/cache',
    '-e',
    'NO_COLOR=1',
    '-e',
    'VITEST_MAX_WORKERS=1',
    ...mounts.flatMap((mount) => ['--mount', mount]),
    '--entrypoint',
    'node',
    image,
    '/workspace/node_modules/vitest/vitest.mjs',
    'run',
    '--project=server',
    '--pool=threads',
    '--maxWorkers=1',
    'apps/server/src/modules/YoulinIdentity/__tests__/localBootstrapRun.test.ts',
  ]);
  const info = JSON.parse(
    await docker(['inspect', '--format', '{{json .HostConfig}}', runnerName]),
  );
  const actualMounts = JSON.parse(
    await docker(['inspect', '--format', '{{json .Mounts}}', runnerName]),
  );
  // `.NetworkSettings.Container` does not exist as a template key; compare the relay's own id.
  const relayId = (
    await docker(['inspect', '--format', '{{.Id}}', `${metadata.project}-relay-1`])
  ).trim();
  const relayState = (
    await docker(['inspect', '--format', '{{.State.Running}}', `${metadata.project}-relay-1`])
  ).trim();
  if (
    !/^[0-9a-f]{64}$/.test(relayId) ||
    relayState !== 'true' ||
    info.NetworkMode !== `container:${relayId}` ||
    !info.ReadonlyRootfs ||
    info.Memory !== 2048 * 1024 * 1024 ||
    info.MemorySwap !== info.Memory ||
    info.PidsLimit !== 256 ||
    Object.keys(info.PortBindings || {}).length ||
    actualMounts.some((mount) => mount.Type === 'bind' && mount.RW)
  )
    throw new Error('BOOTSTRAP_RUNNER_ISOLATION_FAILED');
  return runnerName;
};

export const confirmMigration = ({ image, metadata }) =>
  planMigrationConfirmation({ image, metadata });

/** Re-render every reachable phase file after an image change (pure wrapper for the lifecycle). */
export const planImageUpgrade = ({ metadata, nextImage }) => planUpgrade({ metadata, nextImage });
