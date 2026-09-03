#!/usr/bin/env bash
# Deploy the engine to STAGING and smoke-test it, before promoting to prod.
set -euo pipefail
cd "$(dirname "$0")"

echo "→ Deploying to rollout-engine-staging ..."
fly deploy -c fly.staging.toml

echo "→ Smoke test (/health) ..."
code=$(curl -s -o /dev/null -w "%{http_code}" -m 120 https://rollout-engine-staging.fly.dev/health || echo "000")
echo "  /health -> $code (expect 200)"
[ "$code" = "200" ] || { echo "STAGING UNHEALTHY — do NOT promote."; exit 1; }

echo "→ Recent staging logs:"
fly logs -a rollout-engine-staging --no-tail 2>/dev/null | tail -15 || true
echo "✅ Staging healthy. Promote with:  fly deploy -c fly.toml"
