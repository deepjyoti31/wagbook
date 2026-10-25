-- =============================================================================
-- Wagbook 00055: the kitchen and food (Phase 1, M26 to M33, D44)
--
--   Stock      suppliers, items and their movements; stock is never edited,
--              it is the sum of its movements (M26).
--   Recipes    versions that never change, a rotation, items never allowed,
--              cost per kilo from purchase prices (M27).
--   Food       what the kennel sells, and what each pet eats (M28).
--   Deliveries subscriptions, the deliveries made ahead from them, one-off
--              orders, and their bills (M29).
--   Batches    cooking takes stock out; packs come from a batch of their own
--              recipe (M30).
--   Runs       a rider's deliveries for a slot, and problems reported after
--              a delivery (M31). Riders reach only their own run (D45).
--
-- Row level security for these tables is in 0008 with the rest of the access
-- model, as for every table until the migration freeze.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Stock (M26)
-- ---------------------------------------------------------------------------

create type public.stock_unit as enum ('g', 'ml', 'piece');
comment on type public.stock_unit is 'How an item is counted: grams, millilitres or pieces. Quantities are whole numbers of this unit.';

create type public.stock_kind as enum (
  'meat', 'organ', 'egg', 'grain', 'vegetable', 'oil', 'supplement', 'packaging', 'fuel', 'grooming', 'medicine',
  'treat', 'toy', 'accessory', 'other');
comment on type public.stock_kind is
  'What sort of thing an item is, for sorting the stock page and the shopping list. Treats, toys and accessories are usually sold over the counter (M62).';

create type public.stock_move_kind as enum ('purchase', 'used', 'waste', 'count', 'sale');
comment on type public.stock_move_kind is
  'purchase: bought in (owners and managers), or received against an order to a supplier (M63, anyone). used: taken out by a batch of cooking (M30), never by hand. waste: thrown away with a reason. count: a stock take, which sets the counted quantity and records the difference. sale: sold over the counter (M62), out when sold and back in when the sale is cancelled, written only by the database.';

create type public.waste_reason as enum ('spoiled', 'past_date', 'dropped', 'other');
comment on type public.waste_reason is 'Why stock was thrown away: spoiled, past its use-by date, dropped, or another reason in the note.';

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  supplies text check (supplies is null or char_length(supplies) <= 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name)
);

comment on table public.suppliers is 'Who the kennel buys from: a butcher, a vegetable seller, a packaging shop.';
comment on column public.suppliers.phone is 'In E.164 form, so the shopping list can be sent on WhatsApp.';
comment on column public.suppliers.supplies is 'What they supply, in the kennel''s own words ("chicken, mutton, liver").';
comment on column public.suppliers.is_active is 'False once the kennel stops buying from them; past purchases keep the name.';

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  unit public.stock_unit not null,
  kind public.stock_kind not null,
  supplier_id uuid,
  low_level bigint check (low_level is null or low_level >= 0),
  never_in_recipe boolean not null default false,
  is_active boolean not null default true,
  sell_price_minor bigint check (sell_price_minor is null or sell_price_minor > 0),
  sell_tax_rate_bp integer not null default 0 check (sell_tax_rate_bp between 0 and 10000),
  hsn_code text check (hsn_code is null or hsn_code ~ '^[0-9]{4,8}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name),
  foreign key (org_id, supplier_id) references public.suppliers (org_id, id) on delete set null (supplier_id),
  -- Things sold over the counter are sold by the piece (M62).
  constraint stock_items_sold_by_the_piece check (sell_price_minor is null or unit = 'piece')
);

comment on table public.stock_items is 'A thing the kennel keeps in stock: chicken, rice, carrots, pouches, gas, shampoo.';
comment on column public.stock_items.unit is 'How it is counted. Every quantity of this item is a whole number of this unit.';
comment on column public.stock_items.supplier_id is 'The usual supplier, used to group the shopping list.';
comment on column public.stock_items.low_level is 'At or below this quantity the stock page shows the item as low. Empty: never low.';
comment on column public.stock_items.never_in_recipe is
  'True for food a dog must never eat (onion, garlic, grapes, raisins, chocolate, cooked bones, added sugar): the database refuses a recipe that uses it (M27).';
comment on column public.stock_items.is_active is 'False once the kennel stops keeping it. Its movements stay.';
comment on column public.stock_items.sell_price_minor is
  'The price of one piece sold over the counter, in minor units (M62). Set by owners and managers. Empty: not for sale.';
comment on column public.stock_items.sell_tax_rate_bp is 'The tax rate on a sale of it, in basis points: 1800 is 18%. Left off when the kennel charges no tax.';
comment on column public.stock_items.hsn_code is 'The HSN code printed on the bill for a sale of it, 4 to 8 digits.';

create trigger stock_items_set_updated_at
  before update on public.stock_items
  for each row execute function public.set_updated_at();

create table public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null,
  kind public.stock_move_kind not null,
  quantity bigint not null,
  happened_on date not null,
  supplier_id uuid,
  use_by date,
  reason public.waste_reason,
  counted bigint check (counted is null or counted >= 0),
  batch_id uuid,
  sale_line_id uuid,
  supplier_order_id uuid,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, item_id) references public.stock_items (org_id, id) on delete restrict,
  foreign key (org_id, supplier_id) references public.suppliers (org_id, id) on delete set null (supplier_id),
  -- Each kind carries what it needs and nothing else.
  constraint stock_moves_shape check (
    (kind = 'sale') = (sale_line_id is not null)
    and (kind = 'purchase' or supplier_order_id is null)
    and case kind
      when 'purchase' then quantity > 0 and reason is null and counted is null and batch_id is null
      when 'used' then quantity < 0 and reason is null and counted is null and batch_id is not null and use_by is null
      when 'waste' then quantity < 0 and reason is not null and counted is null and batch_id is null and use_by is null
      when 'count' then counted is not null and reason is null and batch_id is null and use_by is null
      when 'sale' then quantity <> 0 and reason is null and counted is null and batch_id is null and use_by is null
    end
  )
);

comment on table public.stock_moves is
  'Every change to stock: bought in, used in cooking, thrown away, or counted. Never changed or deleted: what is in stock is the sum of these. A mistake is put right by a stock take.';
comment on column public.stock_moves.quantity is
  'The change, in the item''s unit: positive in, negative out. For a stock take the database works it out from what was counted.';
comment on column public.stock_moves.happened_on is 'The day it was bought, used, thrown away or counted, in the kennel''s time zone.';
comment on column public.stock_moves.use_by is 'Purchases only: the use-by date of what was bought, for the stock page''s "use soon" list.';
comment on column public.stock_moves.reason is 'Waste only: why it was thrown away.';
comment on column public.stock_moves.counted is 'Stock takes only: the quantity counted on the shelf.';
comment on column public.stock_moves.batch_id is 'Used only: the batch of cooking that took it (M30).';
comment on column public.stock_moves.sale_line_id is 'Sales only: the line of the sale over the counter that took it out, or put it back when the sale was cancelled (M62).';
comment on column public.stock_moves.supplier_order_id is 'Purchases only: the order to a supplier it was received against (M63).';
comment on column public.stock_moves.created_by is 'Who wrote it down. Set by the database.';

create index stock_moves_org_item_idx on public.stock_moves (org_id, item_id, happened_on);

create trigger stock_moves_stamp_actor
  before insert on public.stock_moves
  for each row execute function public.stamp_actor('created_by');

-- What a purchase cost: owners and managers only (staff see no cost), so it
-- is kept apart from the movement every member reads.
create table public.stock_costs (
  org_id uuid not null references public.organizations (id) on delete cascade,
  move_id uuid not null,
  cost_minor bigint not null check (cost_minor >= 0),
  bill_number text check (bill_number is null or char_length(bill_number) <= 40),
  bill_path text,
  expense_id uuid,
  created_at timestamptz not null default now(),
  primary key (org_id, move_id),
  foreign key (org_id, move_id) references public.stock_moves (org_id, id) on delete cascade,
  foreign key (org_id, expense_id) references public.expenses (org_id, id) on delete set null (expense_id)
);

comment on table public.stock_costs is
  'What a purchase cost, the supplier''s bill number and a photo of the bill. Owners and managers only. Recipe costs (M27) come from the latest of these.';
comment on column public.stock_costs.cost_minor is 'What the whole purchase cost, in minor units.';
comment on column public.stock_costs.bill_number is 'The number on the supplier''s bill.';
comment on column public.stock_costs.bill_path is 'Photo of the supplier''s bill in storage, under {org_id}/expenses/, so only owners and managers open it.';
comment on column public.stock_costs.expense_id is 'The expense the purchase was also written down as, when it was (E4).';

-- Stock moves one at a time per item, and never below nothing. A stock take
-- is the one way to correct stock: it records the difference between what
-- was counted and what the movements say.
create function public.stock_moves_apply()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_on_hand bigint;
  v_name text;
begin
  -- A lock on the item's id that any member may take (a row lock would need
  -- the right to change the item), so two movements at once queue.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stock:' || new.item_id::text, 0));
  select coalesce(sum(m.quantity), 0) into v_on_hand
  from public.stock_moves m
  where m.org_id = new.org_id and m.item_id = new.item_id;
  if new.kind = 'count' then
    new.quantity := new.counted - v_on_hand;
  elsif v_on_hand + new.quantity < 0 then
    select i.name into v_name from public.stock_items i where i.org_id = new.org_id and i.id = new.item_id;
    raise exception 'WB130: there is not enough % in stock (% left). Count it first if the shelf says otherwise.', v_name, v_on_hand
      using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.stock_moves_apply() is
  'Trigger: movements of one item queue; one that would take stock below nothing is refused (WB130); a stock take records the difference between what was counted and what the movements add up to.';

create trigger stock_moves_apply
  before insert on public.stock_moves
  for each row execute function public.stock_moves_apply();

create view public.stock_levels
with (security_invoker = true)
as
select
  i.id as item_id,
  i.org_id,
  i.name,
  i.unit,
  i.kind,
  i.supplier_id,
  i.low_level,
  i.never_in_recipe,
  i.is_active,
  coalesce(sum(m.quantity), 0)::bigint as on_hand,
  i.sell_price_minor,
  i.sell_tax_rate_bp,
  i.hsn_code
from public.stock_items i
left join public.stock_moves m on m.org_id = i.org_id and m.item_id = i.id
group by i.id;

comment on view public.stock_levels is 'Each item with what is in stock now: the sum of its movements. With its price over the counter when it is for sale (M62).';

-- Buying something in, with what it cost and, if asked, as an expense too,
-- in one step. Runs as the caller: row level security lets only owners and
-- managers record a purchase, its cost and an expense.
create function public.record_purchase(
  p_org uuid, p_item uuid, p_quantity bigint, p_cost_minor bigint, p_on date,
  p_supplier uuid default null, p_use_by date default null, p_bill_number text default null,
  p_bill_path text default null, p_expense_category text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_move uuid;
  v_expense uuid;
  v_item public.stock_items;
  v_supplier text;
begin
  if p_org not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB131: only an owner or manager records what was bought' using errcode = '42501';
  end if;
  select * into v_item from public.stock_items i where i.org_id = p_org and i.id = p_item;
  if v_item.id is null then
    raise exception 'WB003: that item was not found' using errcode = 'P0002';
  end if;
  insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, supplier_id, use_by)
  values (p_org, p_item, 'purchase', p_quantity, p_on, coalesce(p_supplier, v_item.supplier_id), p_use_by)
  returning id into v_move;
  if p_expense_category is not null and p_cost_minor > 0 then
    select s.name into v_supplier from public.suppliers s where s.org_id = p_org and s.id = coalesce(p_supplier, v_item.supplier_id);
    insert into public.expenses (org_id, spent_on, category, vendor, description, amount_minor, receipt_path)
    values (p_org, p_on, p_expense_category, v_supplier, left(v_item.name || coalesce(', bill ' || p_bill_number, ''), 500), p_cost_minor, p_bill_path)
    returning id into v_expense;
  end if;
  insert into public.stock_costs (org_id, move_id, cost_minor, bill_number, bill_path, expense_id)
  values (p_org, v_move, p_cost_minor, p_bill_number, p_bill_path, v_expense);
  return v_move;
end;
$$;
comment on function public.record_purchase(uuid, uuid, bigint, bigint, date, uuid, date, text, text, text) is
  'Records stock bought in with its cost, bill number and bill photo, and, when an expense category is given, the same money as an expense (E4), all in one step. Owners and managers only (WB131).';

-- ---------------------------------------------------------------------------
-- Recipes (M27)
-- ---------------------------------------------------------------------------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  rotation_position smallint check (rotation_position is null or rotation_position between 1 and 50),
  use_by_days smallint not null default 3 check (use_by_days between 1 and 60),
  storage_note text check (storage_note is null or char_length(storage_note) <= 200),
  is_retired boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name),
  -- A retired recipe is out of the rotation.
  constraint recipes_retired_out_of_rotation check (not is_retired or rotation_position is null)
);

comment on table public.recipes is
  'A recipe the kitchen cooks. What goes in it is in its versions; the newest version is the one cooked. Retired, never deleted, once cooked.';
comment on column public.recipes.rotation_position is
  'Its place in the rotation: each delivery of a subscription takes the next recipe in order, and the rotation repeats (four recipes and two deliveries a week repeat every two weeks). Empty: not in the rotation.';
comment on column public.recipes.use_by_days is 'How many days after cooking a pack of it may be eaten. A batch''s use-by date is its cooking day plus this.';
comment on column public.recipes.storage_note is 'How to store it, printed on every label ("Keep in the fridge. Use within 3 days.").';
comment on column public.recipes.is_retired is 'True once the kennel stops cooking it. Its versions and batches stay.';

create unique index recipes_one_per_rotation_place on public.recipes (org_id, rotation_position) where rotation_position is not null;
comment on index public.recipes_one_per_rotation_place is 'One recipe at each place in the rotation.';

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  recipe_id uuid not null,
  version integer not null check (version >= 1),
  good_for text check (good_for is null or char_length(good_for) <= 500),
  cooked_yield_bp integer check (cooked_yield_bp is null or cooked_yield_bp between 1000 and 20000),
  kcal_per_kg integer check (kcal_per_kg is null or kcal_per_kg between 0 and 10000),
  protein_g_per_kg integer check (protein_g_per_kg is null or protein_g_per_kg between 0 and 1000),
  signed_off_by text check (signed_off_by is null or char_length(signed_off_by) <= 120),
  signed_off_on date,
  lab_tested_on date,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, recipe_id, version),
  foreign key (org_id, recipe_id) references public.recipes (org_id, id) on delete cascade
);

comment on table public.recipe_versions is
  'What a recipe was at one time. Never changed: changing a recipe makes a new version, and batches and deliveries keep the version they were made from.';
comment on column public.recipe_versions.version is 'Counts up from 1 for each recipe.';
comment on column public.recipe_versions.good_for is 'What it is good for, in words parents read ("light on the stomach, for older dogs").';
comment on column public.recipe_versions.cooked_yield_bp is 'Cooked weight as a share of the raw ingredients'' weight, in basis points: 8500 means 1 kg raw cooks down to 850 g.';
comment on column public.recipe_versions.kcal_per_kg is 'Energy in a kilo of the cooked food, in kilocalories.';
comment on column public.recipe_versions.protein_g_per_kg is 'Protein in a kilo of the cooked food, in grams.';
comment on column public.recipe_versions.signed_off_by is 'The veterinary nutritionist who signed this version off.';
comment on column public.recipe_versions.signed_off_on is 'When it was signed off.';
comment on column public.recipe_versions.lab_tested_on is 'When food of this recipe was last tested by a laboratory.';

create trigger recipe_versions_stamp_actor
  before insert on public.recipe_versions
  for each row execute function public.stamp_actor('created_by');

create table public.recipe_ingredients (
  org_id uuid not null references public.organizations (id) on delete cascade,
  version_id uuid not null,
  item_id uuid not null,
  quantity_per_kg bigint not null check (quantity_per_kg between 1 and 10000000),
  primary key (org_id, version_id, item_id),
  foreign key (org_id, version_id) references public.recipe_versions (org_id, id) on delete cascade,
  foreign key (org_id, item_id) references public.stock_items (org_id, id) on delete restrict
);

comment on table public.recipe_ingredients is 'What goes into a version of a recipe: each stock item, raw, per kilo of cooked food.';
comment on column public.recipe_ingredients.quantity_per_kg is 'How much of the item, in its own unit (grams, millilitres or pieces), goes into one kilo of cooked food.';

-- A version's ingredients are written with it, in the same step, and never
-- after; and nothing a dog must never eat goes in.
create function public.recipe_ingredients_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
begin
  if not exists (
    select 1 from public.recipe_versions v where v.org_id = new.org_id and v.id = new.version_id and v.created_at = now()
  ) then
    raise exception 'WB141: a recipe version never changes. Make a new version instead.' using errcode = '23514';
  end if;
  select i.name into v_name from public.stock_items i where i.org_id = new.org_id and i.id = new.item_id and i.never_in_recipe;
  if v_name is not null then
    raise exception 'WB140: % must never be in a recipe', v_name using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.recipe_ingredients_check() is
  'Trigger: ingredients go into a version only as it is made (WB141), and never an item marked never_in_recipe (WB140).';

create trigger recipe_ingredients_check
  before insert on public.recipe_ingredients
  for each row execute function public.recipe_ingredients_check();

-- An item cannot be marked "never in a recipe" while a recipe still in use
-- has it in its newest version.
create function public.stock_items_check_never()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.never_in_recipe and not old.never_in_recipe and exists (
    select 1
    from public.recipe_ingredients ri
    join public.recipe_versions v on v.org_id = ri.org_id and v.id = ri.version_id
    join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
    where ri.org_id = new.org_id and ri.item_id = new.id and not r.is_retired
      and v.version = (select max(v2.version) from public.recipe_versions v2 where v2.org_id = v.org_id and v2.recipe_id = v.recipe_id)
  ) then
    raise exception 'WB140: % must never be in a recipe, and a recipe uses it. Make a new version without it first.', new.name using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.stock_items_check_never() is
  'Trigger: an item is marked never_in_recipe only once no recipe in use has it in its newest version (WB140).';

create trigger stock_items_check_never
  before update of never_in_recipe on public.stock_items
  for each row execute function public.stock_items_check_never();

-- A new version of a recipe, with its ingredients, in one step. Runs as the
-- caller: row level security lets only owners and managers write recipes.
create function public.save_recipe_version(p_recipe uuid, p_details jsonb, p_ingredients jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_recipe public.recipes;
  v_version uuid;
begin
  select * into v_recipe from public.recipes r where r.id = p_recipe for update;
  if v_recipe.id is null or v_recipe.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB142: only an owner or manager changes a recipe' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ingredients) is distinct from 'array' or jsonb_array_length(p_ingredients) = 0 then
    raise exception 'WB143: a recipe needs at least one ingredient' using errcode = '23514';
  end if;
  insert into public.recipe_versions (org_id, recipe_id, version, good_for, cooked_yield_bp, kcal_per_kg, protein_g_per_kg,
                                      signed_off_by, signed_off_on, lab_tested_on)
  values (
    v_recipe.org_id, v_recipe.id,
    coalesce((select max(v.version) from public.recipe_versions v where v.org_id = v_recipe.org_id and v.recipe_id = v_recipe.id), 0) + 1,
    nullif(btrim(p_details ->> 'good_for'), ''),
    (p_details ->> 'cooked_yield_bp')::integer,
    (p_details ->> 'kcal_per_kg')::integer,
    (p_details ->> 'protein_g_per_kg')::integer,
    nullif(btrim(p_details ->> 'signed_off_by'), ''),
    (p_details ->> 'signed_off_on')::date,
    (p_details ->> 'lab_tested_on')::date
  )
  returning id into v_version;
  insert into public.recipe_ingredients (org_id, version_id, item_id, quantity_per_kg)
  select v_recipe.org_id, v_version, (x ->> 'item_id')::uuid, (x ->> 'quantity_per_kg')::bigint
  from jsonb_array_elements(p_ingredients) x;
  return v_version;
end;
$$;
comment on function public.save_recipe_version(uuid, jsonb, jsonb) is
  'Makes the next version of a recipe with its ingredients ([{item_id, quantity_per_kg}]) and its details, in one step. Owners and managers only (WB142); at least one ingredient (WB143).';

-- A recipe that has been cooked is retired, never deleted.
create function public.recipes_guard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.batches b where b.org_id = old.org_id and b.recipe_id = old.id)
     and exists (select 1 from public.organizations o where o.id = old.org_id) then
    raise exception 'WB144: this recipe has been cooked. Retire it instead.' using errcode = '23514';
  end if;
  return old;
end;
$$;
comment on function public.recipes_guard_delete() is 'Trigger: a recipe that has been cooked is retired, never deleted (WB144).';

create trigger recipes_guard_delete
  before delete on public.recipes
  for each row execute function public.recipes_guard_delete();

-- The newest version of each recipe.
create view public.recipe_current
with (security_invoker = true)
as
select distinct on (v.org_id, v.recipe_id)
  v.recipe_id, v.org_id, v.id as version_id, v.version, r.name, r.rotation_position, r.is_retired, r.use_by_days
from public.recipe_versions v
join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
order by v.org_id, v.recipe_id, v.version desc;

comment on view public.recipe_current is 'Each recipe''s newest version: the one cooked from now on.';

-- What a kilo of a version costs, from the latest purchase price of each
-- ingredient on or before a day. Null when an ingredient has never been
-- bought with a price. Owners and managers only, as costs are.
create function public.recipe_cost_per_kg(p_org uuid, p_version uuid, p_on date default null)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_missing boolean;
  v_cost numeric;
begin
  if p_org not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB145: costs are for owners and managers' using errcode = '42501';
  end if;
  select bool_or(p.unit_cost is null), sum(ri.quantity_per_kg * p.unit_cost)
  into v_missing, v_cost
  from public.recipe_ingredients ri
  left join lateral (
    select c.cost_minor::numeric / m.quantity as unit_cost
    from public.stock_moves m
    join public.stock_costs c on c.org_id = m.org_id and c.move_id = m.id
    where m.org_id = ri.org_id and m.item_id = ri.item_id and m.kind = 'purchase'
      and (p_on is null or m.happened_on <= p_on)
    order by m.happened_on desc, m.created_at desc
    limit 1
  ) p on true
  where ri.org_id = p_org and ri.version_id = p_version;
  if v_missing is null or v_missing then
    return null;
  end if;
  return round(v_cost)::bigint;
end;
$$;
comment on function public.recipe_cost_per_kg(uuid, uuid, date) is
  'What a kilo of a recipe version costs to make, in minor units, from each ingredient''s latest purchase price on or before p_on (any day when empty). Null when an ingredient has no price yet. Owners and managers only (WB145).';

-- ---------------------------------------------------------------------------
-- Food the kennel sells, and what each pet eats (M28)
-- ---------------------------------------------------------------------------

create type public.food_product_kind as enum ('trial', 'subscription', 'by_kilo', 'item');
comment on type public.food_product_kind is
  'trial: a fixed amount at a fixed price, once per pet. subscription: food delivered on set days, priced per kilo. by_kilo: a one-off order priced per kilo. item: made to order, priced per piece (a birthday cake).';

create type public.food_plan as enum ('full', 'topper');
comment on type public.food_plan is 'full: all of a dog''s food. topper: a share of the day''s food on top of what it already eats (a third by default).';

create type public.food_goal as enum ('lose', 'keep', 'gain');
comment on type public.food_goal is 'Whether a dog should lose weight, keep it, or gain. Changes the portion by organizations.goal_change_bp.';

create type public.boarder_food as enum ('kitchen', 'kibble', 'own');
comment on type public.boarder_food is
  'What a pet eats while boarding: kitchen (fresh food from the kennel''s kitchen, the default), kibble (a dry food the parent names, which the kennel feeds), own (food the parent sends).';

create table public.food_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind public.food_product_kind not null,
  name text not null check (char_length(name) between 1 and 80),
  price_minor bigint not null check (price_minor >= 0),
  trial_grams integer check (trial_grams is null or trial_grams between 10 and 20000),
  tax_rate_bp integer check (tax_rate_bp is null or tax_rate_bp between 0 and 10000),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  constraint food_products_trial_has_grams check ((kind = 'trial') = (trial_grams is not null) and (trial_grams is null or trial_grams % 10 = 0))
);

comment on table public.food_products is 'Food in the rate card: a trial, subscription food and one-off food by the kilo, and made-to-order items.';
comment on column public.food_products.price_minor is 'Per kilo for subscription and by_kilo food; the whole price for a trial; per piece for an item.';
comment on column public.food_products.trial_grams is 'Trials only: how much food the trial is, in grams.';
comment on column public.food_products.tax_rate_bp is 'Tax rate in basis points. Empty: the kennel''s usual rate. Pet food is goods: ask the accountant (06, question 13).';
comment on column public.food_products.sac_code is 'The HSN code printed on tax invoices for it, 4 to 8 digits.';
comment on column public.food_products.is_active is 'False once it is no longer sold. Deliveries already made keep their price.';

create trigger food_products_set_updated_at
  before update on public.food_products
  for each row execute function public.set_updated_at();

create table public.pet_food (
  org_id uuid not null references public.organizations (id) on delete cascade,
  pet_id uuid not null,
  plan public.food_plan not null default 'full',
  goal public.food_goal not null default 'keep',
  grams_by_hand integer check (grams_by_hand is null or grams_by_hand between 10 and 5000),
  by_hand_note text check (by_hand_note is null or char_length(by_hand_note) <= 300),
  boarder_food public.boarder_food not null default 'kitchen',
  kibble_brand text check (kibble_brand is null or char_length(kibble_brand) <= 80),
  kibble_g_per_day integer check (kibble_g_per_day is null or kibble_g_per_day between 10 and 5000),
  avoid text check (avoid is null or char_length(avoid) <= 300),
  started_on date,
  reviewed_on date,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, pet_id),
  foreign key (org_id, pet_id) references public.pets (org_id, id) on delete cascade,
  constraint pet_food_by_hand_has_note check (grams_by_hand is null or by_hand_note is not null),
  constraint pet_food_kibble_named check (boarder_food <> 'kibble' or kibble_brand is not null)
);

comment on table public.pet_food is
  'What a pet eats: its plan and goal for the kitchen''s food, grams set by hand if a manager chose to, what it eats while boarding, and foods to avoid. No row: kitchen food, a full meal, keep its weight.';
comment on column public.pet_food.grams_by_hand is
  'Grams a day set by an owner or manager instead of the worked-out portion, with a note saying why. Empty: worked out from the latest weight (portionGrams in src/lib/core/food.ts).';
comment on column public.pet_food.by_hand_note is 'Why the grams were set by hand.';
comment on column public.pet_food.boarder_food is 'What the pet eats while boarding. The care round and the cook plan follow it.';
comment on column public.pet_food.kibble_brand is 'With kibble: the brand and kind the parent named.';
comment on column public.pet_food.kibble_g_per_day is 'With kibble: grams a day.';
comment on column public.pet_food.avoid is 'Foods to avoid for this pet, in plain words ("chicken: itchy skin").';
comment on column public.pet_food.started_on is 'When the pet started on the kitchen''s food. Today asks for its portion to be looked at a week later.';
comment on column public.pet_food.reviewed_on is 'When its portion was last looked at.';

create trigger pet_food_set_updated_at
  before update on public.pet_food
  for each row execute function public.set_updated_at();

create trigger pet_food_stamp_actor
  before insert or update on public.pet_food
  for each row execute function public.stamp_actor('updated_by');

-- Only an owner or manager sets a portion by hand (the same rule as a price, D15).
create function public.pet_food_guard_grams()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.grams_by_hand is not null
      or tg_op = 'UPDATE' and (new.grams_by_hand is distinct from old.grams_by_hand or new.by_hand_note is distinct from old.by_hand_note))
     and new.org_id not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB146: only an owner or manager sets a portion by hand' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function public.pet_food_guard_grams() is 'Trigger: only owners and managers set or change a portion by hand (WB146).';

create trigger pet_food_guard_grams
  before insert or update on public.pet_food
  for each row execute function public.pet_food_guard_grams();

-- ---------------------------------------------------------------------------
-- Subscriptions, deliveries and one-off orders (M29)
-- ---------------------------------------------------------------------------

-- delivery_slot is made in 00046 (trips use it too).

create type public.pay_period as enum ('week', 'month');
comment on type public.pay_period is 'How a subscription is paid: a week ahead, or a month ahead (with the kennel''s monthly discount).';

create type public.customer_source as enum ('boarding', 'referral', 'website', 'other');
comment on type public.customer_source is 'Where a food customer came from: a boarding parent, a referral, the website order page, or elsewhere.';

create type public.delivery_kind as enum ('subscription', 'trial', 'order', 'item', 'replacement');
comment on type public.delivery_kind is
  'subscription: made from a subscription. trial: a trial, once per pet. order: food by the kilo, once. item: a made-to-order item. replacement: a delivery made again at no charge after a problem.';

create type public.delivery_status as enum ('planned', 'packed', 'out', 'delivered', 'not_home', 'refused', 'cancelled');
comment on type public.delivery_status is
  'planned: to be cooked and packed. packed: packed from a batch. out: with the rider. delivered, not_home, refused: what happened at the door. cancelled: not going, with a reason.';

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  pet_id uuid not null,
  product_id uuid not null,
  plan public.food_plan not null default 'full',
  grams_per_day integer not null check (grams_per_day between 10 and 5000),
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  slot public.delivery_slot not null default 'morning',
  address_id uuid,
  starts_on date not null,
  pay_period public.pay_period not null default 'week',
  source public.customer_source not null default 'other',
  paused_from date,
  paused_until date,
  cancelled_on date,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, client_id, pet_id) references public.pets (org_id, client_id, id) on update cascade on delete restrict,
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete restrict,
  foreign key (org_id, product_id) references public.food_products (org_id, id) on delete restrict,
  foreign key (org_id, address_id) references public.client_addresses (org_id, id) on delete set null (address_id),
  constraint subscriptions_pause_in_order check (paused_until is null or (paused_from is not null and paused_until >= paused_from)),
  constraint subscriptions_cancel_has_reason check ((cancelled_on is null) = (cancel_reason is null))
);

comment on table public.subscriptions is
  'Food delivered to a pet at home on set weekdays (two a week by default), paid a week or a month ahead. Deliveries are made ahead from it (plan_subscription).';
comment on column public.subscriptions.product_id is 'The subscription food in the rate card. Its price per kilo is copied onto each delivery when it is made.';
comment on column public.subscriptions.grams_per_day is 'Grams of food a day, from the portion worked out for the pet or set by hand.';
comment on column public.subscriptions.weekdays is 'Delivery days, 1 Monday to 7 Sunday. Each delivery covers the days until the next.';
comment on column public.subscriptions.address_id is 'Where it is delivered. Empty: collected at the kennel.';
comment on column public.subscriptions.starts_on is 'The first day a delivery may fall on.';
comment on column public.subscriptions.source is 'Where the customer came from, for the food reports.';
comment on column public.subscriptions.paused_from is 'Paused from this day. Empty: not paused.';
comment on column public.subscriptions.paused_until is 'Paused up to and including this day. Empty with paused_from set: paused until resumed.';
comment on column public.subscriptions.cancelled_on is 'No deliveries from this day on.';

create index subscriptions_org_client_idx on public.subscriptions (org_id, client_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create trigger subscriptions_stamp_actor
  before insert or update on public.subscriptions
  for each row execute function public.stamp_actor('created_by');

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  number text not null check (char_length(number) <= 20),
  recipe_id uuid not null,
  version_id uuid not null,
  cooked_on date not null,
  grams integer not null check (grams between 100 and 1000000),
  packs integer not null check (packs between 0 and 10000),
  use_by date not null,
  cook_id uuid references auth.users (id) on delete set null,
  boarders_on date,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, number),
  foreign key (org_id, recipe_id) references public.recipes (org_id, id) on delete restrict,
  foreign key (org_id, version_id) references public.recipe_versions (org_id, id) on delete restrict
);

comment on table public.batches is
  'Food cooked at one time from one recipe version. Recording it takes its ingredients out of stock (record_batch). Its number is on every label, so "who got batch N" can be answered (batch_recipients).';
comment on column public.batches.number is 'Printed on labels: the cooking day and a count, e.g. 270314-2 for the second batch on 14 March 2027.';
comment on column public.batches.grams is 'Cooked weight of the batch, in grams.';
comment on column public.batches.packs is 'How many packs it was packed into.';
comment on column public.batches.use_by is 'The day after which it must not be eaten: cooked_on plus the recipe''s use_by_days.';
comment on column public.batches.cook_id is 'Who cooked it.';
comment on column public.batches.boarders_on is 'The day the boarders on the kitchen''s food ate from it, when they did.';

create index batches_org_cooked_idx on public.batches (org_id, cooked_on desc);

alter table public.stock_moves
  add constraint stock_moves_batch_fkey foreign key (org_id, batch_id) references public.batches (org_id, id) on delete restrict;

create table public.delivery_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  run_date date not null,
  slot public.delivery_slot not null,
  rider_id uuid not null references auth.users (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, run_date, slot, rider_id)
);

comment on table public.delivery_runs is 'One rider''s deliveries for one slot of one day, in order (deliveries.run_position). The rider sees this and nothing else (D45).';
comment on column public.delivery_runs.rider_id is 'Who rides it: a member of the kennel, usually with the rider role.';

create trigger delivery_runs_stamp_actor
  before insert or update on public.delivery_runs
  for each row execute function public.stamp_actor('created_by');

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind public.delivery_kind not null,
  client_id uuid not null,
  pet_id uuid not null,
  subscription_id uuid,
  product_id uuid,
  delivery_date date not null,
  slot public.delivery_slot not null default 'morning',
  address_id uuid,
  covers_days smallint check (covers_days is null or covers_days between 1 and 7),
  grams integer not null default 0 check (grams >= 0 and grams % 10 = 0),
  packs integer not null default 0 check (packs >= 0),
  quantity integer not null default 1 check (quantity between 1 and 100),
  recipe_id uuid,
  version_id uuid,
  unit_price_minor bigint not null default 0 check (unit_price_minor >= 0),
  price_minor bigint not null default 0 check (price_minor >= 0),
  delivery_charge_minor bigint not null default 0 check (delivery_charge_minor >= 0),
  tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9]{4,8}$'),
  status public.delivery_status not null default 'planned',
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  superseded boolean not null default false,
  batch_id uuid,
  packed_at timestamptz,
  packed_by uuid references auth.users (id) on delete set null,
  run_id uuid,
  run_position smallint,
  delivered_at timestamptz,
  proof_path text,
  replaces_id uuid,
  appointment_id uuid,
  inscription text check (inscription is null or char_length(inscription) between 1 and 60),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, client_id, pet_id) references public.pets (org_id, client_id, id) on update cascade on delete restrict,
  foreign key (org_id, client_id) references public.clients (org_id, id) on delete restrict,
  foreign key (org_id, subscription_id) references public.subscriptions (org_id, id) on delete restrict,
  foreign key (org_id, product_id) references public.food_products (org_id, id) on delete restrict,
  foreign key (org_id, address_id) references public.client_addresses (org_id, id) on delete set null (address_id),
  foreign key (org_id, recipe_id) references public.recipes (org_id, id) on delete restrict,
  foreign key (org_id, version_id) references public.recipe_versions (org_id, id) on delete restrict,
  foreign key (org_id, batch_id) references public.batches (org_id, id) on delete restrict,
  foreign key (org_id, run_id) references public.delivery_runs (org_id, id) on delete set null (run_id),
  foreign key (org_id, replaces_id) references public.deliveries (org_id, id) on delete restrict,
  foreign key (org_id, appointment_id) references public.appointments (org_id, id) on delete set null (appointment_id),
  constraint deliveries_subscription_kind check ((kind = 'subscription') = (subscription_id is not null)),
  constraint deliveries_product_unless_replacement check (kind = 'replacement' or product_id is not null),
  constraint deliveries_replacement_names_original check ((kind = 'replacement') = (replaces_id is not null)),
  constraint deliveries_cancel_has_reason check ((status = 'cancelled') = (cancel_reason is not null)),
  constraint deliveries_packed_from_batch check (status not in ('packed', 'out', 'delivered', 'not_home', 'refused') or batch_id is not null or kind = 'item')
);

comment on table public.deliveries is
  'Food going to a pet''s home on a day: made ahead from a subscription, or a one-off trial, order or item, or a replacement. Grams, recipe and price are copied on when it is made, so a later change to the rate card or the rotation never changes it.';
comment on column public.deliveries.covers_days is 'Subscriptions: how many days of food it is, until the next delivery.';
comment on column public.deliveries.grams is 'Food in grams: whole packs (organizations.food_pack_g). 0 for an item.';
comment on column public.deliveries.packs is 'How many packs.';
comment on column public.deliveries.quantity is 'Items only: how many pieces.';
comment on column public.deliveries.recipe_id is 'The recipe it is cooked from: the rotation''s for a subscription, chosen for a trial or order. Empty for an item.';
comment on column public.deliveries.version_id is 'The recipe version current when it was made.';
comment on column public.deliveries.unit_price_minor is 'Per kilo (subscription, order), the whole trial, or per piece (item), copied from the rate card when made. 0 for a replacement.';
comment on column public.deliveries.price_minor is 'What the food comes to, worked out by the database from the grams or pieces and the unit price.';
comment on column public.deliveries.delivery_charge_minor is 'The area''s delivery charge, copied when made from the address''s PIN code.';
comment on column public.deliveries.tax_rate_bp is 'Tax rate copied from the rate card when made, in basis points.';
comment on column public.deliveries.superseded is 'True when it was cancelled because its subscription changed and a new delivery was made in its place.';
comment on column public.deliveries.batch_id is 'The batch it was packed from: of its own recipe, within its use-by date.';
comment on column public.deliveries.run_id is 'The rider''s run it goes out on (M31).';
comment on column public.deliveries.run_position is 'Its place in the run; staff change the order.';
comment on column public.deliveries.delivered_at is 'When it was handed over, or found nobody home, or refused.';
comment on column public.deliveries.proof_path is 'Photo taken at the door, under {org_id}/deliveries/{delivery_id}/.';
comment on column public.deliveries.replaces_id is 'For a replacement: the delivery it replaces.';
comment on column public.deliveries.appointment_id is 'For a made-to-order item for a party (M36): the party it is for.';
comment on column public.deliveries.inscription is 'For a made-to-order item: the name or words to write on it ("Happy birthday Biscuit").';
comment on column public.deliveries.note is 'For the kitchen or the rider ("no carrots this time").';

-- One delivery per subscription per day; a trial once per pet.
create unique index deliveries_one_per_subscription_day on public.deliveries (org_id, subscription_id, delivery_date)
  where subscription_id is not null and status <> 'cancelled';
comment on index public.deliveries_one_per_subscription_day is 'A subscription has at most one delivery on a day.';
create unique index deliveries_one_trial_per_pet on public.deliveries (org_id, pet_id)
  where kind = 'trial' and status <> 'cancelled';
comment on index public.deliveries_one_trial_per_pet is 'A pet has the trial once.';
create index deliveries_org_date_idx on public.deliveries (org_id, delivery_date, slot);
create index deliveries_org_run_idx on public.deliveries (org_id, run_id, run_position);

create trigger deliveries_set_updated_at
  before update on public.deliveries
  for each row execute function public.set_updated_at();

create trigger deliveries_stamp_actor
  before insert or update on public.deliveries
  for each row execute function public.stamp_actor('created_by');

create trigger deliveries_stamp_packed
  before insert or update of packed_at on public.deliveries
  for each row execute function public.stamp_when_set('packed_at', 'packed_by');

alter table public.invoices
  add constraint invoices_subscription_fkey foreign key (org_id, subscription_id) references public.subscriptions (org_id, id) on delete restrict,
  add constraint invoices_delivery_fkey foreign key (org_id, delivery_id) references public.deliveries (org_id, id) on delete restrict;

create unique index invoices_one_live_per_subscription_period on public.invoices (org_id, subscription_id, period_start)
  where subscription_id is not null and status <> 'void';
comment on index public.invoices_one_live_per_subscription_period is 'A period of a subscription has at most one draft or issued bill.';
create unique index invoices_one_live_per_delivery on public.invoices (org_id, delivery_id)
  where delivery_id is not null and status <> 'void';
comment on index public.invoices_one_live_per_delivery is 'A one-off order has at most one draft or issued bill.';

-- When the changes to a delivery close: food_cutoff_hours before its slot starts.
create function public.delivery_cutoff(p_org uuid, p_date date, p_slot public.delivery_slot)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_date + case p_slot when 'morning' then time '08:00' when 'afternoon' then time '13:00' else time '18:00' end)
          at time zone o.time_zone) - make_interval(hours => o.food_cutoff_hours)
  from public.organizations o
  where o.id = p_org;
$$;
comment on function public.delivery_cutoff(uuid, date, public.delivery_slot) is
  'When changes to a delivery close: the start of its slot (8:00, 13:00 or 18:00 kennel time) less the kennel''s food_cutoff_hours. Must match deliveryCutoff() in src/lib/core/food.ts.';

-- A delivery's price, tax and charge come from the rate card and the area
-- when it is made, worked out here so nobody types a price. Only an owner or
-- manager may give a different unit price (as with stays, D15).
create function public.deliveries_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product public.food_products;
  v_org public.organizations;
  v_manager boolean;
begin
  v_manager := new.org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]));
  select * into v_org from public.organizations o where o.id = new.org_id;
  -- Staff never change a delivery's kind (a replacement costs nothing), its
  -- delivery charge (from the area) or its tax (from the rate card) by hand:
  -- each would change the bill.
  if tg_op = 'UPDATE' and not v_manager
     and (new.kind, new.delivery_charge_minor, new.tax_rate_bp) is distinct from (old.kind, old.delivery_charge_minor, old.tax_rate_bp) then
    raise exception 'WB022: only an owner or manager can change a price' using errcode = '42501';
  end if;
  if new.kind = 'replacement' then
    new.unit_price_minor := 0;
    new.delivery_charge_minor := 0;
    if tg_op = 'INSERT' then
      -- A replacement is the original made again: same food, same tax.
      select d.product_id, d.tax_rate_bp, d.sac_code into new.product_id, new.tax_rate_bp, new.sac_code
      from public.deliveries d where d.org_id = new.org_id and d.id = new.replaces_id;
    end if;
  else
    select * into v_product from public.food_products p where p.org_id = new.org_id and p.id = new.product_id;
    if (new.kind = 'subscription' and v_product.kind <> 'subscription')
       or (new.kind = 'trial' and v_product.kind <> 'trial')
       or (new.kind = 'order' and v_product.kind not in ('by_kilo', 'subscription'))
       or (new.kind = 'item' and v_product.kind <> 'item') then
      raise exception 'WB150: that food is not sold that way' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' or new.product_id is distinct from old.product_id then
      if not v_manager or new.unit_price_minor = 0 or tg_op = 'UPDATE' then
        new.unit_price_minor := v_product.price_minor;
      end if;
      new.tax_rate_bp := case when v_org.tax_mode = 'none' then 0 else coalesce(v_product.tax_rate_bp, v_org.default_tax_rate_bp) end;
      new.sac_code := v_product.sac_code;
    elsif new.unit_price_minor is distinct from old.unit_price_minor and not v_manager then
      raise exception 'WB022: only an owner or manager can change a price' using errcode = '42501';
    end if;
    if new.kind = 'trial' then
      new.grams := v_product.trial_grams;
      new.quantity := 1;
    end if;
  end if;
  -- A made-to-order item needs its notice (M36): its slot no sooner than the kennel's lead time.
  if tg_op = 'INSERT' and new.kind = 'item'
     and ((new.delivery_date + case new.slot when 'morning' then time '08:00' when 'afternoon' then time '13:00' else time '18:00' end)
          at time zone v_org.time_zone) < now() + make_interval(hours => v_org.item_lead_hours) then
    raise exception 'WB156: a made-to-order item needs % hours'' notice. Choose a later day.', v_org.item_lead_hours using errcode = '23514';
  end if;
  if new.kind = 'item' then
    new.grams := 0;
    new.packs := 0;
    new.price_minor := new.unit_price_minor * new.quantity;
  else
    new.quantity := 1;
    new.packs := ceil(new.grams::numeric / v_org.food_pack_g)::integer;
    new.price_minor := case when new.kind = 'trial' then new.unit_price_minor else round(new.grams * new.unit_price_minor / 1000.0)::bigint end;
  end if;
  -- An address that went (erasing a parent deletes their addresses, D25) leaves the charge as it was, as a trip keeps its price.
  if new.kind <> 'replacement' and (tg_op = 'INSERT' or (new.address_id is distinct from old.address_id and new.address_id is not null)) then
    new.delivery_charge_minor := coalesce((
      select sa.delivery_charge_minor
      from public.client_addresses a
      join public.service_areas sa on sa.org_id = a.org_id and sa.postal_code = a.postal_code
      where a.org_id = new.org_id and a.id = new.address_id
    ), 0);
  end if;
  return new;
end;
$$;
comment on function public.deliveries_price() is
  'Trigger: a delivery''s unit price, tax rate and code are copied from the rate card when it is made (WB150 when the food is not sold that way), its packs and price worked out from its grams, and its delivery charge copied from the area of its address (kept when the address is deleted). Only owners and managers give another unit price, kind, delivery charge or tax rate (WB022), and a price typed by hand is worked out again. A replacement costs nothing. A made-to-order item is refused sooner than the kennel''s lead time (WB156).';

create trigger deliveries_price
  before insert or update of kind, product_id, grams, quantity, unit_price_minor, price_minor, delivery_charge_minor, tax_rate_bp, address_id
  on public.deliveries
  for each row execute function public.deliveries_price();

-- After the cut-off a delivery is being cooked: staff only move it along
-- (packed, out, at the door) and a manager may cancel it with a reason.
-- A delivery on a bill is cancelled, never deleted.
create function public.deliveries_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_closed boolean;
  v_manager boolean;
  v_moving text[] := array['status', 'batch_id', 'packed_at', 'packed_by', 'run_id', 'run_position', 'delivered_at', 'proof_path',
                           'cancel_reason', 'cancelled_at', 'cancelled_by', 'superseded', 'note', 'updated_at'];
begin
  if not exists (select 1 from public.organizations o where o.id = old.org_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Merging two parents moves every delivery to the parent who stays.
  if coalesce(current_setting('wagbook.merging', true), '') = 'on' then
    v_moving := array_append(v_moving, 'client_id');
  end if;
  -- Erasing a parent deletes their addresses, past deliveries' included (D25).
  if tg_op = 'UPDATE' and new.address_id is null and old.address_id is not null then
    v_moving := array_append(v_moving, 'address_id');
  end if;
  v_closed := now() >= public.delivery_cutoff(old.org_id, old.delivery_date, old.slot);
  v_manager := old.org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]));
  if tg_op = 'DELETE' then
    if exists (select 1 from public.invoices i where i.org_id = old.org_id and i.status <> 'void'
               and (i.delivery_id = old.id
                    or (i.subscription_id = old.subscription_id and old.delivery_date between i.period_start and i.period_end))) then
      raise exception 'WB152: this delivery is on a bill. Cancel it instead.' using errcode = '23514';
    end if;
    if v_closed and old.status <> 'cancelled' then
      raise exception 'WB151: this delivery is past its cut-off and is being cooked. A manager can cancel it with a reason.' using errcode = '23514';
    end if;
    return old;
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'WB153: a cancelled delivery stays cancelled. Make a new one.' using errcode = '23514';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := now();
    new.cancelled_by := (select auth.uid());
    if v_closed and not v_manager and not new.superseded then
      raise exception 'WB151: this delivery is past its cut-off and is being cooked. A manager can cancel it with a reason.' using errcode = '42501';
    end if;
    if old.status in ('delivered', 'not_home', 'refused') then
      raise exception 'WB153: this delivery has been to the door. Report a problem instead.' using errcode = '23514';
    end if;
  else
    new.cancelled_at := old.cancelled_at;
    new.cancelled_by := old.cancelled_by;
  end if;
  if v_closed and (to_jsonb(new) - v_moving) <> (to_jsonb(old) - v_moving) then
    raise exception 'WB151: this delivery is past its cut-off and is being cooked. A manager can cancel it with a reason.' using errcode = '23514';
  end if;
  if new.status in ('delivered', 'not_home', 'refused') and old.status not in ('delivered', 'not_home', 'refused') then
    new.delivered_at := now();
  end if;
  return new;
end;
$$;
comment on function public.deliveries_guard() is
  'Trigger: after its cut-off (delivery_cutoff) a delivery only moves along: packed, out, at the door, or cancelled by an owner or manager (WB151), and loses its address when the parent is erased. A delivery on a bill is cancelled, never deleted (WB152). A cancelled one stays cancelled, and one that has been to the door is not cancelled (WB153).';

create trigger deliveries_guard
  before update or delete on public.deliveries
  for each row execute function public.deliveries_guard();

-- Packed only from a batch of its own recipe, cooked by the day it goes and
-- still within its use-by date.
create function public.deliveries_check_batch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_batch public.batches;
begin
  if new.batch_id is null or new.batch_id is not distinct from old.batch_id then
    return new;
  end if;
  select * into v_batch from public.batches b where b.org_id = new.org_id and b.id = new.batch_id;
  if v_batch.recipe_id is distinct from new.recipe_id then
    raise exception 'WB160: this delivery is not that batch''s recipe' using errcode = '23514';
  end if;
  if new.delivery_date < v_batch.cooked_on or new.delivery_date > v_batch.use_by then
    raise exception 'WB161: batch % is used by %, and this delivery goes on %', v_batch.number, v_batch.use_by, new.delivery_date using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.deliveries_check_batch() is
  'Trigger: a delivery is packed only from a batch of its own recipe (WB160), cooked on or before its day and within its use-by date (WB161).';

create trigger deliveries_check_batch
  before update of batch_id on public.deliveries
  for each row execute function public.deliveries_check_batch();

-- The recipe the rotation gives the n-th delivery of a subscription (0 the first).
create function public.rotation_recipe(p_org uuid, p_index integer)
returns uuid
language sql
stable
set search_path = ''
as $$
  select r.id
  from public.recipes r
  where r.org_id = p_org and r.rotation_position is not null and not r.is_retired
    and exists (select 1 from public.recipe_versions v where v.org_id = r.org_id and v.recipe_id = r.id)
  order by r.rotation_position
  offset (p_index % greatest((select count(*) from public.recipes r2
                              where r2.org_id = p_org and r2.rotation_position is not null and not r2.is_retired
                                and exists (select 1 from public.recipe_versions v where v.org_id = r2.org_id and v.recipe_id = r2.id)), 1))
  limit 1;
$$;
comment on function public.rotation_recipe(uuid, integer) is
  'The recipe at the n-th place of the rotation (0 the first), counting round again after the last. Recipes with no version yet are left out.';

-- Make a subscription's deliveries ahead, up to a day. Each covers the days
-- until its next delivery day, rounded up to whole packs; each takes the next
-- recipe of the rotation. Days already made, paused or after a cancellation
-- are skipped. Runs as the caller, so row level security applies.
create function public.plan_subscription(p_subscription uuid, p_until date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_org public.organizations;
  v_today date;
  v_day date;
  v_dow integer;
  v_covers integer;
  v_index integer;
  v_recipe uuid;
  v_made integer := 0;
begin
  select * into v_sub from public.subscriptions s where s.id = p_subscription;
  if v_sub.id is null then
    raise exception 'WB003: that subscription was not found' using errcode = 'P0002';
  end if;
  select * into v_org from public.organizations o where o.id = v_sub.org_id;
  v_today := (now() at time zone v_org.time_zone)::date;
  if p_until > v_today + 62 then
    p_until := v_today + 62;
  end if;
  -- One planner at a time per subscription.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('subscription:' || v_sub.id::text, 0));
  for v_day in select d::date from generate_series(greatest(v_sub.starts_on, v_today), p_until, interval '1 day') d loop
    v_dow := extract(isodow from v_day)::integer;
    continue when not (v_dow = any (v_sub.weekdays));
    continue when v_sub.cancelled_on is not null and v_day >= v_sub.cancelled_on;
    continue when v_sub.paused_from is not null and v_day >= v_sub.paused_from and (v_sub.paused_until is null or v_day <= v_sub.paused_until);
    continue when exists (
      select 1 from public.deliveries d
      where d.org_id = v_sub.org_id and d.subscription_id = v_sub.id and d.delivery_date = v_day and not d.superseded
    );
    -- Days until the next delivery day: 7 when it is the only one.
    select min(((w - v_dow + 6) % 7) + 1) into v_covers from unnest(v_sub.weekdays) w;
    select count(*) into v_index from public.deliveries d
    where d.org_id = v_sub.org_id and d.subscription_id = v_sub.id and d.status <> 'cancelled' and d.delivery_date < v_day;
    v_recipe := public.rotation_recipe(v_sub.org_id, v_index);
    insert into public.deliveries (org_id, kind, client_id, pet_id, subscription_id, product_id, delivery_date, slot, address_id,
                                   covers_days, grams, recipe_id, version_id)
    values (v_sub.org_id, 'subscription', v_sub.client_id, v_sub.pet_id, v_sub.id, v_sub.product_id, v_day, v_sub.slot, v_sub.address_id,
            v_covers,
            (ceil(v_sub.grams_per_day * v_covers / v_org.food_pack_g::numeric) * v_org.food_pack_g)::integer,
            v_recipe,
            (select c.version_id from public.recipe_current c where c.org_id = v_sub.org_id and c.recipe_id = v_recipe));
    v_made := v_made + 1;
  end loop;
  return v_made;
end;
$$;
comment on function public.plan_subscription(uuid, date) is
  'Makes a subscription''s deliveries from today (or its start) up to p_until (at most 62 days ahead): one on each of its weekdays that is not paused, cancelled or already made, covering the days until the next, in whole packs, with the rotation''s next recipe. Returns how many it made. Must match coversDays() and packedGrams() in src/lib/core/food.ts.';

-- Changing a subscription makes its deliveries again: those still open to
-- change are cancelled (kept, if a bill has them, so the bill can be credited)
-- or removed, and new ones are made in their place. Deliveries past the
-- cut-off are already being cooked and go as they are.
-- SECURITY DEFINER: the caller has already changed the subscription (row
-- level security let them), and removing the plan made from it is part of
-- that change, though only owners may delete a delivery by hand (D29). It
-- touches only that subscription's deliveries.
create function public.subscriptions_replan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until date;
begin
  if (new.grams_per_day, new.weekdays, new.slot, new.address_id, new.product_id, new.plan, new.paused_from, new.paused_until, new.cancelled_on)
     is not distinct from
     (old.grams_per_day, old.weekdays, old.slot, old.address_id, old.product_id, old.plan, old.paused_from, old.paused_until, old.cancelled_on) then
    return null;
  end if;
  select max(d.delivery_date) into v_until
  from public.deliveries d
  where d.org_id = new.org_id and d.subscription_id = new.id and d.status <> 'cancelled';
  update public.deliveries d
  set status = 'cancelled', superseded = true, cancel_reason = 'The subscription changed'
  where d.org_id = new.org_id and d.subscription_id = new.id and d.status = 'planned'
    and now() < public.delivery_cutoff(d.org_id, d.delivery_date, d.slot)
    and exists (select 1 from public.invoices i where i.org_id = d.org_id and i.subscription_id = d.subscription_id
                and i.status <> 'void' and d.delivery_date between i.period_start and i.period_end);
  delete from public.deliveries d
  where d.org_id = new.org_id and d.subscription_id = new.id and d.status = 'planned'
    and now() < public.delivery_cutoff(d.org_id, d.delivery_date, d.slot);
  if v_until is not null then
    perform public.plan_subscription(new.id, v_until);
  end if;
  return null;
end;
$$;
comment on function public.subscriptions_replan() is
  'Trigger: when a subscription''s grams, days, slot, address, food, plan, pause or end change, its deliveries still before their cut-off are made again: cancelled (when a bill has them, so the bill can be credited) or removed, and made anew up to as far ahead as before.';

create trigger subscriptions_replan
  after update on public.subscriptions
  for each row execute function public.subscriptions_replan();

-- The lines a food bill should have: for a period of a subscription, its
-- deliveries in the period that are not cancelled, one line for each price
-- and tax rate with their kilos added up, the monthly discount when paid a
-- month ahead, and the delivery charges; for a one-off order, its food and
-- its charge. Replacements cost nothing and are left off.
create function public.food_bill_lines(p_org uuid, p_subscription uuid, p_from date, p_to date, p_delivery uuid)
returns table (part text, quantity numeric, unit_price_minor bigint, discount_minor bigint, tax_rate_bp integer, sac_code text)
language sql
stable
set search_path = ''
as $$
  with d as (
    select dl.*, p.kind as product_kind
    from public.deliveries dl
    left join public.food_products p on p.org_id = dl.org_id and p.id = dl.product_id
    where dl.org_id = p_org and dl.status <> 'cancelled' and dl.kind <> 'replacement'
      and ((p_subscription is not null and dl.subscription_id = p_subscription and dl.delivery_date between p_from and p_to)
           or (p_delivery is not null and dl.id = p_delivery))
  ),
  monthly as (
    select coalesce((select o.monthly_food_discount_bp from public.organizations o where o.id = p_org
                     and exists (select 1 from public.subscriptions s where s.org_id = p_org and s.id = p_subscription and s.pay_period = 'month')), 0) as bp
  ),
  food as (
    select (sum(d.grams) / 1000.0)::numeric(10, 2) as quantity, d.unit_price_minor, d.tax_rate_bp, d.sac_code
    from d where d.kind in ('subscription', 'order')
    group by d.unit_price_minor, d.tax_rate_bp, d.sac_code
  )
  select 'food', f.quantity, f.unit_price_minor,
         round(round(f.quantity * f.unit_price_minor) * m.bp / 10000.0)::bigint, f.tax_rate_bp, f.sac_code
  from food f, monthly m
  union all
  select 'trial', 1::numeric(10, 2), d.unit_price_minor, 0::bigint, d.tax_rate_bp, d.sac_code
  from d where d.kind = 'trial'
  union all
  select 'item', d.quantity::numeric(10, 2), d.unit_price_minor, 0::bigint, d.tax_rate_bp, d.sac_code
  from d where d.kind = 'item'
  union all
  select 'delivery', count(*)::numeric(10, 2), d.delivery_charge_minor, 0::bigint, d.tax_rate_bp, d.sac_code
  from d where d.delivery_charge_minor > 0
  group by d.delivery_charge_minor, d.tax_rate_bp, d.sac_code;
$$;
comment on function public.food_bill_lines(uuid, uuid, date, date, uuid) is
  'The lines a food bill should have: a subscription''s deliveries from p_from to p_to (one line per price and tax rate, in kilos, less the monthly discount when it is paid a month ahead), or one order''s food; then the delivery charges. Cancelled deliveries and replacements are left off. Must match foodLines() in src/lib/food-bill.ts; issue_invoice() checks staff bills against it.';

-- A delivery of a subscription is billed with its subscription, never alone,
-- and a bill for a subscription or an order names one of that parent.
create function public.invoices_check_food()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.delivery_id is not null and not exists (
    select 1 from public.deliveries d
    where d.org_id = new.org_id and d.id = new.delivery_id and d.client_id = new.client_id
      and d.subscription_id is null and d.kind <> 'replacement'
  ) and coalesce(current_setting('wagbook.merging', true), '') <> 'on' then
    raise exception 'WB154: bill a subscription''s deliveries with the subscription, and an order of this parent on its own' using errcode = '23514';
  end if;
  if new.subscription_id is not null and coalesce(current_setting('wagbook.merging', true), '') <> 'on' then
    if not exists (select 1 from public.subscriptions s where s.org_id = new.org_id and s.id = new.subscription_id and s.client_id = new.client_id) then
      raise exception 'WB154: bill a subscription''s deliveries with the subscription, and an order of this parent on its own' using errcode = '23514';
    end if;
    if new.status <> 'void' and exists (
      select 1 from public.invoices i
      where i.org_id = new.org_id and i.subscription_id = new.subscription_id and i.id <> new.id and i.status <> 'void'
        and daterange(i.period_start, i.period_end, '[]') && daterange(new.period_start, new.period_end, '[]')
    ) then
      raise exception 'WB155: some of these days are on another bill of this subscription' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
comment on function public.invoices_check_food() is
  'Trigger: a food bill names an order of its parent, never a subscription''s delivery (WB154), or a subscription of its parent for days no other live bill of it covers (WB155).';

create trigger invoices_check_food
  before insert or update of subscription_id, period_start, period_end, delivery_id, client_id on public.invoices
  for each row execute function public.invoices_check_food();

-- ---------------------------------------------------------------------------
-- Batches (M30)
-- ---------------------------------------------------------------------------

-- A batch's number and use-by date are the database's.
create function public.batches_number()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('batches:' || new.org_id::text || new.cooked_on::text, 0));
  select count(*) into v_count from public.batches b where b.org_id = new.org_id and b.cooked_on = new.cooked_on;
  new.number := to_char(new.cooked_on, 'YYMMDD') || '-' || (v_count + 1);
  select r.id, new.cooked_on + r.use_by_days into new.recipe_id, new.use_by
  from public.recipe_versions v
  join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
  where v.org_id = new.org_id and v.id = new.version_id;
  return new;
end;
$$;
comment on function public.batches_number() is
  'Trigger: a new batch is numbered by its cooking day and a count (270314-1, 270314-2), and takes its recipe and use-by date (cooked_on plus the recipe''s use_by_days) from its version.';

create trigger batches_number
  before insert on public.batches
  for each row execute function public.batches_number();

-- Recording a batch takes its ingredients out of stock, by its version and
-- weight, in the same step; it is refused when stock is short (WB130).
-- Runs as the caller: any member may record cooking.
create function public.record_batch(
  p_org uuid, p_version uuid, p_grams integer, p_packs integer, p_cooked_on date,
  p_cook uuid default null, p_boarders_on date default null, p_note text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_batch uuid;
begin
  if p_org not in (select public.my_org_ids()) then
    raise exception 'WB003: that recipe was not found' using errcode = 'P0002';
  end if;
  insert into public.batches (org_id, number, recipe_id, version_id, cooked_on, grams, packs, use_by, cook_id, boarders_on, note)
  values (p_org, '', (select v.recipe_id from public.recipe_versions v where v.org_id = p_org and v.id = p_version),
          p_version, p_cooked_on, p_grams, p_packs, p_cooked_on, coalesce(p_cook, (select auth.uid())), p_boarders_on, nullif(btrim(p_note), ''))
  returning id into v_batch;
  insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, batch_id)
  select p_org, ri.item_id, 'used', -greatest(round(ri.quantity_per_kg * p_grams / 1000.0), 1)::bigint, p_cooked_on, v_batch
  from public.recipe_ingredients ri
  where ri.org_id = p_org and ri.version_id = p_version
  order by ri.item_id;
  return v_batch;
end;
$$;
comment on function public.record_batch(uuid, uuid, integer, integer, date, uuid, date, text) is
  'Records a batch cooked from a recipe version and takes each ingredient out of stock: its quantity per kilo times the batch''s kilos. Refused as a whole when any ingredient is short (WB130).';

-- What a batch cost to make, from its own version and the prices on the day
-- it was cooked. Owners and managers only.
create function public.batch_cost(p_org uuid, p_batch uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select round(public.recipe_cost_per_kg(b.org_id, b.version_id, b.cooked_on) * b.grams / 1000.0)::bigint
  from public.batches b
  where b.org_id = p_org and b.id = p_batch;
$$;
comment on function public.batch_cost(uuid, uuid) is
  'What a batch cost: its version''s cost per kilo on the day it was cooked, times its kilos. Owners and managers only (recipe_cost_per_kg).';

-- Who received a batch: the deliveries packed from it, and the boarders on
-- the kitchen's food who were in house on the day they ate from it. The food
-- safety question.
create function public.batch_recipients(p_org uuid, p_batch uuid)
returns table (kind text, on_date date, pet_id uuid, pet_name text, client_id uuid, client_name text, phone text, delivery_id uuid)
language sql
stable
set search_path = ''
as $$
  select 'delivery', d.delivery_date, p.id, p.name, c.id, c.full_name, c.phone, d.id
  from public.deliveries d
  join public.pets p on p.org_id = d.org_id and p.id = d.pet_id
  join public.clients c on c.org_id = d.org_id and c.id = d.client_id
  where d.org_id = p_org and d.batch_id = p_batch and d.status <> 'cancelled'
  union all
  select 'boarder', b.boarders_on, p.id, p.name, c.id, c.full_name, c.phone, null::uuid
  from public.batches b
  join public.bookings bk on bk.org_id = b.org_id
    and bk.status in ('checked_in', 'checked_out')
    and public.stay_range(bk.kind, bk.start_date, bk.end_date) @> b.boarders_on
  join public.pets p on p.org_id = bk.org_id and p.id = bk.pet_id
  join public.clients c on c.org_id = bk.org_id and c.id = bk.client_id
  left join public.pet_food f on f.org_id = p.org_id and f.pet_id = p.id
  where b.org_id = p_org and b.id = p_batch and b.boarders_on is not null and coalesce(f.boarder_food, 'kitchen') = 'kitchen'
  order by 2, 4;
$$;
comment on function public.batch_recipients(uuid, uuid) is
  'Who received a batch: every delivery packed from it, and every boarder on the kitchen''s food who was in house on the day the boarders ate from it (batches.boarders_on). Row level security applies.';

-- ---------------------------------------------------------------------------
-- Delivery runs and riders (M31, D45)
-- ---------------------------------------------------------------------------

-- A run is ridden by a member of the kennel.
create function public.delivery_runs_check_rider()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.rider_id and m.is_active) then
    raise exception 'WB170: the rider must be working at this kennel' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.delivery_runs_check_rider() is 'Trigger: a run is ridden by an active member of the kennel (WB170).';

create trigger delivery_runs_check_rider
  before insert or update of rider_id on public.delivery_runs
  for each row execute function public.delivery_runs_check_rider();

-- A delivery goes on a run of its own day and slot.
create function public.deliveries_check_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.run_id is not null and not exists (
    select 1 from public.delivery_runs r
    where r.org_id = new.org_id and r.id = new.run_id and r.run_date = new.delivery_date and r.slot = new.slot
  ) then
    raise exception 'WB171: a delivery goes on a run of its own day and slot' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.deliveries_check_run() is 'Trigger: a delivery is put on a run of its own day and slot (WB171).';

create trigger deliveries_check_run
  before insert or update of run_id, delivery_date, slot on public.deliveries
  for each row execute function public.deliveries_check_run();

-- What a rider sees: their own runs for a day, each stop with the name,
-- address, phone, packs and the note for the door. No prices, no pets'
-- medical notes, no other parents. SECURITY DEFINER because a rider can read
-- no table at all (D45); it checks the caller is the run's rider itself.
create function public.my_runs(p_date date default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'run_id', r.id,
    'org_id', r.org_id,
    'kennel', o.name,
    'kennel_phone', coalesce(o.whatsapp_phone, o.phone),
    'run_date', r.run_date,
    'slot', r.slot,
    'stops', coalesce((
      select jsonb_agg(s.stop order by s.position nulls last, s.created_at)
      from (
      select d.run_position as position, d.created_at, jsonb_build_object(
        'delivery_id', d.id,
        'kind', 'delivery',
        'position', d.run_position,
        'name', c.full_name,
        'phone', c.phone,
        'pet', p.name,
        'packs', d.packs,
        'quantity', case when d.kind = 'item' then d.quantity end,
        'line', a.line,
        'area', a.area,
        'postal_code', a.postal_code,
        'map_url', a.map_url,
        'door_note', a.door_note,
        'note', d.note,
        'status', d.status
      ) as stop
      from public.deliveries d
      join public.clients c on c.org_id = d.org_id and c.id = d.client_id
      join public.pets p on p.org_id = d.org_id and p.id = d.pet_id
      left join public.client_addresses a on a.org_id = d.org_id and a.id = d.address_id
      where d.org_id = r.org_id and d.run_id = r.id and d.status <> 'cancelled'
      union all
      -- Pick-ups and drops of boarders (M39).
      select t.run_position, t.created_at, jsonb_build_object(
        'trip_id', t.id,
        'kind', t.kind,
        'position', t.run_position,
        'time', to_char(t.at_time, 'HH24:MI'),
        'name', c.full_name,
        'phone', c.phone,
        'pet', p.name,
        'line', a.line,
        'area', a.area,
        'postal_code', a.postal_code,
        'map_url', a.map_url,
        'door_note', a.door_note,
        'note', t.note,
        'status', t.status
      )
      from public.trips t
      join public.clients c on c.org_id = t.org_id and c.id = t.client_id
      join public.pets p on p.org_id = t.org_id and p.id = t.pet_id
      join public.client_addresses a on a.org_id = t.org_id and a.id = t.address_id
      where t.org_id = r.org_id and t.run_id = r.id and t.status <> 'cancelled'
      ) s
    ), '[]'::jsonb)
  ) order by r.slot), '[]'::jsonb)
  from public.delivery_runs r
  join public.organizations o on o.id = r.org_id
  where r.rider_id = (select auth.uid()) and r.run_date = coalesce(p_date, public.org_today(r.org_id))
    and r.org_id in (select m.org_id from public.memberships m
                     where m.user_id = (select auth.uid()) and m.is_active and public.session_meets_mfa());
$$;
comment on function public.my_runs(date) is
  'The signed-in rider''s runs for a day (today in their kennel when empty): each stop''s name, phone, pet''s name, packs, address and notes, in order, deliveries and the pick-ups and drops of boarders (M39) together. Nothing else: no prices, no medical notes, no other runs. SECURITY DEFINER because riders read no table (D45).';

-- What happened at the door, from the rider's phone: only on their own run,
-- only on the run's day.
create function public.rider_mark_stop(p_delivery uuid, p_status public.delivery_status, p_proof_path text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries;
  v_run public.delivery_runs;
begin
  select * into v_delivery from public.deliveries d where d.id = p_delivery for update;
  select * into v_run from public.delivery_runs r where r.org_id = v_delivery.org_id and r.id = v_delivery.run_id;
  if v_run.id is null or v_run.rider_id <> (select auth.uid())
     or v_run.org_id not in (select m.org_id from public.memberships m
                             where m.user_id = (select auth.uid()) and m.is_active and public.session_meets_mfa()) then
    raise exception 'WB003: that stop was not found' using errcode = 'P0002';
  end if;
  if v_run.run_date <> public.org_today(v_run.org_id) then
    raise exception 'WB172: this run is not today''s' using errcode = '23514';
  end if;
  if p_status not in ('out', 'delivered', 'not_home', 'refused') or v_delivery.status = 'cancelled' then
    raise exception 'WB173: a rider marks a stop on the way, delivered, nobody home or refused' using errcode = '23514';
  end if;
  if p_proof_path is not null and p_proof_path not like v_run.org_id::text || '/deliveries/' || v_delivery.id::text || '/%' then
    raise exception 'WB173: a rider marks a stop on the way, delivered, nobody home or refused' using errcode = '23514';
  end if;
  update public.deliveries d
  set status = p_status, proof_path = coalesce(p_proof_path, d.proof_path)
  where d.id = v_delivery.id;
end;
$$;
comment on function public.rider_mark_stop(uuid, public.delivery_status, text) is
  'A rider marks a stop of their own run for today: on the way (out), delivered (with a photo), nobody home or refused (WB172, WB173). SECURITY DEFINER because riders read no table; it checks the caller is the run''s rider.';

-- A trip goes on a run of its own day and slot (M39).
alter table public.trips
  add constraint trips_run_fkey foreign key (org_id, run_id) references public.delivery_runs (org_id, id) on delete set null (run_id);

create function public.trips_check_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.run_id is not null and not exists (
    select 1 from public.delivery_runs r
    where r.org_id = new.org_id and r.id = new.run_id and r.run_date = new.trip_date and r.slot = new.slot
  ) then
    raise exception 'WB171: a delivery goes on a run of its own day and slot' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.trips_check_run() is 'Trigger: a pick-up or drop is put on a run of its own day and slot (WB171).';

create trigger trips_check_run
  after insert or update of run_id, trip_date, slot on public.trips
  for each row execute function public.trips_check_run();

-- A rider marks a pick-up or drop of their own run for today, as a delivery.
create function public.rider_mark_trip(p_trip uuid, p_status public.trip_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_run public.delivery_runs;
begin
  -- SECURITY DEFINER: riders read no table (D45); this checks the caller is the run's rider.
  select * into v_trip from public.trips t where t.id = p_trip for update;
  select * into v_run from public.delivery_runs r where r.org_id = v_trip.org_id and r.id = v_trip.run_id;
  if v_run.id is null or v_run.rider_id <> (select auth.uid())
     or v_run.org_id not in (select m.org_id from public.memberships m
                             where m.user_id = (select auth.uid()) and m.is_active and public.session_meets_mfa()) then
    raise exception 'WB003: that stop was not found' using errcode = 'P0002';
  end if;
  if v_run.run_date <> public.org_today(v_run.org_id) then
    raise exception 'WB172: this run is not today''s' using errcode = '23514';
  end if;
  if p_status not in ('out', 'done', 'not_home') or v_trip.status = 'cancelled' then
    raise exception 'WB173: a rider marks a stop on the way, delivered, nobody home or refused' using errcode = '23514';
  end if;
  update public.trips t set status = p_status where t.id = v_trip.id;
end;
$$;
comment on function public.rider_mark_trip(uuid, public.trip_status) is
  'A rider marks a pick-up or drop of their own run for today: on the way, done or nobody home (WB172, WB173). SECURITY DEFINER because riders read no table; it checks the caller is the run''s rider.';

create type public.problem_kind as enum ('damaged', 'late', 'wrong');
comment on type public.problem_kind is 'What a parent said was wrong with a delivery: damaged, late or wrong.';

create type public.problem_outcome as enum ('replaced', 'refunded', 'none');
comment on type public.problem_outcome is 'What the kennel did: made it again at no charge, gave the money back (a credit note and a refund), or nothing.';

create table public.delivery_problems (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  delivery_id uuid not null,
  kind public.problem_kind not null,
  note text check (note is null or char_length(note) <= 500),
  photo_path text,
  reported_at timestamptz not null default now(),
  reported_by uuid references auth.users (id) on delete set null default auth.uid(),
  outcome public.problem_outcome,
  replacement_id uuid,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  from_parent boolean not null default false,
  unique (org_id, id),
  foreign key (org_id, delivery_id) references public.deliveries (org_id, id) on delete cascade,
  foreign key (org_id, replacement_id) references public.deliveries (org_id, id) on delete set null (replacement_id),
  constraint delivery_problems_replaced_names_it check (outcome is distinct from 'replaced' or replacement_id is not null)
);

comment on table public.delivery_problems is
  'A parent said a delivery was damaged, late or wrong, within problem_window_hours of it, with a photo. Staff replace it (a new delivery at no charge) or refund it (a credit note and a refund).';
comment on column public.delivery_problems.photo_path is 'The parent''s photo, under {org_id}/deliveries/{delivery_id}/.';
comment on column public.delivery_problems.outcome is 'What was done about it. Empty: not dealt with yet.';
comment on column public.delivery_problems.replacement_id is 'The delivery made again, when it was replaced.';
comment on column public.delivery_problems.from_parent is 'Told by the parent from their own link (M59), rather than written down by staff. Set only by submit_food_request().';

create trigger delivery_problems_stamp_actor
  before insert or update on public.delivery_problems
  for each row execute function public.stamp_actor('reported_by');

create trigger delivery_problems_stamp_resolved
  before insert or update of resolved_at on public.delivery_problems
  for each row execute function public.stamp_when_set('resolved_at', 'resolved_by');

create function public.delivery_problems_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_delivery public.deliveries;
  v_hours smallint;
begin
  -- Only the parent's own link (submit_food_request) says a parent told it.
  if tg_op = 'UPDATE' then
    new.from_parent := old.from_parent;
    return new;
  end if;
  new.from_parent := coalesce(current_setting('wagbook.from_parent', true), '') = 'on';
  select * into v_delivery from public.deliveries d where d.org_id = new.org_id and d.id = new.delivery_id;
  select o.problem_window_hours into v_hours from public.organizations o where o.id = new.org_id;
  new.reported_at := now();
  if v_delivery.status <> 'delivered' or v_delivery.delivered_at is null
     or now() > v_delivery.delivered_at + make_interval(hours => v_hours) then
    raise exception 'WB174: a problem is reported within % hours of the delivery', v_hours using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.delivery_problems_check() is
  'Trigger: a problem is reported about a delivery that was handed over, within the kennel''s problem_window_hours of it (WB174). Whether the parent told it (from_parent) is set by submit_food_request() alone and never changed.';

create trigger delivery_problems_check
  before insert or update on public.delivery_problems
  for each row execute function public.delivery_problems_check();
