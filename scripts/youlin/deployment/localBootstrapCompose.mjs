import { images } from '../dockerRuntime.mjs';

/**
 * Ceremony-only TCP relay. It stores nothing and terminates nothing: the runner container shares
 * this namespace, so `127.0.0.1:<identityPort>` inside the ceremony resolves to the realm's
 * configured loopback issuer while the realm itself answers on the private Compose network.
 */
export const relayProgram = `
const net = require('node:net');
const target = net.createServer((client) => {
  const upstream = net.connect({ host: process.env.RELAY_TARGET_HOST, port: Number(process.env.RELAY_TARGET_PORT) });
  upstream.on('error', () => client.destroy());
  client.on('error', () => upstream.destroy());
  client.pipe(upstream).pipe(client);
});
target.listen(Number(process.env.RELAY_PORT), '0.0.0.0');
process.on('SIGTERM', () => target.close(() => process.exit(0)));
`;

/**
 * One-shot ceremony profile: same persistent volumes and image as the live instance, but Keycloak
 * answers on the private Compose network while still publishing its configured loopback issuer,
 * and a stateless TCP relay lets the runner container reach that issuer as 127.0.0.1 by sharing
 * the relay namespace. No port is published to the host and the app serves no traffic.
 */
export const createLocalBootstrapProfile = ({ identityPort, loginProfile }) => {
  if (!Number.isInteger(identityPort) || identityPort < 1024 || identityPort > 65535)
    throw new Error('INVALID_IDENTITY_PORT');
  if (!loginProfile?.services?.keycloak || !loginProfile.services.app)
    throw new Error('LOGIN_PROFILE_REQUIRED');
  const profile = structuredClone(loginProfile);
  const keycloak = profile.services.keycloak;
  delete keycloak.network_mode;
  // The ceremony never needs host exposure: the runner reaches the realm through the relay
  // namespace and PostgreSQL through the internal network, so the stack stays fully internal.
  delete keycloak.ports;
  profile.networks.default.internal = true;
  keycloak.mem_limit = '1024m';
  keycloak.memswap_limit = '1024m';
  delete profile.services.probe;
  // The app stays defined because Keycloak shares its network namespace, but its loopback
  // publication is removed so the ceremony cannot serve employee traffic. The identity profile's
  // bash /dev/tcp health probe is kept unchanged: Keycloak still listens on 127.0.0.1:<port> in
  // its own namespace and the image ships neither curl nor wget.
  delete profile.services.app.ports;
  profile.services.relay = {
    image: images.node,
    pull_policy: 'never',
    user: '1000:1000',
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    cpus: 0.25,
    pids_limit: 64,
    mem_limit: '96m',
    memswap_limit: '96m',
    tmpfs: ['/tmp:rw,size=32m,mode=1777'],
    entrypoint: ['node', '-e', relayProgram],
    environment: {
      RELAY_PORT: String(identityPort),
      RELAY_TARGET_HOST: 'keycloak',
      RELAY_TARGET_PORT: String(identityPort),
    },
    depends_on: { keycloak: { condition: 'service_healthy' } },
    restart: 'no',
  };
  return profile;
};
