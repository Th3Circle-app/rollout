-- 002: fix privileged-column trigger vs metering RPC interaction.
-- The trigger now allows changes only from (a) the platform's own RPCs,
-- which mark the transaction with rollout.internal, or (b) service_role.
-- Direct client updates to songs_used/used_songs/stripe_customer_id RAISE.

create or replace function public.rollout_protect_privileged()
returns trigger language plpgsql security definer as $$
begin
  if coalesce(current_setting('rollout.internal', true), '') <> 'on'
     and coalesce((auth.jwt() ->> 'role'), '') <> 'service_role' then
    if new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.songs_used is distinct from old.songs_used
       or new.used_songs is distinct from old.used_songs then
      raise exception 'privileged columns are managed by the platform';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

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
  perform set_config('rollout.internal', 'on', true);  -- transaction-local
  update public.rollout_artists
    set songs_used = songs_used + 1,
        used_songs = array_append(used_songs, fname)
    where id = a.id;
  return jsonb_build_object('ok', true, 'used', a.songs_used + 1);
end $$;
