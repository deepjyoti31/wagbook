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
  consent_source text check (consent_source is null or consent_source in ('intake_form', 'staff')),
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
comment on column public.clients.consent_source is 'intake_form: the parent ticked the box themselves. staff: a staff member recorded verbal consent.';
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

-- ---------------------------------------------------------------------------

create type public.pet_sex as enum ('male', 'female', 'unknown');
comment on type public.pet_sex is 'unknown is the honest default when nobody has said.';

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
  weight_kg numeric(5, 2) check (weight_kg is null or (weight_kg > 0 and weight_kg < 200)),
  color text,
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
