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
  upload_token text not null default public.new_token(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete set null (client_id)
);

comment on table public.intake_submissions is
  'What a parent typed into the public intake form, kept exactly as sent until staff accept it. Nothing here is trusted until a person has reviewed it.';
comment on column public.intake_submissions.payload is
  'The whole form as JSON (version 1): {v, parent:{name,phone,email,address,area,postal_code,city,emergency_name,emergency_phone}, pets:[{name,species,breed,sex,is_neutered,date_of_birth,weight_kg,food_notes,medical_notes,allergies,behaviour_notes,vet_name,vet_phone,dewormed_on,tick_treated_on,vaccinations:[{vaccine,given_on,valid_until}]}], stay:{kind,start_date,end_date,notes}, request:{make,service_id,time,pickup,vaccinations_ok} from the booking form for new parents (M41), consent}.';
comment on column public.intake_submissions.consent_text is 'The exact consent wording the parent agreed to, kept as evidence.';
comment on column public.intake_submissions.client_id is 'The client created or matched when the submission was accepted.';
comment on column public.intake_submissions.upload_token is
  'Secret returned to whoever sent the form, so the same visitor can add a vaccination certificate per pet within the hour (intake_upload_allowed). Useless after that.';

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

create function public.default_intake_notice(p_org_name text, p_language text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- The parent agrees to the words they read, so the words stored with their
  -- consent are the ones shown, in the same language. The Hindi and Kannada
  -- versions are drafts until a native speaker has checked them (docs/HANDOFF.md).
  select case p_language
    when 'hi' then
      'मैं सहमत हूँ कि ' || p_org_name || ' इस फ़ॉर्म में दी गई जानकारी को मेरे पालतू जानवर की देखभाल के लिए, '
      || 'ठहरने के बारे में मुझसे संपर्क करने के लिए, और क़ानून के अनुसार ज़रूरी रिकॉर्ड रखने के लिए सहेज और इस्तेमाल कर सकता है। '
      || 'मैं कभी भी ' || p_org_name || ' से अपनी जानकारी ठीक करने या हटाने के लिए कह सकता या सकती हूँ।'
    when 'kn' then
      'ನನ್ನ ಸಾಕುಪ್ರಾಣಿಯನ್ನು ನೋಡಿಕೊಳ್ಳಲು, ವಾಸ್ತವ್ಯದ ಬಗ್ಗೆ ನನ್ನನ್ನು ಸಂಪರ್ಕಿಸಲು ಮತ್ತು ಕಾನೂನು ಕೇಳುವ ದಾಖಲೆಗಳನ್ನು ಇಡಲು '
      || 'ಈ ಫಾರ್ಮ್‌ನಲ್ಲಿರುವ ವಿವರಗಳನ್ನು ' || p_org_name || ' ಉಳಿಸಿಕೊಳ್ಳಲು ಮತ್ತು ಬಳಸಲು ನಾನು ಒಪ್ಪುತ್ತೇನೆ. '
      || 'ನನ್ನ ವಿವರಗಳನ್ನು ಸರಿಪಡಿಸಲು ಅಥವಾ ಅಳಿಸಲು ನಾನು ಯಾವಾಗ ಬೇಕಾದರೂ ' || p_org_name || ' ಅನ್ನು ಕೇಳಬಹುದು.'
    else
      'I agree that ' || p_org_name || ' may store and use the details in this form to care for my pet, '
      || 'to contact me about the stay, and to keep the records the law requires. '
      || 'I can ask ' || p_org_name || ' to correct or delete my details at any time.'
  end;
$$;
comment on function public.default_intake_notice(text, text) is
  'Consent wording used when an organisation has not written its own, in the parent pages'' language (en, hi or kn; anything else gives English).';

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
    'language', o.parent_language,
    'delivers', o.offers_food_delivery,
    'notice', coalesce(nullif(btrim(o.intake_notice), ''), public.default_intake_notice(o.name, o.parent_language)),
    -- For the booking form's estimate (M41): the usual prices, nothing private.
    'currency', o.currency,
    'locale', o.locale,
    'prices', jsonb_build_object(
      'boarding', (select s.price_minor from public.services s where s.org_id = o.id and s.kind = 'boarding' and s.is_default and s.is_active limit 1),
      'daycare', (select s.price_minor from public.services s where s.org_id = o.id and s.kind = 'daycare' and s.is_default and s.is_active limit 1)
    ),
    'services', case when o.offers_appointments then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'name', s.name, 'minutes', s.minutes,
        'price_minor', case when s.pricing = 'quote' then null else s.price_minor end,
        'from', s.pricing in ('by_size', 'by_coat')
      ) order by s.kind, s.sort_order, s.name)
      from public.appointment_services s
      where s.org_id = o.id and s.is_active and not s.is_addon
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.organizations o
  where o.slug = lower(btrim(p_slug));
$$;
comment on function public.get_public_intake_form(text) is
  'PUBLIC. What the intake form and the booking form for new parents (M41) need to show for a kennel: its name, city, WhatsApp number, usual times, consent wording, whether it delivers (so the form asks for an address with a PIN code), its usual boarding and day boarding prices, and the appointment services it offers with their prices (empty when on quote; "from" when they depend on the dog), for an estimate.';

create function public.submit_intake(p_slug text, p_payload jsonb)
returns jsonb
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
  v_id uuid;
  v_token text;
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
     coalesce(nullif(btrim(v_org.intake_notice), ''), public.default_intake_notice(v_org.name, v_org.parent_language)))
  returning id, upload_token into v_id, v_token;

  -- What the sender needs to add certificates: the folder for them, and the
  -- secret that proves they sent this form.
  return jsonb_build_object('folder', v_org.id || '/intake/' || v_id, 'upload_token', v_token);
end;
$$;
comment on function public.submit_intake(text, jsonb) is
  'PUBLIC. Receives the intake form. Validates shape and size, records consent, and stores the submission for staff to review. Never creates clients or bookings by itself. Returns {folder, upload_token}: the folder ({org_id}/intake/{submission_id}) for certificates, and the secret that lets this sender put one per pet there within the hour (intake_upload_allowed).';

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
  v_index integer := 0;
  v_certificate text;
  v_certificate2 text;
  v_vax_index bigint;
  v_weight numeric;
  v_postal text;
  v_sent_on date;
  v_pets uuid[] := '{}';
  v_org public.organizations;
  v_kind public.booking_kind;
  v_start date;
  v_end date;
  v_service public.services;
  v_group uuid;
  v_appt public.appointment_services;
  v_time time;
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

  -- The day the form was sent, at the kennel: the day its weights were taken.
  select (v_sub.created_at at time zone o.time_zone)::date,
         -- A PIN code in India is six digits; elsewhere a postal code has at least one digit.
         case when o.country_code = 'IN' then '^[1-9][0-9]{5}$' else '^(?=.*[0-9])[A-Z0-9][A-Z0-9 -]{1,8}[A-Z0-9]$' end
    into v_sent_on, v_postal
  from public.organizations o where o.id = v_sub.org_id;
  v_postal := case when upper(btrim(coalesce(v_sub.payload #>> '{parent,postal_code}', ''))) ~ v_postal
                   then upper(btrim(v_sub.payload #>> '{parent,postal_code}')) end;

  if v_client is null then
    insert into public.clients
      (org_id, full_name, phone, email, address, city, postal_code, emergency_name, emergency_phone, consent_at, consent_source)
    values
      (v_sub.org_id, left(v_sub.parent_name, 120), v_sub.parent_phone,
       nullif(left(btrim(v_sub.payload #>> '{parent,email}'), 200), ''),
       nullif(left(btrim(v_sub.payload #>> '{parent,address}'), 200), ''),
       nullif(left(btrim(v_sub.payload #>> '{parent,city}'), 200), ''),
       v_postal,
       nullif(left(btrim(v_sub.payload #>> '{parent,emergency_name}'), 200), ''),
       nullif(left(btrim(v_sub.payload #>> '{parent,emergency_phone}'), 200), ''),
       v_sub.consent_at, 'intake_form')
    returning id into v_client;

    -- A new parent who gave an address with a PIN code has a home to deliver
    -- to. A known parent's addresses are left alone, as their record is.
    if v_postal is not null and nullif(btrim(v_sub.payload #>> '{parent,address}'), '') is not null then
      insert into public.client_addresses (org_id, client_id, kind, line, area, postal_code)
      values (v_sub.org_id, v_client, 'home', left(btrim(v_sub.payload #>> '{parent,address}'), 300),
              nullif(left(btrim(v_sub.payload #>> '{parent,area}'), 120), ''), v_postal);
    end if;
  end if;

  for v_pet in select * from jsonb_array_elements(v_sub.payload -> 'pets') loop
    v_index := v_index + 1;
    -- Do not duplicate a pet the kennel already knows by name.
    select p.id into v_pet_id
    from public.pets p
    where p.org_id = v_sub.org_id and p.client_id = v_client and p.deleted_at is null
      and lower(p.name) = lower(left(btrim(v_pet ->> 'name'), 80));

    if v_pet_id is not null then
      v_pets := v_pets || v_pet_id;
    else
      insert into public.pets
        (org_id, client_id, name, species, breed, sex, is_neutered, date_of_birth,
         food_notes, medical_notes, allergies, behaviour_notes, vet_name, vet_phone, dewormed_on, tick_treated_on)
      values
        (v_sub.org_id, v_client, left(btrim(v_pet ->> 'name'), 80),
         case when v_pet ->> 'species' in ('dog', 'cat', 'other') then v_pet ->> 'species' else 'dog' end,
         nullif(left(btrim(v_pet ->> 'breed'), 200), ''),
         case when v_pet ->> 'sex' in ('male', 'female') then (v_pet ->> 'sex')::public.pet_sex else 'unknown' end,
         case when v_pet ->> 'is_neutered' in ('true', 'false') then (v_pet ->> 'is_neutered')::boolean end,
         public.safe_date(v_pet ->> 'date_of_birth'),
         nullif(left(btrim(v_pet ->> 'food_notes'), 2000), ''),
         nullif(left(btrim(v_pet ->> 'medical_notes'), 2000), ''),
         nullif(left(btrim(v_pet ->> 'allergies'), 200), ''),
         nullif(left(btrim(v_pet ->> 'behaviour_notes'), 2000), ''),
         nullif(left(btrim(v_pet ->> 'vet_name'), 200), ''),
         nullif(left(btrim(v_pet ->> 'vet_phone'), 200), ''),
         case when public.safe_date(v_pet ->> 'dewormed_on') <= v_sent_on then public.safe_date(v_pet ->> 'dewormed_on') end,
         case when public.safe_date(v_pet ->> 'tick_treated_on') <= v_sent_on then public.safe_date(v_pet ->> 'tick_treated_on') end)
      returning id into v_pet_id;
      v_pets := v_pets || v_pet_id;

      -- The weight the parent gave, in kilos with up to two decimals, as the
      -- pet's first weighing.
      v_weight := case when v_pet ->> 'weight_kg' ~ '^[0-9]{1,3}([.][0-9]{1,2})?$'
                       then (v_pet ->> 'weight_kg')::numeric end;
      if v_weight > 0 and v_weight < 200 then
        insert into public.pet_weights (org_id, pet_id, weighed_on, weight_g, notes)
        values (v_sub.org_id, v_pet_id, v_sent_on, round(v_weight * 1000)::integer, null);
      end if;

      -- The certificates the parent sent for this pet: pet-N for its first
      -- vaccine and pet-N-2 for its second. A vaccine with no card of its own
      -- gets the first one. Read as the staff member, so storage policies apply.
      select o.name into v_certificate
      from storage.objects o
      where o.bucket_id = 'pet-media' and o.name = v_sub.org_id || '/intake/' || v_sub.id || '/pet-' || v_index;
      select o.name into v_certificate2
      from storage.objects o
      where o.bucket_id = 'pet-media' and o.name = v_sub.org_id || '/intake/' || v_sub.id || '/pet-' || v_index || '-2';

      if jsonb_typeof(v_pet -> 'vaccinations') = 'array' then
        for v_vax, v_vax_index in select * from jsonb_array_elements(v_pet -> 'vaccinations') with ordinality limit 10 loop
          if char_length(btrim(coalesce(v_vax ->> 'vaccine', ''))) between 1 and 60 then
            v_given := public.safe_date(v_vax ->> 'given_on');
            v_until := public.safe_date(v_vax ->> 'valid_until');
            if v_given is not null and v_until is not null and v_until < v_given then
              v_until := null;
            end if;
            insert into public.vaccinations (org_id, pet_id, vaccine, given_on, valid_until, certificate_path)
            values (v_sub.org_id, v_pet_id, btrim(v_vax ->> 'vaccine'), v_given, v_until,
                    case when v_vax_index = 2 then coalesce(v_certificate2, v_certificate) else v_certificate end);
          end if;
        end loop;
      end if;
    end if;
  end loop;

  -- The booking form for new parents (M41) asks for a stay or an appointment:
  -- it becomes a request staff confirm as any other, at the usual price. One
  -- the kennel cannot take as asked (no price, outside hours, a pet already
  -- booked) is left for staff to book by hand; the parent and pets are made.
  if (v_sub.payload #>> '{request,make}') = 'true' and cardinality(v_pets) > 0 then
    select * into v_org from public.organizations o where o.id = v_sub.org_id;
    v_start := public.safe_date(v_sub.payload #>> '{stay,start_date}');
    v_end := coalesce(public.safe_date(v_sub.payload #>> '{stay,end_date}'), v_start);
    begin
      if (v_sub.payload #>> '{request,service_id}') ~ '^[0-9a-f-]{36}$' then
        select * into v_appt from public.appointment_services s
        where s.org_id = v_sub.org_id and s.id = (v_sub.payload #>> '{request,service_id}')::uuid and s.is_active and not s.is_addon;
        v_time := case when (v_sub.payload #>> '{request,time}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (v_sub.payload #>> '{request,time}')::time end;
        if v_appt.id is not null and v_start is not null and v_time is not null and v_start >= v_sent_on then
          insert into public.appointments (org_id, client_id, pet_id, service_id, status, starts_at, ends_at, notes)
          select v_sub.org_id, v_client, p, v_appt.id, 'requested',
                 (v_start + v_time) at time zone v_org.time_zone,
                 ((v_start + v_time) at time zone v_org.time_zone) + make_interval(mins => v_appt.minutes),
                 'Asked for on the booking form'
          from unnest(v_pets[1:1]) p;
        end if;
      elsif v_start is not null and v_start >= v_sent_on and v_end >= v_start then
        v_kind := case when v_sub.payload #>> '{stay,kind}' = 'daycare' then 'daycare' else 'boarding' end;
        if v_kind = 'boarding' and v_end = v_start then
          v_end := v_start + 1;
        end if;
        select * into v_service from public.services s
        where s.org_id = v_sub.org_id and s.kind::text = v_kind::text and s.is_default and s.is_active limit 1;
        if v_service.id is not null then
          v_group := case when cardinality(v_pets) > 1 then gen_random_uuid() end;
          insert into public.bookings (org_id, client_id, pet_id, kind, status, start_date, end_date, rate_minor, tax_rate_bp, sac_code, source, group_id, notes)
          select v_sub.org_id, v_client, p, v_kind, 'requested', v_start, v_end, v_service.price_minor,
                 case when v_org.tax_mode = 'none' then 0 else coalesce(v_service.tax_rate_bp, v_org.default_tax_rate_bp) end,
                 v_service.sac_code, 'intake', v_group,
                 nullif(concat_ws(E'\n',
                   case when (v_sub.payload #>> '{request,pickup}') = 'true' then 'Asked for pick-up from home' end,
                   nullif(left(btrim(v_sub.payload #>> '{stay,notes}'), 500), '')), '')
          from unnest(v_pets) p;
        end if;
      end if;
    exception when others then
      -- Left for staff to book by hand.
      null;
    end;
  end if;

  update public.intake_submissions s
  set status = 'accepted', client_id = v_client
  where s.id = v_sub.id;

  return v_client;
end;
$$;
comment on function public.accept_intake(uuid) is
  'Staff action: turns a new intake submission into a client and pets. A parent already known by phone number is reused and left unchanged; only pets with new names are added, each with the vaccinations the parent listed and the certificate they sent for it, if any, and the weight they gave as its first weighing. A new parent who gave an address with a PIN code gets it as their home address. A form from the booking form for new parents (M41, payload.request.make) also makes its request: a stay at the usual price for each pet, or an appointment for the first, left for staff to book by hand when the kennel cannot take it as asked. Returns the client id.';

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
      'locale', o.locale,
      'language', o.parent_language
    ),
    'pet', jsonb_build_object('name', p.name, 'species', p.species, 'breed', p.breed, 'photo', p.photo_path),
    'booking', jsonb_build_object(
      'kind', b.kind,
      'status', b.status,
      'start_date', b.start_date,
      'end_date', b.end_date,
      'checked_in_at', b.checked_in_at,
      'checked_out_at', b.checked_out_at
    ),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object('at', u.created_at, 'body', u.body, 'photos', u.media_paths) order by u.created_at desc)
      from (
        select su.created_at, su.body, su.media_paths
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
    ), '[]'::jsonb),
    -- The stay report (M53), once the pet has gone home: what staff added, and
    -- the records it is worked out from (stayReport() in src/lib/core).
    'report', case when b.status = 'checked_out' then jsonb_build_object(
      'words', (select r.words from public.stay_reports r where r.booking_id = b.id),
      'photos', coalesce((select to_jsonb(r.photo_paths) from public.stay_reports r where r.booking_id = b.id), '[]'::jsonb),
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object('kind', ct.kind, 'label', ct.label, 'status', ct.status) order by ct.task_date, ct.due_time)
        from public.care_tasks ct
        where ct.booking_id = b.id and ct.kind in ('meal', 'medication')
      ), '[]'::jsonb),
      'play', (select count(*) from public.play_sessions ps where ps.booking_id = b.id and ps.status = 'done'),
      'weights', coalesce((
        select jsonb_agg(jsonb_build_object('on', w.weighed_on, 'grams', w.weight_g) order by w.weighed_on, w.created_at)
        from public.pet_weights w
        where w.org_id = b.org_id and w.pet_id = b.pet_id and w.weighed_on between b.start_date - 30 and b.end_date
      ), '[]'::jsonb),
      'incidents', coalesce((
        select jsonb_agg(jsonb_build_object('on', (i.occurred_at at time zone o.time_zone)::date, 'category', i.category) order by i.occurred_at)
        from public.incidents i
        where i.booking_id = b.id and i.parent_notified_at is not null
      ), '[]'::jsonb)
    ) end
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
  'PUBLIC. The parent''s stay page for one booking, found by its secret token: kennel contact, pet name and photo path, dates, status, parent-visible updates with their photo paths, a count of care done, and once the pet has gone home the stay report (M53): the kennel''s words and picked photos, meals and medicines by label and whether done, play sessions done, weighings around the stay, and the kinds of incident the parent was told of. No notes, prices, incident accounts or other pets. Stops working when the booking is cancelled and 30 days after check-out. The photos themselves are fetched through Storage with the same token (stay_media_visible).';

create function public.get_public_invoice(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    -- Bills are in English; a parent who asked sees the headings in their language too.
    'translation', c.bill_translation,
    'locale', o.locale,
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
    -- Credit notes against the bill, each a document the parent can print.
    'credit_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', cn.number, 'issued_on', cn.issued_on, 'reason', cn.reason,
        'subtotal_minor', cn.subtotal_minor, 'discount_minor', cn.discount_minor, 'taxable_minor', cn.taxable_minor,
        'cgst_minor', cn.cgst_minor, 'sgst_minor', cn.sgst_minor, 'igst_minor', cn.igst_minor, 'tax_minor', cn.tax_minor,
        'round_off_minor', cn.round_off_minor, 'total_minor', cn.total_minor,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'description', l.description, 'sac_code', l.sac_code, 'quantity', l.quantity,
            'unit_price_minor', l.unit_price_minor, 'discount_minor', l.discount_minor,
            'taxable_minor', l.taxable_minor, 'tax_rate_bp', l.tax_rate_bp,
            'cgst_minor', l.cgst_minor, 'sgst_minor', l.sgst_minor, 'igst_minor', l.igst_minor,
            'tax_minor', l.tax_minor, 'total_minor', l.total_minor
          ) order by l.sort_order)
          from public.credit_note_lines l where l.credit_note_id = cn.id
        ), '[]'::jsonb)
      ) order by cn.seq)
      from public.credit_notes cn where cn.org_id = i.org_id and cn.invoice_id = i.id
    ), '[]'::jsonb),
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
  join public.organizations o on o.id = i.org_id
  left join public.clients c on c.org_id = i.org_id and c.id = i.client_id
  where char_length(p_token) = 64
    and i.public_token = p_token
    and i.status in ('issued', 'void');
$$;
comment on function public.get_public_invoice(text) is
  'PUBLIC. One issued (or voided) invoice, found by its secret token, with its lines, what has been paid, its credit notes with their lines, the kennel''s UPI details for a pay link, and the language the parent asked for alongside English (clients.bill_translation). Drafts are never shown.';

-- ---------------------------------------------------------------------------
-- A parent asks for a stay, through their own booking link (/b/{token})
--
-- The kennel sends a known parent their link. The parent picks pets and
-- dates, and each pet becomes a booking with status 'requested': it holds no
-- kennel until staff confirm it, so a request can never take a kennel away
-- from anyone. Priced from the kennel's usual prices; staff adjust as usual.
-- ---------------------------------------------------------------------------

create function public.get_public_booking_form(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kennel', jsonb_build_object(
      'name', o.name,
      'whatsapp_phone', coalesce(o.whatsapp_phone, o.phone),
      'check_in_time', o.check_in_time,
      'check_out_time', o.check_out_time,
      'language', o.parent_language,
      'locale', o.locale
    ),
    'enabled', o.requests_enabled,
    'parent', split_part(btrim(c.full_name), ' ', 1),
    'today', (now() at time zone o.time_zone)::date,
    'pets', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
      from public.pets p
      where p.org_id = c.org_id and p.client_id = c.id and p.deleted_at is null and p.passed_away_on is null
    ), '[]'::jsonb),
    -- Kinds of stay the kennel has a usual price for, so a request can be priced.
    'kinds', coalesce((
      select jsonb_agg(distinct s.kind::text)
      from public.services s
      where s.org_id = o.id and s.is_default and s.is_active and s.kind in ('boarding', 'daycare')
    ), '[]'::jsonb),
    -- What is already asked for or booked, so the parent does not ask twice.
    'stays', coalesce((
      select jsonb_agg(jsonb_build_object('pet', p.name, 'kind', b.kind, 'start_date', b.start_date, 'end_date', b.end_date, 'status', b.status)
                       order by b.start_date, p.name)
      from public.bookings b
      join public.pets p on p.org_id = b.org_id and p.id = b.pet_id
      where b.org_id = c.org_id and b.client_id = c.id
        and b.status in ('requested', 'confirmed', 'checked_in')
        and b.end_date >= (now() at time zone o.time_zone)::date
    ), '[]'::jsonb),
    'food_cutoff_hours', o.food_cutoff_hours,
    -- Their food, when the kennel delivers: what they may pause, skip or add to (M32).
    'food', case when o.offers_food_delivery then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'pet', p.name, 'weekdays', s.weekdays, 'slot', s.slot, 'grams_per_day', s.grams_per_day,
        'paused_from', s.paused_from, 'paused_until', s.paused_until,
        'next', (select jsonb_agg(jsonb_build_object('date', d.delivery_date, 'status', d.status) order by d.delivery_date)
                 from (select d2.delivery_date, d2.status from public.deliveries d2
                       where d2.org_id = s.org_id and d2.subscription_id = s.id and d2.status <> 'cancelled'
                         and d2.delivery_date >= (now() at time zone o.time_zone)::date
                       order by d2.delivery_date limit 6) d)
      ) order by p.name)
      from public.subscriptions s
      join public.pets p on p.org_id = s.org_id and p.id = s.pet_id
      where s.org_id = c.org_id and s.client_id = c.id and s.cancelled_on is null
    ), '[]'::jsonb) end
  )
  from public.clients c
  join public.organizations o on o.id = c.org_id
  where char_length(p_token) = 64
    and c.request_token = p_token
    and c.deleted_at is null
    and c.erased_at is null;
$$;
comment on function public.get_public_booking_form(text) is
  'PUBLIC. The parent''s own booking link: the kennel''s name, WhatsApp number and usual times, the parent''s first name, their pets'' names, which kinds of stay can be asked for, their stays already asked for or booked (dates and status only), and, when the kennel delivers food, their subscriptions with the next deliveries. Nothing for a hidden or erased parent.';

create function public.submit_booking_request(p_token text, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients;
  v_org public.organizations;
  v_today date;
  v_kind public.booking_kind;
  v_start date;
  v_end date;
  v_note text;
  v_pets uuid[];
  v_service public.services;
  v_group uuid;
begin
  -- SECURITY DEFINER: the anonymous role has no access to any table. The
  -- secret link is the parent's key; everything they send is checked here.
  select * into v_client from public.clients c
  where char_length(p_token) = 64 and c.request_token = p_token and c.deleted_at is null and c.erased_at is null;
  if v_client.id is null then
    raise exception 'WB100: this link is not taking requests' using errcode = 'P0002';
  end if;
  select * into v_org from public.organizations o where o.id = v_client.org_id;
  if not v_org.requests_enabled then
    raise exception 'WB100: this link is not taking requests' using errcode = 'P0002';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 5000
     or jsonb_typeof(p_payload -> 'pet_ids') is distinct from 'array' then
    raise exception 'WB101: the request could not be read' using errcode = '22023';
  end if;

  v_today := (now() at time zone v_org.time_zone)::date;
  v_kind := case p_payload ->> 'kind' when 'daycare' then 'daycare'::public.booking_kind else 'boarding'::public.booking_kind end;
  v_start := public.safe_date(p_payload ->> 'start_date');
  v_end := coalesce(public.safe_date(p_payload ->> 'end_date'), case when v_kind = 'daycare' then v_start end);
  if v_start is null or v_end is null or v_start < v_today or v_start > v_today + 365 or v_end < v_start
     or v_end - v_start > 90 or (v_kind = 'boarding' and v_end = v_start) then
    raise exception 'WB103: those dates cannot be asked for. Check them and try again.' using errcode = '22023';
  end if;

  -- Only this parent's own pets, shown in lists, at most six.
  select coalesce(array_agg(distinct p.id), '{}') into v_pets
  from public.pets p
  where p.org_id = v_client.org_id and p.client_id = v_client.id and p.deleted_at is null and p.passed_away_on is null
    and p.id::text in (select jsonb_array_elements_text(p_payload -> 'pet_ids'));
  if cardinality(v_pets) = 0 or cardinality(v_pets) > 6
     or cardinality(v_pets) <> jsonb_array_length(p_payload -> 'pet_ids') then
    raise exception 'WB102: choose one or more of your pets' using errcode = '22023';
  end if;

  select * into v_service from public.services s
  where s.org_id = v_org.id and s.kind::text = v_kind::text and s.is_default and s.is_active;
  if v_service.id is null then
    raise exception 'WB104: the kennel is not taking requests for that kind of stay' using errcode = '22023';
  end if;

  -- A request is a few taps; a flood is something else.
  if (select count(*) from public.bookings b
      where b.org_id = v_org.id and b.client_id = v_client.id and b.source = 'parent'
        and b.created_at > now() - interval '1 day') + cardinality(v_pets) > 12 then
    raise exception 'WB105: that is a lot of requests for one day. The kennel will be in touch.' using errcode = '54000';
  end if;

  v_note := nullif(left(btrim(coalesce(p_payload ->> 'note', '')), 1000), '');
  v_group := case when cardinality(v_pets) > 1 then gen_random_uuid() end;
  insert into public.bookings (org_id, client_id, pet_id, kind, status, start_date, end_date, rate_minor, tax_rate_bp, sac_code, notes, source, group_id)
  select v_org.id, v_client.id, pid, v_kind, 'requested', v_start, v_end, v_service.price_minor,
         case when v_org.tax_mode = 'none' then 0 else coalesce(v_service.tax_rate_bp, v_org.default_tax_rate_bp) end,
         v_service.sac_code, v_note, 'parent', v_group
  from unnest(v_pets) as pid;
  return cardinality(v_pets);
end;
$$;
comment on function public.submit_booking_request(text, jsonb) is
  'PUBLIC. A parent asks for a stay through their booking link: each chosen pet becomes a booking requested at the kennel''s usual price, holding no kennel until staff confirm it. Refused when requests are off or the link is unknown (WB100), for a malformed request (WB101), pets not theirs (WB102), dates in the past, more than a year ahead or over 90 days long (WB103), a kind of stay with no usual price (WB104), and more than 12 requested pets in a day (WB105).';

-- A new link for a parent: the old one stops working. Any member may do it.
create function public.renew_request_link(p_client uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  -- SECURITY DEFINER: the link token is not writable through the API, so a
  -- member cannot choose one; it is made here. Membership is checked here.
  update public.clients c set request_token = public.new_token()
  where c.id = p_client and c.org_id in (select public.my_org_ids()) and c.erased_at is null
  returning c.request_token into v_token;
  if v_token is null then
    raise exception 'WB003: parent not found' using errcode = 'P0002';
  end if;
  return v_token;
end;
$$;
comment on function public.renew_request_link(uuid) is
  'Gives a parent a new booking link and returns its token; the old link stops working. Any member of the parent''s kennel.';

-- ---------------------------------------------------------------------------
-- Ordering food from the kennel's website (/f/{slug}, M32), and a known
-- parent's changes to their food from their own link (/b/{token}).
--
-- An order holds nothing and charges nothing by itself. It is kept as
-- "waiting for your area" when the PIN code is not served, or waits for the
-- parent's UPI payment; staff confirm it once the money has arrived, which
-- makes or matches the parent (by phone), the pet and the subscription.
-- ---------------------------------------------------------------------------

create type public.food_order_kind as enum ('trial', 'subscription', 'pause', 'skip', 'more');
comment on type public.food_order_kind is
  'trial, subscription: an order from the website order page. pause, skip, more: a known parent''s change to their food from their own link (pause for some days, skip one delivery, an extra order).';

create type public.food_order_status as enum ('waiting_area', 'unpaid', 'paid', 'requested', 'confirmed', 'declined');
comment on type public.food_order_status is
  'waiting_area: the PIN code is not served yet; nothing was charged. unpaid: waiting for the parent''s UPI payment. paid: the parent says they have paid; staff check the money arrived. requested: a known parent''s change, for staff to make. confirmed: made into a subscription, a trial or a change. declined: not taken.';

create table public.food_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  public_token text not null unique default public.new_token(),
  kind public.food_order_kind not null,
  status public.food_order_status not null,
  client_id uuid,
  subscription_id uuid,
  parent_name text check (parent_name is null or char_length(parent_name) between 1 and 120),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  pet_name text check (pet_name is null or char_length(pet_name) between 1 and 80),
  weight_g integer check (weight_g is null or weight_g between 1 and 199999),
  plan public.food_plan,
  grams_per_day integer check (grams_per_day is null or grams_per_day between 10 and 5000),
  weekdays smallint[] check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])),
  slot public.delivery_slot,
  line text check (line is null or char_length(line) <= 300),
  area text check (area is null or char_length(area) <= 120),
  postal_code text check (postal_code is null or char_length(postal_code) <= 10),
  door_note text check (door_note is null or char_length(door_note) <= 300),
  starts_on date,
  until_date date,
  grams integer check (grams is null or grams between 10 and 20000),
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  note text check (note is null or char_length(note) <= 1000),
  consent_text text,
  paid_claimed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete set null (client_id),
  foreign key (org_id, subscription_id) references public.subscriptions (org_id, id) on delete set null (subscription_id)
);

comment on table public.food_orders is
  'Food asked for from outside: an order from the website order page (a trial or a subscription), or a known parent''s change from their own link (pause, skip, more). Written only by submit_food_order() and submit_food_request(); staff confirm or decline it.';
comment on column public.food_orders.public_token is 'Secret in the order''s page after it is sent, so the parent can say they have paid (food_order_paid).';
comment on column public.food_orders.client_id is 'The parent: known from their link, or matched or made by phone when staff confirm a website order.';
comment on column public.food_orders.subscription_id is 'The subscription a change is for, or the one a confirmed order made.';
comment on column public.food_orders.grams_per_day is 'The portion worked out on the order page from the dog''s weight; staff may change it after confirming.';
comment on column public.food_orders.starts_on is 'Website orders: the first delivery day asked for. Changes: the first day of a pause, or the delivery to skip.';
comment on column public.food_orders.until_date is 'A pause: the last day of it. Empty: until the parent says.';
comment on column public.food_orders.grams is 'More: how much extra food, in grams.';
comment on column public.food_orders.amount_minor is 'What the order page asked the parent to pay: the trial, or the first week ahead, with delivery. Worked out by the database.';
comment on column public.food_orders.consent_text is 'The consent wording the parent agreed to, in the language they read it.';
comment on column public.food_orders.paid_claimed_at is 'When the parent said they had paid. Staff check the money before confirming.';

create index food_orders_org_status_idx on public.food_orders (org_id, status, created_at desc);

create function public.food_orders_stamp_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;
comment on function public.food_orders_stamp_review() is 'Trigger: who confirmed or declined an order, and when, recorded by the database.';

create trigger food_orders_stamp_review
  before update of status on public.food_orders
  for each row execute function public.food_orders_stamp_review();

create function public.get_public_food_form(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kennel', jsonb_build_object(
      'name', o.name, 'whatsapp_phone', coalesce(o.whatsapp_phone, o.phone), 'language', o.parent_language, 'locale', o.locale,
      'currency', o.currency, 'country_code', o.country_code, 'upi_vpa', o.upi_vpa, 'upi_payee_name', coalesce(o.upi_payee_name, o.name),
      'notice', coalesce(nullif(btrim(o.intake_notice), ''), public.default_intake_notice(o.name, o.parent_language))
    ),
    'today', (now() at time zone o.time_zone)::date,
    'cutoff_hours', o.food_cutoff_hours,
    'pack_g', o.food_pack_g,
    'portions', jsonb_build_object(
      'portion_small_bp', o.portion_small_bp, 'portion_medium_bp', o.portion_medium_bp, 'portion_large_bp', o.portion_large_bp,
      'small_dog_max_g', o.small_dog_max_g, 'medium_dog_max_g', o.medium_dog_max_g, 'topper_share_bp', o.topper_share_bp,
      'goal_change_bp', o.goal_change_bp
    ),
    'trial', (select jsonb_build_object('name', p.name, 'price_minor', p.price_minor, 'grams', p.trial_grams)
              from public.food_products p where p.org_id = o.id and p.kind = 'trial' and p.is_active order by p.created_at limit 1),
    'subscription', (select jsonb_build_object('name', p.name, 'price_per_kg_minor', p.price_minor)
                     from public.food_products p where p.org_id = o.id and p.kind = 'subscription' and p.is_active order by p.created_at limit 1),
    'areas', coalesce((select jsonb_agg(jsonb_build_object('postal_code', a.postal_code, 'name', a.name, 'charge_minor', coalesce(a.delivery_charge_minor, 0)) order by a.postal_code)
                       from public.service_areas a where a.org_id = o.id), '[]'::jsonb)
  )
  from public.organizations o
  where o.slug = lower(btrim(p_slug)) and o.offers_food_delivery and o.food_orders_enabled;
$$;
comment on function public.get_public_food_form(text) is
  'PUBLIC. What the food order page needs: the kennel''s name and UPI details, the consent wording, the trial and subscription food with their prices, the kennel''s portion settings and pack size, and the PIN codes it delivers to with their charges. Nothing unless the kennel delivers food and takes orders.';

-- The first day a delivery can be asked for: the first day whose morning
-- slot is still before the cut-off.
create function public.first_delivery_day(p_org uuid, p_weekdays smallint[] default null)
returns date
language sql
stable
set search_path = ''
as $$
  select min(d::date)
  from public.organizations o, generate_series((now() at time zone o.time_zone)::date, (now() at time zone o.time_zone)::date + 14, interval '1 day') d
  where o.id = p_org
    and now() < public.delivery_cutoff(o.id, d::date, 'morning')
    and (p_weekdays is null or extract(isodow from d)::smallint = any (p_weekdays));
$$;
comment on function public.first_delivery_day(uuid, smallint[]) is 'The first day, on one of the given weekdays, whose morning delivery is still before its cut-off.';

create function public.submit_food_order(p_slug text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_kind public.food_order_kind;
  v_phone text;
  v_name text;
  v_pet text;
  v_weight integer;
  v_grams integer;
  v_days smallint[];
  v_postal text;
  v_line text;
  v_charge bigint;
  v_served boolean;
  v_amount bigint;
  v_start date;
  v_trial public.food_products;
  v_sub public.food_products;
  v_order public.food_orders;
begin
  -- SECURITY DEFINER: the anonymous role reaches no table. Everything sent
  -- from the public internet is checked here, and the price is worked out
  -- here, never taken from the page.
  select * into v_org from public.organizations o where o.slug = lower(btrim(p_slug)) and o.offers_food_delivery and o.food_orders_enabled;
  if v_org.id is null then
    raise exception 'WB180: this kennel is not taking food orders here' using errcode = 'P0002';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 8000
     or coalesce(p_payload ->> 'kind', '') not in ('trial', 'subscription') then
    raise exception 'WB181: the order could not be read' using errcode = '22023';
  end if;
  v_kind := (p_payload ->> 'kind')::public.food_order_kind;
  v_name := nullif(left(btrim(coalesce(p_payload ->> 'parent_name', '')), 120), '');
  v_phone := btrim(coalesce(p_payload ->> 'phone', ''));
  v_pet := nullif(left(btrim(coalesce(p_payload ->> 'pet_name', '')), 80), '');
  v_line := nullif(left(btrim(coalesce(p_payload ->> 'line', '')), 300), '');
  v_postal := upper(btrim(coalesce(p_payload ->> 'postal_code', '')));
  if v_name is null or v_pet is null or v_line is null or v_phone !~ '^\+[1-9][0-9]{7,14}$'
     or v_postal !~ '^[A-Z0-9][A-Z0-9 -]{1,8}[A-Z0-9]$' or v_postal !~ '[0-9]'
     or (v_org.country_code = 'IN' and v_postal !~ '^[1-9][0-9]{5}$')
     or coalesce((p_payload ->> 'consent')::boolean, false) is not true then
    raise exception 'WB182: fill in your name, phone, dog''s name, address and PIN code, and agree to the notice' using errcode = '22023';
  end if;
  v_weight := case when p_payload ->> 'weight_g' ~ '^[0-9]{1,6}$' then (p_payload ->> 'weight_g')::integer end;
  if v_weight is null or v_weight < 500 or v_weight > 199999 then
    raise exception 'WB183: give the dog''s weight in kilos' using errcode = '22023';
  end if;

  -- A form is a few taps; a flood is something else (as with the intake form).
  if (select count(*) from public.food_orders f where f.org_id = v_org.id and f.created_at > now() - interval '10 minutes') >= 30
     or (select count(*) from public.food_orders f where f.org_id = v_org.id and f.phone = v_phone and f.created_at > now() - interval '1 day') >= 3 then
    raise exception 'WB184: we already have your order. The kennel will be in touch.' using errcode = '54000';
  end if;

  select coalesce(a.delivery_charge_minor, 0), true into v_charge, v_served
  from public.service_areas a where a.org_id = v_org.id and a.postal_code = v_postal;
  v_served := coalesce(v_served, false);
  v_charge := coalesce(v_charge, 0);

  if v_kind = 'trial' then
    select * into v_trial from public.food_products p where p.org_id = v_org.id and p.kind = 'trial' and p.is_active order by p.created_at limit 1;
    if v_trial.id is null then
      raise exception 'WB180: this kennel is not taking food orders here' using errcode = 'P0002';
    end if;
    v_start := public.first_delivery_day(v_org.id);
    v_amount := v_trial.price_minor + v_charge;
  else
    select * into v_sub from public.food_products p where p.org_id = v_org.id and p.kind = 'subscription' and p.is_active order by p.created_at limit 1;
    if v_sub.id is null then
      raise exception 'WB180: this kennel is not taking food orders here' using errcode = 'P0002';
    end if;
    select coalesce(array_agg(distinct x::smallint order by x::smallint), '{}') into v_days
    from jsonb_array_elements_text(case when jsonb_typeof(p_payload -> 'weekdays') = 'array' then p_payload -> 'weekdays' else '[]'::jsonb end) x
    where x ~ '^[1-7]$';
    v_grams := case when p_payload ->> 'grams_per_day' ~ '^[0-9]{1,4}$' then (p_payload ->> 'grams_per_day')::integer end;
    if cardinality(v_days) = 0 or v_grams is null or v_grams < 10 or v_grams > 5000 then
      raise exception 'WB185: choose the delivery days and the grams a day' using errcode = '22023';
    end if;
    v_start := public.first_delivery_day(v_org.id, v_days);
    -- The first week ahead: each delivery day's grams in whole packs, at the price per kilo, with its charge.
    select sum(round((ceil(v_grams * c.covers / v_org.food_pack_g::numeric) * v_org.food_pack_g) * v_sub.price_minor / 1000.0) + v_charge)::bigint
    into v_amount
    from (select w, (select min(((w2 - w + 6) % 7) + 1) from unnest(v_days) w2) as covers from unnest(v_days) w) c;
  end if;

  insert into public.food_orders (org_id, kind, status, parent_name, phone, pet_name, weight_g, plan, grams_per_day, weekdays, slot,
                                  line, area, postal_code, door_note, starts_on, amount_minor, note, consent_text)
  values (
    v_org.id, v_kind, case when v_served then 'unpaid' else 'waiting_area' end::public.food_order_status,
    v_name, v_phone, v_pet, v_weight,
    case when p_payload ->> 'plan' = 'topper' then 'topper' else 'full' end::public.food_plan,
    v_grams, v_days,
    case p_payload ->> 'slot' when 'afternoon' then 'afternoon' when 'evening' then 'evening' else 'morning' end::public.delivery_slot,
    v_line, nullif(left(btrim(coalesce(p_payload ->> 'area', '')), 120), ''), v_postal,
    nullif(left(btrim(coalesce(p_payload ->> 'door_note', '')), 300), ''),
    v_start, case when v_served then v_amount end,
    nullif(left(btrim(coalesce(p_payload ->> 'note', '')), 1000), ''),
    left(coalesce(p_payload ->> 'consent_text', ''), 4000)
  )
  returning * into v_order;
  return jsonb_build_object('token', v_order.public_token, 'status', v_order.status, 'amount_minor', v_order.amount_minor, 'starts_on', v_order.starts_on);
end;
$$;
comment on function public.submit_food_order(text, jsonb) is
  'PUBLIC. An order from the kennel''s food order page: a trial, or a subscription with its days and grams a day. Works out what to pay now (the trial, or the first week ahead, with delivery) and returns it with a token for saying it was paid; a PIN code not served is kept as waiting for the area, with nothing to pay. Refused when the kennel takes no orders (WB180), for a malformed order (WB181), missing details or consent (WB182), no weight (WB183), a flood (WB184) or no days or grams (WB185).';

create function public.food_order_paid(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.food_order_status;
begin
  -- SECURITY DEFINER: the token in the order's page is the parent's key. It
  -- only says "I have paid"; staff check the money before confirming.
  update public.food_orders f set status = 'paid', paid_claimed_at = now()
  where char_length(p_token) = 64 and f.public_token = p_token and f.status = 'unpaid'
  returning f.status into v_status;
  if v_status is null then
    select f.status into v_status from public.food_orders f where char_length(p_token) = 64 and f.public_token = p_token;
  end if;
  if v_status is null then
    raise exception 'WB181: the order could not be read' using errcode = 'P0002';
  end if;
  return v_status::text;
end;
$$;
comment on function public.food_order_paid(text) is
  'PUBLIC. The parent says they have paid for their order: an unpaid order becomes paid (claimed), for staff to check. Returns the order''s status.';

create function public.submit_food_request(p_token text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients;
  v_org public.organizations;
  v_kind public.food_order_kind;
  v_sub public.subscriptions;
  v_from date;
  v_until date;
  v_grams integer;
  v_today date;
begin
  -- SECURITY DEFINER: as submit_booking_request, the parent's own link is
  -- their key. A change is a request for staff, never a change by itself.
  select * into v_client from public.clients c
  where char_length(p_token) = 64 and c.request_token = p_token and c.deleted_at is null and c.erased_at is null;
  select * into v_org from public.organizations o where o.id = v_client.org_id;
  if v_client.id is null or not v_org.requests_enabled or not v_org.offers_food_delivery then
    raise exception 'WB100: this link is not taking requests' using errcode = 'P0002';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 3000
     or coalesce(p_payload ->> 'kind', '') not in ('pause', 'skip', 'more') then
    raise exception 'WB181: the order could not be read' using errcode = '22023';
  end if;
  v_kind := (p_payload ->> 'kind')::public.food_order_kind;
  select * into v_sub from public.subscriptions s
  where s.org_id = v_client.org_id and s.client_id = v_client.id and s.id::text = p_payload ->> 'subscription_id' and s.cancelled_on is null;
  if v_sub.id is null then
    raise exception 'WB186: choose one of your food subscriptions' using errcode = '22023';
  end if;
  v_today := (now() at time zone v_org.time_zone)::date;
  v_from := public.safe_date(p_payload ->> 'from');
  v_until := public.safe_date(p_payload ->> 'until');
  v_grams := case when p_payload ->> 'grams' ~ '^[0-9]{1,5}$' then (p_payload ->> 'grams')::integer end;
  if v_from is null or v_from < v_today or v_from > v_today + 120 or (v_until is not null and (v_until < v_from or v_until > v_from + 120))
     or (v_kind = 'more' and (v_grams is null or v_grams < 10 or v_grams > 20000)) then
    raise exception 'WB187: those dates or amounts cannot be asked for. Check them and try again.' using errcode = '22023';
  end if;
  if (select count(*) from public.food_orders f where f.org_id = v_org.id and f.client_id = v_client.id and f.created_at > now() - interval '1 day') >= 10 then
    raise exception 'WB105: that is a lot of requests for one day. The kennel will be in touch.' using errcode = '54000';
  end if;
  insert into public.food_orders (org_id, kind, status, client_id, subscription_id, starts_on, until_date, grams, note)
  values (v_org.id, v_kind, 'requested', v_client.id, v_sub.id, v_from, case when v_kind = 'pause' then v_until end,
          case when v_kind = 'more' then v_grams end, nullif(left(btrim(coalesce(p_payload ->> 'note', '')), 1000), ''));
end;
$$;
comment on function public.submit_food_request(text, jsonb) is
  'PUBLIC. A known parent asks, through their own link, to pause a subscription (from a day, until a day or until they say), skip a delivery, or have more food on a day. Kept for staff to confirm. Refused when the link takes no requests (WB100), for a malformed request (WB181), a subscription not theirs (WB186), dates in the past or too far ahead (WB187), and more than ten in a day (WB105).';

-- Staff confirm an order: a website order makes or matches the parent (by
-- phone), the pet (by name, with its weight), the address, and the trial or
-- the subscription; a parent's change is made to their subscription. Any
-- member may confirm. SECURITY DEFINER because what the parent sent is
-- never writable through the API (an order is confirmed only here); it
-- checks membership itself and touches only the order's own kennel.
create function public.confirm_food_order(p_order uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.food_orders;
  v_org public.organizations;
  v_client uuid;
  v_pet uuid;
  v_address uuid;
  v_sub uuid;
  v_product uuid;
  v_today date;
  v_delivery public.deliveries;
begin
  select * into v_order from public.food_orders f where f.id = p_order and f.org_id in (select public.my_org_ids()) for update;
  if v_order.id is null then
    raise exception 'WB003: that order was not found' using errcode = 'P0002';
  end if;
  if v_order.status in ('confirmed', 'declined') then
    raise exception 'WB188: this order has already been dealt with' using errcode = '23514';
  end if;
  select * into v_org from public.organizations o where o.id = v_order.org_id;
  v_today := (now() at time zone v_org.time_zone)::date;

  if v_order.kind in ('pause', 'skip', 'more') then
    if v_order.kind = 'pause' then
      update public.subscriptions s set paused_from = v_order.starts_on, paused_until = v_order.until_date
      where s.org_id = v_order.org_id and s.id = v_order.subscription_id;
    elsif v_order.kind = 'skip' then
      update public.deliveries d set status = 'cancelled', cancel_reason = 'Skipped by the parent'
      where d.org_id = v_order.org_id and d.subscription_id = v_order.subscription_id and d.delivery_date = v_order.starts_on and d.status = 'planned';
    else
      select * into v_delivery from public.deliveries d
      where d.org_id = v_order.org_id and d.subscription_id = v_order.subscription_id and d.status <> 'cancelled'
      order by d.delivery_date desc limit 1;
      insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date, slot, address_id, grams, recipe_id, version_id)
      select s.org_id, 'order', s.client_id, s.pet_id, s.product_id, v_order.starts_on, s.slot, s.address_id,
             (ceil(v_order.grams / v_org.food_pack_g::numeric) * v_org.food_pack_g)::integer,
             coalesce(v_delivery.recipe_id, public.rotation_recipe(s.org_id, 0)),
             (select c.version_id from public.recipe_current c where c.org_id = s.org_id and c.recipe_id = coalesce(v_delivery.recipe_id, public.rotation_recipe(s.org_id, 0)))
      from public.subscriptions s where s.org_id = v_order.org_id and s.id = v_order.subscription_id;
    end if;
    update public.food_orders f set status = 'confirmed' where f.id = v_order.id;
    return v_order.client_id;
  end if;

  -- The parent: the one with this phone, or a new one.
  select c.id into v_client from public.clients c
  where c.org_id = v_order.org_id and c.phone = v_order.phone and c.deleted_at is null and c.erased_at is null limit 1;
  if v_client is null then
    insert into public.clients (org_id, full_name, phone, consent_at, consent_source)
    values (v_order.org_id, v_order.parent_name, v_order.phone, v_order.created_at, 'food_order')
    returning id into v_client;
  end if;
  -- The dog: theirs with this name, or a new one, weighed as the parent said.
  select p.id into v_pet from public.pets p
  where p.org_id = v_order.org_id and p.client_id = v_client and lower(p.name) = lower(v_order.pet_name) and p.deleted_at is null limit 1;
  if v_pet is null then
    insert into public.pets (org_id, client_id, name) values (v_order.org_id, v_client, v_order.pet_name) returning id into v_pet;
    insert into public.pet_weights (org_id, pet_id, weighed_on, weight_g, notes)
    values (v_order.org_id, v_pet, v_order.created_at::date, v_order.weight_g, 'From the food order form');
  end if;
  insert into public.pet_food (org_id, pet_id, plan, started_on)
  values (v_order.org_id, v_pet, coalesce(v_order.plan, 'full'), greatest(v_order.starts_on, v_today))
  on conflict (org_id, pet_id) do nothing;
  -- The address: theirs with this PIN code and line, or a new one.
  select a.id into v_address from public.client_addresses a
  where a.org_id = v_order.org_id and a.client_id = v_client and a.postal_code = v_order.postal_code and a.line = v_order.line limit 1;
  if v_address is null then
    insert into public.client_addresses (org_id, client_id, kind, line, area, postal_code, door_note)
    values (v_order.org_id, v_client, 'home', v_order.line, v_order.area, v_order.postal_code, v_order.door_note)
    returning id into v_address;
  end if;

  if v_order.kind = 'trial' then
    select p.id into v_product from public.food_products p
    where p.org_id = v_order.org_id and p.kind = 'trial' and p.is_active order by p.created_at limit 1;
    insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date, slot, address_id, recipe_id, version_id)
    values (v_order.org_id, 'trial', v_client, v_pet, v_product, greatest(coalesce(v_order.starts_on, v_today), v_today), coalesce(v_order.slot, 'morning'),
            v_address, public.rotation_recipe(v_order.org_id, 0),
            (select c.version_id from public.recipe_current c where c.org_id = v_order.org_id and c.recipe_id = public.rotation_recipe(v_order.org_id, 0)));
  else
    select p.id into v_product from public.food_products p
    where p.org_id = v_order.org_id and p.kind = 'subscription' and p.is_active order by p.created_at limit 1;
    insert into public.subscriptions (org_id, client_id, pet_id, product_id, plan, grams_per_day, weekdays, slot, address_id, starts_on, source)
    values (v_order.org_id, v_client, v_pet, v_product, coalesce(v_order.plan, 'full'), v_order.grams_per_day, v_order.weekdays,
            coalesce(v_order.slot, 'morning'), v_address, greatest(coalesce(v_order.starts_on, v_today), v_today), 'website')
    returning id into v_sub;
    perform public.plan_subscription(v_sub, greatest(coalesce(v_order.starts_on, v_today), v_today) + 13);
  end if;
  update public.food_orders f set status = 'confirmed', client_id = v_client, subscription_id = coalesce(v_sub, f.subscription_id)
  where f.id = v_order.id;
  return v_client;
end;
$$;
comment on function public.confirm_food_order(uuid) is
  'Confirms a food order once its money has arrived: a website order makes or matches the parent by phone, the pet by name (with its first weighing), the address, and the trial delivery or the subscription with its first two weeks of deliveries; a parent''s change pauses the subscription, skips the delivery, or adds the extra order. Returns the parent. Any member (row level security applies); once only (WB188).';
