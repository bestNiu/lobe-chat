# Youlin single-key model budget domain

This directory contains **pure server-side policy reducers**, not a live billing service. Nothing registers them on the existing Chat endpoints. There is no in-memory production balance, database adapter, admin API/UI or claim of multi-process enforcement yet. Do not enable shared-key employee traffic on the strength of these tests.

## Implemented rules

- USD20 is the user-confirmed **initial/default** monthly allowance, not an immutable maximum: administrators may adjust per-user budgets. Only a future authorized persistence layer supplies `limitMicroUsd`; never accept it from a chat request. The exported default constant is intended for account creation, not a clamp on administrative adjustments.
- Exact integer USD millionths; tariff rates are micro-USD per million tokens, plus an explicit per-request charge. `20 USD = 20_000_000` micro-USD. No float arithmetic, scientific notation or implicit free fallback.
- Exact tenant/user/model grant match, current enabled policy, unique model entry, configured price and bounded input/output. Prices are trusted administrator-authored local tariffs, not values provided by the browser or inferred from model names.
- Reserve the worst supported text-token charge before I/O, including cache-premium pricing. An input bound must cover system prompts, history, tools and overhead; do NOT trust the client's token estimate. Images/audio/video/search/tool fees require their own verified meter before use.
- Reserve → claim dispatch once → final settle, or retain uncertain usage. Only a reservation never claimed for dispatch can be cancelled as free. Timeout, stream disconnect, 5xx, lost final usage or a crashed worker do not prove no upstream charge.
- Recheck permission, account freeze, policy limits, month and unchanged price before dispatch. Current permission denial also blocks idempotency replay. A returned historical receipt is not a second upstream-call permit.
- Settle with the immutable dispatch quote, trusted final usage including billed reasoning, and cached input as a subset of input. Round once per request by less than one micro-dollar. Record overruns and freeze further spending rather than truncating charges.
- Periods are Asia/Shanghai calendar months (contemporary +08), not rolling 30 days. Old in-flight requests settle in their original period; never move their unresolved holds into or erase them on the next month.

## Required persistence / transport contract (NOT implemented here)

1. Use authoritative server-derived enterprise/user identity plus live session/subject authorization, never request-body identity. The ordinary user cannot choose the upstream endpoint, provider credentials or effective model alias.
2. In a new primary-DB transaction, serialize grant/price changes and lock the user-period account. Enforce a unique `(enterprise, user, requestKey)` across months. Load any existing reservation while locked; run these reducers; atomically persist account, reservation and append-only audit. Version/CAS or row locks must cover dispatch claims, cancellation and settlement as well. Pure reducer tests do **not** prove this concurrency property.
3. Derive request digest from the complete effective request. Enforce input limits with a verified tokenizer/context bound and hard-cap upstream output. Persist the dispatch claim before network I/O. Do not retry an uncertain upstream attempt under the same or an automatically minted new key.
4. Perform network I/O outside the transaction. Normalize the gateway's final usage without inventing zero values for missing counters. Settlement must remain possible after a user is disabled so incurred charges are still recorded; that does not restore permission to dispatch.
5. Unknown/malformed usage must retain the hold and enter reconciliation. No automatic TTL refund. A database failure prevents dispatch; an ambiguous settlement commit is resolved from the durable idempotency record.
6. Shared gateway credentials remain backend-only. Apply controls to all generation entrances, including streaming/non-streaming, retries, tools/agents, public API paths and custom-provider/BYOK bypasses. Browser model hiding is not enforcement.
7. Settlement's non-null `freezeUser` effect MUST set the matching user-scoped policy's `spendingFrozen` in the same transaction, even when settling an expired monthly account. Every reserve/dispatch must load this authoritative user policy, under the same user lock used for settlements. `freezeUser: null` means no action, never unfreeze; a month rollover must not reset `spendingFrozen`. This cross-period transaction is still an unimplemented integration requirement.
8. Admin model grants/prices/budgets need real server-side authorization, atomic audited updates and revision checks. Lowering a limit does not erase spend/holds. A later explicit adjustment is needed to unfreeze an overrun.
9. Pricing may not match the gateway's actual charge: without a documented price/usage contract, describe the result as local tariff accounting, not reconciled upstream billing. A platform monthly budget is not a hard spending limit on the shared gateway key against all other clients.

Tests deliberately use synthetic rates and exercise deterministic state transitions. They do not call a paid model or prove durable reservations, crash recovery, app integration or product UAT.
