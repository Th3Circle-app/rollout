-- ROLLOUT: additive-only schema on the Th3Circle Supabase project.
-- Applied 2026-07-27 via MCP (migration: rollout_001_schema).
-- New rollout_* tables only; ZERO changes to existing tables/policies/auth.

-- ── artists (one row per auth user who uses Rollout) ─────────────────────
create table if not exists public.rollout_artists (
  id uuid primary key references auth.users(id) on delete cascade,
  artist_name text default '',
  email text default '',
  plan text not null default 'free' check (plan in ('free','pro')),
  stripe_customer_id text,
  songs_used int not null default 0,
  used_songs text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rollout_artists enable row level security;

create policy "rollout_artists_select_own" on public.rollout_artists
  for select using (id = auth.uid());
create policy "rollout_artists_insert_own" on public.rollout_artists
  for insert with check (id = auth.uid());
create policy "rollout_artists_update_own" on public.rollout_artists
  for update using (id = auth.uid()) with check (id = auth.uid());

-- protect billing identity from self-tampering (plan stays client-writable
-- ONLY until Stripe lands; then it moves into this trigger too)
create or replace function public.rollout_protect_privileged()
returns trigger language plpgsql security definer as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    if new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.songs_used is distinct from old.songs_used
       or new.used_songs is distinct from old.used_songs then
      raise exception 'privileged columns are managed by the platform';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_rollout_protect_privileged
  before update on public.rollout_artists
  for each row execute function public.rollout_protect_privileged();

-- ── releases (the artist's work) ─────────────────────────────────────────
create table if not exists public.rollout_releases (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.rollout_artists(id) on delete cascade,
  title text not null default '',
  artist_name text default '',
  filename text default '',
  file_id text default '',
  key_sig text default '', bpm int default 0,
  duration text default '', duration_sec numeric default 0,
  moods text[] not null default '{}',
  keywords text[] not null default '{}',
  genre text default '',
  lyrics text default '',
  cover_url text default '',
  style text default 'auto',
  seeds int[] not null default '{}',
  release_date date,
  streaming_link text default '',
  distributor text default '',
  submitted_at timestamptz,
  scheduled boolean not null default false,
  slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rollout_releases_artist_idx
  on public.rollout_releases (artist_id, updated_at desc);
alter table public.rollout_releases enable row level security;

create policy "rollout_releases_all_own" on public.rollout_releases
  for all using (artist_id = auth.uid()) with check (artist_id = auth.uid());

create or replace function public.rollout_touch_updated()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger trg_rollout_releases_touch
  before update on public.rollout_releases
  for each row execute function public.rollout_touch_updated();

-- ── fan pages (/r/{slug} — public read when published) ───────────────────
create table if not exists public.rollout_fan_pages (
  slug text primary key,
  release_id uuid not null references public.rollout_releases(id) on delete cascade,
  artist_id uuid not null references public.rollout_artists(id) on delete cascade,
  html text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rollout_fan_pages enable row level security;

create policy "rollout_fan_pages_owner_all" on public.rollout_fan_pages
  for all using (artist_id = auth.uid()) with check (artist_id = auth.uid());
create policy "rollout_fan_pages_public_read" on public.rollout_fan_pages
  for select using (published = true);

create trigger trg_rollout_fan_pages_touch
  before update on public.rollout_fan_pages
  for each row execute function public.rollout_touch_updated();

-- ── server-side free-tier metering (client cannot cheat) ─────────────────
create or replace function public.rollout_consume_song_slot(fname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.rollout_artists;
begin
  select * into a from public.rollout_artists where id = auth.uid() for update;
  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  if fname = any(a.used_songs) then
    return jsonb_build_object('ok', true, 'used', a.songs_used, 'repeat', true);
  end if;
  if a.plan <> 'pro' and a.songs_used >= 1 then
    return jsonb_build_object('ok', false, 'reason', 'limit', 'used', a.songs_used);
  end if;
  update public.rollout_artists
    set songs_used = songs_used + 1,
        used_songs = array_append(used_songs, fname)
    where id = a.id;
  return jsonb_build_object('ok', true, 'used', a.songs_used + 1);
end $$;
revoke all on function public.rollout_consume_song_slot(text) from anon;
grant execute on function public.rollout_consume_song_slot(text) to authenticated;

-- ── storage: private per-artist bucket ───────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('rollout', 'rollout', false)
  on conflict (id) do nothing;

create policy "rollout_storage_own_read" on storage.objects
  for select using (bucket_id = 'rollout' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rollout_storage_own_write" on storage.objects
  for insert with check (bucket_id = 'rollout' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rollout_storage_own_update" on storage.objects
  for update using (bucket_id = 'rollout' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rollout_storage_own_delete" on storage.objects
  for delete using (bucket_id = 'rollout' and (storage.foldername(name))[1] = auth.uid()::text);
