-- =============================================================================
-- Wagbook 0007: audit log
-- Who changed what, and when, on the tables where it matters most: bookings,
-- money, the rate card, the organisation's settings and its people. Written by triggers, so no code path can skip it.
-- =============================================================================

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  at timestamptz not null default now(),
  actor uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  row_id uuid,
  old_data jsonb,
  new_data jsonb
);

comment on table public.audit_log is
  'Append-only history of changes to bookings, booking items, invoices, payments, expenses, services, incidents, organisation settings and memberships. Readable by owners and managers; writable by nobody.';
comment on column public.audit_log.actor is 'The signed-in user who made the change. Empty for changes made by the system.';
comment on column public.audit_log.old_data is 'For updates: only the columns that changed, with their previous values. For deletes: the whole row.';
comment on column public.audit_log.new_data is 'For updates: only the columns that changed, with their new values. For inserts: the whole row.';

create index audit_log_org_at_idx on public.audit_log (org_id, at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

create function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row uuid := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);
  -- An organisation's own row has no org_id; it is its own organisation.
  v_org uuid := coalesce((v_new ->> 'org_id')::uuid, (v_old ->> 'org_id')::uuid,
                         case when tg_table_name = 'organizations' then v_row end);
  v_changed_old jsonb;
  v_changed_new jsonb;
begin
  -- Nothing to record against when the organisation itself is being deleted.
  if not exists (select 1 from public.organizations o where o.id = v_org) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, o.value), jsonb_object_agg(n.key, n.value)
      into v_changed_old, v_changed_new
    from jsonb_each(v_new) n
    join jsonb_each(v_old) o on o.key = n.key
    where n.value is distinct from o.value and n.key <> 'updated_at';

    if v_changed_new is null then
      return null;
    end if;
    v_old := v_changed_old;
    v_new := v_changed_new;
  end if;

  -- Secret link tokens have no place in a log that managers can read.
  insert into public.audit_log (org_id, actor, action, table_name, row_id, old_data, new_data)
  values (
    v_org,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    v_row,
    v_old - 'public_token',
    v_new - 'public_token'
  );
  return null;
end;
$$;
comment on function public.audit_row() is 'Trigger: appends one audit_log row per insert, update or delete, storing only what changed.';

create trigger bookings_audit after insert or update or delete on public.bookings
  for each row execute function public.audit_row();
create trigger booking_items_audit after insert or update or delete on public.booking_items
  for each row execute function public.audit_row();
create trigger invoices_audit after insert or update or delete on public.invoices
  for each row execute function public.audit_row();
create trigger credit_notes_audit after insert or update or delete on public.credit_notes
  for each row execute function public.audit_row();
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function public.audit_row();
create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function public.audit_row();
create trigger services_audit after insert or update or delete on public.services
  for each row execute function public.audit_row();
create trigger appointments_audit after insert or update or delete on public.appointments
  for each row execute function public.audit_row();
create trigger appointment_services_audit after insert or update or delete on public.appointment_services
  for each row execute function public.audit_row();
create trigger courses_audit after insert or update or delete on public.courses
  for each row execute function public.audit_row();
create trigger trips_audit after insert or update or delete on public.trips
  for each row execute function public.audit_row();
create trigger health_overrides_audit after insert or update or delete on public.health_overrides
  for each row execute function public.audit_row();
create trigger credits_audit after insert or update or delete on public.credits
  for each row execute function public.audit_row();
create trigger incidents_audit after insert or update or delete on public.incidents
  for each row execute function public.audit_row();
create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function public.audit_row();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function public.audit_row();
-- The team (M43): leave answered, and clock times written by hand.
create trigger leave_requests_audit after insert or update or delete on public.leave_requests
  for each row execute function public.audit_row();
create trigger attendance_audit after insert or update or delete on public.attendance
  for each row execute function public.audit_row();
