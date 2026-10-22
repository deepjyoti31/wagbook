-- =============================================================================
-- Wagbook 0002: clients (pet parents), pets and vaccinations
-- =============================================================================

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  phone text not null,
  alt_phone text check (alt_phone is null or alt_phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  address text,
  city text,
  postal_code text,
  gst_state_code text check (gst_state_code is null or gst_state_code ~ '^[0-9]{2}$'),
  tax_id text,
  emergency_name text,
  emergency_phone text,
  notes text,
  consent_at timestamptz,
  consent_source text check (consent_source is null or consent_source in ('intake_form', 'staff', 'food_order')),
  bill_translation text check (bill_translation is null or bill_translation in ('hi', 'kn')),
  request_token text unique default public.new_token(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  erased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  -- An erased parent keeps no phone number (erase_client).
  constraint clients_phone_check check (phone ~ '^\+[1-9][0-9]{7,14}$' or (erased_at is not null and phone = '')),
  -- An erased parent stays hidden: nobody can bring the empty record back to the lists.
  constraint clients_erased_stay_hidden check (erased_at is null or deleted_at is not null)
);

comment on table public.clients is
  'A pet parent: the person who books and pays. Personal data under India''s DPDP Act, so collect only what the kennel needs.';
comment on column public.clients.phone is 'Mobile number in E.164 form. Also the WhatsApp address and how a returning parent is recognised.';
comment on column public.clients.gst_state_code is 'Buyer''s GST state code. Only needed when invoicing a GST-registered buyer in another state.';
comment on column public.clients.tax_id is 'Buyer''s GSTIN, for business customers who want it printed on the invoice.';
comment on column public.clients.emergency_name is 'Someone to call when the parent cannot be reached during a stay.';
comment on column public.clients.consent_at is 'When the parent agreed to the kennel holding their details. Evidence for DPDP.';
comment on column public.clients.consent_source is 'intake_form: the parent ticked the box themselves. food_order: they ticked it on the food order page. staff: a staff member recorded verbal consent.';
comment on column public.clients.bill_translation is
  'Bills are in English. A parent who asks gets each heading of their bills also in this language, in brackets: hi or kn. Empty: English only.';
comment on column public.clients.request_token is
  'Secret in the parent''s own booking link (/b/{token}), where they ask for a stay. renew_request_link() replaces it, so an old link stops working; erasing the parent clears it.';
comment on column public.clients.deleted_at is 'Soft delete. Hidden from lists but kept so that past bookings and invoices still make sense.';
comment on column public.clients.erased_at is
  'When the parent''s details were erased on their request (erase_client). The row stays, empty, because issued bills and past stays point at it.';

-- One live client per phone number per organisation.
create unique index clients_org_phone_key on public.clients (org_id, phone) where deleted_at is null;
create index clients_org_name_idx on public.clients (org_id, lower(full_name));

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create trigger clients_stamp_actor
  before insert or update on public.clients
  for each row execute function public.stamp_actor('created_by');

-- A parent's phone numbers are how they are recognised, messaged on WhatsApp
-- and matched when they send a form, so changing one is for owners and
-- managers. Staff add new parents with their numbers. A database session with
-- no signed-in user (migrations, the seed) is let through, as for prices.
create function public.clients_guard_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (new.phone is distinct from old.phone or new.alt_phone is distinct from old.alt_phone)
     and new.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
  then
    raise exception 'WB002: only an owner or manager can change a parent''s phone number' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function public.clients_guard_phone() is
  'Trigger: only owners and managers change a parent''s phone number or other number (WB002). Anyone may add a parent.';

create trigger clients_guard_phone
  before update on public.clients
  for each row execute function public.clients_guard_phone();

-- ---------------------------------------------------------------------------

create type public.pet_sex as enum ('male', 'female', 'unknown');
comment on type public.pet_sex is 'unknown is the honest default when nobody has said.';

create type public.pet_coat as enum ('short', 'double', 'long', 'curly', 'wire');
comment on type public.pet_coat is 'A pet''s coat, for grooming prices (M35): short, double (a thick undercoat), long, curly, wire.';

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  species text not null default 'dog' check (species in ('dog', 'cat', 'other')),
  breed text,
  sex public.pet_sex not null default 'unknown',
  is_neutered boolean,
  date_of_birth date,
  weight_g integer,
  target_weight_g integer check (target_weight_g is null or target_weight_g between 1 and 199999),
  color text,
  coat public.pet_coat,
  microchip text,
  photo_path text,
  food_notes text,
  medical_notes text,
  allergies text,
  behaviour_notes text,
  flags text[] not null default '{}',
  vet_name text,
  vet_phone text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  -- Lets a booking prove that its pet really belongs to its client.
  unique (org_id, client_id, id),
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete cascade
);

comment on table public.pets is 'An animal in the kennel''s care. Belongs to one client.';
comment on column public.pets.photo_path is 'Path of the profile photo inside the pet-media storage bucket.';
comment on column public.pets.weight_g is
  'The latest weight in grams, from pet_weights. Kept by the database (pets_latest_weight): whatever is written here is replaced.';
comment on column public.pets.target_weight_g is 'The weight the pet should get to, in grams, when it has one. Food portions (M28) use it.';
comment on column public.pets.coat is 'Its coat, for grooming: grooming services priced by coat use it (appointment_price()).';
comment on column public.pets.food_notes is 'What the pet eats, how much and when, in the parent''s words.';
comment on column public.pets.flags is
  'Short warning tags staff must see at a glance, e.g. escape_risk, bite_history, dog_reactive, anxious, on_medication, senior.';
comment on column public.pets.deleted_at is 'Soft delete, for the same reason as clients.deleted_at.';

create index pets_org_client_idx on public.pets (org_id, client_id);
create index pets_org_name_idx on public.pets (org_id, lower(name));

create trigger pets_set_updated_at
  before update on public.pets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Weights over time (M25). Grams, never a decimal.
-- ---------------------------------------------------------------------------

create table public.pet_weights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  pet_id uuid not null,
  weighed_on date not null,
  weight_g integer not null check (weight_g between 1 and 199999),
  body_condition smallint check (body_condition between 1 and 9),
  notes text check (notes is null or char_length(notes) <= 500),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, pet_id) references public.pets (org_id, id) on delete cascade
);

comment on table public.pet_weights is
  'A pet weighed on a day. The latest is copied to pets.weight_g; food portions are worked out from it (M28).';
comment on column public.pet_weights.weighed_on is 'The day the pet was weighed, in the kennel''s time zone.';
comment on column public.pet_weights.weight_g is 'Weight in grams: 34.5 kg is 34500.';
comment on column public.pet_weights.body_condition is
  'Body condition score from 1 (very thin) to 9 (very heavy); 4 and 5 are ideal for a dog. Empty when not scored.';
comment on column public.pet_weights.recorded_by is 'Who wrote the weight down. Set by the database.';

create index pet_weights_org_pet_idx on public.pet_weights (org_id, pet_id, weighed_on desc, created_at desc);

create trigger pet_weights_set_updated_at
  before update on public.pet_weights
  for each row execute function public.set_updated_at();

create trigger pet_weights_stamp_actor
  before insert or update on public.pet_weights
  for each row execute function public.stamp_actor('recorded_by');

create function public.pets_latest_weight()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A new pet has no weighings yet: its first one comes after it.
  if tg_op = 'INSERT' then
    new.weight_g := null;
  else
    new.weight_g := (
      select w.weight_g from public.pet_weights w
      where w.org_id = new.org_id and w.pet_id = new.id
      order by w.weighed_on desc, w.created_at desc
      limit 1
    );
  end if;
  return new;
end;
$$;
comment on function public.pets_latest_weight() is
  'Trigger: pets.weight_g is always the latest of the pet''s weighings, whatever was written to it.';

create trigger pets_latest_weight
  before insert or update on public.pets
  for each row execute function public.pets_latest_weight();

create function public.pet_weights_refresh_pet()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Touching the pet makes pets_latest_weight look again.
  if tg_op in ('UPDATE', 'DELETE') then
    update public.pets p set weight_g = null where p.org_id = old.org_id and p.id = old.pet_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.pets p set weight_g = null where p.org_id = new.org_id and p.id = new.pet_id;
  end if;
  return null;
end;
$$;
comment on function public.pet_weights_refresh_pet() is
  'Trigger: after a weighing is added, corrected or removed, the pet''s latest weight is worked out again.';

create trigger pet_weights_refresh_pet
  after insert or update or delete on public.pet_weights
  for each row execute function public.pet_weights_refresh_pet();

-- ---------------------------------------------------------------------------
-- Where a parent wants things delivered or a pet picked up (M25, D44).
-- ---------------------------------------------------------------------------

create type public.address_kind as enum ('home', 'work', 'other');
comment on type public.address_kind is 'What a parent''s address is, so it is named in the reader''s language: home, work or other.';

create table public.client_addresses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  kind public.address_kind not null default 'home',
  line text not null check (char_length(line) between 1 and 300),
  area text check (area is null or char_length(area) <= 120),
  postal_code text not null check (postal_code ~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$' and postal_code ~ '[0-9]'),
  map_url text check (map_url is null or (map_url ~ '^https://' and char_length(map_url) <= 500)),
  door_note text check (door_note is null or char_length(door_note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete cascade
);

comment on table public.client_addresses is
  'A place a parent wants food delivered or a pet picked up. Personal data, like a phone number: owners and managers change one, it is in the export, and erasing the parent deletes it.';
comment on column public.client_addresses.line is 'House or flat number, building and street, as the parent wrote it.';
comment on column public.client_addresses.area is 'The area or locality, as people there name it.';
comment on column public.client_addresses.postal_code is 'PIN code in India (six digits), or the postal code elsewhere (with at least one digit). Matched against service_areas.';
comment on column public.client_addresses.map_url is 'A map link the parent shared (https only), for whoever delivers.';
comment on column public.client_addresses.door_note is 'For whoever delivers: gate code, floor, leave with the guard.';

create index client_addresses_org_client_idx on public.client_addresses (org_id, client_id);

create trigger client_addresses_set_updated_at
  before update on public.client_addresses
  for each row execute function public.set_updated_at();

create trigger client_addresses_stamp_actor
  before insert or update on public.client_addresses
  for each row execute function public.stamp_actor('created_by');

-- ---------------------------------------------------------------------------
-- The places the kennel delivers to and picks up from (M25).
-- ---------------------------------------------------------------------------

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  postal_code text not null check (postal_code ~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$' and postal_code ~ '[0-9]'),
  name text not null check (char_length(name) between 1 and 80),
  delivery_charge_minor bigint check (delivery_charge_minor is null or delivery_charge_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, postal_code)
);

comment on table public.service_areas is
  'A PIN code the kennel delivers to and picks up from, with its name and charge. A code not listed is not served.';
comment on column public.service_areas.name is 'What the kennel calls the area, e.g. Indiranagar.';
comment on column public.service_areas.delivery_charge_minor is 'What a delivery or trip there costs the parent, in minor units. Empty: free.';

create trigger service_areas_set_updated_at
  before update on public.service_areas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------

create table public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  pet_id uuid not null,
  vaccine text not null check (char_length(vaccine) between 1 and 60),
  given_on date,
  valid_until date,
  certificate_path text,
  notes text,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, pet_id) references public.pets (org_id, id) on delete cascade,
  check (valid_until is null or given_on is null or valid_until >= given_on)
);

comment on table public.vaccinations is
  'One vaccine record for a pet. Which vaccines a kennel insists on is the kennel''s policy; Wagbook only stores and reminds.';
comment on column public.vaccinations.vaccine is 'Free text so any country''s schedule fits, e.g. rabies, dhppil, kennel_cough, fvrcp.';
comment on column public.vaccinations.valid_until is 'Date the protection lapses. Drives "vaccination due" warnings at booking and check-in.';
comment on column public.vaccinations.certificate_path is 'Path of the certificate photo or PDF inside the pet-media storage bucket.';
comment on column public.vaccinations.verified_by is 'Staff member who looked at the certificate and confirmed it.';

create index vaccinations_org_pet_idx on public.vaccinations (org_id, pet_id);

create trigger vaccinations_set_updated_at
  before update on public.vaccinations
  for each row execute function public.set_updated_at();

create trigger vaccinations_stamp_verified
  before insert or update on public.vaccinations
  for each row execute function public.stamp_when_set('verified_at', 'verified_by');
