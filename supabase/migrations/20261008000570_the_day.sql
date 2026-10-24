-- =============================================================================
-- Wagbook 00057: the day, smoother (Phase 6, M50 to M57, D52)
--
--   Cleaning     a kennel left by a pet is to clean until someone taps
--                Cleaned (M50). Who cleaned and when is kept.
--   House jobs   opening and closing checklists and cleaning that repeats,
--                ticked by whoever did it; repairs, with their cost written
--                as an expense (M51).
--   Passing      a pet that has passed away: nothing more is booked, sent or
--                made for it from that day, and flowers go to the parent
--                (M52).
--   Stay report  what staff add to the report the parent sees at check-out:
--                a few words and the photos they pick (M53). The rest is
--                worked out from what is already recorded.
--   Supplies     food and medicines a parent brought, counted down as meals
--                and doses are ticked (M55).
--   Trial day    a day boarding visit before a new dog's first stay, and how
--                it settled (M56).
--   Vet visits   during a stay: the line on the bill, the expense and the
--                medicines as routines, in one step (M57).
--
-- Photo proof on care tasks (M54) is in 0004 with the tasks themselves.
-- Row level security for these tables is in 0008 with the rest of the access
-- model, as for every table until the migration freeze.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Kennels to clean between guests (M50)
-- ---------------------------------------------------------------------------

create table public.kennel_cleans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kennel_id uuid not null,
  booking_id uuid,
  left_at timestamptz not null default now(),
  cleaned_at timestamptz,
  cleaned_by uuid references auth.users (id) on delete set null,
  unique (org_id, id),
  foreign key (org_id, kennel_id) references public.kennels (org_id, id) on delete cascade,
  foreign key (org_id, booking_id) references public.bookings (org_id, id) on delete set null (booking_id)
);

comment on table public.kennel_cleans is
  'A kennel to clean after a pet left it (M50): written by the database when the last pet in it is checked out, and cleaned when someone taps Cleaned, which keeps who and when. One open at a time for each kennel.';
comment on column public.kennel_cleans.booking_id is 'The stay that left the kennel.';
comment on column public.kennel_cleans.left_at is 'When that pet was checked out.';
comment on column public.kennel_cleans.cleaned_at is 'When it was cleaned. Empty: still to clean. Stamped by the database, never cleared.';
comment on column public.kennel_cleans.cleaned_by is 'Who cleaned it. Stamped by the database.';

create unique index kennel_cleans_one_open on public.kennel_cleans (org_id, kennel_id) where cleaned_at is null;
comment on index public.kennel_cleans_one_open is 'A kennel is to clean once, however many pets left it.';

-- Cleaned is stamped with the real time and person, and stays cleaned. Runs as the caller.
create function public.kennel_cleans_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.cleaned_at is not null then
    raise exception 'WB250: this kennel was cleaned already' using errcode = '23514';
  end if;
  if new.cleaned_at is not null then
    new.cleaned_at := now();
    new.cleaned_by := (select auth.uid());
  end if;
  return new;
end;
$$;
comment on function public.kennel_cleans_check() is
  'Trigger: marking a kennel cleaned stamps the real time and the signed-in person; a kennel cleaned stays cleaned (WB250).';

create trigger kennel_cleans_check
  before update on public.kennel_cleans
  for each row execute function public.kennel_cleans_check();

-- The last pet out of a kennel leaves it to clean.
create function public.bookings_leave_kennel_to_clean()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER: kennel_cleans has no grant to add rows, so a kennel is
  -- to clean only because a pet really left it. The check-out itself was
  -- allowed (or refused) by the bookings policies before this runs.
  if new.status = 'checked_out' and old.status = 'checked_in' and new.kennel_id is not null
     and not exists (
       select 1 from public.bookings b
       where b.org_id = new.org_id and b.kennel_id = new.kennel_id and b.status = 'checked_in' and b.id <> new.id
     )
  then
    insert into public.kennel_cleans (org_id, kennel_id, booking_id)
    values (new.org_id, new.kennel_id, new.id)
    on conflict (org_id, kennel_id) where cleaned_at is null do nothing;
  -- A check-out undone (the pet is still here): its kennel is not to clean.
  elsif new.status = 'checked_in' and old.status = 'checked_out' then
    delete from public.kennel_cleans c
    where c.org_id = new.org_id and c.booking_id = new.id and c.cleaned_at is null;
  end if;
  return null;
end;
$$;
comment on function public.bookings_leave_kennel_to_clean() is
  'Trigger: when the last pet in a kennel is checked out, the kennel is to clean (kennel_cleans). A sibling still in it keeps it from being asked for. Undoing that check-out takes the kennel off the list again, if nobody has cleaned it yet. SECURITY DEFINER because nobody adds to or removes from kennel_cleans directly.';

create trigger bookings_leave_kennel_to_clean
  after update of status on public.bookings
  for each row execute function public.bookings_leave_kennel_to_clean();

-- ---------------------------------------------------------------------------
-- Jobs that are not about a pet (M51)
-- ---------------------------------------------------------------------------

create type public.house_list as enum ('opening', 'closing', 'cleaning');
comment on type public.house_list is
  'opening: the checklist at the start of the day. closing: at the end of the day. cleaning: cleaning that repeats (the yard daily, a deep clean weekly), on Care with the pets'' tasks.';

create table public.house_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  list public.house_list not null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  weekday smallint check (weekday is null or weekday between 1 and 7),
  due_time time,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);

comment on table public.house_jobs is
  'A job that is not about a pet (M51): an item of the opening or closing checklist, or cleaning that repeats, in the language it was typed in. Owners and managers set them; anyone ticks them (house_job_days).';
comment on column public.house_jobs.weekday is 'The one day of the week it is done, 1 Monday to 7 Sunday. Empty: every day.';
comment on column public.house_jobs.due_time is 'When it is done, kennel time, for cleaning on Care. Optional.';
comment on column public.house_jobs.is_active is 'False takes it off the list; days already ticked stay.';

create trigger house_jobs_set_updated_at
  before update on public.house_jobs
  for each row execute function public.set_updated_at();

create table public.house_job_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null,
  job_date date not null,
  status public.task_status not null default 'done',
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, job_id, job_date),
  foreign key (org_id, job_id) references public.house_jobs (org_id, id) on delete cascade
);

comment on table public.house_job_days is
  'A house job ticked on a day (M51): who did it and when, stamped by the database. A day with no row is still to do. Undoing puts it back to pending.';
comment on column public.house_job_days.job_date is 'The kennel date it was done for.';

create trigger house_job_days_set_updated_at
  before update on public.house_job_days
  for each row execute function public.set_updated_at();

create trigger house_job_days_stamp_done
  before insert or update on public.house_job_days
  for each row execute function public.stamp_done();

create table public.repairs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  what text not null check (char_length(btrim(what)) between 1 and 200),
  details text check (details is null or char_length(details) <= 1000),
  reported_at timestamptz not null default now(),
  reported_by uuid references auth.users (id) on delete set null default auth.uid(),
  fixed_at timestamptz,
  fixed_by uuid references auth.users (id) on delete set null,
  fixed_note text check (fixed_note is null or char_length(fixed_note) <= 300),
  cost_minor bigint check (cost_minor is null or cost_minor >= 0),
  expense_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, expense_id) references public.expenses (org_id, id) on delete set null (expense_id)
);

comment on table public.repairs is
  'Something broken at the kennel (M51): a pump, a fan, fencing. Anyone reports it and marks it fixed with what it cost; an owner or manager writes the cost as an expense (repair_to_expense).';
comment on column public.repairs.reported_by is 'Who reported it. Stamped by the database.';
comment on column public.repairs.fixed_at is 'When it was marked fixed. Empty: still broken. Stamped by the database.';
comment on column public.repairs.fixed_by is 'Who marked it fixed. Stamped by the database.';
comment on column public.repairs.cost_minor is 'What fixing it cost, in minor units.';
comment on column public.repairs.expense_id is 'The expense its cost was written as, by an owner or manager.';

create trigger repairs_set_updated_at
  before update on public.repairs
  for each row execute function public.set_updated_at();

create trigger repairs_stamp_reported
  before insert or update on public.repairs
  for each row execute function public.stamp_actor('reported_by');

create trigger repairs_stamp_fixed
  before insert or update on public.repairs
  for each row execute function public.stamp_when_set('fixed_at', 'fixed_by');

-- Linking an expense is the expense's business: owners and managers. Runs as the caller.
create function public.repairs_guard_expense()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.expense_id is distinct from (case when tg_op = 'UPDATE' then old.expense_id end)
     and (select auth.uid()) is not null
     and new.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
  then
    raise exception 'WB002: only an owner or manager writes a repair''s cost as an expense' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function public.repairs_guard_expense() is
  'Trigger: only an owner or manager links a repair to an expense (WB002); anyone reports and marks a repair fixed.';

create trigger repairs_guard_expense
  before insert or update on public.repairs
  for each row execute function public.repairs_guard_expense();

-- ---------------------------------------------------------------------------
-- A pet that has passed away (M52)
-- ---------------------------------------------------------------------------

alter table public.pets
  add column passed_away_on date,
  add column passed_away_at timestamptz,
  add column passed_away_by uuid references auth.users (id) on delete set null,
  add column flowers_sent_at timestamptz,
  add column flowers_sent_by uuid references auth.users (id) on delete set null;

comment on column public.pets.passed_away_on is
  'The day the pet passed away (M52). From that day nothing is booked, sent or made for it, and it leaves the lists; its page keeps everything. Set by an owner or manager; undone within a week of being set.';
comment on column public.pets.passed_away_at is 'When it was marked as passed away, which starts the week it can be undone in. Stamped by the database.';
comment on column public.pets.passed_away_by is 'Who marked it. Stamped by the database.';
comment on column public.pets.flowers_sent_at is 'When someone marked the flowers to the parent as sent. Empty with passed_away_on set: on Today until done.';
comment on column public.pets.flowers_sent_by is 'Who marked the flowers sent. Stamped by the database.';

create trigger pets_stamp_flowers
  before insert or update on public.pets
  for each row execute function public.stamp_when_set('flowers_sent_at', 'flowers_sent_by');

-- Who marks a pet as passed away, and undoing it. Runs as the caller.
create function public.pets_check_passing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.passed_away_at := null;
    new.passed_away_by := null;
    if new.passed_away_on is null then
      return new;
    end if;
  elsif new.passed_away_on is not distinct from old.passed_away_on then
    new.passed_away_at := old.passed_away_at;
    new.passed_away_by := old.passed_away_by;
    return new;
  end if;
  if (select auth.uid()) is not null
     and new.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
  then
    raise exception 'WB251: only an owner or manager marks a pet as passed away' using errcode = '42501';
  end if;
  if new.passed_away_on > public.org_today(new.org_id) then
    raise exception 'WB252: the day a pet passed away is today or a day before' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.passed_away_on is not null then
    if old.passed_away_at < now() - interval '7 days' then
      raise exception 'WB253: a pet''s passing is undone or changed only within a week of marking it' using errcode = '23514';
    end if;
    if new.passed_away_on is not null then
      -- The day corrected: the week still counts from when it was marked.
      new.passed_away_at := old.passed_away_at;
      new.passed_away_by := old.passed_away_by;
      return new;
    end if;
  end if;
  if new.passed_away_on is null then
    new.passed_away_at := null;
    new.passed_away_by := null;
    new.flowers_sent_at := null;
  else
    new.passed_away_at := now();
    new.passed_away_by := (select auth.uid());
  end if;
  return new;
end;
$$;
comment on function public.pets_check_passing() is
  'Trigger: only an owner or manager marks a pet as passed away (WB251), on today or a day before (WB252), and undoes or changes it only within a week of marking it (WB253). Stamps who and when.';

create trigger pets_check_passing
  before insert or update of passed_away_on on public.pets
  for each row execute function public.pets_check_passing();

-- From the day a pet passed away nothing more is made for it: stays and
-- appointments still to come are cancelled with no charge, its food ends and
-- its deliveries still to go are cancelled. Runs as the caller, an owner or
-- manager (pets_check_passing). Undoing the passing brings none of it back.
create function public.pets_after_passing()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := public.org_today(new.org_id);
begin
  if new.passed_away_on is null or old.passed_away_on is not null then
    return null;
  end if;
  update public.bookings b
  set status = 'cancelled', cancel_reason = 'Passed away', waitlisted_at = null
  where b.org_id = new.org_id and b.pet_id = new.id and b.status in ('requested', 'confirmed');
  update public.appointments a
  set status = 'cancelled', cancel_reason = 'Passed away'
  where a.org_id = new.org_id and a.pet_id = new.id and a.status in ('requested', 'confirmed');
  update public.subscriptions s
  set cancelled_on = greatest(new.passed_away_on, v_today), cancel_reason = 'Passed away'
  where s.org_id = new.org_id and s.pet_id = new.id and (s.cancelled_on is null or s.cancelled_on > greatest(new.passed_away_on, v_today));
  -- What subscriptions_replan left (past their cut-off) and one-off orders.
  update public.deliveries d
  set status = 'cancelled', cancel_reason = 'Passed away'
  where d.org_id = new.org_id and d.pet_id = new.id and d.status in ('planned', 'packed') and d.delivery_date >= v_today;
  return null;
end;
$$;
comment on function public.pets_after_passing() is
  'Trigger: when a pet is marked as passed away, its stays and appointments still to come are cancelled with no charge ("Passed away"), its subscriptions end, and its deliveries still to go are cancelled. Undoing the passing restores none of them.';

create trigger pets_after_passing
  after update of passed_away_on on public.pets
  for each row execute function public.pets_after_passing();

-- Nothing new is booked or made for a pet that has passed away. Runs as the caller.
create function public.refuse_passed_pet()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
begin
  select p.name into v_name
  from public.pets p
  where p.org_id = new.org_id and p.id = new.pet_id and p.passed_away_on is not null;
  if v_name is not null then
    raise exception 'WB254: % has passed away', v_name using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.refuse_passed_pet() is
  'Trigger: refuses a new stay, appointment, subscription or delivery for a pet that has passed away (WB254).';

create trigger bookings_refuse_passed_pet
  before insert on public.bookings
  for each row execute function public.refuse_passed_pet();
create trigger appointments_refuse_passed_pet
  before insert on public.appointments
  for each row execute function public.refuse_passed_pet();
create trigger subscriptions_refuse_passed_pet
  before insert on public.subscriptions
  for each row execute function public.refuse_passed_pet();
create trigger deliveries_refuse_passed_pet
  before insert on public.deliveries
  for each row execute function public.refuse_passed_pet();

-- ---------------------------------------------------------------------------
-- A stay report at check-out (M53)
-- ---------------------------------------------------------------------------

create table public.stay_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid not null,
  words text check (words is null or char_length(words) <= 1000),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 6),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, booking_id),
  foreign key (org_id, booking_id) references public.bookings (org_id, id) on delete cascade
);

comment on table public.stay_reports is
  'What staff add to a stay''s report for the parent (M53): a few words and the photos they pick. The report itself (nights, meals, play, weight, medicines, incidents the parent was told of) is worked out from the stay''s records when it is read, and shows on the stay page once the pet has gone home.';
comment on column public.stay_reports.words is 'A few words from the kennel to the parent, shown at the top of the report.';
comment on column public.stay_reports.photo_paths is 'Photos picked for the report, each one already on an update of this stay shown to the parent.';

create trigger stay_reports_set_updated_at
  before update on public.stay_reports
  for each row execute function public.set_updated_at();

create trigger stay_reports_stamp_actor
  before insert or update on public.stay_reports
  for each row execute function public.stamp_actor('created_by');

-- A report is for a stay in the kennel or gone home, and shows only photos
-- the parent was already shown on that stay. Runs as the caller.
create function public.stay_reports_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.bookings b
    where b.org_id = new.org_id and b.id = new.booking_id and b.status in ('checked_in', 'checked_out')
  ) then
    raise exception 'WB260: a stay report is for a pet in the kennel or gone home' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(new.photo_paths) as p (path)
    where not exists (
      select 1 from public.stay_updates su
      where su.org_id = new.org_id and su.booking_id = new.booking_id and su.is_visible_to_parent and p.path = any (su.media_paths)
    )
  ) then
    raise exception 'WB261: pick the report''s photos from this stay''s updates to the parent' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.stay_reports_check() is
  'Trigger: a stay report is for a stay in the kennel or gone home (WB260), and its photos are photos on that stay''s updates shown to the parent (WB261), so the report never shows a photo the parent was not meant to see.';

create trigger stay_reports_check
  before insert or update on public.stay_reports
  for each row execute function public.stay_reports_check();

-- ---------------------------------------------------------------------------
-- A parent's own food and medicines (M55)
-- ---------------------------------------------------------------------------

create type public.supply_kind as enum ('food', 'medicine');
comment on type public.supply_kind is
  'food: the parent''s own food, in grams, eaten at each meal. medicine: the parent''s own medicine, in doses, given at each dose.';

create table public.stay_supplies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid not null,
  pet_id uuid not null,
  kind public.supply_kind not null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  brought integer not null check (brought between 1 and 1000000),
  per_task integer not null check (per_task between 1 and 100000),
  care_item_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, booking_id, pet_id) references public.bookings (org_id, id, pet_id) on delete cascade,
  foreign key (org_id, care_item_id) references public.care_items (org_id, id) on delete set null (care_item_id)
);

comment on table public.stay_supplies is
  'What a parent brought for a stay (M55): their own food (whole grams) or a medicine (whole doses), and how much goes each meal or dose. Counted down as the stay''s meals or doses are ticked (stay_supply_left); what is left goes home.';
comment on column public.stay_supplies.label is 'What it is, as the parent named it: "Royal Canin Mini", "Apoquel 16 mg".';
comment on column public.stay_supplies.brought is 'How much came: grams of food, or doses of medicine.';
comment on column public.stay_supplies.per_task is 'How much each meal (grams) or each dose (doses) uses.';
comment on column public.stay_supplies.care_item_id is 'For a medicine: the routine it is given at. Empty: every meal (food) or every medicine round (medicine).';

create index stay_supplies_org_booking_idx on public.stay_supplies (org_id, booking_id);

create trigger stay_supplies_set_updated_at
  before update on public.stay_supplies
  for each row execute function public.set_updated_at();

create trigger stay_supplies_stamp_actor
  before insert or update on public.stay_supplies
  for each row execute function public.stamp_actor('created_by');

-- How much is left of each, how many days that lasts, and whether it runs out
-- before the stay ends. A meal or dose counts once it is ticked done.
create view public.stay_supply_left
with (security_invoker = true)
as
with counted as (
  select s.org_id, s.id as supply_id, s.booking_id, s.pet_id, s.kind, s.label, s.brought, s.per_task, s.care_item_id,
         b.kind as stay_kind, b.status, b.end_date,
         (select count(*) from public.care_tasks t
           where t.org_id = s.org_id and t.booking_id = s.booking_id and t.status = 'done'
             and (case when s.care_item_id is not null then t.care_item_id = s.care_item_id
                       else t.kind = (case s.kind when 'food' then 'meal' else 'medication' end)::public.care_kind end)) as used_tasks,
         (select count(*) from public.care_items ci
           where ci.org_id = s.org_id and ci.is_active and (ci.pet_id is null or ci.pet_id = s.pet_id)
             and (case when s.care_item_id is not null then ci.id = s.care_item_id
                       else ci.kind = (case s.kind when 'food' then 'meal' else 'medication' end)::public.care_kind end)) as tasks_a_day,
         public.org_today(s.org_id) as today
  from public.stay_supplies s
  join public.bookings b on b.org_id = s.org_id and b.id = s.booking_id
)
select c.org_id, c.supply_id, c.booking_id, c.pet_id, c.kind, c.label, c.brought, c.per_task,
       c.used_tasks::integer as used_tasks,
       least(c.brought, c.used_tasks * c.per_task)::integer as used,
       greatest(c.brought - c.used_tasks * c.per_task, 0)::integer as left_amount,
       c.tasks_a_day::integer as tasks_a_day,
       case when c.tasks_a_day > 0 then (greatest(c.brought - c.used_tasks * c.per_task, 0) / (c.tasks_a_day * c.per_task))::integer end as days_left,
       greatest(c.end_date - c.today + case when c.stay_kind = 'daycare' then 1 else 0 end, 0)::integer as days_to_go,
       (c.status = 'checked_in' and c.tasks_a_day > 0
        and greatest(c.brought - c.used_tasks * c.per_task, 0) / (c.tasks_a_day * c.per_task)
            < c.end_date - c.today + case when c.stay_kind = 'daycare' then 1 else 0 end) as runs_short
from counted c;

comment on view public.stay_supply_left is
  'Each supply a parent brought (M55) counted down: meals or doses ticked done, what is left, how many a day the pet''s routines use, the whole days that lasts, the days of the stay still to go (today included for day boarding), and whether it runs out first while the pet is in. Runs as the caller.';
comment on column public.stay_supply_left.used_tasks is 'Meals or doses ticked done for this stay.';
comment on column public.stay_supply_left.left_amount is 'Grams or doses left, never below nothing.';
comment on column public.stay_supply_left.tasks_a_day is 'Meals or doses a day by the pet''s routines now.';
comment on column public.stay_supply_left.days_left is 'Whole days what is left lasts. Empty when no routine uses it.';
comment on column public.stay_supply_left.days_to_go is 'Days of the stay still to come: nights for boarding, days for day boarding.';
comment on column public.stay_supply_left.runs_short is 'True when the pet is in and what is left will not last the stay.';

-- ---------------------------------------------------------------------------
-- Trial day for new dogs (M56)
-- ---------------------------------------------------------------------------

create type public.trial_outcome as enum ('settled', 'anxious', 'reactive');
comment on type public.trial_outcome is 'How a dog settled on its trial day: settled, anxious, or reactive with other dogs.';

alter table public.bookings
  add column is_trial boolean not null default false,
  add column trial_outcome public.trial_outcome,
  add column trial_note text check (trial_note is null or char_length(trial_note) <= 300),
  add constraint bookings_trial_is_a_day check (not is_trial or kind = 'daycare'),
  add constraint bookings_trial_outcome_on_trial check (is_trial or (trial_outcome is null and trial_note is null));

comment on column public.bookings.is_trial is
  'A trial day (M56): day boarding for a new dog before its first stay. Offered by a kennel that wants it; it never blocks a booking.';
comment on column public.bookings.trial_outcome is 'How the dog settled on its trial day, noted by staff afterwards. Shown on the pet page and at check-in.';
comment on column public.bookings.trial_note is 'A sentence about the trial day.';

-- ---------------------------------------------------------------------------
-- Vet visits during a stay (M57)
-- ---------------------------------------------------------------------------

create table public.vet_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  pet_id uuid not null,
  booking_id uuid,
  visited_on date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  vet text check (vet is null or char_length(vet) <= 120),
  findings text check (findings is null or char_length(findings) <= 2000),
  cost_minor bigint not null default 0 check (cost_minor >= 0),
  booking_item_id uuid,
  expense_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, pet_id) references public.pets (org_id, id) on delete cascade,
  foreign key (org_id, booking_id) references public.bookings (org_id, id) on delete set null (booking_id),
  foreign key (org_id, expense_id) references public.expenses (org_id, id) on delete set null (expense_id)
);

comment on table public.vet_visits is
  'A visit to the vet (M57), usually during a stay: why, which vet, what the vet said and what it cost. Part of the pet''s health record, kept with the pet. Recorded with record_vet_visit(), which puts the cost on the stay''s bill and in the expenses and the medicines on the pet''s routine.';
comment on column public.vet_visits.vet is 'The vet or clinic seen.';
comment on column public.vet_visits.findings is 'What the vet said.';
comment on column public.vet_visits.cost_minor is 'What the visit cost, in minor units.';
comment on column public.vet_visits.booking_item_id is 'The line on the stay''s bill for the cost (booking_items). Not a foreign key: an owner or manager may take the line off the bill.';
comment on column public.vet_visits.expense_id is 'The expense its cost was written as, by an owner or manager.';

create index vet_visits_org_pet_idx on public.vet_visits (org_id, pet_id, visited_on desc);

create trigger vet_visits_set_updated_at
  before update on public.vet_visits
  for each row execute function public.set_updated_at();

create trigger vet_visits_stamp_actor
  before insert or update on public.vet_visits
  for each row execute function public.stamp_actor('created_by');

-- Linking an expense is the expense's business: owners and managers.
create trigger vet_visits_guard_expense
  before insert or update on public.vet_visits
  for each row execute function public.repairs_guard_expense();

-- Write a cost as an expense, in one step with linking it. Runs as the caller,
-- so the expenses policies decide (owners and managers).
create function public.cost_to_expense(p_org uuid, p_kind text, p_id uuid, p_category text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_expense uuid;
  v_amount bigint;
  v_on date;
  v_what text;
  v_vendor text;
  v_booking uuid;
begin
  if p_org is null or p_org not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB002: only an owner or manager writes an expense' using errcode = '42501';
  end if;
  if p_kind = 'repair' then
    select r.cost_minor, coalesce((r.fixed_at at time zone o.time_zone)::date, public.org_today(p_org)), r.what, null::text, null::uuid, r.expense_id
      into v_amount, v_on, v_what, v_vendor, v_booking, v_expense
    from public.repairs r join public.organizations o on o.id = r.org_id
    where r.org_id = p_org and r.id = p_id;
  elsif p_kind = 'vet' then
    select v.cost_minor, v.visited_on, v.reason, v.vet, v.booking_id, v.expense_id
      into v_amount, v_on, v_what, v_vendor, v_booking, v_expense
    from public.vet_visits v
    where v.org_id = p_org and v.id = p_id;
  else
    raise exception 'WB003: that could not be found' using errcode = 'P0002';
  end if;
  if v_what is null then
    raise exception 'WB003: that could not be found' using errcode = 'P0002';
  end if;
  if v_expense is not null then
    return v_expense;
  end if;
  if coalesce(v_amount, 0) <= 0 then
    raise exception 'WB255: write what it cost first' using errcode = '23514';
  end if;
  insert into public.expenses (org_id, spent_on, category, vendor, description, amount_minor, booking_id, is_reimbursable)
  values (p_org, v_on, left(coalesce(nullif(btrim(p_category), ''), p_kind), 60), v_vendor, left(v_what, 500), v_amount, v_booking, p_kind = 'vet' and v_booking is not null)
  returning id into v_expense;
  if p_kind = 'repair' then
    update public.repairs r set expense_id = v_expense where r.org_id = p_org and r.id = p_id;
  else
    update public.vet_visits v set expense_id = v_expense where v.org_id = p_org and v.id = p_id;
  end if;
  return v_expense;
end;
$$;
comment on function public.cost_to_expense(uuid, text, uuid, text) is
  'Writes the cost of a repair (p_kind repair, M51) or a vet visit (vet, M57) as an expense in the category given, and links it; once only (a second call returns the same expense). Owners and managers (WB002); refused with no cost (WB255). Runs as the caller.';

-- A vet visit in one step: the visit, the line on the stay's bill, the expense
-- (for an owner or manager) and the medicines as the pet's own routine. Runs
-- as the caller: staff may add a one-off line to a bill and a pet's routine,
-- and the expense is left for an owner or manager.
create function public.record_vet_visit(
  p_org uuid,
  p_booking uuid,
  p_visited_on date,
  p_reason text,
  p_vet text,
  p_findings text,
  p_cost_minor bigint,
  p_line text,
  p_category text,
  p_medicines jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_visit uuid;
  v_item uuid;
  v_med jsonb;
begin
  if p_org is null or p_org not in (select public.my_org_ids()) then
    raise exception 'WB003: that stay could not be found' using errcode = 'P0002';
  end if;
  select * into v_booking from public.bookings b where b.org_id = p_org and b.id = p_booking;
  if v_booking.id is null then
    raise exception 'WB003: that stay could not be found' using errcode = 'P0002';
  end if;
  if coalesce(p_cost_minor, 0) < 0 then
    raise exception 'WB255: the cost is nothing or more' using errcode = '22023';
  end if;
  if p_visited_on is null or p_visited_on > public.org_today(p_org) then
    raise exception 'WB256: a vet visit is written on its day or after' using errcode = '22023';
  end if;
  insert into public.vet_visits (org_id, pet_id, booking_id, visited_on, reason, vet, findings, cost_minor)
  values (p_org, v_booking.pet_id, v_booking.id, p_visited_on, btrim(p_reason), nullif(btrim(p_vet), ''), nullif(btrim(p_findings), ''), coalesce(p_cost_minor, 0))
  returning id into v_visit;

  if coalesce(p_cost_minor, 0) > 0 then
    insert into public.booking_items (org_id, booking_id, description, quantity, unit_price_minor)
    values (p_org, v_booking.id, left(coalesce(nullif(btrim(p_line), ''), btrim(p_reason)), 200), 1, p_cost_minor)
    returning id into v_item;
    update public.vet_visits v set booking_item_id = v_item where v.org_id = p_org and v.id = v_visit;
    if p_org in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
      perform public.cost_to_expense(p_org, 'vet', v_visit, p_category);
    end if;
  end if;

  for v_med in select * from jsonb_array_elements(coalesce(p_medicines, '[]'::jsonb)) loop
    insert into public.care_items (org_id, pet_id, kind, label, details, due_time)
    values (p_org, v_booking.pet_id, 'medication', left(btrim(v_med ->> 'label'), 80), nullif(btrim(v_med ->> 'details'), ''), (v_med ->> 'due_time')::time);
  end loop;
  return v_visit;
end;
$$;
comment on function public.record_vet_visit(uuid, uuid, date, text, text, text, bigint, text, text, jsonb) is
  'Records a vet visit during a stay (M57) in one step: the visit on the pet''s health record, its cost as a line on the stay''s bill (p_line), and, for an owner or manager, as an expense in p_category; each medicine prescribed ({label, details, due_time}) as the pet''s own routine, so its tasks are made. Refused for a stay not found (WB003), a cost below nothing (WB255) or a day after today (WB256). Runs as the caller. Returns the visit.';
