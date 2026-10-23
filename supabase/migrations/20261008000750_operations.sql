-- =============================================================================
-- Wagbook 00075: running for real (Phase 5, M46 to M49, D49)
--
--   Jobs       work that runs by itself overnight through pg_cron (M46):
--              making food deliveries ahead, and forgetting old problem
--              rows. Each job is a plain function, safe to run twice, that
--              the scheduler or a person at the SQL editor can run.
--   Problems   errors on the server, written by the app for owners to see
--              (M48), with no parent's or pet's details in them.
--   Import     parents, pets and vaccinations from a spreadsheet, all of it
--              or none of it (M47). The app reads the CSV and checks every
--              row (src/lib/core/import.ts); this writes them.
--   Photos     a month of photos downloaded, then removed from Wagbook by an
--              owner, the small copies kept (M49). Nothing is removed by
--              itself.
--
-- Row level security for these tables is in 0008 with the rest of the access
-- model, as for every table until the migration freeze.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Problems (M48)
-- ---------------------------------------------------------------------------

create table public.app_errors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  happened_at timestamptz not null default now(),
  path text not null check (char_length(path) between 1 and 200),
  kind text not null check (kind in ('render', 'route', 'action', 'proxy')),
  message text not null check (char_length(message) between 1 and 300),
  digest text check (digest is null or char_length(digest) <= 40)
);
comment on table public.app_errors is
  'An error on the server while someone at this kennel was signed in (M48), for owners to see under More, Problems. Written only by log_app_error(), stripped of email addresses and phone numbers, and forgotten after 90 days (job_forget_old_rows).';
comment on column public.app_errors.path is 'The page or address that failed, without its query string.';
comment on column public.app_errors.kind is 'Where it failed: render (a page), route (a download or other address), action (a form), proxy (before the page).';
comment on column public.app_errors.message is 'What went wrong, cut to 300 characters, with email addresses and long numbers replaced.';
comment on column public.app_errors.digest is 'Next.js''s short id for the error, which the server''s own log also prints.';

create index app_errors_org_happened_idx on public.app_errors (org_id, happened_at desc);

-- Email addresses and phone numbers (nine or more digits, each followed by at
-- most one space, bracket or hyphen) become a mark, so an error row never
-- holds a parent's contact. A date keeps its eight digits.
create function public.scrub_error_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      regexp_replace(coalesce(p_text, ''), '[^\s@<>"'']+@[^\s@<>"'']+', '[email]', 'g'),
      '\+?(?:[0-9][ ()-]?){8,}[0-9]', '[number]', 'g'),
    300);
$$;
comment on function public.scrub_error_text(text) is
  'An error message with email addresses and phone numbers (nine or more digits) replaced, cut to 300 characters. Must match scrubErrorText() in src/lib/core/problems.ts.';
revoke all on function public.scrub_error_text(text) from public, anon;

-- SECURITY DEFINER: nobody writes app_errors directly (there is no insert
-- grant), so that every row is scrubbed and a flood is cut off here. The
-- function checks the caller is signed in and a member of the kennel itself.
create function public.log_app_error(p_path text, p_kind text, p_message text, p_org uuid default null, p_digest text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := p_org;
begin
  if (select auth.uid()) is null then
    return;
  end if;
  if v_org is null or v_org not in (select public.my_org_ids()) then
    select m.org_id into v_org from public.memberships m
    where m.user_id = (select auth.uid()) and m.is_active and m.role <> 'rider'
    order by m.created_at limit 1;
  end if;
  if v_org is null then
    return;
  end if;
  -- At most 200 an hour for a kennel: a page failing for everyone is one
  -- problem, and the rest would only push the others off the list.
  if (select count(*) from public.app_errors e where e.org_id = v_org and e.happened_at > now() - interval '1 hour') >= 200 then
    return;
  end if;
  insert into public.app_errors (org_id, path, kind, message, digest)
  values (
    v_org,
    left(coalesce(nullif(split_part(btrim(p_path), '?', 1), ''), '/'), 200),
    case when p_kind in ('render', 'route', 'action', 'proxy') then p_kind else 'render' end,
    coalesce(nullif(public.scrub_error_text(btrim(p_message)), ''), '?'),
    nullif(left(btrim(p_digest), 40), '')
  );
end;
$$;
comment on function public.log_app_error(text, text, text, uuid, text) is
  'Writes an error on the server for the kennel the caller is working in (or their first), scrubbed of contacts, at most 200 an hour. Does nothing for someone not signed in. SECURITY DEFINER because nobody writes app_errors directly.';
revoke all on function public.log_app_error(text, text, text, uuid, text) from public, anon;

-- ---------------------------------------------------------------------------
-- Jobs (M46)
-- ---------------------------------------------------------------------------

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  job text not null check (job in ('plan_deliveries', 'forget_old_rows')),
  ran_at timestamptz not null default now(),
  ok boolean not null,
  made integer not null default 0 check (made >= 0),
  problem text check (problem is null or char_length(problem) <= 300),
  constraint job_runs_problem_when_failed check (ok = (problem is null))
);
comment on table public.job_runs is
  'Each time an overnight job ran for a kennel (M46), whether it worked, and how much it did. Settings shows the latest. Written only by run_nightly_jobs(); kept 90 days.';
comment on column public.job_runs.job is 'plan_deliveries: food deliveries made ahead for every subscription. forget_old_rows: problems and job runs older than 90 days removed.';
comment on column public.job_runs.made is 'How many rows the job made or removed.';
comment on column public.job_runs.problem is 'Why it failed, when it did. The other jobs and kennels still ran.';

create index job_runs_org_ran_idx on public.job_runs (org_id, ran_at desc);

-- Food deliveries ahead for every subscription still running, as opening the
-- Kitchen or Food for homes does (planAhead() in src/lib/kitchen.ts).
-- plan_subscription() skips days already made, so running it twice makes
-- nothing twice.
create function public.job_plan_deliveries(p_org uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_today date := public.org_today(p_org);
  v_sub uuid;
  v_made integer := 0;
begin
  for v_sub in
    select s.id from public.subscriptions s
    where s.org_id = p_org and (s.cancelled_on is null or s.cancelled_on > v_today)
    order by s.id
  loop
    -- 21 days: must match PLAN_AHEAD_DAYS in src/lib/kitchen.ts.
    v_made := v_made + public.plan_subscription(v_sub, v_today + 21);
  end loop;
  return v_made;
end;
$$;
comment on function public.job_plan_deliveries(uuid) is
  'Overnight job (M46): makes every running subscription''s deliveries for the next 21 days, as the food screens do. Returns how many it made; a second run makes none.';
revoke all on function public.job_plan_deliveries(uuid) from public, anon;

create function public.job_forget_old_rows(p_org uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_errors integer;
  v_runs integer;
begin
  delete from public.app_errors e where e.org_id = p_org and e.happened_at < now() - interval '90 days';
  get diagnostics v_errors = row_count;
  delete from public.job_runs r where r.org_id = p_org and r.ran_at < now() - interval '90 days';
  get diagnostics v_runs = row_count;
  return v_errors + v_runs;
end;
$$;
comment on function public.job_forget_old_rows(uuid) is
  'Overnight job (M46): removes the kennel''s problems (app_errors) and job runs older than 90 days. Returns how many it removed.';
revoke all on function public.job_forget_old_rows(uuid) from public, anon;

-- Every job for every kennel, each in its own sub-transaction: a job that
-- fails is written down with its reason and the rest still run.
create function public.run_nightly_jobs()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
  v_job text;
  v_made integer;
  v_runs integer := 0;
begin
  for v_org in select o.id from public.organizations o order by o.id loop
    foreach v_job in array array['plan_deliveries', 'forget_old_rows'] loop
      begin
        v_made := case v_job
          when 'plan_deliveries' then public.job_plan_deliveries(v_org)
          when 'forget_old_rows' then public.job_forget_old_rows(v_org)
        end;
        insert into public.job_runs (org_id, job, ok, made) values (v_org, v_job, true, coalesce(v_made, 0));
      exception when others then
        insert into public.job_runs (org_id, job, ok, problem) values (v_org, v_job, false, left(coalesce(nullif(sqlerrm, ''), sqlstate), 300));
      end;
      v_runs := v_runs + 1;
    end loop;
  end loop;
  return v_runs;
end;
$$;
comment on function public.run_nightly_jobs() is
  'Runs every overnight job for every kennel (M46) and writes each run to job_runs. pg_cron calls it each night; it can also be run by hand in the SQL editor. Returns how many job runs it wrote. Not granted to the app.';
revoke all on function public.run_nightly_jobs() from public, anon;

-- Schedule it where pg_cron is available (Supabase has it; the tests' Postgres
-- does not). 20:30 UTC is 02:00 in India. Without pg_cron the food screens
-- still make deliveries when they open, as before (docs/14-self-hosting.md).
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('wagbook-nightly', '30 20 * * *', 'select public.run_nightly_jobs()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Import from a spreadsheet (M47)
-- ---------------------------------------------------------------------------

-- Runs as the caller, so row level security applies to every row it writes.
create function public.import_parents_and_pets(p_org uuid, p_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb;
  v_parent jsonb;
  v_pet jsonb;
  v_vax jsonb;
  v_client uuid;
  v_pet_id uuid;
  v_today date := public.org_today(p_org);
  v_postal text;
  v_parents_added integer := 0;
  v_parents_matched integer := 0;
  v_pets_added integer := 0;
  v_pets_skipped integer := 0;
  v_vaccinations integer := 0;
  -- Parents met earlier in this import: a second pet of a new parent does not
  -- count them as a known one.
  v_seen uuid[] := '{}';
begin
  if p_org is null or p_org not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB002: only an owner or manager can bring in parents and pets' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'WB240: bring in at most 2000 rows at a time' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_parent := v_row -> 'parent';
    v_pet := v_row -> 'pet';

    -- A parent is recognised by phone number, as the intake form does, and a
    -- known parent's record is left as it is.
    select c.id into v_client from public.clients c
    where c.org_id = p_org and c.phone = v_parent ->> 'phone' and c.deleted_at is null;
    if v_client is null then
      insert into public.clients (org_id, full_name, phone, email, address, city, postal_code, emergency_name, emergency_phone, notes, consent_source)
      values (p_org, btrim(v_parent ->> 'name'), v_parent ->> 'phone',
              nullif(btrim(v_parent ->> 'email'), ''), nullif(btrim(v_parent ->> 'address'), ''), nullif(btrim(v_parent ->> 'city'), ''),
              nullif(btrim(v_parent ->> 'postal_code'), ''), nullif(btrim(v_parent ->> 'emergency_name'), ''),
              nullif(btrim(v_parent ->> 'emergency_phone'), ''), nullif(btrim(v_parent ->> 'notes'), ''), 'staff')
      returning id into v_client;
      v_parents_added := v_parents_added + 1;
      v_postal := nullif(btrim(v_parent ->> 'postal_code'), '');
      if v_postal is not null and nullif(btrim(v_parent ->> 'address'), '') is not null then
        insert into public.client_addresses (org_id, client_id, kind, line, area, postal_code)
        values (p_org, v_client, 'home', left(btrim(v_parent ->> 'address'), 300), nullif(left(btrim(v_parent ->> 'area'), 120), ''), v_postal);
      end if;
    elsif not (v_client = any (v_seen)) then
      v_parents_matched := v_parents_matched + 1;
    end if;
    v_seen := v_seen || v_client;

    -- A pet the kennel already knows by name, for this parent, is left alone.
    select p.id into v_pet_id from public.pets p
    where p.org_id = p_org and p.client_id = v_client and p.deleted_at is null and lower(p.name) = lower(btrim(v_pet ->> 'name'));
    if v_pet_id is not null then
      v_pets_skipped := v_pets_skipped + 1;
      continue;
    end if;
    insert into public.pets (org_id, client_id, name, species, breed, sex, is_neutered, date_of_birth, microchip,
                             food_notes, medical_notes, allergies, behaviour_notes, vet_name, vet_phone)
    values (p_org, v_client, btrim(v_pet ->> 'name'), coalesce(v_pet ->> 'species', 'dog'), nullif(btrim(v_pet ->> 'breed'), ''),
            coalesce((v_pet ->> 'sex')::public.pet_sex, 'unknown'), (v_pet ->> 'is_neutered')::boolean, (v_pet ->> 'date_of_birth')::date,
            nullif(btrim(v_pet ->> 'microchip'), ''), nullif(btrim(v_pet ->> 'food_notes'), ''), nullif(btrim(v_pet ->> 'medical_notes'), ''),
            nullif(btrim(v_pet ->> 'allergies'), ''), nullif(btrim(v_pet ->> 'behaviour_notes'), ''),
            nullif(btrim(v_pet ->> 'vet_name'), ''), nullif(btrim(v_pet ->> 'vet_phone'), ''))
    returning id into v_pet_id;
    v_pets_added := v_pets_added + 1;
    if (v_pet ->> 'weight_g') is not null then
      insert into public.pet_weights (org_id, pet_id, weighed_on, weight_g) values (p_org, v_pet_id, v_today, (v_pet ->> 'weight_g')::integer);
    end if;
    for v_vax in select * from jsonb_array_elements(coalesce(v_row -> 'vaccinations', '[]'::jsonb)) loop
      insert into public.vaccinations (org_id, pet_id, vaccine, given_on, valid_until)
      values (p_org, v_pet_id, btrim(v_vax ->> 'vaccine'), (v_vax ->> 'given_on')::date, (v_vax ->> 'valid_until')::date);
      v_vaccinations := v_vaccinations + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'parents_added', v_parents_added, 'parents_matched', v_parents_matched,
    'pets_added', v_pets_added, 'pets_skipped', v_pets_skipped, 'vaccinations_added', v_vaccinations);
end;
$$;
comment on function public.import_parents_and_pets(uuid, jsonb) is
  'Brings in rows from a spreadsheet (M47), each {parent, pet, vaccinations}, checked first by readImport() in src/lib/core/import.ts. A parent is matched by phone and left as they are; a pet already known by name for that parent is skipped. All of it or none of it. Owners and managers only, at most 2000 rows. Runs as the caller.';
revoke all on function public.import_parents_and_pets(uuid, jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- Photo archive (M49)
-- ---------------------------------------------------------------------------

create table public.photo_archives (
  org_id uuid not null references public.organizations (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  downloaded_at timestamptz,
  downloaded_by uuid references auth.users (id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  files integer not null default 0 check (files >= 0),
  bytes bigint not null default 0 check (bytes >= 0),
  primary key (org_id, month),
  constraint photo_archives_removed_after_download check (removed_at is null or downloaded_at is not null)
);
comment on table public.photo_archives is
  'A month of photos downloaded as a ZIP, and later removed from Wagbook by an owner (M49, D49). Written only by record_photo_download() and record_photo_removal().';
comment on column public.photo_archives.month is 'The first day of the month the photos were taken in, at the kennel.';
comment on column public.photo_archives.files is 'How many photos the last download or the removal covered.';
comment on column public.photo_archives.bytes is 'Their size in bytes.';

-- What can be archived: photos staff took (updates to parents, grooming before
-- and after, incidents, riders at the door, care task proof), never the small
-- copies, a pet's own photo, health papers or receipts.
create function public.archivable_photo(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select split_part(p_name, '/', 2) in ('updates', 'deliveries', 'care')
     and p_name ~ '\.jpg$'
     and p_name !~ '\.small\.jpg$';
$$;
comment on function public.archivable_photo(text) is
  'True for a stored file that a photo archive covers: a photo (not its small copy) under updates, deliveries or care. Pets'' own photos, certificates and receipts are never archived.';
revoke all on function public.archivable_photo(text) from public, anon;

create function public.check_photo_month(p_org uuid, p_month date, p_roles public.member_role[])
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_org is null or p_org not in (select public.my_org_ids_with_role(p_roles)) then
    if p_roles = array['owner']::public.member_role[] then
      raise exception 'WB242: only an owner removes photos from Wagbook' using errcode = '42501';
    end if;
    raise exception 'WB002: only an owner or manager can download photos' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 or p_month >= date_trunc('month', public.org_today(p_org))::date then
    raise exception 'WB241: photos are archived a month at a time, for a month that has ended' using errcode = '22023';
  end if;
end;
$$;
comment on function public.check_photo_month(uuid, date, public.member_role[]) is
  'Raises unless the caller has one of the roles at the kennel (WB002, or WB242 for owners only) and the month is a first of the month before this one (WB241).';
revoke all on function public.check_photo_month(uuid, date, public.member_role[]) from public, anon;

-- Space used by month: every file the caller may see, and the photos an
-- archive would cover. Runs as the caller: storage's own policies decide what
-- is counted (receipts for owners and managers only).
create function public.photo_space(p_org uuid)
returns table (month date, files bigint, bytes bigint, photos bigint, photo_bytes bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zone text;
begin
  if p_org is null or p_org not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB002: only an owner or manager can see the space photos take' using errcode = '42501';
  end if;
  select o.time_zone into v_zone from public.organizations o where o.id = p_org;
  return query
  select date_trunc('month', o.created_at at time zone v_zone)::date,
         count(*),
         coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint,
         count(*) filter (where public.archivable_photo(o.name)),
         coalesce(sum((o.metadata ->> 'size')::bigint) filter (where public.archivable_photo(o.name)), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'pet-media' and public.storage_org_id(o.name) = p_org
  group by 1
  order by 1 desc;
end;
$$;
comment on function public.photo_space(uuid) is
  'The kennel''s stored files by month (at the kennel): how many, their size, and how many of them are photos an archive covers. Owners and managers only. Runs as the caller.';
revoke all on function public.photo_space(uuid) from public, anon;

-- The photos of a month, each with the pet it shows and when it was taken,
-- for the ZIP and for removing them.
create function public.photo_month_files(p_org uuid, p_month date)
returns table (path text, pet_name text, taken_at timestamptz, bytes bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zone text;
begin
  perform public.check_photo_month(p_org, p_month, array['owner', 'manager']::public.member_role[]);
  select o.time_zone into v_zone from public.organizations o where o.id = p_org;
  return query
  select o.name,
         coalesce(
           (select p.name from public.stay_updates su join public.pets p on p.org_id = su.org_id and p.id = su.pet_id
            where su.org_id = p_org and su.id::text = split_part(o.name, '/', 3) and split_part(o.name, '/', 2) = 'updates'),
           (select p.name from public.deliveries d join public.pets p on p.org_id = d.org_id and p.id = d.pet_id
            where d.org_id = p_org and d.id::text = split_part(o.name, '/', 3) and split_part(o.name, '/', 2) = 'deliveries'),
           (select p.name from public.care_tasks ct join public.pets p on p.org_id = ct.org_id and p.id = ct.pet_id
            where ct.org_id = p_org and ct.id::text = split_part(o.name, '/', 3) and split_part(o.name, '/', 2) = 'care'),
           ''),
         o.created_at,
         coalesce((o.metadata ->> 'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id = 'pet-media'
    and public.storage_org_id(o.name) = p_org
    and public.archivable_photo(o.name)
    and date_trunc('month', o.created_at at time zone v_zone)::date = p_month
  order by o.created_at, o.name;
end;
$$;
comment on function public.photo_month_files(uuid, date) is
  'The photos of a month that has ended that an archive covers, with the pet each shows (by its update, delivery or care task) and when it was taken. Owners and managers only. Runs as the caller.';
revoke all on function public.photo_month_files(uuid, date) from public, anon;

-- SECURITY DEFINER for the two below: an archive's record is written only
-- here, so it always says who downloaded and who removed, in that order.
-- Each checks the caller's role at the kennel itself (check_photo_month).
create function public.record_photo_download(p_org uuid, p_month date, p_files integer, p_bytes bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_photo_month(p_org, p_month, array['owner', 'manager']::public.member_role[]);
  insert into public.photo_archives (org_id, month, downloaded_at, downloaded_by, files, bytes)
  values (p_org, p_month, now(), (select auth.uid()), greatest(coalesce(p_files, 0), 0), greatest(coalesce(p_bytes, 0), 0))
  on conflict (org_id, month) do update
    set downloaded_at = excluded.downloaded_at, downloaded_by = excluded.downloaded_by,
        files = case when public.photo_archives.removed_at is null then excluded.files else public.photo_archives.files end,
        bytes = case when public.photo_archives.removed_at is null then excluded.bytes else public.photo_archives.bytes end;
end;
$$;
comment on function public.record_photo_download(uuid, date, integer, bigint) is
  'Notes that a month''s photos were downloaded as a ZIP (M49), so an owner may then remove them. Owners and managers. SECURITY DEFINER: the archive''s record is written only here and in record_photo_removal().';
revoke all on function public.record_photo_download(uuid, date, integer, bigint) from public, anon;

create function public.record_photo_removal(p_org uuid, p_month date, p_files integer, p_bytes bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_photo_month(p_org, p_month, array['owner']::public.member_role[]);
  if not exists (select 1 from public.photo_archives a where a.org_id = p_org and a.month = p_month and a.downloaded_at is not null) then
    raise exception 'WB243: download this month''s photos first, then remove them' using errcode = '23514';
  end if;
  update public.photo_archives a
  set removed_at = now(), removed_by = (select auth.uid()),
      files = greatest(coalesce(p_files, 0), 0), bytes = greatest(coalesce(p_bytes, 0), 0)
  where a.org_id = p_org and a.month = p_month;
end;
$$;
comment on function public.record_photo_removal(uuid, date, integer, bigint) is
  'Notes that an owner removed a month''s photos from Wagbook (M49), refused unless they were downloaded first (WB243). SECURITY DEFINER: see record_photo_download().';
revoke all on function public.record_photo_removal(uuid, date, integer, bigint) from public, anon;

-- Removing the files themselves is a storage delete, which only owners may do
-- (pet_media_delete, D29). This gives the owner the list, and only once the
-- month was downloaded.
create function public.photos_to_remove(p_org uuid, p_month date)
returns setof text
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.check_photo_month(p_org, p_month, array['owner']::public.member_role[]);
  if not exists (select 1 from public.photo_archives a where a.org_id = p_org and a.month = p_month and a.downloaded_at is not null) then
    raise exception 'WB243: download this month''s photos first, then remove them' using errcode = '23514';
  end if;
  return query select f.path from public.photo_month_files(p_org, p_month) f;
end;
$$;
comment on function public.photos_to_remove(uuid, date) is
  'The photos of a downloaded month that an owner may remove from storage (M49). Refused for anyone but an owner (WB242), or before the month was downloaded (WB243). The small copies are not in it, so pages still show something.';
revoke all on function public.photos_to_remove(uuid, date) from public, anon;
