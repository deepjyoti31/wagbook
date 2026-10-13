-- =============================================================================
-- Wagbook 0009: file storage
--
-- One private bucket, pet-media, holds pet photos, vaccination certificates,
-- task proof photos and update photos. Files live under a folder named after
-- the organisation id:
--     {org_id}/pets/{pet_id}/profile.jpg
--     {org_id}/vaccinations/{vaccination_id}.pdf
--     {org_id}/updates/{update_id}/1.jpg
-- The first folder decides who can see the file. Nothing is public; pages
-- that show a photo ask for a short-lived signed link.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pet-media', 'pet-media', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'video/mp4']
)
on conflict (id) do nothing;

create function public.storage_org_id(p_object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_object_name, '/', 1)::uuid
  end;
$$;
comment on function public.storage_org_id(text) is
  'The organisation a stored file belongs to, read from the first folder of its path. Null when the path does not start with an organisation id.';

revoke all on function public.storage_org_id(text) from public, anon;
grant execute on function public.storage_org_id(text) to authenticated;

create policy pet_media_select on storage.objects for select to authenticated
  using (bucket_id = 'pet-media' and public.storage_org_id(name) in (select public.my_org_ids()));
create policy pet_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'pet-media' and public.storage_org_id(name) in (select public.my_org_ids()));
-- Replacing or renaming a file is as destructive as deleting it, so both are
-- for owners and managers. Staff add files; they do not change them.
create policy pet_media_update on storage.objects for update to authenticated
  using (
    bucket_id = 'pet-media'
    and public.storage_org_id(name) in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
  )
  with check (
    bucket_id = 'pet-media'
    and public.storage_org_id(name) in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
  );
create policy pet_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'pet-media'
    and public.storage_org_id(name) in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
  );
