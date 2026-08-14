# Rollout — Deploy Checklist

Everything is red-teamed and green (see [REDTEAM.md](./REDTEAM.md)). Deploy is
gated only on Stripe account clearance. Do these in order.

## 1. Supabase (DB + edge function)
- [ ] Apply migrations in order if not already applied: `004`, `005`, **`006`**
      (`006_webhook_event_ordering.sql` adds `stripe_event_ts` — apply BEFORE
      redeploying the webhook; it's additive/idempotent so it's safe early).
- [ ] Redeploy the `stripe-webhook` edge function (it was rewritten:
      atomic compare-and-set ordering guard, checkout binds-only, uid-only bind).
- [ ] Edge function secrets: `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`,
      `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Confirm the 4 Stripe price IDs in `PRICE_TIER` (top of the webhook) match
      the live prices. An unmapped active price now logs a warning + retries
      (won't silently leave a payer on free) — but the map should still be right.

## 2. Backend engine (Fly.io — Dockerfile)
- [ ] `backend/fly.toml` is ready (scale-to-zero, 4GB for the CLAP model,
      persistent `/root/.cache` model volume). First deploy:
      `cd backend && fly volumes create rollout_models --size 5 -r sjc && fly deploy`.
      After that, `fly deploy` alone. Grab the URL (`https://rollout-engine.fly.dev`).
- [ ] Optional secret: `fly secrets set PEXELS_KEY=...` (b-roll). Provider image
      keys are BYO per-creator.
- [ ] OPEN (tracked): the engine is currently unauthenticated + CORS `*`. Add
      Supabase-JWT verification before exposing it broadly (see REDTEAM.md).

## 3. Frontend (Netlify)
- [ ] `netlify.toml` is committed (build `npm run build`, publish `dist`).
- [ ] Env: `VITE_API_BASE` = the backend URL, `VITE_PUBLIC_BASE` = the public
      site URL (used for `/r/<slug>` fan-page links).
- [ ] `src/lib/supabase.ts` holds the real anon key (public by design, RLS-guarded).

## 4. Stripe
- [ ] Point the webhook endpoint at the deployed edge function URL.
- [ ] Payment links: `client_reference_id` is set by the in-app upgrade button
      (the supported path). Raw payment links opened outside the app can't be
      attributed and will dead-letter — that's intended.

## 5. Smoke test after deploy
- [ ] `/health` on the backend returns `{"ok":true}`.
- [ ] Sign in → import a song → cover → (paid) checkout in test mode → confirm
      the webhook flips `plan` within a few seconds.
