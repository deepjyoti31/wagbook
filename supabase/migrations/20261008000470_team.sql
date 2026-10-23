-- =============================================================================
-- Wagbook 00047: the team (Phase 4, M43, D48)
--
--   Shifts      the kennel's shifts (morning, evening, night), each with its
--               hours; a night shift ends the next morning.
--   Rota        who works which shift on which day. One person is never on
--               two shifts at once, nor on a day of their granted leave.
--   Leave       asked for by the person, granted or refused by an owner or
--               manager (never their own, unless an owner).
--   Attendance  clocking in and out from the phone. The database stamps the
--               time; only an owner or manager writes a time by hand, with a
--               note. A person sees their own; owners and managers everyone's.
--   Patterns    a person's usual week (Monday morning, Tuesday evening), which
--               fills the rota four weeks ahead, week after week (M60).
--
-- Who lives on site is memberships.lives_on_site. The whole area shows only
-- while organizations.keeps_rota is on.
--
-- Row level security for these tables is in 0008 with the rest of the access
-- model, as for every table until the migration freeze.
-- =============================================================================

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  starts_at time not null,
  ends_at time not null,
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  constraint shifts_have_hours check (ends_at <> starts_at)
);

comment on table public.shifts is
  'A shift the kennel works (M43), such as Morning 07:00 to 15:00 or Night 23:00 to 07:00, in the language it was typed in. Taken off the list rather than deleted once used.';
comment on column public.shifts.starts_at is 'When it starts, kennel time.';
comment on column public.shifts.ends_at is 'When it ends, kennel time. At or before the start means the next day (a night shift).';
comment on column public.shifts.is_active is 'False takes it off the list: no new rota rows, the old ones stay.';

create unique index shifts_one_name on public.shifts (org_id, lower(btrim(name)));
comment on index public.shifts_one_name is 'Two shifts of one kennel never share a name.';

create type public.leave_status as enum ('asked', 'granted', 'refused', 'withdrawn');
comment on type public.leave_status is
  'asked: waiting for an owner or manager. granted: the person is off those days. refused: not given. withdrawn: taken back by the person or a manager. Refused and withdrawn are final.';

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  starts_on date not null,
  ends_on date not null,
  reason text check (reason is null or char_length(reason) <= 300),
  status public.leave_status not null default 'asked',
  answer text check (answer is null or char_length(answer) <= 300),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade,
  constraint leave_requests_in_order check (ends_on >= starts_on and ends_on - starts_on < 92),
  constraint leave_requests_one_at_a_time
    exclude using gist (org_id with =, user_id with =, daterange(starts_on, ends_on, '[]') with &&)
    where (status in ('asked', 'granted'))
);

comment on table public.leave_requests is
  'Days off (M43): asked for by the person (or put in by an owner or manager), then granted or refused by an owner or manager, never the person themselves unless an owner. Granting takes the person off the rota on those days. A person sees their own; owners and managers everyone''s.';
comment on column public.leave_requests.starts_on is 'The first day off, kennel date.';
comment on column public.leave_requests.ends_on is 'The last day off, kennel date. At most 92 days in one request.';
comment on column public.leave_requests.answer is 'What the owner or manager said with the answer, if anything.';
comment on column public.leave_requests.decided_by is 'Who granted, refused or withdrew it. Set by the database.';
comment on column public.leave_requests.decided_at is 'When it was granted, refused or withdrawn. Set by the database.';

create index leave_requests_org_dates_idx on public.leave_requests (org_id, starts_on);

create trigger leave_requests_set_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();

create trigger leave_requests_stamp_actor
  before insert or update on public.leave_requests
  for each row execute function public.stamp_actor('created_by');

-- Who answers leave, and what may change once it is answered. Runs as the caller.
create function public.leave_requests_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_manager boolean := new.org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]));
  v_owner boolean := new.org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[]));
  v_self boolean := new.user_id = (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.status not in ('asked', 'granted') then
      raise exception 'WB225: leave is asked for, or put in as granted' using errcode = '23514';
    end if;
  elsif old.status in ('refused', 'withdrawn') then
    raise exception 'WB225: this leave has been answered. Ask again for new days.' using errcode = '23514';
  elsif (new.starts_on, new.ends_on, new.reason) is distinct from (old.starts_on, old.ends_on, old.reason) and old.status <> 'asked' then
    raise exception 'WB225: granted leave keeps its days. Withdraw it and ask again.' using errcode = '23514';
  elsif new.status is distinct from old.status and (new.status = 'asked' or (new.status in ('granted', 'refused') and old.status <> 'asked')) then
    raise exception 'WB225: this leave has been answered. Withdraw it and ask again.' using errcode = '23514';
  end if;

  if new.status in ('granted', 'refused') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    if not v_manager then
      raise exception 'WB223: only an owner or manager grants or refuses leave' using errcode = '42501';
    end if;
    if v_self and not v_owner then
      raise exception 'WB224: someone else answers your own leave' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'asked' then
      new.decided_by := null;
      new.decided_at := null;
    else
      new.decided_by := (select auth.uid());
      new.decided_at := now();
    end if;
  else
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
  end if;
  return new;
end;
$$;
comment on function public.leave_requests_check() is
  'Trigger: only an owner or manager grants or refuses leave (WB223), and not their own unless an owner (WB224); only leave still asked for changes its days; refused and withdrawn leave is final (WB225). Stamps who answered and when.';

create trigger leave_requests_check
  before insert or update on public.leave_requests
  for each row execute function public.leave_requests_check();

-- ---------------------------------------------------------------------------
-- The rota
-- ---------------------------------------------------------------------------

create table public.rota (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  shift_id uuid not null,
  user_id uuid not null,
  work_date date not null,
  starts_at timestamp,
  ends_at timestamp,
  pattern_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, shift_id) references public.shifts (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade,
  -- rota_check fills them in from the shift.
  constraint rota_timed check (starts_at is not null and ends_at is not null and ends_at > starts_at),
  constraint rota_one_shift_at_a_time
    exclude using gist (org_id with =, user_id with =, tsrange(starts_at, ends_at) with &&)
);

comment on table public.rota is
  'Who works which shift on which day (M43). A person is never on two shifts that overlap (rota_one_shift_at_a_time), nor on a day of their granted leave (WB222). Owners and managers plan it; everyone reads it.';
comment on column public.rota.work_date is 'The day the shift starts, kennel date. A night shift ends the next morning.';
comment on column public.rota.starts_at is 'When it starts, kennel clock, copied from the shift. Moves with the shift''s hours from today on.';
comment on column public.rota.ends_at is 'When it ends, kennel clock, the next day for a night shift.';
comment on column public.rota.pattern_id is 'The weekly pattern that put it there (M60), or empty when it was put there by hand. Its days still to come go when the pattern goes.';

create index rota_org_date_idx on public.rota (org_id, work_date);

create trigger rota_stamp_actor
  before insert or update on public.rota
  for each row execute function public.stamp_actor('created_by');

-- A rota row's hours are its shift's on its day; the person must work here
-- (not a rider) and not be on leave. Runs as the caller.
create function public.rota_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_shift public.shifts;
  v_member public.memberships;
begin
  select * into v_shift from public.shifts s where s.org_id = new.org_id and s.id = new.shift_id;
  if v_shift.id is null then
    return new;
  end if;
  if not v_shift.is_active and (tg_op = 'INSERT' or new.shift_id is distinct from old.shift_id) then
    raise exception 'WB220: that shift is off the list' using errcode = '23514';
  end if;
  select * into v_member from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id;
  if v_member.user_id is null or not v_member.is_active or v_member.role = 'rider' then
    raise exception 'WB221: only owners, managers and staff working here now are on the rota and clock in' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.leave_requests l
    where l.org_id = new.org_id and l.user_id = new.user_id and l.status = 'granted'
      and new.work_date between l.starts_on and l.ends_on
  ) then
    raise exception 'WB222: % is on leave that day', v_member.display_name using errcode = '23514';
  end if;
  new.starts_at := new.work_date + v_shift.starts_at;
  new.ends_at := new.work_date + v_shift.ends_at
    + case when v_shift.ends_at <= v_shift.starts_at then interval '1 day' else interval '0 days' end;
  return new;
end;
$$;
comment on function public.rota_check() is
  'Trigger: a rota row takes its shift''s hours on its day (the next morning for a night shift); never a shift off the list (WB220), a person not working here or a rider (WB221), or a day of their granted leave (WB222).';

create trigger rota_check
  before insert or update on public.rota
  for each row execute function public.rota_check();

-- A shift's new hours apply to its rota from today on. Runs as the caller.
create function public.shifts_follow_rota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then
    -- rota_check sets the hours again from the shift.
    update public.rota r set work_date = r.work_date
    where r.org_id = new.org_id and r.shift_id = new.id
      and r.work_date >= (select (now() at time zone o.time_zone)::date from public.organizations o where o.id = new.org_id);
  end if;
  return null;
end;
$$;
comment on function public.shifts_follow_rota() is
  'Trigger: when a shift''s hours change, its rota rows from today on take the new hours (refused if that puts a person on two shifts at once).';

create trigger shifts_follow_rota
  after update of starts_at, ends_at on public.shifts
  for each row execute function public.shifts_follow_rota();

-- Granted leave takes the person off the rota on those days. Runs as the
-- caller, an owner or manager (leave_requests_check).
create function public.leave_clears_rota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'granted' and (tg_op = 'INSERT' or old.status <> 'granted') then
    delete from public.rota r
    where r.org_id = new.org_id and r.user_id = new.user_id and r.work_date between new.starts_on and new.ends_on;
  end if;
  return null;
end;
$$;
comment on function public.leave_clears_rota() is 'Trigger: leave being granted takes the person off the rota on its days.';

create trigger leave_clears_rota
  after insert or update of status on public.leave_requests
  for each row execute function public.leave_clears_rota();

-- ---------------------------------------------------------------------------
-- A rota that repeats (M60)
-- ---------------------------------------------------------------------------

create table public.rota_patterns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  shift_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  starts_on date,
  filled_until date,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, user_id, shift_id, weekday),
  foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade,
  foreign key (org_id, shift_id) references public.shifts (org_id, id) on delete cascade,
  -- rota_patterns_check fills it in.
  constraint rota_patterns_dated check (starts_on is not null)
);

comment on table public.rota_patterns is
  'A person''s usual week (M60): one shift on one weekday, which fill_rota() puts on the rota four weeks ahead, week after week, until the pattern is taken away. A week can still be changed by hand: a day taken off is not put back, because each pattern remembers how far it has filled. Owners and managers plan it; everyone reads it.';
comment on column public.rota_patterns.weekday is 'The day of the week: 1 is Monday, 7 is Sunday.';
comment on column public.rota_patterns.starts_on is 'The first day it fills, kennel date: the day it was made. Set by the database.';
comment on column public.rota_patterns.filled_until is 'The last day fill_rota() has put it on the rota, kennel date. Empty: not filled yet.';

alter table public.rota
  add constraint rota_pattern_fkey foreign key (org_id, pattern_id) references public.rota_patterns (org_id, id) on delete set null (pattern_id);

create trigger rota_patterns_stamp_actor
  before insert or update on public.rota_patterns
  for each row execute function public.stamp_actor('created_by');

-- A pattern starts today and changes only by being made again. Runs as the caller.
create function public.rota_patterns_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.starts_on := public.org_today(new.org_id);
    new.filled_until := null;
  elsif (new.user_id, new.shift_id, new.weekday, new.starts_on) is distinct from (old.user_id, old.shift_id, old.weekday, old.starts_on) then
    raise exception 'WB275: a pattern is not changed. Take it away and add the new one.' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.rota_patterns_check() is
  'Trigger: a pattern starts on the day it is made, filled from then on; its person, shift and weekday never change (WB275): take it away and add another.';

create trigger rota_patterns_check
  before insert or update on public.rota_patterns
  for each row execute function public.rota_patterns_check();

-- Taking a pattern away takes its days still to come off the rota; the days
-- worked stay. Runs as the caller, an owner or manager.
create function public.rota_patterns_clear()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.rota r
  where r.org_id = old.org_id and r.pattern_id = old.id and r.work_date > public.org_today(old.org_id);
  return old;
end;
$$;
comment on function public.rota_patterns_clear() is 'Trigger: a pattern taken away takes its rota days after today with it.';

create trigger rota_patterns_clear
  before delete on public.rota_patterns
  for each row execute function public.rota_patterns_clear();

-- Put every pattern on the rota up to a day (four weeks from today unless
-- said): each from the day after it last filled, on its weekday, skipping a
-- day of the person's granted leave and a day they are already on a shift at
-- that time. A day filled once is never filled again, so a day taken off by
-- hand stays off. Runs as the caller (an owner or manager), and as the
-- nightly job. Returns how many rota days it made.
create function public.fill_rota(p_org uuid, p_until date default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_today date := public.org_today(p_org);
  v_until date := coalesce(p_until, public.org_today(p_org) + 27);
  v_pattern record;
  v_count integer;
  v_made integer := 0;
begin
  if v_until > v_today + 62 then
    v_until := v_today + 62;
  end if;
  for v_pattern in
    select p.*, s.starts_at as shift_start, s.ends_at as shift_end
    from public.rota_patterns p
    join public.shifts s on s.org_id = p.org_id and s.id = p.shift_id and s.is_active
    join public.memberships m on m.org_id = p.org_id and m.user_id = p.user_id and m.is_active and m.role <> 'rider'
    where p.org_id = p_org and coalesce(p.filled_until, p.starts_on - 1) < v_until
    order by p.created_at, p.id
    for update of p
  loop
    insert into public.rota (org_id, shift_id, user_id, work_date, pattern_id)
    select p_org, v_pattern.shift_id, v_pattern.user_id, d::date, v_pattern.id
    from generate_series(greatest(coalesce(v_pattern.filled_until + 1, v_pattern.starts_on), v_today), v_until, interval '1 day') d
    where extract(isodow from d)::smallint = v_pattern.weekday
      and not exists (
        select 1 from public.leave_requests l
        where l.org_id = p_org and l.user_id = v_pattern.user_id and l.status = 'granted' and d::date between l.starts_on and l.ends_on)
      and not exists (
        select 1 from public.rota r
        where r.org_id = p_org and r.user_id = v_pattern.user_id
          and tsrange(r.starts_at, r.ends_at) && tsrange(
            d::date + v_pattern.shift_start,
            d::date + v_pattern.shift_end + case when v_pattern.shift_end <= v_pattern.shift_start then interval '1 day' else interval '0 days' end));
    get diagnostics v_count = row_count;
    v_made := v_made + v_count;
    update public.rota_patterns p set filled_until = v_until where p.id = v_pattern.id;
  end loop;
  return v_made;
end;
$$;
comment on function public.fill_rota(uuid, date) is
  'Puts each weekly pattern (M60) on the rota up to p_until (four weeks from today unless given, at most 62 days): every matching weekday after the last day it filled, skipping granted leave and days the person is already on a shift at that time. A day is filled once, so one taken off by hand stays off. Runs as the caller, an owner or manager, and overnight. Returns how many rota days it made.';

-- ---------------------------------------------------------------------------
-- Attendance: clocking in and out
-- ---------------------------------------------------------------------------

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  work_date date,
  clocked_in_at timestamptz not null default now(),
  clocked_out_at timestamptz,
  note text check (note is null or char_length(btrim(note)) between 1 and 300),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  -- Attendance is kept for pay: a person with some is suspended, not removed.
  constraint attendance_keeps_member foreign key (org_id, user_id) references public.memberships (org_id, user_id),
  -- attendance_check fills it in.
  constraint attendance_dated check (work_date is not null),
  constraint attendance_out_after_in check (clocked_out_at is null or clocked_out_at > clocked_in_at),
  constraint attendance_one_at_a_time
    exclude using gist (org_id with =, user_id with =, tstzrange(clocked_in_at, clocked_out_at) with &&)
);

comment on table public.attendance is
  'One stretch of work (M43): clocked in, then out. A person clocks themselves in and out and the database stamps the time; only an owner or manager writes a time by hand, with a note (WB226, WB227). Never two at once for a person (attendance_one_at_a_time), so one open at most. A person sees their own; owners and managers everyone''s.';
comment on column public.attendance.work_date is 'The kennel date the stretch began, which is the day it counts on (a night shift counts on the evening it began). Set by the database.';
comment on column public.attendance.clocked_out_at is 'Empty while the person is still on.';
comment on column public.attendance.note is 'Why a time was written by hand: needed whenever an owner or manager puts in or changes a time.';

create index attendance_org_date_idx on public.attendance (org_id, work_date);
create index attendance_open_idx on public.attendance (org_id) where clocked_out_at is null;

create trigger attendance_set_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

create trigger attendance_stamp_actor
  before insert or update on public.attendance
  for each row execute function public.stamp_actor('created_by');

-- Clocking in and out is stamped by the database; a time by hand is for an
-- owner or manager, with a note. Runs as the caller.
create function public.attendance_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_manager boolean := new.org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]));
  v_self boolean := new.user_id = (select auth.uid());
  v_member public.memberships;
  v_zone text;
begin
  if tg_op = 'INSERT' then
    select * into v_member from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id;
    if v_member.user_id is null or not v_member.is_active or v_member.role = 'rider' then
      raise exception 'WB221: only owners, managers and staff working here now are on the rota and clock in' using errcode = '23514';
    end if;
    if v_self and new.note is null then
      -- Clocking in: now, and still on.
      new.clocked_in_at := now();
      new.clocked_out_at := null;
    elsif not v_manager then
      raise exception 'WB226: only an owner or manager writes a clock time by hand' using errcode = '42501';
    elsif new.note is null then
      raise exception 'WB227: say why when writing a clock time by hand' using errcode = '23514';
    end if;
  else
    if new.user_id is distinct from old.user_id then
      raise exception 'WB226: only an owner or manager writes a clock time by hand' using errcode = '42501';
    end if;
    if v_self and old.clocked_out_at is null and new.clocked_out_at is not null
       and new.clocked_in_at = old.clocked_in_at and new.note is not distinct from old.note then
      -- Clocking out: now.
      new.clocked_out_at := now();
    elsif not v_manager then
      raise exception 'WB226: only an owner or manager writes a clock time by hand' using errcode = '42501';
    elsif new.note is null then
      raise exception 'WB227: say why when writing a clock time by hand' using errcode = '23514';
    end if;
  end if;
  if new.clocked_in_at > now() or new.clocked_out_at > now() then
    raise exception 'WB228: a clock time cannot be later than now' using errcode = '22023';
  end if;
  select o.time_zone into v_zone from public.organizations o where o.id = new.org_id;
  new.work_date := (new.clocked_in_at at time zone v_zone)::date;
  return new;
end;
$$;
comment on function public.attendance_check() is
  'Trigger: a person clocking themselves in or out gets the database''s time; anything else (a time for someone else, a time changed) is for an owner or manager (WB226) with a note (WB227), never later than now (WB228). Only people working here now, not riders, clock in (WB221). Sets the day it counts on.';

create trigger attendance_check
  before insert or update on public.attendance
  for each row execute function public.attendance_check();

-- Who is on now, for everyone at the kennel.
create function public.who_is_on(p_org uuid)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  -- SECURITY DEFINER: a person reads only their own attendance (M43), but
  -- everyone working at the kennel may know who else is on now. This gives
  -- names only, of the caller's own kennel (checked here), while clocked in.
  select m.user_id, m.display_name
  from public.attendance a
  join public.memberships m on m.org_id = a.org_id and m.user_id = a.user_id
  where p_org in (select public.my_org_ids())
    and a.org_id = p_org
    and a.clocked_out_at is null
    and m.is_active
  order by a.clocked_in_at;
$$;
comment on function public.who_is_on(uuid) is
  'The names of the people clocked in now at a kennel the caller works at (M43): names only, no times. SECURITY DEFINER because a person reads only their own attendance.';

-- ---------------------------------------------------------------------------
-- Clock-outs forgotten (M60)
-- ---------------------------------------------------------------------------

-- Each stretch still open well after the shift it began in ended: the shift
-- is the person's rota row whose hours it began in (or up to two hours
-- before). Read with the caller's own rights: an owner or manager sees
-- everyone's, a person their own.
create function public.forgotten_clock_outs(p_org uuid, p_grace_minutes integer default 120)
returns table (attendance_id uuid, user_id uuid, display_name text, clocked_in_at timestamptz, shift_name text, shift_ended_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select a.id, a.user_id, m.display_name, a.clocked_in_at, s.name, r.ends_at at time zone o.time_zone
  from public.attendance a
  join public.organizations o on o.id = a.org_id
  join public.memberships m on m.org_id = a.org_id and m.user_id = a.user_id
  join lateral (
    select r2.* from public.rota r2
    where r2.org_id = a.org_id and r2.user_id = a.user_id
      and (a.clocked_in_at at time zone o.time_zone) >= r2.starts_at - interval '2 hours'
      and (a.clocked_in_at at time zone o.time_zone) < r2.ends_at
    order by r2.starts_at
    limit 1
  ) r on true
  join public.shifts s on s.org_id = r.org_id and s.id = r.shift_id
  where a.org_id = p_org
    and a.clocked_out_at is null
    and now() > (r.ends_at at time zone o.time_zone) + make_interval(mins => greatest(p_grace_minutes, 0))
  order by a.clocked_in_at;
$$;
comment on function public.forgotten_clock_outs(uuid, integer) is
  'Stretches of attendance still open more than p_grace_minutes (two hours) after the end of the shift they began in (M60), with the shift''s end as an instant: for Today, where an owner or manager closes one at the end of the shift with a note. Runs with the caller''s rights.';
