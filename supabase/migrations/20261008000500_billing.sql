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
create type public.payment_method as enum ('upi', 'cash', 'card', 'bank_transfer', 'other');
comment on type public.invoice_status is
  'draft: being prepared, editable, has no number. issued: numbered and frozen. void: cancelled after issue; the number stays used.';
comment on type public.payment_method is 'How money moved. Wagbook records this; it does not process payments.';

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  booking_id uuid,
  status public.invoice_status not null default 'draft',
  number text,
  fiscal_year text,
  seq integer,
  issued_on date,
  issued_by uuid references auth.users (id) on delete set null,
  is_tax_invoice boolean not null default false,
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
comment on column public.invoices.number is 'Printed invoice number, e.g. WB/27-28/0001. Empty until issued. Consecutive within a financial year, never reused.';
comment on column public.invoices.fiscal_year is 'Financial year the number belongs to, e.g. 2027-28.';
comment on column public.invoices.seq is 'Position in the year''s sequence: the 0001 in WB/27-28/0001.';
comment on column public.invoices.issued_on is 'Invoice date: the kennel''s local date when it was issued.';
comment on column public.invoices.is_tax_invoice is 'True when issued by a tax-registered kennel, so it is titled Tax Invoice and shows the tax breakup.';
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
create index invoices_org_client_idx on public.invoices (org_id, client_id);
create index invoices_org_booking_idx on public.invoices (org_id, booking_id);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger invoices_stamp_actor
  before insert or update on public.invoices
  for each row execute function public.stamp_actor('created_by');

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
  fiscal_year text not null,
  last_seq integer not null default 0 check (last_seq >= 0),
  primary key (org_id, fiscal_year)
);

comment on table public.invoice_counters is
  'The last invoice sequence used per organisation per financial year. Only issue_invoice touches it; nobody can read or write it directly.';

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

-- ---------------------------------------------------------------------------
-- Issuing and voiding
-- ---------------------------------------------------------------------------

create function public.invoice_expected_lines(p_booking uuid, p_tax_mode public.tax_mode)
returns table (quantity numeric, unit_price_minor bigint, discount_minor bigint, tax_rate_bp integer)
language sql
stable
set search_path = ''
as $$
  select
    (case when b.kind = 'daycare' then b.end_date - b.start_date + 1 else b.end_date - b.start_date end)::numeric(10, 2),
    b.rate_minor,
    b.discount_minor,
    case when p_tax_mode = 'none' then 0 else b.tax_rate_bp end
  from public.bookings b
  where b.id = p_booking
  union all
  select bi.quantity, bi.unit_price_minor, 0::bigint, case when p_tax_mode = 'none' then 0 else bi.tax_rate_bp end
  from public.booking_items bi
  where bi.booking_id = p_booking;
$$;
comment on function public.invoice_expected_lines(uuid, public.tax_mode) is
  'The lines a bill for a booking should have, as quantity, unit price, discount and tax rate: the stay (nights for boarding, days for day boarding) and each extra. Must match stayLines() in src/lib/core/stay.ts.';

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
  v_gross bigint;
  v_net bigint;
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
    v_gross := round(v_line.quantity * v_line.unit_price_minor);
    v_net := v_gross - v_line.discount_minor;
    if v_net < 0 then
      raise exception 'WB037: a discount is larger than its line' using errcode = '23514';
    end if;

    if v_org.tax_mode = 'none' or v_line.tax_rate_bp = 0 then
      if v_line.tax_minor <> 0 or v_line.cgst_minor <> 0 or v_line.sgst_minor <> 0 or v_line.igst_minor <> 0
         or v_line.taxable_minor <> v_net then
        raise exception 'WB037: a line that carries no tax has tax or the wrong amount' using errcode = '23514';
      end if;
    else
      if v_org.prices_include_tax then
        -- Tax is inside the price: taxable + tax must equal what the customer pays,
        -- and taxable must be the price with the tax backed out (give or take the
        -- single unit that keeps CGST and SGST equal).
        if v_line.taxable_minor + v_line.tax_minor <> v_net
           or abs(v_line.taxable_minor - round(v_net * 10000.0 / (10000 + v_line.tax_rate_bp))) > 1 then
          raise exception 'WB037: a line''s tax does not match its price and rate' using errcode = '23514';
        end if;
      elsif v_line.taxable_minor <> v_net then
        raise exception 'WB037: a line''s taxable value does not match its price' using errcode = '23514';
      end if;

      if v_org.tax_mode = 'gst_india' then
        if v_intra then
          if v_line.igst_minor <> 0 or v_line.cgst_minor <> v_line.sgst_minor
             or v_line.tax_minor <> v_line.cgst_minor + v_line.sgst_minor
             or (not v_org.prices_include_tax
                 and v_line.cgst_minor <> round(v_line.taxable_minor * v_line.tax_rate_bp / 20000.0)) then
            raise exception 'WB037: a line''s CGST and SGST do not match its taxable value and rate' using errcode = '23514';
          end if;
        elsif v_line.cgst_minor <> 0 or v_line.sgst_minor <> 0 or v_line.tax_minor <> v_line.igst_minor
              or (not v_org.prices_include_tax
                  and v_line.igst_minor <> round(v_line.taxable_minor * v_line.tax_rate_bp / 10000.0)) then
          raise exception 'WB037: a line''s IGST does not match its taxable value and rate' using errcode = '23514';
        end if;
      else
        if v_line.cgst_minor <> 0 or v_line.sgst_minor <> 0 or v_line.igst_minor <> 0
           or (not v_org.prices_include_tax
               and v_line.tax_minor <> round(v_line.taxable_minor * v_line.tax_rate_bp / 10000.0)) then
          raise exception 'WB037: a line''s tax does not match its taxable value and rate' using errcode = '23514';
        end if;
      end if;
    end if;
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
  if v_inv.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    if v_inv.booking_id is null
       or not exists (select 1 from public.bookings b where b.id = v_inv.booking_id and b.client_id = v_inv.client_id)
       or exists (
         (select * from public.invoice_expected_lines(v_inv.booking_id, v_org.tax_mode))
         except all
         (select l.quantity, l.unit_price_minor, l.discount_minor, l.tax_rate_bp from public.invoice_lines l where l.invoice_id = v_inv.id)
       )
       or exists (
         (select l.quantity, l.unit_price_minor, l.discount_minor, l.tax_rate_bp from public.invoice_lines l where l.invoice_id = v_inv.id)
         except all
         (select * from public.invoice_expected_lines(v_inv.booking_id, v_org.tax_mode))
       )
    then
      raise exception 'WB050: only an owner or manager can issue a bill that differs from its booking' using errcode = '42501';
    end if;
  end if;

  v_today := (now() at time zone v_org.time_zone)::date;
  v_fy := public.fiscal_year_label(v_today, v_org.fiscal_year_start_month);

  -- Take the next number. The row lock taken by this upsert makes concurrent
  -- issuers queue up, so numbers are consecutive with no gaps or repeats.
  insert into public.invoice_counters as c (org_id, fiscal_year, last_seq)
  values (v_inv.org_id, v_fy, 1)
  on conflict (org_id, fiscal_year) do update set last_seq = c.last_seq + 1
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

  -- Money already received for this stay counts against its bill: advances,
  -- and anything paid against an earlier bill for it that was voided.
  if v_inv.booking_id is not null then
    update public.payments p
    set invoice_id = v_inv.id
    where p.org_id = v_inv.org_id
      and p.booking_id = v_inv.booking_id
      and (p.invoice_id is null
           or p.invoice_id in (select i.id from public.invoices i where i.org_id = v_inv.org_id and i.status = 'void'));
  end if;

  return v_inv;
end;
$$;
comment on function public.issue_invoice(uuid) is
  'Issues a draft invoice: checks every line and total against the tax rules, assigns the next consecutive number for the financial year, and freezes the seller''s and buyer''s details (including where to pay). Owners and managers may issue any draft; staff only one whose lines are exactly what its booking says. Takes in advances paid for the booking.';

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
  'Voids an issued invoice with a reason. Owner or manager only. The number stays used; issue a fresh invoice to replace it.';

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

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  spent_on date not null,
  category text not null check (char_length(category) between 1 and 60),
  vendor text,
  description text,
  amount_minor bigint not null check (amount_minor > 0),
  method public.payment_method,
  booking_id uuid,
  is_reimbursable boolean not null default false,
  receipt_path text,
  recorded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, booking_id) references public.bookings (org_id, id) on delete set null (booking_id)
);

comment on table public.expenses is 'Money the kennel spent: food, staff, repairs, vet bills. Owners and managers only.';
comment on column public.expenses.booking_id is 'Set when the expense was for one pet''s stay, e.g. a vet visit.';
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
  i.status,
  i.number,
  i.total_minor,
  coalesce(p.paid_minor, 0)::bigint as paid_minor,
  (case when i.status = 'issued' then i.total_minor - coalesce(p.paid_minor, 0) else 0 end)::bigint as due_minor
from public.invoices i
left join lateral (
  select sum(case when pay.direction = 'in' then pay.amount_minor else -pay.amount_minor end) as paid_minor
  from public.payments pay
  where pay.invoice_id = i.id
) p on true;

comment on view public.invoice_balances is 'Each invoice with what has been paid against it and what is still due.';

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
     or v_keep.org_id not in (select public.my_org_ids()) then
    raise exception 'WB018: choose two different parents of this kennel' using errcode = '22023';
  end if;
  if v_keep.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB002: only an owner or manager can merge parents' using errcode = '42501';
  end if;

  -- Pets, and with them their bookings (on update cascade).
  update public.pets p set client_id = v_keep.id where p.org_id = v_keep.org_id and p.client_id = v_merge.id;
  -- Anything else that names the parent.
  update public.bookings b set client_id = v_keep.id where b.org_id = v_keep.org_id and b.client_id = v_merge.id;
  perform set_config('wagbook.merging', 'on', true);
  update public.invoices i set client_id = v_keep.id where i.org_id = v_keep.org_id and i.client_id = v_merge.id;
  perform set_config('wagbook.merging', 'off', true);
  update public.payments p set client_id = v_keep.id where p.org_id = v_keep.org_id and p.client_id = v_merge.id;
  update public.intake_submissions s set client_id = v_keep.id where s.org_id = v_keep.org_id and s.client_id = v_merge.id;

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
  'Merges a duplicate parent into another of the same kennel: moves pets (and their bookings), bills, payments and forms, fills in missing details, and hides the duplicate. Owner or manager. Issued bills keep the buyer details printed on them.';
