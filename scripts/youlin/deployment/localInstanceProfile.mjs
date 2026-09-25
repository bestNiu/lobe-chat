import { createRuntimeSmokeProfile } from './runtimeSmokeProfile.mjs';

/** Persistent, loopback-only quarantine. This is NOT an employee-ready deployment. */
export const createLocalInstanceProfile = ({ artifacts, image, port }) => {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('INVALID_LOCAL_PORT');
  const profile = createRuntimeSmokeProfile({ artifacts, image });
  delete profile.services.probe;
  profile.services.app.ports = [{ host_ip: '127.0.0.1', published: String(port), target: 3210 }];
  // Enforce quarantine after env_file: a copied/edited env file cannot enable password signup.
  Object.assign(profile.services.app.environment, {
    AUTH_DISABLE_EMAIL_PASSWORD: '1',
    AUTH_SSO_PROVIDERS: '',
    AUTH_ENABLE_MAGIC_LINK: '0',
    OPENAI_API_KEY: '',
    OPENAI_PROXY_URL: '',
    APP_URL: `http://127.0.0.1:${port}`,
    // Quarantine diagnosability: two fixed Youlin namespaces only, so a denied login names its
    // classification in `docker logs` instead of an opaque 500. No wildcards, no upstream noise,
    // and the namespaces log codes only (never tokens, subjects or credentials).
    DEBUG: 'lobe-app:youlin-enterprise-auth,lobe-server:youlin-identity',
  });
  for (const service of ['postgres', 'redis', 'app'])
    profile.services[service].restart = 'unless-stopped';
  // Redis is deliberately reconstructible cache; authoritative application data is in PostgreSQL.
  return profile;
};
