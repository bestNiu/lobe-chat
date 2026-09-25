// Host-only file preparation and Docker coordination; never sends or prints credential values.
import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { localDocker } from '../dockerRuntime.mjs';
import { createLocalIdentityProfile, localIdentityImages } from './localIdentityProfile.mjs';
import { createLocalIdentityRealm } from './localIdentityRealm.mjs';
import { createLocalInstanceProfile } from './localInstanceProfile.mjs';

if (process.argv.length > 3) throw new Error('Usage: prepareLocalIdentity.mjs [identity-port]');
const directory = path.join(os.homedir(), '.config/youlin/mvp/local-instance');
const identityPort = process.argv[2] === undefined ? 33211 : Number(process.argv[2]);
const stat = await lstat(directory);
if (
  !stat.isDirectory() ||
  stat.isSymbolicLink() ||
  stat.uid !== process.getuid() ||
  stat.mode & 0o077
)
  throw new Error('UNTRUSTED_INSTANCE_DIRECTORY');
const metadata = JSON.parse(await readFile(path.join(directory, 'instance.json'), 'utf8'));
if (
  metadata.version !== 1 ||
  metadata.phase !== 'quarantined' ||
  metadata.provisioned !== true ||
  !/^youlin-local-[a-f0-9-]{36}$/.test(metadata.project)
)
  throw new Error('QUARANTINED_PERSISTENT_INSTANCE_REQUIRED');
const input = { artifacts: directory, image: metadata.image, port: metadata.port };
const original = JSON.parse(await readFile(path.join(directory, 'compose.json'), 'utf8'));
if (JSON.stringify(original) !== JSON.stringify(createLocalInstanceProfile(input)))
  throw new Error('INSTANCE_PROFILE_CHANGED');
const profile = createLocalIdentityProfile({ ...input, identityPort });
const docker = await localDocker();
for (const image of Object.values(localIdentityImages))
  await docker(['image', 'inspect', image, '--format', '{{.Id}}']);
// Runs the emptiness assertion inside this instance's database, not against any other service.
await docker([
  'exec',
  `${metadata.project}-postgres-1`,
  'psql',
  '-U',
  'youlin_fixture',
  '-d',
  'youlin_fixture',
  '-v',
  'ON_ERROR_STOP=1',
  '-c',
  "DO $$ BEGIN IF EXISTS (SELECT 1 FROM users) OR EXISTS (SELECT 1 FROM auth_sessions) THEN RAISE EXCEPTION 'QUARANTINE_NOT_EMPTY'; END IF; END $$;",
]);
const identity = path.join(directory, 'identity');
try {
  await lstat(identity);
  throw new Error('IDENTITY_CONFIGURATION_EXISTS_REVIEW_PARTIAL_INSTALL');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const staging = path.join(directory, `.identity-${randomUUID()}`);
await mkdir(staging, { mode: 0o700 });
const secret = () => randomBytes(32).toString('hex');
const webSecret = secret();
const controlSecret = secret();
const databasePassword = secret();
const bootstrapSubjectId = randomUUID();
const cleanupSubjectId = randomUUID();
const files = {
  'app.env': `AUTH_KEYCLOAK_SECRET=${webSecret}\nYOULIN_IDP_ADMIN_CLIENT_ID=youlin-identity-control\nYOULIN_IDP_ADMIN_CLIENT_SECRET=${controlSecret}\nYOULIN_CLEANUP_SUBJECT_ID=${cleanupSubjectId}\n`,
  'database.env': `POSTGRES_USER=keycloak\nPOSTGRES_DB=keycloak\nPOSTGRES_PASSWORD=${databasePassword}\n`,
  'server.env': `KC_DB_PASSWORD=${databasePassword}\nKC_BOOTSTRAP_ADMIN_USERNAME=youlin-local-operator\nKC_BOOTSTRAP_ADMIN_PASSWORD=${secret()}\n`,
  'realm.json':
    JSON.stringify(
      createLocalIdentityRealm({ port: metadata.port, webSecret, controlSecret }),
      null,
      2,
    ) + '\n',
  'installation.json':
    JSON.stringify(
      {
        instanceProject: metadata.project,
        bootstrapSubjectId,
        cleanupSubjectId,
        identityPort,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
};
for (const [file, content] of Object.entries(files))
  await writeFile(path.join(staging, file), content, { flag: 'wx', mode: 0o600 });
await rename(staging, identity);
await writeFile(
  path.join(directory, 'compose-identity-prepared.json'),
  JSON.stringify(profile, null, 2) + '\n',
  { flag: 'wx', mode: 0o600 },
);
const temporary = path.join(directory, `metadata-${randomUUID()}.json`);
await writeFile(
  temporary,
  JSON.stringify(
    { ...metadata, phase: 'identity-prepared', identityPort, identityProvisioned: false },
    null,
    2,
  ) + '\n',
  { flag: 'wx', mode: 0o600 },
);
await rename(temporary, path.join(directory, 'instance.json'));
console.log(
  JSON.stringify({
    project: metadata.project,
    phase: 'identity-prepared',
    loginEnabled: false,
    started: false,
    credentialsPrinted: false,
  }),
);
