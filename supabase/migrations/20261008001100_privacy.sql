-- =============================================================================
-- Wagbook 0011: a parent's rights over their details (roadmap M9)
--
-- India's Digital Personal Data Protection Act lets a person ask what a
-- business holds about them, and ask for it to be erased. Two functions: an
-- owner or manager exports, and only an owner erases (D29):
--
--   export_client(id)  everything held about one parent, as one JSON document
--   erase_client(id)   erases it, keeping only what the law makes the kennel
--                      keep: issued bills (with the buyer details printed on
--                      them), the payments against them, and the bare stays
--                      they were for
--
-- See docs/05-security-and-privacy.md, "Privacy".
-- =============================================================================

create function public.check_privacy_access(p_org uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_org is null or p_org not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB070: only an owner or manager can export or erase a parent''s details' using errcode = '42501';
  end if;
end;
$$;
comment on function public.check_privacy_access(uuid) is
  'Raises unless the caller is an owner or manager of the organisation. export_client and erase_client call it first; erase_client then also needs an owner (WB074).';

-- ---------------------------------------------------------------------------

create function public.client_file_paths(p_client uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  -- Every file in storage that belongs to this parent's pets and stays: pet
  -- photos, certificates, photos on tasks and updates (with the small copy of
  -- each photo), and certificates sent with intake forms. Runs as the caller.
  with c as (
    select cl.id, cl.org_id, cl.phone from public.clients cl where cl.id = p_client
  ),
  pet_ids as (
    select p.id from public.pets p join c on p.org_id = c.org_id and p.client_id = c.id
  ),
  booking_ids as (
    select b.id from public.bookings b join c on b.org_id = c.org_id and b.client_id = c.id
  ),
  paths as (
    select p.photo_path as path from public.pets p where p.id in (select id from pet_ids)
    union all
    select v.certificate_path from public.vaccinations v where v.pet_id in (select id from pet_ids)
    union all
    select t.photo_path from public.care_tasks t where t.booking_id in (select id from booking_ids)
    union all
    select unnest(u.media_paths) from public.stay_updates u where u.booking_id in (select id from booking_ids)
    union all
    select o.name
    from public.intake_submissions s
    join c on s.org_id = c.org_id and (s.client_id = c.id or s.parent_phone = c.phone)
    join storage.objects o on o.bucket_id = 'pet-media' and o.name like s.org_id || '/intake/' || s.id || '/%'
  )
  select coalesce(array_agg(distinct x.path order by x.path), '{}')
  from (
    select path from paths where path is not null
    union
    select regexp_replace(path, '\.jpg$', '.small.jpg') from paths where path ~ '\.jpg$'
  ) x;
$$;
comment on function public.client_file_paths(uuid) is
  'Paths in the pet-media bucket that hold this parent''s pets'' photos and certificates, photos from their stays, and files sent with their intake forms (with the small copy of every photo). Runs as the caller, so it lists only what they may read.';

-- ---------------------------------------------------------------------------

create function public.export_client(p_client uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_client public.clients;
begin
  -- SECURITY INVOKER: it reads only what the owner or manager could read
  -- anyway. The check is so that staff are refused rather than sent a
  -- partial file.
  select * into v_client from public.clients c where c.id = p_client;
  if v_client.id is null then
    raise exception 'WB003: parent not found' using errcode = 'P0002';
  end if;
  perform public.check_privacy_access(v_client.org_id);

  return jsonb_build_object(
    'format', 'wagbook-parent-export-1',
    'exported_at', now(),
    'kennel', (select jsonb_build_object('name', o.name, 'city', o.city, 'phone', o.phone, 'email', o.email)
               from public.organizations o where o.id = v_client.org_id),
    'parent', to_jsonb(v_client) - 'org_id',
    'pets', coalesce((
      select jsonb_agg(
        to_jsonb(p) - 'org_id'
        || jsonb_build_object(
          'vaccinations', coalesce((select jsonb_agg(to_jsonb(v) - 'org_id' order by v.vaccine)
                                    from public.vaccinations v where v.pet_id = p.id), '[]'::jsonb),
          'own_routine', coalesce((select jsonb_agg(to_jsonb(ci) - 'org_id' order by ci.due_time)
                                   from public.care_items ci where ci.pet_id = p.id), '[]'::jsonb),
          'incidents', coalesce((select jsonb_agg(to_jsonb(i) - 'org_id' order by i.occurred_at)
                                 from public.incidents i where i.pet_id = p.id), '[]'::jsonb)
        ) order by p.name)
      from public.pets p where p.org_id = v_client.org_id and p.client_id = v_client.id
    ), '[]'::jsonb),
    'stays', coalesce((
      select jsonb_agg(
        to_jsonb(b) - 'org_id' - 'public_token'
        || jsonb_build_object(
          'extras', coalesce((select jsonb_agg(to_jsonb(bi) - 'org_id' order by bi.created_at)
                              from public.booking_items bi where bi.booking_id = b.id), '[]'::jsonb),
          'updates', coalesce((select jsonb_agg(to_jsonb(u) - 'org_id' order by u.created_at)
                               from public.stay_updates u where u.booking_id = b.id), '[]'::jsonb),
          'care', coalesce((select jsonb_agg(to_jsonb(t) - 'org_id' order by t.task_date, t.due_time)
                            from public.care_tasks t where t.booking_id = b.id), '[]'::jsonb),
          'play', coalesce((select jsonb_agg(to_jsonb(ps) - 'org_id' order by ps.session_date, ps.starts_at)
                            from public.play_sessions ps where ps.booking_id = b.id), '[]'::jsonb)
        ) order by b.start_date)
      from public.bookings b where b.org_id = v_client.org_id and b.client_id = v_client.id
    ), '[]'::jsonb),
    'bills', coalesce((
      select jsonb_agg(
        to_jsonb(i) - 'org_id' - 'public_token'
        || jsonb_build_object('lines', coalesce((select jsonb_agg(to_jsonb(l) - 'org_id' order by l.sort_order, l.created_at)
                                                 from public.invoice_lines l where l.invoice_id = i.id), '[]'::jsonb))
        order by i.created_at)
      from public.invoices i where i.org_id = v_client.org_id and i.client_id = v_client.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(pay) - 'org_id' order by pay.received_on, pay.created_at)
      from public.payments pay where pay.org_id = v_client.org_id and pay.client_id = v_client.id
    ), '[]'::jsonb),
    'forms', coalesce((
      select jsonb_agg(to_jsonb(s) - 'org_id' - 'upload_token' order by s.created_at)
      from public.intake_submissions s
      where s.org_id = v_client.org_id and (s.client_id = v_client.id or s.parent_phone = v_client.phone)
    ), '[]'::jsonb),
    'files', to_jsonb(public.client_file_paths(v_client.id))
  );
end;
$$;
comment on function public.export_client(uuid) is
  'Everything held about one parent, for a request under the DPDP Act: their details and consent, their pets with vaccinations, routines and incidents, every stay with its extras, updates, care and play, bills with their lines, payments, the intake forms they sent, and the paths of the files. Owner or manager (WB070).';

-- ---------------------------------------------------------------------------

create function public.erase_client(p_client uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients;
  v_paths text[];
  v_bookings uuid[];
  v_pets uuid[];
  v_incidents uuid[];
begin
  -- SECURITY DEFINER: erasing has to remove personal text from the audit log,
  -- which nobody may write, and nothing else. Who may do it is checked here:
  -- an owner of the parent's kennel, in a fully signed-in session.
  select * into v_client from public.clients c where c.id = p_client for update;
  -- Another kennel's parent is "not found", as it would be to the caller.
  if v_client.id is null or v_client.org_id not in (select public.my_org_ids()) then
    raise exception 'WB003: parent not found' using errcode = 'P0002';
  end if;
  perform public.check_privacy_access(v_client.org_id);
  -- Erasing deletes, and deleting is for owners (D29).
  if v_client.org_id not in (select public.my_org_ids_with_role(array['owner']::public.member_role[])) then
    raise exception 'WB074: only an owner can erase a parent''s details' using errcode = '42501';
  end if;
  if v_client.erased_at is not null then
    raise exception 'WB073: this parent''s details have already been erased' using errcode = '23514';
  end if;
  if exists (select 1 from public.bookings b
             where b.org_id = v_client.org_id and b.client_id = v_client.id and b.status = 'checked_in') then
    raise exception 'WB071: a pet of this parent is in the kennel now. Check it out first.' using errcode = '23514';
  end if;
  if exists (select 1 from public.bookings b
             where b.org_id = v_client.org_id and b.client_id = v_client.id and b.status in ('requested', 'confirmed')) then
    raise exception 'WB072: this parent has stays still to come. Cancel them first.' using errcode = '23514';
  end if;

  -- The files go after the rows. The app removes them from storage with the
  -- list returned here (Postgres cannot reach the files themselves).
  v_paths := public.client_file_paths(v_client.id);

  select coalesce(array_agg(p.id), '{}') into v_pets
  from public.pets p where p.org_id = v_client.org_id and p.client_id = v_client.id;
  select coalesce(array_agg(b.id), '{}') into v_bookings
  from public.bookings b where b.org_id = v_client.org_id and b.client_id = v_client.id;
  select coalesce(array_agg(i.id), '{}') into v_incidents
  from public.incidents i where i.org_id = v_client.org_id and i.pet_id = any (v_pets);

  -- What was said and done about the pets, and the forms the parent sent.
  delete from public.stay_updates u where u.org_id = v_client.org_id and u.booking_id = any (v_bookings);
  delete from public.care_tasks t where t.org_id = v_client.org_id and t.booking_id = any (v_bookings);
  delete from public.play_sessions ps where ps.org_id = v_client.org_id and ps.booking_id = any (v_bookings);
  delete from public.incidents i where i.id = any (v_incidents);
  delete from public.vaccinations v where v.org_id = v_client.org_id and v.pet_id = any (v_pets);
  delete from public.care_items ci where ci.org_id = v_client.org_id and ci.pet_id = any (v_pets);
  delete from public.intake_submissions s
  where s.org_id = v_client.org_id and (s.client_id = v_client.id or s.parent_phone = v_client.phone);
  -- Drafts were never given to anyone; issued and cancelled bills stay, as
  -- the law requires, with the buyer details frozen on them when issued.
  delete from public.invoices i where i.org_id = v_client.org_id and i.client_id = v_client.id and i.status = 'draft';

  -- Stays keep their dates, kennel and prices (bills and reports rest on
  -- them), and lose every note.
  update public.bookings b
  set belongings = null, gate_notes = null, notes = null, cancel_reason = null,
      expected_arrival = null, expected_departure = null
  where b.id = any (v_bookings);

  update public.pets p
  set name = 'Erased', breed = null, sex = 'unknown', is_neutered = null, date_of_birth = null, weight_kg = null,
      color = null, microchip = null, photo_path = null, food_notes = null, medical_notes = null, allergies = null,
      behaviour_notes = null, flags = '{}', vet_name = null, vet_phone = null,
      deleted_at = coalesce(p.deleted_at, now())
  where p.id = any (v_pets);

  update public.clients c
  set full_name = 'Erased', phone = '', alt_phone = null, email = null, address = null, city = null,
      postal_code = null, gst_state_code = null, tax_id = null, emergency_name = null, emergency_phone = null,
      notes = null, consent_at = null, consent_source = null,
      deleted_at = coalesce(c.deleted_at, now()), erased_at = now()
  where c.id = v_client.id;

  -- The history of changes copied some of that text when it was written, and
  -- again just now. Take it out of those entries; keep who changed what, when.
  update public.audit_log a
  set old_data = a.old_data - 'belongings' - 'gate_notes' - 'notes' - 'cancel_reason' - 'expected_arrival' - 'expected_departure',
      new_data = a.new_data - 'belongings' - 'gate_notes' - 'notes' - 'cancel_reason' - 'expected_arrival' - 'expected_departure'
  where a.org_id = v_client.org_id and a.table_name = 'bookings' and a.row_id = any (v_bookings);
  update public.audit_log a
  set old_data = case when a.old_data is not null then '{"erased": true}'::jsonb end,
      new_data = case when a.new_data is not null then '{"erased": true}'::jsonb end
  where a.org_id = v_client.org_id and a.table_name = 'incidents' and a.row_id = any (v_incidents);

  -- And the erasure itself is recorded.
  insert into public.audit_log (org_id, actor, action, table_name, row_id, old_data, new_data)
  values (v_client.org_id, (select auth.uid()), 'update', 'clients', v_client.id, null,
          jsonb_build_object('erased_at', now()));

  return v_paths;
end;
$$;
comment on function public.erase_client(uuid) is
  'Erases a parent on their request: deletes their pets'' vaccinations, routines and incidents, every update, task and play session of their stays, their intake forms and draft bills; empties every personal detail on the parent, their pets and their stays; and takes that text out of the history of changes. Keeps issued and cancelled bills (with the buyer details printed on them), payments, and the stays'' dates and prices. Refused while a pet is in house (WB071) or a stay is still to come (WB072). Returns the storage paths of the files to remove. Owner only (WB070, WB074).';

revoke all on function public.check_privacy_access(uuid) from public, anon;
revoke all on function public.client_file_paths(uuid) from public, anon;
revoke all on function public.export_client(uuid) from public, anon;
revoke all on function public.erase_client(uuid) from public, anon;
grant execute on function public.check_privacy_access(uuid) to authenticated;
grant execute on function public.client_file_paths(uuid) to authenticated;
grant execute on function public.export_client(uuid) to authenticated;
grant execute on function public.erase_client(uuid) to authenticated;
