# Isolated Keycloak identity verification

```bash
node scripts/youlin/identity.smoke.mjs
```

The host coordinates Docker only. A disposable Keycloak 26.6.2 uses `start-dev`, H2 and RAM storage; Node runs the assertions in a second container sharing only the Keycloak network namespace. That namespace has `network=none`, no external network or published ports. No production data, SMTP, HR, WeCom or application database is used. The temporary directory contains generated synthetic passwords and a confidential-client secret, is private to the coordinator, and is deleted on normal/error/SIGTERM cleanup. SIGKILL/daemon failure still requires UUID-scoped cleanup, including the printed temporary-directory path. Never globally prune Docker.

The pinned Keycloak image must be prepared separately (no source/Secrets mounted):

```bash
docker pull quay.io/keycloak/keycloak:26.6.2@sha256:f9ba7b2af90db8dc749a57ca9aedca51e840cb9224441ab546a968da941da900
```

`realm.mjs` is a candidate configuration generator, not an approved production deployment. Its default is HTTPS, closed registration, unique email, S256 PKCE, no implicit/password grants, Web confidential client and Desktop public client without a shared secret. Authentication accepts employee number or verified email. The browser flow evaluates the `platform-admin` MFA condition **after** cookie authentication so an existing SSO cookie cannot skip newly required MFA; employees with configured OTP must also complete it. Ordinary-employee mandatory MFA policy remains open. Loopback HTTP is explicitly test-only (Desktop loopback callback is a separate native OAuth transport).

`fixture.mjs` adds synthetic users and credentials only at runtime. The OTP user uses a public RFC 6238 test vector, never a deployable credential. The lab bootstrap master administrator uses a temporary password grant solely for test administration; **master/Keycloak infrastructure administrators' production MFA is not established by these tests**.

`browser.mjs` drives real HTTP forms, cookies, redirects, state/nonce and PKCE. This is a protocol driver, not a rendered browser or Electron acceptance test. Fourteen protocol cases exercise the real issuer, including positive and negative OTP, SSO role elevation, code replay, invalid audience/party/signature, ID-token substitution, expiration and disable/refresh behavior. Email reset delivery, role-change refresh-token invalidation, real IdP failover and actual Web/Desktop session wiring remain unverified.

The default-off `createKeycloakAccessVerifier` checks RS256/JWKS, issuer, API audience, authorized party and required claims. It returns only `(issuer, subject)` and timestamps. It neither binds HR records by email nor grants application access. The lab demonstrates that a previously issued JWT can remain cryptographically valid after account disable: current authoritative deny/epoch and PDP/PEP checks are mandatory. Without a reader, the existing revocation gate denies with `NOT_CONFIGURED`.

## Production handoff gates (not completed)

- Replace H2/start-dev with approved persistent PostgreSQL, TLS/proxy/hostname configuration, backups and monitoring; never deploy the lab bootstrap or fixture.
- Set exact real callback URLs, API audience and registered parties, distribute Web secrets through an approved secret channel, and keep Desktop a public client.
- Configure approved SMTP, prove verified-email password recovery, and review recovery/OTP-reset paths for privileged accounts.
- Integrate stable HR person keys, application account mapping, conflict handling, employment stages and fresh authority reads; revoke old sessions/refresh grants when authority changes.
- Review master-admin MFA, emergency identities, service clients, role-change/refresh interactions and operational recovery independently.
- Prove private LobeHub Web and Windows/macOS login/session/logout, then external UAT. No product acceptance or production readiness is claimed here.
