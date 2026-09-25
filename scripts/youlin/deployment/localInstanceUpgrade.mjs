import path from 'node:path';

import { createLocalIdentityProfile } from './localIdentityProfile.mjs';
import { createLocalInstanceProfile } from './localInstanceProfile.mjs';

export const INSTANCE_PHASES = Object.freeze(['quarantined', 'identity-prepared', 'login-test']);
/** Explicit, ordered operator gates. Skipping one is a bug, not a convenience. */
const PHASE_ORDER = Object.freeze({ 'quarantined': 0, 'identity-prepared': 1, 'login-test': 2 });

export const validateInstanceMetadata = (metadata) => {
  if (
    metadata?.version !== 1 ||
    !/^youlin-local-[a-f0-9-]{36}$/.test(metadata.project ?? '') ||
    !INSTANCE_PHASES.includes(metadata.phase) ||
    !/^sha256:[0-9a-f]{64}$/.test(metadata.image ?? '') ||
    !Number.isInteger(metadata.port) ||
    (metadata.phase !== 'quarantined' && !Number.isInteger(metadata.identityPort))
  )
    throw new Error('INVALID_INSTANCE_METADATA');
  return metadata;
};

/**
 * Compose interpolates `$var` inside every string value, so a literal `$` in a shell probe must be
 * written as `$$`. Without this the Keycloak health probe was rendered as `[[ "" == *" 200 "* ]]`,
 * which can never succeed: the realm served 200 while Compose still reported it unhealthy.
 */
export const serializeComposeProfile = (profile) =>
  // `$$` is matched first so an already-escaped pair is preserved instead of growing to `$$$`.
  // A replacer function inserts its return value literally, so `$$` (not `$$$$`) is the escape.
  `${JSON.stringify(profile, null, 2).replaceAll(/\$\$|\$/g, (match) => (match.length === 2 ? match : '$$'))}\n`;

/** Parse a rendered Compose file back into the profile shape (undoes the `$$` escape). */
export const parseComposeProfile = (text) => JSON.parse(text.replaceAll('$$', '$'));

export const instanceComposeFile = (phase) =>
  phase === 'quarantined' ? 'compose.json' : `compose-${phase}.json`;

/**
 * Give every rendered Compose file its own network. All phases otherwise share
 * `<project>_default` while disagreeing on `internal` (login-test must publish loopback ports,
 * migration/bootstrap/quarantine stay internal). Flipping that flag makes Compose recreate the
 * network and re-attach unchanged services WITHOUT their service aliases, after which
 * `getaddrinfo postgres` fails inside app and migrate containers even though the database is
 * healthy. A distinct name per file makes each transition create its own network and containers.
 */
export const scopeInstanceNetwork = (profile, project, label) => {
  if (typeof project !== 'string' || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(project))
    throw new Error('INVALID_INSTANCE_PROJECT');
  if (typeof label !== 'string' || !/^[a-z][a-z-]*[a-z]$/.test(label))
    throw new Error('INVALID_NETWORK_SCOPE');
  const existing = profile.networks?.default ?? {};
  profile.networks = { ...profile.networks, default: { ...existing, name: `${project}_${label}` } };
  return profile;
};

/** Deterministic desired Compose for a phase; also the drift check used by up/status/stop. */
export const renderInstanceProfile = (metadata, image = metadata.image) => {
  const input = { artifacts: metadata.artifacts, image, port: metadata.port };
  const profile =
    metadata.phase === 'quarantined'
      ? createLocalInstanceProfile(input)
      : createLocalIdentityProfile({
          ...input,
          identityPort: metadata.identityPort,
          loginEnabled: metadata.phase === 'login-test',
        });
  return scopeInstanceNetwork(profile, metadata.project, metadata.phase);
};

export const planUpgrade = ({ metadata, nextImage }) => {
  validateInstanceMetadata(metadata);
  if (!/^sha256:[0-9a-f]{64}$/.test(nextImage ?? '')) throw new Error('INVALID_IMAGE_REFERENCE');
  if (nextImage === metadata.image) throw new Error('IMAGE_ALREADY_INSTALLED');
  // Never rewrite a running instance: the operator stops it first so the migration/rollback
  // sequence is explicit and no request is served by a half-upgraded stack.
  return {
    composeFiles:
      metadata.phase === 'quarantined'
        ? [{ file: 'compose.json', profile: renderInstanceProfile(metadata, nextImage) }]
        : INSTANCE_PHASES.slice(metadata.identityProvisioned ? 1 : 2).map((phase) => ({
            file: instanceComposeFile(phase),
            profile: renderInstanceProfile({ ...metadata, phase }, nextImage),
          })),
    metadata: { ...metadata, image: nextImage, migrated: false, previousImage: metadata.image },
  };
};

export const planPhaseChange = ({ metadata, phase }) => {
  validateInstanceMetadata(metadata);
  if (!INSTANCE_PHASES.includes(phase)) throw new Error('INVALID_INSTANCE_PHASE');
  if (PHASE_ORDER[phase] <= PHASE_ORDER[metadata.phase])
    throw new Error('PHASE_REGRESSION_REJECTED');
  if (phase === 'login-test' && metadata.migrated !== true)
    throw new Error('MIGRATIONS_NOT_CONFIRMED');
  // Entering login-test enables SSO + enterprise enforcement for the local test instance only.
  return {
    composeFile: instanceComposeFile(phase),
    metadata: { ...metadata, phase },
    loginEnabled: phase === 'login-test',
  };
};

export const planMigrationConfirmation = ({ metadata, image }) => {
  validateInstanceMetadata(metadata);
  if (!/^sha256:[0-9a-f]{64}$/.test(image ?? '')) throw new Error('INVALID_IMAGE_REFERENCE');
  if (image !== metadata.image) throw new Error('MIGRATION_IMAGE_MISMATCH');
  if (metadata.migrated === true) throw new Error('MIGRATIONS_ALREADY_CONFIRMED');
  return {
    ...metadata,
    migrated: true,
    migratedImage: image,
    migratedAt: new Date().toISOString(),
  };
};

export const privateArtifactPath = (artifacts, file) => {
  const resolved = path.join(artifacts, file);
  if (path.dirname(resolved) !== path.resolve(artifacts))
    throw new Error('UNTRUSTED_ARTIFACT_PATH');
  return resolved;
};
