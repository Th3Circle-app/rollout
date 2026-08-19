-- Profile picture support.
--   * avatar_url on the artist profile (user-editable; NOT a privileged column,
--     so the protect trigger leaves it alone and update_own RLS allows it)
--   * a PUBLIC 'avatars' storage bucket: anyone can read (it's a profile pic),
--     but only the owner can write/replace/delete their own file (uid folder)
alter table public.rollout_artists add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select to public
  using (bucket_id = 'avatars');

drop policy if exists avatars_own_write on storage.objects;
create policy avatars_own_write on storage.objects
  for insert to public
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects
  for update to public
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects
  for delete to public
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
