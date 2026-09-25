import path from 'node:path';

import { createLocalInstanceProfile } from './localInstanceProfile.mjs';

export const localIdentityImages = Object.freeze({
  keycloak:
    'quay.io/keycloak/keycloak:26.6.2@sha256:f9ba7b2af90db8dc749a57ca9aedca51e840cb9224441ab546a968da941da900',
  postgres:
    'postgres:15-alpine@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b',
});

/** Local TEST identity only. No LAN exposure, SMTP, gateway credentials or production TLS claim. */
export const createLocalIdentityProfile = ({
  artifacts,
  image,
  port,
  identityPort,
  loginEnabled = false,
}) => {
  if (
    typeof loginEnabled !== 'boolean' ||
    !Number.isInteger(identityPort) ||
    identityPort < 1024 ||
    identityPort > 65535 ||
    identityPort === port ||
    identityPort === 3210
  )
    throw new Error('INVALID_IDENTITY_PORT');
  const profile = createLocalInstanceProfile({ artifacts, image, port });
  const app = profile.services.app;
  app.ports.push({ host_ip: '127.0.0.1', published: String(identityPort), target: identityPort });
  app.env_file.push(path.join(artifacts, 'identity/app.env'));
  Object.assign(app.environment, {
    AUTH_SSO_PROVIDERS: loginEnabled ? 'keycloak' : '',
    AUTH_KEYCLOAK_ID: 'youlin-web',
    AUTH_KEYCLOAK_ISSUER: `http://127.0.0.1:${identityPort}/realms/youlin-local`,
    AUTH_EMAIL_VERIFICATION: '0',
    YOULIN_ENTERPRISE_SESSION_ENFORCEMENT: loginEnabled ? '1' : '0',
    YOULIN_MANUAL_ENROLLMENT: loginEnabled ? '1' : '0',
    // Administrator-maintained model grants and monthly token caps, enforced before provider work.
    YOULIN_MODEL_ACCESS_CONTROL: loginEnabled ? '1' : '0',
    YOULIN_LOCAL_TEST_MODE: '1',
    YOULIN_ENTERPRISE_ID: 'youlin-local',
    YOULIN_KEYCLOAK_AUDIENCE: 'youlin-api',
    // Server-side token accounting for the main chat path; statistics only, no enforcement.
    YOULIN_USAGE_ACCOUNTING: loginEnabled ? '1' : '0',
  });
  if (loginEnabled)
    // Operator-authorized model gateway, login-test only: stop blanking these two so the private
    // 0600 env_file decides. The values are never rendered into the compose file nor printed.
    // Quarantine and identity-prepared keep the gateway disconnected.
    for (const key of ['OPENAI_API_KEY', 'OPENAI_PROXY_URL']) delete app.environment[key];
  if (loginEnabled)
    // Docker ignores `ports` on an internal network, so a login-test instance would be unreachable
    // from the host browser (and the OIDC callback could never return). Loopback-only publication
    // is what keeps this off the LAN; quarantine and identity-prepared stay fully internal.
    profile.networks.default.internal = false;
  profile.volumes.identity_database = {};
  profile.services['identity-db'] = {
    image: localIdentityImages.postgres,
    pull_policy: 'never',
    security_opt: ['no-new-privileges:true'],
    cpus: 0.5,
    pids_limit: 64,
    mem_limit: '256m',
    memswap_limit: '256m',
    env_file: [path.join(artifacts, 'identity/database.env')],
    command: ['postgres', '-c', 'shared_buffers=32MB', '-c', 'max_connections=20'],
    volumes: [{ type: 'volume', source: 'identity_database', target: '/var/lib/postgresql/data' }],
    restart: 'unless-stopped',
    healthcheck: {
      test: ['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U keycloak -d keycloak'],
      interval: '3s',
      timeout: '2s',
      retries: 30,
    },
  };
  profile.services.keycloak = {
    image: localIdentityImages.keycloak,
    pull_policy: 'never',
    user: '1000:0',
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    // Official start-dev performs Quarkus augmentation in its private image overlay.
    // Persistent identity data resides ONLY in the separate PostgreSQL volume.
    read_only: false,
    cpus: 2,
    pids_limit: 256,
    mem_limit: '1536m',
    memswap_limit: '1536m',
    network_mode: 'service:app',
    env_file: [path.join(artifacts, 'identity/server.env')],
    environment: {
      KC_DB: 'postgres',
      KC_DB_URL: 'jdbc:postgresql://identity-db:5432/keycloak',
      KC_DB_USERNAME: 'keycloak',
      KC_DB_POOL_INITIAL_SIZE: '1',
      KC_DB_POOL_MIN_SIZE: '1',
      KC_DB_POOL_MAX_SIZE: '8',
      JAVA_OPTS_KC_HEAP: '-XX:MaxRAMPercentage=60 -XX:InitialRAMPercentage=30',
    },
    command: [
      'start-dev',
      '--import-realm',
      `--hostname=http://127.0.0.1:${identityPort}`,
      '--http-host=0.0.0.0',
      `--http-port=${identityPort}`,
    ],
    tmpfs: ['/opt/keycloak/data:rw,size=256m,uid=1000,gid=0,mode=0700'],
    volumes: [
      {
        type: 'bind',
        source: path.join(artifacts, 'identity/realm.json'),
        target: '/opt/keycloak/data/import/realm.json',
        read_only: true,
      },
    ],
    depends_on: {
      'app': { condition: 'service_started' },
      'identity-db': { condition: 'service_healthy' },
    },
    restart: 'unless-stopped',
    healthcheck: {
      test: [
        'CMD',
        'bash',
        '-ec',
        // Written with a single `$`; serializeComposeProfile escapes it for Compose interpolation.
        // An unescaped `$status` rendered as `[[ "" == *" 200 "* ]]`, which can never pass even
        // while the realm serves 200. The image has no curl/wget, so bash /dev/tcp stays the probe.
        [
          'exec 3<>/dev/tcp/127.0.0.1/',
          identityPort,
          "; printf 'GET /realms/youlin-local/.well-known/openid-configuration HTTP/1.1",
          String.raw`\r\n`,
          'Host: 127.0.0.1',
          String.raw`\r\n`,
          'Connection: close',
          String.raw`\r\n\r\n`,
          "' >&3; read -r status <&3; [[ ",
          '"$status"',
          ' == *" 200 "* ]]',
        ].join(''),
      ],
      interval: '3s',
      timeout: '3s',
      retries: 40,
      start_period: '30s',
    },
  };
  return profile;
};
