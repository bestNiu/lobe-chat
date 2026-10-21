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
ok()  { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); }
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
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' "$MARKET/api/v1/skills/$SID/download")
case "$LOC" in *github.com*archive*) ok "skill download 302 -> GitHub ($(echo "$LOC" | cut -c1-52)...)";; *) bad "skill download 302 (got ${LOC:-none})";; esac

echo "== 12. app-side tRPC reaches the proxy =="
if [ -n "${COOKIE:-}" ]; then
  check "app tRPC agent list" "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: $COOKIE" \
    "$APP/trpc/lambda/market.getAssistantList?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22page%22%3A1%2C%22pageSize%22%3A1%7D%7D%7D")" 200
else
  echo "  SKIP  app tRPC (set COOKIE=... to enable)"
fi

echo "== 13. install writes land in the app database =="
INSTALLED=$(pg "select count(*) from user_installed_plugins;")
SKILLS=$(pg "select count(*) from agent_skills;")
FORKED=$(pg "select count(*) from agents where market_identifier is not null;")
echo "  rows: installed_plugins=$INSTALLED agent_skills=$SKILLS forked_agents=$FORKED"
[ "${INSTALLED:-0}" -gt 0 ] && ok "MCP installed through the app" || bad "MCP installed through the app"
[ "${SKILLS:-0}" -gt 0 ] && ok "Skill installed through the app" || bad "Skill installed through the app"
[ "${FORKED:-0}" -gt 0 ] && ok "Agent forked through the app" || bad "Agent forked through the app"

echo "== 14. app code untouched =="
DIFF=$(cd "$(dirname "$0")/../../.." && git status --porcelain src apps/server packages 2>/dev/null | grep -v '^??' | wc -l | tr -d ' ')
check "no app-side code changes" "$DIFF" 0

echo
echo "RESULT: ${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ] || exit 1