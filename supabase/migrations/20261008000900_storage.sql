-- =============================================================================
-- Wagbook 0009: file storage
--
-- One private bucket, pet-media, holds pet photos, vaccination certificates,
-- task proof photos and update photos. Files live under a folder named after
-- the organisation id:
--     {org_id}/pets/{pet_id}/profile.jpg
--     {org_id}/vaccinations/{vaccination_id}.pdf
--     {org_id}/updates/{update_id}/1.jpg
--     {org_id}/expenses/{expense_id}.jpg     (owners and managers only)
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

-- Receipts ({org_id}/expenses/...) are the kennel's own money, and expenses
-- are for owners and managers only, so their files are too.
create policy pet_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'pet-media'
    and public.storage_org_id(name) in (select public.my_org_ids())
    and (
      split_part(name, '/', 2) <> 'expenses'
      or public.storage_org_id(name) in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
    )
  );
create policy pet_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pet-media'
    and public.storage_org_id(name) in (select public.my_org_ids())
    and (
      split_part(name, '/', 2) <> 'expenses'
      or public.storage_org_id(name) in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
    )
  );
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

-- ---------------------------------------------------------------------------
-- A stored file belongs to the row that names it, in the same organisation.
-- Without this a member of two kennels could put one kennel's photo on the
-- other's pet, and the parent's stay link would then show it.
-- ---------------------------------------------------------------------------

create function public.paths_in_org(p_paths text[], p_org uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(p is null or public.storage_org_id(p) is not distinct from p_org), true) from unnest(p_paths) as p;
$$;
comment on function public.paths_in_org(text[], uuid) is 'True when every path that is set is inside the given organisation''s folder. Empty paths are allowed.';
revoke all on function public.paths_in_org(text[], uuid) from public, anon;
grant execute on function public.paths_in_org(text[], uuid) to authenticated;

alter table public.pets add constraint pets_photo_in_org check (public.paths_in_org(array[photo_path], org_id));
alter table public.vaccinations add constraint vaccinations_certificate_in_org check (public.paths_in_org(array[certificate_path], org_id));
alter table public.care_tasks add constraint care_tasks_photo_in_org check (public.paths_in_org(array[photo_path], org_id));
alter table public.expenses add constraint expenses_receipt_in_org check (public.paths_in_org(array[receipt_path], org_id));
alter table public.stay_updates add constraint stay_updates_media_in_org check (public.paths_in_org(media_paths, org_id));
alter table public.stay_updates add constraint stay_updates_at_most_six_photos check (cardinality(media_paths) <= 6);

-- ---------------------------------------------------------------------------
-- Photos on the parent's stay page.
--
-- A parent has no account. The stay page asks Storage for short-lived signed
-- links as the anonymous role, sending the stay's secret token in the
-- x-wagbook-stay request header (Storage passes request headers to Postgres
-- as request.headers). The anonymous role may read a file only when that
-- token belongs to a live stay and the file is a photo on one of its updates
-- shown to the parent, or the pet's own photo. Nothing else: no listing of
-- other stays, no internal notes' photos, nothing after the link expires.
-- ---------------------------------------------------------------------------

create function public.stay_media_visible(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text;
  -- Every photo is stored twice: the photo, and a small copy for lists and
  -- slow connections (name.small.jpg). The small copy goes wherever the photo goes.
  v_photo text := regexp_replace(p_name, '\.small\.jpg$', '.jpg');
begin
  begin
    v_token := nullif(current_setting('request.headers', true), '')::json ->> 'x-wagbook-stay';
  exception when others then
    return false;
  end;
  if v_token is null or char_length(v_token) <> 64 then
    return false;
  end if;
  return exists (
    select 1
    from public.bookings b
    join public.pets p on p.id = b.pet_id
    where b.public_token = v_token
      and b.status not in ('cancelled', 'no_show')
      and p.deleted_at is null
      and (b.status <> 'checked_out' or b.checked_out_at > now() - interval '30 days')
      and public.storage_org_id(p_name) = b.org_id
      and (
        p.photo_path = v_photo
        or exists (
          select 1 from public.stay_updates su
          where su.booking_id = b.id and su.is_visible_to_parent and v_photo = any (su.media_paths)
        )
      )
  );
end;
$$;
comment on function public.stay_media_visible(text) is
  'PUBLIC, through Storage only. True when the request carries a live stay''s token (x-wagbook-stay header) and the file is that stay''s pet photo or a photo on one of its updates shown to the parent (or the small copy of one). SECURITY DEFINER because the anonymous role can read no table.';
revoke all on function public.stay_media_visible(text) from public, anon;
grant execute on function public.stay_media_visible(text) to anon;

create policy pet_media_select_for_stay on storage.objects for select to anon
  using (bucket_id = 'pet-media' and public.stay_media_visible(name));
