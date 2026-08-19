-- Locked config table so server-side functions (service role only) can read
-- secrets like the Resend API key without a Supabase edge-function secret.
-- RLS is on with NO policies, so anon/authenticated can never read it; the
-- service_role bypasses RLS. Used as a fallback by the stripe-webhook function.
create table if not exists public.rollout_config (
  key text primary key,
  value text not null
);
alter table public.rollout_config enable row level security;
revoke all on public.rollout_config from anon, authenticated;
-- insert public.rollout_config ('resend_api_key', '<key>') is done out-of-band.

-- The stripe-webhook edge function (v7) now also handles
-- customer.subscription.trial_will_end → emails the user a trial-ending reminder
-- via Resend, and that event was added to the Stripe webhook endpoint. This file
-- documents the DB side of that change (the function is deployed via MCP/CLI).
