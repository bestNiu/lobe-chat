// Persistent-instance lifecycle coordinator. No credential values are printed or accepted in argv.
import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { images, localDocker, root } from '../dockerRuntime.mjs';
import {
  bootstrapDirectory,
  confirmMigration,
  createBootstrapRunner,
  planBootstrapCompose,
  planMigrationRun,
  prepareBootstrapInputs,
  runnerEnvFile,
} from './localInstanceBootstrap.mjs';
import { createLocalInstanceProfile } from './localInstanceProfile.mjs';
import {
  instanceComposeFile,
  parseComposeProfile,
  planMigrationConfirmation,
  planPhaseChange,
  planUpgrade,
  renderInstanceProfile,
  scopeInstanceNetwork,
  serializeComposeProfile,
  validateInstanceMetadata,
} from './localInstanceUpgrade.mjs';
import { runLoggedCommand } from './runLoggedCommand.mjs';

/**
 * Private, local-test ceremonies. Every Docker step writes a 0600 log inside the instance
 * directory; no credential value is printed, and no persistent volume is ever deleted.
 */
const runCeremony = async (action, { composePrefix, docker, metadata, step, writePrivate }) => {
  const persistMetadata = async (next) => {
    const rendered = `${JSON.stringify(withoutArtifacts(next), null, 2)}\n`;
    if ((await readFile(path.join(directory, 'instance.json'), 'utf8')) !== rendered)
      await writePrivate('instance.json', rendered, { backup: true });
    return next;
  };
  if (action === 'prepare-bootstrap') {
    const prepared = await prepareBootstrapInputs({
      artifacts: directory,
      metadata,
      passwordFile: portArg,
      personFile: target,
    });
    await persistMetadata({ ...metadata, bootstrapPrepared: true });
    return { action, ...prepared, phase: metadata.phase, project: metadata.project };
  }
  if (action === 'migrate') {
    // Refuse before touching a single container: re-running for an already-confirmed image must
    // not move `postgres` onto the one-shot network and strand the serving phase behind it.
    if (metadata.migrated === true && metadata.migratedImage === metadata.image)
      throw new Error('MIGRATIONS_ALREADY_CONFIRMED');
    const plan = planMigrationRun({ artifacts: directory, metadata });
    const rendered = serializeComposeProfile(plan.profile);
    const existing = await readFile(path.join(directory, plan.composeFile), 'utf8').catch(
      () => null,
    );
    if (existing !== rendered)
      await writePrivate(plan.composeFile, rendered, { backup: existing !== null });
    const prefix = composePrefix(plan.composeFile);
    // A stopped container from another phase stays attached to that phase's network (a service
    // config hash does not include the network name), so Compose would restart it as-is and this
    // one-shot network would have no `postgres` alias to resolve. Observed as
    // `getaddrinfo EAI_AGAIN postgres` while the database was healthy. --force-recreate fixes that,
    // but it only applies to services named on the command line, and naming the long-running
    // dependencies as `up` targets makes attached Compose wait for them forever. So: recreate the
    // dependencies detached first, then run the one-shot target attached.
    const dependencies = Object.keys(plan.profile.services).filter((name) => name !== plan.target);
    let logPath;
    try {
      if (dependencies.length)
        await step(
          'migrate-deps',
          [...prefix, 'up', '-d', '--no-build', '--force-recreate', ...dependencies],
          180_000,
        );
      logPath = await step(
        'migrate',
        [...prefix, 'up', '--no-build', '--force-recreate', plan.target],
        240_000,
      );
      const state = await docker([
        'inspect',
        '--format',
        '{{.State.ExitCode}} {{.State.OOMKilled}}',
        `${metadata.project}-${plan.target}-1`,
      ]);
      if (state.trim() !== '0 false')
        throw new Error(`MIGRATION_FAILED: ${state.trim()}; private log: ${logPath}`);
      const next = await persistMetadata(confirmMigration({ image: metadata.image, metadata }));
      return {
        action,
        logPath,
        migrated: next.migrated,
        migratedImage: next.migratedImage,
        phase: next.phase,
        project: next.project,
      };
    } finally {
      // Always remove the one-shot stack. Leaving it running keeps `postgres` attached to the
      // migration network only, which the serving phase can then no longer resolve by name.
      await step('migrate-down', [...prefix, 'down', '--remove-orphans'], 60_000).catch(() => {});
    }
  }
  // bootstrap: one-shot ceremony. Migrations must already be confirmed for this exact image.
  if (metadata.migrated !== true || metadata.migratedImage !== metadata.image)
    throw new Error('MIGRATIONS_NOT_CONFIRMED');
  await lstat(path.join(bootstrapDirectory(directory), 'first-administrator.json'));
  await lstat(runnerEnvFile(directory));
  const plan = await planBootstrapCompose({ artifacts: directory, metadata });
  const rendered = serializeComposeProfile(plan.profile);
  const existing = await readFile(path.join(directory, plan.composeFile), 'utf8').catch(() => null);
  if (existing !== rendered)
    await writePrivate(plan.composeFile, rendered, { backup: existing !== null });
  const prefix = composePrefix(plan.composeFile);
  const runnerName = `youlin-bootstrap-${randomUUID()}`;
  const logs = path.join(directory, `bootstrap-runner-${randomUUID()}.log`);
  let succeeded = false;
  try {
    await step(
      'bootstrap-up',
      [
        ...prefix,
        'up',
        '-d',
        // Same cross-phase network trap as the migration run: never reuse another phase's container.
        '--force-recreate',
        '--wait',
        '--wait-timeout',
        '200',
        'postgres',
        'redis',
        'app',
        'keycloak',
        'relay',
      ],
      300_000,
    );
    await createBootstrapRunner(docker, {
      artifacts: directory,
      metadata,
      repositoryRoot: root,
      runnerName,
    });
    await step('bootstrap-run', ['start', '--attach', runnerName], 420_000);
    await writeFile(
      logs,
      (await docker(['logs', '--tail', '400', runnerName], '', true)).trimEnd() + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    succeeded = true;
    return { action, phase: metadata.phase, project: metadata.project, runnerLog: logs };
  } catch (error) {
    // Preserve the ceremony stack's own logs before it is removed; volumes are never deleted.
    const stackLogs = path.join(directory, `bootstrap-stack-${randomUUID()}.log`);
    await writeFile(
      stackLogs,
      (
        await docker(
          [...composePrefix(plan.composeFile), 'logs', '--no-color', '--tail', '300'],
          '',
          true,
        ).catch(() => '')
      ).trimEnd() + '\n',
      { flag: 'wx', mode: 0o600 },
    ).catch(() => {});
    throw new Error(
      `BOOTSTRAP_INCOMPLETE; runner kept: ${runnerName}; runner log: ${logs}; stack log: ${stackLogs}`,
      { cause: error },
    );
  } finally {
    await writeFile(
      logs,
      (await docker(['logs', '--tail', '400', runnerName], '', true).catch(() => '')).trimEnd() +
        '\n',
      { mode: 0o600 },
    ).catch(() => {});
    if (succeeded) await docker(['rm', '--force', runnerName]).catch(() => {});
    await step('bootstrap-down', [...prefix, 'down', '--remove-orphans'], 90_000).catch(() => {});
  }
};

/**
 * Read-only inspection of the persistent database inside Docker. The statement comes from a
 * private 0600 file (never argv), runs as a one-off `psql` container on the instance network with
 * no host publication, and the output is written to a private log that the operator reviews.
 */
const runSqlQuery = async ({ composePrefix, docker, metadata, queryFile, step }) => {
  const query = await readFile(queryFile, 'utf8');
  if (query.length > 8192) throw new Error('QUERY_TOO_LARGE');
  if (!/;\s*$/.test(query.trim())) throw new Error('QUERY_MUST_BE_TERMINATED');
  if (/\b(?:insert|update|delete|drop|truncate|alter|create|grant|revoke|copy)\b/i.test(query))
    throw new Error('ONLY_READ_ONLY_STATEMENTS');
  const prefix = composePrefix(instanceComposeFile(metadata.phase));
  await step(
    'sql-up',
    [...prefix, 'up', '-d', '--wait', '--wait-timeout', '150', 'postgres'],
    200_000,
  );
  const name = `youlin-sql-${randomUUID()}`;
  const output = path.join(directory, `sql-${randomUUID()}.log`);
  try {
    await docker([
      // No --rm: the private output log must be captured before this one-off container is removed.
      'run',
      '--detach',
      '--name',
      name,
      '--label',
      `com.docker.compose.project=${metadata.project}`,
      // Compose names the default network `<project>_default`.
      '--network',
      `${metadata.project}_default`,
      // The Alpine-based PostgreSQL image has no uid 999; use its own unprivileged postgres user.
      '--user',
      '70:70',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--cpus=0.5',
      '--pids-limit=64',
      '--memory=128m',
      '--memory-swap=128m',
      '--tmpfs',
      '/tmp:rw,size=16m,mode=1777',
      '--mount',
      `type=bind,src=${queryFile},dst=/query.sql,readonly`,
      // Read the private DSN here; it is passed as process env, never printed or written to a log.
      '-e',
      `DATABASE_URL=${
        (await readFile(path.join(directory, 'migration.env'), 'utf8')).match(
          /^DATABASE_URL=(.+)$/m,
        )[1]
      }`,
      images.postgres,
      'bash',
      '-c',
      'psql -v ON_ERROR_STOP=1 -f /query.sql -- "$DATABASE_URL"',
    ]);
    await docker(['wait', name]);
    await writeFile(
      output,
      (await docker(['logs', '--tail', '200', name], '', true)).trimEnd() + '\n',
      {
        flag: 'wx',
        mode: 0o600,
      },
    );
    return { action: 'sql', logPath: output, phase: metadata.phase, project: metadata.project };
  } finally {
    await docker(['rm', '--force', name]).catch(() => {});
    await step('sql-down', [...prefix, 'stop', '--timeout', '30'], 60_000).catch(() => {});
  }
};

/** Phases whose Compose files already exist for this instance and must stay in sync. */
const reachablePhases = (metadata) =>
  metadata.phase === 'quarantined'
    ? ['quarantined']
    : metadata.identityProvisioned
      ? ['identity-prepared', 'login-test']
      : [metadata.phase];

const withoutArtifacts = (metadata) => {
  const persisted = { ...metadata };
  delete persisted.artifacts;
  return persisted;
};

const directory = path.join(os.homedir(), '.config/youlin/mvp/local-instance');
const [action, target, portArg] = process.argv.slice(2);
const TARGET_ACTIONS = Object.freeze(['mark-migrated', 'render', 'set-phase', 'upgrade']);
const PLAIN_ACTIONS = Object.freeze(['bootstrap', 'migrate', 'sql', 'status', 'stop', 'up']);
if (
  ![...TARGET_ACTIONS, ...PLAIN_ACTIONS, 'init', 'prepare-bootstrap'].includes(action) ||
  (PLAIN_ACTIONS.includes(action) && action !== 'sql' && process.argv.length !== 3) ||
  (action === 'sql' && process.argv.length !== 4) ||
  (['mark-migrated', 'set-phase', 'upgrade'].includes(action) && process.argv.length !== 4) ||
  (action === 'render' && process.argv.length !== 3) ||
  (action === 'prepare-bootstrap' && process.argv.length !== 5) ||
  (action === 'init' && (process.argv.length < 4 || process.argv.length > 5))
)
  throw new Error(
    'Usage: localInstance.mjs init <image-sha256> [port] | upgrade <image-sha256> | migrate | sql <query-file> | prepare-bootstrap <person.json> <password-file> | bootstrap | set-phase <identity-prepared|login-test> | mark-migrated <image-sha256> | up | status | stop',
  );
const docker = await localDocker();
if (action === 'init') {
  const port = portArg === undefined ? 33210 : Number(portArg);
  const profile = createLocalInstanceProfile({ artifacts: directory, image: target, port });
  await docker(['image', 'inspect', target, '--format', '{{.Id}}']);
  await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
  // Exclusive directory creation: never overwrite an existing instance or credentials.
  await mkdir(directory, { mode: 0o700 });
  const password = randomBytes(32).toString('hex');
  const databaseUrl = `postgres://youlin_fixture:${password}@postgres:5432/youlin_fixture`;
  const metadata = {
    version: 1,
    project: `youlin-local-${randomUUID()}`,
    image: target,
    port,
    phase: 'quarantined',
    provisioned: false,
    createdAt: new Date().toISOString(),
  };
  const files = {
    'database.env': `POSTGRES_USER=youlin_fixture\nPOSTGRES_DB=youlin_fixture\nPOSTGRES_PASSWORD=${password}\n`,
    'migration.env': `DATABASE_DRIVER=node\nDATABASE_URL=${databaseUrl}\n`,
    'app.env': `DATABASE_DRIVER=node\nDATABASE_URL=${databaseUrl}\nAUTH_SECRET=${randomBytes(32).toString('hex')}\nKEY_VAULTS_SECRET=${randomBytes(32).toString('base64')}\nREDIS_URL=redis://redis:6379\nAUTH_DISABLE_EMAIL_PASSWORD=1\nNEXT_TELEMETRY_DISABLED=1\n`,
    'compose.json':
      JSON.stringify(scopeInstanceNetwork(profile, metadata.project, 'quarantined'), null, 2) +
      '\n',
    'instance.json': JSON.stringify(metadata, null, 2) + '\n',
  };
  for (const [file, contents] of Object.entries(files))
    await writeFile(path.join(directory, file), contents, { flag: 'wx', mode: 0o600 });
  console.log(
    JSON.stringify({
      directory,
      project: metadata.project,
      phase: metadata.phase,
      url: `http://127.0.0.1:${port}`,
      started: false,
      passwordsPrinted: false,
    }),
  );
} else {
  const stat = await lstat(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077
  )
    throw new Error('UNTRUSTED_INSTANCE_DIRECTORY');
  const metadata = validateInstanceMetadata({
    ...JSON.parse(await readFile(path.join(directory, 'instance.json'), 'utf8')),
    artifacts: directory,
  });
  const composeFile = instanceComposeFile(metadata.phase);
  if (['status', 'stop', 'up'].includes(action)) {
    const expected = renderInstanceProfile(metadata);
    const actual = parseComposeProfile(await readFile(path.join(directory, composeFile), 'utf8'));
    if (JSON.stringify(expected) !== JSON.stringify(actual))
      throw new Error('INSTANCE_PROFILE_CHANGED');
  }
  const writePrivate = async (file, contents, { backup = false } = {}) => {
    const target = path.join(directory, file);
    const temporary = path.join(directory, `.${file}-${randomUUID()}.tmp`);
    await writeFile(temporary, contents, { flag: 'wx', mode: 0o600 });
    if (backup)
      await rename(target, path.join(directory, `${file}.bak-${randomUUID()}`)).catch(() => {});
    await rename(temporary, target);
  };
  const endpoint =
    process.env.DOCKER_HOST ||
    (await docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']));
  const composePrefix = (file) => [
    '--host',
    endpoint,
    'compose',
    '--env-file',
    '/dev/null',
    '--project-directory',
    directory,
    '-p',
    metadata.project,
    '-f',
    path.join(directory, file),
  ];
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const step = async (label, args, timeoutMs) => {
    const logPath = path.join(directory, `${label}-${randomUUID()}.log`);
    const result = await runLoggedCommand('docker', args, {
      logPath,
      signal: controller.signal,
      timeoutMs,
    });
    if (result.code !== 0 || result.timedOut || result.aborted) {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      throw new Error(`INSTANCE_STEP_INCOMPLETE: ${label}; private log: ${logPath}`);
    }
    return logPath;
  };
  if (TARGET_ACTIONS.includes(action)) {
    const plan =
      action === 'upgrade'
        ? planUpgrade({ metadata, nextImage: target })
        : action === 'set-phase'
          ? planPhaseChange({ metadata, phase: target })
          : action === 'render'
            ? {
                // Idempotent re-render after a profile-generator fix: same phase, same image.
                composeFiles: reachablePhases(metadata).map((phase) => ({
                  file: instanceComposeFile(phase),
                  profile: renderInstanceProfile({ ...metadata, phase }),
                })),
              }
            : { metadata: planMigrationConfirmation({ image: target, metadata }) };
    if (action === 'upgrade') {
      await docker(['image', 'inspect', target, '--format', '{{.Id}}']);
      const running = await docker([
        'ps',
        '--filter',
        `label=com.docker.compose.project=${metadata.project}`,
        '--filter',
        'status=running',
        '--format',
        '{{.Names}}',
      ]);
      if (running.trim()) throw new Error('INSTANCE_MUST_BE_STOPPED_BEFORE_UPGRADE');
    }
    if (action === 'set-phase' && target !== 'quarantined' && !metadata.identityProvisioned)
      throw new Error('IDENTITY_NOT_PREPARED');
    for (const entry of plan.composeFiles ?? []) {
      const rendered = serializeComposeProfile(entry.profile);
      const existing = await readFile(path.join(directory, entry.file), 'utf8').catch(() => null);
      if (existing !== rendered)
        await writePrivate(entry.file, rendered, { backup: existing !== null });
    }
    if (plan.metadata) {
      const rendered = `${JSON.stringify(withoutArtifacts(plan.metadata), null, 2)}\n`;
      if ((await readFile(path.join(directory, 'instance.json'), 'utf8')) !== rendered)
        await writePrivate('instance.json', rendered, { backup: true });
    }
    console.log(
      JSON.stringify({
        action,
        project: metadata.project,
        phase: plan.metadata?.phase ?? metadata.phase,
        migrated: plan.metadata?.migrated ?? metadata.migrated ?? false,
        credentialsPrinted: false,
        volumesDeleted: false,
      }),
    );
    process.exit(0);
  }
  const prefix = composePrefix(composeFile);
  if (action === 'up') {
    const memory = await readFile('/proc/meminfo', 'utf8');
    const available = Number(memory.match(/^MemAvailable:\s+(\d+) kB$/m)?.[1]);
    if (
      !Number.isFinite(available) ||
      available < (metadata.phase === 'quarantined' ? 6 : 8) * 1024 * 1024
    )
      throw new Error('INSUFFICIENT_HEADROOM');
    for (const name of [
      ...(metadata.provisioned ? ['database'] : []),
      ...(metadata.identityProvisioned ? ['identity_database'] : []),
    ]) {
      const volume = await docker([
        'volume',
        'inspect',
        `${metadata.project}_${name}`,
        '--format',
        '{{index .Labels "com.docker.compose.project"}}',
      ]);
      if (volume !== metadata.project) throw new Error('PERSISTENT_DATABASE_MISSING_OR_FOREIGN');
    }
  }
  if (action === 'sql') {
    try {
      const summary = await runSqlQuery({
        composePrefix,
        docker,
        metadata,
        queryFile: target,
        step,
        writePrivate,
      });
      console.log(JSON.stringify({ ...summary, credentialsPrinted: false, volumesDeleted: false }));
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
    process.exit(0);
  }
  if (action === 'prepare-bootstrap' || action === 'migrate' || action === 'bootstrap') {
    try {
      const summary = await runCeremony(action, {
        composePrefix,
        docker,
        metadata,
        step,
        writePrivate,
      });
      console.log(JSON.stringify({ ...summary, credentialsPrinted: false, volumesDeleted: false }));
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
    process.exit(0);
  }
  const logPath = path.join(directory, `${action}-${randomUUID()}.log`);
  try {
    const commands =
      action === 'up'
        ? [
            'up',
            '-d',
            '--wait',
            '--wait-timeout',
            '150',
            metadata.phase === 'quarantined' ? 'app' : 'keycloak',
          ]
        : action === 'stop'
          ? ['stop', '--timeout', '30']
          : ['ps', '--all'];
    const result = await runLoggedCommand('docker', [...prefix, ...commands], {
      logPath,
      timeoutMs: action === 'up' ? 180_000 : 45_000,
      signal: controller.signal,
    });
    if (result.code !== 0 || result.timedOut || result.aborted)
      throw new Error('INSTANCE_OPERATION_INCOMPLETE');
    if (
      action === 'up' &&
      (!metadata.provisioned || (metadata.phase !== 'quarantined' && !metadata.identityProvisioned))
    ) {
      const temporary = path.join(directory, `metadata-${randomUUID()}.json`);
      await writeFile(
        temporary,
        JSON.stringify(
          { ...metadata, provisioned: true, identityProvisioned: metadata.phase !== 'quarantined' },
          null,
          2,
        ) + '\n',
        { flag: 'wx', mode: 0o600 },
      );
      await rename(temporary, path.join(directory, 'instance.json'));
    }
    console.log(
      JSON.stringify({
        action,
        project: metadata.project,
        url: `http://127.0.0.1:${metadata.port}`,
        phase: metadata.phase,
        logPath,
        credentialsPrinted: false,
        volumesDeleted: false,
      }),
    );
  } catch {
    console.error(
      `Instance operation incomplete; inspect private log: ${logPath}. Data was NOT deleted.`,
    );
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
