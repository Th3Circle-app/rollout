-- Per-release completion flags the artist toggles from each tool page. They
-- drive the "Ready" state on the release-kit dashboard, alongside the existing
-- lyric_video_done and page_published. Applied via MCP as add_promo_plan_done_flags.
alter table public.rollout_releases
  add column if not exists promo_done boolean not null default false,
  add column if not exists plan_done boolean not null default false;
