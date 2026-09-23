# Docker test runtime

Default for Youlin work: test services **and test processes** run in Docker. Host Node coordinates Docker and archives evidence only. Native platform exceptions need a recorded reason; missing container configuration is not one.

## Image preparation (network allowed, no source/Secrets mounted)

```bash
docker pull node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3
docker pull postgres:15-alpine@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b
docker build --pull=false -t youlin-test-tools:node22-r1 scripts/youlin/docker
docker image inspect youlin-test-tools:node22-r1 --format '{{.Id}}'
```

`images.json` pins the validated local tools image ID and PostgreSQL digest. A rebuild can differ because Debian packages are not snapshot-locked. Review the actual image/package versions, explicitly update the ID and reverify; the runner never silently resolves a mutable tag or pulls an image. The tools image is local, not published. Existing workspace dependencies are mounted, not installed by this image; this is not yet a fully reproducible CI dependency build.

Requires a non-root Linux x64 coordinator, local Docker Unix socket, installed workspace dependencies, and the existing isolated Bun toolchain. Five environment probes currently require cgroup v2. There is no host test fallback.

## Run (network disabled)

```bash
# Dedicated two-container PostgreSQL + Node/Vitest environment
node scripts/youlin/nodePostgres.smoke.mjs

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

The old `revocationPostgres.smoke.mjs` still mixes host assertions and Docker control. Its historical 20 cases have not been rerun in this migration; do not run it on the host under the new policy. Port its transport/orchestration next without mounting the Docker socket into test workers.
