-- Per-release step-completion flags so the Dashboard "asset kit" chips flip
-- green when the artist actually finishes a step, not just when a precondition
-- exists. These round-trip through the store's release upsert/hydration.
--
--   lyric_video_done  -> set true when a lyric video renders + is kept
--   page_published    -> set true when the fan release page is published
alter table public.rollout_releases
  add column if not exists lyric_video_done boolean not null default false,
  add column if not exists page_published   boolean not null default false;
