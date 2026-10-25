-- =============================================================================
-- Wagbook 00046: pick-up and drop, and health papers at the door
-- (Phase 3, M39 and M40, D47)
--
--   Trips      a stay's pick-up from home and drop back home, priced by the
--              area, a line on the stay's bill, and on a rider's run (M39).
--   Health     the vaccines, deworming, tick treatment and neutering a kennel
--              requires; check-in refuses a pet that lacks them while the
--              kennel says so, unless a manager let it in with a note (M40).
--
-- Row level security for these tables is in 0008 with the rest of the access
-- model, as for every table until the migration freeze.
-- =============================================================================

create type public.delivery_slot as enum ('morning', 'afternoon', 'evening');
comment on type public.delivery_slot is 'When a delivery arrives: morning (from 8), afternoon (from 1) or evening (from 6), kennel time. Changes close food_cutoff_hours before the slot starts.';

create type public.trip_kind as enum ('pickup', 'drop');
comment on type public.trip_kind is 'pickup: the kennel fetches the pet from home on the first day of its stay. drop: it takes the pet home on the last day.';

create type public.trip_status as enum ('planned', 'out', 'done', 'not_home', 'cancelled');
comment on type public.trip_status is
  'planned: to go. out: the rider is on the way. done: picked up or dropped. not_home: nobody there. cancelled: not going, with a reason.';

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid not null,
  client_id uuid not null,
  pet_id uuid not null,
  kind public.trip_kind not null,
  trip_date date not null,
  at_time time not null,
  slot public.delivery_slot not null default 'morning',
  address_id uuid,
  price_minor bigint check (price_minor is null or price_minor >= 0),
  tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  status public.trip_status not null default 'planned',
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  run_id uuid,
  run_position smallint,
  done_at timestamptz,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, booking_id, pet_id) references public.bookings (org_id, id, pet_id) on update cascade on delete cascade,
  foreign key (org_id, client_id, pet_id) references public.pets (org_id, client_id, id) on update cascade on delete restrict,
  -- Erasing a parent deletes their addresses; past trips keep the rest.
  foreign key (org_id, address_id) references public.client_addresses (org_id, id) on delete set null (address_id),
  constraint trips_cancel_has_reason check ((status = 'cancelled') = (cancel_reason is not null)),
  -- trips_check fills it in from the area when nobody gave one.
  constraint trips_priced check (price_minor is not null)
);

comment on table public.trips is
  'A stay''s pick-up from home on its first day, or drop back home on its last (M39): an address of the parent and a time, priced by the area when added, a line on the stay''s bill, and a stop on a rider''s run.';
comment on column public.trips.trip_date is 'The day it goes: the stay''s first day for a pick-up, its last for a drop. Kept in step with the stay.';
comment on column public.trips.address_id is 'Where the pet is picked up from or dropped at: an address of the stay''s parent. Empty only once the parent''s details were erased.';
comment on column public.trips.at_time is 'When the parent was told it would be, kennel time.';
comment on column public.trips.slot is 'The run slot it goes in, from its time: morning before 13:00, afternoon before 18:00, evening after.';
comment on column public.trips.price_minor is
  'What it costs, copied when added from the area of its address (service_areas.trip_charge_minor, else its delivery charge). Only owners and managers give another (WB022), and must outside the areas served (WB215).';
comment on column public.trips.run_id is 'The rider''s run it goes out on (M31).';
comment on column public.trips.run_position is 'Its place in the run.';
comment on column public.trips.done_at is 'When the rider marked it done or nobody home.';

-- One pick-up and one drop at a time for a stay.
create unique index trips_one_of_each_per_stay on public.trips (org_id, booking_id, kind) where status <> 'cancelled';
comment on index public.trips_one_of_each_per_stay is 'A stay has at most one live pick-up and one live drop.';
create index trips_org_date_idx on public.trips (org_id, trip_date, slot);

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

create trigger trips_stamp_actor
  before insert or update on public.trips
  for each row execute function public.stamp_actor('created_by');

-- A trip's day, slot, price, tax and code are the database's: the stay's first
-- or last day, the slot from its time, and the area's charge. Only an owner or
-- manager gives another price (D15). Runs as the caller.
create function public.trips_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_org public.organizations;
  v_charge bigint;
  v_served boolean;
  v_manager boolean;
begin
  select * into v_org from public.organizations o where o.id = new.org_id;
  if v_org.id is null then
    return new;
  end if;
  v_manager := (select auth.uid()) is null
    or new.org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]));
  select * into v_booking from public.bookings b where b.org_id = new.org_id and b.id = new.booking_id;
  if tg_op = 'UPDATE' and old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'WB216: a cancelled trip stays cancelled. Add a new one.' using errcode = '23514';
  end if;
  new.client_id := v_booking.client_id;
  new.trip_date := case when new.kind = 'pickup' then v_booking.start_date else v_booking.end_date end;
  new.slot := case when new.at_time < time '13:00' then 'morning' when new.at_time < time '18:00' then 'afternoon' else 'evening' end::public.delivery_slot;
  if new.status in ('done', 'not_home') and (tg_op = 'INSERT' or old.status not in ('done', 'not_home')) then
    new.done_at := now();
  elsif tg_op = 'UPDATE' then
    new.done_at := old.done_at;
  end if;

  if tg_op = 'UPDATE' and new.address_id is null then
    -- The address went with an erasure (D25): the trip keeps its price.
    new.price_minor := old.price_minor;
  elsif tg_op = 'INSERT' or new.address_id is distinct from old.address_id then
    select coalesce(sa.trip_charge_minor, sa.delivery_charge_minor, 0), sa.id is not null into v_charge, v_served
    from public.client_addresses a
    left join public.service_areas sa on sa.org_id = a.org_id and sa.postal_code = a.postal_code
    where a.org_id = new.org_id and a.id = new.address_id and a.client_id = new.client_id;
    if not found then
      raise exception 'WB215: choose an address of this parent' using errcode = '23514';
    end if;
    if not v_manager then
      if not coalesce(v_served, false) then
        raise exception 'WB215: that address is not in the areas you serve. An owner or manager sets the price.' using errcode = '42501';
      end if;
      new.price_minor := v_charge;
    elsif tg_op = 'INSERT' and new.price_minor is null then
      new.price_minor := coalesce(v_charge, 0);
    end if;
    -- A trip is a service of the stay: the stay's own tax rate and code.
    new.tax_rate_bp := v_booking.tax_rate_bp;
    new.sac_code := v_booking.sac_code;
  elsif not v_manager and (new.price_minor is distinct from old.price_minor or new.tax_rate_bp is distinct from old.tax_rate_bp) then
    raise exception 'WB022: only an owner or manager can change a price' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function public.trips_check() is
  'Trigger: a trip goes on its stay''s first day (pick-up) or last (drop) in the slot of its time, to an address of the stay''s parent (WB215), priced at the area''s trip charge with the stay''s tax; staff cannot price one outside the areas served (WB215) or change a price (WB022). A cancelled trip stays cancelled (WB216).';

create trigger trips_check
  before insert or update on public.trips
  for each row execute function public.trips_check();

-- A stay's trips follow it: cancelled with it, moved with its dates.
create function public.bookings_follow_trips()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'no_show') and old.status not in ('cancelled', 'no_show') then
    update public.trips t
    set status = 'cancelled', cancel_reason = case when new.status = 'no_show' then 'The pet did not come for its stay' else 'The stay was cancelled' end
    where t.org_id = new.org_id and t.booking_id = new.id and t.status in ('planned', 'out');
  elsif new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    -- trips_check sets the day again from the stay.
    update public.trips t set at_time = t.at_time
    where t.org_id = new.org_id and t.booking_id = new.id and t.status = 'planned';
  end if;
  return null;
end;
$$;
comment on function public.bookings_follow_trips() is
  'Trigger: a stay cancelled or not come cancels its trips still to go; a stay whose dates change moves its planned trips to its new first and last days.';

create trigger bookings_follow_trips
  after update of status, start_date, end_date on public.bookings
  for each row execute function public.bookings_follow_trips();

-- ---------------------------------------------------------------------------
-- Health papers at the door (M40)
-- ---------------------------------------------------------------------------

create table public.required_vaccines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  vaccine text not null check (char_length(btrim(vaccine)) between 1 and 60),
  months_valid smallint not null default 12 check (months_valid between 1 and 60),
  created_at timestamptz not null default now(),
  unique (org_id, id)
);

comment on table public.required_vaccines is
  'A vaccine the kennel requires at the door (M40), matched to a pet''s vaccinations by name without regard to case, spaces or underscores, and how many months it lasts from the day given when the card gives no end date.';

create unique index required_vaccines_one_each on public.required_vaccines (org_id, lower(btrim(vaccine)));
comment on index public.required_vaccines_one_each is 'Each vaccine is required once.';

create table public.health_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid,
  appointment_id uuid,
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (org_id, booking_id) references public.bookings (org_id, id) on delete cascade,
  foreign key (org_id, appointment_id) references public.appointments (org_id, id) on delete cascade,
  constraint health_overrides_one_subject check (num_nonnulls(booking_id, appointment_id) = 1)
);

comment on table public.health_overrides is
  'An owner or manager letting a pet in although it lacks what the kennel requires (M40), with the reason. A row, so History of changes shows who let a pet in and why.';

create index health_overrides_org_booking_idx on public.health_overrides (org_id, booking_id);

create trigger health_overrides_stamp_actor
  before insert on public.health_overrides
  for each row execute function public.stamp_actor('created_by');

-- What a pet lacks on a day, by the kennel's rules: each required vaccine with
-- no record or lapsed, deworming or tick treatment not recent enough, and
-- neutering above the age. A pet of unknown age is not held to the age rule.
-- Must match healthProblems() in src/lib/core/health.ts.
create function public.pet_health_problems(p_org uuid, p_pet uuid, p_on date)
returns table (problem text, detail text)
language sql
stable
set search_path = ''
as $$
  with p as (
    select pt.*, o.deworm_days, o.tick_days, o.neuter_months
    from public.pets pt
    join public.organizations o on o.id = pt.org_id
    where pt.org_id = p_org and pt.id = p_pet
  )
  select 'vaccine', rv.vaccine
  from public.required_vaccines rv, p
  where rv.org_id = p_org
    and not exists (
      select 1 from public.vaccinations v
      where v.org_id = p_org and v.pet_id = p.id
        and regexp_replace(lower(v.vaccine), '[^a-z0-9]', '', 'g') = regexp_replace(lower(rv.vaccine), '[^a-z0-9]', '', 'g')
        and coalesce(v.valid_until, (v.given_on + make_interval(months => rv.months_valid))::date - 1) >= p_on
    )
  union all
  select 'deworming', coalesce(p.dewormed_on::text, '')
  from p
  where p.deworm_days is not null and (p.dewormed_on is null or p.dewormed_on + p.deworm_days < p_on)
  union all
  select 'ticks', coalesce(p.tick_treated_on::text, '')
  from p
  where p.tick_days is not null and (p.tick_treated_on is null or p.tick_treated_on + p.tick_days < p_on)
  union all
  select 'neutering', ''
  from p
  where p.neuter_months is not null and p.date_of_birth is not null and p.is_neutered is not true
    and (p.date_of_birth + make_interval(months => p.neuter_months))::date <= p_on;
$$;
comment on function public.pet_health_problems(uuid, uuid, date) is
  'What a pet lacks on a day by the kennel''s rules (M40): vaccine (a required vaccine with no record, or lapsed: its end date, else the day given plus its months), deworming and ticks (not done within the kennel''s days), neutering (not neutered above the age; a pet of unknown age is not held to it). Empty when it lacks nothing. Must match healthProblems() in src/lib/core/health.ts.';

-- Check-in refuses a pet that lacks what the kennel requires, while the kennel
-- refuses at the door, unless an owner or manager let it in with a note. A stay
-- made already checked in is checked the same way: it has no note yet, so it is
-- made first and let in after.
create function public.bookings_check_health()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mode text;
  v_lacks text;
begin
  if new.status <> 'checked_in' or (tg_op = 'UPDATE' and old.status in ('checked_in', 'checked_out')) then
    return new;
  end if;
  select o.health_check into v_mode from public.organizations o where o.id = new.org_id;
  if v_mode is distinct from 'refuse'
     or exists (select 1 from public.health_overrides h where h.org_id = new.org_id and h.booking_id = new.id) then
    return new;
  end if;
  select string_agg(case when x.problem = 'vaccine' then x.detail else x.problem end, ', ')
    into v_lacks
  from public.pet_health_problems(new.org_id, new.pet_id, greatest(new.start_date, public.org_today(new.org_id))) x;
  if v_lacks is not null then
    raise exception 'WB210: this pet lacks what the kennel requires at the door: %. An owner or manager can let it in with a note.', v_lacks
      using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.bookings_check_health() is
  'Trigger: while the kennel refuses at the door (organizations.health_check), check-in, or a stay made already checked in, is refused for a pet that lacks a required vaccine, deworming, tick treatment or neutering (pet_health_problems), unless an owner or manager let it in (health_overrides). WB210.';

create trigger bookings_check_health
  before insert or update of status on public.bookings
  for each row execute function public.bookings_check_health();

-- The same at an appointment for a visitor, when it is marked done: a boarder
-- was checked at its check-in.
create function public.appointments_check_health()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lacks text;
begin
  if new.status <> 'done' or (tg_op = 'UPDATE' and old.status = 'done') or new.booking_id is not null then
    return new;
  end if;
  if (select o.health_check from public.organizations o where o.id = new.org_id) is distinct from 'refuse'
     or not exists (select 1 from public.appointment_services s where s.org_id = new.org_id and s.id = new.service_id and s.checks_vaccinations)
     or exists (select 1 from public.health_overrides h where h.org_id = new.org_id and h.appointment_id = new.id) then
    return new;
  end if;
  select string_agg(case when x.problem = 'vaccine' then x.detail else x.problem end, ', ')
    into v_lacks
  from public.pet_health_problems(new.org_id, new.pet_id, (new.starts_at at time zone (select o.time_zone from public.organizations o where o.id = new.org_id))::date) x;
  if v_lacks is not null then
    raise exception 'WB210: this pet lacks what the kennel requires at the door: %. An owner or manager can let it in with a note.', v_lacks
      using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.appointments_check_health() is
  'Trigger: while the kennel refuses at the door, a visitor''s appointment that checks vaccinations is not marked done for a pet that lacks what the kennel requires, unless an owner or manager let it in (WB210). A boarder was checked at its check-in.';

create trigger appointments_check_health
  before insert or update of status on public.appointments
  for each row execute function public.appointments_check_health();
