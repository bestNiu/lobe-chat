#!/usr/bin/env bash
# Local-test browser harness: runs a driver from scripts/youlin/identity inside the pinned Playwright
# image against the persistent loopback instance. The host only coordinates Docker; credentials stay
# in the private instance directory and are mounted read-only, never passed as arguments.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: runLocalBrowser.sh <driver.mjs> <evidence-subdir> [extra env KEY=VALUE ...]" >&2
  exit 64
fi
driver="$1"
evidence_name="$2"
shift 2

instance_dir="${YOULIN_INSTANCE_DIR:-$HOME/.config/youlin/mvp/local-instance}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
evidence_dir="$instance_dir/browser-evidence/$evidence_name"
image="mcr.microsoft.com/playwright@sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7"
app_url="${YOULIN_APP_URL:-http://127.0.0.1:33210}"

mkdir -p "$evidence_dir"
chmod 700 "$evidence_dir"

exec docker run --rm \
  --name "youlin-browser-$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)" \
  --network host \
  --user "$(id -u):$(id -g)" \
  --cpus 2 --memory 1536m --memory-swap 1536m --pids-limit 256 \
  --mount "type=bind,src=$repo_root/node_modules,dst=/workspace/node_modules,readonly" \
  --mount "type=bind,src=$repo_root/scripts/youlin/identity,dst=/driver,readonly" \
  --mount "type=bind,src=$evidence_dir,dst=/evidence" \
  --mount "type=bind,src=$instance_dir/bootstrap/first-administrator.json,dst=/private/person.json,readonly" \
  --mount "type=bind,src=$instance_dir/bootstrap/first-administrator.password,dst=/private/password,readonly" \
  -e HOME=/tmp \
  -e YOULIN_APP_URL="$app_url" \
  -e YOULIN_EVIDENCE_DIR=/evidence \
  -e YOULIN_PERSON_FILE=/private/person.json \
  -e YOULIN_PASSWORD_FILE=/private/password \
  "$@" \
  --entrypoint node "$image" "/driver/$(basename "$driver")"
