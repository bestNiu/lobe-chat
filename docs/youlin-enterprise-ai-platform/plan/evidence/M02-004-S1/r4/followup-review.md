No new P0/P1/P2 findings. All three original P2 findings are resolved, with no static regression identified.

1. **Resolved — protected tag could satisfy workflow gate.**  
   The job now requires `github.ref_type == 'branch'` in addition to protected/default-branch checks at [youlin-verify.yml](/home/ulyy/app/unionclinRag/unionclinHub/.github/workflows/youlin-verify.yml:16). The exact contract assertion matches at [workflow.test.mjs](/home/ulyy/app/unionclinRag/unionclinHub/scripts/youlin/ci/workflow.test.mjs:11). Therefore, a tag—even one named like and protected like the default branch—cannot satisfy the predicate. The supplied logs record the intended fail-before/pass-after sequence and 20 passing contract checks.

2. **Resolved — unknown persisted subject states could be certified.**  
   Cleanup now explicitly accepts only `pending` or `disabled` at [credentialCleanup.ts](/home/ulyy/app/unionclinRag/unionclinHub/packages/database/src/repositories/youlinIdentity/credentialCleanup.ts:64). The real PostgreSQL regression injects an unrecognized value into the unconstrained column, requires `SUBJECT_NOT_DENIED`, and confirms that no cleanup epoch was persisted at [credentialCleanup.test.ts](/home/ulyy/app/unionclinRag/unionclinHub/packages/database/src/repositories/youlinIdentity/__tests__/credentialCleanup.test.ts:193). The supplied logs record 1 failure/46 passes before the repair, then 47 and 28 passes afterward.

3. **Resolved — stale counts and incomplete shard instructions.**  
   The runbook consistently identifies 75 cases as the two-shard union, does not add historical counts, and lists both mandatory commands at [12-deployment-and-local-uat-runbook.md](/home/ulyy/app/unionclinRag/unionclinHub/docs/youlin-enterprise-ai-platform/plan/12-deployment-and-local-uat-runbook.md:145). The operator README repeats the same contract at [README.md](/home/ulyy/app/unionclinRag/unionclinHub/scripts/youlin/docker/README.md:23), and the gap register records 75 without treating them as completed specifications at [13-m0-m2-delivery-gap-register.md](/home/ulyy/app/unionclinRag/unionclinHub/docs/youlin-enterprise-ai-platform/plan/13-m0-m2-delivery-gap-register.md:5).

No review blockers remain for this batch.

Pre-deploy confirmations remain separate:

- Confirm the workflow exists on the default branch and branch protection/rulesets are active.
- Define `YOULIN_SYNTHETIC_CI` at repository scope and exclude unintended inherited enablement.
- Restrict the ephemeral runner group to this repository and bind its prepared checkout, dependencies, and pinned images to the dispatched SHA.
- Remove ignored credential files from mounted source and archive private evidence on failure or cancellation.
- Freeze the r4 manifest after this review and complete the planned document-link/hash checks.

Broader delivery remains incomplete as documented: remote GitHub Actions execution, full application deployment, actual local product UAT, and the trusted provider-cleanup adapter are not complete. Those are expected rollout gaps, not newly found defects in this patch.

This was read-only static review. I did not execute tests, validators, services, provider cleanup, remote CI, or UAT.