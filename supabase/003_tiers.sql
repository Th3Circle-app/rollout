-- 003: two paid tiers (artist $15 / studio $20) + server-enforced plan.
-- Plan changes now come ONLY from the Stripe webhook (service role);
-- clients can read their plan but never write it.

alter table rollout_artists drop constraint if exists rollout_artists_plan_check;
update rollout_artists set plan = 'studio' where plan = 'pro';
alter table rollout_artists
  add constraint rollout_artists_plan_check check (plan in ('free','artist','studio'));

alter table rollout_artists add column if not exists stripe_subscription_id text;

create or replace function rollout_protect_privileged()
returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and auth.uid() is not null then
    if new.plan is distinct from old.plan
       or new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.stripe_subscription_id is distinct from old.stripe_subscription_id
       or new.songs_used is distinct from old.songs_used
       or new.used_songs is distinct from old.used_songs then
      raise exception 'privileged columns are server-managed';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_rollout_protect_privileged on rollout_artists;
create trigger trg_rollout_protect_privileged
  before update on rollout_artists
  for each row execute function rollout_protect_privileged();

create or replace function rollout_consume_song_slot(fname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a rollout_artists;
begin
  select * into a from rollout_artists where id = auth.uid() for update;
  if a is null then
    return jsonb_build_object('ok', false, 'reason', 'no profile');
  end if;
  if a.plan in ('artist','studio') then
    return jsonb_build_object('ok', true, 'plan', a.plan);
  end if;
  if fname = any(a.used_songs) then
    return jsonb_build_object('ok', true, 'plan', a.plan, 'repeat', true);
  end if;
  if coalesce(array_length(a.used_songs, 1), 0) >= 1 then
    return jsonb_build_object('ok', false, 'reason', 'free song used');
  end if;
  update rollout_artists
     set used_songs = array_append(used_songs, fname),
         songs_used = songs_used + 1
   where id = a.id;
  return jsonb_build_object('ok', true, 'plan', a.plan);
end $$;
