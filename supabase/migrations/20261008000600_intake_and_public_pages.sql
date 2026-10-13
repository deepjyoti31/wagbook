-- =============================================================================
-- Wagbook 0006: the public intake form and the parent-facing pages
--
-- Pet parents never get an account. They reach Wagbook only through:
--   /i/{slug}     the kennel's intake form        -> submit_intake()
--   /s/{token}    one stay's page                 -> get_public_stay()
--   /inv/{token}  one invoice                     -> get_public_invoice()
-- Each is a SECURITY DEFINER function that returns a hand-picked set of
-- fields. The anonymous role has no access to any table.
-- =============================================================================

create type public.intake_status as enum ('new', 'accepted', 'rejected', 'spam');
comment on type public.intake_status is
  'new: waiting for staff. accepted: turned into a client and pets. rejected: declined by staff. spam: junk, kept only to spot patterns.';

create table public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  status public.intake_status not null default 'new',
  parent_name text not null,
  parent_phone text not null,
  requested_start date,
  requested_end date,
  payload jsonb not null,
  consent_at timestamptz not null,
  consent_text text not null,
  client_id uuid,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete set null (client_id)
);

comment on table public.intake_submissions is
  'What a parent typed into the public intake form, kept exactly as sent until staff accept it. Nothing here is trusted until a person has reviewed it.';
comment on column public.intake_submissions.payload is
  'The whole form as JSON (version 1): {v, parent:{name,phone,email,address,city,emergency_name,emergency_phone}, pets:[{name,species,breed,sex,is_neutered,date_of_birth,weight_kg,food_notes,medical_notes,allergies,behaviour_notes,vet_name,vet_phone,vaccinations:[{vaccine,given_on,valid_until}]}], stay:{kind,start_date,end_date,notes}, consent}.';
comment on column public.intake_submissions.consent_text is 'The exact consent wording the parent agreed to, kept as evidence.';
comment on column public.intake_submissions.client_id is 'The client created or matched when the submission was accepted.';

create index intake_submissions_org_status_idx on public.intake_submissions (org_id, status, created_at desc);

create trigger intake_submissions_set_updated_at
  before update on public.intake_submissions
  for each row execute function public.set_updated_at();

create function public.intake_submissions_stamp_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'new' then
      raise exception 'WB049: this form has already been dealt with' using errcode = '23514';
    end if;
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$$;
comment on function public.intake_submissions_stamp_review() is
  'Trigger: a submission is reviewed once. Records who and when as it leaves "new", and refuses any later change of status, so a declined form cannot be reopened and accepted.';

create trigger intake_submissions_stamp_review
  before update on public.intake_submissions
  for each row execute function public.intake_submissions_stamp_review();

-- ---------------------------------------------------------------------------

create function public.safe_date(p_text text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_text is null or p_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return p_text::date;
exception when others then
  -- Looks like a date but is not one, e.g. 2027-13-45.
  return null;
end;
$$;
comment on function public.safe_date(text) is
  'Reads a YYYY-MM-DD string as a date, or returns null if it is anything else. For text that arrived from the public internet.';

create function public.default_intake_notice(p_org_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'I agree that ' || p_org_name || ' may store and use the details in this form to care for my pet, '
      || 'to contact me about the stay, and to keep the records the law requires. '
      || 'I can ask ' || p_org_name || ' to correct or delete my details at any time.';
$$;
comment on function public.default_intake_notice(text) is 'Consent wording used when an organisation has not written its own.';

create function public.get_public_intake_form(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', o.name,
    'city', o.city,
    'whatsapp_phone', o.whatsapp_phone,
    'check_in_time', to_char(o.check_in_time, 'HH24:MI'),
    'check_out_time', to_char(o.check_out_time, 'HH24:MI'),
    'intake_enabled', o.intake_enabled,
    'notice', coalesce(nullif(btrim(o.intake_notice), ''), public.default_intake_notice(o.name))
  )
  from public.organizations o
  where o.slug = lower(btrim(p_slug));
$$;
comment on function public.get_public_intake_form(text) is
  'PUBLIC. What the intake form page needs to show for a kennel: its name, city, WhatsApp number, usual times and consent wording.';

create function public.submit_intake(p_slug text, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_name text;
  v_phone text;
  v_pet jsonb;
  v_start date;
  v_end date;
begin
  select * into v_org from public.organizations o where o.slug = lower(btrim(p_slug));
  if v_org.id is null or not v_org.intake_enabled then
    raise exception 'WB040: this form is not accepting submissions' using errcode = 'P0002';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 20000 then
    raise exception 'WB041: the form could not be read' using errcode = '22023';
  end if;
  if (p_payload ->> 'consent') is distinct from 'true' then
    raise exception 'WB042: please tick the consent box' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(p_payload #>> '{parent,name}', ''));
  v_phone := btrim(coalesce(p_payload #>> '{parent,phone}', ''));
  if char_length(v_name) not between 2 and 120 then
    raise exception 'WB043: please enter your name' using errcode = '22023';
  end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'WB044: please enter a valid mobile number' using errcode = '22023';
  end if;

  if jsonb_typeof(p_payload -> 'pets') <> 'array'
     or jsonb_array_length(p_payload -> 'pets') not between 1 and 6 then
    raise exception 'WB045: please add between one and six pets' using errcode = '22023';
  end if;
  for v_pet in select * from jsonb_array_elements(p_payload -> 'pets') loop
    if char_length(btrim(coalesce(v_pet ->> 'name', ''))) not between 1 and 80 then
      raise exception 'WB046: every pet needs a name' using errcode = '22023';
    end if;
  end loop;

  v_start := public.safe_date(p_payload #>> '{stay,start_date}');
  v_end := public.safe_date(p_payload #>> '{stay,end_date}');
  if (nullif(p_payload #>> '{stay,start_date}', '') is not null and v_start is null)
     or (nullif(p_payload #>> '{stay,end_date}', '') is not null and v_end is null) then
    raise exception 'WB047: the stay dates are not valid' using errcode = '22023';
  end if;
  if v_start is not null and v_end is not null and v_end < v_start then
    raise exception 'WB047: check-out is before check-in' using errcode = '22023';
  end if;

  -- A blunt flood limit. Real rate limiting belongs at the edge (see docs/05).
  -- Only forms still waiting count, so clearing junk reopens the form at once.
  if (select count(*) from public.intake_submissions s
       where s.org_id = v_org.id and s.status = 'new' and s.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'WB048: too many submissions right now. Please try again in a while.' using errcode = '53400';
  end if;
  if (select count(*) from public.intake_submissions s
       where s.org_id = v_org.id and s.parent_phone = v_phone and s.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'WB048: we already have your form. The kennel will be in touch.' using errcode = '53400';
  end if;

  insert into public.intake_submissions
    (org_id, parent_name, parent_phone, requested_start, requested_end, payload, consent_at, consent_text)
  values
    (v_org.id, v_name, v_phone, v_start, v_end, p_payload, now(),
     coalesce(nullif(btrim(v_org.intake_notice), ''), public.default_intake_notice(v_org.name)));

  return true;
end;
$$;
comment on function public.submit_intake(text, jsonb) is
  'PUBLIC. Receives the intake form. Validates shape and size, records consent, and stores the submission for staff to review. Never creates clients or bookings by itself.';

-- Turning a reviewed submission into a client and pets. SECURITY INVOKER: it
-- runs as the staff member, so row level security decides what they may do.
-- Everything in the payload is treated as hostile: lengths are cut, dates and
-- numbers are parsed defensively, unknown values fall back to safe defaults.
create function public.accept_intake(p_submission uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_sub public.intake_submissions;
  v_client uuid;
  v_pet jsonb;
  v_pet_id uuid;
  v_vax jsonb;
  v_given date;
  v_until date;
begin
  select * into v_sub from public.intake_submissions s where s.id = p_submission for update;
  if v_sub.id is null then
    raise exception 'WB003: submission not found' using errcode = 'P0002';
  end if;
  if v_sub.status = 'accepted' then
    return v_sub.client_id;
  end if;
  if v_sub.status <> 'new' then
    raise exception 'WB049: this form was declined and cannot be accepted' using errcode = '23514';
  end if;

  -- A returning parent is recognised by phone number. Their existing record
  -- is left exactly as it is: an anonymous form must not be able to rewrite
  -- a known client.
  select c.id into v_client
  from public.clients c
  where c.org_id = v_sub.org_id and c.phone = v_sub.parent_phone and c.deleted_at is null;

  if v_client is null then
    insert into public.clients
      (org_id, full_name, phone, email, address, city, emergency_name, emergency_phone, consent_at, consent_source)
    values
      (v_sub.org_id, left(v_sub.parent_name, 120), v_sub.parent_phone,
       nullif(left(btrim(v_sub.payload #>> '{parent,email}'), 200), ''),
       nullif(left(btrim(v_sub.payload #>> '{parent,address}'), 200), ''),
       nullif(left(btrim(v_sub.payload #>> '{parent,city}'), 200), ''),
       nullif(left(btrim(v_sub.payload #>> '{parent,emergency_name}'), 200), ''),
       nullif(left(btrim(v_sub.payload #>> '{parent,emergency_phone}'), 200), ''),
       v_sub.consent_at, 'intake_form')
    returning id into v_client;
  end if;

  for v_pet in select * from jsonb_array_elements(v_sub.payload -> 'pets') loop
    -- Do not duplicate a pet the kennel already knows by name.
    select p.id into v_pet_id
    from public.pets p
    where p.org_id = v_sub.org_id and p.client_id = v_client and p.deleted_at is null
      and lower(p.name) = lower(left(btrim(v_pet ->> 'name'), 80));

    if v_pet_id is null then
      insert into public.pets
        (org_id, client_id, name, species, breed, sex, is_neutered, date_of_birth, weight_kg,
         food_notes, medical_notes, allergies, behaviour_notes, vet_name, vet_phone)
      values
        (v_sub.org_id, v_client, left(btrim(v_pet ->> 'name'), 80),
         case when v_pet ->> 'species' in ('dog', 'cat', 'other') then v_pet ->> 'species' else 'dog' end,
         nullif(left(btrim(v_pet ->> 'breed'), 200), ''),
         case when v_pet ->> 'sex' in ('male', 'female') then (v_pet ->> 'sex')::public.pet_sex else 'unknown' end,
         case when v_pet ->> 'is_neutered' in ('true', 'false') then (v_pet ->> 'is_neutered')::boolean end,
         public.safe_date(v_pet ->> 'date_of_birth'),
         case when v_pet ->> 'weight_kg' ~ '^[0-9]{1,3}([.][0-9]{1,2})?$' and (v_pet ->> 'weight_kg')::numeric > 0
                   and (v_pet ->> 'weight_kg')::numeric < 200
              then (v_pet ->> 'weight_kg')::numeric end,
         nullif(left(btrim(v_pet ->> 'food_notes'), 2000), ''),
         nullif(left(btrim(v_pet ->> 'medical_notes'), 2000), ''),
         nullif(left(btrim(v_pet ->> 'allergies'), 200), ''),
         nullif(left(btrim(v_pet ->> 'behaviour_notes'), 2000), ''),
         nullif(left(btrim(v_pet ->> 'vet_name'), 200), ''),
         nullif(left(btrim(v_pet ->> 'vet_phone'), 200), ''))
      returning id into v_pet_id;

      if jsonb_typeof(v_pet -> 'vaccinations') = 'array' then
        for v_vax in select * from jsonb_array_elements(v_pet -> 'vaccinations') limit 10 loop
          if char_length(btrim(coalesce(v_vax ->> 'vaccine', ''))) between 1 and 60 then
            v_given := public.safe_date(v_vax ->> 'given_on');
            v_until := public.safe_date(v_vax ->> 'valid_until');
            if v_given is not null and v_until is not null and v_until < v_given then
              v_until := null;
            end if;
            insert into public.vaccinations (org_id, pet_id, vaccine, given_on, valid_until)
            values (v_sub.org_id, v_pet_id, btrim(v_vax ->> 'vaccine'), v_given, v_until);
          end if;
        end loop;
      end if;
    end if;
  end loop;

  update public.intake_submissions s
  set status = 'accepted', client_id = v_client
  where s.id = v_sub.id;

  return v_client;
end;
$$;
comment on function public.accept_intake(uuid) is
  'Staff action: turns a new intake submission into a client and pets. A parent already known by phone number is reused and left unchanged; only pets with new names are added. Returns the client id. Creating the booking is a separate step.';

-- ---------------------------------------------------------------------------
-- Parent-facing read-only pages
-- ---------------------------------------------------------------------------

create function public.get_public_stay(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kennel', jsonb_build_object(
      'name', o.name,
      'whatsapp_phone', o.whatsapp_phone,
      'phone', o.phone,
      'check_in_time', to_char(o.check_in_time, 'HH24:MI'),
      'check_out_time', to_char(o.check_out_time, 'HH24:MI'),
      'time_zone', o.time_zone,
      'locale', o.locale
    ),
    'pet', jsonb_build_object('name', p.name, 'species', p.species, 'breed', p.breed),
    'booking', jsonb_build_object(
      'kind', b.kind,
      'status', b.status,
      'start_date', b.start_date,
      'end_date', b.end_date,
      'checked_in_at', b.checked_in_at,
      'checked_out_at', b.checked_out_at
    ),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object('at', u.created_at, 'body', u.body) order by u.created_at desc)
      from (
        select su.created_at, su.body
        from public.stay_updates su
        where su.booking_id = b.id and su.is_visible_to_parent
        order by su.created_at desc
        limit 100
      ) u
    ), '[]'::jsonb),
    'care', coalesce((
      select jsonb_agg(jsonb_build_object('date', t.task_date, 'kind', t.kind, 'done', t.done, 'total', t.total)
                       order by t.task_date desc, t.kind)
      from (
        select ct.task_date, ct.kind,
               count(*) filter (where ct.status = 'done') as done,
               count(*) filter (where ct.status <> 'skipped') as total
        from public.care_tasks ct
        where ct.booking_id = b.id
        group by ct.task_date, ct.kind
      ) t
    ), '[]'::jsonb)
  )
  from public.bookings b
  join public.organizations o on o.id = b.org_id
  join public.pets p on p.id = b.pet_id
  where char_length(p_token) = 64
    and b.public_token = p_token
    and b.status not in ('cancelled', 'no_show')
    and p.deleted_at is null
    -- The link stops working a month after the pet goes home.
    and (b.status <> 'checked_out' or b.checked_out_at > now() - interval '30 days');
$$;
comment on function public.get_public_stay(text) is
  'PUBLIC. The parent''s stay page for one booking, found by its secret token: kennel contact, pet name, dates, status, parent-visible updates and a count of care done. No notes, prices, medical details or other pets. Stops working when the booking is cancelled and 30 days after check-out.';

create function public.get_public_invoice(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'number', i.number,
    'status', i.status,
    'issued_on', i.issued_on,
    'is_tax_invoice', i.is_tax_invoice,
    'currency', i.currency,
    'seller', i.seller,
    'buyer', i.buyer,
    'place_of_supply_state_code', i.place_of_supply_state_code,
    'subtotal_minor', i.subtotal_minor,
    'discount_minor', i.discount_minor,
    'taxable_minor', i.taxable_minor,
    'cgst_minor', i.cgst_minor,
    'sgst_minor', i.sgst_minor,
    'igst_minor', i.igst_minor,
    'tax_minor', i.tax_minor,
    'round_off_minor', i.round_off_minor,
    'total_minor', i.total_minor,
    'paid_minor', coalesce((
      select sum(case when pay.direction = 'in' then pay.amount_minor else -pay.amount_minor end)
      from public.payments pay where pay.invoice_id = i.id
    ), 0),
    'notes', i.notes,
    -- Where to pay is the copy frozen on the invoice when it was issued, so a
    -- later change to the kennel's settings cannot redirect an open bill.
    'upi', case when i.seller ->> 'upi_vpa' is not null
                then jsonb_build_object('vpa', i.seller ->> 'upi_vpa', 'payee_name', i.seller ->> 'upi_payee_name') end,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', l.description, 'sac_code', l.sac_code, 'quantity', l.quantity,
        'unit_price_minor', l.unit_price_minor, 'discount_minor', l.discount_minor,
        'taxable_minor', l.taxable_minor, 'tax_rate_bp', l.tax_rate_bp,
        'cgst_minor', l.cgst_minor, 'sgst_minor', l.sgst_minor, 'igst_minor', l.igst_minor,
        'tax_minor', l.tax_minor, 'total_minor', l.total_minor
      ) order by l.sort_order, l.created_at)
      from public.invoice_lines l where l.invoice_id = i.id
    ), '[]'::jsonb)
  )
  from public.invoices i
  where char_length(p_token) = 64
    and i.public_token = p_token
    and i.status in ('issued', 'void');
$$;
comment on function public.get_public_invoice(text) is
  'PUBLIC. One issued (or voided) invoice, found by its secret token, with its lines, what has been paid, and the kennel''s UPI details for a pay link. Drafts are never shown.';
