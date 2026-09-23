import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { parseHTML } from 'linkedom';

import { createKeycloakAccessVerifier } from '../../../apps/server/src/modules/YoulinIdentity/keycloakAccessVerifier.ts';
import { createRevocationGate } from '../../../apps/server/src/modules/YoulinSecurity/revocationGate.ts';
import { createProtocolBrowser, exchange } from './browser.mjs';

const runId = process.env.YOULIN_IDENTITY_RUN;
if (
  !runId ||
  !/^[a-f0-9-]{36}$/.test(runId) ||
  process.env.YOULIN_IDENTITY_REALM !== `youlin-${runId}`
)
  throw new Error('Dedicated synthetic identity environment required');
const issuer = `http://127.0.0.1:8080/realms/youlin-${runId}`;
const secret = process.env.YOULIN_IDENTITY_SECRET;
const password = process.env.YOULIN_IDENTITY_PASSWORD;
const verifierOptions = {
  enabled: true,
  issuer,
  audience: 'youlin-api',
  authorizedParties: ['youlin-web', 'youlin-desktop'],
  testOnlyLoopbackHttp: true,
};
const verify = createKeycloakAccessVerifier(verifierOptions);
let adminToken;
let employeeId;
let adminId;
let realmConfig;
const admin = (suffix = '', options = {}) =>
  fetch(`http://127.0.0.1:8080/admin/realms/youlin-${runId}${suffix}`, {
    ...options,
    signal: AbortSignal.timeout(5000),
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${adminToken}` },
  });
const loginEmployee = (username = 'YY2026001', clientId, redirect) =>
  createProtocolBrowser(issuer, clientId, redirect).authorize({ username, password });

before(async () => {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch (error) {
      if (i === 0) console.error('Waiting for synthetic Keycloak:', error.message);
    }
    await sleep(500);
  }
  assert.ok(ready, 'Keycloak did not become ready within bounded startup window');
  const response = await fetch(
    'http://127.0.0.1:8080/realms/master/protocol/openid-connect/token',
    {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: 'lab-admin',
        password: process.env.YOULIN_IDENTITY_ADMIN_PASSWORD,
      }),
      signal: AbortSignal.timeout(5000),
    },
  );
  assert.equal(response.status, 200, 'Synthetic bootstrap authentication failed');
  adminToken = (await response.json()).access_token;
  const configResponse = await admin();
  assert.equal(configResponse.status, 200);
  realmConfig = await configResponse.json();
  assert.equal(
    realmConfig.attributes.youlinSyntheticRun,
    runId,
    'Refuse mutation of an unmarked realm',
  );
  employeeId = (await (await admin('/users?username=YY2026001&exact=true')).json())[0].id;
  adminId = (await (await admin('/users?username=YY2026002&exact=true')).json())[0].id;
});

test('realm has closed registration, unique email and brute-force protection', () => {
  assert.equal(realmConfig.registrationAllowed, false);
  assert.equal(realmConfig.duplicateEmailsAllowed, false);
  assert.equal(realmConfig.loginWithEmailAllowed, true);
  assert.equal(realmConfig.verifyEmail, true);
  assert.equal(realmConfig.bruteForceProtected, true);
});

test('employee number and verified email authenticate the same stable issuer/subject', async () => {
  const principals = [];
  for (const username of ['YY2026001', 'employee@example.invalid']) {
    const login = await loginEmployee(username);
    assert.ok(
      login.code,
      'Interactive password authentication did not return an authorization code',
    );
    const response = await exchange(issuer, login, { secret });
    assert.equal(response.status, 200);
    const tokens = await response.json();
    principals.push(await verify(tokens.access_token));
    const id = await jwtVerify(
      tokens.id_token,
      createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`)),
      { issuer, audience: 'youlin-web', algorithms: ['RS256'] },
    );
    assert.ok(
      id.payload.nonce === login.nonce,
      'ID token nonce does not match this authentication',
    );
  }
  assert.ok(
    principals[0].subject === principals[1].subject && principals[0].subject === employeeId,
  );
  assert.ok(principals.every((principal) => principal.issuer === issuer));
});

test('incorrect password never returns an authorization code', async () => {
  const login = await createProtocolBrowser(issuer).authorize({
    username: 'YY2026001',
    password: 'Synthetic-Wrong-Password1!',
  });
  assert.ok(!login.code);
});

test('PKCE is mandatory and a stolen code without its verifier is rejected', async () => {
  const without = await createProtocolBrowser(issuer).authorize({
    username: 'YY2026001',
    password,
    pkce: false,
  });
  assert.ok(!without.code && (without.status === 400 || without.error === 'invalid_request'));
  const login = await loginEmployee();
  assert.ok(login.code);
  const response = await exchange(issuer, login, {
    secret,
    verifier: 'incorrect-verifier-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  });
  assert.equal(response.status, 400);
});

test('authorization code replay is rejected', async () => {
  const login = await loginEmployee();
  assert.ok(login.code);
  assert.equal((await exchange(issuer, login, { secret })).status, 200);
  assert.equal((await exchange(issuer, login, { secret })).status, 400);
});

test('Desktop public client uses PKCE without a shared client secret', async () => {
  const login = await loginEmployee(
    'YY2026001',
    'youlin-desktop',
    'http://127.0.0.1:3211/callback',
  );
  assert.ok(login.code);
  const response = await exchange(issuer, login, { clientId: 'youlin-desktop' });
  assert.equal(response.status, 200);
  assert.ok((await verify((await response.json()).access_token)).subject === employeeId);
});

test('password grant is disabled for application clients', async () => {
  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'youlin-web',
      client_secret: secret,
      username: 'YY2026001',
      password,
    }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 400);
});

test('admin MFA is required even without a provisioned required-action flag', async () => {
  assert.equal(
    (
      await admin(`/users/${adminId}`, {
        method: 'PUT',
        body: JSON.stringify({ requiredActions: [] }),
      })
    ).status,
    204,
  );
  const login = await loginEmployee('YY2026002');
  assert.ok(!login.code, 'Admin password alone must not complete login');
  assert.ok(
    parseHTML(login.html).document.querySelector('input[name=totp], input[name=otp]'),
    'Admin must be challenged for OTP configuration/authentication',
  );
});

test('an employee who configured OTP cannot bypass it, and a valid second factor succeeds', async () => {
  const browser = createProtocolBrowser(issuer);
  const login = await browser.authorize({ username: 'YY2026003', password });
  assert.ok(!login.code && parseHTML(login.html).document.querySelector('input[name=otp]'));
  const invalid = await browser.submit(login, { otp: 'not-a-code' });
  assert.ok(!invalid.code);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac('sha1', '12345678901234567890').update(counter).digest();
  const otp = ((hash.readUInt32BE(hash[19] & 15) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, '0');
  const completed = await browser.submit(invalid, { otp });
  assert.ok(completed.code, 'Correct OTP must complete authentication');
  assert.equal((await exchange(issuer, completed, { secret })).status, 200);
});

test('an existing employee SSO cookie cannot bypass MFA after promotion to admin', async () => {
  const browser = createProtocolBrowser(issuer);
  const login = await browser.authorize({ username: 'YY2026001', password });
  assert.ok(login.code);
  const role = await (await admin('/roles/platform-admin')).json();
  const body = JSON.stringify([role]);
  assert.equal(
    (await admin(`/users/${employeeId}/role-mappings/realm`, { method: 'POST', body })).status,
    204,
  );
  try {
    const elevated = await browser.authorize();
    assert.ok(
      !elevated.code &&
        parseHTML(elevated.html).document.querySelector('input[name=totp], input[name=otp]'),
    );
  } finally {
    assert.equal(
      (await admin(`/users/${employeeId}/role-mappings/realm`, { method: 'DELETE', body })).status,
      204,
    );
    assert.equal(
      (
        await admin(`/users/${employeeId}`, {
          method: 'PUT',
          body: JSON.stringify({ requiredActions: [] }),
        })
      ).status,
      204,
    );
  }
});

test('duplicate verified email cannot create a second workforce account', async () => {
  const response = await admin('/users', {
    method: 'POST',
    body: JSON.stringify({
      username: 'YY2026099',
      email: 'employee@example.invalid',
      enabled: true,
      emailVerified: true,
    }),
  });
  assert.equal(response.status, 409);
});

test('wrong audience, party, ID-token substitution and tampered signatures are rejected', async () => {
  const login = await loginEmployee();
  const tokens = await (await exchange(issuer, login, { secret })).json();
  await assert.rejects(
    createKeycloakAccessVerifier({ ...verifierOptions, audience: 'another-api' })(
      tokens.access_token,
    ),
  );
  await assert.rejects(
    createKeycloakAccessVerifier({ ...verifierOptions, authorizedParties: ['another-client'] })(
      tokens.access_token,
    ),
  );
  await assert.rejects(verify(tokens.id_token));
  const parts = tokens.access_token.split('.');
  const signature = Buffer.from(parts[2], 'base64url');
  signature[0] ^= 1;
  parts[2] = signature.toString('base64url');
  await assert.rejects(verify(parts.join('.')));
});

test('expired access tokens are rejected using real issuer signatures', async () => {
  assert.equal(
    (await admin('', { method: 'PUT', body: JSON.stringify({ accessTokenLifespan: 1 }) })).status,
    204,
  );
  try {
    const login = await loginEmployee();
    const response = await exchange(issuer, login, { secret });
    assert.equal(response.status, 200);
    const tokens = await response.json();
    await sleep(2100);
    await assert.rejects(verify(tokens.access_token), { code: 'ERR_JWT_EXPIRED' });
  } finally {
    assert.equal(
      (await admin('', { method: 'PUT', body: JSON.stringify({ accessTokenLifespan: 120 }) }))
        .status,
      204,
    );
  }
});

test('disable blocks new logins and refresh; signed JWT alone cannot prove current authorization', async () => {
  const login = await loginEmployee();
  const tokens = await (await exchange(issuer, login, { secret })).json();
  assert.equal(
    (
      await admin(`/users/${employeeId}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: false }),
      })
    ).status,
    204,
  );
  const denied = await loginEmployee();
  assert.ok(!denied.code);
  const refresh = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: 'youlin-web',
      client_secret: secret,
      refresh_token: tokens.refresh_token,
    }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(refresh.status, 400);
  // Deliberate counterexample, not a successful revocation implementation.
  assert.ok((await verify(tokens.access_token)).subject === employeeId);
  const result = await createRevocationGate({ enabled: true })({
    authEpoch: 0,
    subjectRef: { kind: 'user', id: employeeId },
  });
  assert.deepEqual(result, { reason: 'NOT_CONFIGURED', status: 'deny' });
});
