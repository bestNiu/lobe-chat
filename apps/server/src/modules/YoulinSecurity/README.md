# YoulinSecurity — experimental revocation gate

This opt-in module is an isolated engineering slice, **not a production security boundary**. No existing router, Session, worker or public API imports it. It is off by default, and an off/unconfigured gate returns deny (never bypass).

`createRevocationGate` checks a trusted, server-derived global subject and credential epoch against an injected authoritative reader. It rejects disabled/missing/malformed state, wrong subject/kind, both older and newer credential epochs, timeouts and dependency failures. It rereads on every invocation. A successful result is `continue_authorization`, **not allow**: callers must still validate token/session expiry, Workspace/Project membership, resource/Tool/Purpose/Audience, obligations and output authorization.

## Adapter and integration contract

- Reader must return current authoritative state, not a stale replica or TTL cache. Real DB consistency and global disable behavior are not implemented or proved by the fake reader tests.
- Read timeout is explicit configuration; no production default or revocation SLA is invented. Timeouts signal abort, but ignored abort/blocked event loops cannot be preempted. Production adapters need cancellation, concurrency bounds, health checks and circuit breaking.
- Input identity must come from verified authentication, never request body/header claims. Subject IDs follow the draft K01 subset; compatibility with actual IDs still requires approval.
- Configuration is snapshotted at factory creation. Reconstruct after a configuration change; operational emergency disable must also be enforced at the real PEP entry point.
- Recheck before every protected read/Tool/output checkpoint. A successful return is not a reusable capability and does not eliminate the authorization/use race or undo already displayed/downloaded content.
- Logs contain fixed diagnostic codes only, not adapter exceptions, credentials or business data. HTTP error mapping, rate-limited telemetry and durable audit belong to the future integration layer.
- No DB migrations, Keycloak calls, global deny writes, Outbox/Inbox, Session logout or Workload Grant implementation is included.

## Tests

Normal approved repository toolchain:

```bash
bun run check --test apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.test.ts
```

Dependency-free fallback with Node 22.23.1 (used in the initial round before Bun was available):

```bash
node --experimental-strip-types --test scripts/youlin/revocationGate.smoke.mjs
```

Both runners register the same behavioral suite. Node strips types; it **does not type-check**. Fallback success does not replace repository lint/type/Vitest, a real DB/IdP integration test, security verification or AC acceptance. The injected data is entirely synthetic; no network or real user data is used.

A [pinned isolated toolchain](../../../../../scripts/youlin/toolchain/README.md) now runs TypeScript strict, scoped ESLint and the existing Vitest test entry (24 tests). These checks pass, but the root `bun run check --test` remains blocked by missing root dependencies. Isolated rules/configuration are not the full repository preset/setup; no whole-repository quality claim is made.

Production wiring remains blocked pending the implementation/approval requirements in `docs/youlin-enterprise-ai-platform/plan/08-implementation-readiness-and-spikes.md`.
