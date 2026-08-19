-- Hardening pass on the privileged-column protection + housekeeping functions.
-- Core isolation (RLS) and the plan/metering protection trigger were already in
-- place; this closes the Supabase security-advisor warnings so the guarantee is
-- airtight:
--   * pin search_path on SECURITY DEFINER / trigger functions (no path hijack)
--   * revoke EXECUTE from anon/authenticated on functions that are only ever run
--     as triggers/event-triggers or by signed-in users (defense in depth)
-- None of this changes behavior: triggers fire as the table owner regardless of
-- EXECUTE grants, and the app calls rollout_consume_song_slot as an authed user.

alter function public.rollout_protect_privileged() set search_path = public;
alter function public.rollout_touch_updated()      set search_path = public;

revoke execute on function public.rollout_protect_privileged()      from anon, authenticated, public;
revoke execute on function public.rls_auto_enable()                 from anon, authenticated, public;
revoke execute on function public.rollout_consume_song_slot(text)   from anon, public;
-- keep: authenticated + service_role may call rollout_consume_song_slot
