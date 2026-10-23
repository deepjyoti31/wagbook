-- =============================================================================
-- Wagbook 00065: alerts on staff phones (Phase 7, M61, D53)
--
--   Alerts         something staff should know now: a booking request, an
--                  intake form, a food order or an appointment request from a
--                  parent, an incident written down, a bill still unpaid at
--                  check-out. Written by triggers here, never by the API. An
--                  alert holds the pet's name and where to look, never a
--                  parent's phone number or address.
--   Choices        which alerts each person wants, under More.
--   Subscriptions  each phone a person allowed alerts on: the browser's push
--                  address, nothing more.
--   Outbox         one row for each alert and phone it should wake. The app
--                  takes the waiting rows with the installation's secret
--                  (take_pushes) and sends each phone an empty push; the
--                  phone then asks Wagbook, signed in, what happened, so the
--                  words never pass through the push service.
--
-- Row level security for these tables is in 0008 with the rest of the access
-- model, as for every table until the migration freeze.
-- =============================================================================

create type public.alert_kind as enum ('booking_request', 'intake_form', 'food_order', 'appointment_request', 'incident', 'unpaid_checkout');
comment on type public.alert_kind is
  'What an alert is about: booking_request (a stay asked for from a parent''s link), intake_form (a new intake form), food_order (an order or a change from a parent), appointment_request (an appointment asked for from a parent''s link), incident (an incident written down), unpaid_checkout (a pet went home with its bill unpaid or not made).';

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind public.alert_kind not null,
  pet_name text check (pet_name is null or char_length(pet_name) <= 80),
  link text not null check (link ~ '^/app(/[a-z0-9/-]*)?(\?[a-z0-9=&-]*)?$'),
  created_at timestamptz not null default now(),
  unique (org_id, id)
);

comment on table public.alerts is
  'Something staff should know now (M61), for the phones of the people who chose that kind. Written only by the triggers in 00065; read by members of the kennel; removed after 30 days by the overnight job. Holds a pet''s name and a page, never a parent''s contact.';
comment on column public.alerts.pet_name is 'The pet it is about, when there is one, as its name was then.';
comment on column public.alerts.link is 'The page in Wagbook to open, such as /app/bookings/{id}.';

create index alerts_org_created_idx on public.alerts (org_id, created_at desc);

create table public.alert_choices (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  kind public.alert_kind not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id, kind),
  foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade
);

comment on table public.alert_choices is 'The alerts a person wants on their phones (M61), one row for each kind. Each person chooses their own, under More.';

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  endpoint text not null check (endpoint ~ '^https://[^\s]+$' and char_length(endpoint) <= 1000),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, endpoint),
  foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade
);

comment on table public.push_subscriptions is
  'A phone (a browser) a person allowed alerts on (M61): its push address from the browser''s push service. Pushes carry nothing, so no keys for encrypting them are kept. A person sees and removes only their own.';
comment on column public.push_subscriptions.endpoint is 'The browser''s push address. Only the app''s own key (VAPID) can send to it.';

create table public.push_outbox (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  alert_id uuid not null,
  subscription_id uuid not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (org_id, alert_id) references public.alerts (org_id, id) on delete cascade,
  foreign key (org_id, subscription_id) references public.push_subscriptions (org_id, id) on delete cascade
);

comment on table public.push_outbox is
  'One phone to wake for one alert (M61). Sealed: no policy, so no member reads or writes it; filled by alerts_fan_out() and emptied by take_pushes(), which the app calls with the installation''s secret.';
comment on column public.push_outbox.sent_at is 'When take_pushes() handed it to the app to send. Empty: still to send.';

create index push_outbox_waiting_idx on public.push_outbox (created_at) where sent_at is null;

create table public.push_secret (
  id boolean primary key default true check (id),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  set_at timestamptz not null default now()
);

comment on table public.push_secret is
  'The SHA-256 of the installation''s push secret (M61), the PUSH_SECRET the app is given. One row at most. Sealed: no policy; set only with set_push_secret() from the SQL editor.';

-- The installation's push secret: run once from the SQL editor, with the
-- same value as the app's PUSH_SECRET (docs/10-setup-and-deploy.md). Not
-- granted to the app.
create function public.set_push_secret(p_secret text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_secret is null or char_length(p_secret) < 32 then
    raise exception 'WB276: the push secret is at least 32 characters' using errcode = '22023';
  end if;
  insert into public.push_secret (id, secret_hash) values (true, encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'))
  on conflict (id) do update set secret_hash = excluded.secret_hash, set_at = now();
end;
$$;
comment on function public.set_push_secret(text) is
  'Sets the installation''s push secret (M61) from the SQL editor, at least 32 characters (WB276). Only its SHA-256 is kept. Not granted to the app.';
revoke all on function public.set_push_secret(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writing alerts
-- ---------------------------------------------------------------------------

-- An alert, and a row in the outbox for each phone of each person working
-- here who chose that kind.
create function public.raise_alert(p_org uuid, p_kind public.alert_kind, p_pet_name text, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert uuid;
begin
  -- SECURITY DEFINER: called only by the triggers below, which run as
  -- whoever made the change (staff, or a parent through a public function).
  -- No one may write an alert or the outbox directly. Not granted to anyone.
  insert into public.alerts (org_id, kind, pet_name, link)
  values (p_org, p_kind, left(p_pet_name, 80), p_link)
  returning id into v_alert;
  insert into public.push_outbox (org_id, alert_id, subscription_id)
  select p_org, v_alert, ps.id
  from public.push_subscriptions ps
  join public.alert_choices ac on ac.org_id = ps.org_id and ac.user_id = ps.user_id and ac.kind = p_kind
  join public.memberships m on m.org_id = ps.org_id and m.user_id = ps.user_id and m.is_active
  where ps.org_id = p_org;
end;
$$;
comment on function public.raise_alert(uuid, public.alert_kind, text, text) is
  'Writes an alert (M61) and an outbox row for each phone of each active member who chose its kind. SECURITY DEFINER because alerts and the outbox are written by no one else; called only by the alert triggers, granted to no role.';
revoke all on function public.raise_alert(uuid, public.alert_kind, text, text) from public, anon, authenticated;

create function public.alert_on_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pet text;
begin
  -- SECURITY DEFINER: reads the pet's name and the bill whoever made the
  -- change is, and calls raise_alert(). Changes nothing here.
  select p.name into v_pet from public.pets p where p.org_id = new.org_id and p.id = new.pet_id;
  if tg_op = 'INSERT' then
    if new.source = 'parent' and new.status = 'requested' then
      perform public.raise_alert(new.org_id, 'booking_request', v_pet, '/app/bookings/' || new.id::text);
    end if;
  elsif new.status = 'checked_out' and old.status <> 'checked_out'
        and new.pass_id is null and new.series_id is null
        and not exists (
          select 1 from public.invoice_balances ib
          where ib.org_id = new.org_id and ib.status = 'issued' and ib.due_minor <= 0
            and (ib.booking_id = new.id or (new.group_id is not null and ib.group_id = new.group_id))
        ) then
    perform public.raise_alert(new.org_id, 'unpaid_checkout', v_pet, '/app/bookings/' || new.id::text);
  end if;
  return null;
end;
$$;
comment on function public.alert_on_booking() is
  'Trigger (M61): a stay asked for from a parent''s link raises a booking_request alert; a stay checked out without a bill paid in full (none issued, or money still due; a day from a pack or a repeating series aside) raises unpaid_checkout.';

create trigger bookings_alert
  after insert or update of status on public.bookings
  for each row execute function public.alert_on_booking();

create function public.alert_on_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER: as alert_on_booking().
  if new.source = 'parent' then
    perform public.raise_alert(new.org_id, 'appointment_request',
      (select p.name from public.pets p where p.org_id = new.org_id and p.id = new.pet_id),
      '/app/appointments/' || new.id::text);
  end if;
  return null;
end;
$$;
comment on function public.alert_on_appointment() is 'Trigger (M61): an appointment asked for from a parent''s link raises an appointment_request alert.';

create trigger appointments_alert
  after insert on public.appointments
  for each row execute function public.alert_on_appointment();

create function public.alert_on_incident()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER: as alert_on_booking().
  perform public.raise_alert(new.org_id, 'incident',
    (select p.name from public.pets p where p.org_id = new.org_id and p.id = new.pet_id),
    '/app/dogs/' || new.pet_id::text);
  return null;
end;
$$;
comment on function public.alert_on_incident() is 'Trigger (M61): an incident written down raises an incident alert, opening the pet''s page.';

create trigger incidents_alert
  after insert on public.incidents
  for each row execute function public.alert_on_incident();

create function public.alert_on_intake()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER: as alert_on_booking(). The parent's name and phone
  -- stay on the form; the alert names no one.
  perform public.raise_alert(new.org_id, 'intake_form', null, '/app/more/intake');
  return null;
end;
$$;
comment on function public.alert_on_intake() is 'Trigger (M61): a new intake form raises an intake_form alert, naming no one.';

create trigger intake_submissions_alert
  after insert on public.intake_submissions
  for each row execute function public.alert_on_intake();

create function public.alert_on_food_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER: as alert_on_booking().
  perform public.raise_alert(new.org_id, 'food_order',
    coalesce(new.pet_name, (select p.name from public.subscriptions s join public.pets p on p.org_id = s.org_id and p.id = s.pet_id
                            where s.org_id = new.org_id and s.id = new.subscription_id)),
    '/app/food/orders');
  return null;
end;
$$;
comment on function public.alert_on_food_order() is 'Trigger (M61): a food order from the order page, or a change asked for from a parent''s link, raises a food_order alert.';

create trigger food_orders_alert
  after insert on public.food_orders
  for each row execute function public.alert_on_food_order();

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

-- The phones to wake now, for the app to send an empty push to each: every
-- phone with an alert waiting, once, marked as handed over. With p_gone, the
-- push addresses a push service said are gone are removed first. Needs the
-- installation's secret, so it is safe to grant to the anonymous role: the
-- app calls it right after a parent's request, with no one signed in.
create function public.take_pushes(p_secret text, p_gone text[] default null)
returns table (endpoint text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER: the outbox and other people's phones are sealed from
  -- everyone; only the holder of the installation's secret (the app server,
  -- PUSH_SECRET) gets the push addresses to wake, and nothing else.
  if p_secret is null or not exists (
    select 1 from public.push_secret s where s.secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  ) then
    raise exception 'WB277: alerts are not set up here' using errcode = '42501';
  end if;
  if p_gone is not null and cardinality(p_gone) > 0 then
    delete from public.push_subscriptions ps where ps.endpoint = any (p_gone[1:500]);
  end if;
  delete from public.push_outbox o where o.sent_at < now() - interval '1 day';
  return query
  with taken as (
    update public.push_outbox o set sent_at = now()
    where o.id in (
      select o2.id from public.push_outbox o2
      where o2.sent_at is null and o2.created_at > now() - interval '1 day'
      order by o2.id
      limit 1000
      for update skip locked
    )
    returning o.subscription_id
  )
  select distinct ps.endpoint
  from taken t
  join public.push_subscriptions ps on ps.id = t.subscription_id;
end;
$$;
comment on function public.take_pushes(text, text[]) is
  'PUBLIC, but useless without the installation''s push secret (WB277). Hands the app the push addresses of the phones with an alert waiting (M61), each once, marking the alerts as handed over; removes first the addresses in p_gone that a push service said are gone. Returns addresses only: the phone then asks Wagbook, signed in, what happened. SECURITY DEFINER because the outbox and other people''s phones are sealed.';

-- What a person's phone shows when it wakes: the alerts of the kinds they
-- chose, at the kennels they work at, after a moment. Read with their own
-- rights (alerts are readable by members; choices are their own).
create function public.my_alerts(p_after timestamptz default null)
returns table (id uuid, org_id uuid, kennel text, kind public.alert_kind, pet_name text, link text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select a.id, a.org_id, o.name, a.kind, a.pet_name, a.link, a.created_at
  from public.alerts a
  join public.organizations o on o.id = a.org_id
  join public.alert_choices ac on ac.org_id = a.org_id and ac.user_id = (select auth.uid()) and ac.kind = a.kind
  where a.org_id in (select public.my_org_ids())
    and a.created_at > greatest(coalesce(p_after, now() - interval '1 day'), now() - interval '1 day')
  order by a.created_at desc
  limit 5;
$$;
comment on function public.my_alerts(timestamptz) is
  'The newest alerts (five at most, from the last day, after p_after) of the kinds the signed-in person chose, at the kennels they work at (M61): what their phone shows when a push wakes it.';
