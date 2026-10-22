-- =============================================================================
-- Wagbook 00045: appointments (Phase 2, M34 to M37, D46)
--
--   Places     things that take one booking at a time (the pool, a grooming
--              table, the party yard), each with its hours (M34).
--   Services   what is booked by the hour: its length, place, clean-up time,
--              price (fixed, by size, by coat, on quote), tax and the skill
--              it needs; add-ons priced on top (M34, M35).
--   Appointments  one pet, one service, one place, one person, at a time.
--              The database refuses a place, a pet or a person in two places
--              at once (M34). Swims, training courses and parties (M36).
--   Packages   a stay with appointments and extras included, billed as one
--              line (M37).
--
-- Times are timestamptz; the day an appointment is on is the kennel's, in its
-- time zone. Row level security for these tables is in 0008 with the rest of
-- the access model, as for every table until the migration freeze.
-- =============================================================================

create type public.appointment_kind as enum ('groom', 'swim', 'training', 'party', 'other');
comment on type public.appointment_kind is
  'What an appointment service is: groom (grooming and spa), swim (one dog at a time in the pool), training (a session, often of a course), party (the party yard for a birthday), other.';

create type public.appointment_status as enum ('requested', 'confirmed', 'done', 'no_show', 'cancelled');
comment on type public.appointment_status is
  'requested: written down, holds nothing. confirmed: holds the place, the pet and the person. done: it happened. no_show: the pet did not come (still billed). cancelled: with a reason; it stays cancelled.';

create type public.appointment_pricing as enum ('fixed', 'by_size', 'by_coat', 'quote');
comment on type public.appointment_pricing is
  'How a service is priced: fixed (one price), by_size (small, medium or large from the pet''s latest weight), by_coat (the pet''s coat, a named breed overriding it), quote (an owner or manager sets the price for each appointment).';

create type public.size_band as enum ('small', 'medium', 'large');
comment on type public.size_band is
  'A dog''s size from its latest weight, using the kennel''s bands (organizations.small_dog_max_g and medium_dog_max_g). Must match sizeBand() in src/lib/core/food.ts.';

create type public.package_day as enum ('first', 'middle', 'last');
comment on type public.package_day is
  'Which day of a stay a package''s appointment goes on: first (the day it starts), middle (halfway), last (the day it ends, finished by pick-up).';

-- ---------------------------------------------------------------------------
-- Places and services (M34)
-- ---------------------------------------------------------------------------

create table public.appointment_places (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  opens time not null default '09:00',
  closes time not null default '18:00',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name),
  constraint appointment_places_hours_in_order check (closes > opens)
);

comment on table public.appointment_places is
  'Something that takes one appointment at a time: the pool, a grooming table, a training ground, the party yard.';
comment on column public.appointment_places.opens is 'When it opens each day, kennel time. No appointment starts before it.';
comment on column public.appointment_places.closes is 'When it closes each day, kennel time. No appointment ends after it.';
comment on column public.appointment_places.is_active is 'False takes the place out of service: nothing new is booked in it.';

create trigger appointment_places_set_updated_at
  before update on public.appointment_places
  for each row execute function public.set_updated_at();

create table public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind public.appointment_kind not null,
  name text not null check (char_length(name) between 1 and 80),
  minutes smallint not null default 60 check (minutes between 0 and 720),
  cleanup_minutes smallint not null default 0 check (cleanup_minutes between 0 and 240),
  place_id uuid,
  pricing public.appointment_pricing not null default 'fixed',
  price_minor bigint not null default 0 check (price_minor >= 0),
  tax_rate_bp integer check (tax_rate_bp is null or tax_rate_bp between 0 and 10000),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  skill public.staff_skill,
  checks_vaccinations boolean not null default true,
  is_addon boolean not null default false,
  max_people smallint check (max_people is null or max_people between 1 and 100),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, place_id) references public.appointment_places (org_id, id) on delete restrict,
  -- An add-on is priced on top of another appointment: it takes no place and no time of its own.
  constraint appointment_services_place_unless_addon check (is_addon or (place_id is not null and minutes >= 5))
);

comment on table public.appointment_services is
  'What is booked by the hour: grooming, a swim, a training session, a party, or an add-on priced on top of one (nails, decorations).';
comment on column public.appointment_services.minutes is 'How long it usually takes. The person booking may give it longer or shorter.';
comment on column public.appointment_services.cleanup_minutes is 'Minutes the place stays taken after it ends, to clean and dry it. Copied onto each appointment.';
comment on column public.appointment_services.place_id is 'The place it is usually booked in. An appointment may name another place.';
comment on column public.appointment_services.price_minor is
  'The price: the whole price when fixed, and the price when no size, coat or breed price fits (appointment_service_prices). Unused on quote.';
comment on column public.appointment_services.tax_rate_bp is 'Tax rate in basis points. Empty: the kennel''s usual rate (D35).';
comment on column public.appointment_services.sac_code is 'The service code printed on tax invoices for it.';
comment on column public.appointment_services.skill is 'The skill whoever does it needs (groomer, trainer, swim supervisor). People with it are offered first; it does not limit who may be chosen.';
comment on column public.appointment_services.checks_vaccinations is 'Whether the pet''s vaccination certificates must be seen before it is marked done (WB194).';
comment on column public.appointment_services.is_addon is 'An add-on: priced on top of another appointment (appointment_items), never booked on its own.';
comment on column public.appointment_services.max_people is 'For a party: the most people who may come (WB197). Empty: no limit.';

create trigger appointment_services_set_updated_at
  before update on public.appointment_services
  for each row execute function public.set_updated_at();

create table public.appointment_service_prices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  service_id uuid not null,
  size public.size_band,
  coat public.pet_coat,
  breed text check (breed is null or char_length(btrim(breed)) between 1 and 80),
  price_minor bigint not null check (price_minor >= 0),
  created_at timestamptz not null default now(),
  foreign key (org_id, service_id) references public.appointment_services (org_id, id) on delete cascade,
  constraint appointment_service_prices_one_key check (num_nonnulls(size, coat, breed) = 1)
);

comment on table public.appointment_service_prices is
  'A service''s price for a size of dog (priced by_size), or for a coat or a named breed (priced by_coat; a breed overrides the coat). See appointment_price().';
comment on column public.appointment_service_prices.breed is 'A breed as it is written on pets, matched without regard to case or spaces at the ends.';

create unique index appointment_service_prices_one_size on public.appointment_service_prices (org_id, service_id, size) where size is not null;
comment on index public.appointment_service_prices_one_size is 'One price for each size of a service.';
create unique index appointment_service_prices_one_coat on public.appointment_service_prices (org_id, service_id, coat) where coat is not null;
comment on index public.appointment_service_prices_one_coat is 'One price for each coat of a service.';
create unique index appointment_service_prices_one_breed on public.appointment_service_prices (org_id, service_id, lower(btrim(breed))) where breed is not null;
comment on index public.appointment_service_prices_one_breed is 'One price for each breed of a service.';

-- What a pet pays for a service, from the service and the pet as they are
-- now: copied onto an appointment when it is booked. Empty for a service on
-- quote. Must match appointmentPrice() in src/lib/core/appointments.ts.
create function public.appointment_price(p_org uuid, p_service uuid, p_pet uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select case s.pricing
    when 'quote' then null
    when 'fixed' then s.price_minor
    when 'by_size' then coalesce((
      select sp.price_minor from public.appointment_service_prices sp
      where sp.org_id = s.org_id and sp.service_id = s.id
        and sp.size = case
          when p.weight_g is null then null
          when p.weight_g <= o.small_dog_max_g then 'small'
          when p.weight_g <= o.medium_dog_max_g then 'medium'
          else 'large' end::public.size_band
    ), s.price_minor)
    else coalesce(
      (select sp.price_minor from public.appointment_service_prices sp
       where sp.org_id = s.org_id and sp.service_id = s.id and sp.breed is not null and p.breed is not null
         and lower(btrim(sp.breed)) = lower(btrim(p.breed))),
      (select sp.price_minor from public.appointment_service_prices sp
       where sp.org_id = s.org_id and sp.service_id = s.id and sp.coat is not null and sp.coat = p.coat),
      s.price_minor)
  end
  from public.appointment_services s
  join public.organizations o on o.id = s.org_id
  left join public.pets p on p.org_id = s.org_id and p.id = p_pet
  where s.org_id = p_org and s.id = p_service;
$$;
comment on function public.appointment_price(uuid, uuid, uuid) is
  'What a pet pays for an appointment service: the fixed price; by size, the price for its size band from its latest weight; by coat, the price for its breed, else its coat; else the service''s own price. Empty on quote. Must match appointmentPrice() in src/lib/core/appointments.ts.';

-- ---------------------------------------------------------------------------
-- A pet's grooming card (M35)
-- ---------------------------------------------------------------------------

create table public.pet_grooming (
  org_id uuid not null references public.organizations (id) on delete cascade,
  pet_id uuid not null,
  usual_cut text check (usual_cut is null or char_length(usual_cut) <= 300),
  products text check (products is null or char_length(products) <= 300),
  skin text check (skin is null or char_length(skin) <= 300),
  behaviour text check (behaviour is null or char_length(behaviour) <= 300),
  every_weeks smallint check (every_weeks is null or every_weeks between 1 and 52),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, pet_id),
  foreign key (org_id, pet_id) references public.pets (org_id, id) on delete cascade
);

comment on table public.pet_grooming is
  'A pet''s grooming card: the usual cut, products to use or avoid, skin conditions, how it behaves on the table, and how often it should be groomed. The coat is on pets (it sets prices); the last groom is its latest groom done.';
comment on column public.pet_grooming.products is 'Products to use or avoid ("oatmeal shampoo only").';
comment on column public.pet_grooming.skin is 'Skin conditions to know about.';
comment on column public.pet_grooming.behaviour is 'How the pet behaves on the table ("nervous of the dryer").';
comment on column public.pet_grooming.every_weeks is 'How often it should be groomed, in weeks. With it, the pet is on Today''s list to send when a groom is due again. Empty: no reminder.';

create trigger pet_grooming_set_updated_at
  before update on public.pet_grooming
  for each row execute function public.set_updated_at();

create trigger pet_grooming_stamp_actor
  before insert or update on public.pet_grooming
  for each row execute function public.stamp_actor('updated_by');

-- ---------------------------------------------------------------------------
-- Training courses (M36): sessions sold up front, as a day boarding pack is.
-- ---------------------------------------------------------------------------

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  pet_id uuid not null,
  service_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  sessions smallint not null check (sessions between 1 and 100),
  price_minor bigint not null check (price_minor >= 0),
  starts_on date not null,
  invoice_id uuid,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, client_id, pet_id) references public.pets (org_id, client_id, id) on update cascade on delete restrict,
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete restrict,
  foreign key (org_id, service_id) references public.appointment_services (org_id, id) on delete restrict
);

comment on table public.courses is
  'A course of training sessions sold to a parent for one pet, at the price the trainer quoted, on a bill of its own. Each session booked from it (appointments.course_id) costs nothing on its own; course_balances counts what is left.';
comment on column public.courses.service_id is 'The training service its sessions are.';
comment on column public.courses.name is 'What it is called on the bill ("Puppy basics, 6 sessions").';
comment on column public.courses.sessions is 'How many sessions were bought.';
comment on column public.courses.price_minor is 'What the whole course costs, set by an owner or manager from the trainer''s quote.';
comment on column public.courses.invoice_id is 'The bill it was sold on.';

create index courses_org_pet_idx on public.courses (org_id, pet_id);

create trigger courses_stamp_actor
  before insert or update on public.courses
  for each row execute function public.stamp_actor('created_by');

-- ---------------------------------------------------------------------------
-- Packages (M37): a stay with appointments and extras included.
-- ---------------------------------------------------------------------------

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind public.booking_kind not null default 'boarding',
  price_minor bigint check (price_minor is null or price_minor >= 0),
  tax_rate_bp integer check (tax_rate_bp is null or tax_rate_bp between 0 and 10000),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  about text check (about is null or char_length(about) <= 500),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);

comment on table public.packages is
  'A stay with appointments and extras included ("Holiday: extra play, a swim, a groom before going home"), billed as one line at one price or a price on request.';
comment on column public.packages.kind is 'Which stays it goes on: boarding or day boarding.';
comment on column public.packages.price_minor is 'The price of the whole stay with everything in it. Empty: on request, set by an owner or manager for each stay.';
comment on column public.packages.about is 'What is in it, in the kennel''s words.';

create trigger packages_set_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();

create table public.package_parts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  package_id uuid not null,
  service_id uuid,
  extra_id uuid,
  on_day public.package_day,
  quantity smallint not null default 1 check (quantity between 1 and 50),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (org_id, package_id) references public.packages (org_id, id) on delete cascade,
  foreign key (org_id, service_id) references public.appointment_services (org_id, id) on delete restrict,
  foreign key (org_id, extra_id) references public.services (org_id, id) on delete restrict,
  -- An appointment on a day of the stay, or an extra from the price list.
  constraint package_parts_one_kind check (
    (service_id is not null and extra_id is null and on_day is not null and quantity = 1)
    or (service_id is null and extra_id is not null and on_day is null)
  )
);

comment on table public.package_parts is 'What a package includes: an appointment on a day of the stay, or an extra from the price list so many times.';
comment on column public.package_parts.service_id is 'An appointment service booked on the stay, on on_day.';
comment on column public.package_parts.extra_id is 'An extra (services, kind addon) put on the stay, quantity times.';
comment on column public.package_parts.on_day is 'For an appointment: the first, middle or last day of the stay.';

alter table public.bookings
  add constraint bookings_package_fkey foreign key (org_id, package_id) references public.packages (org_id, id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Appointments (M34 to M37)
-- ---------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  pet_id uuid not null,
  service_id uuid not null,
  kind public.appointment_kind not null default 'other',
  place_id uuid,
  booking_id uuid,
  course_id uuid,
  in_package boolean not null default false,
  status public.appointment_status not null default 'confirmed',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  cleanup_minutes smallint not null default 0 check (cleanup_minutes between 0 and 240),
  held_until timestamptz not null default now(),
  staff_id uuid,
  price_minor bigint check (price_minor is null or price_minor >= 0),
  tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  vaccinations_checked_at timestamptz,
  vaccinations_checked_by uuid references auth.users (id) on delete set null,
  life_jacket boolean,
  guest_pet_id uuid,
  guest_vaccinations_checked_at timestamptz,
  guest_vaccinations_checked_by uuid references auth.users (id) on delete set null,
  people smallint check (people is null or people between 1 and 100),
  notes text check (notes is null or char_length(notes) <= 500),
  after_notes text check (after_notes is null or char_length(after_notes) <= 2000),
  homework text check (homework is null or char_length(homework) <= 2000),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  cancelled_at timestamptz,
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, client_id, pet_id) references public.pets (org_id, client_id, id) on update cascade on delete restrict,
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete restrict,
  foreign key (org_id, service_id) references public.appointment_services (org_id, id) on delete restrict,
  foreign key (org_id, place_id) references public.appointment_places (org_id, id) on delete restrict,
  -- A boarder's appointment is on its own stay: the booking is of this pet.
  foreign key (org_id, booking_id, pet_id) references public.bookings (org_id, id, pet_id) on update cascade on delete set null (booking_id),
  foreign key (org_id, course_id) references public.courses (org_id, id) on delete restrict,
  foreign key (org_id, staff_id) references public.memberships (org_id, user_id) on delete set null (staff_id),
  foreign key (org_id, guest_pet_id) references public.pets (org_id, id) on delete restrict,
  constraint appointments_times_in_order check (ends_at > starts_at and ends_at - starts_at <= interval '12 hours'),
  constraint appointments_held_after_end check (held_until >= ends_at),
  constraint appointments_cancel_has_reason check ((status = 'cancelled') = (cancel_reason is not null)),
  constraint appointments_place_named check (place_id is not null),
  constraint appointments_guest_is_another_pet check (guest_pet_id is null or guest_pet_id <> pet_id),
  -- Paid by the course or the package: nothing on its own.
  constraint appointments_course_or_package_is_free check ((course_id is null and not in_package) or price_minor = 0),
  constraint appointments_package_is_a_stay check (not in_package or booking_id is not null),

  -- One place, one appointment at a time, with its clean-up after.
  constraint appointments_no_place_overlap exclude using gist (
    place_id with =,
    tstzrange(starts_at, held_until, '[)') with &&
  ) where (status in ('confirmed', 'done')),
  -- One pet in one place at a time.
  constraint appointments_no_pet_overlap exclude using gist (
    pet_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('confirmed', 'done')),
  -- One person in one place at a time.
  constraint appointments_no_person_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (staff_id is not null and status in ('confirmed', 'done'))
);

comment on table public.appointments is
  'One pet''s appointment: a service in a place, with a person, at a time. A pet staying in names its stay and is billed on it; a visitor has a bill of its own. The database keeps a place, a pet and a person to one appointment at a time.';
comment on column public.appointments.kind is 'Copied from the service when booked, for the day''s view and the rules for swims and parties.';
comment on column public.appointments.place_id is 'Where it happens: the service''s own place unless another was chosen.';
comment on column public.appointments.booking_id is 'The stay it is part of, for a pet staying in: it is billed on the stay''s bill. Empty: a visitor, billed on its own.';
comment on column public.appointments.course_id is 'The training course it is a session of: it then costs nothing on its own (WB201 keeps the course to its sessions).';
comment on column public.appointments.in_package is 'Part of its stay''s package (bookings.package_id): it costs nothing on its own.';
comment on column public.appointments.starts_at is 'When it starts. The kennel''s day it falls on is the day it is on.';
comment on column public.appointments.ends_at is 'When it ends. From the service''s length when booked; may be changed.';
comment on column public.appointments.cleanup_minutes is 'Minutes the place stays taken after it ends, copied from the service when booked.';
comment on column public.appointments.held_until is 'When the place is free again: ends_at plus the clean-up. Kept by the database.';
comment on column public.appointments.staff_id is 'Who does it: a member of the kennel.';
comment on column public.appointments.price_minor is
  'What it costs, copied when booked (appointment_price()); only owners and managers change it (WB022). Empty: on quote, still to be set, so it can only be a request (WB199).';
comment on column public.appointments.tax_rate_bp is 'Tax rate copied from the service when booked, in basis points.';
comment on column public.appointments.vaccinations_checked_at is 'When someone saw the pet''s vaccination certificates for it. Stamped by the database.';
comment on column public.appointments.life_jacket is 'For a swim: whether the dog wore a life jacket. Must be answered before the swim is done (WB195).';
comment on column public.appointments.guest_pet_id is 'For a party: the one guest dog, a pet of the kennel so its parent and vaccinations are on record.';
comment on column public.appointments.guest_vaccinations_checked_at is 'For a party: when someone saw the guest dog''s certificates (WB196). Stamped by the database.';
comment on column public.appointments.people is 'For a party: how many people come (at most the service''s max_people, WB197).';
comment on column public.appointments.notes is 'For whoever does it ("the usual summer cut").';
comment on column public.appointments.after_notes is 'What happened: for training, the session''s notes, sent to the parent.';
comment on column public.appointments.homework is 'For training: what the parent should practise before the next session.';
comment on column public.appointments.done_at is 'When it was marked done. Stamped by the database.';

create index appointments_org_starts_idx on public.appointments (org_id, starts_at);
create index appointments_org_booking_idx on public.appointments (org_id, booking_id) where booking_id is not null;
create index appointments_org_pet_idx on public.appointments (org_id, pet_id, starts_at desc);
create index appointments_org_course_idx on public.appointments (org_id, course_id) where course_id is not null;

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create trigger appointments_stamp_actor
  before insert or update on public.appointments
  for each row execute function public.stamp_actor('created_by');

create trigger appointments_stamp_vaccinations_checked
  before insert or update on public.appointments
  for each row execute function public.stamp_when_set('vaccinations_checked_at', 'vaccinations_checked_by');

create trigger appointments_stamp_guest_vaccinations_checked
  before insert or update on public.appointments
  for each row execute function public.stamp_when_set('guest_vaccinations_checked_at', 'guest_vaccinations_checked_by');

-- Everything an appointment takes from its service, and every rule about
-- when, where and at what price it may be booked. Runs as the caller.
create function public.appointments_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_service public.appointment_services;
  v_place public.appointment_places;
  v_booking public.bookings;
  v_course public.courses;
  v_manager boolean;
  v_day date;
  v_start integer;
  v_end integer;
  v_used integer;
  v_holds boolean := new.status in ('confirmed', 'done', 'no_show');
begin
  select * into v_org from public.organizations o where o.id = new.org_id;
  if v_org.id is null then
    return new;
  end if;
  v_manager := (select auth.uid()) is null
    or new.org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]));
  select * into v_service from public.appointment_services s where s.org_id = new.org_id and s.id = new.service_id;

  -- What it takes from its service.
  if tg_op = 'INSERT' or new.service_id is distinct from old.service_id then
    if v_service.id is null or v_service.is_addon or not v_service.is_active then
      raise exception 'WB190: that service cannot be booked. Choose another.' using errcode = '23514';
    end if;
    new.kind := v_service.kind;
    new.cleanup_minutes := v_service.cleanup_minutes;
    new.place_id := coalesce(new.place_id, v_service.place_id);
  else
    new.kind := old.kind;
    new.cleanup_minutes := old.cleanup_minutes;
  end if;
  new.held_until := new.ends_at + make_interval(mins => new.cleanup_minutes);

  -- A cancelled appointment stays cancelled; done and cancelled are stamped.
  if tg_op = 'UPDATE' and old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'WB198: a cancelled appointment stays cancelled. Book a new one.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.status = new.status then
    new.cancelled_at := old.cancelled_at;
    new.done_at := old.done_at;
    new.done_by := old.done_by;
  else
    new.cancelled_at := case when new.status = 'cancelled' then now() end;
    new.done_at := case when new.status = 'done' then now() end;
    new.done_by := case when new.status = 'done' then (select auth.uid()) end;
  end if;

  -- The price, tax and code: from the service, unless an owner or manager
  -- gives another price (D15). Paid by a course or a package: nothing.
  if tg_op = 'INSERT' or new.service_id is distinct from old.service_id then
    new.tax_rate_bp := case when v_org.tax_mode = 'none' then 0 else coalesce(v_service.tax_rate_bp, v_org.default_tax_rate_bp) end;
    new.sac_code := v_service.sac_code;
  elsif (new.tax_rate_bp is distinct from old.tax_rate_bp or new.sac_code is distinct from old.sac_code) and not v_manager then
    raise exception 'WB022: only an owner or manager can change a price' using errcode = '42501';
  end if;
  if new.course_id is not null or new.in_package then
    new.price_minor := 0;
  elsif tg_op = 'INSERT' then
    if not v_manager or new.price_minor is null then
      new.price_minor := public.appointment_price(new.org_id, new.service_id, new.pet_id);
    end if;
  elsif new.service_id is distinct from old.service_id or new.pet_id is distinct from old.pet_id
        or (old.course_id is not null and new.course_id is null) or (old.in_package and not new.in_package) then
    if not v_manager or new.price_minor is not distinct from old.price_minor then
      new.price_minor := public.appointment_price(new.org_id, new.service_id, new.pet_id);
    end if;
  elsif new.price_minor is distinct from old.price_minor and not v_manager then
    raise exception 'WB022: only an owner or manager can change a price' using errcode = '42501';
  end if;
  if v_holds and new.price_minor is null then
    raise exception 'WB199: this service is priced on quote. An owner or manager sets the price before it is confirmed.' using errcode = '23514';
  end if;

  -- Where and when: a place in service, inside its hours on one day.
  if tg_op = 'INSERT' or new.place_id is distinct from old.place_id or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at then
    select * into v_place from public.appointment_places p where p.org_id = new.org_id and p.id = new.place_id;
    if new.status <> 'cancelled' then
      if v_place.id is null or not v_place.is_active then
        raise exception 'WB191: that place is out of service' using errcode = '23514';
      end if;
      v_start := extract(hour from new.starts_at at time zone v_org.time_zone)::integer * 60
                 + extract(minute from new.starts_at at time zone v_org.time_zone)::integer;
      v_end := extract(hour from new.ends_at at time zone v_org.time_zone)::integer * 60
               + extract(minute from new.ends_at at time zone v_org.time_zone)::integer;
      if (new.starts_at at time zone v_org.time_zone)::date <> (new.ends_at at time zone v_org.time_zone)::date
         or v_start < extract(epoch from v_place.opens) / 60
         or v_end > extract(epoch from v_place.closes) / 60 then
        raise exception 'WB192: % is open from % to %. Choose a time inside its hours.',
          v_place.name, to_char(v_place.opens, 'HH24:MI'), to_char(v_place.closes, 'HH24:MI') using errcode = '23514';
      end if;
    end if;
  end if;

  -- A boarder's appointment is on a day of its stay, while the stay is on.
  if new.booking_id is not null and new.status <> 'cancelled'
     and (tg_op = 'INSERT' or new.booking_id is distinct from old.booking_id or new.starts_at is distinct from old.starts_at) then
    select * into v_booking from public.bookings b where b.org_id = new.org_id and b.id = new.booking_id;
    v_day := (new.starts_at at time zone v_org.time_zone)::date;
    if v_booking.id is null or v_booking.status not in ('requested', 'confirmed', 'checked_in')
       or v_day < v_booking.start_date or v_day > v_booking.end_date then
      raise exception 'WB193: this appointment is not on a day of the pet''s stay' using errcode = '23514';
    end if;
  end if;

  -- Part of a package: the stay's package has it, and it is not booked already.
  if new.in_package and new.status <> 'cancelled' and (tg_op = 'INSERT' or not old.in_package or new.service_id is distinct from old.service_id) then
    if not exists (
      select 1 from public.bookings b
      join public.package_parts pp on pp.org_id = b.org_id and pp.package_id = b.package_id and pp.service_id = new.service_id
      where b.org_id = new.org_id and b.id = new.booking_id
    ) or (
      select count(*) from public.appointments a
      where a.org_id = new.org_id and a.booking_id = new.booking_id and a.in_package and a.service_id = new.service_id
        and a.status <> 'cancelled' and a.id <> new.id
    ) >= (
      select count(*) from public.bookings b
      join public.package_parts pp on pp.org_id = b.org_id and pp.package_id = b.package_id and pp.service_id = new.service_id
      where b.org_id = new.org_id and b.id = new.booking_id
    ) then
      raise exception 'WB207: the stay''s package does not include that, or it is booked already' using errcode = '23514';
    end if;
  end if;

  -- A session of a course: its own pet and service, and never more sessions
  -- than were bought. One booking at a time per course while counting.
  if new.course_id is not null and v_holds then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('course:' || new.course_id::text, 0));
    select * into v_course from public.courses c where c.org_id = new.org_id and c.id = new.course_id;
    if v_course.id is null or v_course.pet_id <> new.pet_id or v_course.service_id <> new.service_id then
      raise exception 'WB202: a course is for its own pet and its own kind of session' using errcode = '23514';
    end if;
    select count(*) into v_used from public.appointments a
    where a.org_id = new.org_id and a.course_id = new.course_id and a.id <> new.id and a.status in ('confirmed', 'done', 'no_show');
    if v_used >= v_course.sessions then
      raise exception 'WB201: the course has % sessions left', greatest(v_course.sessions - v_used, 0) using errcode = '23514';
    end if;
  end if;

  -- A party: never more people than the service allows.
  if new.people is not null and v_service.max_people is not null and new.people > v_service.max_people then
    raise exception 'WB197: a party takes % people at most', v_service.max_people using errcode = '23514';
  end if;

  -- Done: the certificates seen (here or at the stay's check-in), a swim's
  -- life jacket and supervisor recorded, and a party guest's certificates seen.
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    if v_service.checks_vaccinations and new.vaccinations_checked_at is null and not exists (
      select 1 from public.bookings b where b.org_id = new.org_id and b.id = new.booking_id and b.vaccinations_checked_at is not null
    ) then
      raise exception 'WB194: check the pet''s vaccination certificates first' using errcode = '23514';
    end if;
    if new.kind = 'swim' and (new.life_jacket is null or new.staff_id is null) then
      raise exception 'WB195: say who supervised the swim and whether the dog wore a life jacket' using errcode = '23514';
    end if;
    if new.guest_pet_id is not null and new.guest_vaccinations_checked_at is null then
      raise exception 'WB196: check the guest dog''s vaccination certificates first' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
comment on function public.appointments_check() is
  'Trigger: an appointment takes its kind and clean-up from its service (WB190 for a service that cannot be booked) and its price, tax and code (only owners and managers give another, WB022; a course or package session is free; a quote must be priced before it holds anything, WB199). It must be in a place in service (WB191), inside its hours (WB192), on a day of its stay for a boarder (WB193), within its package (WB207) or course (WB201, WB202), and within a party''s people (WB197). Done needs the certificates seen (WB194), a swim''s supervisor and life jacket (WB195) and a guest''s certificates (WB196). A cancelled one stays cancelled (WB198).';

create trigger appointments_check
  before insert or update on public.appointments
  for each row execute function public.appointments_check();

-- Add-ons on an appointment, priced on top (nails with a bath, decorations
-- for a party).
create table public.appointment_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  appointment_id uuid not null,
  service_id uuid not null,
  description text not null check (char_length(description) between 1 and 200),
  quantity smallint not null default 1 check (quantity between 1 and 50),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (org_id, appointment_id) references public.appointments (org_id, id) on delete cascade,
  foreign key (org_id, service_id) references public.appointment_services (org_id, id) on delete restrict
);

comment on table public.appointment_items is
  'An add-on on an appointment, priced on top of it: its name and price copied from the add-on service when added. On the same bill as the appointment.';

create index appointment_items_org_appointment_idx on public.appointment_items (org_id, appointment_id);

create trigger appointment_items_stamp_actor
  before insert or update on public.appointment_items
  for each row execute function public.stamp_actor('created_by');

create function public.appointment_items_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_service public.appointment_services;
  v_org public.organizations;
  v_pet uuid;
  v_manager boolean;
begin
  v_manager := (select auth.uid()) is null
    or new.org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]));
  if tg_op = 'UPDATE' then
    if not v_manager and (new.unit_price_minor is distinct from old.unit_price_minor or new.quantity is distinct from old.quantity
                          or new.tax_rate_bp is distinct from old.tax_rate_bp or new.service_id is distinct from old.service_id) then
      raise exception 'WB025: only an owner or manager can change what an extra costs' using errcode = '42501';
    end if;
    return new;
  end if;
  select * into v_service from public.appointment_services s where s.org_id = new.org_id and s.id = new.service_id;
  select * into v_org from public.organizations o where o.id = new.org_id;
  select a.pet_id into v_pet from public.appointments a where a.org_id = new.org_id and a.id = new.appointment_id;
  if v_service.id is null or not v_service.is_addon or not v_service.is_active then
    raise exception 'WB203: that is not an add-on. Choose one from the list.' using errcode = '23514';
  end if;
  new.description := coalesce(nullif(btrim(new.description), ''), v_service.name);
  if not v_manager or new.unit_price_minor is null then
    new.unit_price_minor := public.appointment_price(new.org_id, new.service_id, v_pet);
  end if;
  if new.unit_price_minor is null then
    raise exception 'WB199: this service is priced on quote. An owner or manager sets the price before it is confirmed.' using errcode = '23514';
  end if;
  new.tax_rate_bp := case when v_org.tax_mode = 'none' then 0 else coalesce(v_service.tax_rate_bp, v_org.default_tax_rate_bp) end;
  new.sac_code := v_service.sac_code;
  return new;
end;
$$;
comment on function public.appointment_items_price() is
  'Trigger: an add-on is an active add-on service (WB203), priced for the appointment''s pet (appointment_price()) unless an owner or manager gives another price, with the service''s tax and code. Staff cannot change what one costs afterwards (WB025).';

create trigger appointment_items_price
  before insert or update on public.appointment_items
  for each row execute function public.appointment_items_price();

-- The sessions of each course: used (booked and holding a place, done, or
-- not come) and left.
create view public.course_balances
with (security_invoker = true)
as
select
  c.id as course_id,
  c.org_id,
  c.client_id,
  c.pet_id,
  c.service_id,
  c.name,
  c.sessions,
  c.invoice_id,
  coalesce(u.used, 0)::integer as sessions_used,
  (c.sessions - coalesce(u.used, 0))::integer as sessions_left
from public.courses c
left join lateral (
  select count(*) as used from public.appointments a
  where a.org_id = c.org_id and a.course_id = c.id and a.status in ('confirmed', 'done', 'no_show')
) u on true;

comment on view public.course_balances is 'Each training course with the sessions used (confirmed, done or not come) and the sessions left.';

-- ---------------------------------------------------------------------------
-- Free times, and booking a package's parts (M37)
-- ---------------------------------------------------------------------------

-- The first free start, every 30 minutes inside a place's hours on a day,
-- where the place (with clean-up) and the pet are free, not in the past and,
-- if given, ending by p_latest_end. p_latest takes the latest such start
-- instead (a groom finished just before pick-up). Must agree with freeTimes()
-- in src/lib/core/appointments.ts.
create function public.first_free_start(
  p_org uuid, p_place uuid, p_pet uuid, p_day date, p_minutes integer, p_cleanup integer,
  p_latest_end time default null, p_latest boolean default false)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select x.t
  from (
    select g, ((p_day + pl.opens) at time zone o.time_zone) + make_interval(mins => 30 * g) as t,
           extract(epoch from pl.opens)::integer / 60 + 30 * g as start_minute,
           extract(epoch from pl.closes)::integer / 60 as close_minute
    from public.appointment_places pl
    join public.organizations o on o.id = pl.org_id
    cross join generate_series(0, 48) g
    where pl.org_id = p_org and pl.id = p_place and pl.is_active
  ) x
  where x.start_minute + p_minutes <= x.close_minute
    and (p_latest_end is null or x.start_minute + p_minutes <= extract(epoch from p_latest_end)::integer / 60)
    and x.t > now()
    and not exists (
      select 1 from public.appointments a
      where a.org_id = p_org and a.place_id = p_place and a.status in ('confirmed', 'done')
        and tstzrange(a.starts_at, a.held_until, '[)') && tstzrange(x.t, x.t + make_interval(mins => p_minutes + p_cleanup), '[)'))
    and not exists (
      select 1 from public.appointments a
      where a.org_id = p_org and a.pet_id = p_pet and a.status in ('confirmed', 'done')
        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(x.t, x.t + make_interval(mins => p_minutes), '[)'))
  order by case when p_latest then -x.g else x.g end
  limit 1;
$$;
comment on function public.first_free_start(uuid, uuid, uuid, date, integer, integer, time, boolean) is
  'The first (or with p_latest, the last) start every 30 minutes inside a place''s hours on a day where the place, with clean-up, and the pet are free, in the future and ending by p_latest_end if given. Empty when there is none. Must agree with freeTimes() in src/lib/core/appointments.ts.';

-- Put a package on a stay: the stay is then billed as the package, and its
-- parts are booked in the same step: its extras, and each appointment at the
-- first free time on its day (a groom on the last day finished by pick-up).
-- Returns how many appointments found no free time; the stay's page lists
-- them to book by hand. Runs as the caller; the price rules are checked here,
-- and the stay's own guards let the package through only from here.
create function public.apply_package(p_booking uuid, p_package uuid, p_price bigint default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_package public.packages;
  v_org public.organizations;
  v_manager boolean;
  v_price bigint;
  v_part record;
  v_day date;
  v_start timestamptz;
  v_left integer := 0;
begin
  select * into v_booking from public.bookings b where b.id = p_booking and b.org_id in (select public.my_org_ids()) for update;
  if v_booking.id is null then
    raise exception 'WB003: booking not found' using errcode = 'P0002';
  end if;
  select * into v_org from public.organizations o where o.id = v_booking.org_id;
  select * into v_package from public.packages p where p.org_id = v_booking.org_id and p.id = p_package and p.is_active;
  if v_package.id is null then
    raise exception 'WB003: package not found' using errcode = 'P0002';
  end if;
  v_manager := v_booking.org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]));
  if v_booking.package_id is not null or v_booking.status not in ('requested', 'confirmed', 'checked_in')
     or v_booking.pass_id is not null or v_booking.series_id is not null or v_booking.boarding_from is not null
     or v_booking.alone_rate_minor is not null
     or exists (select 1 from public.invoices i
                where i.org_id = v_booking.org_id and i.status = 'issued'
                  and (i.booking_id = v_booking.id or i.group_id = v_booking.group_id)) then
    raise exception 'WB205: a package goes only on a stay still to come or in the kennel, booked on its own price and not billed yet' using errcode = '23514';
  end if;
  if v_package.kind <> v_booking.kind then
    raise exception 'WB204: that package is for another kind of stay' using errcode = '23514';
  end if;
  if v_package.price_minor is null and (p_price is null or not v_manager) then
    raise exception 'WB206: only an owner or manager sets the price of a package priced on request' using errcode = '42501';
  end if;
  if p_price is not null and p_price is distinct from v_package.price_minor and not v_manager then
    raise exception 'WB022: only an owner or manager can change a price' using errcode = '42501';
  end if;
  if p_price is not null and p_price < 0 then
    raise exception 'WB206: only an owner or manager sets the price of a package priced on request' using errcode = '22023';
  end if;
  v_price := coalesce(p_price, v_package.price_minor);

  perform set_config('wagbook.packaging', 'on', true);
  update public.bookings b
  set package_id = v_package.id, package_price_minor = v_price, rate_minor = 0, discount_minor = 0,
      tax_rate_bp = case when v_org.tax_mode = 'none' then 0 else coalesce(v_package.tax_rate_bp, v_org.default_tax_rate_bp) end,
      sac_code = v_package.sac_code
  where b.id = v_booking.id;

  insert into public.booking_items (org_id, booking_id, service_id, description, quantity, unit_price_minor, tax_rate_bp, sac_code, in_package)
  select v_booking.org_id, v_booking.id, s.id, s.name, pp.quantity, 0, 0, null, true
  from public.package_parts pp
  join public.services s on s.org_id = pp.org_id and s.id = pp.extra_id
  where pp.org_id = v_booking.org_id and pp.package_id = v_package.id and pp.extra_id is not null
  order by pp.sort_order, pp.created_at;
  perform set_config('wagbook.packaging', 'off', true);

  for v_part in
    select pp.on_day, s.id as service_id, s.place_id, s.minutes, s.cleanup_minutes
    from public.package_parts pp
    join public.appointment_services s on s.org_id = pp.org_id and s.id = pp.service_id
    where pp.org_id = v_booking.org_id and pp.package_id = v_package.id and pp.service_id is not null
    order by pp.sort_order, pp.created_at
  loop
    v_day := case v_part.on_day
      when 'first' then v_booking.start_date
      when 'last' then v_booking.end_date
      else v_booking.start_date + (v_booking.end_date - v_booking.start_date) / 2 end;
    v_start := public.first_free_start(
      v_booking.org_id, v_part.place_id, v_booking.pet_id, v_day, v_part.minutes, v_part.cleanup_minutes,
      case when v_part.on_day = 'last' then coalesce(v_booking.expected_departure, v_org.check_out_time) end,
      v_part.on_day = 'last');
    if v_start is null then
      v_left := v_left + 1;
    else
      insert into public.appointments (org_id, client_id, pet_id, service_id, booking_id, in_package, status, starts_at, ends_at)
      values (v_booking.org_id, v_booking.client_id, v_booking.pet_id, v_part.service_id, v_booking.id, true, 'confirmed',
              v_start, v_start + make_interval(mins => v_part.minutes));
    end if;
  end loop;
  return v_left;
end;
$$;
comment on function public.apply_package(uuid, uuid, bigint) is
  'Puts a package on a stay: the stay is billed as the package (one line at its price, or p_price, which only owners and managers give: WB206, WB022), its extras go on the stay at no charge, and each of its appointments is booked at the first free time on its day (first_free_start). Refused for a stay that is over, already has a package, is priced in parts or from a pack, repeats, or has a bill out (WB205), or of the other kind (WB204). Returns how many appointments found no free time.';

-- ---------------------------------------------------------------------------
-- The stay's side
-- ---------------------------------------------------------------------------

-- A package goes on a stay only through apply_package(), and stays on it.
create function public.bookings_check_package()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('wagbook.packaging', true), '') = 'on' then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.package_id is not null or new.package_price_minor is not null))
     or (tg_op = 'UPDATE' and (new.package_id is distinct from old.package_id or new.package_price_minor is distinct from old.package_price_minor)) then
    raise exception 'WB205: a package goes only on a stay still to come or in the kennel, booked on its own price and not billed yet' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.bookings_check_package() is
  'Trigger: a stay''s package and its price are set only by apply_package() and never changed afterwards (WB205).';

create trigger bookings_check_package
  before insert or update of package_id, package_price_minor on public.bookings
  for each row execute function public.bookings_check_package();

-- Cancelling a stay cancels its appointments still to come; a stay that
-- becomes shorter cancels those on days it no longer has. Runs as the caller.
create function public.bookings_follow_appointments()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tz text;
begin
  if new.status in ('cancelled', 'no_show') and old.status not in ('cancelled', 'no_show') then
    update public.appointments a
    set status = 'cancelled', cancel_reason = case when new.status = 'no_show' then 'The pet did not come for its stay' else 'The stay was cancelled' end
    where a.org_id = new.org_id and a.booking_id = new.id and a.status in ('requested', 'confirmed');
  elsif new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    select o.time_zone into v_tz from public.organizations o where o.id = new.org_id;
    update public.appointments a
    set status = 'cancelled', cancel_reason = 'The stay changed and no longer has this day'
    where a.org_id = new.org_id and a.booking_id = new.id and a.status in ('requested', 'confirmed')
      and ((a.starts_at at time zone v_tz)::date < new.start_date or (a.starts_at at time zone v_tz)::date > new.end_date);
  end if;
  return null;
end;
$$;
comment on function public.bookings_follow_appointments() is
  'Trigger: a stay cancelled or not come cancels its appointments still to come; a stay whose dates change cancels those on days it no longer has.';

create trigger bookings_follow_appointments
  after update of status, start_date, end_date on public.bookings
  for each row execute function public.bookings_follow_appointments();
