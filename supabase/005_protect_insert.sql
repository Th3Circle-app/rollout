-- 005: close the INSERT plan-escalation hole.
-- The privileged-column trigger was BEFORE UPDATE only, so a fresh authenticated
-- user could INSERT their rollout_artists row with plan='studio' (or set the
-- stripe/usage columns) directly against PostgREST and self-grant a paid tier.
-- Guard INSERT too: on any non-service-role / non-internal insert, force the
-- privileged columns to their safe defaults.

create or replace function public.rollout_protect_privileged()
returns trigger language plpgsql security definer as $$
begin
  if current_setting('rollout.internal', true) is distinct from 'on'
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and auth.uid() is not null then
    if TG_OP = 'INSERT' then
      -- clients may create only a FREE, unbilled row for themselves
      new.plan := 'free';
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
      new.songs_used := 0;
      new.used_songs := '{}';
    else  -- UPDATE: privileged columns are server-managed
      if new.plan is distinct from old.plan
         or new.stripe_customer_id is distinct from old.stripe_customer_id
         or new.stripe_subscription_id is distinct from old.stripe_subscription_id
         or new.songs_used is distinct from old.songs_used
         or new.used_songs is distinct from old.used_songs then
        raise exception 'privileged columns are server-managed';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_rollout_protect_privileged on public.rollout_artists;
create trigger trg_rollout_protect_privileged
  before insert or update on public.rollout_artists
  for each row execute function public.rollout_protect_privileged();
