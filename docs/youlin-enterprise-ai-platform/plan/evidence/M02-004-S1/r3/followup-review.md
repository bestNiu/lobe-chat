## Follow-up result

Both original P1 findings are resolved. I found no new in-scope findings or regressions under the mandatory Quick checklists.

1. **Resolved — Terminal `authorityVersion` actors remain authorized**

   The shared authorization query now selects `authorityVersion` and rejects either terminal `authEpoch` or terminal `authorityVersion` before checking the grant: [authorityTransaction.ts:57](/home/ulyy/app/unionclinRag/unionclinHub/packages/database/src/repositories/youlinIdentity/authorityTransaction.ts:57).

   The regression covers an active actor with a current grant and terminal `authorityVersion`: [authorityTransaction.test.ts:62](/home/ulyy/app/unionclinRag/unionclinHub/packages/database/src/repositories/youlinIdentity/__tests__/authorityTransaction.test.ts:62).

2. **Resolved — Already-bound human proposals bypass mandatory review**

   Binding now reads the current actor kind before the same-owner fast path. That path requires `actor.kind === 'service'`: [binding.ts:116](/home/ulyy/app/unionclinRag/unionclinHub/packages/database/src/repositories/youlinIdentity/binding.ts:116).

   All valid human proposals enter the review-case branch, return `review_required`, and preserve `principal_in_use` whenever a reservation already exists: [binding.ts:131](/home/ulyy/app/unionclinRag/unionclinHub/packages/database/src/repositories/youlinIdentity/binding.ts:131). Mapping creation and authority invalidation remain exclusively after that branch at lines 153–161.

   PostgreSQL regressions cover same-owner and other-owner reservations, pending-case persistence, idempotent replay, and unchanged persisted mapping/authority state: [binding.test.ts:118](/home/ulyy/app/unionclinRag/unionclinHub/packages/database/src/repositories/youlinIdentity/__tests__/binding.test.ts:118).

## Supplied verification evidence

I did not execute tests or validators. The supplied artifacts report:

- Before fixes: 3 failed, 62 passed, matching the two original findings.
- After fixes: 65/65 passed, including the three new cases.
- Changed-file lint and scoped type checking exited successfully.

These are engineering results only, not product acceptance or UAT.

## Pre-deploy checks

These remain operational questions, not current code defects:

- Confirm prior schema migrations exist in every target before enabling the repositories.
- Verify the HR adapter provides complete normalized snapshots with genuinely ordered per-person revisions.
- Restrict `identity:sync-hr` and `identity:deliver` grants to authenticated service subjects.
- Establish relay lease/retry settings, dead-event monitoring, and backlog/rollback handling.
- Ensure transport acknowledgement remains delivery-only and never updates `idpRevocationConfirmedEpoch`.

**No in-scope release-blocking findings remain from this static follow-up review.**