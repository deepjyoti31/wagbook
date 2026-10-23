-- =============================================================================
-- Wagbook 00058: money and stock (Phase 8, M62 to M64, D54)
--
--   Shop       treats, toys and accessories sold over the counter, from the
--              same stock as the kitchen's (M62). A sale goes on the stay's
--              bill or on a bill of its own, to a parent or to the kennel's
--              walk-in buyer, and takes its stock out in the same step.
--   Orders     an order to a supplier, received in full or in part, which is
--              when its stock goes in; the supplier's bill against it as an
--              expense; and what is still to come, for the shopping list (M63).
--   Tally      the ledger names a kennel's accountant uses, set once, for the
--              month's file for Tally (M64).
--
-- Row level security for these tables is in 0008 with the rest of the access
-- model, as for every table until the migration freeze.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The walk-in buyer (M62)
-- ---------------------------------------------------------------------------

-- The kennel's one "Walk-in" buyer, made the first time it is needed.
-- SECURITY DEFINER: clients.is_walk_in is not writable by the app's role, so
-- nobody can turn a real parent into the walk-in or back. It checks that the
-- caller works at the kennel itself.
create function public.walk_in_client(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_org not in (select public.my_org_ids()) then
    raise exception 'WB003: that kennel was not found' using errcode = 'P0002';
  end if;
  select c.id into v_id from public.clients c where c.org_id = p_org and c.is_walk_in;
  if v_id is null then
    insert into public.clients (org_id, full_name, phone, is_walk_in)
    values (p_org, 'Walk-in', '', true)
    on conflict (org_id) where is_walk_in do nothing
    returning id into v_id;
    if v_id is null then
      select c.id into v_id from public.clients c where c.org_id = p_org and c.is_walk_in;
    end if;
  end if;
  return v_id;
end;
$$;
comment on function public.walk_in_client(uuid) is
  'The kennel''s "Walk-in" buyer for sales over the counter to someone who is not a parent (M62), made the first time it is needed. Any member of the kennel.';

-- The walk-in buyer has no pets, so nothing is booked for it.
create function public.pets_not_walk_in()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.clients c where c.org_id = new.org_id and c.id = new.client_id and c.is_walk_in) then
    raise exception 'WB286: the walk-in buyer has no pets. Add the pet to its own parent.' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.pets_not_walk_in() is 'Trigger: a pet never belongs to the walk-in buyer of sales over the counter (WB286).';

create trigger pets_not_walk_in
  before insert or update of client_id on public.pets
  for each row execute function public.pets_not_walk_in();

-- ---------------------------------------------------------------------------
-- Sales over the counter (M62)
-- ---------------------------------------------------------------------------

create type public.sale_status as enum ('sold', 'cancelled');
comment on type public.sale_status is
  'sold: the things went out and are billed. cancelled: undone by an owner or manager before its bill went out; the stock came back.';

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  booking_id uuid,
  sold_on date not null,
  status public.sale_status not null default 'sold',
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) between 1 and 300),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, client_id) references public.clients (org_id, id),
  foreign key (org_id, booking_id) references public.bookings (org_id, id),
  constraint sales_cancelled_with_reason check (
    (status = 'cancelled') = (cancelled_at is not null) and (status = 'cancelled') = (cancel_reason is not null)
  )
);

comment on table public.sales is
  'Things sold over the counter (M62): to a parent, on a stay or on a bill of its own, or to the kennel''s walk-in buyer. Made only by sell(), which takes the stock out in the same step; never changed but to cancel it.';
comment on column public.sales.client_id is 'Who bought: a parent, or the kennel''s walk-in buyer (clients.is_walk_in).';
comment on column public.sales.booking_id is 'The stay it was sold on: it goes on that stay''s bill. Empty: it has a bill of its own (invoices.sale_id).';
comment on column public.sales.sold_on is 'The day it was sold, in the kennel''s time zone.';
comment on column public.sales.cancel_reason is 'Why it was cancelled (cancel_sale). The stock came back.';
comment on column public.sales.created_by is 'Who sold it. Set by the database.';

create index sales_org_day_idx on public.sales (org_id, sold_on desc);
create index sales_org_booking_idx on public.sales (org_id, booking_id) where booking_id is not null;
create index sales_org_client_idx on public.sales (org_id, client_id);

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  sale_id uuid not null,
  item_id uuid not null,
  quantity integer not null check (quantity between 1 and 1000),
  description text not null check (char_length(description) between 1 and 300),
  unit_price_minor bigint not null check (unit_price_minor > 0),
  tax_rate_bp integer not null check (tax_rate_bp between 0 and 10000),
  hsn_code text check (hsn_code is null or hsn_code ~ '^[0-9]{4,8}$'),
  sort_order integer not null default 0,
  unique (org_id, id),
  unique (org_id, sale_id, item_id),
  foreign key (org_id, sale_id) references public.sales (org_id, id) on delete cascade,
  foreign key (org_id, item_id) references public.stock_items (org_id, id)
);

comment on table public.sale_lines is
  'One thing sold, with how many and the price, tax rate and HSN code it was sold at, copied from the item by the database when sold. Never changed.';
comment on column public.sale_lines.quantity is 'How many pieces.';
comment on column public.sale_lines.description is 'The item''s name when it was sold, for the bill.';
comment on column public.sale_lines.unit_price_minor is 'The price of one piece when it was sold (stock_items.sell_price_minor), in minor units.';
comment on column public.sale_lines.tax_rate_bp is 'The item''s tax rate when it was sold. A kennel that charges no tax bills it at 0.';

create index sale_lines_org_sale_idx on public.sale_lines (org_id, sale_id, sort_order);

alter table public.stock_moves
  add constraint stock_moves_sale_line_fkey foreign key (org_id, sale_line_id) references public.sale_lines (org_id, id);

-- A line is priced from its item, whatever was sent: nobody types a price at
-- the counter. An item that is not for sale, or no longer kept, is refused.
create function public.sale_lines_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item public.stock_items;
begin
  select * into v_item from public.stock_items i where i.org_id = new.org_id and i.id = new.item_id;
  if v_item.id is null or v_item.sell_price_minor is null or not v_item.is_active then
    raise exception 'WB281: % is not for sale. An owner or manager gives it a price first.', coalesce(v_item.name, 'that')
      using errcode = '23514';
  end if;
  new.description := v_item.name;
  new.unit_price_minor := v_item.sell_price_minor;
  new.tax_rate_bp := v_item.sell_tax_rate_bp;
  new.hsn_code := v_item.hsn_code;
  return new;
end;
$$;
comment on function public.sale_lines_price() is
  'Trigger: a line of a sale takes its name, price, tax rate and HSN code from its item; an item with no price or no longer kept is refused (WB281).';

create trigger sale_lines_price
  before insert on public.sale_lines
  for each row execute function public.sale_lines_price();

-- Selling takes the stock out, in the same step, and is refused when there is
-- not enough (WB130, stock_moves_apply).
create function public.sale_lines_take_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, sale_line_id)
  select new.org_id, new.item_id, 'sale', -new.quantity, s.sold_on, new.id
  from public.sales s
  where s.org_id = new.org_id and s.id = new.sale_id;
  return null;
end;
$$;
comment on function public.sale_lines_take_stock() is
  'Trigger: a line sold takes its pieces out of stock on the day of the sale; refused when there are not enough (WB130).';

create trigger sale_lines_take_stock
  after insert on public.sale_lines
  for each row execute function public.sale_lines_take_stock();

-- Whether a stay's bill has gone out: the stay's own, its family's, or its
-- month of a series. A sale on it then has nowhere to go.
create function public.stay_bill_issued(p_org uuid, p_booking uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    join public.invoices i on i.org_id = b.org_id and i.status = 'issued'
     and (i.booking_id = b.id or i.group_id = b.group_id
          or (i.series_id = b.series_id and i.series_month = date_trunc('month', b.start_date)::date))
    where b.org_id = p_org and b.id = p_booking
  );
$$;
comment on function public.stay_bill_issued(uuid, uuid) is
  'True when the bill covering a stay (its own, its family''s, or its month of a series) has been issued.';

-- Selling: the things and how many, to a parent, on a stay, or to the walk-in
-- buyer; the prices and the stock in one step. SECURITY DEFINER: sales and
-- their lines have no grant to add rows, so a sale is never added to or
-- changed after it is made, and the stock is taken out only by the sale. It
-- checks the caller (an owner, manager or staff member of the kennel) itself.
create function public.sell(p_org uuid, p_lines jsonb, p_client uuid default null, p_booking uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_booking public.bookings;
  v_client uuid := p_client;
  v_sale uuid;
  v_line record;
  v_n integer := 0;
begin
  if p_org not in (select public.my_org_ids_with_role(array['owner', 'manager', 'staff']::public.member_role[])) then
    raise exception 'WB003: that kennel was not found' using errcode = 'P0002';
  end if;
  select * into v_org from public.organizations o where o.id = p_org;
  if not v_org.offers_shop then
    raise exception 'WB280: this kennel does not sell over the counter. Switch it on in Settings first.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'WB287: choose at least one thing to sell' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'WB287: sell at most 50 different things at a time' using errcode = '22023';
  end if;

  if p_booking is not null then
    select * into v_booking from public.bookings b where b.org_id = p_org and b.id = p_booking;
    if v_booking.id is null or (p_client is not null and p_client <> v_booking.client_id) then
      raise exception 'WB003: that stay was not found' using errcode = 'P0002';
    end if;
    if v_booking.status not in ('confirmed', 'checked_in') then
      raise exception 'WB282: things are sold on a stay that is booked or in the kennel' using errcode = '23514';
    end if;
    if public.stay_bill_issued(p_org, p_booking) then
      raise exception 'WB283: this stay''s bill has gone out. Sell on a bill of its own.' using errcode = '23514';
    end if;
    v_client := v_booking.client_id;
  elsif p_client is not null then
    if not exists (
      select 1 from public.clients c
      where c.org_id = p_org and c.id = p_client and c.deleted_at is null and c.erased_at is null
    ) then
      raise exception 'WB003: that parent was not found' using errcode = 'P0002';
    end if;
  else
    v_client := public.walk_in_client(p_org);
  end if;

  insert into public.sales (org_id, client_id, booking_id, sold_on)
  values (p_org, v_client, p_booking, public.org_today(p_org))
  returning id into v_sale;

  -- The same item twice is one line with the pieces added up.
  for v_line in
    select x.item_id, sum(x.quantity)::bigint as quantity
    from (
      select (e.value ->> 'item_id')::uuid as item_id, (e.value ->> 'quantity')::integer as quantity, e.ord
      from jsonb_array_elements(p_lines) with ordinality as e (value, ord)
    ) x
    group by x.item_id
    order by min(x.ord)
  loop
    if v_line.item_id is null or v_line.quantity is null or v_line.quantity < 1 or v_line.quantity > 1000 then
      raise exception 'WB287: say how many of each, from 1 to 1000' using errcode = '22023';
    end if;
    v_n := v_n + 1;
    insert into public.sale_lines (org_id, sale_id, item_id, quantity, description, unit_price_minor, tax_rate_bp, sort_order)
    values (p_org, v_sale, v_line.item_id, v_line.quantity, '-', 1, 0, v_n);
  end loop;
  return v_sale;
end;
$$;
comment on function public.sell(uuid, jsonb, uuid, uuid) is
  'Sells things over the counter (M62): p_lines is [{item_id, quantity}]. On a stay (p_booking, booked or in the kennel, its bill not out yet: WB282, WB283), to a parent (p_client) for a bill of its own, or with neither to the kennel''s walk-in buyer. Each line is priced from its item (WB281) and its stock taken out (WB130). Owners, managers and staff, while the kennel sells over the counter (WB280).';

-- Cancelling a sale made by mistake: the stock comes back. Only before its
-- bill has gone out; after that the bill is credited instead.
-- SECURITY DEFINER: a sale is never changed by the app's role, and the stock
-- comes back only with its cancellation. It checks the caller is an owner or
-- manager of the kennel. A draft bill of its own goes with it.
create function public.cancel_sale(p_sale uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
begin
  select * into v_sale from public.sales s where s.id = p_sale for update;
  if v_sale.id is null or v_sale.org_id not in (select public.my_org_ids()) then
    raise exception 'WB003: that sale was not found' using errcode = 'P0002';
  end if;
  if v_sale.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB002: only an owner or manager cancels a sale' using errcode = '42501';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'WB284: this sale was cancelled already' using errcode = '23514';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'WB285: say why the sale is cancelled' using errcode = '23514';
  end if;
  if (v_sale.booking_id is not null and public.stay_bill_issued(v_sale.org_id, v_sale.booking_id))
     or exists (select 1 from public.invoices i where i.org_id = v_sale.org_id and i.sale_id = v_sale.id and i.status = 'issued') then
    raise exception 'WB283: this sale''s bill has gone out. Make a credit note on the bill instead.' using errcode = '23514';
  end if;

  update public.sales s
  set status = 'cancelled', cancel_reason = left(btrim(p_reason), 300), cancelled_at = now(), cancelled_by = (select auth.uid())
  where s.id = v_sale.id;
  insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, sale_line_id, note)
  select l.org_id, l.item_id, 'sale', l.quantity, public.org_today(l.org_id), l.id, 'Sale cancelled'
  from public.sale_lines l
  where l.org_id = v_sale.org_id and l.sale_id = v_sale.id;
  delete from public.invoices i where i.org_id = v_sale.org_id and i.sale_id = v_sale.id and i.status = 'draft';
end;
$$;
comment on function public.cancel_sale(uuid, text) is
  'Cancels a sale over the counter with a reason (WB285) before its bill has gone out (WB283): its stock comes back and a draft bill of its own is removed. Owners and managers (WB002).';

-- The lines a bill of its own for a sale should have (M62).
create function public.sale_bill_lines(p_org uuid, p_sale uuid, p_tax_mode public.tax_mode)
returns table (quantity numeric, unit_price_minor bigint, discount_minor bigint, tax_rate_bp integer)
language sql
stable
set search_path = ''
as $$
  select l.quantity::numeric(10, 2), l.unit_price_minor, 0::bigint, case when p_tax_mode = 'none' then 0 else l.tax_rate_bp end
  from public.sale_lines l
  join public.sales s on s.org_id = l.org_id and s.id = l.sale_id
  where l.org_id = p_org and l.sale_id = p_sale and s.status = 'sold' and s.booking_id is null
  order by l.sort_order;
$$;
comment on function public.sale_bill_lines(uuid, uuid, public.tax_mode) is
  'The lines a sale''s bill of its own should have: each thing at the price it was sold at, with no tax when the kennel charges none. Nothing for a cancelled sale or one on a stay. Must match saleLines() in src/lib/core/shop.ts; issue_invoice() checks staff bills against it.';

alter table public.invoices
  add constraint invoices_sale_fkey foreign key (org_id, sale_id) references public.sales (org_id, id);

create unique index invoices_one_live_per_sale on public.invoices (org_id, sale_id)
  where sale_id is not null and status <> 'void';
comment on index public.invoices_one_live_per_sale is 'A sale over the counter has at most one draft or issued bill.';

-- A bill of its own is for a sale of that buyer that is not on a stay.
create function public.invoices_check_sale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sale_id is not null and coalesce(current_setting('wagbook.merging', true), '') <> 'on' and not exists (
    select 1 from public.sales s
    where s.org_id = new.org_id and s.id = new.sale_id and s.client_id = new.client_id and s.booking_id is null and s.status = 'sold'
  ) then
    raise exception 'WB288: a sale on a stay goes on the stay''s bill, and a bill of its own names a sale of this buyer' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.invoices_check_sale() is
  'Trigger: a bill for a sale names a sale of its buyer that is not on a stay and not cancelled (WB288).';

create trigger invoices_check_sale
  before insert or update of sale_id, client_id on public.invoices
  for each row execute function public.invoices_check_sale();

-- ---------------------------------------------------------------------------
-- Orders to suppliers (M63)
-- ---------------------------------------------------------------------------

create type public.supplier_order_status as enum ('open', 'closed');
comment on type public.supplier_order_status is
  'open: waiting for what was ordered. closed: an owner or manager said the rest is not coming. An open order with nothing left to come is received in full.';

create table public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid not null,
  ordered_on date not null,
  status public.supplier_order_status not null default 'open',
  note text check (note is null or char_length(note) <= 300),
  sent_at timestamptz,
  bill_number text check (bill_number is null or char_length(bill_number) <= 40),
  bill_path text,
  expense_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, supplier_id) references public.suppliers (org_id, id),
  foreign key (org_id, expense_id) references public.expenses (org_id, id) on delete set null (expense_id)
);

comment on table public.supplier_orders is
  'An order to a supplier (M63): what was asked for, sent on WhatsApp. Stock goes in only as it is received (stock_moves with supplier_order_id), in full or in part. Placed by owners and managers.';
comment on column public.supplier_orders.ordered_on is 'The day it was ordered, in the kennel''s time zone.';
comment on column public.supplier_orders.note is 'A note for the supplier, sent with the order.';
comment on column public.supplier_orders.sent_at is 'When it was sent to the supplier on WhatsApp, as far as Wagbook knows.';
comment on column public.supplier_orders.bill_number is 'The number on the supplier''s bill for this order.';
comment on column public.supplier_orders.bill_path is 'Photo of the supplier''s bill in storage, under {org_id}/expenses/, so only owners and managers open it.';
comment on column public.supplier_orders.expense_id is 'The supplier''s bill, written down as an expense (record_supplier_bill). Empty until it is.';

create index supplier_orders_org_idx on public.supplier_orders (org_id, ordered_on desc);

create trigger supplier_orders_set_updated_at
  before update on public.supplier_orders
  for each row execute function public.set_updated_at();

create table public.supplier_order_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null,
  item_id uuid not null,
  quantity bigint not null check (quantity > 0),
  unique (org_id, id),
  unique (org_id, order_id, item_id),
  foreign key (org_id, order_id) references public.supplier_orders (org_id, id) on delete cascade,
  foreign key (org_id, item_id) references public.stock_items (org_id, id)
);

comment on table public.supplier_order_lines is 'One thing on an order to a supplier, and how much, in the item''s unit. Written with the order and never changed.';

alter table public.stock_moves
  add constraint stock_moves_supplier_order_fkey foreign key (org_id, supplier_order_id) references public.supplier_orders (org_id, id);

create index stock_moves_org_order_idx on public.stock_moves (org_id, supplier_order_id) where supplier_order_id is not null;

-- Each line of each order: what was ordered, what has come, and what is still
-- to come.
create view public.supplier_order_progress
with (security_invoker = true)
as
select
  l.org_id,
  l.order_id,
  l.item_id,
  l.quantity as ordered,
  coalesce(r.received, 0)::bigint as received,
  greatest(l.quantity - coalesce(r.received, 0), 0)::bigint as still_to_come,
  o.status,
  o.supplier_id
from public.supplier_order_lines l
join public.supplier_orders o on o.org_id = l.org_id and o.id = l.order_id
left join lateral (
  select sum(m.quantity) as received
  from public.stock_moves m
  where m.org_id = l.org_id and m.supplier_order_id = l.order_id and m.item_id = l.item_id
) r on true;

comment on view public.supplier_order_progress is
  'Each line of each order to a supplier: ordered, received so far and still to come, with the order''s status.';

-- What is on its way, by item: still to come on open orders. The kitchen's
-- shopping list takes it off what it asks for (M63).
create view public.stock_on_order
with (security_invoker = true)
as
select p.org_id, p.item_id, sum(p.still_to_come)::bigint as on_order
from public.supplier_order_progress p
where p.status = 'open'
group by p.org_id, p.item_id
having sum(p.still_to_come) > 0;

comment on view public.stock_on_order is 'Each item still to come on open orders to suppliers, added up.';

-- Placing an order: the supplier and the lines in one step. Runs as the
-- caller: row level security lets only owners and managers write orders.
create function public.place_supplier_order(p_org uuid, p_supplier uuid, p_lines jsonb, p_note text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_order uuid;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 100 then
    raise exception 'WB289: put 1 to 100 things on an order' using errcode = '22023';
  end if;
  insert into public.supplier_orders (org_id, supplier_id, ordered_on, note)
  values (p_org, p_supplier, public.org_today(p_org), nullif(left(btrim(p_note), 300), ''))
  returning id into v_order;
  insert into public.supplier_order_lines (org_id, order_id, item_id, quantity)
  select p_org, v_order, x.item_id, sum(x.quantity)
  from jsonb_to_recordset(p_lines) as x (item_id uuid, quantity bigint)
  group by x.item_id;
  return v_order;
end;
$$;
comment on function public.place_supplier_order(uuid, uuid, jsonb, text) is
  'Places an order to a supplier with its lines, [{item_id, quantity}] in each item''s unit, in one step (WB289). Owners and managers.';

-- Stock received against an order is for an open order, an item on it, and
-- no more than is still to come (M63). Received stock comes from the order's
-- supplier.
create function public.stock_moves_check_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order public.supplier_orders;
  v_left bigint;
begin
  if new.supplier_order_id is null then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('order:' || new.supplier_order_id::text, 0));
  select * into v_order from public.supplier_orders o where o.org_id = new.org_id and o.id = new.supplier_order_id;
  if v_order.id is null then
    raise exception 'WB003: that order was not found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'open' then
    raise exception 'WB290: this order is closed. Record what came as bought in.' using errcode = '23514';
  end if;
  select p.still_to_come into v_left
  from public.supplier_order_progress p
  where p.org_id = new.org_id and p.order_id = new.supplier_order_id and p.item_id = new.item_id;
  if v_left is null then
    raise exception 'WB291: that is not on this order' using errcode = '23514';
  end if;
  if new.quantity > v_left then
    raise exception 'WB292: that is more than is still to come on this order (%). Record the rest as bought in.', v_left using errcode = '23514';
  end if;
  new.supplier_id := v_order.supplier_id;
  return new;
end;
$$;
comment on function public.stock_moves_check_order() is
  'Trigger: stock received against an order needs the order open (WB290), the item on it (WB291) and no more than is still to come (WB292); it comes from the order''s supplier.';

create trigger stock_moves_check_order
  before insert on public.stock_moves
  for each row execute function public.stock_moves_check_order();

-- Receiving: what came, in full or in part, in one step. Runs as the caller:
-- any member receives stock against an order; a cost, for recipe costs, is
-- written only by owners and managers (stock_costs).
create function public.receive_supplier_order(p_order uuid, p_on date, p_lines jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_order public.supplier_orders;
  v_line record;
  v_move uuid;
  v_n integer := 0;
begin
  select * into v_order from public.supplier_orders o where o.id = p_order;
  if v_order.id is null or v_order.org_id not in (select public.my_org_ids()) then
    raise exception 'WB003: that order was not found' using errcode = 'P0002';
  end if;
  for v_line in
    select x.item_id, x.quantity, x.cost_minor, x.use_by
    from jsonb_to_recordset(p_lines) as x (item_id uuid, quantity bigint, cost_minor bigint, use_by date)
    where coalesce(x.quantity, 0) > 0
  loop
    insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, use_by, supplier_order_id)
    values (v_order.org_id, v_line.item_id, 'purchase', v_line.quantity, p_on, v_line.use_by, v_order.id)
    returning id into v_move;
    if v_line.cost_minor is not null then
      insert into public.stock_costs (org_id, move_id, cost_minor, bill_number)
      values (v_order.org_id, v_move, v_line.cost_minor, v_order.bill_number);
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'WB289: say how much of something came' using errcode = '22023';
  end if;
  return v_n;
end;
$$;
comment on function public.receive_supplier_order(uuid, date, jsonb) is
  'Receives what came of an order, [{item_id, quantity, cost_minor, use_by}], putting it in stock (WB290 to WB292). Any member; a cost only by owners and managers.';

-- The supplier's bill for an order, written down as an expense, once.
-- Runs as the caller: row level security lets only owners and managers write
-- expenses and change orders.
create function public.record_supplier_bill(
  p_order uuid, p_amount_minor bigint, p_on date, p_category text,
  p_bill_number text default null, p_bill_path text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_order public.supplier_orders;
  v_supplier text;
  v_expense uuid;
begin
  select * into v_order from public.supplier_orders o where o.id = p_order for update;
  if v_order.id is null or v_order.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB003: that order was not found' using errcode = 'P0002';
  end if;
  if v_order.expense_id is not null then
    raise exception 'WB293: this order''s bill is written down already' using errcode = '23514';
  end if;
  select s.name into v_supplier from public.suppliers s where s.org_id = v_order.org_id and s.id = v_order.supplier_id;
  insert into public.expenses (org_id, spent_on, category, vendor, description, amount_minor, receipt_path)
  values (v_order.org_id, p_on, p_category, v_supplier,
          left('Order of ' || to_char(v_order.ordered_on, 'DD Mon YYYY') || coalesce(', bill ' || nullif(btrim(p_bill_number), ''), ''), 500),
          p_amount_minor, p_bill_path)
  returning id into v_expense;
  update public.supplier_orders o
  set expense_id = v_expense, bill_number = nullif(left(btrim(p_bill_number), 40), ''), bill_path = p_bill_path
  where o.id = v_order.id;
  return v_expense;
end;
$$;
comment on function public.record_supplier_bill(uuid, bigint, date, text, text, text) is
  'Writes the supplier''s bill for an order down as an expense (E4) and keeps it on the order, once (WB293). Owners and managers.';

-- ---------------------------------------------------------------------------
-- Ledger names for Tally (M64)
-- ---------------------------------------------------------------------------

create table public.tally_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  company text check (company is null or char_length(company) between 1 and 100),
  sales_ledger text not null default 'Sales',
  cgst_ledger text not null default 'Output CGST',
  sgst_ledger text not null default 'Output SGST',
  igst_ledger text not null default 'Output IGST',
  tax_ledger text not null default 'Output Tax',
  round_off_ledger text not null default 'Round Off',
  cash_ledger text not null default 'Cash',
  bank_ledger text not null default 'Bank',
  credit_ledger text not null default 'Credit held for parents',
  parents_group text not null default 'Sundry Debtors',
  expenses_group text not null default 'Indirect Expenses',
  updated_at timestamptz not null default now(),
  constraint tally_settings_names check (
    char_length(sales_ledger) between 1 and 100 and char_length(cgst_ledger) between 1 and 100
    and char_length(sgst_ledger) between 1 and 100 and char_length(igst_ledger) between 1 and 100
    and char_length(tax_ledger) between 1 and 100 and char_length(round_off_ledger) between 1 and 100
    and char_length(cash_ledger) between 1 and 100 and char_length(bank_ledger) between 1 and 100
    and char_length(credit_ledger) between 1 and 100 and char_length(parents_group) between 1 and 100
    and char_length(expenses_group) between 1 and 100
  )
);

comment on table public.tally_settings is
  'The ledger names the kennel''s books in Tally use, set once by an owner or manager, for the month''s file for Tally (M64). No row: the defaults.';
comment on column public.tally_settings.company is 'The company''s name in Tally, so the file goes into the right one. Empty: whichever company is open.';
comment on column public.tally_settings.sales_ledger is 'Where what bills come to before tax goes, and what credit notes take back.';
comment on column public.tally_settings.cgst_ledger is 'Output CGST, for India GST within the state.';
comment on column public.tally_settings.sgst_ledger is 'Output SGST, for India GST within the state.';
comment on column public.tally_settings.igst_ledger is 'Output IGST, for India GST to another state.';
comment on column public.tally_settings.tax_ledger is 'The tax ledger when the kennel charges one tax that is not India GST.';
comment on column public.tally_settings.round_off_ledger is 'Where a bill''s round off goes.';
comment on column public.tally_settings.cash_ledger is 'Money paid or spent in cash, and expenses with no way of paying written down.';
comment on column public.tally_settings.bank_ledger is 'Money paid or spent by UPI, card, bank transfer or another way.';
comment on column public.tally_settings.credit_ledger is 'Credit kept for parents (M38): kept from a refund, and spent on a bill.';
comment on column public.tally_settings.parents_group is 'The Tally group each parent''s own ledger is made under, named "{name} ({last four digits})".';
comment on column public.tally_settings.expenses_group is 'The Tally group each kind of expense''s ledger is made under, named as the kind of expense.';

create trigger tally_settings_set_updated_at
  before update on public.tally_settings
  for each row execute function public.set_updated_at();
