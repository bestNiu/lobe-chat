## Findings

1. **P1 — Fixed USD 20 cap is not enforced**  
   [reservation.ts:105](/home/ulyy/app/unionclinRag/unionclinHub/apps/server/src/modules/YoulinModelAccess/reservation.ts:105) trusts the account’s arbitrary `limitMicroUsd`; the USD 20 constant at [youlinModelBudget.ts:69](/home/ulyy/app/unionclinRag/unionclinHub/packages/types/src/youlinModelBudget.ts:69) is unused. The tests even exercise a different limit, while [README.md:23](/home/ulyy/app/unionclinRag/unionclinHub/apps/server/src/modules/YoulinModelAccess/README.md:23) describes administrator-controlled budgets, contradicting the stated fixed per-user USD 20 requirement.  
   **Introduced:** yes. **Likelihood:** high. **Release-blocking:** yes, for future shared-key traffic.  
   **Trigger/consequence:** Any future adapter supplies a limit above or below USD 20; the reducers authorize that different budget.  
   **Minimal repair:** Make the reducer validate/enforce `YOULIN_DEFAULT_MONTHLY_BUDGET_MICRO_USD`, or remove the configurable limit from the normal account contract. Model exceptional administrative adjustments separately if they are genuinely required.

2. **P1 — A late overrun freezes only an expired monthly account**  
   [settlement.ts:70](/home/ulyy/app/unionclinRag/unionclinHub/apps/server/src/modules/YoulinModelAccess/settlement.ts:70) sets `frozen` on the reservation’s original-period account. That is correct for accounting, but reservations in a later month consult only that later account’s flag at [reservation.ts:103](/home/ulyy/app/unionclinRag/unionclinHub/apps/server/src/modules/YoulinModelAccess/reservation.ts:103).  
   **Introduced:** yes. **Likelihood:** medium. **Release-blocking:** yes, for future shared-key traffic.  
   **Trigger/consequence:** A September uncertain request settles during October with usage beyond its hold. September becomes frozen, but the unfrozen October account continues authorizing spending, so “freeze further spending until explicit adjustment” is ineffective.  
   **Minimal repair:** Represent the overrun freeze at user/tenant scope across periods, or have settlement return an explicit user-freeze transition that the future authoritative transaction must apply alongside original-month accounting. Add a late-overrun → new-month-reservation denial regression test.

No other findings arose from the requested checks. Cached input accounting, one-time ceiling, Shanghai boundaries, tenant/user/model denial, replay conflicts, dispatch-once transitions, dispatch price recheck, price snapshots, cancellation/uncertain outcomes, original-month settlement, and overrun recording are otherwise internally consistent within the declared reducer-only scope.

## Release prerequisites, not findings

The README correctly identifies that authoritative transactional persistence and unique request keys, trusted identity, all-path gateway integration, normalized final usage, verified token bounds, and real tariffs remain unimplemented release prerequisites. The shared key must remain disabled until those exist. No product acceptance is claimed.

I performed read-only static review only. I did not run tests or gates. The reported 68 passing tests, targeted lint, and scoped type check were not independently verified, and there is no full-repository type-check claim.