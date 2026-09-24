## Follow-up result

No new findings. Both original findings are closed as follows.

1. **Fixed USD20 cap — withdrawn**

   The original finding relied on an incorrect interpretation of the requirement. The user explicitly requested administrator-controlled per-user model access and token budgets; USD20 is the initial/default monthly allocation, not an immutable ceiling.

   Evidence:

   - [README.md:7](/home/ulyy/app/unionclinRag/unionclinHub/apps/server/src/modules/YoulinModelAccess/README.md:7) explicitly limits `limitMicroUsd` to the future authorized persistence layer and distinguishes the USD20 creation default from administrator adjustments.
   - [youlinModelBudget.ts:32](/home/ulyy/app/unionclinRag/unionclinHub/packages/types/src/youlinModelBudget.ts:32) correctly models the authoritative per-user limit.
   - [youlinModelBudget.ts:71](/home/ulyy/app/unionclinRag/unionclinHub/packages/types/src/youlinModelBudget.ts:71) exports the USD20 account-creation default.

   Enforcing an immutable USD20 clamp in the reducer would contradict the fuller requirement. The unused creation default is appropriate while account creation and persistence remain deliberately unimplemented.

2. **Late overrun freezes only the expired month — resolved**

   The repair establishes the required cross-period effect at the current reducer-contract boundary:

   - [youlinModelBudget.ts:24](/home/ulyy/app/unionclinRag/unionclinHub/packages/types/src/youlinModelBudget.ts:24) adds authoritative user-scoped `spendingFrozen`.
   - [reservation.ts:42](/home/ulyy/app/unionclinRag/unionclinHub/apps/server/src/modules/YoulinModelAccess/reservation.ts:42) fails closed unless it is exactly `false`; both reservation and dispatch pass through this check.
   - [settlement.ts:67](/home/ulyy/app/unionclinRag/unionclinHub/apps/server/src/modules/YoulinModelAccess/settlement.ts:67) preserves original-period accounting while emitting `freezeUser` for any freeze-producing settlement.
   - [settlement.ts:55](/home/ulyy/app/unionclinRag/unionclinHub/apps/server/src/modules/YoulinModelAccess/settlement.ts:55) makes settlement replay a `null` effect, which cannot unfreeze the user.
   - [README.md:24](/home/ulyy/app/unionclinRag/unionclinHub/apps/server/src/modules/YoulinModelAccess/README.md:24) requires the future store to apply the effect atomically under a shared user-level lock across periods.
   - [budget.test.ts:304](/home/ulyy/app/unionclinRag/unionclinHub/apps/server/src/modules/YoulinModelAccess/__tests__/budget.test.ts:304) covers late overrun → next-month denial and accurately identifies itself as reducer/effect composition, not database concurrency proof.

   The supplied before-fix log records the intended regression failing with `freezeUser` absent. The after-fix Docker log records 36 budget tests plus 33 existing server tests passing, 69 total. Supplied scoped type and targeted lint logs also exit successfully. I did not rerun them.

The complete Quick checklists for all requested dimensions revealed no repair regressions or other concrete defects.

## Remaining rollout prerequisites

Authoritative persistence and atomic locking, live identity and API integration, admin surfaces, all-path enforcement, real tariff data, usage normalization, and quota-race handling remain explicit release prerequisites. They are not implemented or claimed by this reducer-only patch.

This was a static, read-only follow-up. No edits, tests, services, credentials, full-repository verification, or product acceptance were performed.