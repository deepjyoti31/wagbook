-- =============================================================================
-- Wagbook 0005: invoices, payments and expenses
--
-- How billing works (see docs/06-billing-and-gst.md):
--   1. The app builds a DRAFT invoice and its lines. All arithmetic is done by
--      src/lib/core/tax.ts and written here as plain numbers.
--   2. issue_invoice() checks the numbers add up, hands out the next
--      consecutive invoice number, freezes a copy of the seller's and buyer's
--      details, and marks the invoice ISSUED.
--   3. An issued invoice can never be edited. A mistake is fixed by voiding it
--      (void_invoice) and issuing a new one. The number is never reused.
-- =============================================================================

create type public.invoice_status as enum ('draft', 'issued', 'void');
create type public.payment_method as enum ('upi', 'cash', 'card', 'bank_transfer', 'other', 'credit');
comment on type public.invoice_status is
  'draft: being prepared, editable, has no number. issued: numbered and frozen. void: cancelled after issue; the number stays used.';
comment on type public.payment_method is 'How money moved. Wagbook records this; it does not process payments. credit: from the parent''s credit (in), or kept as credit instead of refunded (out); no money moved (M38).';

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  booking_id uuid,
  group_id uuid,
  series_id uuid,
  series_month date,
  subscription_id uuid,
  period_start date,
  period_end date,
  delivery_id uuid,
  appointment_id uuid,
  sale_id uuid,
  status public.invoice_status not null default 'draft',
  number text,
  fiscal_year text,
  seq integer,
  issued_on date,
  issued_by uuid references auth.users (id) on delete set null,
  is_tax_invoice boolean not null default false,
  prices_include_tax boolean not null default false,
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  seller jsonb,
  buyer jsonb,
  place_of_supply_state_code text check (place_of_supply_state_code is null or place_of_supply_state_code ~ '^[0-9]{2}$'),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  taxable_minor bigint not null default 0 check (taxable_minor >= 0),
  cgst_minor bigint not null default 0 check (cgst_minor >= 0),
  sgst_minor bigint not null default 0 check (sgst_minor >= 0),
  igst_minor bigint not null default 0 check (igst_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  round_off_minor bigint not null default 0 check (round_off_minor between -99 and 99),
  total_minor bigint not null default 0 check (total_minor >= 0),
  notes text,
  public_token text not null unique default public.new_token(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, number),
  unique (org_id, fiscal_year, seq),
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete restrict,
  foreign key (org_id, booking_id) references public.bookings (org_id, id) on delete set null (booking_id),
  foreign key (org_id, appointment_id) references public.appointments (org_id, id) on delete restrict,
  -- A bill is for one stay, for a family booked together, for a month of a
  -- repeating series, for a week or month of a food subscription, for one
  -- food order, for a visitor's appointment, for a sale over the counter, or
  -- for none of them (a one-off bill). Never two.
  constraint invoices_one_stay_or_one_family check (num_nonnulls(booking_id, group_id, series_id, subscription_id, delivery_id, appointment_id, sale_id) <= 1),
  -- A subscription is billed for a period: a week or a month, ahead.
  constraint invoices_subscription_period check (
    (subscription_id is null) = (period_start is null)
    and (period_start is null) = (period_end is null)
    and (period_end is null or (period_end >= period_start and period_end - period_start <= 31))
  ),
  -- A series is billed a calendar month at a time, named by its first day.
  constraint invoices_series_month check (
    (series_id is null) = (series_month is null)
    and (series_month is null or extract(day from series_month) = 1)
  ),
  -- A draft carries no number, sequence, year, date or issuer; an issued or
  -- void invoice carries all of them. Only issue_invoice() crosses that line.
  constraint invoices_numbered_once_issued check (
    case when status = 'draft'
      then number is null and seq is null and fiscal_year is null and issued_on is null and issued_by is null
      else number is not null and seq is not null and fiscal_year is not null and issued_on is not null
    end
  ),
  constraint invoices_void_fields_only_when_void check (
    (status = 'void') = (voided_at is not null) and (status = 'void' or (voided_by is null and void_reason is null))
  ),
  constraint invoices_number_shape check (number is null or (char_length(number) <= 16 and number ~ '^[A-Za-z0-9/-]+$'))
);

comment on table public.invoices is
  'A bill. Editable while a draft; frozen for ever once issued. A tax invoice when the kennel charges tax, otherwise a plain bill.';
comment on column public.invoices.booking_id is 'The stay this bill is for, when it is for one pet''s stay that was booked on its own.';
comment on column public.invoices.group_id is
  'The family booking this bill is for: every pet booked together (bookings.group_id) is billed on it, each with its stay and extras. A pet of a family is never billed on its own.';
comment on column public.invoices.series_id is
  'The repeating day boarding series this bill is for (bookings.series_id): its days in series_month, each with its extras, on one bill. A day of a series is never billed on its own.';
comment on column public.invoices.series_month is 'With series_id: the first day of the calendar month whose days this bill covers.';
comment on column public.invoices.subscription_id is
  'The food subscription this bill is for (M29): its deliveries from period_start to period_end, billed ahead. A subscription''s delivery is never billed on its own.';
comment on column public.invoices.period_start is 'With subscription_id: the first day whose deliveries this bill covers.';
comment on column public.invoices.period_end is 'With subscription_id: the last day whose deliveries this bill covers (a week or a month after period_start).';
comment on column public.invoices.delivery_id is 'The one-off food order this bill is for: a trial, food by the kilo or a made-to-order item (M29).';
comment on column public.invoices.appointment_id is
  'The appointment of a visitor this bill is for (M34), with its add-ons. A boarder''s appointment is on its stay''s bill instead (WB200).';
comment on column public.invoices.sale_id is
  'The sale over the counter this bill is for (M62), to a parent or to the kennel''s walk-in buyer. A sale made on a stay is on the stay''s bill instead.';
comment on column public.invoices.number is 'Printed invoice number, e.g. WB/27-28/0001. Empty until issued. Consecutive within a financial year, never reused.';
comment on column public.invoices.fiscal_year is 'Financial year the number belongs to, e.g. 2027-28.';
comment on column public.invoices.seq is 'Position in the year''s sequence: the 0001 in WB/27-28/0001.';
comment on column public.invoices.issued_on is 'Invoice date: the kennel''s local date when it was issued.';
comment on column public.invoices.is_tax_invoice is 'True when issued by a tax-registered kennel, so it is titled Tax Invoice and shows the tax breakup.';
comment on column public.invoices.prices_include_tax is
  'Whether the kennel''s prices included tax when the bill was issued, so a credit note against it works its tax out the same way.';
comment on column public.invoices.seller is 'Copy of the kennel''s name, address, tax details and UPI ID as they were when issued. A later change to the kennel''s settings never alters an invoice that is already out.';
comment on column public.invoices.buyer is 'Copy of the parent''s name, phone and address as they were when issued.';
comment on column public.invoices.place_of_supply_state_code is 'GST state code where the service is supplied. For boarding, the kennel''s own state.';
comment on column public.invoices.subtotal_minor is 'Sum of quantity x unit price over all lines, before discount and tax.';
comment on column public.invoices.taxable_minor is 'Value that tax is charged on.';
comment on column public.invoices.tax_minor is 'Total tax. Equals cgst + sgst + igst under India GST.';
comment on column public.invoices.round_off_minor is 'Small adjustment (under one currency unit) that makes the total a whole number.';
comment on column public.invoices.total_minor is 'What the customer owes: taxable + tax + round off.';
comment on column public.invoices.public_token is 'Secret in the invoice link sent to the parent (/inv/{token}).';

create index invoices_org_issued_idx on public.invoices (org_id, issued_on desc);
-- One bill per stay at a time: a stay is billed again only after its bill is voided.
create unique index invoices_one_live_per_booking on public.invoices (org_id, booking_id)
  where booking_id is not null and status <> 'void';
comment on index public.invoices_one_live_per_booking is 'A booking has at most one draft or issued invoice, so a stay cannot be billed twice.';
-- And one bill per family at a time.
create unique index invoices_one_live_per_family on public.invoices (org_id, group_id)
  where group_id is not null and status <> 'void';
comment on index public.invoices_one_live_per_family is 'A family booking has at most one draft or issued invoice, so it cannot be billed twice.';
-- And one bill per month of a series.
create unique index invoices_one_live_per_series_month on public.invoices (org_id, series_id, series_month)
  where series_id is not null and status <> 'void';
comment on index public.invoices_one_live_per_series_month is 'A month of a repeating series has at most one draft or issued invoice, so its days cannot be billed twice.';
-- And one bill per visitor's appointment.
create unique index invoices_one_live_per_appointment on public.invoices (org_id, appointment_id)
  where appointment_id is not null and status <> 'void';
comment on index public.invoices_one_live_per_appointment is 'A visitor''s appointment has at most one draft or issued bill.';
create index invoices_org_client_idx on public.invoices (org_id, client_id);
create index invoices_org_booking_idx on public.invoices (org_id, booking_id);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger invoices_stamp_actor
  before insert or update on public.invoices
  for each row execute function public.stamp_actor('created_by');

-- A pet booked together with others is billed with them, on the family's
-- bill, never on its own: otherwise its stay could be billed twice. And a
-- family's bill belongs to that family's parent. The same for the days of a
-- repeating series, which are billed a month at a time.
create function public.invoices_check_stay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.booking_id is not null and (tg_op = 'INSERT' or new.booking_id is distinct from old.booking_id) and exists (
    select 1 from public.bookings b where b.org_id = new.org_id and b.id = new.booking_id and b.group_id is not null
  ) then
    raise exception 'WB053: this pet was booked together with others. Bill the family together.' using errcode = '23514';
  end if;
  if new.booking_id is not null and (tg_op = 'INSERT' or new.booking_id is distinct from old.booking_id) and exists (
    select 1 from public.bookings b where b.org_id = new.org_id and b.id = new.booking_id and b.series_id is not null
  ) then
    raise exception 'WB055: this day is part of a repeating booking. Bill the month''s days together.' using errcode = '23514';
  end if;
  if new.series_id is not null
     and (tg_op = 'INSERT' or new.series_id is distinct from old.series_id or new.client_id is distinct from old.client_id)
     and not exists (
       select 1 from public.bookings b where b.org_id = new.org_id and b.series_id = new.series_id and b.client_id = new.client_id
     )
     and coalesce(current_setting('wagbook.merging', true), '') <> 'on'
  then
    raise exception 'WB056: that repeating booking was not found for this parent' using errcode = '23514';
  end if;
  if new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id or new.client_id is distinct from old.client_id)
     and not exists (
       select 1 from public.bookings b where b.org_id = new.org_id and b.group_id = new.group_id and b.client_id = new.client_id
     )
     -- Merging parents moves the bills and the bookings one after the other.
     and coalesce(current_setting('wagbook.merging', true), '') <> 'on'
  then
    raise exception 'WB054: that family booking was not found for this parent' using errcode = '23514';
  end if;
  -- Only a visitor's appointment has a bill of its own: a boarder's is on its
  -- stay's bill, and a course or package session is paid for already.
  if new.appointment_id is not null
     and (tg_op = 'INSERT' or new.appointment_id is distinct from old.appointment_id or new.client_id is distinct from old.client_id)
     and not exists (
       select 1 from public.appointments a
       where a.org_id = new.org_id and a.id = new.appointment_id and a.client_id = new.client_id
         and a.booking_id is null and a.course_id is null and not a.in_package
     )
     and coalesce(current_setting('wagbook.merging', true), '') <> 'on'
  then
    raise exception 'WB200: a boarder''s appointment goes on its stay''s bill, and a course''s sessions on the course''s' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.invoices_check_stay() is
  'Trigger: a pet booked with others is billed only on the family''s bill (WB053), and a family''s bill names a family booking of that parent (WB054). A day of a repeating series is billed only on its month''s bill (WB055), which names a series of that parent (WB056). A bill of its own is only for a visitor''s appointment of that parent (WB200).';

create trigger invoices_check_stay
  before insert or update of booking_id, group_id, series_id, client_id, appointment_id on public.invoices
  for each row execute function public.invoices_check_stay();

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null,
  sort_order integer not null default 0,
  description text not null check (char_length(description) between 1 and 300),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  taxable_minor bigint not null check (taxable_minor >= 0),
  tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),
  cgst_minor bigint not null default 0 check (cgst_minor >= 0),
  sgst_minor bigint not null default 0 check (sgst_minor >= 0),
  igst_minor bigint not null default 0 check (igst_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  created_at timestamptz not null default now(),
  foreign key (org_id, invoice_id) references public.invoices (org_id, id) on delete cascade,
  constraint invoice_lines_total_adds_up check (total_minor = taxable_minor + tax_minor)
);

comment on table public.invoice_lines is 'One line of an invoice. Numbers are computed by src/lib/core/tax.ts and stored, not recomputed.';

create index invoice_lines_org_invoice_idx on public.invoice_lines (org_id, invoice_id, sort_order);

create table public.invoice_counters (
  org_id uuid not null references public.organizations (id) on delete cascade,
  series text not null default 'invoice' check (series in ('invoice', 'credit_note')),
  fiscal_year text not null,
  last_seq integer not null default 0 check (last_seq >= 0),
  primary key (org_id, series, fiscal_year)
);

comment on table public.invoice_counters is
  'The last sequence number used per organisation, series (bills, credit notes) and financial year. Only issue_invoice and issue_credit_note touch it; nobody can read or write it directly.';
comment on column public.invoice_counters.series is 'invoice: bills (PREFIX/YY-YY/NNNN). credit_note: credit notes (CN/YY-YY/NNNN).';

-- ---------------------------------------------------------------------------
-- Issued invoices are frozen
-- ---------------------------------------------------------------------------

create function public.invoices_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Columns that may move after issue: the void fields (through
  -- void_invoice only) and the link to a booking that is being deleted.
  v_ignore text[] := array['status', 'voided_at', 'voided_by', 'void_reason', 'updated_at', 'booking_id'];
begin
  -- Merging two parents (merge_clients) moves issued bills to the parent who
  -- stays. The buyer printed on the bill is frozen and does not change.
  if coalesce(current_setting('wagbook.merging', true), '') = 'on' then
    v_ignore := array_append(v_ignore, 'client_id');
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and exists (select 1 from public.organizations o where o.id = old.org_id) then
      raise exception 'WB030: an issued invoice cannot be deleted. Void it instead.' using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status in ('issued', 'void') then
    if (to_jsonb(new) - v_ignore) <> (to_jsonb(old) - v_ignore)
       or (new.booking_id is not null and new.booking_id is distinct from old.booking_id) then
      if old.status = 'void' then
        raise exception 'WB031: a void invoice cannot be changed' using errcode = '23514';
      end if;
      raise exception 'WB032: an issued invoice cannot be edited. Void it and issue a new one.' using errcode = '23514';
    end if;

    if new.status = old.status then
      -- Nothing but the booking link (cleared when a booking is deleted) may change.
      if new.voided_at is distinct from old.voided_at or new.voided_by is distinct from old.voided_by
         or new.void_reason is distinct from old.void_reason then
        raise exception 'WB031: a void invoice cannot be changed' using errcode = '23514';
      end if;
      return new;
    end if;

    if old.status = 'issued' and new.status = 'void'
       and coalesce(current_setting('wagbook.voiding', true), '') = 'on' then
      return new;
    end if;
    if old.status = 'void' then
      raise exception 'WB031: a void invoice cannot be changed' using errcode = '23514';
    end if;
    raise exception 'WB038: use void_invoice() to void an invoice' using errcode = '23514';
  end if;

  -- Draft: free to edit, but it only becomes issued through issue_invoice().
  if new.status = 'void' then
    raise exception 'WB033: a draft cannot be voided. Delete it instead.' using errcode = '23514';
  end if;
  if new.status = 'issued' and coalesce(current_setting('wagbook.issuing', true), '') <> 'on' then
    raise exception 'WB034: use issue_invoice() to issue an invoice' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.invoices_guard() is
  'Trigger: makes issued and void invoices immutable, and forces issuing and voiding through issue_invoice() and void_invoice().';

create trigger invoices_guard
  before update or delete on public.invoices
  for each row execute function public.invoices_guard();

create function public.invoices_guard_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'draft' then
    raise exception 'WB034: an invoice starts as a draft. Use issue_invoice() to issue it.' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.invoices_guard_insert() is 'Trigger: every invoice starts as a draft.';

create trigger invoices_guard_insert
  before insert on public.invoices
  for each row execute function public.invoices_guard_insert();

create function public.invoice_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.invoice_status;
begin
  -- Lock the invoice row while reading its status. issue_invoice() holds a
  -- stronger lock while it adds up the lines, so a line change made at the
  -- same moment waits here and then sees the invoice as issued.
  select i.status into v_status
  from public.invoices i
  where i.id = case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end
  for share;

  -- v_status is null when the invoice itself is being deleted (cascade).
  if v_status is not null and v_status <> 'draft' then
    raise exception 'WB032: lines of an issued invoice cannot be changed' using errcode = '23514';
  end if;
  -- Moving a line from a draft onto another invoice is also a change to that one.
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    raise exception 'WB032: a line cannot be moved to another invoice' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
comment on function public.invoice_lines_guard() is 'Trigger: invoice lines can only change while the invoice is a draft.';

create trigger invoice_lines_guard
  before insert or update or delete on public.invoice_lines
  for each row execute function public.invoice_lines_guard();

-- A day of a series that is on its month's issued bill stays in that month:
-- moved into another month it would be billed again on that month's bill.
create function public.bookings_keep_billed_month()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.series_id is not null
     and date_trunc('month', new.start_date) <> date_trunc('month', old.start_date)
     and exists (
       select 1 from public.invoices i
       where i.org_id = old.org_id and i.series_id = old.series_id
         and i.series_month = date_trunc('month', old.start_date)::date and i.status = 'issued'
     )
  then
    raise exception 'WB057: this day is on its month''s bill. Cancel it and book the new day instead.' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.bookings_keep_billed_month() is
  'Trigger: a day of a repeating series whose month has an issued bill cannot move into another month (WB057), where it would be billed a second time.';

create trigger bookings_keep_billed_month
  before update of start_date on public.bookings
  for each row execute function public.bookings_keep_billed_month();

-- ---------------------------------------------------------------------------
-- Issuing and voiding
-- ---------------------------------------------------------------------------

-- The stays a bill covers: its one booking, or every pet of its family that
-- is staying, stayed or did not come (not requests, not cancellations), or
-- the days of a repeating series in one month that are the same.
create function public.invoice_bookings(p_org uuid, p_booking uuid, p_group uuid, p_series uuid default null, p_month date default null)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select b.id
  from public.bookings b
  where b.org_id = p_org
    and (b.id = p_booking
         or (p_group is not null and b.group_id = p_group and b.status in ('confirmed', 'checked_in', 'checked_out', 'no_show'))
         or (p_series is not null and b.series_id = p_series
             and b.start_date >= p_month and b.start_date < (p_month + interval '1 month')::date
             and b.status in ('confirmed', 'checked_in', 'checked_out', 'no_show')))
  order by b.start_date, b.created_at, b.id;
$$;
comment on function public.invoice_bookings(uuid, uuid, uuid, uuid, date) is
  'The bookings a bill covers, in date order: its own booking; or the family''s bookings that are not requests or cancelled; or the days of a series in the month starting p_month that are not requests or cancelled. Must match BILLABLE_IN_FAMILY in src/lib/billing.ts.';

-- What a stay costs, as the lines of a bill. Usually one: every night (or
-- day) at the booked rate. Two more cases split it:
--   * a stay that began as day boarding and became boarding (boarding_from):
--     the days before the first night at the day price, then the nights;
--   * a pet booked at the shared kennel price (alone_rate_minor set): the
--     nights it shared its kennel with a pet of the same parent at that price,
--     and the nights it had the kennel to itself at the usual price. A sibling
--     that went home early shares only up to the day it was checked out.
-- The discount goes on the largest line (the first, if two are equal).
create function public.stay_charges(p_org uuid, p_bookings uuid[])
returns table (booking_id uuid, part text, quantity integer, unit_price_minor bigint, discount_minor bigint)
language sql
stable
set search_path = ''
as $$
  with b as (
    select bk.*, o.time_zone
    from public.bookings bk
    join public.organizations o on o.id = bk.org_id
    where bk.org_id = p_org and bk.id = any (p_bookings)
  ),
  -- The nights (boarding) or days (day boarding) at the stay's own rate.
  units as (
    select b.id, d::date as day
    from b, generate_series(
      coalesce(b.boarding_from, b.start_date)::timestamp,
      (case when b.kind = 'daycare' then b.end_date else b.end_date - 1 end)::timestamp,
      interval '1 day') d
  ),
  counted as (
    select
      b.id,
      count(u.day)::integer as total,
      (count(u.day) filter (where exists (
        select 1
        from public.bookings s
        where s.org_id = b.org_id
          and s.client_id = b.client_id
          and s.id <> b.id
          and s.kennel_id = b.kennel_id
          and s.status in ('confirmed', 'checked_in', 'checked_out')
          and public.stay_range(
                s.kind,
                s.start_date,
                case when s.status = 'checked_out' and s.checked_out_at is not null
                     then greatest(s.start_date, least(s.end_date, (s.checked_out_at at time zone b.time_zone)::date))
                     else s.end_date end
              ) @> u.day
      )))::integer as shared
    from b
    left join units u on u.id = b.id
    group by b.id
  ),
  parts as (
    -- A stay with a package is the package, one line (M37).
    select b.id, 0 as position, 'package'::text as part, 1 as quantity, b.package_price_minor as unit_price_minor
    from b
    where b.package_id is not null
    union all
    select b.id, 1, 'days'::text, (b.boarding_from - b.start_date), b.day_rate_minor
    from b
    where b.boarding_from is not null
    union all
    select b.id, 2, case when b.alone_rate_minor is null then 'stay' else 'shared' end,
           case when b.alone_rate_minor is null then c.total else c.shared end, b.rate_minor
    from b
    join counted c on c.id = b.id
    where b.package_id is null
    union all
    select b.id, 3, 'alone', c.total - c.shared, b.alone_rate_minor
    from b
    join counted c on c.id = b.id
    where b.alone_rate_minor is not null
  ),
  kept as (
    select p.*, row_number() over (partition by p.id order by p.quantity * p.unit_price_minor desc, p.position) as rank
    from parts p
    where p.quantity > 0
  )
  select k.id, k.part, k.quantity, k.unit_price_minor, case when k.rank = 1 then b.discount_minor else 0 end
  from kept k
  join b on b.id = k.id
  order by array_position(p_bookings, k.id), k.position;
$$;
comment on function public.stay_charges(uuid, uuid[]) is
  'What each stay costs, as bill lines: part (stay; or days, then the nights after a switch from day boarding; shared and alone for a pet at the shared kennel price; package, the whole stay as its package), quantity, price and discount. The one place a stay is priced: invoice_expected_lines() checks staff bills against it and the app builds bills from it (stayLines() in src/lib/core/stay.ts).';

-- In plpgsql so that it may read the sales over the counter (M62), whose
-- tables are made after this file.
create function public.invoice_expected_lines(
  p_org uuid, p_booking uuid, p_group uuid, p_tax_mode public.tax_mode, p_series uuid default null, p_month date default null,
  p_appointment uuid default null)
returns table (quantity numeric, unit_price_minor bigint, discount_minor bigint, tax_rate_bp integer)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query
  with stays as (
    select sc.quantity, sc.unit_price_minor, sc.discount_minor,
           case when p_tax_mode = 'none' then 0 else b.tax_rate_bp end as tax_rate_bp, b.sac_code
    from public.bookings b
    join public.stay_charges(p_org, array(select public.invoice_bookings(p_org, p_booking, p_group, p_series, p_month))) sc
      on sc.booking_id = b.id
    where b.org_id = p_org
  )
  select s.quantity::numeric(10, 2), s.unit_price_minor, s.discount_minor, s.tax_rate_bp
  from stays s
  where p_series is null
  union all
  -- A month of a series is one line for each price, not a line a day.
  select sum(s.quantity)::numeric(10, 2), s.unit_price_minor, sum(s.discount_minor)::bigint, s.tax_rate_bp
  from stays s
  where p_series is not null
  group by s.unit_price_minor, s.tax_rate_bp, s.sac_code
  union all
  select bi.quantity, bi.unit_price_minor, 0::bigint, case when p_tax_mode = 'none' then 0 else bi.tax_rate_bp end
  from public.booking_items bi
  where bi.org_id = p_org and not bi.in_package
    and bi.booking_id in (select public.invoice_bookings(p_org, p_booking, p_group, p_series, p_month))
  union all
  -- Appointments (M34): a boarder's on its stay's bill, a visitor's on its
  -- own; not requests or cancellations; a course or package session is free.
  -- A quote not priced yet comes with no price, so no bill matches it.
  select 1::numeric(10, 2), a.price_minor, 0::bigint, case when p_tax_mode = 'none' then 0 else a.tax_rate_bp end
  from public.appointments a
  where a.org_id = p_org and a.status in ('confirmed', 'done', 'no_show') and a.course_id is null and not a.in_package
    and (a.id = p_appointment or a.booking_id in (select public.invoice_bookings(p_org, p_booking, p_group, p_series, p_month)))
  union all
  select ai.quantity::numeric(10, 2), ai.unit_price_minor, 0::bigint, case when p_tax_mode = 'none' then 0 else ai.tax_rate_bp end
  from public.appointment_items ai
  join public.appointments a on a.org_id = ai.org_id and a.id = ai.appointment_id
  where ai.org_id = p_org and a.status in ('confirmed', 'done', 'no_show')
    and (a.id = p_appointment or a.booking_id in (select public.invoice_bookings(p_org, p_booking, p_group, p_series, p_month)))
  union all
  -- Pick-ups and drops (M39) that are not cancelled.
  select 1::numeric(10, 2), t.price_minor, 0::bigint, case when p_tax_mode = 'none' then 0 else t.tax_rate_bp end
  from public.trips t
  where t.org_id = p_org and t.status <> 'cancelled'
    and t.booking_id in (select public.invoice_bookings(p_org, p_booking, p_group, p_series, p_month))
  union all
  -- Things sold over the counter on the stay (M62), not cancelled.
  select sl.quantity::numeric(10, 2), sl.unit_price_minor, 0::bigint, case when p_tax_mode = 'none' then 0 else sl.tax_rate_bp end
  from public.sale_lines sl
  join public.sales sa on sa.org_id = sl.org_id and sa.id = sl.sale_id
  where sl.org_id = p_org and sa.status = 'sold'
    and sa.booking_id in (select public.invoice_bookings(p_org, p_booking, p_group, p_series, p_month));
end;
$$;
comment on function public.invoice_expected_lines(uuid, uuid, uuid, public.tax_mode, uuid, date, uuid) is
  'The lines a bill should have, as quantity, unit price, discount and tax rate: for each stay it covers (invoice_bookings), its stay lines (stay_charges()), each extra not in its package, and each appointment that is confirmed, done or a no-show (not a course or package session) with its add-ons, each pick-up and drop not cancelled, and each line of a sale over the counter on the stay that is not cancelled; or a visitor''s appointment (p_appointment) and its add-ons. A month of a series has one stay line for each price, tax rate and code, with its days added up (seriesLines() in src/lib/billing.ts). Must match stayBillLines() in src/lib/stay-bill.ts.';

-- One line of a bill or credit note, checked against the same rules as
-- src/lib/core/tax.ts. The app does the sums; the database refuses a document
-- whose sums are wrong (WB037). p_include: prices include tax.
create function public.check_bill_line(
  p_mode public.tax_mode, p_intra boolean, p_include boolean,
  p_quantity numeric, p_unit_price_minor bigint, p_discount_minor bigint, p_taxable_minor bigint, p_tax_rate_bp integer,
  p_cgst_minor bigint, p_sgst_minor bigint, p_igst_minor bigint, p_tax_minor bigint)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_gross bigint;
  v_net bigint;
begin
  v_gross := round(p_quantity * p_unit_price_minor);
  v_net := v_gross - p_discount_minor;
  if v_net < 0 then
    raise exception 'WB037: a discount is larger than its line' using errcode = '23514';
  end if;

  if p_mode = 'none' or p_tax_rate_bp = 0 then
    if p_tax_minor <> 0 or p_cgst_minor <> 0 or p_sgst_minor <> 0 or p_igst_minor <> 0
       or p_taxable_minor <> v_net then
      raise exception 'WB037: a line that carries no tax has tax or the wrong amount' using errcode = '23514';
    end if;
  else
    if p_include then
      -- Tax is inside the price: taxable + tax must equal what the customer pays,
      -- and taxable must be the price with the tax backed out (give or take the
      -- single unit that keeps CGST and SGST equal).
      if p_taxable_minor + p_tax_minor <> v_net
         or abs(p_taxable_minor - round(v_net * 10000.0 / (10000 + p_tax_rate_bp))) > 1 then
        raise exception 'WB037: a line''s tax does not match its price and rate' using errcode = '23514';
      end if;
    elsif p_taxable_minor <> v_net then
      raise exception 'WB037: a line''s taxable value does not match its price' using errcode = '23514';
    end if;

    if p_mode = 'gst_india' then
      if p_intra then
        if p_igst_minor <> 0 or p_cgst_minor <> p_sgst_minor
           or p_tax_minor <> p_cgst_minor + p_sgst_minor
           or (not p_include
               and p_cgst_minor <> round(p_taxable_minor * p_tax_rate_bp / 20000.0)) then
          raise exception 'WB037: a line''s CGST and SGST do not match its taxable value and rate' using errcode = '23514';
        end if;
      elsif p_cgst_minor <> 0 or p_sgst_minor <> 0 or p_tax_minor <> p_igst_minor
            or (not p_include
                and p_igst_minor <> round(p_taxable_minor * p_tax_rate_bp / 10000.0)) then
        raise exception 'WB037: a line''s IGST does not match its taxable value and rate' using errcode = '23514';
      end if;
    else
      if p_cgst_minor <> 0 or p_sgst_minor <> 0 or p_igst_minor <> 0
         or (not p_include
             and p_tax_minor <> round(p_taxable_minor * p_tax_rate_bp / 10000.0)) then
        raise exception 'WB037: a line''s tax does not match its taxable value and rate' using errcode = '23514';
      end if;
    end if;
  end if;
end;
$$;
comment on function public.check_bill_line(public.tax_mode, boolean, boolean, numeric, bigint, bigint, bigint, integer, bigint, bigint, bigint, bigint) is
  'Raises WB037 when a line''s taxable value and tax are not what its quantity, price, discount and rate give under the tax mode (within the state or across states, prices with or without tax). Used by issue_invoice and issue_credit_note.';

create function public.issue_invoice(p_invoice uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_org public.organizations;
  v_client public.clients;
  v_fy text;
  v_seq integer;
  v_number text;
  v_today date;
  v_sum record;
  v_line record;
  v_intra boolean;
  v_exact bigint;
  v_round_off bigint;
begin
  select * into v_inv from public.invoices i where i.id = p_invoice for update;
  if v_inv.id is null or v_inv.org_id not in (select public.my_org_ids()) then
    raise exception 'WB003: invoice not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'WB035: this invoice has already been issued' using errcode = '23514';
  end if;

  select * into v_org from public.organizations o where o.id = v_inv.org_id;
  select * into v_client from public.clients c where c.id = v_inv.client_id;
  v_intra := coalesce(v_inv.place_of_supply_state_code, v_org.gst_state_code) is not distinct from v_org.gst_state_code;

  -- Check every line's arithmetic against the same rules as
  -- src/lib/core/tax.ts. The app does the sums; the database refuses to put
  -- its number on an invoice whose sums are wrong.
  for v_line in select * from public.invoice_lines l where l.invoice_id = v_inv.id loop
    perform public.check_bill_line(v_org.tax_mode, v_intra, v_org.prices_include_tax, v_line.quantity, v_line.unit_price_minor,
      v_line.discount_minor, v_line.taxable_minor, v_line.tax_rate_bp, v_line.cgst_minor, v_line.sgst_minor, v_line.igst_minor,
      v_line.tax_minor);
  end loop;

  select
    count(*) as n,
    coalesce(sum(round(l.quantity * l.unit_price_minor)), 0)::bigint as subtotal,
    coalesce(sum(l.taxable_minor), 0)::bigint as taxable,
    coalesce(sum(l.cgst_minor), 0)::bigint as cgst,
    coalesce(sum(l.sgst_minor), 0)::bigint as sgst,
    coalesce(sum(l.igst_minor), 0)::bigint as igst,
    coalesce(sum(l.tax_minor), 0)::bigint as tax,
    coalesce(sum(l.discount_minor), 0)::bigint as discount
  into v_sum
  from public.invoice_lines l
  where l.invoice_id = v_inv.id;

  if v_sum.n = 0 then
    raise exception 'WB036: an invoice needs at least one line' using errcode = '23514';
  end if;

  v_exact := v_sum.taxable + v_sum.tax;
  if v_sum.taxable <> v_inv.taxable_minor
     or v_sum.cgst <> v_inv.cgst_minor
     or v_sum.sgst <> v_inv.sgst_minor
     or v_sum.igst <> v_inv.igst_minor
     or v_sum.tax <> v_inv.tax_minor
     or v_sum.discount <> v_inv.discount_minor
     or v_inv.total_minor <> v_exact + v_inv.round_off_minor
  then
    raise exception 'WB037: invoice totals do not match its lines' using errcode = '23514';
  end if;
  -- Round off is either exactly the rounding to a whole unit, or nothing.
  v_round_off := 0;
  if v_org.round_invoice_totals then
    v_round_off := round(v_exact / 100.0) * 100 - v_exact;
  end if;
  if v_inv.round_off_minor <> v_round_off then
    raise exception 'WB037: the round off is not what the kennel''s rounding setting gives' using errcode = '23514';
  end if;

  -- Staff issue a bill only as its booking prices it: the stay line at the
  -- booked rate, discount and tax, plus each extra at its own price, nothing
  -- more and nothing less. A bill that was edited is issued by an owner or
  -- manager. The same rule as bookings_guard_price() (docs/09-decisions.md, D15).
  if v_inv.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
     and (v_inv.subscription_id is not null or v_inv.delivery_id is not null) then
    -- Food: exactly what the deliveries come to (food_bill_lines, M29).
    if not exists (select 1 from public.food_bill_lines(v_inv.org_id, v_inv.subscription_id, v_inv.period_start, v_inv.period_end, v_inv.delivery_id))
       or exists (
         (select f.quantity, f.unit_price_minor, f.discount_minor, f.tax_rate_bp
          from public.food_bill_lines(v_inv.org_id, v_inv.subscription_id, v_inv.period_start, v_inv.period_end, v_inv.delivery_id) f)
         except all
         (select l.quantity, l.unit_price_minor, l.discount_minor, l.tax_rate_bp from public.invoice_lines l where l.invoice_id = v_inv.id)
       )
       or exists (
         (select l.quantity, l.unit_price_minor, l.discount_minor, l.tax_rate_bp from public.invoice_lines l where l.invoice_id = v_inv.id)
         except all
         (select f.quantity, f.unit_price_minor, f.discount_minor, f.tax_rate_bp
          from public.food_bill_lines(v_inv.org_id, v_inv.subscription_id, v_inv.period_start, v_inv.period_end, v_inv.delivery_id) f)
       )
    then
      raise exception 'WB050: only an owner or manager can issue a bill that differs from its booking' using errcode = '42501';
    end if;
  elsif v_inv.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
        and v_inv.sale_id is not null then
    -- A sale over the counter: exactly its lines, at the prices it was sold at (M62).
    if not exists (select 1 from public.sale_bill_lines(v_inv.org_id, v_inv.sale_id, v_org.tax_mode))
       or exists (
         (select * from public.sale_bill_lines(v_inv.org_id, v_inv.sale_id, v_org.tax_mode))
         except all
         (select l.quantity, l.unit_price_minor, l.discount_minor, l.tax_rate_bp from public.invoice_lines l where l.invoice_id = v_inv.id)
       )
       or exists (
         (select l.quantity, l.unit_price_minor, l.discount_minor, l.tax_rate_bp from public.invoice_lines l where l.invoice_id = v_inv.id)
         except all
         (select * from public.sale_bill_lines(v_inv.org_id, v_inv.sale_id, v_org.tax_mode))
       )
    then
      raise exception 'WB050: only an owner or manager can issue a bill that differs from its booking' using errcode = '42501';
    end if;
  elsif v_inv.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
        and v_inv.appointment_id is not null then
    -- A visitor's appointment: exactly the appointment and its add-ons (M34).
    if not exists (select 1 from public.invoice_expected_lines(v_inv.org_id, null, null, v_org.tax_mode, null, null, v_inv.appointment_id))
       or exists (
         (select * from public.invoice_expected_lines(v_inv.org_id, null, null, v_org.tax_mode, null, null, v_inv.appointment_id))
         except all
         (select l.quantity, l.unit_price_minor, l.discount_minor, l.tax_rate_bp from public.invoice_lines l where l.invoice_id = v_inv.id)
       )
       or exists (
         (select l.quantity, l.unit_price_minor, l.discount_minor, l.tax_rate_bp from public.invoice_lines l where l.invoice_id = v_inv.id)
         except all
         (select * from public.invoice_expected_lines(v_inv.org_id, null, null, v_org.tax_mode, null, null, v_inv.appointment_id))
       )
    then
      raise exception 'WB050: only an owner or manager can issue a bill that differs from its booking' using errcode = '42501';
    end if;
  elsif v_inv.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    if (v_inv.booking_id is null and v_inv.group_id is null and v_inv.series_id is null)
       or not exists (
         select 1 from public.bookings b
         where b.org_id = v_inv.org_id and b.client_id = v_inv.client_id
           and b.id in (select public.invoice_bookings(v_inv.org_id, v_inv.booking_id, v_inv.group_id, v_inv.series_id, v_inv.series_month))
       )
       or exists (
         (select * from public.invoice_expected_lines(v_inv.org_id, v_inv.booking_id, v_inv.group_id, v_org.tax_mode, v_inv.series_id, v_inv.series_month))
         except all
         (select l.quantity, l.unit_price_minor, l.discount_minor, l.tax_rate_bp from public.invoice_lines l where l.invoice_id = v_inv.id)
       )
       or exists (
         (select l.quantity, l.unit_price_minor, l.discount_minor, l.tax_rate_bp from public.invoice_lines l where l.invoice_id = v_inv.id)
         except all
         (select * from public.invoice_expected_lines(v_inv.org_id, v_inv.booking_id, v_inv.group_id, v_org.tax_mode, v_inv.series_id, v_inv.series_month))
       )
    then
      raise exception 'WB050: only an owner or manager can issue a bill that differs from its booking' using errcode = '42501';
    end if;
  end if;

  v_today := (now() at time zone v_org.time_zone)::date;
  v_fy := public.fiscal_year_label(v_today, v_org.fiscal_year_start_month);

  -- Take the next number. The row lock taken by this upsert makes concurrent
  -- issuers queue up, so numbers are consecutive with no gaps or repeats.
  insert into public.invoice_counters as c (org_id, series, fiscal_year, last_seq)
  values (v_inv.org_id, 'invoice', v_fy, 1)
  on conflict (org_id, series, fiscal_year) do update set last_seq = c.last_seq + 1
  returning c.last_seq into v_seq;

  v_number := v_org.invoice_prefix || '/'
    || case when v_fy ~ '^[0-9]{4}-[0-9]{2}$' then substr(v_fy, 3) else v_fy end
    -- Padded to four digits, and simply longer from 10000 on. (lpad alone would cut "10000" down to "1000".)
    || '/' || case when v_seq < 10000 then lpad(v_seq::text, 4, '0') else v_seq::text end;

  perform set_config('wagbook.issuing', 'on', true);
  update public.invoices i
  set status = 'issued',
      number = v_number,
      fiscal_year = v_fy,
      seq = v_seq,
      issued_on = v_today,
      issued_by = (select auth.uid()),
      is_tax_invoice = (v_org.tax_mode <> 'none'),
      prices_include_tax = v_org.prices_include_tax,
      currency = v_org.currency,
      subtotal_minor = v_sum.subtotal,
      place_of_supply_state_code = coalesce(i.place_of_supply_state_code, v_org.gst_state_code),
      seller = jsonb_build_object(
        'name', coalesce(v_org.legal_name, v_org.name),
        'trade_name', v_org.name,
        'address_line1', v_org.address_line1,
        'address_line2', v_org.address_line2,
        'city', v_org.city,
        'state', v_org.state,
        'postal_code', v_org.postal_code,
        'country_code', v_org.country_code,
        'phone', v_org.phone,
        'email', v_org.email,
        'tax_mode', v_org.tax_mode,
        'tax_label', v_org.tax_label,
        'tax_id', v_org.tax_id,
        'gst_state_code', v_org.gst_state_code,
        'upi_vpa', v_org.upi_vpa,
        'upi_payee_name', coalesce(v_org.upi_payee_name, v_org.name)
      ),
      buyer = jsonb_build_object(
        'name', v_client.full_name,
        'phone', v_client.phone,
        'email', v_client.email,
        'address', v_client.address,
        'city', v_client.city,
        'postal_code', v_client.postal_code,
        'tax_id', v_client.tax_id,
        'gst_state_code', v_client.gst_state_code
      )
  where i.id = v_inv.id
  returning * into v_inv;
  perform set_config('wagbook.issuing', 'off', true);

  -- Money already received for these stays counts against the bill: advances
  -- (on any pet of a family, or any day of the series in the month), and
  -- anything paid against an earlier bill for them that was voided.
  if v_inv.booking_id is not null or v_inv.group_id is not null or v_inv.series_id is not null then
    update public.payments p
    set invoice_id = v_inv.id
    where p.org_id = v_inv.org_id
      and (p.booking_id = v_inv.booking_id
           or p.booking_id in (select b.id from public.bookings b where b.org_id = v_inv.org_id and b.group_id = v_inv.group_id)
           or p.booking_id in (
             select b.id from public.bookings b
             where b.org_id = v_inv.org_id and b.series_id = v_inv.series_id
               and b.start_date >= v_inv.series_month and b.start_date < (v_inv.series_month + interval '1 month')::date))
      and (p.invoice_id is null
           or p.invoice_id in (select i.id from public.invoices i where i.org_id = v_inv.org_id and i.status = 'void'));
  end if;

  return v_inv;
end;
$$;
comment on function public.issue_invoice(uuid) is
  'Issues a draft invoice: checks every line and total against the tax rules, assigns the next consecutive number for the financial year, and freezes the seller''s and buyer''s details (including where to pay). Owners and managers may issue any draft; staff only one whose lines are exactly what its booking (or its family''s bookings, its month of a series, its food deliveries, or its sale over the counter) says. Takes in advances paid for those stays.';

create function public.void_invoice(p_invoice uuid, p_reason text)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
begin
  select * into v_inv from public.invoices i where i.id = p_invoice for update;
  if v_inv.id is null or v_inv.org_id not in (select public.my_org_ids()) then
    raise exception 'WB003: invoice not found' using errcode = 'P0002';
  end if;
  if v_inv.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB002: only an owner or manager can void an invoice' using errcode = '42501';
  end if;
  if v_inv.status <> 'issued' then
    raise exception 'WB038: only an issued invoice can be voided' using errcode = '23514';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'WB039: say why the invoice is being voided' using errcode = '23514';
  end if;
  -- A credit note has gone out against it: what is left is credited too, not cancelled.
  if exists (select 1 from public.credit_notes cn where cn.org_id = v_inv.org_id and cn.invoice_id = v_inv.id) then
    raise exception 'WB096: this bill has a credit note. Credit what is left instead of cancelling it.' using errcode = '23514';
  end if;
  -- A tax invoice from an earlier month may already be in a tax return, so it
  -- is undone with a credit note in the month it is undone (docs/06, D34).
  if v_inv.is_tax_invoice and date_trunc('month', v_inv.issued_on) < date_trunc('month', public.org_today(v_inv.org_id)) then
    raise exception 'WB095: this bill was issued in an earlier month. Make a credit note instead of cancelling it.' using errcode = '23514';
  end if;

  perform set_config('wagbook.voiding', 'on', true);
  update public.invoices i
  set status = 'void', voided_at = now(), voided_by = (select auth.uid()), void_reason = btrim(p_reason)
  where i.id = v_inv.id
  returning * into v_inv;
  perform set_config('wagbook.voiding', 'off', true);
  return v_inv;
end;
$$;
create function public.save_invoice_draft(p_invoice uuid, p_totals jsonb, p_lines jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
begin
  -- Row level security applies (security invoker): only a member reaches the invoice.
  update public.invoices i
  set subtotal_minor = (p_totals ->> 'subtotal_minor')::bigint,
      discount_minor = (p_totals ->> 'discount_minor')::bigint,
      taxable_minor = (p_totals ->> 'taxable_minor')::bigint,
      cgst_minor = (p_totals ->> 'cgst_minor')::bigint,
      sgst_minor = (p_totals ->> 'sgst_minor')::bigint,
      igst_minor = (p_totals ->> 'igst_minor')::bigint,
      tax_minor = (p_totals ->> 'tax_minor')::bigint,
      round_off_minor = (p_totals ->> 'round_off_minor')::bigint,
      total_minor = (p_totals ->> 'total_minor')::bigint
  where i.id = p_invoice and i.status = 'draft'
  returning i.org_id into v_org;
  if v_org is null then
    raise exception 'WB051: only a draft bill can be changed' using errcode = 'P0002';
  end if;

  delete from public.invoice_lines l where l.invoice_id = p_invoice;
  insert into public.invoice_lines (org_id, invoice_id, sort_order, description, sac_code, quantity, unit_price_minor,
                                    discount_minor, taxable_minor, tax_rate_bp, cgst_minor, sgst_minor, igst_minor, tax_minor, total_minor)
  select v_org, p_invoice, x.sort_order, x.description, x.sac_code, x.quantity, x.unit_price_minor, x.discount_minor,
         x.taxable_minor, x.tax_rate_bp, x.cgst_minor, x.sgst_minor, x.igst_minor, x.tax_minor, x.total_minor
  from jsonb_to_recordset(p_lines) as x (
    sort_order integer, description text, sac_code text, quantity numeric, unit_price_minor bigint, discount_minor bigint,
    taxable_minor bigint, tax_rate_bp integer, cgst_minor bigint, sgst_minor bigint, igst_minor bigint, tax_minor bigint,
    total_minor bigint
  );
end;
$$;
comment on function public.save_invoice_draft(uuid, jsonb, jsonb) is
  'Replaces a draft invoice''s lines and totals in one go, so a draft is never left half written. The numbers come from src/lib/core/tax.ts; issue_invoice() checks them.';

comment on function public.void_invoice(uuid, text) is
  'Voids an issued invoice with a reason. Owner or manager only. The number stays used; issue a fresh invoice to replace it. A tax invoice from an earlier month is not voided but credited (WB095), and a bill with a credit note is credited the rest of the way (WB096).';

-- ---------------------------------------------------------------------------
-- Settings that bills depend on
-- ---------------------------------------------------------------------------

-- Once a kennel has issued a bill, its currency and the month its financial
-- year starts are fixed. Every amount the kennel has stored is in its
-- currency, so changing it would add rupees to dollars in every total. A new
-- year start would restart bill numbers at 1 partway through a financial year
-- under a new label, and numbers must run in order through the year.
create function public.organizations_lock_billing_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.currency is distinct from old.currency or new.fiscal_year_start_month is distinct from old.fiscal_year_start_month)
     and exists (select 1 from public.invoices i where i.org_id = old.id and i.status <> 'draft') then
    raise exception 'WB052: the currency and the month the financial year starts cannot change once a bill has been issued' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.organizations_lock_billing_settings() is
  'Trigger: refuses a change of currency or financial year start once the kennel has issued a bill (issued or cancelled), so stored amounts keep one currency and bill numbers keep running in order through the year.';

create trigger organizations_lock_billing_settings
  before update of currency, fiscal_year_start_month on public.organizations
  for each row execute function public.organizations_lock_billing_settings();

-- ---------------------------------------------------------------------------
-- Day boarding packs
--
-- A kennel sells regulars a pack of day boarding days (10 days within 60 days)
-- up front, on one bill. Each day boarding booking paid from the pack then
-- costs nothing on its own (bookings.pass_id, rate 0), and the pack can never
-- give more days than were bought.
-- ---------------------------------------------------------------------------

create table public.day_packs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  days integer not null check (days between 1 and 365),
  price_minor bigint not null check (price_minor >= 0),
  valid_days integer not null check (valid_days between 1 and 730),
  tax_rate_bp integer check (tax_rate_bp is null or tax_rate_bp between 0 and 10000),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);

comment on table public.day_packs is 'The day boarding packs a kennel sells: so many days, at a price, to use within so many days.';
comment on column public.day_packs.days is 'How many days of day boarding the pack gives.';
comment on column public.day_packs.valid_days is 'How long it lasts from the day it starts, in days: 60 means the start day and the 59 after it.';
comment on column public.day_packs.tax_rate_bp is 'Tax rate on the pack''s bill, in basis points. Empty: the kennel''s usual rate.';
comment on column public.day_packs.sac_code is 'Service code printed on the pack''s bill. The kennel''s accountant decides it.';
comment on column public.day_packs.is_active is 'False once taken off the list: packs already sold keep working.';

create trigger day_packs_set_updated_at
  before update on public.day_packs
  for each row execute function public.set_updated_at();

create table public.passes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  day_pack_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  days integer not null check (days between 1 and 365),
  price_minor bigint not null check (price_minor >= 0),
  starts_on date not null,
  valid_until date not null,
  invoice_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete restrict,
  foreign key (org_id, day_pack_id) references public.day_packs (org_id, id) on delete set null (day_pack_id),
  foreign key (org_id, invoice_id) references public.invoices (org_id, id) on delete set null (invoice_id),
  constraint passes_dates_in_order check (valid_until >= starts_on and valid_until - starts_on <= 730)
);

comment on table public.passes is
  'A day boarding pack a parent bought: so many days to use between two dates. Day boarding bookings paid from it name it (bookings.pass_id).';
comment on column public.passes.name is 'The pack''s name when it was sold, so renaming the pack later does not change what the parent bought.';
comment on column public.passes.days is 'Days of day boarding bought. pass_balances says how many are used and left.';
comment on column public.passes.invoice_id is 'The bill the pack was sold on.';

create index passes_org_client_idx on public.passes (org_id, client_id, valid_until);

create trigger passes_stamp_actor
  before insert or update on public.passes
  for each row execute function public.stamp_actor('created_by');

-- A training course is sold on a bill of its own, as a pack is (M36).
alter table public.courses
  add constraint courses_invoice_fkey foreign key (org_id, invoice_id) references public.invoices (org_id, id) on delete set null (invoice_id);

alter table public.bookings
  add constraint bookings_pass_fkey foreign key (org_id, pass_id) references public.passes (org_id, id) on delete restrict;

-- The days of a pack that bookings hold: confirmed, in house, gone home, or
-- did not come (the kennel kept the place). Not requests, not cancellations.
create view public.pass_balances
with (security_invoker = true)
as
select
  p.id as pass_id,
  p.org_id,
  p.client_id,
  p.name,
  p.days,
  p.starts_on,
  p.valid_until,
  p.invoice_id,
  coalesce(u.used, 0)::integer as days_used,
  (p.days - coalesce(u.used, 0))::integer as days_left
from public.passes p
left join lateral (
  select sum(b.end_date - b.start_date + 1) as used
  from public.bookings b
  where b.org_id = p.org_id and b.pass_id = p.id and b.status in ('confirmed', 'checked_in', 'checked_out', 'no_show')
) u on true;

comment on view public.pass_balances is 'Each day boarding pack with the days used (bookings that hold a place) and the days left.';

-- A day paid from a pack must be day boarding of the parent who bought it,
-- inside the pack's dates, and the pack must have the days. Bookings on one
-- pack queue while counting, so two at the same moment cannot both take its
-- last day. Runs as the caller (row level security applies).
create function public.bookings_check_pass()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pass public.passes;
  v_used integer;
begin
  -- Merging two parents moves bookings before their packs (merge_clients).
  if new.pass_id is null or new.status not in ('requested', 'confirmed', 'checked_in', 'checked_out', 'no_show')
     or coalesce(current_setting('wagbook.merging', true), '') = 'on' then
    return new;
  end if;
  -- One booking at a time per pack: a lock on the pack's id, which staff may
  -- take (a row lock would need the right to change the pack).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pass:' || new.pass_id::text, 0));
  select * into v_pass from public.passes p where p.org_id = new.org_id and p.id = new.pass_id;
  if v_pass.id is null or v_pass.client_id <> new.client_id or new.kind <> 'daycare' then
    raise exception 'WB110: a day boarding pack is for day boarding of the parent who bought it' using errcode = '23514';
  end if;
  if new.start_date < v_pass.starts_on or new.end_date > v_pass.valid_until then
    raise exception 'WB111: the pack is for % to %, and these days are outside it', v_pass.starts_on, v_pass.valid_until using errcode = '23514';
  end if;
  if new.status = 'requested' then
    return new;
  end if;
  select coalesce(sum(b.end_date - b.start_date + 1), 0) into v_used
  from public.bookings b
  where b.org_id = new.org_id and b.pass_id = new.pass_id and b.id <> new.id
    and b.status in ('confirmed', 'checked_in', 'checked_out', 'no_show');
  if v_used + (new.end_date - new.start_date + 1) > v_pass.days then
    raise exception 'WB112: the pack has % days left', greatest(v_pass.days - v_used, 0) using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.bookings_check_pass() is
  'Trigger: a day boarding booking paid from a pack must be day boarding of the pack''s parent (WB110), inside its dates (WB111), and, once it holds a place, within the days left (WB112).';

create trigger bookings_check_pass
  before insert or update of pass_id, status, start_date, end_date, kind, client_id on public.bookings
  for each row execute function public.bookings_check_pass();

-- ---------------------------------------------------------------------------
-- Credit notes
--
-- A credit note takes back all or part of an issued bill, in the month it is
-- made, with its own number (CN/YY-YY/NNNN). The bill itself stays as it was:
-- it may already be in a tax return. Only issue_credit_note() writes them,
-- and once written they never change (no update or delete grants).
-- ---------------------------------------------------------------------------

create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null,
  number text not null check (char_length(number) <= 16 and number ~ '^[A-Za-z0-9/-]+$'),
  fiscal_year text not null,
  seq integer not null check (seq > 0),
  issued_on date not null,
  issued_by uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 500),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  discount_minor bigint not null check (discount_minor >= 0),
  taxable_minor bigint not null check (taxable_minor >= 0),
  cgst_minor bigint not null check (cgst_minor >= 0),
  sgst_minor bigint not null check (sgst_minor >= 0),
  igst_minor bigint not null check (igst_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0),
  round_off_minor bigint not null check (round_off_minor between -99 and 99),
  total_minor bigint not null check (total_minor > 0),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, number),
  unique (org_id, fiscal_year, seq),
  foreign key (org_id, invoice_id) references public.invoices (org_id, id) on delete restrict
);

comment on table public.credit_notes is
  'A credit note: takes back all or part of an issued bill, counted in the month it is made. Written only by issue_credit_note(); never changed.';
comment on column public.credit_notes.invoice_id is 'The bill it takes back from. Its buyer, seller and tax details are the bill''s.';
comment on column public.credit_notes.number is 'Printed number, CN/YY-YY/NNNN. Consecutive within a financial year, its own series, never reused.';
comment on column public.credit_notes.issued_on is 'Credit note date: the kennel''s local date when it was made. Tax reports count it in this month.';
comment on column public.credit_notes.reason is 'Why the bill is being taken back, such as "Went home two nights early".';
comment on column public.credit_notes.total_minor is 'What is taken off the bill: taxable + tax + round off.';

create index credit_notes_org_invoice_idx on public.credit_notes (org_id, invoice_id);
create index credit_notes_org_issued_idx on public.credit_notes (org_id, issued_on desc);

create table public.credit_note_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  credit_note_id uuid not null,
  sort_order integer not null default 0,
  description text not null check (char_length(description) between 1 and 300),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  discount_minor bigint not null check (discount_minor >= 0),
  taxable_minor bigint not null check (taxable_minor >= 0),
  tax_rate_bp integer not null check (tax_rate_bp between 0 and 10000),
  cgst_minor bigint not null check (cgst_minor >= 0),
  sgst_minor bigint not null check (sgst_minor >= 0),
  igst_minor bigint not null check (igst_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  foreign key (org_id, credit_note_id) references public.credit_notes (org_id, id) on delete cascade
);

comment on table public.credit_note_lines is 'The lines of a credit note: what is taken back, with its tax worked out as on the bill.';

create index credit_note_lines_note_idx on public.credit_note_lines (org_id, credit_note_id, sort_order);

-- The kennel's own date today.
create function public.org_today(p_org uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone o.time_zone)::date from public.organizations o where o.id = p_org;
$$;
comment on function public.org_today(uuid) is 'Today''s date in the kennel''s time zone.';

create function public.issue_credit_note(p_invoice uuid, p_reason text, p_totals jsonb, p_lines jsonb)
returns public.credit_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_org public.organizations;
  v_mode public.tax_mode;
  v_intra boolean;
  v_line jsonb;
  v_sum record;
  v_before record;
  v_exact bigint;
  v_round_off bigint;
  v_fy text;
  v_seq integer;
  v_note public.credit_notes;
  v_today date;
  v_i integer := 0;
begin
  -- SECURITY DEFINER: credit notes and the counter have no write grants, so
  -- nobody can make or change one but here. Who may is checked here: an owner
  -- or manager of the bill's kennel.
  select * into v_inv from public.invoices i where i.id = p_invoice for update;
  if v_inv.id is null or v_inv.org_id not in (select public.my_org_ids()) then
    raise exception 'WB003: invoice not found' using errcode = 'P0002';
  end if;
  if v_inv.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB002: only an owner or manager can make a credit note' using errcode = '42501';
  end if;
  if v_inv.status <> 'issued' then
    raise exception 'WB090: a credit note is made against an issued bill' using errcode = '23514';
  end if;
  if coalesce(btrim(p_reason), '') = '' or char_length(btrim(p_reason)) > 500 then
    raise exception 'WB091: say why the bill is being credited, in under 500 characters' using errcode = '23514';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    raise exception 'WB094: a credit note needs at least one line' using errcode = '23514';
  end if;

  select * into v_org from public.organizations o where o.id = v_inv.org_id;
  -- The bill's own tax treatment, as frozen on it when it was issued.
  v_mode := case when v_inv.is_tax_invoice then (v_inv.seller ->> 'tax_mode')::public.tax_mode else 'none' end;
  v_intra := v_inv.place_of_supply_state_code is not distinct from (v_inv.seller ->> 'gst_state_code');
  v_today := public.org_today(v_inv.org_id);
  v_fy := public.fiscal_year_label(v_today, v_org.fiscal_year_start_month);

  -- Every line checked as a bill's line is, and at a tax rate the bill charged.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if not exists (select 1 from public.invoice_lines l
                   where l.invoice_id = v_inv.id and l.tax_rate_bp = (v_line ->> 'tax_rate_bp')::integer) then
      raise exception 'WB093: a credit note line must use a tax rate that is on the bill' using errcode = '23514';
    end if;
    perform public.check_bill_line(v_mode, v_intra, v_inv.prices_include_tax,
      (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_price_minor')::bigint, (v_line ->> 'discount_minor')::bigint,
      (v_line ->> 'taxable_minor')::bigint, (v_line ->> 'tax_rate_bp')::integer, (v_line ->> 'cgst_minor')::bigint,
      (v_line ->> 'sgst_minor')::bigint, (v_line ->> 'igst_minor')::bigint, (v_line ->> 'tax_minor')::bigint);
  end loop;

  select
    coalesce(sum(round((x ->> 'quantity')::numeric * (x ->> 'unit_price_minor')::bigint)), 0)::bigint as subtotal,
    coalesce(sum((x ->> 'discount_minor')::bigint), 0)::bigint as discount,
    coalesce(sum((x ->> 'taxable_minor')::bigint), 0)::bigint as taxable,
    coalesce(sum((x ->> 'cgst_minor')::bigint), 0)::bigint as cgst,
    coalesce(sum((x ->> 'sgst_minor')::bigint), 0)::bigint as sgst,
    coalesce(sum((x ->> 'igst_minor')::bigint), 0)::bigint as igst,
    coalesce(sum((x ->> 'tax_minor')::bigint), 0)::bigint as tax
  into v_sum
  from jsonb_array_elements(p_lines) x;

  v_exact := v_sum.taxable + v_sum.tax;
  v_round_off := coalesce((p_totals ->> 'round_off_minor')::bigint, 0);
  if v_sum.taxable <> (p_totals ->> 'taxable_minor')::bigint
     or v_sum.tax <> (p_totals ->> 'tax_minor')::bigint
     or v_sum.cgst <> (p_totals ->> 'cgst_minor')::bigint
     or v_sum.sgst <> (p_totals ->> 'sgst_minor')::bigint
     or v_sum.igst <> (p_totals ->> 'igst_minor')::bigint
     or v_sum.discount <> (p_totals ->> 'discount_minor')::bigint
     or (p_totals ->> 'total_minor')::bigint <> v_exact + v_round_off
     -- Round off is nothing, or exactly the rounding to a whole unit.
     or (v_round_off <> 0 and v_round_off <> round(v_exact / 100.0) * 100 - v_exact)
  then
    raise exception 'WB037: credit note totals do not match its lines' using errcode = '23514';
  end if;

  -- Never more than is left on the bill, in all or in what was taxed.
  select coalesce(sum(cn.total_minor), 0)::bigint as total, coalesce(sum(cn.taxable_minor), 0)::bigint as taxable
  into v_before
  from public.credit_notes cn
  where cn.org_id = v_inv.org_id and cn.invoice_id = v_inv.id;
  if v_before.total + v_exact + v_round_off > v_inv.total_minor or v_before.taxable + v_sum.taxable > v_inv.taxable_minor then
    raise exception 'WB092: a credit note cannot take back more than is left on the bill' using errcode = '23514';
  end if;

  -- Take the next number in the kennel's credit note series for the year.
  insert into public.invoice_counters as c (org_id, series, fiscal_year, last_seq)
  values (v_inv.org_id, 'credit_note', v_fy, 1)
  on conflict (org_id, series, fiscal_year) do update set last_seq = c.last_seq + 1
  returning c.last_seq into v_seq;

  insert into public.credit_notes (
    org_id, invoice_id, number, fiscal_year, seq, issued_on, issued_by, reason, currency,
    subtotal_minor, discount_minor, taxable_minor, cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor)
  values (
    v_inv.org_id, v_inv.id,
    'CN/' || case when v_fy ~ '^[0-9]{4}-[0-9]{2}$' then substr(v_fy, 3) else v_fy end
      || '/' || case when v_seq < 10000 then lpad(v_seq::text, 4, '0') else v_seq::text end,
    v_fy, v_seq, v_today, (select auth.uid()), btrim(p_reason), v_inv.currency,
    v_sum.subtotal, v_sum.discount, v_sum.taxable, v_sum.cgst, v_sum.sgst, v_sum.igst, v_sum.tax, v_round_off, v_exact + v_round_off)
  returning * into v_note;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.credit_note_lines (
      org_id, credit_note_id, sort_order, description, sac_code, quantity, unit_price_minor, discount_minor,
      taxable_minor, tax_rate_bp, cgst_minor, sgst_minor, igst_minor, tax_minor, total_minor)
    values (
      v_inv.org_id, v_note.id, v_i, left(btrim(v_line ->> 'description'), 300), nullif(v_line ->> 'sac_code', ''),
      (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_price_minor')::bigint, (v_line ->> 'discount_minor')::bigint,
      (v_line ->> 'taxable_minor')::bigint, (v_line ->> 'tax_rate_bp')::integer, (v_line ->> 'cgst_minor')::bigint,
      (v_line ->> 'sgst_minor')::bigint, (v_line ->> 'igst_minor')::bigint, (v_line ->> 'tax_minor')::bigint,
      (v_line ->> 'taxable_minor')::bigint + (v_line ->> 'tax_minor')::bigint);
    v_i := v_i + 1;
  end loop;

  return v_note;
end;
$$;
comment on function public.issue_credit_note(uuid, text, jsonb, jsonb) is
  'Makes a credit note against an issued bill: checks every line as issue_invoice does, under the bill''s own tax treatment and at a rate the bill charged (WB093), and that the bill is not credited beyond its total (WB092); gives the next CN/YY-YY/NNNN number for the year. Owner or manager. A reason is required (WB091).';

-- ---------------------------------------------------------------------------
-- Payments and expenses
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  booking_id uuid,
  invoice_id uuid,
  direction text not null default 'in' check (direction in ('in', 'out')),
  amount_minor bigint not null check (amount_minor > 0),
  method public.payment_method not null,
  reference text,
  received_on date not null,
  note text,
  recorded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete restrict,
  foreign key (org_id, booking_id) references public.bookings (org_id, id) on delete set null (booking_id),
  foreign key (org_id, invoice_id) references public.invoices (org_id, id) on delete set null (invoice_id)
);

comment on table public.payments is
  'Money received from a parent, or refunded to one. Wagbook records payments; it does not move money. An advance is a payment linked to a booking before any invoice exists.';
comment on column public.payments.direction is 'in: received from the parent. out: refunded to the parent.';
comment on column public.payments.amount_minor is 'Always positive. direction says which way it went.';
comment on column public.payments.reference is 'UPI transaction reference (UTR), cheque number or similar, for matching against the bank statement.';
comment on column public.payments.received_on is 'Kennel-local date the money moved.';

create index payments_org_date_idx on public.payments (org_id, received_on desc);
create index payments_org_invoice_idx on public.payments (org_id, invoice_id);
create index payments_org_booking_idx on public.payments (org_id, booking_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create trigger payments_stamp_actor
  before insert or update on public.payments
  for each row execute function public.stamp_actor('recorded_by');

-- A refund gives back only money the parent paid and is not owed: on a bill,
-- what was paid over what the bill now comes to (its total less its credit
-- notes; a cancelled bill comes to nothing); on a stay with no bill yet, the
-- advance paid for it. So a refund can never stand in for a credit note that
-- would show the tax taken back, and never sends back money that did not come
-- in. Refunds are for owners and managers already (payments_insert policy).
create function public.payments_check_refund()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_room bigint;
begin
  if new.direction <> 'out' then
    return new;
  end if;
  if new.invoice_id is null and new.booking_id is null then
    raise exception 'WB120: a refund is made against a bill or a stay' using errcode = '23514';
  end if;
  -- One refund at a time for a bill or stay, so two at once cannot both take the last of it.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('refund:' || coalesce(new.invoice_id, new.booking_id)::text, 0));

  if new.invoice_id is not null then
    select coalesce((
             select sum(case when p.direction = 'in' then p.amount_minor else -p.amount_minor end)
             from public.payments p
             where p.org_id = new.org_id and p.invoice_id = new.invoice_id and p.id <> new.id
           ), 0)
           - case when i.status = 'issued'
                  then i.total_minor - coalesce((select sum(cn.total_minor) from public.credit_notes cn
                                                 where cn.org_id = i.org_id and cn.invoice_id = i.id), 0)
                  else 0 end
      into v_room
    from public.invoices i
    where i.org_id = new.org_id and i.id = new.invoice_id;
    if coalesce(v_room, 0) < new.amount_minor then
      raise exception 'WB121: a refund can only give back what was paid over what the bill now comes to. Make a credit note first if the stay costs less.'
        using errcode = '23514';
    end if;
  else
    select coalesce(sum(case when p.direction = 'in' then p.amount_minor else -p.amount_minor end), 0)
      into v_room
    from public.payments p
    where p.org_id = new.org_id and p.booking_id = new.booking_id and p.invoice_id is null and p.id <> new.id;
    if v_room < new.amount_minor then
      raise exception 'WB122: a refund can only give back the advance paid for this stay' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
comment on function public.payments_check_refund() is
  'Trigger: a refund names a bill or a stay (WB120) and gives back no more than was paid over what the bill now comes to after credit notes (WB121), or than the advance paid for a stay with no bill (WB122).';

create trigger payments_check_refund
  before insert or update of direction, amount_minor, invoice_id, booking_id on public.payments
  for each row execute function public.payments_check_refund();

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  spent_on date not null,
  category text not null check (char_length(category) between 1 and 60),
  vendor text check (vendor is null or char_length(vendor) <= 120),
  description text check (description is null or char_length(description) <= 500),
  amount_minor bigint not null check (amount_minor > 0),
  method public.payment_method,
  booking_id uuid,
  is_reimbursable boolean not null default false,
  receipt_path text,
  recorded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, booking_id) references public.bookings (org_id, id) on delete set null (booking_id)
);

comment on table public.expenses is 'Money the kennel spent: food, staff, repairs, vet bills. Owners and managers only.';
comment on column public.expenses.booking_id is 'Set when the expense was for one pet''s stay, e.g. a vet visit.';
comment on column public.expenses.category is 'What it was for, in the kennel''s own words: Food, Staff, Rent. Reports total by this.';
comment on column public.expenses.receipt_path is 'Photo or PDF of the receipt in storage, under {org_id}/expenses/. Only owners and managers can open it.';
comment on column public.expenses.is_reimbursable is 'True when the parent should pay this back; add it to the booking as an item.';

create index expenses_org_date_idx on public.expenses (org_id, spent_on desc);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

create trigger expenses_stamp_actor
  before insert or update on public.expenses
  for each row execute function public.stamp_actor('recorded_by');

-- ---------------------------------------------------------------------------
-- What is still owed. security_invoker makes the view obey the caller's row
-- level security instead of the view owner's.
-- ---------------------------------------------------------------------------

create view public.invoice_balances
with (security_invoker = true)
as
select
  i.id as invoice_id,
  i.org_id,
  i.client_id,
  i.booking_id,
  i.group_id,
  i.status,
  i.number,
  i.total_minor,
  coalesce(p.paid_minor, 0)::bigint as paid_minor,
  coalesce(c.credited_minor, 0)::bigint as credited_minor,
  (case when i.status = 'issued' then i.total_minor - coalesce(c.credited_minor, 0) - coalesce(p.paid_minor, 0) else 0 end)::bigint as due_minor,
  i.series_id,
  i.series_month,
  i.appointment_id,
  i.sale_id
from public.invoices i
left join lateral (
  select sum(case when pay.direction = 'in' then pay.amount_minor else -pay.amount_minor end) as paid_minor
  from public.payments pay
  where pay.invoice_id = i.id
) p on true
left join lateral (
  select sum(cn.total_minor) as credited_minor
  from public.credit_notes cn
  where cn.org_id = i.org_id and cn.invoice_id = i.id
) c on true;

comment on view public.invoice_balances is
  'Each invoice with what has been paid against it, what credit notes took off it, and what is still due (below zero: paid more than it now comes to, so a refund is owed).';

-- ---------------------------------------------------------------------------
-- Merging two parents who turn out to be the same person.
-- ---------------------------------------------------------------------------

create function public.merge_clients(p_keep uuid, p_merge uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.clients;
  v_merge public.clients;
begin
  -- SECURITY DEFINER: issued bills are frozen against every edit, including
  -- their parent. Merging is the one thing allowed to move them, so it runs
  -- with that permission and checks the caller itself.
  select * into v_keep from public.clients c where c.id = p_keep for update;
  select * into v_merge from public.clients c where c.id = p_merge for update;
  if v_keep.id is null or v_merge.id is null or v_keep.id = v_merge.id or v_keep.org_id <> v_merge.org_id
     or v_keep.deleted_at is not null or v_merge.deleted_at is not null
     -- The walk-in buyer of sales over the counter is nobody's record (M62).
     or v_keep.is_walk_in or v_merge.is_walk_in
     or v_keep.org_id not in (select public.my_org_ids()) then
    raise exception 'WB018: choose two different parents of this kennel' using errcode = '22023';
  end if;
  if v_keep.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB002: only an owner or manager can merge parents' using errcode = '42501';
  end if;

  -- While merging, a family's bookings and bills are briefly split between the
  -- two parents; the checks that keep a family with one parent wait until the end.
  perform set_config('wagbook.merging', 'on', true);
  -- Pets, and with them their bookings, subscriptions and deliveries (on update cascade).
  update public.pets p set client_id = v_keep.id where p.org_id = v_keep.org_id and p.client_id = v_merge.id;
  -- Anything else that names the parent.
  update public.bookings b set client_id = v_keep.id where b.org_id = v_keep.org_id and b.client_id = v_merge.id;
  update public.invoices i set client_id = v_keep.id where i.org_id = v_keep.org_id and i.client_id = v_merge.id;
  -- Day boarding packs go with the parent, and so do the days paid from them.
  update public.passes ps set client_id = v_keep.id where ps.org_id = v_keep.org_id and ps.client_id = v_merge.id;
  -- Credit, and the payments into and from it, go together (M38).
  update public.credits cr set client_id = v_keep.id where cr.org_id = v_keep.org_id and cr.client_id = v_merge.id;
  update public.payments p set client_id = v_keep.id where p.org_id = v_keep.org_id and p.client_id = v_merge.id;
  -- Sales over the counter, with their bills (M62).
  update public.sales s set client_id = v_keep.id where s.org_id = v_keep.org_id and s.client_id = v_merge.id;
  perform set_config('wagbook.merging', 'off', true);
  -- Play sessions copy their parent from the booking whenever they are written.
  update public.play_sessions ps set client_id = v_keep.id where ps.org_id = v_keep.org_id and ps.client_id = v_merge.id;
  update public.intake_submissions s set client_id = v_keep.id where s.org_id = v_keep.org_id and s.client_id = v_merge.id;
  update public.client_addresses a set client_id = v_keep.id where a.org_id = v_keep.org_id and a.client_id = v_merge.id;
  update public.food_orders f set client_id = v_keep.id where f.org_id = v_keep.org_id and f.client_id = v_merge.id;

  -- Fill in what the kept parent is missing, and keep both sets of notes.
  update public.clients c set
    alt_phone = coalesce(c.alt_phone, case when v_merge.phone <> c.phone then v_merge.phone end, v_merge.alt_phone),
    email = coalesce(c.email, v_merge.email),
    address = coalesce(c.address, v_merge.address),
    city = coalesce(c.city, v_merge.city),
    postal_code = coalesce(c.postal_code, v_merge.postal_code),
    gst_state_code = coalesce(c.gst_state_code, v_merge.gst_state_code),
    tax_id = coalesce(c.tax_id, v_merge.tax_id),
    emergency_name = coalesce(c.emergency_name, v_merge.emergency_name),
    emergency_phone = coalesce(c.emergency_phone, v_merge.emergency_phone),
    notes = nullif(concat_ws(E'\n', c.notes, v_merge.notes), ''),
    consent_at = coalesce(c.consent_at, v_merge.consent_at),
    consent_source = coalesce(c.consent_source, v_merge.consent_source)
  where c.id = v_keep.id;

  -- The other record is hidden, not deleted: the audit log still names it.
  update public.clients c set deleted_at = now() where c.id = v_merge.id;
  return v_keep.id;
end;
$$;
comment on function public.merge_clients(uuid, uuid) is
  'Merges a duplicate parent into another of the same kennel: moves pets (and their bookings, food subscriptions and deliveries), bills, payments, credit, forms, food orders and addresses, fills in missing details, and hides the duplicate. Owner or manager. Issued bills keep the buyer details printed on them.';
