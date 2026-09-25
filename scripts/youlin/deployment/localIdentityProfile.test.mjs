import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalIdentityProfile } from './localIdentityProfile.mjs';
import { createLocalIdentityRealm } from './localIdentityRealm.mjs';

const input = {
  artifacts: '/private/instance',
  image: `sha256:${'a'.repeat(64)}`,
  port: 33210,
  identityPort: 33211,
};

test('identity preparation keeps app authentication quarantined and volumes separate', () => {
  const p = createLocalIdentityProfile(input);
  assert.equal(p.services.app.environment.AUTH_DISABLE_EMAIL_PASSWORD, '1');
  assert.equal(p.services.app.environment.AUTH_SSO_PROVIDERS, '');
  assert.equal(p.services.app.environment.YOULIN_ENTERPRISE_SESSION_ENFORCEMENT, '0');
  assert.equal(p.services.keycloak.network_mode, 'service:app');
  assert.equal(p.services['identity-db'].ports, undefined);
  assert.equal(p.networks.default.internal, true);
  assert.deepEqual(p.volumes, { database: {}, identity_database: {} });
  for (const published of p.services.app.ports) assert.equal(published.host_ip, '127.0.0.1');
  for (const name of ['app', 'keycloak', 'identity-db'])
    assert.equal(p.services[name].mem_limit, p.services[name].memswap_limit);
});

test('login test requires explicit enabling and fixes enterprise policy after env files', () => {
  const { environment } = createLocalIdentityProfile({ ...input, loginEnabled: true }).services.app;
  assert.equal(environment.AUTH_SSO_PROVIDERS, 'keycloak');
  assert.equal(environment.YOULIN_ENTERPRISE_SESSION_ENFORCEMENT, '1');
  assert.equal(environment.YOULIN_MANUAL_ENROLLMENT, '1');
  assert.equal(environment.YOULIN_LOCAL_TEST_MODE, '1');
  // The operator authorized connecting the model gateway in login-test, so the profile must stop
  // blanking it; the value comes from the private 0600 env file, never from the rendered compose.
  assert.equal('OPENAI_API_KEY' in environment, false);
  assert.equal('OPENAI_PROXY_URL' in environment, false);
  for (const identityPort of [80, 3210, 33210, 65536, '33211'])
    assert.throws(() => createLocalIdentityProfile({ ...input, identityPort }));
});

test('local realm closes enrollment/recovery, desktop, self-account management and MFA', () => {
  const r = createLocalIdentityRealm({
    port: 33210,
    webSecret: 'a'.repeat(64),
    controlSecret: 'b'.repeat(64),
  });
  assert.equal(r.registrationAllowed, false);
  assert.equal(r.resetPasswordAllowed, false);
  assert.equal(r.verifyEmail, false);
  assert.equal(r.loginWithEmailAllowed, true);
  assert.equal(r.editUsernameAllowed, false);
  assert.equal(
    r.clients.some((c) => c.clientId === 'youlin-desktop'),
    false,
  );
  assert.equal(r.clients.find((c) => c.clientId === 'account').enabled, false);
  assert.equal(r.clients.find((c) => c.clientId === 'account-console').enabled, false);
  const web = r.clients.find((c) => c.clientId === 'youlin-web');
  assert.deepEqual(web.redirectUris, ['http://127.0.0.1:33210/api/auth/oauth2/callback/keycloak']);
  assert.equal(web.directAccessGrantsEnabled, false);
  assert.equal(web.attributes['pkce.code.challenge.method'], 'S256');
  assert.equal(
    r.authenticationFlows.some((f) => f.alias.includes('mfa')),
    false,
  );
  assert.equal(r.users.length, 1);
  assert.equal(r.users[0].serviceAccountClientId, 'youlin-identity-control');
  assert.equal(r.users[0].credentials, undefined);
});

test('local realm keeps Keycloak default client scopes so tokens still carry sub', () => {
  const r = createLocalIdentityRealm({
    controlSecret: 'b'.repeat(64),
    port: 33210,
    webSecret: 'a'.repeat(64),
  });
  const web = r.clients.find((c) => c.clientId === 'youlin-web');
  // Keycloak 26 emits `sub` through the `basic` scope's oidc-sub-mapper. An imported client that
  // names its own scopes silently ends up without `basic`, and then every login fails the
  // verifier's requiredClaims:['sub'] with ERR_JWT_CLAIM_VALIDATION_FAILED (observed live).
  assert.equal(web.defaultClientScopes, undefined);
  assert.equal(web.optionalClientScopes, undefined);
  const audience = web.protocolMappers.find((m) => m.protocolMapper === 'oidc-audience-mapper');
  assert.equal(audience.config['included.client.audience'], 'youlin-api');
  assert.equal(audience.config['access.token.claim'], 'true');
});

test('gateway credentials stay blanked until login is explicitly enabled', () => {
  const quarantined = createLocalIdentityProfile({ ...input, loginEnabled: false });
  assert.equal(quarantined.services.app.environment.OPENAI_API_KEY, '');
  assert.equal(quarantined.services.app.environment.OPENAI_PROXY_URL, '');

  const login = createLocalIdentityProfile({ ...input, loginEnabled: true });
  // Absent from `environment` means the private 0600 env_file value applies; a rendered compose
  // file must never contain the gateway secret.
  assert.equal('OPENAI_API_KEY' in login.services.app.environment, false);
  assert.equal('OPENAI_PROXY_URL' in login.services.app.environment, false);
  // Authentication quarantine is unaffected by connecting the gateway.
  assert.equal(login.services.app.environment.AUTH_DISABLE_EMAIL_PASSWORD, '1');
  assert.equal(login.services.app.environment.AUTH_ENABLE_MAGIC_LINK, '0');
  assert.equal(login.services.app.environment.YOULIN_ENTERPRISE_SESSION_ENFORCEMENT, '1');
  // Token accounting follows the same explicit gate: on only for login-test, never by accident.
  assert.equal(login.services.app.environment.YOULIN_USAGE_ACCOUNTING, '1');
  assert.equal(quarantined.services.app.environment.YOULIN_USAGE_ACCOUNTING, '0');
  // Model governance follows the same explicit gate: enforced in login-test, never by accident.
  assert.equal(login.services.app.environment.YOULIN_MODEL_ACCESS_CONTROL, '1');
  assert.equal(quarantined.services.app.environment.YOULIN_MODEL_ACCESS_CONTROL, '0');
});
