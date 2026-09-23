# Experimental Youlin revocation reader (M02-006-S3)

This is a **read-only prototype**, not the production repository or identity registry.

- `schema.ts` maps only `subject_states` from the disposable SQL fixture. It is outside `src/schemas`, unexported by the product schema index, and undiscovered by the production Drizzle generator. No migration or product route was added.
- `reader.ts` binds both subject kind and ID, reads on every invocation, snapshots input before IO, rejects unsafe versions, and returns null for missing subjects. Storage failures propagate; there is no active-state fallback.
- The caller must derive the subject from verified identity and supply a primary/current-snapshot connection. This reader cannot detect stale replicas or an old repeatable-read transaction.
- Abort before IO rejects immediately. Abort during IO discards the result **but does not cancel the underlying SQL statement**. Driver cancellation, server statement timeouts and overload control remain prerequisites for production.
- Types here describe the experiment only. Canonical shared enterprise types, mapping to `users`/`auth_sessions`/accounts, foreign keys, retention and approved production schema remain pending.

## Verification

The sibling test executes the existing SQL fixture inside a fresh PGlite database and uses the real Drizzle driver, not a mocked database. It deliberately does not call `getTestDB()`: that helper runs the product migration chain, whereas these tables must remain isolated. It never uses `DATABASE_TEST_URL` or external data.

13 tests cover row mapping, user/service separation, missing state, committed-state reread, parameter binding, pre/during-IO cancellation, input mutation, maximum-safe-integer round trip, SQL bounds, invalid version detection after synthetic constraint drift, and transaction failure propagation/rollback.

PGlite verification alone is **not** evidence for node-postgres, replica freshness or IdP/Session integration. The separate SQL-only experiment remains distinct from the new driver round below.

## Local node-postgres round

Run `node scripts/youlin/nodePostgres.smoke.mjs` from the repository root. The harness starts separate PostgreSQL 15 and Node/Vitest containers, both without networking or published ports. They share a Docker RAM socket volume, not a host socket directory. The real Node/pg/Drizzle tests and their resource limits are now inside Docker; host Node only coordinates. Without this environment, the database cases are explicitly skipped; ordinary root checks do not count them as passed. The latest round runs 18 database cases (9 generic reader + 9 owned pool) and separately 11 configuration checks.

Nine cases passed: two independent pools see committed revocation, rollback is atomic, the synthetic reader role cannot mutate/read audit/invoke the mutation function, parameters remain bound, missing/failed state denies, and bigint bounds survive the real driver.

Two limitations were reproduced, not fixed: a pinned repeatable-read transaction sees stale state even on the primary; gate timeout/AbortSignal does not cancel the SQL. A synthetic 1500ms PostgreSQL statement_timeout ends the blocked query (57014), after which the pool can read again, potentially on a replacement connection. These values are test budgets, not a production SLA. Replica/production connection policy, immediate cancellation and overload handling remain pending.

Normal completion and interruption during blocked SQL remove this run's test process/container/socket resources. SIGKILL/host failure still needs manual, UUID-scoped cleanup. This is not a persistent full application deployment.

From the repository root:

```bash
node scripts/youlin/dockerNode.mjs --check --lint --test \
  packages/database/src/experimental/youlinSecurity/{reader,schema,types}.ts \
  packages/database/src/experimental/youlinSecurity/__tests__/reader.test.ts
```

## Owned pool contract (r3)

`createExperimentalOwnedReader` in `ownedReader.ts` adds an opt-in, local Unix-socket-only path. It does not accept or expose a Pool, client or transaction. Configuration and subject bindings are copied before IO; no credentials are taken from an implicit URL/environment fallback.

Every admitted read acquires its own lease, starts `READ COMMITTED READ ONLY`, checks the transaction settings and recovery flag, selects through the existing Drizzle reader, and ends the transaction before returning a healthy connection. Any failure before transaction cleanup discards the connection. This avoids borrowing an old repeatable-read snapshot; the generic Reader and its counterexample remain unchanged.

Admission is bounded per instance across acquisition, SQL and cleanup. Surplus requests fail immediately; cancellation does not free a slot while the underlying work remains pending. Connection, server statement, client query and idle-transaction budgets are explicit. They are not an aggregate wall-clock guarantee or a global limit across multiple instances. Client lease release/destruction is not an acknowledgement that a remote backend has stopped; no hard server-side physical-connection-count claim is made. `close()` rejects new work and prevents successful delivery of an in-flight result; it waits for cleanup and is idempotent.

A failing regression demonstrated pg's fallback to `PG*` variables for some empty/missing settings. The wrapper rejects empty passwords and explicitly supplies nonempty session options, encoding, SSL negotiation and replication settings. The test uses synthetic hostile environment values, never real credentials.

The recovery-flag check is implemented but has not been exercised on a real standby topology. Logical replication freshness, endpoint authority, TLS/remote connections, immediate SQL cancellation, host failure, throughput and production identity mapping remain out of scope. Reads add transaction/metadata round trips; no performance claim is made. Do not create a new wrapper per request to evade its concurrency bound.

No user-visible outcome is exposed, so this round is engineering verification rather than product acceptance. See [evidence and remaining gates](../../../../../docs/youlin-enterprise-ai-platform/plan/evidence/M02-006-S3/r3-manifest.json).
