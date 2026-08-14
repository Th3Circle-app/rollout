-- 006: webhook event-ordering high-water mark.
-- Stripe delivers webhooks at-least-once and can REORDER / REDELIVER events.
-- Without a per-row high-water mark, a stale `customer.subscription.updated`
-- (status=active) redelivered AFTER a `customer.subscription.deleted` re-grants
-- a cancelled paid plan (a free Studio plan). The webhook records the source
-- event's `created` timestamp here and refuses to apply an older event.
-- Additive + idempotent: the currently-deployed webhook does not read this
-- column, so applying this ahead of the new function is safe.
alter table public.rollout_artists
  add column if not exists stripe_event_ts bigint;
