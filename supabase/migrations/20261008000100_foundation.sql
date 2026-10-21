-- =============================================================================
-- Wagbook 0001: foundation
-- Extensions, shared helpers, organisations and memberships.
--
-- Conventions used by every migration (see docs/04-data-model.md):
--   * Every business table has org_id and is protected by row level security.
--   * Money is bigint minor units (paise) in columns ending _minor.
--   * Tax rates are integer basis points in columns ending _bp (1800 = 18%).
--   * Stay dates are `date`, never timestamps.
--   * Child rows point at parents with a composite (org_id, id) foreign key,
--     so a row can never reference something in another organisation.
--   * Functions set search_path = '' and name every object in full.
-- =============================================================================

-- btree_gist lets one exclusion constraint mix "same kennel" with
-- "overlapping dates", which is how double booking is made impossible.
create extension if not exists btree_gist with schema extensions;

create type public.member_role as enum ('owner', 'manager', 'staff', 'rider');
comment on type public.member_role is
  'owner: everything, including people and deleting the organisation. manager: everything except owners. staff: daily operations. rider: only their own delivery run for the day, through rider functions (D45); no table is open to them.';

create type public.tax_mode as enum ('none', 'simple', 'gst_india');
comment on type public.tax_mode is
  'none: no tax charged. simple: one tax at one rate (VAT, sales tax). gst_india: CGST+SGST within a state, IGST across states.';

create type public.staff_skill as enum ('cook', 'groomer', 'trainer', 'swim_supervisor', 'rider');
comment on type public.staff_skill is
  'What a person can be given to do, beyond their role: cook (the kitchen), groomer, trainer and swim_supervisor (appointments), rider (deliveries and pick-ups). Skills choose who is offered a job; access stays with the role.';

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
comment on function public.set_updated_at() is 'Trigger: stamps updated_at on every update.';

create function public.new_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;
comment on function public.new_token() is
  'A 64 character random token (244 random bits) for unguessable public links such as stay pages and invoices.';

create function public.fiscal_year_label(p_date date, p_start_month integer default 4)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_start_month = 1 then extract(year from p_date)::integer::text
    else
      (extract(year from p_date)::integer - case when extract(month from p_date) >= p_start_month then 0 else 1 end)::text
      || '-' ||
      lpad((((extract(year from p_date)::integer - case when extract(month from p_date) >= p_start_month then 0 else 1 end) + 1) % 100)::text, 2, '0')
  end;
$$;
comment on function public.fiscal_year_label(date, integer) is
  'Financial year label for a date, e.g. 2027-04-14 -> 2027-28 when the year starts in April. Must match fiscalYear() in src/lib/core/dates.ts.';

create function public.stamp_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_col text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    new := jsonb_populate_record(new, jsonb_build_object(v_col, (select auth.uid())));
  else
    new := jsonb_populate_record(new, jsonb_build_object(v_col, to_jsonb(old) -> v_col));
  end if;
  return new;
end;
$$;
comment on function public.stamp_actor() is
  'Trigger: sets a "who did this" column (named in the trigger argument) to the signed-in user on insert and keeps it unchanged afterwards, so nobody can attribute their action to someone else.';

create function public.stamp_when_set()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_at text := tg_argv[0];
  v_by text := tg_argv[1];
  v_new_at jsonb := to_jsonb(new) -> v_at;
  v_old_at jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) -> v_at else 'null'::jsonb end;
begin
  if v_new_at is null or v_new_at = 'null'::jsonb then
    -- Not set, or cleared: nobody is on record.
    new := jsonb_populate_record(new, jsonb_build_object(v_at, null, v_by, null));
  elsif v_old_at is null or v_old_at = 'null'::jsonb then
    -- Being set now: the time is now and the person is whoever is signed in.
    new := jsonb_populate_record(new, jsonb_build_object(v_at, now(), v_by, (select auth.uid())));
  else
    -- Already set: keep what was recorded.
    new := jsonb_populate_record(new, jsonb_build_object(v_at, v_old_at, v_by, to_jsonb(old) -> v_by));
  end if;
  return new;
end;
$$;
comment on function public.stamp_when_set() is
  'Trigger for a pair of "when" and "who" columns (named in the two trigger arguments) that record a one-off confirmation, such as a certificate being checked. Sending any time marks it; the database then records the real time and the signed-in user, and later edits cannot change them. Sending null clears both.';

create function public.forbid_org_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'WB004: this cannot be moved to another kennel' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function public.forbid_org_change() is
  'Trigger: a row never changes organisation. Without this, a member of two organisations could make a row vanish from one by moving it to the other.';

-- ---------------------------------------------------------------------------
-- Organisations: one row per kennel business (the tenant)
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  legal_name text,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_phone text check (whatsapp_phone is null or whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country_code text not null default 'IN' check (country_code ~ '^[A-Z]{2}$'),
  time_zone text not null default 'Asia/Kolkata',
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  locale text not null default 'en-IN',
  tax_mode public.tax_mode not null default 'none',
  tax_label text,
  tax_id text,
  gst_state_code text check (gst_state_code is null or gst_state_code ~ '^[0-9]{2}$'),
  default_tax_rate_bp integer not null default 0 check (default_tax_rate_bp between 0 and 10000),
  prices_include_tax boolean not null default false,
  -- CN is the credit notes' series, so bills cannot use it.
  invoice_prefix text not null default 'WB' check (invoice_prefix ~ '^[A-Z0-9]{1,4}$' and invoice_prefix <> 'CN'),
  fiscal_year_start_month smallint not null default 4 check (fiscal_year_start_month between 1 and 12),
  round_invoice_totals boolean not null default true,
  upi_vpa text check (upi_vpa is null or upi_vpa ~ '^[a-zA-Z0-9._-]{2,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$'),
  upi_payee_name text,
  check_in_time time not null default '10:00',
  check_out_time time not null default '12:00',
  allow_overbooking boolean not null default false,
  play_sessions_per_day smallint not null default 0 check (play_sessions_per_day between 0 and 12),
  play_session_minutes smallint not null default 20 check (play_session_minutes between 5 and 240),
  play_changeover_minutes smallint not null default 0 check (play_changeover_minutes between 0 and 60),
  play_day_start time not null default '08:00',
  play_day_end time not null default '18:00',
  play_break_start time,
  play_break_end time,
  intake_enabled boolean not null default true,
  requests_enabled boolean not null default true,
  intake_notice text,
  parent_language text not null default 'en' check (parent_language in ('en', 'hi', 'kn')),
  offers_appointments boolean not null default false,
  offers_kitchen boolean not null default false,
  offers_food_delivery boolean not null default false,
  portion_small_bp integer not null default 300 check (portion_small_bp between 50 and 1000),
  portion_medium_bp integer not null default 250 check (portion_medium_bp between 50 and 1000),
  portion_large_bp integer not null default 200 check (portion_large_bp between 50 and 1000),
  small_dog_max_g integer not null default 10000 check (small_dog_max_g between 1000 and 100000),
  medium_dog_max_g integer not null default 25000 check (medium_dog_max_g between 1000 and 150000),
  topper_share_bp integer not null default 3333 check (topper_share_bp between 500 and 9000),
  goal_change_bp integer not null default 1000 check (goal_change_bp between 0 and 3000),
  food_pack_g integer not null default 250 check (food_pack_g between 50 and 5000 and food_pack_g % 10 = 0),
  food_cutoff_hours smallint not null default 24 check (food_cutoff_hours between 0 and 168),
  monthly_food_discount_bp integer not null default 0 check (monthly_food_discount_bp between 0 and 5000),
  cook_margin_bp integer not null default 1000 check (cook_margin_bp between 0 and 5000),
  problem_window_hours smallint not null default 24 check (problem_window_hours between 1 and 168),
  food_orders_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Food is delivered from the kennel's own kitchen (D44).
  constraint organizations_delivery_needs_kitchen check (not offers_food_delivery or offers_kitchen),
  constraint organizations_size_bands_in_order check (medium_dog_max_g > small_dog_max_g),
  constraint organizations_gst_needs_registration
    check (tax_mode <> 'gst_india' or (tax_id is not null and gst_state_code is not null)),
  constraint organizations_play_hours_in_order check (play_day_end > play_day_start),
  constraint organizations_play_break_inside_day check (
    (play_break_start is null and play_break_end is null)
    or (play_break_start is not null and play_break_end is not null
        and play_break_start > play_day_start and play_break_end < play_day_end and play_break_end > play_break_start)
  )
);

comment on table public.organizations is
  'A kennel business. Every other row belongs to exactly one organisation. A self-hosted Wagbook usually has one row; a shared hosting has many.';
comment on column public.organizations.slug is 'Short name used in public links, e.g. /i/happy-tails. Lower case letters, digits and hyphens.';
comment on column public.organizations.phone is 'Main phone in E.164 form, e.g. +919876543210.';
comment on column public.organizations.whatsapp_phone is 'The number parents should message. Shown on public pages. E.164.';
comment on column public.organizations.time_zone is 'IANA time zone. Decides what "today" means for arrivals, tasks and invoice dates.';
comment on column public.organizations.currency is 'ISO 4217 code. All _minor amounts of this organisation are in this currency.';
comment on column public.organizations.tax_mode is 'How tax is charged. Start with none; switch to gst_india once registered for GST.';
comment on column public.organizations.tax_label is 'Name of the tax in simple mode, e.g. VAT. Ignored in other modes.';
comment on column public.organizations.tax_id is 'Tax registration number. The GSTIN when tax_mode is gst_india.';
comment on column public.organizations.gst_state_code is 'Two digit GST state code of the kennel, e.g. 29 for Karnataka. Needed for gst_india.';
comment on column public.organizations.default_tax_rate_bp is 'Tax rate used when a service does not set its own. Basis points: 1800 = 18%.';
comment on column public.organizations.prices_include_tax is 'True when rate card prices already contain tax, so tax is backed out instead of added on top.';
comment on column public.organizations.invoice_prefix is 'Start of every invoice number, 1 to 4 capital letters or digits, not CN (credit notes use it). WB gives WB/27-28/0001.';
comment on column public.organizations.fiscal_year_start_month is 'Month the financial year starts. 4 (April) for India, 1 for calendar-year countries.';
comment on column public.organizations.round_invoice_totals is 'Round invoice grand totals to a whole currency unit and show the difference as round off.';
comment on column public.organizations.upi_vpa is 'UPI ID that receives payments, e.g. happytails@okhdfcbank. Used to build pay links and QR codes.';
comment on column public.organizations.check_in_time is 'Usual earliest arrival time. Shown to parents; not enforced.';
comment on column public.organizations.check_out_time is 'Usual latest pickup time. Shown to parents; not enforced.';
comment on column public.organizations.allow_overbooking is 'When false, the database refuses a booking that would put more pets in house than there are active kennels.';
comment on column public.organizations.play_sessions_per_day is 'Solo play sessions each boarded pet should get per day. 0 turns play scheduling off.';
comment on column public.organizations.play_session_minutes is 'Normal length of one play session. Peak periods can override it.';
comment on column public.organizations.play_changeover_minutes is 'Minutes a yard stands empty between two pets, to walk one out and the next in.';
comment on column public.organizations.play_day_start is 'When the play yards open. Local clock time at the kennel.';
comment on column public.organizations.play_day_end is 'When the play yards close. No session runs past this.';
comment on column public.organizations.play_break_start is 'Start of an optional break in play, such as the midday heat. Empty for no break.';
comment on column public.organizations.play_break_end is 'End of the optional break in play.';
comment on column public.organizations.intake_enabled is 'Whether the public intake form at /i/{slug} accepts submissions.';
comment on column public.organizations.requests_enabled is 'Whether parents can ask for stays through their own booking link (/b/{token}, submit_booking_request).';
comment on column public.organizations.intake_notice is 'Privacy and consent text shown on the intake form, in the kennel''s own words. A default, in the parent pages'' language, is used when empty.';
comment on column public.organizations.offers_appointments is
  'Whether the kennel books services by the hour: grooming, swimming, training, parties (D44). Off: none of it is shown.';
comment on column public.organizations.offers_kitchen is
  'Whether the kennel cooks food in its own kitchen, for boarders and to sell (D44). Off: none of it is shown.';
comment on column public.organizations.offers_food_delivery is
  'Whether the kennel delivers its food to parents at home (D44). Needs offers_kitchen. Turns on parents'' addresses and the areas served.';
comment on column public.organizations.portion_small_bp is
  'A small dog''s day of food as a share of its body weight, in basis points: 300 is 3% (M28). Medium and large have their own.';
comment on column public.organizations.portion_medium_bp is 'A medium dog''s day of food as a share of its body weight, in basis points: 250 is 2.5%.';
comment on column public.organizations.portion_large_bp is 'A large dog''s day of food as a share of its body weight, in basis points: 200 is 2%.';
comment on column public.organizations.small_dog_max_g is 'Up to this weight, in grams, a dog is small for portions. 10000 is 10 kg.';
comment on column public.organizations.medium_dog_max_g is 'Up to this weight, in grams, a dog is medium for portions; heavier is large. 25000 is 25 kg.';
comment on column public.organizations.topper_share_bp is 'A topper plan''s share of the day''s food, in basis points: 3333 is a third.';
comment on column public.organizations.goal_change_bp is 'How much less a dog that should lose weight eats, and more one that should gain, in basis points: 1000 is 10%.';
comment on column public.organizations.food_pack_g is 'Grams in one pack of food. Deliveries are rounded up to whole packs. A multiple of 10 grams.';
comment on column public.organizations.food_cutoff_hours is 'How many hours before a delivery''s slot changes to it close; after that it is being cooked.';
comment on column public.organizations.monthly_food_discount_bp is 'Discount on food paid a month ahead, in basis points: 500 is 5%. 0 for none.';
comment on column public.organizations.cook_margin_bp is 'Extra food the cook plan adds on top of what is needed, in basis points: 1000 is 10%.';
comment on column public.organizations.problem_window_hours is 'How many hours after a delivery a parent may report it damaged, late or wrong.';
comment on column public.organizations.food_orders_enabled is 'Whether the public food order page at /f/{slug} takes orders (M32). It also needs food delivery switched on.';
comment on column public.organizations.parent_language is 'Language of the pages and messages parents see: the intake form, stay page and WhatsApp messages. en, hi or kn. Bills are in English (clients.bill_translation adds a language on request).';

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create function public.validate_organization()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'WB010: unknown time zone "%"', new.time_zone using errcode = '22023';
  end if;
  return new;
end;
$$;
comment on function public.validate_organization() is 'Trigger: rejects an unknown time zone, which would otherwise break every date calculation.';

create trigger organizations_validate
  before insert or update of time_zone on public.organizations
  for each row execute function public.validate_organization();

-- ---------------------------------------------------------------------------
-- Memberships: which signed-in user belongs to which organisation
-- ---------------------------------------------------------------------------

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'staff',
  display_name text not null check (char_length(display_name) between 1 and 80),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  language text not null default 'en' check (language in ('en', 'hi', 'kn')),
  skills public.staff_skill[] not null default '{}',
  is_active boolean not null default false,
  accepted_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id),
  -- Nobody is a working member of an organisation without having agreed to it.
  constraint memberships_active_needs_acceptance check (not is_active or accepted_at is not null)
);

comment on table public.memberships is
  'Links a signed-in user to an organisation with a role. Row level security on every other table is decided by this table.';
comment on column public.memberships.display_name is 'Name shown next to this person''s actions, e.g. "Ravi".';
comment on column public.memberships.is_active is
  'Whether this person can use the organisation right now. False while an invitation is pending, and set false again to cut off access at once without losing the history of who did what.';
comment on column public.memberships.accepted_at is
  'When the person accepted the invitation. Empty means the invitation is still pending. Only respond_to_invitation() and create_organization() set it.';
comment on column public.memberships.invited_by is 'Who sent the invitation.';
comment on column public.memberships.skills is
  'What this person can be given to do in this kennel (staff_skill), set by owners and managers. Decides who is offered a job, not what they may see.';
comment on column public.memberships.language is 'The language this person reads Wagbook in: en, hi or kn. Set by the person with set_my_language(), for all their kennels at once.';

create index memberships_user_id_idx on public.memberships (user_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

create function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- When the whole organisation is being deleted there is nothing to protect.
  if not exists (select 1 from public.organizations o where o.id = old.org_id) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- One at a time per organisation, so two owners removing each other at the
  -- same moment cannot both succeed.
  perform pg_advisory_xact_lock(hashtextextended('owners:' || old.org_id::text, 0));

  if old.role = 'owner' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'owner' or not new.is_active or new.org_id <> old.org_id or new.user_id <> old.user_id)
     and not exists (
       select 1 from public.memberships m
       where m.org_id = old.org_id and m.role = 'owner' and m.is_active and m.user_id <> old.user_id
     )
  then
    raise exception 'WB011: a kennel must keep at least one active owner' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
comment on function public.protect_last_owner() is 'Trigger: stops the last active owner from being removed, demoted or deactivated.';

create trigger memberships_protect_last_owner
  before update or delete on public.memberships
  for each row execute function public.protect_last_owner();

-- ---------------------------------------------------------------------------
-- Who am I allowed to see? Used by every row level security policy.
-- SECURITY DEFINER so that reading memberships here does not itself trigger
-- the memberships policies (which would loop).
-- ---------------------------------------------------------------------------

-- Two-step sign-in (roadmap M9). Someone who has turned it on is not fully
-- signed in until they have also given the code from their authenticator app:
-- Supabase Auth then issues a session at assurance level aal2. Until then,
-- with only a password, they reach nothing of any kennel. So a stolen password
-- alone is useless, whatever the app does.
--
-- A person who has lost their phone can still get in with one of their
-- recovery codes (D43). Each code works once, for one session: the session
-- that used it counts as having given its code, in this database only.
-- Supabase Auth still sees it at aal1, so the lost authenticator cannot be
-- removed from it; whoever runs the installation does that (docs/10). A code
-- belongs to the authenticator it was made for, so turning two-step sign-in
-- off, or setting up a new phone, makes the old codes worthless.
create table public.recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  factor_id uuid not null,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  used_at timestamptz,
  used_in_session text,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash),
  constraint recovery_codes_used_together check ((used_at is null) = (used_in_session is null))
);
comment on table public.recovery_codes is
  'Two-step sign-in recovery codes, one row a code, kept only as a hash. Sealed: no policy, no grant; only make_recovery_codes(), use_recovery_code() and recovery_codes_left() reach it.';
comment on column public.recovery_codes.factor_id is 'The authenticator (auth.mfa_factors) the code was made for. Once that is gone or replaced, the code no longer counts.';
comment on column public.recovery_codes.code_hash is 'SHA-256 of the code, in hex. The code itself is shown once and never stored.';
comment on column public.recovery_codes.used_in_session is 'The session (the session_id in its token) that used the code. That session counts as having given its code.';

alter table public.recovery_codes enable row level security;
create index recovery_codes_user_idx on public.recovery_codes (user_id);

create function public.session_meets_mfa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      )
      or exists (
        select 1
        from public.recovery_codes r
        join auth.mfa_factors f on f.id = r.factor_id and f.user_id = r.user_id and f.status = 'verified'
        where r.user_id = (select auth.uid())
          and r.used_in_session = (select auth.jwt()) ->> 'session_id'
      );
$$;
comment on function public.session_meets_mfa() is
  'True unless the signed-in user has a two-step sign-in factor and this session has not used it yet (assurance level aal1), nor a recovery code for that factor. SECURITY DEFINER because only it may read auth.mfa_factors and recovery_codes.';

-- Ten new recovery codes for the signed-in person, replacing any earlier
-- ones, shown once. Only from a session that gave its code from the app
-- (aal2): a session let in by a recovery code cannot make more.
create function public.make_recovery_codes()
returns setof text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_factor uuid;
  v_code text;
begin
  -- SECURITY DEFINER: recovery_codes is sealed, and auth.mfa_factors is read here.
  if v_user is null then
    raise exception 'WB001: sign in first' using errcode = '42501';
  end if;
  select f.id into v_factor
  from auth.mfa_factors f
  where f.user_id = v_user and f.status = 'verified'
  order by f.created_at desc
  limit 1;
  if v_factor is null then
    raise exception 'WB006: turn on two-step sign-in first' using errcode = '23514';
  end if;
  if coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'WB005: enter the code from your authenticator app first' using errcode = '42501';
  end if;
  delete from public.recovery_codes r where r.user_id = v_user;
  for i in 1..10 loop
    -- 48 random bits, written as three groups of four: 3f9a-0c71-be42.
    v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4);
    insert into public.recovery_codes (user_id, factor_id, code_hash)
    values (v_user, v_factor, encode(sha256(convert_to(replace(v_code, '-', ''), 'UTF8')), 'hex'));
    return next v_code;
  end loop;
end;
$$;
comment on function public.make_recovery_codes() is
  'Makes ten one-use recovery codes for the signed-in person''s authenticator, replacing earlier ones, and returns them (the only time they are seen). Needs a session that gave its code (WB005) and two-step sign-in on (WB006).';

-- Use a recovery code instead of the authenticator app, for this session.
-- Returns how many codes are left.
create function public.use_recovery_code(p_code text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session text := (select auth.jwt()) ->> 'session_id';
  v_id uuid;
begin
  -- SECURITY DEFINER: recovery_codes is sealed. The caller is the person whose code it is.
  if v_user is null or v_session is null then
    raise exception 'WB001: sign in first' using errcode = '42501';
  end if;
  select r.id into v_id
  from public.recovery_codes r
  join auth.mfa_factors f on f.id = r.factor_id and f.user_id = r.user_id and f.status = 'verified'
  where r.user_id = v_user
    and r.used_at is null
    and r.code_hash = encode(sha256(convert_to(regexp_replace(lower(coalesce(p_code, '')), '[^0-9a-f]', '', 'g'), 'UTF8')), 'hex')
  for update of r;
  if v_id is null then
    raise exception 'WB007: that recovery code is not right, or it has been used' using errcode = '22023';
  end if;
  update public.recovery_codes r set used_at = now(), used_in_session = v_session where r.id = v_id;
  return public.recovery_codes_left();
end;
$$;
create function public.recovery_codes_left()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.recovery_codes r
  join auth.mfa_factors f on f.id = r.factor_id and f.user_id = r.user_id and f.status = 'verified'
  where r.user_id = (select auth.uid()) and r.used_at is null;
$$;
comment on function public.recovery_codes_left() is
  'How many unused recovery codes the signed-in person has for their current authenticator. SECURITY DEFINER because recovery_codes is sealed.';

comment on function public.use_recovery_code(text) is
  'Spends one of the signed-in person''s recovery codes on this session, which then counts as having given its code (session_meets_mfa). Returns the codes left. A wrong or used code raises WB007.';

create function public.my_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid()) and m.is_active and m.role <> 'rider' and public.session_meets_mfa();
$$;
comment on function public.my_org_ids() is
  'Organisations the signed-in user is an active member of, other than as a rider. The basis of tenant isolation. Empty for a session that still owes its two-step code. A rider reaches only their own run, through the rider functions (D45).';

create function public.my_rider_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid()) and m.is_active and m.role = 'rider' and public.session_meets_mfa();
$$;
comment on function public.my_rider_org_ids() is 'Organisations where the signed-in user is an active rider (D45).';

create function public.my_org_ids_with_role(p_roles public.member_role[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid()) and m.is_active and m.role = any (p_roles) and public.session_meets_mfa();
$$;
comment on function public.my_org_ids_with_role(public.member_role[]) is
  'Organisations where the signed-in user holds one of the given roles.';

-- ---------------------------------------------------------------------------
-- Creating an organisation and adding people
-- ---------------------------------------------------------------------------

create function public.create_organization(p_name text, p_slug text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
begin
  if v_user is null then
    raise exception 'WB001: sign in first' using errcode = '28000';
  end if;
  if not public.session_meets_mfa() then
    raise exception 'WB005: enter the code from your authenticator app first' using errcode = '28000';
  end if;

  -- One at a time per person, so the limit below cannot be raced past.
  perform pg_advisory_xact_lock(hashtextextended('create-org:' || v_user::text, 0));
  if (select count(*) from public.memberships m where m.user_id = v_user and m.role = 'owner') >= 5 then
    raise exception 'WB012: you already own the maximum number of kennels' using errcode = '23514';
  end if;

  insert into public.organizations (name, slug)
  values (btrim(p_name), lower(btrim(p_slug)))
  returning id into v_org;

  insert into public.memberships (org_id, user_id, role, display_name, is_active, accepted_at)
  values (v_org, v_user, 'owner', coalesce(nullif(btrim(p_display_name), ''), 'Owner'), true, now());

  return v_org;
end;
$$;
comment on function public.create_organization(text, text, text) is
  'Creates an organisation and makes the signed-in user its owner. The only way an organisation comes into being.';

-- Adding people is an invitation, never an enrolment: the invited person has
-- to accept before they become a member. Otherwise anyone could create a
-- look-alike organisation and silently drop someone else's account into it.
create function public.invite_member_by_email(
  p_org uuid,
  p_email text,
  p_role public.member_role,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_existing public.memberships;
  v_caller_is_owner boolean;
begin
  if p_org not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB002: only an owner or manager can invite people' using errcode = '42501';
  end if;
  v_caller_is_owner := p_org in (select public.my_org_ids_with_role(array['owner']::public.member_role[]));
  if p_role = 'owner' and not v_caller_is_owner then
    raise exception 'WB002: only an owner can invite another owner' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception 'WB014: enter the person''s name' using errcode = '22023';
  end if;

  select u.id into v_target from auth.users u where lower(u.email) = lower(btrim(p_email));
  -- Same silent answer whether or not the email has an account, so this
  -- function cannot be used to find out who has signed up.
  if v_target is null then
    return;
  end if;

  select * into v_existing from public.memberships m where m.org_id = p_org and m.user_id = v_target;
  if v_existing.user_id is null then
    insert into public.memberships (org_id, user_id, role, display_name, is_active, accepted_at, invited_by)
    values (p_org, v_target, p_role, btrim(p_display_name), false, null, (select auth.uid()));
  elsif v_existing.role = 'owner' and not v_caller_is_owner then
    raise exception 'WB002: only an owner can change an owner' using errcode = '42501';
  elsif v_existing.accepted_at is not null then
    -- Already a member. A second invitation never changes a member: roles of
    -- members are changed by updating the membership, which the policies limit
    -- (managers cannot touch owners). Otherwise "invite" would be a way to
    -- demote a colleague.
    return;
  else
    -- Invited but not yet accepted: the invitation can be corrected.
    update public.memberships m
    set role = p_role, display_name = btrim(p_display_name)
    where m.org_id = p_org and m.user_id = v_target and m.accepted_at is null;
  end if;
end;
$$;
comment on function public.invite_member_by_email(uuid, text, public.member_role, text) is
  'Invites an existing account to an organisation, or corrects an invitation that has not been answered yet. Someone who is already a member is left unchanged. The person becomes a member only when they accept. Owner or manager only; only owners can invite or change owners. Returns nothing in every case.';

create function public.my_invitations()
returns table (org_id uuid, org_name text, role public.member_role, invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id, o.name, m.role, m.created_at
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.user_id = (select auth.uid()) and m.accepted_at is null and public.session_meets_mfa()
  order by m.created_at;
$$;
comment on function public.my_invitations() is
  'Invitations waiting for the signed-in user: which organisation, and in what role. Needed because a person cannot read an organisation they have not joined yet.';

create function public.respond_to_invitation(p_org uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'WB001: sign in first' using errcode = '28000';
  end if;
  if not public.session_meets_mfa() then
    raise exception 'WB005: enter the code from your authenticator app first' using errcode = '28000';
  end if;

  if p_accept then
    update public.memberships m
    set is_active = true, accepted_at = now()
    where m.org_id = p_org and m.user_id = v_user and m.accepted_at is null;
  else
    delete from public.memberships m
    where m.org_id = p_org and m.user_id = v_user and m.accepted_at is null;
  end if;

  if not found then
    raise exception 'WB015: that invitation is no longer open' using errcode = 'P0002';
  end if;
end;
$$;
comment on function public.respond_to_invitation(uuid, boolean) is
  'Accepts or declines a pending invitation for the signed-in user. The only way a membership becomes active, apart from creating an organisation.';

-- ---------------------------------------------------------------------------
-- Invitation links: for someone who has no Wagbook account yet.
--
-- A manager makes a link and sends it (on WhatsApp, usually). Whoever opens it
-- signs up or signs in, sees which kennel and role it is for, and joins. The
-- link is a secret: it works once, for seven days, and can be withdrawn.
-- Nobody writes this table directly; the functions below do.
-- ---------------------------------------------------------------------------

create table public.invitation_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  token text not null unique default public.new_token(),
  role public.member_role not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  constraint invitation_links_used_together check ((used_at is null) = (used_by is null))
);

comment on table public.invitation_links is
  'A one-time link that lets someone with no account yet join an organisation in a given role. Made by create_invitation_link(), used by accept_invitation_link().';
comment on column public.invitation_links.token is 'The secret in the link (/join/{token}). Anyone holding it can use it once, so it expires and can be withdrawn.';
comment on column public.invitation_links.display_name is 'The name the person will be shown under, as the inviter typed it.';
comment on column public.invitation_links.revoked_at is 'Set when a manager withdraws the link. A withdrawn link cannot be used.';

create index invitation_links_org_idx on public.invitation_links (org_id, created_at desc);

create function public.create_invitation_link(p_org uuid, p_role public.member_role, p_display_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  -- SECURITY DEFINER: nobody may insert into invitation_links directly, so
  -- the role rules below cannot be skipped. They mirror invite_member_by_email().
  if p_org not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB002: only an owner or manager can invite people' using errcode = '42501';
  end if;
  if p_role = 'owner' and p_org not in (select public.my_org_ids_with_role(array['owner']::public.member_role[])) then
    raise exception 'WB002: only an owner can invite another owner' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception 'WB014: enter the person''s name' using errcode = '22023';
  end if;
  insert into public.invitation_links (org_id, role, display_name, created_by)
  values (p_org, p_role, btrim(p_display_name), (select auth.uid()))
  returning token into v_token;
  return v_token;
end;
$$;
comment on function public.create_invitation_link(uuid, public.member_role, text) is
  'Makes an invitation link for someone with no account yet. Owner or manager; only owners can invite owners. Returns the secret token.';

create function public.get_invitation_link(p_token text)
returns table (org_name text, role public.member_role, display_name text, usable boolean, already_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  -- SECURITY DEFINER: the person opening the link is not a member yet, so
  -- cannot read the organisation. They see its name and the role, nothing else.
  select o.name, l.role, l.display_name,
         l.used_at is null and l.revoked_at is null and l.expires_at > now(),
         exists (select 1 from public.memberships m where m.org_id = l.org_id and m.user_id = (select auth.uid()) and m.accepted_at is not null)
  from public.invitation_links l
  join public.organizations o on o.id = l.org_id
  where (select auth.uid()) is not null and char_length(p_token) = 64 and l.token = p_token;
$$;
comment on function public.get_invitation_link(text) is
  'What an invitation link is for (kennel name, role, name), for a signed-in person holding it, and whether it can still be used.';

create function public.accept_invitation_link(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_link public.invitation_links;
  v_member public.memberships;
begin
  -- SECURITY DEFINER: joining creates a membership, which no policy allows a
  -- non-member to insert. The token is the permission, checked here.
  if v_user is null then
    raise exception 'WB001: sign in first' using errcode = '28000';
  end if;
  if not public.session_meets_mfa() then
    raise exception 'WB005: enter the code from your authenticator app first' using errcode = '28000';
  end if;
  select * into v_link from public.invitation_links l where char_length(p_token) = 64 and l.token = p_token for update;
  if v_link.id is null or v_link.used_at is not null or v_link.revoked_at is not null or v_link.expires_at <= now() then
    raise exception 'WB016: that invitation link has expired or was already used. Ask for a new one.' using errcode = 'P0002';
  end if;

  select * into v_member from public.memberships m where m.org_id = v_link.org_id and m.user_id = v_user;
  if v_member.accepted_at is not null then
    raise exception 'WB017: you already work at this kennel' using errcode = '23505';
  elsif v_member.user_id is not null then
    -- An email invitation was waiting: the link answers it.
    update public.memberships m
    set role = v_link.role, display_name = v_link.display_name, is_active = true, accepted_at = now()
    where m.org_id = v_link.org_id and m.user_id = v_user;
  else
    insert into public.memberships (org_id, user_id, role, display_name, is_active, accepted_at, invited_by)
    values (v_link.org_id, v_user, v_link.role, v_link.display_name, true, now(), v_link.created_by);
  end if;

  update public.invitation_links l set used_at = now(), used_by = v_user where l.id = v_link.id;
  return v_link.org_id;
end;
$$;
comment on function public.accept_invitation_link(text) is
  'Joins the signed-in person to the organisation of an invitation link, in its role. Works once; refuses an expired or withdrawn link and someone who is already a member.';

-- ---------------------------------------------------------------------------
-- The language a person reads Wagbook in.
-- ---------------------------------------------------------------------------

create function public.set_my_language(p_language text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER: only owners and managers may update membership rows
  -- (memberships_update), but everyone chooses their own language. This
  -- touches only the caller's own rows, and only the language column.
  if (select auth.uid()) is null then
    raise exception 'WB001: sign in first' using errcode = '28000';
  end if;
  if not public.session_meets_mfa() then
    raise exception 'WB005: enter the code from your authenticator app first' using errcode = '28000';
  end if;
  if p_language is null or p_language not in ('en', 'hi', 'kn') then
    raise exception 'WB013: that language is not offered yet.' using errcode = '22023';
  end if;
  update public.memberships m set language = p_language where m.user_id = (select auth.uid());
end;
$$;
comment on function public.set_my_language(text) is
  'Sets the signed-in person''s language (en, hi or kn) in every kennel they belong to. Changes nothing else.';
