-- =============================================================================
-- Wagbook 0003: kennels, the rate card, peak periods and bookings
-- =============================================================================

create table public.kennels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  zone text,
  notes text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name)
);

comment on table public.kennels is
  'A place one pet stays: a kennel, room, run or suite. The number of active kennels is the organisation''s capacity.';
comment on column public.kennels.name is 'Short label painted on the door, e.g. K07 or "Suite 2".';
comment on column public.kennels.zone is 'Optional grouping such as a block or wing, for sorting the board.';
comment on column public.kennels.is_active is 'False takes the kennel out of service (repairs, deep cleaning) and out of the capacity count.';

create trigger kennels_set_updated_at
  before update on public.kennels
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------

create type public.service_kind as enum ('boarding', 'daycare', 'addon');
comment on type public.service_kind is
  'boarding: an overnight stay, priced per night. daycare: day boarding, priced per day. addon: an extra such as grooming.';

create table public.services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind public.service_kind not null,
  name text not null check (char_length(name) between 1 and 80),
  unit text not null default 'each' check (unit in ('night', 'day', 'each', 'hour')),
  price_minor bigint not null check (price_minor >= 0),
  tax_rate_bp integer check (tax_rate_bp is null or tax_rate_bp between 0 and 10000),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);

comment on table public.services is
  'The rate card. A boarding or daycare row sets the price of a stay; addon rows are extras such as grooming or pick-up.';
comment on column public.services.unit is 'What one quantity means: night for boarding, day for day boarding, each or hour for add-ons.';
comment on column public.services.tax_rate_bp is 'Tax rate for this service in basis points. Empty means use the organisation default.';
comment on column public.services.sac_code is 'Services Accounting Code printed on Indian tax invoices. The kennel''s accountant decides the code.';
comment on column public.services.is_default is 'The service pre-selected for new bookings of its kind. At most one per kind.';

create unique index services_one_default_per_kind on public.services (org_id, kind) where is_default and is_active;
create index services_org_idx on public.services (org_id, kind, sort_order);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------

create table public.peak_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  start_date date not null,
  end_date date not null,
  no_refund boolean not null default false,
  play_session_minutes smallint check (play_session_minutes is null or play_session_minutes between 5 and 240),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

comment on table public.peak_periods is
  'Busy stretches such as Diwali week or a long weekend. Used to warn about cancellation terms and to shorten play sessions when the house is full.';
comment on column public.peak_periods.end_date is 'Last day of the period, inclusive.';
comment on column public.peak_periods.no_refund is 'True when bookings touching this period are not refunded on cancellation.';
comment on column public.peak_periods.play_session_minutes is 'Play session length during this period. Empty means the organisation''s normal length.';

create index peak_periods_org_dates_idx on public.peak_periods (org_id, start_date, end_date);

create trigger peak_periods_set_updated_at
  before update on public.peak_periods
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

create type public.booking_kind as enum ('boarding', 'daycare');
comment on type public.booking_kind is 'boarding: overnight, charged per night. daycare: day boarding with no night, charged per day.';
create type public.booking_status as enum ('requested', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show');
comment on type public.booking_status is
  'requested: asked for, not yet accepted, holds no space. confirmed: space is held. checked_in: the pet is in house. checked_out: gone home. cancelled and no_show: space released.';

-- The days a stay holds a kennel, as a half-open range [first day, day after last).
--   boarding 14th to 17th  -> [14th, 17th): the nights of the 14th, 15th, 16th.
--                             The kennel is free again on the 17th, so one pet
--                             can leave and another arrive on the same day.
--   daycare  14th to 16th  -> [14th, 17th): the days 14th, 15th and 16th,
--                             because a day boarding end date is the last day
--                             attended.
-- Every rule about space (the constraints below, capacity, occupancy,
-- available kennels) uses this one function, so they can never disagree.
-- Must match staysOverlap() in src/lib/core/dates.ts.
create function public.stay_range(p_kind public.booking_kind, p_start date, p_end date)
returns daterange
language sql
immutable
set search_path = ''
as $$
  select daterange(p_start, case when p_kind = 'daycare' then p_end + 1 else p_end end, '[)');
$$;
comment on function public.stay_range(public.booking_kind, date, date) is
  'The days a stay holds a kennel: check-in up to but not including check-out for boarding; first to last day inclusive for day boarding.';

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  pet_id uuid not null,
  kind public.booking_kind not null default 'boarding',
  status public.booking_status not null default 'confirmed',
  start_date date not null,
  end_date date not null,
  kennel_id uuid,
  rate_minor bigint not null check (rate_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  expected_arrival time,
  expected_departure time,
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users (id) on delete set null,
  checked_out_at timestamptz,
  checked_out_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  belongings text,
  gate_notes text,
  vaccinations_checked_at timestamptz,
  vaccinations_checked_by uuid references auth.users (id) on delete set null,
  notes text,
  source text not null default 'staff' check (source in ('staff', 'intake')),
  group_id uuid,
  public_token text not null unique default public.new_token(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  -- Lets care tasks, play sessions and updates prove they are about this booking's pet.
  unique (org_id, id, pet_id),
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete restrict,
  -- The pet must belong to the client on the booking.
  foreign key (org_id, client_id, pet_id) references public.pets (org_id, client_id, id) on delete restrict,
  foreign key (org_id, kennel_id) references public.kennels (org_id, id) on delete set null (kennel_id),
  constraint bookings_dates_in_order check (end_date >= start_date),
  constraint bookings_boarding_has_a_night check (kind <> 'boarding' or end_date > start_date),
  constraint bookings_at_most_a_year check (end_date - start_date <= 366),

  -- THE double-booking guard. Two bookings that hold space can never overlap
  -- in the same kennel. See stay_range() for exactly which days a stay holds.
  constraint bookings_no_kennel_overlap exclude using gist (
    kennel_id with =,
    public.stay_range(kind, start_date, end_date) with &&
  ) where (kennel_id is not null and status in ('confirmed', 'checked_in')),

  -- The same pet cannot be booked twice for the same days.
  constraint bookings_no_pet_overlap exclude using gist (
    pet_id with =,
    public.stay_range(kind, start_date, end_date) with &&
  ) where (status in ('confirmed', 'checked_in'))
);

comment on table public.bookings is
  'One pet''s stay: overnight boarding or day boarding. Siblings staying together are separate bookings sharing a group_id.';
comment on column public.bookings.start_date is 'Check-in date (calendar date at the kennel).';
comment on column public.bookings.end_date is 'Check-out date. Boarding nights = end_date - start_date. For day boarding, the last day attended (so a single day has start_date = end_date).';
comment on column public.bookings.kennel_id is 'The kennel assigned. May stay empty until check-in; capacity is still checked.';
comment on column public.bookings.rate_minor is 'Price per night (boarding) or per day (daycare), copied from the rate card when booked so later price changes do not rewrite history.';
comment on column public.bookings.discount_minor is 'Discount on the stay itself, before tax.';
comment on column public.bookings.tax_rate_bp is 'Tax rate for the stay, copied when booked.';
comment on column public.bookings.expected_arrival is 'When the parent said they would drop off. For planning the day; not enforced.';
comment on column public.bookings.belongings is 'What came with the pet (bed, leash, food, medicines) so it all goes home again.';
comment on column public.bookings.gate_notes is 'Anything the parent said at drop-off: a change of food, a recent illness, who will collect.';
comment on column public.bookings.vaccinations_checked_at is
  'When a staff member confirmed at check-in that they had seen the pet''s vaccination certificates. Stamped by the database.';
comment on column public.bookings.vaccinations_checked_by is 'Who confirmed the vaccinations at check-in. Stamped by the database.';
comment on column public.bookings.source is 'staff: entered by the kennel. intake: started from the public intake form.';
comment on column public.bookings.group_id is 'Shared by bookings made together, e.g. two dogs from one family.';
comment on column public.bookings.public_token is 'Secret in the parent''s stay page link (/s/{token}). Anyone holding the link can see the stay, nothing else.';

create index bookings_org_dates_idx on public.bookings (org_id, start_date, end_date);
create index bookings_org_status_idx on public.bookings (org_id, status);
create index bookings_org_pet_idx on public.bookings (org_id, pet_id);
create index bookings_org_client_idx on public.bookings (org_id, client_id);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- Stamps who and when on check-in, check-out and cancellation, so the app
-- only has to change the status. The stamps are always the real signed-in
-- user and the real time: whatever a client sends for them is ignored.
create function public.bookings_stamp_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    new.created_by := v_user;
    new.checked_in_at := null;
    new.checked_in_by := null;
    new.checked_out_at := null;
    new.checked_out_by := null;
    new.cancelled_at := null;
  else
    new.created_by := old.created_by;
    new.checked_in_at := old.checked_in_at;
    new.checked_in_by := old.checked_in_by;
    new.checked_out_at := old.checked_out_at;
    new.checked_out_by := old.checked_out_by;
    new.cancelled_at := old.cancelled_at;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'checked_in' then
      new.checked_in_at := coalesce(new.checked_in_at, now());
      new.checked_in_by := coalesce(new.checked_in_by, v_user);
      -- Reopening a stay that was checked out by mistake.
      new.checked_out_at := null;
      new.checked_out_by := null;
    elsif new.status = 'checked_out' then
      new.checked_in_at := coalesce(new.checked_in_at, now());
      new.checked_in_by := coalesce(new.checked_in_by, v_user);
      new.checked_out_at := now();
      new.checked_out_by := v_user;
    elsif new.status in ('cancelled', 'no_show') then
      new.cancelled_at := now();
    elsif new.status in ('requested', 'confirmed') then
      -- Undoing a check-in or a cancellation.
      new.checked_in_at := null;
      new.checked_in_by := null;
      new.checked_out_at := null;
      new.checked_out_by := null;
      new.cancelled_at := null;
    end if;
  end if;
  return new;
end;
$$;
comment on function public.bookings_stamp_status() is
  'Trigger: records who and when as a booking is created, checked in, checked out or cancelled. Client-supplied values for these columns are ignored.';

create trigger bookings_stamp_status
  before insert or update on public.bookings
  for each row execute function public.bookings_stamp_status();

create trigger bookings_stamp_vaccinations_checked
  before insert or update on public.bookings
  for each row execute function public.stamp_when_set('vaccinations_checked_at', 'vaccinations_checked_by');

-- Price guard. Staff run the day, but the price of a stay is the business's
-- decision. Every member signs in as the same database role, so column grants
-- cannot tell a manager from staff; this trigger does. A database session with
-- no signed-in user (migrations, the seed) is not a member and is let through.
create function public.bookings_guard_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or new.org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
  then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.rate_minor is distinct from old.rate_minor
       or new.discount_minor is distinct from old.discount_minor
       or new.tax_rate_bp is distinct from old.tax_rate_bp
       or new.sac_code is distinct from old.sac_code
       or new.kind is distinct from old.kind
    then
      raise exception 'WB022: only an owner or manager can change the price or the kind of stay' using errcode = '42501';
    end if;
    return new;
  end if;

  -- A new booking by staff must be priced exactly as the price list says.
  if new.discount_minor <> 0 or not exists (
    select 1
    from public.services s
    join public.organizations o on o.id = s.org_id
    where s.org_id = new.org_id
      and s.is_active
      and s.kind::text = new.kind::text
      and s.price_minor = new.rate_minor
      and new.tax_rate_bp = case when o.tax_mode = 'none' then 0 else coalesce(s.tax_rate_bp, o.default_tax_rate_bp) end
      and new.sac_code is not distinct from s.sac_code
  ) then
    raise exception 'WB023: only an owner or manager can book at a price that is not on your price list' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function public.bookings_guard_price() is
  'Trigger: only owners and managers set or change what a stay costs. Staff can book only at a price on the price list, with no discount, and cannot change the price, discount, tax or kind of an existing booking.';

create trigger bookings_guard_price
  before insert or update on public.bookings
  for each row execute function public.bookings_guard_price();

-- Bookings made together (a family of pets) belong to one parent, so they can
-- be shown, confirmed and billed together.
create function public.bookings_check_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.group_id is not null and exists (
    select 1 from public.bookings b
    where b.org_id = new.org_id and b.group_id = new.group_id and b.client_id <> new.client_id
  ) then
    raise exception 'WB024: bookings made together must all be for one parent' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.bookings_check_group() is 'Trigger: every booking sharing a group_id has the same client.';

create trigger bookings_check_group
  before insert or update of group_id, client_id on public.bookings
  for each row execute function public.bookings_check_group();

-- Capacity guard. The kennel-overlap constraint above only protects bookings
-- that already have a kennel. This protects the house as a whole: more pets
-- than active kennels on any day is refused, kennel assigned or not.
create function public.bookings_check_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_allow boolean;
  v_day date;
  v_count integer;
begin
  -- A pet cannot be put into a kennel that is out of service.
  if new.kennel_id is not null
     and (tg_op = 'INSERT' or new.kennel_id is distinct from old.kennel_id)
     and not exists (select 1 from public.kennels k where k.id = new.kennel_id and k.is_active)
  then
    raise exception 'WB021: that kennel is out of service' using errcode = '23514';
  end if;

  if new.status not in ('confirmed', 'checked_in') then
    return null;
  end if;

  -- One capacity check at a time per organisation, so two simultaneous
  -- bookings for the last free kennel cannot both pass.
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text, 0));

  select o.allow_overbooking into v_allow from public.organizations o where o.id = new.org_id;
  if v_allow then
    return null;
  end if;

  select count(*) into v_capacity from public.kennels k where k.org_id = new.org_id and k.is_active;
  -- An organisation that has not set up kennels yet is not capacity limited.
  if v_capacity = 0 then
    return null;
  end if;

  select d.day::date, count(*)
    into v_day, v_count
  from generate_series(
         lower(public.stay_range(new.kind, new.start_date, new.end_date))::timestamp,
         (upper(public.stay_range(new.kind, new.start_date, new.end_date)) - 1)::timestamp,
         interval '1 day'
       ) as d (day)
  join public.bookings b
    on b.org_id = new.org_id
   and b.status in ('confirmed', 'checked_in')
   and public.stay_range(b.kind, b.start_date, b.end_date) @> d.day::date
  group by d.day
  having count(*) > v_capacity
  order by d.day
  limit 1;

  if v_day is not null then
    raise exception 'WB020: no space on % (% booked, % kennels)', v_day, v_count, v_capacity
      using errcode = '23P01', hint = 'Change the dates, free a kennel, or allow overbooking in settings.';
  end if;
  return null;
end;
$$;
comment on function public.bookings_check_capacity() is
  'Trigger: refuses a booking that would put more pets in house than there are active kennels on any day of the stay, and refuses a kennel that is out of service.';

create trigger bookings_check_capacity
  after insert or update of status, start_date, end_date, kind, kennel_id on public.bookings
  for each row execute function public.bookings_check_capacity();

-- ---------------------------------------------------------------------------
-- Extras on a booking
-- ---------------------------------------------------------------------------

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid not null,
  service_id uuid,
  description text not null check (char_length(description) between 1 and 200),
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, booking_id) references public.bookings (org_id, id) on delete cascade,
  foreign key (org_id, service_id) references public.services (org_id, id) on delete set null (service_id)
);

comment on table public.booking_items is
  'Add-ons charged on top of the stay: grooming, pick-up and drop, a vet bill paid on the parent''s behalf.';
comment on column public.booking_items.service_id is 'The rate card row this came from, if any. Description and price are copied so the item survives rate card edits.';

create index booking_items_org_booking_idx on public.booking_items (org_id, booking_id);

create trigger booking_items_set_updated_at
  before update on public.booking_items
  for each row execute function public.set_updated_at();

create trigger booking_items_stamp_actor
  before insert or update on public.booking_items
  for each row execute function public.stamp_actor('created_by');

-- The same price rule for extras. Staff may add an extra from the price list
-- at its listed price, or a one-off item such as a vet bill paid for the
-- parent, which only ever adds to the bill. Changing what an extra costs is for
-- owners and managers. Removing one is already manager only (policy).
create function public.booking_items_guard_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or new.org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
  then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.unit_price_minor is distinct from old.unit_price_minor
       or new.quantity is distinct from old.quantity
       or new.tax_rate_bp is distinct from old.tax_rate_bp
       or new.service_id is distinct from old.service_id
    then
      raise exception 'WB025: only an owner or manager can change what an extra costs' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.service_id is not null and not exists (
    select 1
    from public.services s
    join public.organizations o on o.id = s.org_id
    where s.org_id = new.org_id
      and s.id = new.service_id
      and s.is_active
      and s.price_minor = new.unit_price_minor
      and new.tax_rate_bp = case when o.tax_mode = 'none' then 0 else coalesce(s.tax_rate_bp, o.default_tax_rate_bp) end
  ) then
    raise exception 'WB023: only an owner or manager can book at a price that is not on your price list' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function public.booking_items_guard_price() is
  'Trigger: staff add extras from the price list at the listed price (or one-off items with no price list entry) and cannot change what an extra costs afterwards.';

create trigger booking_items_guard_price
  before insert or update on public.booking_items
  for each row execute function public.booking_items_guard_price();

-- ---------------------------------------------------------------------------
-- Reading occupancy. SECURITY INVOKER (the default), so row level security
-- applies and a caller only ever sees their own organisation.
-- ---------------------------------------------------------------------------

create function public.occupancy_by_day(p_org uuid, p_from date, p_to date)
returns table (day date, occupied integer, capacity integer)
language sql
stable
set search_path = ''
as $$
  select
    d.day::date,
    (select count(*)::integer
       from public.bookings b
      where b.org_id = p_org
        and b.status in ('confirmed', 'checked_in')
        and public.stay_range(b.kind, b.start_date, b.end_date) @> d.day::date),
    (select count(*)::integer from public.kennels k where k.org_id = p_org and k.is_active)
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as d (day)
  where p_to >= p_from and p_to - p_from <= 400;
$$;
comment on function public.occupancy_by_day(uuid, date, date) is
  'Pets in house and total kennels for each day in a range (at most 400 days). Powers the occupancy calendar.';

create function public.available_kennels(p_org uuid, p_kind public.booking_kind, p_start date, p_end date)
returns setof public.kennels
language sql
stable
set search_path = ''
as $$
  select k.*
  from public.kennels k
  where k.org_id = p_org
    and k.is_active
    and not exists (
      select 1
      from public.bookings b
      where b.org_id = p_org
        and b.kennel_id = k.id
        and b.status in ('confirmed', 'checked_in')
        and public.stay_range(b.kind, b.start_date, b.end_date) && public.stay_range(p_kind, p_start, p_end)
    )
  order by k.sort_order, k.name;
$$;
comment on function public.available_kennels(uuid, public.booking_kind, date, date) is
  'Active kennels with no booking holding them at any point in the given stay. Used to offer kennels when booking or checking in.';
