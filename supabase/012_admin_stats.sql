-- Private admin/metrics dashboard support (borrowed from open-saas' admin).
--   * is_admin flag on the artist profile — a PRIVILEGED column, so the protect
--     trigger blocks a user from granting it to themselves.
--   * rollout_admin_stats(): a SECURITY DEFINER aggregate (signups, paying users,
--     plan breakdown, estimated MRR, recent signups) that raises unless the
--     caller is an admin. This is the only way to read cross-account aggregates;
--     normal RLS still hides other users' rows from everyone else.

alter table public.rollout_artists add column if not exists is_admin boolean not null default false;

-- Extend the privileged-column protection to cover is_admin (recreate with the
-- same logic + one more guarded column; search_path already pinned).
create or replace function public.rollout_protect_privileged()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if current_setting('rollout.internal', true) is distinct from 'on'
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and auth.uid() is not null then
    if TG_OP = 'INSERT' then
      new.plan := 'free';
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
      new.songs_used := 0;
      new.used_songs := '{}';
      new.is_admin := false;
    else
      if new.plan is distinct from old.plan
         or new.stripe_customer_id is distinct from old.stripe_customer_id
         or new.stripe_subscription_id is distinct from old.stripe_subscription_id
         or new.songs_used is distinct from old.songs_used
         or new.used_songs is distinct from old.used_songs
         or new.is_admin is distinct from old.is_admin then
        raise exception 'privileged columns are server-managed';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$function$;

-- Flag the owner's account (runs as postgres in the migration, so the trigger
-- allows it).
update public.rollout_artists set is_admin = true where email = 'sososongolo89@gmail.com';

create or replace function public.rollout_admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  me boolean;
  result jsonb;
begin
  select is_admin into me from public.rollout_artists where id = auth.uid();
  if not coalesce(me, false) then
    raise exception 'not authorized';
  end if;
  select jsonb_build_object(
    'total_signups', count(*),
    'free_users',   count(*) filter (where plan = 'free'),
    'artist_users', count(*) filter (where plan = 'artist'),
    'studio_users', count(*) filter (where plan = 'studio'),
    'paying_users', count(*) filter (where plan <> 'free'),
    'signups_7d',   count(*) filter (where created_at > now() - interval '7 days'),
    'signups_30d',  count(*) filter (where created_at > now() - interval '30 days'),
    'estimated_mrr', coalesce(sum(case plan when 'artist' then 15 when 'studio' then 29 else 0 end), 0),
    'recent', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select email, plan, created_at
        from public.rollout_artists
        order by created_at desc
        limit 10
      ) x
    )
  ) into result
  from public.rollout_artists;
  return result;
end
$function$;

revoke execute on function public.rollout_admin_stats() from anon, public;
grant execute on function public.rollout_admin_stats() to authenticated;
