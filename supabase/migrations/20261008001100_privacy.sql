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
    select d.proof_path from public.deliveries d join c on d.org_id = c.org_id and d.client_id = c.id
    union all
    select dp.photo_path from public.delivery_problems dp
    join public.deliveries d on d.org_id = dp.org_id and d.id = dp.delivery_id
    join c on d.org_id = c.org_id and d.client_id = c.id
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
  'Paths in the pet-media bucket that hold this parent''s pets'' photos and certificates, photos from their stays and food deliveries, and files sent with their intake forms (with the small copy of every photo). Runs as the caller, so it lists only what they may read.';

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
    'addresses', coalesce((
      select jsonb_agg(to_jsonb(a) - 'org_id' order by a.created_at)
      from public.client_addresses a where a.org_id = v_client.org_id and a.client_id = v_client.id
    ), '[]'::jsonb),
    'pets', coalesce((
      select jsonb_agg(
        to_jsonb(p) - 'org_id'
        || jsonb_build_object(
          'vaccinations', coalesce((select jsonb_agg(to_jsonb(v) - 'org_id' order by v.vaccine)
                                    from public.vaccinations v where v.pet_id = p.id), '[]'::jsonb),
          'weights', coalesce((select jsonb_agg(to_jsonb(w) - 'org_id' order by w.weighed_on, w.created_at)
                               from public.pet_weights w where w.pet_id = p.id), '[]'::jsonb),
          'food', (select to_jsonb(f) - 'org_id' from public.pet_food f where f.org_id = p.org_id and f.pet_id = p.id),
          'own_routine', coalesce((select jsonb_agg(to_jsonb(ci) - 'org_id' order by ci.due_time)
                                   from public.care_items ci where ci.pet_id = p.id), '[]'::jsonb),
          'incidents', coalesce((select jsonb_agg(to_jsonb(i) - 'org_id' order by i.occurred_at)
                                 from public.incidents i where i.pet_id = p.id), '[]'::jsonb),
          'vet_visits', coalesce((select jsonb_agg(to_jsonb(vv) - 'org_id' order by vv.visited_on, vv.created_at)
                                  from public.vet_visits vv where vv.org_id = p.org_id and vv.pet_id = p.id), '[]'::jsonb)
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
                            from public.play_sessions ps where ps.booking_id = b.id), '[]'::jsonb),
          'supplies', coalesce((select jsonb_agg(to_jsonb(ss) - 'org_id' order by ss.created_at)
                                from public.stay_supplies ss where ss.org_id = b.org_id and ss.booking_id = b.id), '[]'::jsonb),
          'report', (select to_jsonb(sr) - 'org_id' from public.stay_reports sr where sr.org_id = b.org_id and sr.booking_id = b.id)
        ) order by b.start_date)
      from public.bookings b where b.org_id = v_client.org_id and b.client_id = v_client.id
    ), '[]'::jsonb),
    'bills', coalesce((
      select jsonb_agg(
        to_jsonb(i) - 'org_id' - 'public_token'
        || jsonb_build_object('lines', coalesce((select jsonb_agg(to_jsonb(l) - 'org_id' order by l.sort_order, l.created_at)
                                                 from public.invoice_lines l where l.invoice_id = i.id), '[]'::jsonb))
        || jsonb_build_object('credit_notes', coalesce((
             select jsonb_agg(to_jsonb(cn) - 'org_id'
                              || jsonb_build_object('lines', coalesce((select jsonb_agg(to_jsonb(cl) - 'org_id' order by cl.sort_order)
                                                                       from public.credit_note_lines cl where cl.credit_note_id = cn.id), '[]'::jsonb))
                              order by cn.seq)
             from public.credit_notes cn where cn.org_id = i.org_id and cn.invoice_id = i.id), '[]'::jsonb))
        order by i.created_at)
      from public.invoices i where i.org_id = v_client.org_id and i.client_id = v_client.id
    ), '[]'::jsonb),
    'subscriptions', coalesce((
      select jsonb_agg(to_jsonb(sb) - 'org_id' order by sb.starts_on, sb.created_at)
      from public.subscriptions sb where sb.org_id = v_client.org_id and sb.client_id = v_client.id
    ), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(
        to_jsonb(d) - 'org_id'
        || jsonb_build_object('problems', coalesce((select jsonb_agg(to_jsonb(dp) - 'org_id' order by dp.reported_at)
                                                    from public.delivery_problems dp where dp.org_id = d.org_id and dp.delivery_id = d.id), '[]'::jsonb))
        order by d.delivery_date, d.created_at)
      from public.deliveries d where d.org_id = v_client.org_id and d.client_id = v_client.id
    ), '[]'::jsonb),
    'food_orders', coalesce((
      select jsonb_agg(to_jsonb(fo) - 'org_id' - 'public_token' order by fo.created_at)
      from public.food_orders fo
      where fo.org_id = v_client.org_id and (fo.client_id = v_client.id or fo.phone = v_client.phone)
    ), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(
        to_jsonb(a) - 'org_id'
        || jsonb_build_object('add_ons', coalesce((select jsonb_agg(to_jsonb(ai) - 'org_id' order by ai.created_at)
                                                   from public.appointment_items ai where ai.org_id = a.org_id and ai.appointment_id = a.id), '[]'::jsonb))
        order by a.starts_at)
      from public.appointments a where a.org_id = v_client.org_id and a.client_id = v_client.id
    ), '[]'::jsonb),
    'trips', coalesce((
      select jsonb_agg(to_jsonb(t) - 'org_id' order by t.trip_date)
      from public.trips t where t.org_id = v_client.org_id and t.client_id = v_client.id
    ), '[]'::jsonb),
    'credit', coalesce((
      select jsonb_agg(to_jsonb(cb) - 'org_id' order by cb.expires_on)
      from public.credit_balances cb where cb.org_id = v_client.org_id and cb.client_id = v_client.id
    ), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(to_jsonb(cb) - 'org_id' order by cb.name)
      from public.course_balances cb where cb.org_id = v_client.org_id and cb.client_id = v_client.id
    ), '[]'::jsonb),
    'packs', coalesce((
      select jsonb_agg(to_jsonb(pb) - 'org_id' order by pb.starts_on)
      from public.pass_balances pb where pb.org_id = v_client.org_id and pb.client_id = v_client.id
    ), '[]'::jsonb),
    'sales', coalesce((
      select jsonb_agg(
        to_jsonb(sa) - 'org_id'
        || jsonb_build_object('lines', coalesce((select jsonb_agg(to_jsonb(sl) - 'org_id' order by sl.sort_order)
                                                 from public.sale_lines sl where sl.org_id = sa.org_id and sl.sale_id = sa.id), '[]'::jsonb))
        order by sa.sold_on, sa.created_at)
      from public.sales sa where sa.org_id = v_client.org_id and sa.client_id = v_client.id
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
  'Everything held about one parent, for a request under the DPDP Act: their details and consent, their addresses, their pets with vaccinations, weights, food, routines and incidents, every stay with its extras, updates, care and play, appointments with their add-ons and training courses, food subscriptions, deliveries with their problems and food orders, bills with their lines and credit notes, things bought over the counter, payments, the intake forms they sent, and the paths of the files. Owner or manager (WB070).';

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

  if exists (select 1 from public.subscriptions sb
             where sb.org_id = v_client.org_id and sb.client_id = v_client.id
               and (sb.cancelled_on is null or sb.cancelled_on > public.org_today(sb.org_id)))
     or exists (select 1 from public.deliveries d
                where d.org_id = v_client.org_id and d.client_id = v_client.id
                  and d.status in ('planned', 'packed', 'out') and d.delivery_date >= public.org_today(d.org_id)) then
    raise exception 'WB075: this parent has food deliveries still to come. Cancel them first.' using errcode = '23514';
  end if;

  if exists (select 1 from public.appointments a
             where a.org_id = v_client.org_id and a.client_id = v_client.id and a.status in ('requested', 'confirmed')
               and a.starts_at > now()) then
    raise exception 'WB076: this parent has appointments still to come. Cancel them first.' using errcode = '23514';
  end if;

  select coalesce(array_agg(p.id), '{}') into v_pets
  from public.pets p where p.org_id = v_client.org_id and p.client_id = v_client.id;
  select coalesce(array_agg(b.id), '{}') into v_bookings
  from public.bookings b where b.org_id = v_client.org_id and b.client_id = v_client.id;

  -- The files go after the rows. The app removes them from storage with the
  -- list returned here (Postgres cannot reach the files themselves): photos
  -- sent to the parent with updates, files sent with their forms, and
  -- vaccination certificates, because a card carries the owner's name and
  -- address. The pets' own photos stay with the pets.
  with paths as (
    select v.certificate_path as path
    from public.vaccinations v where v.org_id = v_client.org_id and v.pet_id = any (v_pets)
    union all
    select unnest(u.media_paths)
    from public.stay_updates u where u.org_id = v_client.org_id and u.booking_id = any (v_bookings)
    union all
    select d.proof_path
    from public.deliveries d where d.org_id = v_client.org_id and d.client_id = v_client.id
    union all
    select dp.photo_path
    from public.delivery_problems dp
    join public.deliveries d on d.org_id = dp.org_id and d.id = dp.delivery_id
    where d.org_id = v_client.org_id and d.client_id = v_client.id
    union all
    select o.name
    from public.intake_submissions s
    join storage.objects o on o.bucket_id = 'pet-media' and o.name like s.org_id || '/intake/' || s.id || '/%'
    where s.org_id = v_client.org_id and (s.client_id = v_client.id or s.parent_phone = v_client.phone)
  )
  select coalesce(array_agg(distinct x.path order by x.path), '{}') into v_paths
  from (
    select path from paths where path is not null
    union
    select regexp_replace(path, '\.jpg$', '.small.jpg') from paths where path ~ '\.jpg$'
  ) x;

  -- Where they live and work, and the photos taken at their door.
  delete from public.client_addresses a where a.org_id = v_client.org_id and a.client_id = v_client.id;
  update public.deliveries d set proof_path = null, note = null
  where d.org_id = v_client.org_id and d.client_id = v_client.id;
  update public.delivery_problems dp set photo_path = null, note = null
  where dp.org_id = v_client.org_id
    and dp.delivery_id in (select d.id from public.deliveries d where d.org_id = v_client.org_id and d.client_id = v_client.id);
  update public.subscriptions sb set notes = null, cancel_reason = 'Erased'
  where sb.org_id = v_client.org_id and sb.client_id = v_client.id and sb.cancelled_on is not null;
  -- Food orders sent from the website carry their name, phone and address.
  delete from public.food_orders fo
  where fo.org_id = v_client.org_id and (fo.client_id = v_client.id or fo.phone = v_client.phone);
  -- What was said to the parent, and the forms they sent.
  delete from public.stay_updates u where u.org_id = v_client.org_id and u.booking_id = any (v_bookings);
  delete from public.stay_reports r where r.org_id = v_client.org_id and r.booking_id = any (v_bookings);
  delete from public.intake_submissions s
  where s.org_id = v_client.org_id and (s.client_id = v_client.id or s.parent_phone = v_client.phone);
  update public.vaccinations v set certificate_path = null
  where v.org_id = v_client.org_id and v.pet_id = any (v_pets) and v.certificate_path is not null;
  -- Drafts were never given to anyone; issued and cancelled bills stay, as
  -- the law requires, with the buyer details frozen on them when issued.
  delete from public.invoices i where i.org_id = v_client.org_id and i.client_id = v_client.id and i.status = 'draft';

  -- Stays keep their dates, kennel and prices (bills and reports rest on
  -- them), and lose the notes, which are the parent's arrangements.
  update public.bookings b
  set belongings = null, gate_notes = null, notes = null, cancel_reason = null,
      expected_arrival = null, expected_departure = null
  where b.id = any (v_bookings);
  -- Appointments keep their times and prices, and lose the arrangements made
  -- with the parent and the notes and homework sent to them.
  update public.appointments a
  set notes = null, after_notes = null, homework = null,
      cancel_reason = case when a.status = 'cancelled' then 'Erased' end
  where a.org_id = v_client.org_id and a.client_id = v_client.id;
  update public.courses c set notes = null where c.org_id = v_client.org_id and c.client_id = v_client.id;
  update public.trips t set note = null, cancel_reason = case when t.status = 'cancelled' then 'Erased' end
  where t.org_id = v_client.org_id and t.client_id = v_client.id;

  -- The pets stay as they are, with their health, routines, incidents, care
  -- and play (the owner's decision, D30): they are the kennel's record of the
  -- animal, not the parent's details. Hidden, because their parent is gone.
  update public.pets p set deleted_at = coalesce(p.deleted_at, now()) where p.id = any (v_pets);

  update public.clients c
  set full_name = 'Erased', phone = '', alt_phone = null, email = null, address = null, city = null,
      postal_code = null, gst_state_code = null, tax_id = null, emergency_name = null, emergency_phone = null,
      notes = null, consent_at = null, consent_source = null, bill_translation = null, request_token = null,
      deleted_at = coalesce(c.deleted_at, now()), erased_at = now()
  where c.id = v_client.id;

  -- The history of changes copied the stays' notes when they were written,
  -- and again just now. Take them out of those entries; keep who changed
  -- what, when.
  update public.audit_log a
  set old_data = a.old_data - 'belongings' - 'gate_notes' - 'notes' - 'cancel_reason' - 'expected_arrival' - 'expected_departure',
      new_data = a.new_data - 'belongings' - 'gate_notes' - 'notes' - 'cancel_reason' - 'expected_arrival' - 'expected_departure'
  where a.org_id = v_client.org_id and a.table_name = 'bookings' and a.row_id = any (v_bookings);

  -- And the erasure itself is recorded.
  insert into public.audit_log (org_id, actor, action, table_name, row_id, old_data, new_data)
  values (v_client.org_id, (select auth.uid()), 'update', 'clients', v_client.id, null,
          jsonb_build_object('erased_at', now()));

  return v_paths;
end;
$$;
comment on function public.erase_client(uuid) is
  'Erases a parent on their request: empties every personal detail on the parent and the notes on their stays, deletes their addresses, the updates and stay reports sent to them, their intake forms and food orders, draft bills, vaccination certificates (a card shows the owner) and photos taken at their door, and takes that text out of the history of changes. Keeps the pets with their health, routines, incidents, vet visits, care and play (hidden), issued and cancelled bills (with the buyer details printed on them), payments, and the stays'' dates and prices. Empties the notes, session notes and homework of their appointments. Refused while a pet is in house (WB071), a stay is still to come (WB072), food is still to be delivered (WB075) or an appointment is still to come (WB076). Returns the storage paths of the files to remove. Owner only (WB070, WB074).';

revoke all on function public.check_privacy_access(uuid) from public, anon;
revoke all on function public.client_file_paths(uuid) from public, anon;
revoke all on function public.export_client(uuid) from public, anon;
revoke all on function public.erase_client(uuid) from public, anon;
grant execute on function public.check_privacy_access(uuid) to authenticated;
grant execute on function public.client_file_paths(uuid) to authenticated;
grant execute on function public.export_client(uuid) to authenticated;
grant execute on function public.erase_client(uuid) to authenticated;
