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

create type public.member_role as enum ('owner', 'manager', 'staff');
comment on type public.member_role is
  'owner: everything, including people and deleting the organisation. manager: everything except owners. staff: daily operations.';

create type public.tax_mode as enum ('none', 'simple', 'gst_india');
comment on type public.tax_mode is
  'none: no tax charged. simple: one tax at one rate (VAT, sales tax). gst_india: CGST+SGST within a state, IGST across states.';

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
  invoice_prefix text not null default 'WB' check (invoice_prefix ~ '^[A-Z0-9]{1,4}$'),
  fiscal_year_start_month smallint not null default 4 check (fiscal_year_start_month between 1 and 12),
  round_invoice_totals boolean not null default true,
  upi_vpa text check (upi_vpa is null or upi_vpa ~ '^[a-zA-Z0-9._-]{2,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$'),
  upi_payee_name text,
  check_in_time time not null default '10:00',
  check_out_time time not null default '12:00',
  allow_overbooking boolean not null default false,
  play_sessions_per_day smallint not null default 0 check (play_sessions_per_day between 0 and 12),
  play_session_minutes smallint not null default 20 check (play_session_minutes between 5 and 240),
  intake_enabled boolean not null default true,
  intake_notice text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_gst_needs_registration
    check (tax_mode <> 'gst_india' or (tax_id is not null and gst_state_code is not null))
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
comment on column public.organizations.invoice_prefix is 'Start of every invoice number, 1 to 4 capital letters or digits. WB gives WB/27-28/0001.';
comment on column public.organizations.fiscal_year_start_month is 'Month the financial year starts. 4 (April) for India, 1 for calendar-year countries.';
comment on column public.organizations.round_invoice_totals is 'Round invoice grand totals to a whole currency unit and show the difference as round off.';
comment on column public.organizations.upi_vpa is 'UPI ID that receives payments, e.g. happytails@okhdfcbank. Used to build pay links and QR codes.';
comment on column public.organizations.check_in_time is 'Usual earliest arrival time. Shown to parents; not enforced.';
comment on column public.organizations.check_out_time is 'Usual latest pickup time. Shown to parents; not enforced.';
comment on column public.organizations.allow_overbooking is 'When false, the database refuses a booking that would put more pets in house than there are active kennels.';
comment on column public.organizations.play_sessions_per_day is 'Solo play sessions each boarded pet should get per day. 0 turns play scheduling off.';
comment on column public.organizations.play_session_minutes is 'Normal length of one play session. Peak periods can override it.';
comment on column public.organizations.intake_enabled is 'Whether the public intake form at /i/{slug} accepts submissions.';
comment on column public.organizations.intake_notice is 'Privacy and consent text shown on the intake form, in the kennel''s own words. A default is used when empty.';

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

create function public.my_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid()) and m.is_active;
$$;
comment on function public.my_org_ids() is 'Organisations the signed-in user is an active member of. The basis of tenant isolation.';

create function public.my_org_ids_with_role(p_roles public.member_role[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid()) and m.is_active and m.role = any (p_roles);
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
  where m.user_id = (select auth.uid()) and m.accepted_at is null
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
