-- Self-service account deletion. A SECURITY DEFINER RPC that wipes the caller's
-- content AND their Supabase auth account. It only ever touches auth.uid(), so a
-- user can delete themselves and no one else.
create or replace function public.rollout_delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from public.rollout_fan_pages where artist_id = uid;
  delete from public.rollout_releases  where artist_id = uid;
  delete from public.rollout_artists   where id = uid;
  -- remove the auth identity itself so the email is free to sign up fresh again
  delete from auth.users where id = uid;
end
$function$;

revoke execute on function public.rollout_delete_account() from anon, public;
grant  execute on function public.rollout_delete_account() to authenticated;
