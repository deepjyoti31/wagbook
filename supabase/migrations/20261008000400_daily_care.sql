-- =============================================================================
-- Wagbook 0004: daily care: routines, tasks, solo play, updates and incidents
-- =============================================================================

create type public.care_kind as enum ('meal', 'medication', 'walk', 'play', 'cleaning', 'other');
create type public.task_status as enum ('pending', 'done', 'skipped');
comment on type public.care_kind is 'What sort of care a routine or task is. Used to group and count tasks.';
comment on type public.task_status is
  'pending: still to do. done: completed (who and when are stamped). skipped: deliberately not done, with a note saying why.';

create table public.care_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  pet_id uuid,
  kind public.care_kind not null,
  label text not null check (char_length(label) between 1 and 80),
  details text,
  due_time time not null,
  requires_photo boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, pet_id) references public.pets (org_id, id) on delete cascade
);

comment on table public.care_items is
  'A routine that repeats every day. With no pet it is the house routine for every boarded pet (e.g. breakfast at 9); with a pet it is that pet''s own (e.g. a tablet at 8).';
comment on column public.care_items.pet_id is 'Empty for a house routine that applies to every pet in house.';
comment on column public.care_items.details is 'How to do it: "200 g kibble with warm water", "1 tablet with food".';
comment on column public.care_items.requires_photo is 'When true the app asks for a photo before the task can be marked done. Useful for medication.';

create index care_items_org_pet_idx on public.care_items (org_id, pet_id);

create trigger care_items_set_updated_at
  before update on public.care_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------

create table public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid not null,
  pet_id uuid not null,
  care_item_id uuid,
  task_date date not null,
  kind public.care_kind not null,
  label text not null check (char_length(label) between 1 and 80),
  details text,
  due_time time,
  status public.task_status not null default 'pending',
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  note text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The task must be about the booking's own pet.
  foreign key (org_id, booking_id, pet_id) references public.bookings (org_id, id, pet_id) on delete cascade,
  foreign key (org_id, care_item_id) references public.care_items (org_id, id) on delete set null (care_item_id),
  -- A medicine that was not given is something the parent and the next shift
  -- must be able to read about, so skipping one needs a reason.
  constraint care_tasks_skipped_medication_needs_note
    check (kind <> 'medication' or status <> 'skipped' or char_length(btrim(coalesce(note, ''))) > 0)
);

comment on table public.care_tasks is
  'One thing to do for one pet on one day. The Tasks screen is this table, grouped by time. Created from care_items by generate_care_tasks, or added by hand.';
comment on column public.care_tasks.care_item_id is 'The routine this task came from. Empty for one-off tasks added by staff.';
comment on column public.care_tasks.done_by is 'Who ticked it. Stamped automatically.';
comment on column public.care_tasks.photo_path is 'Proof photo inside the pet-media storage bucket.';

-- A routine produces at most one task per booking per day, which makes
-- generate_care_tasks safe to run as often as anyone likes.
create unique index care_tasks_once_per_routine
  on public.care_tasks (booking_id, task_date, care_item_id)
  where care_item_id is not null;
create index care_tasks_org_date_idx on public.care_tasks (org_id, task_date, due_time);

create trigger care_tasks_set_updated_at
  before update on public.care_tasks
  for each row execute function public.set_updated_at();

create function public.stamp_done()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.done_at := now();
      new.done_by := (select auth.uid());
    else
      new.done_at := old.done_at;
      new.done_by := old.done_by;
    end if;
  else
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end;
$$;
comment on function public.stamp_done() is
  'Trigger: records who and when as a task or play session is marked done, and clears it on undo. Client-supplied values for these columns are ignored.';

create trigger care_tasks_stamp_done
  before insert or update on public.care_tasks
  for each row execute function public.stamp_done();

create function public.generate_care_tasks(p_org uuid, p_date date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_created integer;
begin
  insert into public.care_tasks (org_id, booking_id, pet_id, care_item_id, task_date, kind, label, details, due_time)
  select b.org_id, b.id, b.pet_id, ci.id, p_date, ci.kind, ci.label, ci.details, ci.due_time
  from public.bookings b
  join public.care_items ci
    on ci.org_id = b.org_id
   and ci.is_active
   and (ci.pet_id is null or ci.pet_id = b.pet_id)
  where b.org_id = p_org
    and b.status = 'checked_in'
    -- From the first day until the pet is checked out, even past its end date:
    -- a pet that stays longer than planned still has to be fed.
    and p_date >= b.start_date
  on conflict (booking_id, task_date, care_item_id) where care_item_id is not null do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;
comment on function public.generate_care_tasks(uuid, date) is
  'Creates the day''s tasks for every pet in house (checked in, on or after its first day) from the house and per-pet routines. Safe to call repeatedly; returns how many tasks were new.';

-- ---------------------------------------------------------------------------
-- Solo play: one pet in a yard at a time
-- ---------------------------------------------------------------------------

create table public.play_yards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name)
);

comment on table public.play_yards is 'A fenced area where one pet at a time plays or exercises.';

create trigger play_yards_set_updated_at
  before update on public.play_yards
  for each row execute function public.set_updated_at();

create table public.play_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  yard_id uuid not null,
  booking_id uuid not null,
  pet_id uuid not null,
  session_date date not null,
  starts_at time not null,
  duration_minutes smallint not null check (duration_minutes between 5 and 240),
  status public.task_status not null default 'pending',
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, yard_id) references public.play_yards (org_id, id) on delete cascade,
  foreign key (org_id, booking_id, pet_id) references public.bookings (org_id, id, pet_id) on delete cascade,

  -- THE no-group-play guard: a yard holds one pet at a time.
  constraint play_sessions_one_pet_per_yard exclude using gist (
    yard_id with =,
    tsrange(session_date + starts_at, session_date + starts_at + make_interval(mins => duration_minutes::integer), '[)') with &&
  ) where (status <> 'skipped'),

  -- And a pet cannot be in two yards at once.
  constraint play_sessions_one_yard_per_pet exclude using gist (
    pet_id with =,
    tsrange(session_date + starts_at, session_date + starts_at + make_interval(mins => duration_minutes::integer), '[)') with &&
  ) where (status <> 'skipped')
);

comment on table public.play_sessions is
  'A slot when one pet has a yard to itself. The schedule is planned by planPlaySessions in src/lib/core/play-schedule.ts; the constraints here make overlap impossible whatever the app does.';
comment on column public.play_sessions.starts_at is 'Local clock time at the kennel.';

create index play_sessions_org_date_idx on public.play_sessions (org_id, session_date, starts_at);

create trigger play_sessions_set_updated_at
  before update on public.play_sessions
  for each row execute function public.set_updated_at();

create trigger play_sessions_stamp_done
  before insert or update on public.play_sessions
  for each row execute function public.stamp_done();

-- ---------------------------------------------------------------------------
-- Updates for parents and incidents
-- ---------------------------------------------------------------------------

create table public.stay_updates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid not null,
  pet_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  media_paths text[] not null default '{}',
  is_visible_to_parent boolean not null default true,
  shared_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, booking_id, pet_id) references public.bookings (org_id, id, pet_id) on delete cascade
);

comment on table public.stay_updates is
  'A note about how a pet is doing, usually with photos. Doubles as the shift handover log. Visible ones appear on the parent''s stay page.';
comment on column public.stay_updates.media_paths is 'Paths of photos or videos inside the pet-media storage bucket.';
comment on column public.stay_updates.is_visible_to_parent is 'False keeps the note internal (staff handover only).';
comment on column public.stay_updates.shared_at is 'When a staff member opened WhatsApp to send this update to the parent.';

create index stay_updates_org_booking_idx on public.stay_updates (org_id, booking_id, created_at desc);

create trigger stay_updates_set_updated_at
  before update on public.stay_updates
  for each row execute function public.set_updated_at();

create trigger stay_updates_stamp_actor
  before insert or update on public.stay_updates
  for each row execute function public.stamp_actor('created_by');

create type public.incident_severity as enum ('low', 'medium', 'high');
comment on type public.incident_severity is
  'low: worth noting. medium: the parent should be told today. high: the parent and a vet should be told now.';

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  pet_id uuid not null,
  booking_id uuid,
  occurred_at timestamptz not null default now(),
  category text not null check (category in ('illness', 'injury', 'fight', 'escape', 'behaviour', 'property', 'other')),
  severity public.incident_severity not null default 'low',
  description text not null check (char_length(description) between 1 and 4000),
  action_taken text,
  vet_visited boolean not null default false,
  parent_notified_at timestamptz,
  parent_notified_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, pet_id) references public.pets (org_id, id) on delete cascade,
  foreign key (org_id, booking_id) references public.bookings (org_id, id) on delete set null (booking_id)
);

comment on table public.incidents is
  'Anything out of the ordinary: illness, injury, a fight, an escape. A written, timed record of what happened and what was done protects the pet, the parent and the kennel.';
comment on column public.incidents.parent_notified_at is 'When the parent was told. Empty means not told yet, which the dashboard should flag for medium and high severity.';

create index incidents_org_idx on public.incidents (org_id, occurred_at desc);

create trigger incidents_set_updated_at
  before update on public.incidents
  for each row execute function public.set_updated_at();

create trigger incidents_stamp_actor
  before insert or update on public.incidents
  for each row execute function public.stamp_actor('created_by');

create trigger incidents_stamp_notified
  before insert or update on public.incidents
  for each row execute function public.stamp_when_set('parent_notified_at', 'parent_notified_by');
