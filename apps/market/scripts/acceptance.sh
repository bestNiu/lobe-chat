#!/usr/bin/env bash
# Phase-1 acceptance: proves every claim end-to-end against the running stack.
#
# Usage:
#   COOKIE='better-auth.session_token=...' bash scripts/acceptance.sh | tee evidence/phase1-acceptance.log
#
# The cookie is the LobeHub session used for app-side (tRPC) checks; the market
# proxy itself is exercised with a trusted-client token minted here.
set -uo pipefail

MARKET=http://127.0.0.1:33220
APP=http://localhost:33210
ENV_FILE=${YOULIN_ENV_FILE:-$HOME/.config/youlin/v2/.env}
pg() { docker exec youlin-v2-postgresql-1 psql -U postgres -d lobehub -t -c "$1" | tr -d ' \n'; }

pass=0
fail=0
ok() {
  printf '  PASS  %s\n' "$1"
  pass=$((pass + 1))
}
bad() {
  printf '  FAIL  %s\n' "$1"
  fail=$((fail + 1))
}
check() { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (want $3, got $2)"; fi; }

jget() { python3 -c "import json,sys;d=json.load(sys.stdin);
p='$1'.split('.');v=d
for k in p:
    v = v[int(k)] if k.isdigit() and isinstance(v,list) else v.get(k) if isinstance(v,dict) else None
    if v is None: break
print(v if v is not None else '')"; }

echo "== 0. mint trusted-client token =="
CID=$(grep "^MARKET_TRUSTED_CLIENT_ID=" "$ENV_FILE" | cut -d"'" -f2)
SECRET=$(grep "^MARKET_TRUSTED_CLIENT_SECRET=" "$ENV_FILE" | cut -d"'" -f2)
echo "  clientId=$CID  secretLen=${#SECRET}"
check "secret is 83 chars" "${#SECRET}" 83

TOKEN=$(cd "$(dirname "$0")/.." && node -e "
const { createTrustedClientToken } = require('@lobehub/market-sdk');
process.stdout.write(createTrustedClientToken(
  { clientId: '$CID', email: 'acceptance@test.local', nonce: 'acc', timestamp: Date.now(), userId: 'user_acceptance' },
  '$SECRET'));
" 2>/dev/null)
[ -n "$TOKEN" ] && ok "trusted token minted" || bad "trusted token minted"

M() { curl -s -m 60 -H "Authorization: Bearer $TOKEN" "$@"; }

echo "== 1-3. proxy liveness and auth =="
check "health unauthenticated" "$(curl -s -o /dev/null -w '%{http_code}' "$MARKET/health")" 200
check "no token rejected" "$(curl -s -o /dev/null -w '%{http_code}' "$MARKET/api/v1/agents?pageSize=1")" 401
check "agent list with token" "$(M -o /dev/null -w '%{http_code}' "$MARKET/api/v1/agents?pageSize=1")" 200

echo "== 4-5. agent detail (SDK path) + fork =="
AID=$(M "$MARKET/api/v1/agents?pageSize=1" | jget 'items.0.identifier')
echo "  agent=$AID"
CFG=$(M "$MARKET/api/v1/agents/detail/$AID" | jget 'config.systemRole' | head -c 20)
[ -n "$CFG" ] && ok "agent detail carries config (${#CFG}+ chars)" || bad "agent detail carries config"
check "agent fork" "$(M -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -d '{"identifier":"acc_fork_probe"}' "$MARKET/api/v1/agents/$AID/fork")" 200

echo "== 6-8. MCP list / detail / manifest =="
PID=$(M "$MARKET/api/v1/plugins?pageSize=1" | jget 'items.0.identifier')
echo "  plugin=$PID"
[ -n "$(M "$MARKET/api/v1/plugins/$PID" | jget 'manifestUrl')" ] && ok "mcp detail has manifestUrl" || bad "mcp detail has manifestUrl"
DOPT=$(M "$MARKET/api/v1/plugins/$PID/manifest" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('deploymentOptions') or []))")
[ "${DOPT:-0}" -gt 0 ] && ok "mcp manifest has deploymentOptions ($DOPT)" || bad "mcp manifest has deploymentOptions"

echo "== 9-11. Skill list / detail content / download =="
SID=$(M "$MARKET/api/v1/skills?pageSize=1" | jget 'items.0.identifier')
echo "  skill=$SID"
SLEN=$(M "$MARKET/api/v1/skills/$SID" | python3 -c "import json,sys;print(len(str(json.load(sys.stdin).get('content') or '')))")
[ "${SLEN:-0}" -gt 100 ] && ok "skill detail content ($SLEN chars)" || bad "skill detail content ($SLEN chars)"
DL_CODE=$(curl -s -o /tmp/acc-dl.bin -w '%{http_code}' "$MARKET/api/v1/skills/$SID/download")
DL_TYPE=$(file -b --mime-type /tmp/acc-dl.bin 2>/dev/null || echo unknown)
if [ "$DL_CODE" = "302" ]; then
  ok "skill download redirects to GitHub (repo-root layout)"
elif [ "$DL_CODE" = "200" ] && { [ "$DL_TYPE" = "application/zip" ] || [ "$DL_TYPE" = "application/octet-stream" ]; }; then
  # Sub-directory skills are re-packaged with SKILL.md at the zip root.
  if python3 -c "import zipfile,sys; sys.exit(0 if 'SKILL.md' in zipfile.ZipFile('/tmp/acc-dl.bin').namelist() else 1)" 2>/dev/null; then
    ok "skill download returns zip with root SKILL.md (subdir layout)"
  else
    bad "skill download zip lacks root SKILL.md"
  fi
else
  bad "skill download (code=$DL_CODE type=$DL_TYPE)"
fi

echo "== 12. app-side tRPC reaches the proxy =="
if [ -n "${COOKIE:-}" ]; then
  check "app tRPC agent list" "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: $COOKIE" \
    "$APP/trpc/lambda/market.getAssistantList?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22page%22%3A1%2C%22pageSize%22%3A1%7D%7D%7D")" 200
else
  echo "  SKIP  app tRPC (set COOKIE=... to enable)"
fi

echo "== 13. real installs through the app (not row counts) =="
if [ -z "${COOKIE:-}" ]; then
  echo "  SKIP  installs need COOKIE=..."
else
  TRPC="$APP/trpc/lambda"
  POST() { curl -s -m 240 -X POST -H "Cookie: $COOKIE" -H 'content-type: application/json' -d "$2" "$TRPC/$1?batch=1"; }

  # 13a. Skill with a sub-directory layout — the case that used to 502 because
  # the proxy redirected to the repo root instead of re-packaging the subdir.
  SUBDIR_SKILL=shipstatic-plugin-publish-online
  rm_skill=$(
    pg "delete from agent_skills where identifier='$SUBDIR_SKILL';"
    echo ok
  )
  R=$(POST agentSkills.importFromMarket "{\"0\":{\"json\":{\"identifier\":\"$SUBDIR_SKILL\"}}}")
  SROW=$(pg "select coalesce(length(content),0)||'|'||name from agent_skills where identifier='$SUBDIR_SKILL';")
  echo "  subdir skill row: $SROW"
  case "$SROW" in
  0\|* | "") bad "subdir skill installed ($SUBDIR_SKILL)" ;;
  *) ok "subdir skill installed (${SROW})" ;;
  esac

  # 13b. MCP with an http/cloud deployment option.
  mid=$(M "$MARKET/api/v1/plugins?pageSize=50" | python3 -c "import json,sys;d=json.load(sys.stdin);print(next((i['identifier'] for i in d['items'] if i.get('connectionType') in ('remote','hybrid')), d['items'][0]['identifier']))")
  mf=$(M "$MARKET/api/v1/plugins/$mid/manifest")
  pg "delete from user_installed_plugins where identifier='$mid';" >/dev/null
  POST plugin.createOrInstallPlugin "$(python3 -c "
import json,sys
mf=json.loads(sys.argv[1])
print(json.dumps({'0':{'json':{'identifier':sys.argv[2],'manifest':mf,'type':'plugin'}}}))" "$mf" "$mid")" >/dev/null
  MROW=$(pg "select count(*) from user_installed_plugins where identifier='$mid';")
  # NOTE: backend milestone only. The Web build renders ConnectionTypeAlert in
  # the MCP detail sidebar (Install control is gated by `isDesktop`, which is
  # the build-time `__ELECTRON__` constant), so no user-facing install button
  # exists. This proves the proxy+plugin pipeline, not the UI path.
  [ "${MROW:-0}" -gt 0 ] && ok "MCP install pipeline (backend-only, no Web UI entry) ($mid)" || bad "MCP install pipeline ($mid)"

  # 13c. Agent forked through the app: market fork + createAgent, as ForkAndChat does.
  aid_probe=$(M "$MARKET/api/v1/agents?pageSize=1" | jget 'items.0.identifier')
  FORK_ID="acc_agent_$(date +%s)"
  M -o /dev/null -X POST -H 'content-type: application/json' -d "{\"identifier\":\"$FORK_ID\"}" "$MARKET/api/v1/agents/$aid_probe/fork"
  pg "delete from agents where market_identifier='$FORK_ID';" >/dev/null
  CFG="{\"marketIdentifier\":\"$FORK_ID\",\"params\":{\"forkedFromIdentifier\":\"$aid_probe\"},\"systemRole\":\"acceptance fork body\",\"title\":\"Acceptance Fork\"}"
  POST agent.createAgent "{\"0\":{\"json\":{\"config\":$CFG}}}" >/dev/null
  AROW=$(pg "select count(*) from agents where market_identifier='$FORK_ID';")
  [ "${AROW:-0}" -gt 0 ] && ok "agent forked through the app ($FORK_ID)" || bad "agent forked through the app"

  # Clean up so repeated runs stay meaningful.
  pg "delete from agent_skills where identifier='$SUBDIR_SKILL'; delete from user_installed_plugins where identifier='$mid'; delete from agents where market_identifier='$FORK_ID';" >/dev/null
fi

echo "== 13d. MCP Web install entry (expected: absent) =="
if [ -n "${COOKIE:-}" ]; then
  MCP_SLUG=$(curl -s -H "Cookie: $COOKIE" \
    "$APP/trpc/lambda/market.getMcpList?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22page%22%3A1%2C%22pageSize%22%3A1%7D%7D%7D" \
    | jget '0.result.data.json.items.0.identifier')
  if [ -n "$MCP_SLUG" ]; then
    # The SSR HTML for the detail page contains no install control.
    if curl -s -H "Cookie: $COOKIE" "$APP/community/mcp/$MCP_SLUG" | grep -qi "installMCPPlugin\|Install</button>"; then
      ok "MCP detail ships an install control"
    else
      echo "  KNOWN  MCP detail has no install control in the Web build (isDesktop gated) — see docs §7.3"
    fi
  fi
fi

echo "== 14. app code untouched =="
DIFF=$(cd "$(dirname "$0")/../../.." && git status --porcelain src apps/server packages 2>/dev/null | grep -v '^??' | wc -l | tr -d ' ')
check "no app-side code changes" "$DIFF" 0

echo
echo "RESULT: ${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ] || exit 1
