# Rollout Engine — Ops Runbook

## Rollback (target: under 2 minutes)
Fly keeps every release. To revert the engine to the previous good version:

    fly releases -a rollout-engine             # list versions
    fly releases rollback -a rollout-engine    # roll back to the immediately previous release
    # or pin a specific image:
    fly deploy -a rollout-engine --image <registry.fly.io/rollout-engine@sha256:...>

Confirm after rollback:

    curl -s -o /dev/null -w "%{http_code}\n" https://rollout-engine.fly.dev/health   # expect 200

## Staging-first deploy (don't ship an untested change straight to prod)
Staging app: **rollout-engine-staging** (same config, scale-to-zero so idle ≈ $0).

    cd backend
    ./deploy-staging.sh          # build + deploy to staging, smoke-test /health
    fly logs -a rollout-engine-staging   # eyeball the new code / access logs
    # if good, promote the SAME code to prod:
    fly deploy -c fly.toml       # app = rollout-engine

## Observability
    fly logs -a rollout-engine
Each request logs: `METHOD /path -> STATUS <latency>ms via=<image-provider>`.
Watch: rising latency, 5xx rate, and which provider is serving (fallback health).

## Secrets (Fly secret manager — never hardcode)
    fly secrets list -a rollout-engine
Required: SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, CF_ACCOUNT_ID, CF_API_TOKEN, PEXELS_KEY.
Mirror the same set to rollout-engine-staging.
