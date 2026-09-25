# Docker test runtime

Default for Youlin work: test services **and test processes** run in Docker. Host Node coordinates Docker and archives evidence only. Native platform exceptions need a recorded reason; missing container configuration is not one.

## Image preparation (network allowed, no source/Secrets mounted)

```bash
docker pull node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3
docker pull postgres:15-alpine@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b
docker build --pull=false -t youlin-test-tools:node22-r2 scripts/youlin/docker
docker image inspect youlin-test-tools:node22-r2 --format '{{.Id}}'
```

`images.json` pins the validated local tools image ID and PostgreSQL digest. A rebuild can differ because Debian packages are not snapshot-locked. Review the actual image/package versions, explicitly update the ID and reverify; the runner never silently resolves a mutable tag or pulls an image. The tools image is local, not published. Existing workspace dependencies are mounted, not installed by this image; this is not yet a fully reproducible CI dependency build.

Requires a non-root Linux x64 coordinator, local Docker Unix socket, installed workspace dependencies, and the existing isolated Bun toolchain. Five environment probes currently require cgroup v2. There is no host test fallback.

## Run (network disabled)

```bash
# Dedicated two-container PostgreSQL + Node/Vitest environment
node scripts/youlin/nodePostgres.smoke.mjs
# Entire identity suite, two serial complementary shards (unchanged 45s per-run limit)
node scripts/youlin/nodePostgres.smoke.mjs --identity --identity-shard=1/2
node scripts/youlin/nodePostgres.smoke.mjs --identity --identity-shard=2/2
# Both must pass at the same source revision; one shard is NOT a full-suite result.
# Original 20 SQL cases, now with assertions inside Docker
node scripts/youlin/nodePostgres.smoke.mjs --sql
# Real IdP protocol lab, not product/native acceptance
node scripts/youlin/identity.smoke.mjs

# General in-container command (arguments after -- are not shell-expanded inside Docker)
node scripts/youlin/dockerNode.mjs -- node --test /workspace/scripts/youlin/dockerRuntime.smoke.mjs
node scripts/youlin/dockerNode.mjs -- node --test /workspace/scripts/youlin/processHarness.smoke.mjs
node scripts/youlin/dockerNode.mjs -- node --experimental-strip-types --test /workspace/scripts/youlin/revocationGate.smoke.mjs

# Native check entry, explicit files only; defaults to lint + related tests
node scripts/youlin/dockerNode.mjs --check --lint scripts/youlin/dockerRuntime.mjs
node scripts/youlin/dockerNode.mjs --check --test packages/database/src/experimental/youlinSecurity/__tests__/reader.test.ts packages/database/src/experimental/youlinSecurity/__tests__/ownedReader.test.ts

# Root Vitest server project; avoid starting the unrelated app optimizer
node scripts/youlin/dockerNode.mjs -- node /workspace/node_modules/vitest/vitest.mjs run --project=server --pool=threads --maxWorkers=1 apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.test.ts

# Optional working directory or masked docs mount
node scripts/youlin/dockerNode.mjs --cwd=packages/database -- node --version
node scripts/youlin/dockerNode.mjs --docs -- python3 docs/youlin-enterprise-ai-platform/plan/validate_docs.py
```

Commands use 2 GiB / 2 CPU / 128 PID; explicit-file checks use 4 GiB. Vitest uses one worker. The observer stops a command after 90 seconds and the database test runner after 45 seconds; Docker control/cleanup and host failure are outside a hard wall-clock guarantee.

Containers run non-root, without networking, published ports, capabilities or Docker socket. Source is selectively mounted read-only. Host Git metadata, root `.env` and private originals are absent (docs mode masks `know`). This is not a universal Secret sandbox for arbitrary nested source files. Tool HOME/XDG and caches are disposable tmpfs.

`--check` creates empty temporary Git metadata solely for entrypoint checkout validation. It requires explicit files and does not verify real branch history, diffs or Git-based new-file advisories. Lint targets alone receive write mounts; full autofix diffs are copied into logs before cleanup. Root formatting/suppression configs are retained. Whole-project types must use the existing `rootTypecheck.mjs`, which retains the full source scope; do not use a selective mount to claim whole-repo types passed.

Both database and runner share only an 8 MiB RAM socket volume. Read-only mounting a socket does not prevent SQL writes: database roles/transactions govern those. Trust authentication is synthetic-only. Normal, failure, timeout and signal paths remove only owned containers/volumes. SIGKILL/daemon/host failure can leave resources: use printed UUID names, never global prune. Images remain cached deliberately.

`revocationPostgres.smoke.mjs` now uses the in-container `socketPostgresHarness.mjs`; all 20 SQL assertions run in Docker with the image's PostgreSQL client. Invoke it through `nodePostgres.smoke.mjs --sql`, never directly on the host. No Docker socket is mounted into test workers.

## GitHub Actions opt-in workflow

CI is **GitHub Actions**, not GitLab. The mistaken GitLab template has been removed; immutable historical evidence still records that earlier assumption.

[`.github/workflows/youlin-verify.yml`](../../../.github/workflows/youlin-verify.yml) runs selected engineering checks only. It requires manual dispatch, `YOULIN_SYNTHETIC_CI=true`, a protected default branch, and the `youlin-synthetic-ci` environment. Configure environment reviewers and branch restrictions before enabling the variable. There is no push/PR/fork trigger, deployment, automatic external artifact upload or production Secret access.

Use a dedicated **ephemeral**, non-root Linux x64 runner labelled `youlin-synthetic-docker`, with its own local Docker daemon and cgroup v2. Never register this shared development host or a production host as that runner. The runner controller/job-start hook must prepare the exact dispatched commit in `GITHUB_WORKSPACE`, reviewed workspace and isolated-toolchain dependencies, and the pinned cached images **before** the job. Dependency preparation is container-only and outside the verification job; no host install fallback. The workflow deliberately has no checkout/cache action that would silently erase or replace the prepared dependency snapshot. It verifies HEAD, clean tracked/untracked source, dependency directories and absence of root `.env`, then fails closed if the preparation contract is missing. A generic empty self-hosted runner is insufficient.

This prepared-workspace contract is not a cold reproducible build: dependency snapshot provenance, lifecycle builds and the root lockfile strategy still need completion. The workflow must first exist on the default branch; this feature-branch file does not mean it is enabled or remotely passing. Job concurrency is one, cancellation does not automatically supersede an earlier job, and the job has a 20-minute cap. Workload CPU/memory caps and individual timeouts remain unchanged.

Raw synthetic logs stay in the private `.youlin-ci-evidence/<run>-<attempt>/` directory. The external runner controller must archive them with hashes before destroying the disposable VM, including failure/cancellation paths; it must never globally prune resources. The final summary step is best-effort, not a cleanup guarantee. No fixed corporate retention policy is invented here. Full repository lint/types/build, complete deployment and local Docker UAT are separate gates.

The [Keycloak lab](../identity/README.md) shares a labelled `network=none` container namespace for loopback HTTP only. Generic command containers retain their own `network=none` namespace.

策略分层（哪些必须在容器、哪些可宿主原生、双循环与加速口径）见 `docs/youlin-enterprise-ai-platform/plan/17-test-and-verification-strategy.md`；本文只是容器运行时的操作说明。
