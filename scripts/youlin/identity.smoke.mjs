// Host orchestration only. Authentication requests and assertions execute in Docker.
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createNodeContainer,
  images,
  localDocker,
  removeContainer,
  runContainer,
} from './dockerRuntime.mjs';
import { createIdentityFixture } from './identity/fixture.mjs';

const docker = await localDocker();
const image = await docker(['image', 'inspect', images.keycloak, '--format', '{{.Id}}']);
await docker(['image', 'inspect', images.node, '--format', '{{.Id}}']);
const runId = randomUUID();
const keycloak = `youlin-idp-${runId}`;
const runner = `youlin-oidc-${runId}`;
const temp = await mkdtemp('/tmp/youlin-idp-');
const fixture = createIdentityFixture(runId);
const adminPassword = randomBytes(32).toString('hex');
let interrupted = false;
const interrupt = () => {
  interrupted = true;
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
console.log(
  JSON.stringify({
    runId,
    keycloak,
    runner,
    temp,
    image,
    syntheticOnly: true,
    network: 'none',
    ports: [],
  }),
);
try {
  await chmod(temp, 0o700);
  const file = path.join(temp, 'realm.json');
  await writeFile(file, JSON.stringify(fixture.config), { mode: 0o600 });
  await docker([
    'create',
    '--pull=never',
    '--name',
    keycloak,
    '--label',
    `youlin.identity-lab=${runId}`,
    '--network=none',
    '--memory=1536m',
    '--memory-swap=1536m',
    '--cpus=2',
    '--pids-limit=256',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--tmpfs',
    '/opt/keycloak/data:rw,size=256m,uid=1000,gid=0,mode=0700',
    '--mount',
    `type=bind,src=${file},dst=/opt/keycloak/data/import/realm.json,readonly`,
    '-e',
    'KC_BOOTSTRAP_ADMIN_USERNAME=lab-admin',
    '-e',
    `KC_BOOTSTRAP_ADMIN_PASSWORD=${adminPassword}`,
    '-e',
    'JAVA_OPTS_KC_HEAP=-XX:MaxRAMPercentage=60 -XX:InitialRAMPercentage=30',
    image,
    'start-dev',
    '--import-realm',
    '--hostname=http://127.0.0.1:8080',
    '--http-host=127.0.0.1',
  ]);
  await docker(['start', keycloak]);
  const config = JSON.parse(
    await docker(['inspect', '--format', '{{json .HostConfig}}', keycloak]),
  );
  if (
    config.NetworkMode !== 'none' ||
    config.Memory !== 1536 * 1024 * 1024 ||
    config.MemorySwap !== config.Memory ||
    config.NanoCpus !== 2_000_000_000 ||
    config.PidsLimit !== 256 ||
    Object.keys(config.PortBindings || {}).length
  )
    throw new Error('Identity container isolation mismatch');
  await createNodeContainer(docker, {
    name: runner,
    networkContainer: keycloak,
    env: {
      YOULIN_IDENTITY_RUN: runId,
      YOULIN_IDENTITY_REALM: fixture.realm,
      YOULIN_IDENTITY_PASSWORD: fixture.password,
      YOULIN_IDENTITY_SECRET: fixture.webSecret,
      YOULIN_IDENTITY_ADMIN_PASSWORD: adminPassword,
    },
    args: [
      '--experimental-strip-types',
      '--test',
      '/workspace/scripts/youlin/identity/oidc.test.mjs',
    ],
  });
  if (interrupted) throw new Error('Interrupted before identity verification');
  const result = await runContainer(docker, runner, () => interrupted, 90_000);
  if (result.exitCode !== 0 || result.oomKilled || interrupted) {
    // Keycloak logs contain no fixture passwords; never print environment or realm JSON.
    console.error(await docker(['logs', '--tail=30', keycloak], '', true));
    throw new Error('Identity verification failed or incomplete');
  }
} catch (error) {
  console.error('Identity environment failed:', error);
  process.exitCode = 1;
} finally {
  let removed = true;
  for (const name of [runner, keycloak]) {
    try {
      await removeContainer(docker, name);
    } catch (error) {
      console.error(`Inspect only ${name}:`, error);
      removed = false;
      process.exitCode = 1;
    }
  }
  if (removed) {
    await rm(temp, { recursive: true, force: true });
    console.log('Identity containers and synthetic credential directory cleanup: verified');
  } else console.error(`Preserve ${temp} until owned containers are removed`);
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
