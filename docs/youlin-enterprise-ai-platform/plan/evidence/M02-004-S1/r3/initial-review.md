## Findings

- **P1 — Terminal `authorityVersion` actors remain authorized**  
  Location: [authorityTransaction.ts:57](/home/ulyy/app/unionclinRag/unionclinHub/packages/database/src/repositories/youlinIdentity/authorityTransaction.ts:57)  
  Introduced: yes · Likelihood: low · Release-blocking: yes  
  The authorization query reads only `authEpoch`, and lines 72–77 reject only `authEpoch === Number.MAX_SAFE_INTEGER`. Elsewhere this batch treats either `authEpoch` or `authorityVersion` reaching MAX as terminal. Consequently, an inconsistent actor row with MAX `authorityVersion`, `status='active'`, and a matching grant can still execute control-plane operations. The new inconsistent-state test covers only MAX `authEpoch`. Select `authorityVersion` and reject MAX in the shared permission boundary as well.

- **P1 — An already-bound human proposal bypasses mandatory review-case creation**  
  Location: [binding.ts:116](/home/ulyy/app/unionclinRag/unionclinHub/packages/database/src/repositories/youlinIdentity/binding.ts:116)  
  Introduced: yes · Likelihood: high · Release-blocking: yes  
  The same-subject active-binding fast path returns `linked` before the actor-kind check at line 122. A human with `identity:bind` who submits an existing mapping therefore gets a linked receipt/audit event and no review case, contradicting “human proposals only create review cases.” Determine whether the actor is a service before this fast path, and route every human proposal to `review_required`.

## Pre-deploy checks

- Confirm prior schema migrations are present in every target before enabling these repositories.
- Verify the HR adapter supplies complete normalized snapshots and genuinely ordered per-person revisions.
- Restrict `identity:sync-hr` and `identity:deliver` bootstrap grants to authenticated service subjects.
- Before enabling the relay, establish consistent lease/retry settings, dead-event monitoring, and backlog/rollback handling.
- Ensure transport ACK remains delivery-only and never updates `idpRevocationConfirmedEpoch`.

Static review only; I did not run tests, validators, package tools, or services.