#!/usr/bin/env bash
# Rollout red-team loop — ONE command that runs every leg and prints a verdict.
#
#   tools/redteam/run.sh            # full run
#   tools/redteam/run.sh --changed  # diff-scoped: only report the changed surface
#
# Legs:
#   1. Typecheck + build (also produces a local-mode dist the visual check uses)
#   2. Design graders  — studio contract (premium) + marketing surface (landing)
#   3. Webhook ordering — Node test of the Stripe event-ordering logic (no deno)
#   4. Backend adversarial — SSRF / injection / traversal / body-cap / concurrency
#                            + coverage tally (needs the engine on :8000)
#   5. Visual render — flat-frame / white-out detector (needs a served build)
#
# Exit code is nonzero if any hard leg fails. Environmental skips (engine down)
# are reported as SKIP, not failure.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
ROOT="$(pwd)"
SB="src/lib/supabase.ts"
SB_BAK="$(mktemp)"
PORT=4310
STATIC_PID=""
CHANGED=0
[ "${1:-}" = "--changed" ] && CHANGED=1

# ---- always restore the real Supabase keys + tear down the static server ----
cleanup() {
  [ -f "$SB_BAK" ] && cp "$SB_BAK" "$SB" 2>/dev/null && rm -f "$SB_BAK"
  [ -n "$STATIC_PID" ] && kill "$STATIC_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

PASS=0; FAIL=0; SKIP=0
declare -a SUMMARY
leg() { # leg "name" "0|1|2 (pass|fail|skip)" "detail"
  case "$2" in
    0) SUMMARY+=("  PASS  $1  ${3:-}"); PASS=$((PASS+1));;
    2) SUMMARY+=("  SKIP  $1  ${3:-}"); SKIP=$((SKIP+1));;
    *) SUMMARY+=("  FAIL  $1  ${3:-}"); FAIL=$((FAIL+1));;
  esac
}

echo "== Rollout red-team loop =="
# ---- diff-scoped surface report ------------------------------------------------
BASE="$(git merge-base HEAD main 2>/dev/null || echo HEAD~1)"
echo "-- changed surface (vs $BASE):"
git diff --name-only "$BASE" 2>/dev/null | sed 's/^/     /' || echo "     (no git diff)"
if [ "$CHANGED" = 1 ]; then
  echo "-- --changed: surface report only, skipping the run."
  exit 0
fi

# ---- 1. typecheck + LOCAL-MODE build (build gate + dist for the visual leg) ----
echo "-- [1/5] typecheck + build (local mode)"
cp "$SB" "$SB_BAK"
node -e '
const fs=require("fs");let s=fs.readFileSync(process.argv[1],"utf8");
s=s.replace(/export const SUPABASE_URL = "[^"]*";/,"export const SUPABASE_URL = \"\";");
s=s.replace(/export const SUPABASE_ANON_KEY = "[^"]*";.*/,"export const SUPABASE_ANON_KEY = \"\";");
fs.writeFileSync(process.argv[1],s);' "$SB"
if npm run build >/tmp/rt_build.log 2>&1; then leg "build+typecheck" 0; else leg "build+typecheck" 1 "see /tmp/rt_build.log"; fi
cp "$SB_BAK" "$SB"   # restore real keys immediately after the build reads them
grep -q "nnbofygbioxgujzxwznj" "$SB" && echo "     keys restored" || echo "     WARN keys not restored"

# ---- 2. design graders ---------------------------------------------------------
echo "-- [2/5] design graders"
if npm run premium >/tmp/rt_premium.log 2>&1; then leg "design:studio (premium)" 0; else leg "design:studio (premium)" 1 "see /tmp/rt_premium.log"; fi
if npm run landing >/tmp/rt_landing.log 2>&1; then leg "design:marketing (landing)" 0; else leg "design:marketing (landing)" 1 "see /tmp/rt_landing.log"; fi

# ---- verified-feature tripwire (don't let verified work get removed) ------------
echo "-- verified-feature tripwire"
if node tools/redteam/verified.mjs >/tmp/rt_verified.log 2>&1; then leg "verified tripwire" 0; else leg "verified tripwire" 1 "a verified feature was removed — see /tmp/rt_verified.log"; fi

# ---- 3. webhook ordering (Node) ------------------------------------------------
echo "-- [3/5] webhook ordering test"
if [ -f tools/redteam/webhook_test.mjs ]; then
  if node tools/redteam/webhook_test.mjs >/tmp/rt_webhook.log 2>&1; then leg "webhook ordering" 0; else leg "webhook ordering" 1 "see /tmp/rt_webhook.log"; fi
else leg "webhook ordering" 2 "webhook_test.mjs missing"; fi

# ---- 4. backend adversarial (needs engine on :8000) ----------------------------
echo "-- [4/5] backend adversarial + concurrency + coverage"
if curl -sf -o /dev/null "http://127.0.0.1:8000/health" 2>/dev/null; then
  PY="$HOME/ear-env/bin/python"; [ -x "$PY" ] || PY="python3"
  if "$PY" tools/redteam/adversarial.py >/tmp/rt_adv.log 2>&1; then leg "backend adversarial" 0 "$(grep -iE 'covered|GREEN|RED|WARN' /tmp/rt_adv.log | tail -1)"; else leg "backend adversarial" 1 "see /tmp/rt_adv.log"; fi
else leg "backend adversarial" 2 "engine :8000 down — start it to run this leg"; fi

# ---- 5. visual render / white-out ----------------------------------------------
echo "-- [5/5] visual render check"
if [ -f tools/redteam/visual.py ] && [ -d dist ]; then
  ( cd dist && python3 -m http.server "$PORT" >/tmp/rt_static.log 2>&1 & echo $! > /tmp/rt_static.pid )
  STATIC_PID="$(cat /tmp/rt_static.pid 2>/dev/null)"; sleep 2
  VPY="$HOME/scrapling-env/bin/python"; [ -x "$VPY" ] || VPY="python3"
  # if the cloud dev server is up, ALSO check the real marketing landing (the
  # surface that whited out) in a fresh no-session context on :5173
  LANDING=""; curl -sf -o /dev/null "http://localhost:5173/" 2>/dev/null && LANDING="--landing=http://localhost:5173"
  if "$VPY" tools/redteam/visual.py "http://localhost:$PORT" $LANDING >/tmp/rt_visual.log 2>&1; then leg "visual render" 0; else leg "visual render" 1 "see /tmp/rt_visual.log"; fi
  kill "$STATIC_PID" 2>/dev/null; STATIC_PID=""
else leg "visual render" 2 "visual.py or dist/ missing"; fi

# ---- verdict -------------------------------------------------------------------
echo ""
echo "== verdict =="
for line in "${SUMMARY[@]}"; do echo "$line"; done
echo "   ${PASS} pass · ${FAIL} fail · ${SKIP} skip"
[ "$FAIL" -eq 0 ] && { echo "== GREEN =="; exit 0; } || { echo "== RED =="; exit 1; }
