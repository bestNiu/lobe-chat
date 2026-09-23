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

PGlite verification is **not** evidence for node-postgres pool behavior, replica freshness, query cancellation or an actual IdP/Session integration. The separate PostgreSQL 15 experiment still tests the SQL transaction, not this Drizzle driver combination.

From the repository root:

```bash
bun run check --lint --test \
  packages/database/src/experimental/youlinSecurity/{reader,schema,types}.ts \
  packages/database/src/experimental/youlinSecurity/__tests__/reader.test.ts
```

No user-visible outcome is exposed, so this round is engineering verification rather than product acceptance. See [evidence and remaining gates](../../../../../docs/youlin-enterprise-ai-platform/plan/evidence/M02-006-S3/r1-manifest.json).
