-- 004: fix the free-tier metering self-block introduced by 003.
--
-- 003 removed 002's transaction-local bypass from rollout_protect_privileged()
-- but rollout_consume_song_slot() still UPDATEs songs_used / used_songs. Because
-- the RPC runs as SECURITY DEFINER, inside it auth.uid() is still the caller and
-- the role is 'authenticated' (not 'service_role') — so the trigger's guard
-- fires and the RPC raises on its own write. Net: every free-tier consume
-- errored, the server gate never actually metered, and only the bypassable
-- localStorage gate was doing anything.
--
-- Fix: re-introduce the transaction-local bypass ('rollout.internal' = 'on') and
-- have the RPC opt into it for its own privileged write only. Clients still
-- cannot touch plan / billing / usage columns directly (each PostgREST request
-- is its own transaction, and no exposed RPC sets the flag except this one).

create or replace function public.rollout_protect_privileged()
returns trigger language plpgsql security definer as $$
begin
  -- allow the write when it is the metering RPC (transaction-local flag) or the
  -- Stripe webhook (service_role); otherwise clients cannot move these columns.
  if current_setting('rollout.internal', true) is distinct from 'on'
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and auth.uid() is not null then
    if new.plan is distinct from old.plan
       or new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.stripe_subscription_id is distinct from old.stripe_subscription_id
       or new.songs_used is distinct from old.songs_used
       or new.used_songs is distinct from old.used_songs then
      raise exception 'privileged columns are server-managed';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_rollout_protect_privileged on public.rollout_artists;
create trigger trg_rollout_protect_privileged
  before update on public.rollout_artists
  for each row execute function public.rollout_protect_privileged();

create or replace function public.rollout_consume_song_slot(fname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.rollout_artists;
begin
  select * into a from public.rollout_artists where id = auth.uid() for update;
  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  -- paid tiers never consume a slot
  if a.plan in ('artist','studio') then
    return jsonb_build_object('ok', true, 'plan', a.plan);
  end if;
  -- re-running the same song is free (idempotent — a failed analysis retry
  -- on the same file must not burn a second slot)
  if fname = any(a.used_songs) then
    return jsonb_build_object('ok', true, 'plan', a.plan, 'used', a.songs_used, 'repeat', true);
  end if;
  if coalesce(array_length(a.used_songs, 1), 0) >= 1 then
    return jsonb_build_object('ok', false, 'reason', 'limit', 'used', a.songs_used);
  end if;
  -- opt into the trigger bypass for THIS transaction only, then do the write
  perform set_config('rollout.internal', 'on', true);
  update public.rollout_artists
     set used_songs = array_append(used_songs, fname),
         songs_used = songs_used + 1
   where id = a.id;
  return jsonb_build_object('ok', true, 'plan', a.plan, 'used', a.songs_used + 1);
end $$;
revoke all on function public.rollout_consume_song_slot(text) from anon;
grant execute on function public.rollout_consume_song_slot(text) to authenticated;
