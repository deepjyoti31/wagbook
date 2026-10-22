# Schema reference

> GENERATED FILE. Do not edit by hand. Run `npm run gen:db` after changing anything in `supabase/migrations`.
> The descriptions come from `comment on` statements in the migrations, so fix wording there.

This is the exact shape of the database after every migration has run. For the reasoning behind it, read
[04-data-model.md](../04-data-model.md) and [05-security-and-privacy.md](../05-security-and-privacy.md).

Migrations applied: 13. Tables: 57. Views: 5. Functions: 130.

## Contents

- [Enumerated types](#enumerated-types)
- Tables: [appointment_items](#appointment_items), [appointment_places](#appointment_places), [appointment_service_prices](#appointment_service_prices), [appointment_services](#appointment_services), [appointments](#appointments), [audit_log](#audit_log), [batches](#batches), [booking_items](#booking_items), [bookings](#bookings), [care_items](#care_items), [care_tasks](#care_tasks), [client_addresses](#client_addresses), [clients](#clients), [courses](#courses), [credit_note_lines](#credit_note_lines), [credit_notes](#credit_notes), [day_packs](#day_packs), [deliveries](#deliveries), [delivery_problems](#delivery_problems), [delivery_runs](#delivery_runs), [expenses](#expenses), [food_orders](#food_orders), [food_products](#food_products), [incidents](#incidents), [intake_submissions](#intake_submissions), [invitation_links](#invitation_links), [invoice_counters](#invoice_counters), [invoice_lines](#invoice_lines), [invoices](#invoices), [kennels](#kennels), [memberships](#memberships), [organizations](#organizations), [package_parts](#package_parts), [packages](#packages), [passes](#passes), [payments](#payments), [peak_periods](#peak_periods), [pet_food](#pet_food), [pet_grooming](#pet_grooming), [pet_weights](#pet_weights), [pets](#pets), [play_sessions](#play_sessions), [play_yards](#play_yards), [recipe_ingredients](#recipe_ingredients), [recipe_versions](#recipe_versions), [recipes](#recipes), [recovery_codes](#recovery_codes), [reminders_sent](#reminders_sent), [service_areas](#service_areas), [services](#services), [stay_updates](#stay_updates), [stock_costs](#stock_costs), [stock_items](#stock_items), [stock_moves](#stock_moves), [subscriptions](#subscriptions), [suppliers](#suppliers), [vaccinations](#vaccinations)
- Views: [course_balances](#course_balances), [invoice_balances](#invoice_balances), [pass_balances](#pass_balances), [recipe_current](#recipe_current), [stock_levels](#stock_levels)
- [Functions](#functions)

## Enumerated types

| Type | Values | Meaning |
| --- | --- | --- |
| `address_kind` | `home`, `work`, `other` | What a parent's address is, so it is named in the reader's language: home, work or other. |
| `appointment_kind` | `groom`, `swim`, `training`, `party`, `other` | What an appointment service is: groom (grooming and spa), swim (one dog at a time in the pool), training (a session, often of a course), party (the party yard for a birthday), other. |
| `appointment_pricing` | `fixed`, `by_size`, `by_coat`, `quote` | How a service is priced: fixed (one price), by_size (small, medium or large from the pet's latest weight), by_coat (the pet's coat, a named breed overriding it), quote (an owner or manager sets the price for each appointment). |
| `appointment_status` | `requested`, `confirmed`, `done`, `no_show`, `cancelled` | requested: written down, holds nothing. confirmed: holds the place, the pet and the person. done: it happened. no_show: the pet did not come (still billed). cancelled: with a reason; it stays cancelled. |
| `boarder_food` | `kitchen`, `kibble`, `own` | What a pet eats while boarding: kitchen (fresh food from the kennel's kitchen, the default), kibble (a dry food the parent names, which the kennel feeds), own (food the parent sends). |
| `booking_kind` | `boarding`, `daycare` | boarding: overnight, charged per night. daycare: day boarding with no night, charged per day. |
| `booking_status` | `requested`, `confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show` | requested: asked for, not yet accepted, holds no space. confirmed: space is held. checked_in: the pet is in house. checked_out: gone home. cancelled and no_show: space released. |
| `care_kind` | `meal`, `medication`, `walk`, `play`, `cleaning`, `other` | What sort of care a routine or task is. Used to group and count tasks. |
| `customer_source` | `boarding`, `referral`, `website`, `other` | Where a food customer came from: a boarding parent, a referral, the website order page, or elsewhere. |
| `delivery_kind` | `subscription`, `trial`, `order`, `item`, `replacement` | subscription: made from a subscription. trial: a trial, once per pet. order: food by the kilo, once. item: a made-to-order item. replacement: a delivery made again at no charge after a problem. |
| `delivery_slot` | `morning`, `afternoon`, `evening` | When a delivery arrives: morning (from 8), afternoon (from 1) or evening (from 6), kennel time. Changes close food_cutoff_hours before the slot starts. |
| `delivery_status` | `planned`, `packed`, `out`, `delivered`, `not_home`, `refused`, `cancelled` | planned: to be cooked and packed. packed: packed from a batch. out: with the rider. delivered, not_home, refused: what happened at the door. cancelled: not going, with a reason. |
| `food_goal` | `lose`, `keep`, `gain` | Whether a dog should lose weight, keep it, or gain. Changes the portion by organizations.goal_change_bp. |
| `food_order_kind` | `trial`, `subscription`, `pause`, `skip`, `more` | trial, subscription: an order from the website order page. pause, skip, more: a known parent's change to their food from their own link (pause for some days, skip one delivery, an extra order). |
| `food_order_status` | `waiting_area`, `unpaid`, `paid`, `requested`, `confirmed`, `declined` | waiting_area: the PIN code is not served yet; nothing was charged. unpaid: waiting for the parent's UPI payment. paid: the parent says they have paid; staff check the money arrived. requested: a known parent's change, for staff to make. confirmed: made into a subscription, a trial or a change. declined: not taken. |
| `food_plan` | `full`, `topper` | full: all of a dog's food. topper: a share of the day's food on top of what it already eats (a third by default). |
| `food_product_kind` | `trial`, `subscription`, `by_kilo`, `item` | trial: a fixed amount at a fixed price, once per pet. subscription: food delivered on set days, priced per kilo. by_kilo: a one-off order priced per kilo. item: made to order, priced per piece (a birthday cake). |
| `incident_severity` | `low`, `medium`, `high` | low: worth noting. medium: the parent should be told today. high: the parent and a vet should be told now. |
| `intake_status` | `new`, `accepted`, `rejected`, `spam` | new: waiting for staff. accepted: turned into a client and pets. rejected: declined by staff. spam: junk, kept only to spot patterns. |
| `invoice_status` | `draft`, `issued`, `void` | draft: being prepared, editable, has no number. issued: numbered and frozen. void: cancelled after issue; the number stays used. |
| `member_role` | `owner`, `manager`, `staff`, `rider` | owner: everything, including people and deleting the organisation. manager: everything except owners. staff: daily operations. rider: only their own delivery run for the day, through rider functions (D45); no table is open to them. |
| `package_day` | `first`, `middle`, `last` | Which day of a stay a package's appointment goes on: first (the day it starts), middle (halfway), last (the day it ends, finished by pick-up). |
| `pay_period` | `week`, `month` | How a subscription is paid: a week ahead, or a month ahead (with the kennel's monthly discount). |
| `payment_method` | `upi`, `cash`, `card`, `bank_transfer`, `other` | How money moved. Wagbook records this; it does not process payments. |
| `pet_coat` | `short`, `double`, `long`, `curly`, `wire` | A pet's coat, for grooming prices (M35): short, double (a thick undercoat), long, curly, wire. |
| `pet_sex` | `male`, `female`, `unknown` | unknown is the honest default when nobody has said. |
| `problem_kind` | `damaged`, `late`, `wrong` | What a parent said was wrong with a delivery: damaged, late or wrong. |
| `problem_outcome` | `replaced`, `refunded`, `none` | What the kennel did: made it again at no charge, gave the money back (a credit note and a refund), or nothing. |
| `service_kind` | `boarding`, `daycare`, `addon` | boarding: an overnight stay, priced per night. daycare: day boarding, priced per day. addon: an extra such as grooming. |
| `size_band` | `small`, `medium`, `large` | A dog's size from its latest weight, using the kennel's bands (organizations.small_dog_max_g and medium_dog_max_g). Must match sizeBand() in src/lib/core/food.ts. |
| `staff_skill` | `cook`, `groomer`, `trainer`, `swim_supervisor`, `rider` | What a person can be given to do, beyond their role: cook (the kitchen), groomer, trainer and swim_supervisor (appointments), rider (deliveries and pick-ups). Skills choose who is offered a job; access stays with the role. |
| `stock_kind` | `meat`, `organ`, `egg`, `grain`, `vegetable`, `oil`, `supplement`, `packaging`, `fuel`, `grooming`, `medicine`, `other` | What sort of thing an item is, for sorting the stock page and the shopping list. |
| `stock_move_kind` | `purchase`, `used`, `waste`, `count` | purchase: bought in (owners and managers). used: taken out by a batch of cooking (M30), never by hand. waste: thrown away with a reason. count: a stock take, which sets the counted quantity and records the difference. |
| `stock_unit` | `g`, `ml`, `piece` | How an item is counted: grams, millilitres or pieces. Quantities are whole numbers of this unit. |
| `task_status` | `pending`, `done`, `skipped` | pending: still to do. done: completed (who and when are stamped). skipped: deliberately not done, with a note saying why. |
| `tax_mode` | `none`, `simple`, `gst_india` | none: no tax charged. simple: one tax at one rate (VAT, sales tax). gst_india: CGST+SGST within a state, IGST across states. |
| `waste_reason` | `spoiled`, `past_date`, `dropped`, `other` | Why stock was thrown away: spoiled, past its use-by date, dropped, or another reason in the note. |

## Tables

### appointment_items

An add-on on an appointment, priced on top of it: its name and price copied from the add-on service when added. On the same bill as the appointment.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `appointment_id` | `uuid` | yes |  |  |
| `service_id` | `uuid` | yes |  |  |
| `description` | `text` | yes |  |  |
| `quantity` | `smallint` | yes | `1` |  |
| `unit_price_minor` | `bigint` | yes |  |  |
| `tax_rate_bp` | `integer` | yes | `0` |  |
| `sac_code` | `text` |  |  |  |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `appointment_items_pkey`: `PRIMARY KEY (id)`
- Foreign key `appointment_items_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `appointment_items_org_id_appointment_id_fkey`: `FOREIGN KEY (org_id, appointment_id) REFERENCES appointments(org_id, id) ON DELETE CASCADE`
- Foreign key `appointment_items_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `appointment_items_org_id_service_id_fkey`: `FOREIGN KEY (org_id, service_id) REFERENCES appointment_services(org_id, id) ON DELETE RESTRICT`
- Check `appointment_items_description_check`: `CHECK (((char_length(description) >= 1) AND (char_length(description) <= 200)))`
- Check `appointment_items_quantity_check`: `CHECK (((quantity >= 1) AND (quantity <= 50)))`
- Check `appointment_items_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `appointment_items_tax_rate_bp_check`: `CHECK (((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000)))`
- Check `appointment_items_unit_price_minor_check`: `CHECK ((unit_price_minor >= 0))`

**Indexes**

- `CREATE INDEX appointment_items_org_appointment_idx ON public.appointment_items USING btree (org_id, appointment_id)`

**Triggers**

- `appointment_items_forbid_org_change` (before update) runs `forbid_org_change()`
- `appointment_items_price` (before insert or update) runs `appointment_items_price()`
- `appointment_items_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `appointment_items_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `appointment_items_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `appointment_items_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `appointment_items_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### appointment_places

Something that takes one appointment at a time: the pool, a grooming table, a training ground, the party yard.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `name` | `text` | yes |  |  |
| `opens` | `time without time zone` | yes | `'09:00:00'::time without time zone` | When it opens each day, kennel time. No appointment starts before it. |
| `closes` | `time without time zone` | yes | `'18:00:00'::time without time zone` | When it closes each day, kennel time. No appointment ends after it. |
| `is_active` | `boolean` | yes | `true` | False takes the place out of service: nothing new is booked in it. |
| `sort_order` | `integer` | yes | `0` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `appointment_places_pkey`: `PRIMARY KEY (id)`
- Unique `appointment_places_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `appointment_places_org_id_name_key`: `UNIQUE (org_id, name)`
- Foreign key `appointment_places_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `appointment_places_hours_in_order`: `CHECK ((closes > opens))`
- Check `appointment_places_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60)))`

**Triggers**

- `appointment_places_forbid_org_change` (before update) runs `forbid_org_change()`
- `appointment_places_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `appointment_places_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `appointment_places_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `appointment_places_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `appointment_places_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### appointment_service_prices

A service's price for a size of dog (priced by_size), or for a coat or a named breed (priced by_coat; a breed overrides the coat). See appointment_price().

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `service_id` | `uuid` | yes |  |  |
| `size` | `size_band` |  |  |  |
| `coat` | `pet_coat` |  |  |  |
| `breed` | `text` |  |  | A breed as it is written on pets, matched without regard to case or spaces at the ends. |
| `price_minor` | `bigint` | yes |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `appointment_service_prices_pkey`: `PRIMARY KEY (id)`
- Foreign key `appointment_service_prices_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `appointment_service_prices_org_id_service_id_fkey`: `FOREIGN KEY (org_id, service_id) REFERENCES appointment_services(org_id, id) ON DELETE CASCADE`
- Check `appointment_service_prices_breed_check`: `CHECK (((breed IS NULL) OR ((char_length(btrim(breed)) >= 1) AND (char_length(btrim(breed)) <= 80))))`
- Check `appointment_service_prices_one_key`: `CHECK ((num_nonnulls(size, coat, breed) = 1))`
- Check `appointment_service_prices_price_minor_check`: `CHECK ((price_minor >= 0))`

**Indexes**

- `CREATE UNIQUE INDEX appointment_service_prices_one_breed ON public.appointment_service_prices USING btree (org_id, service_id, lower(btrim(breed))) WHERE (breed IS NOT NULL)`
- `CREATE UNIQUE INDEX appointment_service_prices_one_coat ON public.appointment_service_prices USING btree (org_id, service_id, coat) WHERE (coat IS NOT NULL)`
- `CREATE UNIQUE INDEX appointment_service_prices_one_size ON public.appointment_service_prices USING btree (org_id, service_id, size) WHERE (size IS NOT NULL)`

**Triggers**

- `appointment_service_prices_forbid_org_change` (before update) runs `forbid_org_change()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `appointment_service_prices_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `appointment_service_prices_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `appointment_service_prices_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `appointment_service_prices_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### appointment_services

What is booked by the hour: grooming, a swim, a training session, a party, or an add-on priced on top of one (nails, decorations).

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `kind` | `appointment_kind` | yes |  |  |
| `name` | `text` | yes |  |  |
| `minutes` | `smallint` | yes | `60` | How long it usually takes. The person booking may give it longer or shorter. |
| `cleanup_minutes` | `smallint` | yes | `0` | Minutes the place stays taken after it ends, to clean and dry it. Copied onto each appointment. |
| `place_id` | `uuid` |  |  | The place it is usually booked in. An appointment may name another place. |
| `pricing` | `appointment_pricing` | yes | `'fixed'::appointment_pricing` |  |
| `price_minor` | `bigint` | yes | `0` | The price: the whole price when fixed, and the price when no size, coat or breed price fits (appointment_service_prices). Unused on quote. |
| `tax_rate_bp` | `integer` |  |  | Tax rate in basis points. Empty: the kennel's usual rate (D35). |
| `sac_code` | `text` |  |  | The service code printed on tax invoices for it. |
| `skill` | `staff_skill` |  |  | The skill whoever does it needs (groomer, trainer, swim supervisor). People with it are offered first; it does not limit who may be chosen. |
| `checks_vaccinations` | `boolean` | yes | `true` | Whether the pet's vaccination certificates must be seen before it is marked done (WB194). |
| `is_addon` | `boolean` | yes | `false` | An add-on: priced on top of another appointment (appointment_items), never booked on its own. |
| `max_people` | `smallint` |  |  | For a party: the most people who may come (WB197). Empty: no limit. |
| `is_active` | `boolean` | yes | `true` |  |
| `sort_order` | `integer` | yes | `0` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `appointment_services_pkey`: `PRIMARY KEY (id)`
- Unique `appointment_services_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `appointment_services_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `appointment_services_org_id_place_id_fkey`: `FOREIGN KEY (org_id, place_id) REFERENCES appointment_places(org_id, id) ON DELETE RESTRICT`
- Check `appointment_services_cleanup_minutes_check`: `CHECK (((cleanup_minutes >= 0) AND (cleanup_minutes <= 240)))`
- Check `appointment_services_max_people_check`: `CHECK (((max_people IS NULL) OR ((max_people >= 1) AND (max_people <= 100))))`
- Check `appointment_services_minutes_check`: `CHECK (((minutes >= 0) AND (minutes <= 720)))`
- Check `appointment_services_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `appointment_services_place_unless_addon`: `CHECK ((is_addon OR ((place_id IS NOT NULL) AND (minutes >= 5))))`
- Check `appointment_services_price_minor_check`: `CHECK ((price_minor >= 0))`
- Check `appointment_services_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `appointment_services_tax_rate_bp_check`: `CHECK (((tax_rate_bp IS NULL) OR ((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000))))`

**Triggers**

- `appointment_services_audit` (after insert or delete or update) runs `audit_row()`
- `appointment_services_forbid_org_change` (before update) runs `forbid_org_change()`
- `appointment_services_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `appointment_services_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `appointment_services_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `appointment_services_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `appointment_services_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### appointments

One pet's appointment: a service in a place, with a person, at a time. A pet staying in names its stay and is billed on it; a visitor has a bill of its own. The database keeps a place, a pet and a person to one appointment at a time.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `client_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `service_id` | `uuid` | yes |  |  |
| `kind` | `appointment_kind` | yes | `'other'::appointment_kind` | Copied from the service when booked, for the day's view and the rules for swims and parties. |
| `place_id` | `uuid` |  |  | Where it happens: the service's own place unless another was chosen. |
| `booking_id` | `uuid` |  |  | The stay it is part of, for a pet staying in: it is billed on the stay's bill. Empty: a visitor, billed on its own. |
| `course_id` | `uuid` |  |  | The training course it is a session of: it then costs nothing on its own (WB201 keeps the course to its sessions). |
| `in_package` | `boolean` | yes | `false` | Part of its stay's package (bookings.package_id): it costs nothing on its own. |
| `status` | `appointment_status` | yes | `'confirmed'::appointment_status` |  |
| `starts_at` | `timestamp with time zone` | yes |  | When it starts. The kennel's day it falls on is the day it is on. |
| `ends_at` | `timestamp with time zone` | yes |  | When it ends. From the service's length when booked; may be changed. |
| `cleanup_minutes` | `smallint` | yes | `0` | Minutes the place stays taken after it ends, copied from the service when booked. |
| `held_until` | `timestamp with time zone` | yes | `now()` | When the place is free again: ends_at plus the clean-up. Kept by the database. |
| `staff_id` | `uuid` |  |  | Who does it: a member of the kennel. |
| `price_minor` | `bigint` |  |  | What it costs, copied when booked (appointment_price()); only owners and managers change it (WB022). Empty: on quote, still to be set, so it can only be a request (WB199). |
| `tax_rate_bp` | `integer` | yes | `0` | Tax rate copied from the service when booked, in basis points. |
| `sac_code` | `text` |  |  |  |
| `vaccinations_checked_at` | `timestamp with time zone` |  |  | When someone saw the pet's vaccination certificates for it. Stamped by the database. |
| `vaccinations_checked_by` | `uuid` |  |  |  |
| `life_jacket` | `boolean` |  |  | For a swim: whether the dog wore a life jacket. Must be answered before the swim is done (WB195). |
| `guest_pet_id` | `uuid` |  |  | For a party: the one guest dog, a pet of the kennel so its parent and vaccinations are on record. |
| `guest_vaccinations_checked_at` | `timestamp with time zone` |  |  | For a party: when someone saw the guest dog's certificates (WB196). Stamped by the database. |
| `guest_vaccinations_checked_by` | `uuid` |  |  |  |
| `people` | `smallint` |  |  | For a party: how many people come (at most the service's max_people, WB197). |
| `notes` | `text` |  |  | For whoever does it ("the usual summer cut"). |
| `after_notes` | `text` |  |  | What happened: for training, the session's notes, sent to the parent. |
| `homework` | `text` |  |  | For training: what the parent should practise before the next session. |
| `cancel_reason` | `text` |  |  |  |
| `cancelled_at` | `timestamp with time zone` |  |  |  |
| `done_at` | `timestamp with time zone` |  |  | When it was marked done. Stamped by the database. |
| `done_by` | `uuid` |  |  |  |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `appointments_pkey`: `PRIMARY KEY (id)`
- Unique `appointments_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `appointments_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `appointments_done_by_fkey`: `FOREIGN KEY (done_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `appointments_guest_vaccinations_checked_by_fkey`: `FOREIGN KEY (guest_vaccinations_checked_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `appointments_org_id_booking_id_pet_id_fkey`: `FOREIGN KEY (org_id, booking_id, pet_id) REFERENCES bookings(org_id, id, pet_id) ON UPDATE CASCADE ON DELETE SET NULL (booking_id)`
- Foreign key `appointments_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE RESTRICT`
- Foreign key `appointments_org_id_client_id_pet_id_fkey`: `FOREIGN KEY (org_id, client_id, pet_id) REFERENCES pets(org_id, client_id, id) ON UPDATE CASCADE ON DELETE RESTRICT`
- Foreign key `appointments_org_id_course_id_fkey`: `FOREIGN KEY (org_id, course_id) REFERENCES courses(org_id, id) ON DELETE RESTRICT`
- Foreign key `appointments_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `appointments_org_id_guest_pet_id_fkey`: `FOREIGN KEY (org_id, guest_pet_id) REFERENCES pets(org_id, id) ON DELETE RESTRICT`
- Foreign key `appointments_org_id_place_id_fkey`: `FOREIGN KEY (org_id, place_id) REFERENCES appointment_places(org_id, id) ON DELETE RESTRICT`
- Foreign key `appointments_org_id_service_id_fkey`: `FOREIGN KEY (org_id, service_id) REFERENCES appointment_services(org_id, id) ON DELETE RESTRICT`
- Foreign key `appointments_org_id_staff_id_fkey`: `FOREIGN KEY (org_id, staff_id) REFERENCES memberships(org_id, user_id) ON DELETE SET NULL (staff_id)`
- Foreign key `appointments_vaccinations_checked_by_fkey`: `FOREIGN KEY (vaccinations_checked_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Exclusion `appointments_no_person_overlap`: `EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE (((staff_id IS NOT NULL) AND (status = ANY (ARRAY['confirmed'::appointment_status, 'done'::appointment_status]))))`
- Exclusion `appointments_no_pet_overlap`: `EXCLUDE USING gist (pet_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE ((status = ANY (ARRAY['confirmed'::appointment_status, 'done'::appointment_status])))`
- Exclusion `appointments_no_place_overlap`: `EXCLUDE USING gist (place_id WITH =, tstzrange(starts_at, held_until, '[)'::text) WITH &&) WHERE ((status = ANY (ARRAY['confirmed'::appointment_status, 'done'::appointment_status])))`
- Check `appointments_after_notes_check`: `CHECK (((after_notes IS NULL) OR (char_length(after_notes) <= 2000)))`
- Check `appointments_cancel_has_reason`: `CHECK (((status = 'cancelled'::appointment_status) = (cancel_reason IS NOT NULL)))`
- Check `appointments_cancel_reason_check`: `CHECK (((cancel_reason IS NULL) OR (char_length(cancel_reason) <= 300)))`
- Check `appointments_cleanup_minutes_check`: `CHECK (((cleanup_minutes >= 0) AND (cleanup_minutes <= 240)))`
- Check `appointments_course_or_package_is_free`: `CHECK ((((course_id IS NULL) AND (NOT in_package)) OR (price_minor = 0)))`
- Check `appointments_guest_is_another_pet`: `CHECK (((guest_pet_id IS NULL) OR (guest_pet_id <> pet_id)))`
- Check `appointments_held_after_end`: `CHECK ((held_until >= ends_at))`
- Check `appointments_homework_check`: `CHECK (((homework IS NULL) OR (char_length(homework) <= 2000)))`
- Check `appointments_notes_check`: `CHECK (((notes IS NULL) OR (char_length(notes) <= 500)))`
- Check `appointments_package_is_a_stay`: `CHECK (((NOT in_package) OR (booking_id IS NOT NULL)))`
- Check `appointments_people_check`: `CHECK (((people IS NULL) OR ((people >= 1) AND (people <= 100))))`
- Check `appointments_place_named`: `CHECK ((place_id IS NOT NULL))`
- Check `appointments_price_minor_check`: `CHECK (((price_minor IS NULL) OR (price_minor >= 0)))`
- Check `appointments_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `appointments_tax_rate_bp_check`: `CHECK (((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000)))`
- Check `appointments_times_in_order`: `CHECK (((ends_at > starts_at) AND ((ends_at - starts_at) <= '12:00:00'::interval)))`

**Indexes**

- `CREATE INDEX appointments_org_booking_idx ON public.appointments USING btree (org_id, booking_id) WHERE (booking_id IS NOT NULL)`
- `CREATE INDEX appointments_org_course_idx ON public.appointments USING btree (org_id, course_id) WHERE (course_id IS NOT NULL)`
- `CREATE INDEX appointments_org_pet_idx ON public.appointments USING btree (org_id, pet_id, starts_at DESC)`
- `CREATE INDEX appointments_org_starts_idx ON public.appointments USING btree (org_id, starts_at)`

**Triggers**

- `appointments_audit` (after insert or delete or update) runs `audit_row()`
- `appointments_check` (before insert or update) runs `appointments_check()`
- `appointments_forbid_org_change` (before update) runs `forbid_org_change()`
- `appointments_set_updated_at` (before update) runs `set_updated_at()`
- `appointments_stamp_actor` (before insert or update) runs `stamp_actor()`
- `appointments_stamp_guest_vaccinations_checked` (before insert or update) runs `stamp_when_set()`
- `appointments_stamp_vaccinations_checked` (before insert or update) runs `stamp_when_set()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `appointments_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `appointments_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `appointments_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `appointments_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### audit_log

Append-only history of changes to bookings, booking items, invoices, payments, expenses, services, incidents, organisation settings and memberships. Readable by owners and managers; writable by nobody.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `bigint` | yes |  |  |
| `org_id` | `uuid` | yes |  |  |
| `at` | `timestamp with time zone` | yes | `now()` |  |
| `actor` | `uuid` |  |  | The signed-in user who made the change. Empty for changes made by the system. |
| `action` | `text` | yes |  |  |
| `table_name` | `text` | yes |  |  |
| `row_id` | `uuid` |  |  |  |
| `old_data` | `jsonb` |  |  | For updates: only the columns that changed, with their previous values. For deletes: the whole row. |
| `new_data` | `jsonb` |  |  | For updates: only the columns that changed, with their new values. For inserts: the whole row. |

**Constraints**

- Primary key `audit_log_pkey`: `PRIMARY KEY (id)`
- Foreign key `audit_log_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `audit_log_action_check`: `CHECK ((action = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text])))`

**Indexes**

- `CREATE INDEX audit_log_org_at_idx ON public.audit_log USING btree (org_id, at DESC)`
- `CREATE INDEX audit_log_row_idx ON public.audit_log USING btree (table_name, row_id)`

**Triggers**

- `audit_log_forbid_org_change` (before update) runs `forbid_org_change()`

**Access**

- Signed-in users may: select (then narrowed by the policies below). Anonymous visitors: nothing.
- `audit_log_select` (select): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### batches

Food cooked at one time from one recipe version. Recording it takes its ingredients out of stock (record_batch). Its number is on every label, so "who got batch N" can be answered (batch_recipients).

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `number` | `text` | yes |  | Printed on labels: the cooking day and a count, e.g. 270314-2 for the second batch on 14 March 2027. |
| `recipe_id` | `uuid` | yes |  |  |
| `version_id` | `uuid` | yes |  |  |
| `cooked_on` | `date` | yes |  |  |
| `grams` | `integer` | yes |  | Cooked weight of the batch, in grams. |
| `packs` | `integer` | yes |  | How many packs it was packed into. |
| `use_by` | `date` | yes |  | The day after which it must not be eaten: cooked_on plus the recipe's use_by_days. |
| `cook_id` | `uuid` |  |  | Who cooked it. |
| `boarders_on` | `date` |  |  | The day the boarders on the kitchen's food ate from it, when they did. |
| `note` | `text` |  |  |  |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `batches_pkey`: `PRIMARY KEY (id)`
- Unique `batches_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `batches_org_id_number_key`: `UNIQUE (org_id, number)`
- Foreign key `batches_cook_id_fkey`: `FOREIGN KEY (cook_id) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `batches_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `batches_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `batches_org_id_recipe_id_fkey`: `FOREIGN KEY (org_id, recipe_id) REFERENCES recipes(org_id, id) ON DELETE RESTRICT`
- Foreign key `batches_org_id_version_id_fkey`: `FOREIGN KEY (org_id, version_id) REFERENCES recipe_versions(org_id, id) ON DELETE RESTRICT`
- Check `batches_grams_check`: `CHECK (((grams >= 100) AND (grams <= 1000000)))`
- Check `batches_note_check`: `CHECK (((note IS NULL) OR (char_length(note) <= 300)))`
- Check `batches_number_check`: `CHECK ((char_length(number) <= 20))`
- Check `batches_packs_check`: `CHECK (((packs >= 0) AND (packs <= 10000)))`

**Indexes**

- `CREATE INDEX batches_org_cooked_idx ON public.batches USING btree (org_id, cooked_on DESC)`

**Triggers**

- `batches_forbid_org_change` (before update) runs `forbid_org_change()`
- `batches_number` (before insert) runs `batches_number()`

**Access**

- Signed-in users may: select, insert, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `batches_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `batches_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `batches_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### booking_items

Add-ons charged on top of the stay: grooming, pick-up and drop, a vet bill paid on the parent's behalf.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `booking_id` | `uuid` | yes |  |  |
| `service_id` | `uuid` |  |  | The rate card row this came from, if any. Description and price are copied so the item survives rate card edits. |
| `description` | `text` | yes |  |  |
| `quantity` | `numeric(10,2)` | yes | `1` |  |
| `unit_price_minor` | `bigint` | yes |  |  |
| `tax_rate_bp` | `integer` | yes | `0` |  |
| `sac_code` | `text` |  |  |  |
| `in_package` | `boolean` | yes | `false` | Part of the stay's package (M37): put there by apply_package(), at no charge, and not a line of the bill. |
| `created_by` | `uuid` |  |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `booking_items_pkey`: `PRIMARY KEY (id)`
- Foreign key `booking_items_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `booking_items_org_id_booking_id_fkey`: `FOREIGN KEY (org_id, booking_id) REFERENCES bookings(org_id, id) ON DELETE CASCADE`
- Foreign key `booking_items_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `booking_items_org_id_service_id_fkey`: `FOREIGN KEY (org_id, service_id) REFERENCES services(org_id, id) ON DELETE SET NULL (service_id)`
- Check `booking_items_description_check`: `CHECK (((char_length(description) >= 1) AND (char_length(description) <= 200)))`
- Check `booking_items_package_is_free`: `CHECK (((NOT in_package) OR (unit_price_minor = 0)))`
- Check `booking_items_quantity_check`: `CHECK ((quantity > (0)::numeric))`
- Check `booking_items_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `booking_items_tax_rate_bp_check`: `CHECK (((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000)))`
- Check `booking_items_unit_price_minor_check`: `CHECK ((unit_price_minor >= 0))`

**Indexes**

- `CREATE INDEX booking_items_org_booking_idx ON public.booking_items USING btree (org_id, booking_id)`

**Triggers**

- `booking_items_audit` (after insert or delete or update) runs `audit_row()`
- `booking_items_forbid_org_change` (before update) runs `forbid_org_change()`
- `booking_items_guard_price` (before insert or update) runs `booking_items_guard_price()`
- `booking_items_set_updated_at` (before update) runs `set_updated_at()`
- `booking_items_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `booking_items_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `booking_items_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `booking_items_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `booking_items_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### bookings

One pet's stay: overnight boarding or day boarding. Siblings booked together are separate bookings sharing a group_id; they may share a kennel and are billed together.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `client_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `kind` | `booking_kind` | yes | `'boarding'::booking_kind` |  |
| `status` | `booking_status` | yes | `'confirmed'::booking_status` |  |
| `start_date` | `date` | yes |  | Check-in date (calendar date at the kennel). |
| `end_date` | `date` | yes |  | Check-out date. Boarding nights = end_date - start_date. For day boarding, the last day attended (so a single day has start_date = end_date). |
| `kennel_id` | `uuid` |  |  | The kennel assigned. May stay empty until check-in; capacity is still checked. Two bookings of one parent may name the same kennel on the same days (a shared kennel). |
| `rate_minor` | `bigint` | yes |  | Price per night (boarding) or per day (daycare), copied from the rate card when booked so later price changes do not rewrite history. |
| `alone_rate_minor` | `bigint` |  |  | For a pet booked at the shared kennel price: the price per night or day for the nights or days it has the kennel to itself (its sibling left early or came late), usually the kennel's usual price. Empty: rate_minor applies throughout. See stay_charges(). |
| `boarding_from` | `date` |  |  | For a stay that began as day boarding and became boarding: the first night. The days before it are billed as day boarding at day_rate_minor, the nights from it at rate_minor. Empty for every other stay. |
| `day_rate_minor` | `bigint` |  |  | With boarding_from: the price per day for the days of day boarding before the first night. |
| `discount_minor` | `bigint` | yes | `0` | Discount on the stay itself, before tax. On a bill it goes on the stay's largest line (stay_charges()). |
| `tax_rate_bp` | `integer` | yes | `0` | Tax rate for the stay, copied when booked. |
| `sac_code` | `text` |  |  |  |
| `expected_arrival` | `time without time zone` |  |  | When the parent said they would drop off. For planning the day; not enforced. |
| `expected_departure` | `time without time zone` |  |  |  |
| `checked_in_at` | `timestamp with time zone` |  |  |  |
| `checked_in_by` | `uuid` |  |  |  |
| `checked_out_at` | `timestamp with time zone` |  |  |  |
| `checked_out_by` | `uuid` |  |  |  |
| `cancelled_at` | `timestamp with time zone` |  |  |  |
| `cancel_reason` | `text` |  |  |  |
| `belongings` | `text` |  |  | What came with the pet (bed, leash, food, medicines) so it all goes home again. |
| `gate_notes` | `text` |  |  | Anything the parent said at drop-off: a change of food, a recent illness, who will collect. |
| `vaccinations_checked_at` | `timestamp with time zone` |  |  | When a staff member confirmed at check-in that they had seen the pet's vaccination certificates. Stamped by the database. |
| `vaccinations_checked_by` | `uuid` |  |  | Who confirmed the vaccinations at check-in. Stamped by the database. |
| `notes` | `text` |  |  |  |
| `source` | `text` | yes | `'staff'::text` | staff: entered by the kennel. intake: started from the public intake form. parent: asked for by the parent through their booking link, as a request. |
| `group_id` | `uuid` |  |  | Shared by bookings made together, e.g. two dogs from one family. Set when booked and never changed, because the family is billed on one bill. |
| `series_id` | `uuid` |  |  | Day boarding booked to repeat (every Monday and Wednesday until a date): each day is its own booking, and they share this id. Not a family: each is billed on its own. |
| `pass_id` | `uuid` |  |  | The day boarding pack (passes) this day is paid from: then it costs nothing on its own (rate 0). bookings_check_pass keeps the pack from going below zero. |
| `package_id` | `uuid` |  |  | The package this stay was booked as (M37), put on it by apply_package(): the stay is billed as one line at package_price_minor, and the package's appointments and extras cost nothing on their own. |
| `package_price_minor` | `bigint` |  |  | With package_id: what the whole stay costs as the package. Set by apply_package(), never changed. |
| `waitlisted_at` | `timestamp with time zone` |  |  | For a request on the waiting list: when it joined, which is its place in line (the earliest first). Stamped by the database with the real time, never moved, and cleared when the request is confirmed or cancelled. Empty: not waiting. |
| `public_token` | `text` | yes | `new_token()` | Secret in the parent's stay page link (/s/{token}). Anyone holding the link can see the stay, nothing else. |
| `created_by` | `uuid` |  |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `bookings_pkey`: `PRIMARY KEY (id)`
- Unique `bookings_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `bookings_org_id_id_pet_id_key`: `UNIQUE (org_id, id, pet_id)`
- Unique `bookings_public_token_key`: `UNIQUE (public_token)`
- Foreign key `bookings_checked_in_by_fkey`: `FOREIGN KEY (checked_in_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `bookings_checked_out_by_fkey`: `FOREIGN KEY (checked_out_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `bookings_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `bookings_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE RESTRICT`
- Foreign key `bookings_org_id_client_id_pet_id_fkey`: `FOREIGN KEY (org_id, client_id, pet_id) REFERENCES pets(org_id, client_id, id) ON UPDATE CASCADE ON DELETE RESTRICT`
- Foreign key `bookings_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `bookings_org_id_kennel_id_fkey`: `FOREIGN KEY (org_id, kennel_id) REFERENCES kennels(org_id, id) ON DELETE SET NULL (kennel_id)`
- Foreign key `bookings_package_fkey`: `FOREIGN KEY (org_id, package_id) REFERENCES packages(org_id, id) ON DELETE RESTRICT`
- Foreign key `bookings_pass_fkey`: `FOREIGN KEY (org_id, pass_id) REFERENCES passes(org_id, id) ON DELETE RESTRICT`
- Foreign key `bookings_vaccinations_checked_by_fkey`: `FOREIGN KEY (vaccinations_checked_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Exclusion `bookings_no_kennel_overlap`: `EXCLUDE USING gist (kennel_id WITH =, stay_range(kind, start_date, end_date) WITH &&, client_id WITH <>) WHERE (((kennel_id IS NOT NULL) AND (status = ANY (ARRAY['confirmed'::booking_status, 'checked_in'::booking_status]))))`
- Exclusion `bookings_no_pet_overlap`: `EXCLUDE USING gist (pet_id WITH =, stay_range(kind, start_date, end_date) WITH &&) WHERE ((status = ANY (ARRAY['confirmed'::booking_status, 'checked_in'::booking_status])))`
- Check `bookings_alone_rate_minor_check`: `CHECK (((alone_rate_minor IS NULL) OR (alone_rate_minor >= 0)))`
- Check `bookings_at_most_a_year`: `CHECK (((end_date - start_date) <= 366))`
- Check `bookings_boarding_from_inside_stay`: `CHECK (((boarding_from IS NULL) OR ((kind = 'boarding'::booking_kind) AND (boarding_from > start_date) AND (boarding_from < end_date))))`
- Check `bookings_boarding_has_a_night`: `CHECK (((kind <> 'boarding'::booking_kind) OR (end_date > start_date)))`
- Check `bookings_dates_in_order`: `CHECK ((end_date >= start_date))`
- Check `bookings_day_part_has_a_price`: `CHECK (((boarding_from IS NULL) = (day_rate_minor IS NULL)))`
- Check `bookings_day_rate_minor_check`: `CHECK (((day_rate_minor IS NULL) OR (day_rate_minor >= 0)))`
- Check `bookings_discount_minor_check`: `CHECK ((discount_minor >= 0))`
- Check `bookings_package_is_the_price`: `CHECK ((((package_id IS NULL) AND (package_price_minor IS NULL)) OR ((package_id IS NOT NULL) AND (package_price_minor IS NOT NULL) AND (rate_minor = 0) AND (alone_rate_minor IS NULL) AND (boarding_from IS NULL) AND (pass_id IS NULL) AND (series_id IS NULL))))`
- Check `bookings_package_price_minor_check`: `CHECK (((package_price_minor IS NULL) OR (package_price_minor >= 0)))`
- Check `bookings_pass_covers_the_price`: `CHECK (((pass_id IS NULL) OR ((kind = 'daycare'::booking_kind) AND (rate_minor = 0) AND (discount_minor = 0) AND (alone_rate_minor IS NULL) AND (boarding_from IS NULL))))`
- Check `bookings_rate_minor_check`: `CHECK ((rate_minor >= 0))`
- Check `bookings_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `bookings_series_is_day_boarding`: `CHECK (((series_id IS NULL) OR (kind = 'daycare'::booking_kind)))`
- Check `bookings_source_check`: `CHECK ((source = ANY (ARRAY['staff'::text, 'intake'::text, 'parent'::text])))`
- Check `bookings_tax_rate_bp_check`: `CHECK (((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000)))`
- Check `bookings_waitlist_is_a_request`: `CHECK (((waitlisted_at IS NULL) OR (status = 'requested'::booking_status)))`

**Indexes**

- `CREATE INDEX bookings_org_client_idx ON public.bookings USING btree (org_id, client_id)`
- `CREATE INDEX bookings_org_dates_idx ON public.bookings USING btree (org_id, start_date, end_date)`
- `CREATE INDEX bookings_org_pass_idx ON public.bookings USING btree (org_id, pass_id) WHERE (pass_id IS NOT NULL)`
- `CREATE INDEX bookings_org_pet_idx ON public.bookings USING btree (org_id, pet_id)`
- `CREATE INDEX bookings_org_series_idx ON public.bookings USING btree (org_id, series_id) WHERE (series_id IS NOT NULL)`
- `CREATE INDEX bookings_org_status_idx ON public.bookings USING btree (org_id, status)`
- `CREATE INDEX bookings_org_waitlist_idx ON public.bookings USING btree (org_id, waitlisted_at) WHERE (waitlisted_at IS NOT NULL)`

**Triggers**

- `bookings_audit` (after insert or delete or update) runs `audit_row()`
- `bookings_check_capacity` (after insert or update of status, start_date, end_date, kind, kennel_id) runs `bookings_check_capacity()`
- `bookings_check_group` (before insert or update of group_id, client_id) runs `bookings_check_group()`
- `bookings_check_package` (before insert or update of package_id, package_price_minor) runs `bookings_check_package()`
- `bookings_check_pass` (before insert or update of pass_id, status, start_date, end_date, kind, client_id) runs `bookings_check_pass()`
- `bookings_check_shared_price` (after insert) runs `bookings_check_shared_price()`
- `bookings_follow_appointments` (after update of status, start_date, end_date) runs `bookings_follow_appointments()`
- `bookings_forbid_org_change` (before update) runs `forbid_org_change()`
- `bookings_guard_price` (before insert or update) runs `bookings_guard_price()`
- `bookings_keep_billed_month` (before update of start_date) runs `bookings_keep_billed_month()`
- `bookings_set_updated_at` (before update) runs `set_updated_at()`
- `bookings_stamp_status` (before insert or update) runs `bookings_stamp_status()`
- `bookings_stamp_vaccinations_checked` (before insert or update) runs `stamp_when_set()`

**Access**

- Signed-in users may: select, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `bookings_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `bookings_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `bookings_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `bookings_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### care_items

A routine that repeats every day. With no pet it is the house routine for every boarded pet (e.g. breakfast at 9); with a pet it is that pet's own (e.g. a tablet at 8).

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` |  |  | Empty for a house routine that applies to every pet in house. |
| `kind` | `care_kind` | yes |  |  |
| `label` | `text` | yes |  |  |
| `details` | `text` |  |  | How to do it: "200 g kibble with warm water", "1 tablet with food". |
| `due_time` | `time without time zone` | yes |  |  |
| `is_active` | `boolean` | yes | `true` |  |
| `sort_order` | `integer` | yes | `0` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `care_items_pkey`: `PRIMARY KEY (id)`
- Unique `care_items_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `care_items_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `care_items_org_id_pet_id_fkey`: `FOREIGN KEY (org_id, pet_id) REFERENCES pets(org_id, id) ON DELETE CASCADE`
- Check `care_items_label_check`: `CHECK (((char_length(label) >= 1) AND (char_length(label) <= 80)))`

**Indexes**

- `CREATE INDEX care_items_org_pet_idx ON public.care_items USING btree (org_id, pet_id)`

**Triggers**

- `care_items_forbid_org_change` (before update) runs `forbid_org_change()`
- `care_items_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `care_items_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `care_items_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `care_items_insert_for_pet` (insert): new values must satisfy `((pet_id IS NOT NULL) AND (org_id IN ( SELECT my_org_ids() AS my_org_ids)))`
- `care_items_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `care_items_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `care_items_update_for_pet` (update): rows where `((pet_id IS NOT NULL) AND (org_id IN ( SELECT my_org_ids() AS my_org_ids)))`; new values must satisfy `((pet_id IS NOT NULL) AND (org_id IN ( SELECT my_org_ids() AS my_org_ids)))`

### care_tasks

One thing to do for one pet on one day. The Tasks screen is this table, grouped by time. Created from care_items by generate_care_tasks, or added by hand.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `booking_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `care_item_id` | `uuid` |  |  | The routine this task came from. Empty for one-off tasks added by staff. |
| `task_date` | `date` | yes |  |  |
| `kind` | `care_kind` | yes |  |  |
| `label` | `text` | yes |  |  |
| `details` | `text` |  |  |  |
| `due_time` | `time without time zone` |  |  |  |
| `status` | `task_status` | yes | `'pending'::task_status` |  |
| `done_at` | `timestamp with time zone` |  |  |  |
| `done_by` | `uuid` |  |  | Who ticked it. Stamped automatically. |
| `note` | `text` |  |  |  |
| `photo_path` | `text` |  |  | Proof photo inside the pet-media storage bucket. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `care_tasks_pkey`: `PRIMARY KEY (id)`
- Foreign key `care_tasks_done_by_fkey`: `FOREIGN KEY (done_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `care_tasks_org_id_booking_id_pet_id_fkey`: `FOREIGN KEY (org_id, booking_id, pet_id) REFERENCES bookings(org_id, id, pet_id) ON DELETE CASCADE`
- Foreign key `care_tasks_org_id_care_item_id_fkey`: `FOREIGN KEY (org_id, care_item_id) REFERENCES care_items(org_id, id) ON DELETE SET NULL (care_item_id)`
- Foreign key `care_tasks_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `care_tasks_label_check`: `CHECK (((char_length(label) >= 1) AND (char_length(label) <= 80)))`
- Check `care_tasks_photo_in_org`: `CHECK (paths_in_org(ARRAY[photo_path], org_id))`
- Check `care_tasks_skipped_medication_needs_note`: `CHECK (((kind <> 'medication'::care_kind) OR (status <> 'skipped'::task_status) OR (char_length(btrim(COALESCE(note, ''::text))) > 0)))`

**Indexes**

- `CREATE UNIQUE INDEX care_tasks_once_per_routine ON public.care_tasks USING btree (booking_id, task_date, care_item_id) WHERE (care_item_id IS NOT NULL)`
- `CREATE INDEX care_tasks_org_date_idx ON public.care_tasks USING btree (org_id, task_date, due_time)`

**Triggers**

- `care_tasks_forbid_org_change` (before update) runs `forbid_org_change()`
- `care_tasks_set_updated_at` (before update) runs `set_updated_at()`
- `care_tasks_stamp_done` (before insert or update) runs `stamp_done()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `care_tasks_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `care_tasks_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `care_tasks_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `care_tasks_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### client_addresses

A place a parent wants food delivered or a pet picked up. Personal data, like a phone number: owners and managers change one, it is in the export, and erasing the parent deletes it.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `client_id` | `uuid` | yes |  |  |
| `kind` | `address_kind` | yes | `'home'::address_kind` |  |
| `line` | `text` | yes |  | House or flat number, building and street, as the parent wrote it. |
| `area` | `text` |  |  | The area or locality, as people there name it. |
| `postal_code` | `text` | yes |  | PIN code in India (six digits), or the postal code elsewhere (with at least one digit). Matched against service_areas. |
| `map_url` | `text` |  |  | A map link the parent shared (https only), for whoever delivers. |
| `door_note` | `text` |  |  | For whoever delivers: gate code, floor, leave with the guard. |
| `created_by` | `uuid` |  |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `client_addresses_pkey`: `PRIMARY KEY (id)`
- Unique `client_addresses_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `client_addresses_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `client_addresses_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE CASCADE`
- Foreign key `client_addresses_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `client_addresses_area_check`: `CHECK (((area IS NULL) OR (char_length(area) <= 120)))`
- Check `client_addresses_door_note_check`: `CHECK (((door_note IS NULL) OR (char_length(door_note) <= 300)))`
- Check `client_addresses_line_check`: `CHECK (((char_length(line) >= 1) AND (char_length(line) <= 300)))`
- Check `client_addresses_map_url_check`: `CHECK (((map_url IS NULL) OR ((map_url ~ '^https://'::text) AND (char_length(map_url) <= 500))))`
- Check `client_addresses_postal_code_check`: `CHECK (((postal_code ~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$'::text) AND (postal_code ~ '[0-9]'::text)))`

**Indexes**

- `CREATE INDEX client_addresses_org_client_idx ON public.client_addresses USING btree (org_id, client_id)`

**Triggers**

- `client_addresses_forbid_org_change` (before update) runs `forbid_org_change()`
- `client_addresses_set_updated_at` (before update) runs `set_updated_at()`
- `client_addresses_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `client_addresses_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `client_addresses_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `client_addresses_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `client_addresses_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### clients

A pet parent: the person who books and pays. Personal data under India's DPDP Act, so collect only what the kennel needs.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `full_name` | `text` | yes |  |  |
| `phone` | `text` | yes |  | Mobile number in E.164 form. Also the WhatsApp address and how a returning parent is recognised. |
| `alt_phone` | `text` |  |  |  |
| `email` | `text` |  |  |  |
| `address` | `text` |  |  |  |
| `city` | `text` |  |  |  |
| `postal_code` | `text` |  |  |  |
| `gst_state_code` | `text` |  |  | Buyer's GST state code. Only needed when invoicing a GST-registered buyer in another state. |
| `tax_id` | `text` |  |  | Buyer's GSTIN, for business customers who want it printed on the invoice. |
| `emergency_name` | `text` |  |  | Someone to call when the parent cannot be reached during a stay. |
| `emergency_phone` | `text` |  |  |  |
| `notes` | `text` |  |  |  |
| `consent_at` | `timestamp with time zone` |  |  | When the parent agreed to the kennel holding their details. Evidence for DPDP. |
| `consent_source` | `text` |  |  | intake_form: the parent ticked the box themselves. food_order: they ticked it on the food order page. staff: a staff member recorded verbal consent. |
| `bill_translation` | `text` |  |  | Bills are in English. A parent who asks gets each heading of their bills also in this language, in brackets: hi or kn. Empty: English only. |
| `request_token` | `text` |  | `new_token()` | Secret in the parent's own booking link (/b/{token}), where they ask for a stay. renew_request_link() replaces it, so an old link stops working; erasing the parent clears it. |
| `created_by` | `uuid` |  |  |  |
| `deleted_at` | `timestamp with time zone` |  |  | Soft delete. Hidden from lists but kept so that past bookings and invoices still make sense. |
| `erased_at` | `timestamp with time zone` |  |  | When the parent's details were erased on their request (erase_client). The row stays, empty, because issued bills and past stays point at it. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `clients_pkey`: `PRIMARY KEY (id)`
- Unique `clients_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `clients_request_token_key`: `UNIQUE (request_token)`
- Foreign key `clients_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `clients_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `clients_alt_phone_check`: `CHECK (((alt_phone IS NULL) OR (alt_phone ~ '^\+[1-9][0-9]{7,14}$'::text)))`
- Check `clients_bill_translation_check`: `CHECK (((bill_translation IS NULL) OR (bill_translation = ANY (ARRAY['hi'::text, 'kn'::text]))))`
- Check `clients_consent_source_check`: `CHECK (((consent_source IS NULL) OR (consent_source = ANY (ARRAY['intake_form'::text, 'staff'::text, 'food_order'::text]))))`
- Check `clients_erased_stay_hidden`: `CHECK (((erased_at IS NULL) OR (deleted_at IS NOT NULL)))`
- Check `clients_full_name_check`: `CHECK (((char_length(full_name) >= 1) AND (char_length(full_name) <= 120)))`
- Check `clients_gst_state_code_check`: `CHECK (((gst_state_code IS NULL) OR (gst_state_code ~ '^[0-9]{2}$'::text)))`
- Check `clients_phone_check`: `CHECK (((phone ~ '^\+[1-9][0-9]{7,14}$'::text) OR ((erased_at IS NOT NULL) AND (phone = ''::text))))`

**Indexes**

- `CREATE INDEX clients_org_name_idx ON public.clients USING btree (org_id, lower(full_name))`
- `CREATE UNIQUE INDEX clients_org_phone_key ON public.clients USING btree (org_id, phone) WHERE (deleted_at IS NULL)`

**Triggers**

- `clients_forbid_org_change` (before update) runs `forbid_org_change()`
- `clients_guard_hiding` (before update of deleted_at) runs `guard_hiding()`
- `clients_guard_phone` (before update) runs `clients_guard_phone()`
- `clients_hide_pets` (after update of deleted_at) runs `clients_hide_pets()`
- `clients_set_updated_at` (before update) runs `set_updated_at()`
- `clients_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `clients_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `clients_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `clients_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `clients_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### courses

A course of training sessions sold to a parent for one pet, at the price the trainer quoted, on a bill of its own. Each session booked from it (appointments.course_id) costs nothing on its own; course_balances counts what is left.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `client_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `service_id` | `uuid` | yes |  | The training service its sessions are. |
| `name` | `text` | yes |  | What it is called on the bill ("Puppy basics, 6 sessions"). |
| `sessions` | `smallint` | yes |  | How many sessions were bought. |
| `price_minor` | `bigint` | yes |  | What the whole course costs, set by an owner or manager from the trainer's quote. |
| `starts_on` | `date` | yes |  |  |
| `invoice_id` | `uuid` |  |  | The bill it was sold on. |
| `notes` | `text` |  |  |  |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `courses_pkey`: `PRIMARY KEY (id)`
- Unique `courses_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `courses_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `courses_invoice_fkey`: `FOREIGN KEY (org_id, invoice_id) REFERENCES invoices(org_id, id) ON DELETE SET NULL (invoice_id)`
- Foreign key `courses_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE RESTRICT`
- Foreign key `courses_org_id_client_id_pet_id_fkey`: `FOREIGN KEY (org_id, client_id, pet_id) REFERENCES pets(org_id, client_id, id) ON UPDATE CASCADE ON DELETE RESTRICT`
- Foreign key `courses_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `courses_org_id_service_id_fkey`: `FOREIGN KEY (org_id, service_id) REFERENCES appointment_services(org_id, id) ON DELETE RESTRICT`
- Check `courses_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `courses_notes_check`: `CHECK (((notes IS NULL) OR (char_length(notes) <= 500)))`
- Check `courses_price_minor_check`: `CHECK ((price_minor >= 0))`
- Check `courses_sessions_check`: `CHECK (((sessions >= 1) AND (sessions <= 100)))`

**Indexes**

- `CREATE INDEX courses_org_pet_idx ON public.courses USING btree (org_id, pet_id)`

**Triggers**

- `courses_audit` (after insert or delete or update) runs `audit_row()`
- `courses_forbid_org_change` (before update) runs `forbid_org_change()`
- `courses_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `courses_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `courses_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `courses_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `courses_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### credit_note_lines

The lines of a credit note: what is taken back, with its tax worked out as on the bill.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `credit_note_id` | `uuid` | yes |  |  |
| `sort_order` | `integer` | yes | `0` |  |
| `description` | `text` | yes |  |  |
| `sac_code` | `text` |  |  |  |
| `quantity` | `numeric(10,2)` | yes |  |  |
| `unit_price_minor` | `bigint` | yes |  |  |
| `discount_minor` | `bigint` | yes |  |  |
| `taxable_minor` | `bigint` | yes |  |  |
| `tax_rate_bp` | `integer` | yes |  |  |
| `cgst_minor` | `bigint` | yes |  |  |
| `sgst_minor` | `bigint` | yes |  |  |
| `igst_minor` | `bigint` | yes |  |  |
| `tax_minor` | `bigint` | yes |  |  |
| `total_minor` | `bigint` | yes |  |  |

**Constraints**

- Primary key `credit_note_lines_pkey`: `PRIMARY KEY (id)`
- Foreign key `credit_note_lines_org_id_credit_note_id_fkey`: `FOREIGN KEY (org_id, credit_note_id) REFERENCES credit_notes(org_id, id) ON DELETE CASCADE`
- Foreign key `credit_note_lines_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `credit_note_lines_cgst_minor_check`: `CHECK ((cgst_minor >= 0))`
- Check `credit_note_lines_description_check`: `CHECK (((char_length(description) >= 1) AND (char_length(description) <= 300)))`
- Check `credit_note_lines_discount_minor_check`: `CHECK ((discount_minor >= 0))`
- Check `credit_note_lines_igst_minor_check`: `CHECK ((igst_minor >= 0))`
- Check `credit_note_lines_quantity_check`: `CHECK ((quantity > (0)::numeric))`
- Check `credit_note_lines_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `credit_note_lines_sgst_minor_check`: `CHECK ((sgst_minor >= 0))`
- Check `credit_note_lines_tax_minor_check`: `CHECK ((tax_minor >= 0))`
- Check `credit_note_lines_tax_rate_bp_check`: `CHECK (((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000)))`
- Check `credit_note_lines_taxable_minor_check`: `CHECK ((taxable_minor >= 0))`
- Check `credit_note_lines_total_minor_check`: `CHECK ((total_minor >= 0))`
- Check `credit_note_lines_unit_price_minor_check`: `CHECK ((unit_price_minor >= 0))`

**Indexes**

- `CREATE INDEX credit_note_lines_note_idx ON public.credit_note_lines USING btree (org_id, credit_note_id, sort_order)`

**Triggers**

- `credit_note_lines_forbid_org_change` (before update) runs `forbid_org_change()`

**Access**

- Signed-in users may: select (then narrowed by the policies below). Anonymous visitors: nothing.
- `credit_note_lines_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### credit_notes

A credit note: takes back all or part of an issued bill, counted in the month it is made. Written only by issue_credit_note(); never changed.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `invoice_id` | `uuid` | yes |  | The bill it takes back from. Its buyer, seller and tax details are the bill's. |
| `number` | `text` | yes |  | Printed number, CN/YY-YY/NNNN. Consecutive within a financial year, its own series, never reused. |
| `fiscal_year` | `text` | yes |  |  |
| `seq` | `integer` | yes |  |  |
| `issued_on` | `date` | yes |  | Credit note date: the kennel's local date when it was made. Tax reports count it in this month. |
| `issued_by` | `uuid` |  |  |  |
| `reason` | `text` | yes |  | Why the bill is being taken back, such as "Went home two nights early". |
| `currency` | `text` | yes |  |  |
| `subtotal_minor` | `bigint` | yes |  |  |
| `discount_minor` | `bigint` | yes |  |  |
| `taxable_minor` | `bigint` | yes |  |  |
| `cgst_minor` | `bigint` | yes |  |  |
| `sgst_minor` | `bigint` | yes |  |  |
| `igst_minor` | `bigint` | yes |  |  |
| `tax_minor` | `bigint` | yes |  |  |
| `round_off_minor` | `bigint` | yes |  |  |
| `total_minor` | `bigint` | yes |  | What is taken off the bill: taxable + tax + round off. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `credit_notes_pkey`: `PRIMARY KEY (id)`
- Unique `credit_notes_org_id_fiscal_year_seq_key`: `UNIQUE (org_id, fiscal_year, seq)`
- Unique `credit_notes_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `credit_notes_org_id_number_key`: `UNIQUE (org_id, number)`
- Foreign key `credit_notes_issued_by_fkey`: `FOREIGN KEY (issued_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `credit_notes_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `credit_notes_org_id_invoice_id_fkey`: `FOREIGN KEY (org_id, invoice_id) REFERENCES invoices(org_id, id) ON DELETE RESTRICT`
- Check `credit_notes_cgst_minor_check`: `CHECK ((cgst_minor >= 0))`
- Check `credit_notes_currency_check`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`
- Check `credit_notes_discount_minor_check`: `CHECK ((discount_minor >= 0))`
- Check `credit_notes_igst_minor_check`: `CHECK ((igst_minor >= 0))`
- Check `credit_notes_number_check`: `CHECK (((char_length(number) <= 16) AND (number ~ '^[A-Za-z0-9/-]+$'::text)))`
- Check `credit_notes_reason_check`: `CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 500)))`
- Check `credit_notes_round_off_minor_check`: `CHECK (((round_off_minor >= '-99'::integer) AND (round_off_minor <= 99)))`
- Check `credit_notes_seq_check`: `CHECK ((seq > 0))`
- Check `credit_notes_sgst_minor_check`: `CHECK ((sgst_minor >= 0))`
- Check `credit_notes_subtotal_minor_check`: `CHECK ((subtotal_minor >= 0))`
- Check `credit_notes_tax_minor_check`: `CHECK ((tax_minor >= 0))`
- Check `credit_notes_taxable_minor_check`: `CHECK ((taxable_minor >= 0))`
- Check `credit_notes_total_minor_check`: `CHECK ((total_minor > 0))`

**Indexes**

- `CREATE INDEX credit_notes_org_invoice_idx ON public.credit_notes USING btree (org_id, invoice_id)`
- `CREATE INDEX credit_notes_org_issued_idx ON public.credit_notes USING btree (org_id, issued_on DESC)`

**Triggers**

- `credit_notes_audit` (after insert or delete or update) runs `audit_row()`
- `credit_notes_forbid_org_change` (before update) runs `forbid_org_change()`

**Access**

- Signed-in users may: select (then narrowed by the policies below). Anonymous visitors: nothing.
- `credit_notes_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### day_packs

The day boarding packs a kennel sells: so many days, at a price, to use within so many days.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `name` | `text` | yes |  |  |
| `days` | `integer` | yes |  | How many days of day boarding the pack gives. |
| `price_minor` | `bigint` | yes |  |  |
| `valid_days` | `integer` | yes |  | How long it lasts from the day it starts, in days: 60 means the start day and the 59 after it. |
| `tax_rate_bp` | `integer` |  |  | Tax rate on the pack's bill, in basis points. Empty: the kennel's usual rate. |
| `sac_code` | `text` |  |  | Service code printed on the pack's bill. The kennel's accountant decides it. |
| `is_active` | `boolean` | yes | `true` | False once taken off the list: packs already sold keep working. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `day_packs_pkey`: `PRIMARY KEY (id)`
- Unique `day_packs_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `day_packs_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `day_packs_days_check`: `CHECK (((days >= 1) AND (days <= 365)))`
- Check `day_packs_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `day_packs_price_minor_check`: `CHECK ((price_minor >= 0))`
- Check `day_packs_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `day_packs_tax_rate_bp_check`: `CHECK (((tax_rate_bp IS NULL) OR ((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000))))`
- Check `day_packs_valid_days_check`: `CHECK (((valid_days >= 1) AND (valid_days <= 730)))`

**Triggers**

- `day_packs_forbid_org_change` (before update) runs `forbid_org_change()`
- `day_packs_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `day_packs_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `day_packs_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `day_packs_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `day_packs_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### deliveries

Food going to a pet's home on a day: made ahead from a subscription, or a one-off trial, order or item, or a replacement. Grams, recipe and price are copied on when it is made, so a later change to the rate card or the rotation never changes it.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `kind` | `delivery_kind` | yes |  |  |
| `client_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `subscription_id` | `uuid` |  |  |  |
| `product_id` | `uuid` |  |  |  |
| `delivery_date` | `date` | yes |  |  |
| `slot` | `delivery_slot` | yes | `'morning'::delivery_slot` |  |
| `address_id` | `uuid` |  |  |  |
| `covers_days` | `smallint` |  |  | Subscriptions: how many days of food it is, until the next delivery. |
| `grams` | `integer` | yes | `0` | Food in grams: whole packs (organizations.food_pack_g). 0 for an item. |
| `packs` | `integer` | yes | `0` | How many packs. |
| `quantity` | `integer` | yes | `1` | Items only: how many pieces. |
| `recipe_id` | `uuid` |  |  | The recipe it is cooked from: the rotation's for a subscription, chosen for a trial or order. Empty for an item. |
| `version_id` | `uuid` |  |  | The recipe version current when it was made. |
| `unit_price_minor` | `bigint` | yes | `0` | Per kilo (subscription, order), the whole trial, or per piece (item), copied from the rate card when made. 0 for a replacement. |
| `price_minor` | `bigint` | yes | `0` | What the food comes to, worked out by the database from the grams or pieces and the unit price. |
| `delivery_charge_minor` | `bigint` | yes | `0` | The area's delivery charge, copied when made from the address's PIN code. |
| `tax_rate_bp` | `integer` | yes | `0` | Tax rate copied from the rate card when made, in basis points. |
| `sac_code` | `text` |  |  |  |
| `status` | `delivery_status` | yes | `'planned'::delivery_status` |  |
| `cancel_reason` | `text` |  |  |  |
| `cancelled_at` | `timestamp with time zone` |  |  |  |
| `cancelled_by` | `uuid` |  |  |  |
| `superseded` | `boolean` | yes | `false` | True when it was cancelled because its subscription changed and a new delivery was made in its place. |
| `batch_id` | `uuid` |  |  | The batch it was packed from: of its own recipe, within its use-by date. |
| `packed_at` | `timestamp with time zone` |  |  |  |
| `packed_by` | `uuid` |  |  |  |
| `run_id` | `uuid` |  |  | The rider's run it goes out on (M31). |
| `run_position` | `smallint` |  |  | Its place in the run; staff change the order. |
| `delivered_at` | `timestamp with time zone` |  |  | When it was handed over, or found nobody home, or refused. |
| `proof_path` | `text` |  |  | Photo taken at the door, under {org_id}/deliveries/{delivery_id}/. |
| `replaces_id` | `uuid` |  |  | For a replacement: the delivery it replaces. |
| `appointment_id` | `uuid` |  |  | For a made-to-order item for a party (M36): the party it is for. |
| `inscription` | `text` |  |  | For a made-to-order item: the name or words to write on it ("Happy birthday Biscuit"). |
| `note` | `text` |  |  | For the kitchen or the rider ("no carrots this time"). |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `deliveries_pkey`: `PRIMARY KEY (id)`
- Unique `deliveries_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `deliveries_cancelled_by_fkey`: `FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `deliveries_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `deliveries_org_id_address_id_fkey`: `FOREIGN KEY (org_id, address_id) REFERENCES client_addresses(org_id, id) ON DELETE SET NULL (address_id)`
- Foreign key `deliveries_org_id_appointment_id_fkey`: `FOREIGN KEY (org_id, appointment_id) REFERENCES appointments(org_id, id) ON DELETE SET NULL (appointment_id)`
- Foreign key `deliveries_org_id_batch_id_fkey`: `FOREIGN KEY (org_id, batch_id) REFERENCES batches(org_id, id) ON DELETE RESTRICT`
- Foreign key `deliveries_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE RESTRICT`
- Foreign key `deliveries_org_id_client_id_pet_id_fkey`: `FOREIGN KEY (org_id, client_id, pet_id) REFERENCES pets(org_id, client_id, id) ON UPDATE CASCADE ON DELETE RESTRICT`
- Foreign key `deliveries_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `deliveries_org_id_product_id_fkey`: `FOREIGN KEY (org_id, product_id) REFERENCES food_products(org_id, id) ON DELETE RESTRICT`
- Foreign key `deliveries_org_id_recipe_id_fkey`: `FOREIGN KEY (org_id, recipe_id) REFERENCES recipes(org_id, id) ON DELETE RESTRICT`
- Foreign key `deliveries_org_id_replaces_id_fkey`: `FOREIGN KEY (org_id, replaces_id) REFERENCES deliveries(org_id, id) ON DELETE RESTRICT`
- Foreign key `deliveries_org_id_run_id_fkey`: `FOREIGN KEY (org_id, run_id) REFERENCES delivery_runs(org_id, id) ON DELETE SET NULL (run_id)`
- Foreign key `deliveries_org_id_subscription_id_fkey`: `FOREIGN KEY (org_id, subscription_id) REFERENCES subscriptions(org_id, id) ON DELETE RESTRICT`
- Foreign key `deliveries_org_id_version_id_fkey`: `FOREIGN KEY (org_id, version_id) REFERENCES recipe_versions(org_id, id) ON DELETE RESTRICT`
- Foreign key `deliveries_packed_by_fkey`: `FOREIGN KEY (packed_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `deliveries_cancel_has_reason`: `CHECK (((status = 'cancelled'::delivery_status) = (cancel_reason IS NOT NULL)))`
- Check `deliveries_cancel_reason_check`: `CHECK (((cancel_reason IS NULL) OR (char_length(cancel_reason) <= 300)))`
- Check `deliveries_covers_days_check`: `CHECK (((covers_days IS NULL) OR ((covers_days >= 1) AND (covers_days <= 7))))`
- Check `deliveries_delivery_charge_minor_check`: `CHECK ((delivery_charge_minor >= 0))`
- Check `deliveries_grams_check`: `CHECK (((grams >= 0) AND ((grams % 10) = 0)))`
- Check `deliveries_inscription_check`: `CHECK (((inscription IS NULL) OR ((char_length(inscription) >= 1) AND (char_length(inscription) <= 60))))`
- Check `deliveries_note_check`: `CHECK (((note IS NULL) OR (char_length(note) <= 300)))`
- Check `deliveries_packed_from_batch`: `CHECK (((status <> ALL (ARRAY['packed'::delivery_status, 'out'::delivery_status, 'delivered'::delivery_status, 'not_home'::delivery_status, 'refused'::delivery_status])) OR (batch_id IS NOT NULL) OR (kind = 'item'::delivery_kind)))`
- Check `deliveries_packs_check`: `CHECK ((packs >= 0))`
- Check `deliveries_price_minor_check`: `CHECK ((price_minor >= 0))`
- Check `deliveries_product_unless_replacement`: `CHECK (((kind = 'replacement'::delivery_kind) OR (product_id IS NOT NULL)))`
- Check `deliveries_proof_in_org`: `CHECK (paths_in_org(ARRAY[proof_path], org_id))`
- Check `deliveries_quantity_check`: `CHECK (((quantity >= 1) AND (quantity <= 100)))`
- Check `deliveries_replacement_names_original`: `CHECK (((kind = 'replacement'::delivery_kind) = (replaces_id IS NOT NULL)))`
- Check `deliveries_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `deliveries_subscription_kind`: `CHECK (((kind = 'subscription'::delivery_kind) = (subscription_id IS NOT NULL)))`
- Check `deliveries_tax_rate_bp_check`: `CHECK (((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000)))`
- Check `deliveries_unit_price_minor_check`: `CHECK ((unit_price_minor >= 0))`

**Indexes**

- `CREATE UNIQUE INDEX deliveries_one_per_subscription_day ON public.deliveries USING btree (org_id, subscription_id, delivery_date) WHERE ((subscription_id IS NOT NULL) AND (status <> 'cancelled'::delivery_status))`
- `CREATE UNIQUE INDEX deliveries_one_trial_per_pet ON public.deliveries USING btree (org_id, pet_id) WHERE ((kind = 'trial'::delivery_kind) AND (status <> 'cancelled'::delivery_status))`
- `CREATE INDEX deliveries_org_date_idx ON public.deliveries USING btree (org_id, delivery_date, slot)`
- `CREATE INDEX deliveries_org_run_idx ON public.deliveries USING btree (org_id, run_id, run_position)`

**Triggers**

- `deliveries_check_batch` (before update of batch_id) runs `deliveries_check_batch()`
- `deliveries_check_run` (before insert or update of run_id, delivery_date, slot) runs `deliveries_check_run()`
- `deliveries_forbid_org_change` (before update) runs `forbid_org_change()`
- `deliveries_guard` (before delete or update) runs `deliveries_guard()`
- `deliveries_price` (before insert or update of kind, product_id, grams, quantity, unit_price_minor, address_id) runs `deliveries_price()`
- `deliveries_set_updated_at` (before update) runs `set_updated_at()`
- `deliveries_stamp_actor` (before insert or update) runs `stamp_actor()`
- `deliveries_stamp_packed` (before insert or update of packed_at) runs `stamp_when_set()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `deliveries_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `deliveries_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `deliveries_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `deliveries_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### delivery_problems

A parent said a delivery was damaged, late or wrong, within problem_window_hours of it, with a photo. Staff replace it (a new delivery at no charge) or refund it (a credit note and a refund).

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `delivery_id` | `uuid` | yes |  |  |
| `kind` | `problem_kind` | yes |  |  |
| `note` | `text` |  |  |  |
| `photo_path` | `text` |  |  | The parent's photo, under {org_id}/deliveries/{delivery_id}/. |
| `reported_at` | `timestamp with time zone` | yes | `now()` |  |
| `reported_by` | `uuid` |  | `auth.uid()` |  |
| `outcome` | `problem_outcome` |  |  | What was done about it. Empty: not dealt with yet. |
| `replacement_id` | `uuid` |  |  | The delivery made again, when it was replaced. |
| `resolved_at` | `timestamp with time zone` |  |  |  |
| `resolved_by` | `uuid` |  |  |  |

**Constraints**

- Primary key `delivery_problems_pkey`: `PRIMARY KEY (id)`
- Unique `delivery_problems_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `delivery_problems_org_id_delivery_id_fkey`: `FOREIGN KEY (org_id, delivery_id) REFERENCES deliveries(org_id, id) ON DELETE CASCADE`
- Foreign key `delivery_problems_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `delivery_problems_org_id_replacement_id_fkey`: `FOREIGN KEY (org_id, replacement_id) REFERENCES deliveries(org_id, id) ON DELETE SET NULL (replacement_id)`
- Foreign key `delivery_problems_reported_by_fkey`: `FOREIGN KEY (reported_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `delivery_problems_resolved_by_fkey`: `FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `delivery_problems_note_check`: `CHECK (((note IS NULL) OR (char_length(note) <= 500)))`
- Check `delivery_problems_photo_in_org`: `CHECK (paths_in_org(ARRAY[photo_path], org_id))`
- Check `delivery_problems_replaced_names_it`: `CHECK (((outcome IS DISTINCT FROM 'replaced'::problem_outcome) OR (replacement_id IS NOT NULL)))`

**Triggers**

- `delivery_problems_check` (before insert) runs `delivery_problems_check()`
- `delivery_problems_forbid_org_change` (before update) runs `forbid_org_change()`
- `delivery_problems_stamp_actor` (before insert or update) runs `stamp_actor()`
- `delivery_problems_stamp_resolved` (before insert or update of resolved_at) runs `stamp_when_set()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `delivery_problems_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `delivery_problems_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `delivery_problems_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `delivery_problems_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### delivery_runs

One rider's deliveries for one slot of one day, in order (deliveries.run_position). The rider sees this and nothing else (D45).

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `run_date` | `date` | yes |  |  |
| `slot` | `delivery_slot` | yes |  |  |
| `rider_id` | `uuid` | yes |  | Who rides it: a member of the kennel, usually with the rider role. |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `delivery_runs_pkey`: `PRIMARY KEY (id)`
- Unique `delivery_runs_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `delivery_runs_org_id_run_date_slot_rider_id_key`: `UNIQUE (org_id, run_date, slot, rider_id)`
- Foreign key `delivery_runs_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `delivery_runs_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `delivery_runs_rider_id_fkey`: `FOREIGN KEY (rider_id) REFERENCES auth.users(id) ON DELETE RESTRICT`

**Triggers**

- `delivery_runs_check_rider` (before insert or update of rider_id) runs `delivery_runs_check_rider()`
- `delivery_runs_forbid_org_change` (before update) runs `forbid_org_change()`
- `delivery_runs_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `delivery_runs_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `delivery_runs_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `delivery_runs_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `delivery_runs_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### expenses

Money the kennel spent: food, staff, repairs, vet bills. Owners and managers only.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `spent_on` | `date` | yes |  |  |
| `category` | `text` | yes |  | What it was for, in the kennel's own words: Food, Staff, Rent. Reports total by this. |
| `vendor` | `text` |  |  |  |
| `description` | `text` |  |  |  |
| `amount_minor` | `bigint` | yes |  |  |
| `method` | `payment_method` |  |  |  |
| `booking_id` | `uuid` |  |  | Set when the expense was for one pet's stay, e.g. a vet visit. |
| `is_reimbursable` | `boolean` | yes | `false` | True when the parent should pay this back; add it to the booking as an item. |
| `receipt_path` | `text` |  |  | Photo or PDF of the receipt in storage, under {org_id}/expenses/. Only owners and managers can open it. |
| `recorded_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `expenses_pkey`: `PRIMARY KEY (id)`
- Unique `expenses_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `expenses_org_id_booking_id_fkey`: `FOREIGN KEY (org_id, booking_id) REFERENCES bookings(org_id, id) ON DELETE SET NULL (booking_id)`
- Foreign key `expenses_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `expenses_recorded_by_fkey`: `FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `expenses_amount_minor_check`: `CHECK ((amount_minor > 0))`
- Check `expenses_category_check`: `CHECK (((char_length(category) >= 1) AND (char_length(category) <= 60)))`
- Check `expenses_description_check`: `CHECK (((description IS NULL) OR (char_length(description) <= 500)))`
- Check `expenses_receipt_in_org`: `CHECK (paths_in_org(ARRAY[receipt_path], org_id))`
- Check `expenses_vendor_check`: `CHECK (((vendor IS NULL) OR (char_length(vendor) <= 120)))`

**Indexes**

- `CREATE INDEX expenses_org_date_idx ON public.expenses USING btree (org_id, spent_on DESC)`

**Triggers**

- `expenses_audit` (after insert or delete or update) runs `audit_row()`
- `expenses_forbid_org_change` (before update) runs `forbid_org_change()`
- `expenses_set_updated_at` (before update) runs `set_updated_at()`
- `expenses_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `expenses_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `expenses_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `expenses_select` (select): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `expenses_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### food_orders

Food asked for from outside: an order from the website order page (a trial or a subscription), or a known parent's change from their own link (pause, skip, more). Written only by submit_food_order() and submit_food_request(); staff confirm or decline it.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `public_token` | `text` | yes | `new_token()` | Secret in the order's page after it is sent, so the parent can say they have paid (food_order_paid). |
| `kind` | `food_order_kind` | yes |  |  |
| `status` | `food_order_status` | yes |  |  |
| `client_id` | `uuid` |  |  | The parent: known from their link, or matched or made by phone when staff confirm a website order. |
| `subscription_id` | `uuid` |  |  | The subscription a change is for, or the one a confirmed order made. |
| `parent_name` | `text` |  |  |  |
| `phone` | `text` |  |  |  |
| `pet_name` | `text` |  |  |  |
| `weight_g` | `integer` |  |  |  |
| `plan` | `food_plan` |  |  |  |
| `grams_per_day` | `integer` |  |  | The portion worked out on the order page from the dog's weight; staff may change it after confirming. |
| `weekdays` | `smallint[]` |  |  |  |
| `slot` | `delivery_slot` |  |  |  |
| `line` | `text` |  |  |  |
| `area` | `text` |  |  |  |
| `postal_code` | `text` |  |  |  |
| `door_note` | `text` |  |  |  |
| `starts_on` | `date` |  |  | Website orders: the first delivery day asked for. Changes: the first day of a pause, or the delivery to skip. |
| `until_date` | `date` |  |  | A pause: the last day of it. Empty: until the parent says. |
| `grams` | `integer` |  |  | More: how much extra food, in grams. |
| `amount_minor` | `bigint` |  |  | What the order page asked the parent to pay: the trial, or the first week ahead, with delivery. Worked out by the database. |
| `note` | `text` |  |  |  |
| `consent_text` | `text` |  |  | The consent wording the parent agreed to, in the language they read it. |
| `paid_claimed_at` | `timestamp with time zone` |  |  | When the parent said they had paid. Staff check the money before confirming. |
| `reviewed_by` | `uuid` |  |  |  |
| `reviewed_at` | `timestamp with time zone` |  |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `food_orders_pkey`: `PRIMARY KEY (id)`
- Unique `food_orders_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `food_orders_public_token_key`: `UNIQUE (public_token)`
- Foreign key `food_orders_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE SET NULL (client_id)`
- Foreign key `food_orders_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `food_orders_org_id_subscription_id_fkey`: `FOREIGN KEY (org_id, subscription_id) REFERENCES subscriptions(org_id, id) ON DELETE SET NULL (subscription_id)`
- Foreign key `food_orders_reviewed_by_fkey`: `FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `food_orders_amount_minor_check`: `CHECK (((amount_minor IS NULL) OR (amount_minor >= 0)))`
- Check `food_orders_area_check`: `CHECK (((area IS NULL) OR (char_length(area) <= 120)))`
- Check `food_orders_door_note_check`: `CHECK (((door_note IS NULL) OR (char_length(door_note) <= 300)))`
- Check `food_orders_grams_check`: `CHECK (((grams IS NULL) OR ((grams >= 10) AND (grams <= 20000))))`
- Check `food_orders_grams_per_day_check`: `CHECK (((grams_per_day IS NULL) OR ((grams_per_day >= 10) AND (grams_per_day <= 5000))))`
- Check `food_orders_line_check`: `CHECK (((line IS NULL) OR (char_length(line) <= 300)))`
- Check `food_orders_note_check`: `CHECK (((note IS NULL) OR (char_length(note) <= 1000)))`
- Check `food_orders_parent_name_check`: `CHECK (((parent_name IS NULL) OR ((char_length(parent_name) >= 1) AND (char_length(parent_name) <= 120))))`
- Check `food_orders_pet_name_check`: `CHECK (((pet_name IS NULL) OR ((char_length(pet_name) >= 1) AND (char_length(pet_name) <= 80))))`
- Check `food_orders_phone_check`: `CHECK (((phone IS NULL) OR (phone ~ '^\+[1-9][0-9]{7,14}$'::text)))`
- Check `food_orders_postal_code_check`: `CHECK (((postal_code IS NULL) OR (char_length(postal_code) <= 10)))`
- Check `food_orders_weekdays_check`: `CHECK (((weekdays IS NULL) OR (((cardinality(weekdays) >= 1) AND (cardinality(weekdays) <= 7)) AND (weekdays <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]))))`
- Check `food_orders_weight_g_check`: `CHECK (((weight_g IS NULL) OR ((weight_g >= 1) AND (weight_g <= 199999))))`

**Indexes**

- `CREATE INDEX food_orders_org_status_idx ON public.food_orders USING btree (org_id, status, created_at DESC)`

**Triggers**

- `food_orders_forbid_org_change` (before update) runs `forbid_org_change()`
- `food_orders_stamp_review` (before update of status) runs `food_orders_stamp_review()`

**Access**

- Signed-in users may: select, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `food_orders_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `food_orders_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `food_orders_update` (update): rows where `((org_id IN ( SELECT my_org_ids() AS my_org_ids)) AND (status <> ALL (ARRAY['confirmed'::food_order_status, 'declined'::food_order_status])))`; new values must satisfy `((org_id IN ( SELECT my_org_ids() AS my_org_ids)) AND (status = ANY (ARRAY['declined'::food_order_status, 'waiting_area'::food_order_status, 'unpaid'::food_order_status, 'paid'::food_order_status, 'requested'::food_order_status])))`

### food_products

Food in the rate card: a trial, subscription food and one-off food by the kilo, and made-to-order items.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `kind` | `food_product_kind` | yes |  |  |
| `name` | `text` | yes |  |  |
| `price_minor` | `bigint` | yes |  | Per kilo for subscription and by_kilo food; the whole price for a trial; per piece for an item. |
| `trial_grams` | `integer` |  |  | Trials only: how much food the trial is, in grams. |
| `tax_rate_bp` | `integer` |  |  | Tax rate in basis points. Empty: the kennel's usual rate. Pet food is goods: ask the accountant (06, question 13). |
| `sac_code` | `text` |  |  | The HSN code printed on tax invoices for it, 4 to 8 digits. |
| `is_active` | `boolean` | yes | `true` | False once it is no longer sold. Deliveries already made keep their price. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `food_products_pkey`: `PRIMARY KEY (id)`
- Unique `food_products_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `food_products_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `food_products_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `food_products_price_minor_check`: `CHECK ((price_minor >= 0))`
- Check `food_products_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `food_products_tax_rate_bp_check`: `CHECK (((tax_rate_bp IS NULL) OR ((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000))))`
- Check `food_products_trial_grams_check`: `CHECK (((trial_grams IS NULL) OR ((trial_grams >= 10) AND (trial_grams <= 20000))))`
- Check `food_products_trial_has_grams`: `CHECK ((((kind = 'trial'::food_product_kind) = (trial_grams IS NOT NULL)) AND ((trial_grams IS NULL) OR ((trial_grams % 10) = 0))))`

**Triggers**

- `food_products_forbid_org_change` (before update) runs `forbid_org_change()`
- `food_products_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `food_products_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `food_products_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `food_products_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `food_products_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### incidents

Anything out of the ordinary: illness, injury, a fight, an escape. A written, timed record of what happened and what was done protects the pet, the parent and the kennel.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `booking_id` | `uuid` |  |  |  |
| `occurred_at` | `timestamp with time zone` | yes | `now()` |  |
| `category` | `text` | yes |  |  |
| `severity` | `incident_severity` | yes | `'low'::incident_severity` |  |
| `description` | `text` | yes |  |  |
| `action_taken` | `text` |  |  |  |
| `vet_visited` | `boolean` | yes | `false` |  |
| `parent_notified_at` | `timestamp with time zone` |  |  | When the parent was told. Empty means not told yet, which the dashboard should flag for medium and high severity. |
| `parent_notified_by` | `uuid` |  |  |  |
| `resolved_at` | `timestamp with time zone` |  |  |  |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `incidents_pkey`: `PRIMARY KEY (id)`
- Unique `incidents_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `incidents_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `incidents_org_id_booking_id_fkey`: `FOREIGN KEY (org_id, booking_id) REFERENCES bookings(org_id, id) ON DELETE SET NULL (booking_id)`
- Foreign key `incidents_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `incidents_org_id_pet_id_fkey`: `FOREIGN KEY (org_id, pet_id) REFERENCES pets(org_id, id) ON DELETE CASCADE`
- Foreign key `incidents_parent_notified_by_fkey`: `FOREIGN KEY (parent_notified_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `incidents_category_check`: `CHECK ((category = ANY (ARRAY['illness'::text, 'injury'::text, 'fight'::text, 'escape'::text, 'behaviour'::text, 'property'::text, 'other'::text])))`
- Check `incidents_description_check`: `CHECK (((char_length(description) >= 1) AND (char_length(description) <= 4000)))`

**Indexes**

- `CREATE INDEX incidents_org_idx ON public.incidents USING btree (org_id, occurred_at DESC)`

**Triggers**

- `incidents_audit` (after insert or delete or update) runs `audit_row()`
- `incidents_forbid_org_change` (before update) runs `forbid_org_change()`
- `incidents_guard_content` (before update) runs `incidents_guard_content()`
- `incidents_set_updated_at` (before update) runs `set_updated_at()`
- `incidents_stamp_actor` (before insert or update) runs `stamp_actor()`
- `incidents_stamp_notified` (before insert or update) runs `stamp_when_set()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `incidents_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `incidents_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `incidents_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `incidents_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### intake_submissions

What a parent typed into the public intake form, kept exactly as sent until staff accept it. Nothing here is trusted until a person has reviewed it.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `status` | `intake_status` | yes | `'new'::intake_status` |  |
| `parent_name` | `text` | yes |  |  |
| `parent_phone` | `text` | yes |  |  |
| `requested_start` | `date` |  |  |  |
| `requested_end` | `date` |  |  |  |
| `payload` | `jsonb` | yes |  | The whole form as JSON (version 1): {v, parent:{name,phone,email,address,area,postal_code,city,emergency_name,emergency_phone}, pets:[{name,species,breed,sex,is_neutered,date_of_birth,weight_kg,food_notes,medical_notes,allergies,behaviour_notes,vet_name,vet_phone,vaccinations:[{vaccine,given_on,valid_until}]}], stay:{kind,start_date,end_date,notes}, consent}. |
| `consent_at` | `timestamp with time zone` | yes |  |  |
| `consent_text` | `text` | yes |  | The exact consent wording the parent agreed to, kept as evidence. |
| `client_id` | `uuid` |  |  | The client created or matched when the submission was accepted. |
| `reviewed_by` | `uuid` |  |  |  |
| `reviewed_at` | `timestamp with time zone` |  |  |  |
| `upload_token` | `text` | yes | `new_token()` | Secret returned to whoever sent the form, so the same visitor can add a vaccination certificate per pet within the hour (intake_upload_allowed). Useless after that. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `intake_submissions_pkey`: `PRIMARY KEY (id)`
- Unique `intake_submissions_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `intake_submissions_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE SET NULL (client_id)`
- Foreign key `intake_submissions_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `intake_submissions_reviewed_by_fkey`: `FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL`

**Indexes**

- `CREATE INDEX intake_submissions_org_status_idx ON public.intake_submissions USING btree (org_id, status, created_at DESC)`

**Triggers**

- `intake_submissions_forbid_org_change` (before update) runs `forbid_org_change()`
- `intake_submissions_set_updated_at` (before update) runs `set_updated_at()`
- `intake_submissions_stamp_review` (before update) runs `intake_submissions_stamp_review()`

**Access**

- Signed-in users may: select, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `intake_submissions_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `intake_submissions_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `intake_submissions_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### invitation_links

A one-time link that lets someone with no account yet join an organisation in a given role. Made by create_invitation_link(), used by accept_invitation_link().

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `token` | `text` | yes | `new_token()` | The secret in the link (/join/{token}). Anyone holding it can use it once, so it expires and can be withdrawn. |
| `role` | `member_role` | yes |  |  |
| `display_name` | `text` | yes |  | The name the person will be shown under, as the inviter typed it. |
| `created_by` | `uuid` |  |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `expires_at` | `timestamp with time zone` | yes | `(now() + '7 days'::interval)` |  |
| `used_at` | `timestamp with time zone` |  |  |  |
| `used_by` | `uuid` |  |  |  |
| `revoked_at` | `timestamp with time zone` |  |  | Set when a manager withdraws the link. A withdrawn link cannot be used. |

**Constraints**

- Primary key `invitation_links_pkey`: `PRIMARY KEY (id)`
- Unique `invitation_links_token_key`: `UNIQUE (token)`
- Foreign key `invitation_links_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `invitation_links_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `invitation_links_used_by_fkey`: `FOREIGN KEY (used_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `invitation_links_display_name_check`: `CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 80)))`
- Check `invitation_links_used_together`: `CHECK (((used_at IS NULL) = (used_by IS NULL)))`

**Indexes**

- `CREATE INDEX invitation_links_org_idx ON public.invitation_links USING btree (org_id, created_at DESC)`

**Triggers**

- `invitation_links_forbid_org_change` (before update) runs `forbid_org_change()`

**Access**

- Signed-in users may: select (then narrowed by the policies below). Anonymous visitors: nothing.
- `invitation_links_select` (select): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `invitation_links_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### invoice_counters

The last sequence number used per organisation, series (bills, credit notes) and financial year. Only issue_invoice and issue_credit_note touch it; nobody can read or write it directly.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `org_id` | `uuid` | yes |  |  |
| `series` | `text` | yes | `'invoice'::text` | invoice: bills (PREFIX/YY-YY/NNNN). credit_note: credit notes (CN/YY-YY/NNNN). |
| `fiscal_year` | `text` | yes |  |  |
| `last_seq` | `integer` | yes | `0` |  |

**Constraints**

- Primary key `invoice_counters_pkey`: `PRIMARY KEY (org_id, series, fiscal_year)`
- Foreign key `invoice_counters_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `invoice_counters_last_seq_check`: `CHECK ((last_seq >= 0))`
- Check `invoice_counters_series_check`: `CHECK ((series = ANY (ARRAY['invoice'::text, 'credit_note'::text])))`

**Triggers**

- `invoice_counters_forbid_org_change` (before update) runs `forbid_org_change()`

**Access**

- Signed-in users may: nothing directly (then narrowed by the policies below). Anonymous visitors: nothing.
- No policies: no row is reachable except through SECURITY DEFINER functions.

### invoice_lines

One line of an invoice. Numbers are computed by src/lib/core/tax.ts and stored, not recomputed.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `invoice_id` | `uuid` | yes |  |  |
| `sort_order` | `integer` | yes | `0` |  |
| `description` | `text` | yes |  |  |
| `sac_code` | `text` |  |  |  |
| `quantity` | `numeric(10,2)` | yes |  |  |
| `unit_price_minor` | `bigint` | yes |  |  |
| `discount_minor` | `bigint` | yes | `0` |  |
| `taxable_minor` | `bigint` | yes |  |  |
| `tax_rate_bp` | `integer` | yes | `0` |  |
| `cgst_minor` | `bigint` | yes | `0` |  |
| `sgst_minor` | `bigint` | yes | `0` |  |
| `igst_minor` | `bigint` | yes | `0` |  |
| `tax_minor` | `bigint` | yes | `0` |  |
| `total_minor` | `bigint` | yes |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `invoice_lines_pkey`: `PRIMARY KEY (id)`
- Foreign key `invoice_lines_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `invoice_lines_org_id_invoice_id_fkey`: `FOREIGN KEY (org_id, invoice_id) REFERENCES invoices(org_id, id) ON DELETE CASCADE`
- Check `invoice_lines_cgst_minor_check`: `CHECK ((cgst_minor >= 0))`
- Check `invoice_lines_description_check`: `CHECK (((char_length(description) >= 1) AND (char_length(description) <= 300)))`
- Check `invoice_lines_discount_minor_check`: `CHECK ((discount_minor >= 0))`
- Check `invoice_lines_igst_minor_check`: `CHECK ((igst_minor >= 0))`
- Check `invoice_lines_quantity_check`: `CHECK ((quantity > (0)::numeric))`
- Check `invoice_lines_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `invoice_lines_sgst_minor_check`: `CHECK ((sgst_minor >= 0))`
- Check `invoice_lines_tax_minor_check`: `CHECK ((tax_minor >= 0))`
- Check `invoice_lines_tax_rate_bp_check`: `CHECK (((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000)))`
- Check `invoice_lines_taxable_minor_check`: `CHECK ((taxable_minor >= 0))`
- Check `invoice_lines_total_adds_up`: `CHECK ((total_minor = (taxable_minor + tax_minor)))`
- Check `invoice_lines_total_minor_check`: `CHECK ((total_minor >= 0))`
- Check `invoice_lines_unit_price_minor_check`: `CHECK ((unit_price_minor >= 0))`

**Indexes**

- `CREATE INDEX invoice_lines_org_invoice_idx ON public.invoice_lines USING btree (org_id, invoice_id, sort_order)`

**Triggers**

- `invoice_lines_forbid_org_change` (before update) runs `forbid_org_change()`
- `invoice_lines_guard` (before insert or delete or update) runs `invoice_lines_guard()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `invoice_lines_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `invoice_lines_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `invoice_lines_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `invoice_lines_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### invoices

A bill. Editable while a draft; frozen for ever once issued. A tax invoice when the kennel charges tax, otherwise a plain bill.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `client_id` | `uuid` | yes |  |  |
| `booking_id` | `uuid` |  |  | The stay this bill is for, when it is for one pet's stay that was booked on its own. |
| `group_id` | `uuid` |  |  | The family booking this bill is for: every pet booked together (bookings.group_id) is billed on it, each with its stay and extras. A pet of a family is never billed on its own. |
| `series_id` | `uuid` |  |  | The repeating day boarding series this bill is for (bookings.series_id): its days in series_month, each with its extras, on one bill. A day of a series is never billed on its own. |
| `series_month` | `date` |  |  | With series_id: the first day of the calendar month whose days this bill covers. |
| `subscription_id` | `uuid` |  |  | The food subscription this bill is for (M29): its deliveries from period_start to period_end, billed ahead. A subscription's delivery is never billed on its own. |
| `period_start` | `date` |  |  | With subscription_id: the first day whose deliveries this bill covers. |
| `period_end` | `date` |  |  | With subscription_id: the last day whose deliveries this bill covers (a week or a month after period_start). |
| `delivery_id` | `uuid` |  |  | The one-off food order this bill is for: a trial, food by the kilo or a made-to-order item (M29). |
| `appointment_id` | `uuid` |  |  | The appointment of a visitor this bill is for (M34), with its add-ons. A boarder's appointment is on its stay's bill instead (WB200). |
| `status` | `invoice_status` | yes | `'draft'::invoice_status` |  |
| `number` | `text` |  |  | Printed invoice number, e.g. WB/27-28/0001. Empty until issued. Consecutive within a financial year, never reused. |
| `fiscal_year` | `text` |  |  | Financial year the number belongs to, e.g. 2027-28. |
| `seq` | `integer` |  |  | Position in the year's sequence: the 0001 in WB/27-28/0001. |
| `issued_on` | `date` |  |  | Invoice date: the kennel's local date when it was issued. |
| `issued_by` | `uuid` |  |  |  |
| `is_tax_invoice` | `boolean` | yes | `false` | True when issued by a tax-registered kennel, so it is titled Tax Invoice and shows the tax breakup. |
| `prices_include_tax` | `boolean` | yes | `false` | Whether the kennel's prices included tax when the bill was issued, so a credit note against it works its tax out the same way. |
| `currency` | `text` | yes | `'INR'::text` |  |
| `seller` | `jsonb` |  |  | Copy of the kennel's name, address, tax details and UPI ID as they were when issued. A later change to the kennel's settings never alters an invoice that is already out. |
| `buyer` | `jsonb` |  |  | Copy of the parent's name, phone and address as they were when issued. |
| `place_of_supply_state_code` | `text` |  |  | GST state code where the service is supplied. For boarding, the kennel's own state. |
| `subtotal_minor` | `bigint` | yes | `0` | Sum of quantity x unit price over all lines, before discount and tax. |
| `discount_minor` | `bigint` | yes | `0` |  |
| `taxable_minor` | `bigint` | yes | `0` | Value that tax is charged on. |
| `cgst_minor` | `bigint` | yes | `0` |  |
| `sgst_minor` | `bigint` | yes | `0` |  |
| `igst_minor` | `bigint` | yes | `0` |  |
| `tax_minor` | `bigint` | yes | `0` | Total tax. Equals cgst + sgst + igst under India GST. |
| `round_off_minor` | `bigint` | yes | `0` | Small adjustment (under one currency unit) that makes the total a whole number. |
| `total_minor` | `bigint` | yes | `0` | What the customer owes: taxable + tax + round off. |
| `notes` | `text` |  |  |  |
| `public_token` | `text` | yes | `new_token()` | Secret in the invoice link sent to the parent (/inv/{token}). |
| `voided_at` | `timestamp with time zone` |  |  |  |
| `voided_by` | `uuid` |  |  |  |
| `void_reason` | `text` |  |  |  |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `invoices_pkey`: `PRIMARY KEY (id)`
- Unique `invoices_org_id_fiscal_year_seq_key`: `UNIQUE (org_id, fiscal_year, seq)`
- Unique `invoices_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `invoices_org_id_number_key`: `UNIQUE (org_id, number)`
- Unique `invoices_public_token_key`: `UNIQUE (public_token)`
- Foreign key `invoices_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `invoices_delivery_fkey`: `FOREIGN KEY (org_id, delivery_id) REFERENCES deliveries(org_id, id) ON DELETE RESTRICT`
- Foreign key `invoices_issued_by_fkey`: `FOREIGN KEY (issued_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `invoices_org_id_appointment_id_fkey`: `FOREIGN KEY (org_id, appointment_id) REFERENCES appointments(org_id, id) ON DELETE RESTRICT`
- Foreign key `invoices_org_id_booking_id_fkey`: `FOREIGN KEY (org_id, booking_id) REFERENCES bookings(org_id, id) ON DELETE SET NULL (booking_id)`
- Foreign key `invoices_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE RESTRICT`
- Foreign key `invoices_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `invoices_subscription_fkey`: `FOREIGN KEY (org_id, subscription_id) REFERENCES subscriptions(org_id, id) ON DELETE RESTRICT`
- Foreign key `invoices_voided_by_fkey`: `FOREIGN KEY (voided_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `invoices_cgst_minor_check`: `CHECK ((cgst_minor >= 0))`
- Check `invoices_currency_check`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`
- Check `invoices_discount_minor_check`: `CHECK ((discount_minor >= 0))`
- Check `invoices_igst_minor_check`: `CHECK ((igst_minor >= 0))`
- Check `invoices_number_shape`: `CHECK (((number IS NULL) OR ((char_length(number) <= 16) AND (number ~ '^[A-Za-z0-9/-]+$'::text))))`
- Check `invoices_numbered_once_issued`: `CHECK (
CASE
    WHEN (status = 'draft'::invoice_status) THEN ((number IS NULL) AND (seq IS NULL) AND (fiscal_year IS NULL) AND (issued_on IS NULL) AND (issued_by IS NULL))
    ELSE ((number IS NOT NULL) AND (seq IS NOT NULL) AND (fiscal_year IS NOT NULL) AND (issued_on IS NOT NULL))
END)`
- Check `invoices_one_stay_or_one_family`: `CHECK ((num_nonnulls(booking_id, group_id, series_id, subscription_id, delivery_id, appointment_id) <= 1))`
- Check `invoices_place_of_supply_state_code_check`: `CHECK (((place_of_supply_state_code IS NULL) OR (place_of_supply_state_code ~ '^[0-9]{2}$'::text)))`
- Check `invoices_round_off_minor_check`: `CHECK (((round_off_minor >= '-99'::integer) AND (round_off_minor <= 99)))`
- Check `invoices_series_month`: `CHECK ((((series_id IS NULL) = (series_month IS NULL)) AND ((series_month IS NULL) OR (EXTRACT(day FROM series_month) = (1)::numeric))))`
- Check `invoices_sgst_minor_check`: `CHECK ((sgst_minor >= 0))`
- Check `invoices_subscription_period`: `CHECK ((((subscription_id IS NULL) = (period_start IS NULL)) AND ((period_start IS NULL) = (period_end IS NULL)) AND ((period_end IS NULL) OR ((period_end >= period_start) AND ((period_end - period_start) <= 31)))))`
- Check `invoices_subtotal_minor_check`: `CHECK ((subtotal_minor >= 0))`
- Check `invoices_tax_minor_check`: `CHECK ((tax_minor >= 0))`
- Check `invoices_taxable_minor_check`: `CHECK ((taxable_minor >= 0))`
- Check `invoices_total_minor_check`: `CHECK ((total_minor >= 0))`
- Check `invoices_void_fields_only_when_void`: `CHECK ((((status = 'void'::invoice_status) = (voided_at IS NOT NULL)) AND ((status = 'void'::invoice_status) OR ((voided_by IS NULL) AND (void_reason IS NULL)))))`

**Indexes**

- `CREATE UNIQUE INDEX invoices_one_live_per_appointment ON public.invoices USING btree (org_id, appointment_id) WHERE ((appointment_id IS NOT NULL) AND (status <> 'void'::invoice_status))`
- `CREATE UNIQUE INDEX invoices_one_live_per_booking ON public.invoices USING btree (org_id, booking_id) WHERE ((booking_id IS NOT NULL) AND (status <> 'void'::invoice_status))`
- `CREATE UNIQUE INDEX invoices_one_live_per_delivery ON public.invoices USING btree (org_id, delivery_id) WHERE ((delivery_id IS NOT NULL) AND (status <> 'void'::invoice_status))`
- `CREATE UNIQUE INDEX invoices_one_live_per_family ON public.invoices USING btree (org_id, group_id) WHERE ((group_id IS NOT NULL) AND (status <> 'void'::invoice_status))`
- `CREATE UNIQUE INDEX invoices_one_live_per_series_month ON public.invoices USING btree (org_id, series_id, series_month) WHERE ((series_id IS NOT NULL) AND (status <> 'void'::invoice_status))`
- `CREATE UNIQUE INDEX invoices_one_live_per_subscription_period ON public.invoices USING btree (org_id, subscription_id, period_start) WHERE ((subscription_id IS NOT NULL) AND (status <> 'void'::invoice_status))`
- `CREATE INDEX invoices_org_booking_idx ON public.invoices USING btree (org_id, booking_id)`
- `CREATE INDEX invoices_org_client_idx ON public.invoices USING btree (org_id, client_id)`
- `CREATE INDEX invoices_org_issued_idx ON public.invoices USING btree (org_id, issued_on DESC)`

**Triggers**

- `invoices_audit` (after insert or delete or update) runs `audit_row()`
- `invoices_check_food` (before insert or update of subscription_id, period_start, period_end, delivery_id, client_id) runs `invoices_check_food()`
- `invoices_check_stay` (before insert or update of booking_id, group_id, series_id, client_id, appointment_id) runs `invoices_check_stay()`
- `invoices_forbid_org_change` (before update) runs `forbid_org_change()`
- `invoices_guard` (before delete or update) runs `invoices_guard()`
- `invoices_guard_insert` (before insert) runs `invoices_guard_insert()`
- `invoices_set_updated_at` (before update) runs `set_updated_at()`
- `invoices_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `invoices_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `invoices_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `invoices_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `invoices_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### kennels

A place pets stay: a kennel, room, run or suite. It holds one pet, or two pets of one parent sharing it. The number of active kennels is the organisation's capacity.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `name` | `text` | yes |  | Short label painted on the door, e.g. K07 or "Suite 2". |
| `zone` | `text` |  |  | Optional grouping such as a block or wing, for sorting the board. |
| `notes` | `text` |  |  |  |
| `is_active` | `boolean` | yes | `true` | False takes the kennel out of service (repairs, deep cleaning) and out of the capacity count. |
| `sort_order` | `integer` | yes | `0` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `kennels_pkey`: `PRIMARY KEY (id)`
- Unique `kennels_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `kennels_org_id_name_key`: `UNIQUE (org_id, name)`
- Foreign key `kennels_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `kennels_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 40)))`

**Triggers**

- `kennels_forbid_org_change` (before update) runs `forbid_org_change()`
- `kennels_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `kennels_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `kennels_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `kennels_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `kennels_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### memberships

Links a signed-in user to an organisation with a role. Row level security on every other table is decided by this table.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `org_id` | `uuid` | yes |  |  |
| `user_id` | `uuid` | yes |  |  |
| `role` | `member_role` | yes | `'staff'::member_role` |  |
| `display_name` | `text` | yes |  | Name shown next to this person's actions, e.g. "Ravi". |
| `phone` | `text` |  |  |  |
| `language` | `text` | yes | `'en'::text` | The language this person reads Wagbook in: en, hi or kn. Set by the person with set_my_language(), for all their kennels at once. |
| `skills` | `staff_skill[]` | yes | `'{}'::staff_skill[]` | What this person can be given to do in this kennel (staff_skill), set by owners and managers. Decides who is offered a job, not what they may see. |
| `is_active` | `boolean` | yes | `false` | Whether this person can use the organisation right now. False while an invitation is pending, and set false again to cut off access at once without losing the history of who did what. |
| `accepted_at` | `timestamp with time zone` |  |  | When the person accepted the invitation. Empty means the invitation is still pending. Only respond_to_invitation() and create_organization() set it. |
| `invited_by` | `uuid` |  |  | Who sent the invitation. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `memberships_pkey`: `PRIMARY KEY (org_id, user_id)`
- Foreign key `memberships_invited_by_fkey`: `FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `memberships_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `memberships_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- Check `memberships_active_needs_acceptance`: `CHECK (((NOT is_active) OR (accepted_at IS NOT NULL)))`
- Check `memberships_display_name_check`: `CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 80)))`
- Check `memberships_language_check`: `CHECK ((language = ANY (ARRAY['en'::text, 'hi'::text, 'kn'::text])))`
- Check `memberships_phone_check`: `CHECK (((phone IS NULL) OR (phone ~ '^\+[1-9][0-9]{7,14}$'::text)))`

**Indexes**

- `CREATE INDEX memberships_user_id_idx ON public.memberships USING btree (user_id)`

**Triggers**

- `memberships_audit` (after insert or delete or update) runs `audit_row()`
- `memberships_forbid_org_change` (before update) runs `forbid_org_change()`
- `memberships_protect_last_owner` (before delete or update) runs `protect_last_owner()`
- `memberships_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `memberships_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `memberships_delete_self` (delete): rows where `(user_id = ( SELECT auth.uid() AS uid))`
- `memberships_select` (select): rows where `((org_id IN ( SELECT my_org_ids() AS my_org_ids)) OR ((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT session_meets_mfa() AS session_meets_mfa)))`
- `memberships_update` (update): rows where `((org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role)) OR ((role <> 'owner'::member_role) AND (org_id IN ( SELECT my_org_ids_with_role(ARRAY['manager'::member_role]) AS my_org_ids_with_role))))`; new values must satisfy `((org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role)) OR ((role <> 'owner'::member_role) AND (org_id IN ( SELECT my_org_ids_with_role(ARRAY['manager'::member_role]) AS my_org_ids_with_role))))`

### organizations

A kennel business. Every other row belongs to exactly one organisation. A self-hosted Wagbook usually has one row; a shared hosting has many.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `name` | `text` | yes |  |  |
| `slug` | `text` | yes |  | Short name used in public links, e.g. /i/happy-tails. Lower case letters, digits and hyphens. |
| `legal_name` | `text` |  |  |  |
| `phone` | `text` |  |  | Main phone in E.164 form, e.g. +919876543210. |
| `whatsapp_phone` | `text` |  |  | The number parents should message. Shown on public pages. E.164. |
| `email` | `text` |  |  |  |
| `address_line1` | `text` |  |  |  |
| `address_line2` | `text` |  |  |  |
| `city` | `text` |  |  |  |
| `state` | `text` |  |  |  |
| `postal_code` | `text` |  |  |  |
| `country_code` | `text` | yes | `'IN'::text` |  |
| `time_zone` | `text` | yes | `'Asia/Kolkata'::text` | IANA time zone. Decides what "today" means for arrivals, tasks and invoice dates. |
| `currency` | `text` | yes | `'INR'::text` | ISO 4217 code. All _minor amounts of this organisation are in this currency. |
| `locale` | `text` | yes | `'en-IN'::text` |  |
| `tax_mode` | `tax_mode` | yes | `'none'::tax_mode` | How tax is charged. Start with none; switch to gst_india once registered for GST. |
| `tax_label` | `text` |  |  | Name of the tax in simple mode, e.g. VAT. Ignored in other modes. |
| `tax_id` | `text` |  |  | Tax registration number. The GSTIN when tax_mode is gst_india. |
| `gst_state_code` | `text` |  |  | Two digit GST state code of the kennel, e.g. 29 for Karnataka. Needed for gst_india. |
| `default_tax_rate_bp` | `integer` | yes | `0` | Tax rate used when a service does not set its own. Basis points: 1800 = 18%. |
| `prices_include_tax` | `boolean` | yes | `false` | True when rate card prices already contain tax, so tax is backed out instead of added on top. |
| `invoice_prefix` | `text` | yes | `'WB'::text` | Start of every invoice number, 1 to 4 capital letters or digits, not CN (credit notes use it). WB gives WB/27-28/0001. |
| `fiscal_year_start_month` | `smallint` | yes | `4` | Month the financial year starts. 4 (April) for India, 1 for calendar-year countries. |
| `round_invoice_totals` | `boolean` | yes | `true` | Round invoice grand totals to a whole currency unit and show the difference as round off. |
| `upi_vpa` | `text` |  |  | UPI ID that receives payments, e.g. happytails@okhdfcbank. Used to build pay links and QR codes. |
| `upi_payee_name` | `text` |  |  |  |
| `check_in_time` | `time without time zone` | yes | `'10:00:00'::time without time zone` | Usual earliest arrival time. Shown to parents; not enforced. |
| `check_out_time` | `time without time zone` | yes | `'12:00:00'::time without time zone` | Usual latest pickup time. Shown to parents; not enforced. |
| `allow_overbooking` | `boolean` | yes | `false` | When false, the database refuses a booking that would put more pets in house than there are active kennels. |
| `play_sessions_per_day` | `smallint` | yes | `0` | Solo play sessions each boarded pet should get per day. 0 turns play scheduling off. |
| `play_session_minutes` | `smallint` | yes | `20` | Normal length of one play session. Peak periods can override it. |
| `play_changeover_minutes` | `smallint` | yes | `0` | Minutes a yard stands empty between two pets, to walk one out and the next in. |
| `play_day_start` | `time without time zone` | yes | `'08:00:00'::time without time zone` | When the play yards open. Local clock time at the kennel. |
| `play_day_end` | `time without time zone` | yes | `'18:00:00'::time without time zone` | When the play yards close. No session runs past this. |
| `play_break_start` | `time without time zone` |  |  | Start of an optional break in play, such as the midday heat. Empty for no break. |
| `play_break_end` | `time without time zone` |  |  | End of the optional break in play. |
| `intake_enabled` | `boolean` | yes | `true` | Whether the public intake form at /i/{slug} accepts submissions. |
| `requests_enabled` | `boolean` | yes | `true` | Whether parents can ask for stays through their own booking link (/b/{token}, submit_booking_request). |
| `intake_notice` | `text` |  |  | Privacy and consent text shown on the intake form, in the kennel's own words. A default, in the parent pages' language, is used when empty. |
| `parent_language` | `text` | yes | `'en'::text` | Language of the pages and messages parents see: the intake form, stay page and WhatsApp messages. en, hi or kn. Bills are in English (clients.bill_translation adds a language on request). |
| `offers_appointments` | `boolean` | yes | `false` | Whether the kennel books services by the hour: grooming, swimming, training, parties (D44). Off: none of it is shown. |
| `offers_kitchen` | `boolean` | yes | `false` | Whether the kennel cooks food in its own kitchen, for boarders and to sell (D44). Off: none of it is shown. |
| `offers_food_delivery` | `boolean` | yes | `false` | Whether the kennel delivers its food to parents at home (D44). Needs offers_kitchen. Turns on parents' addresses and the areas served. |
| `portion_small_bp` | `integer` | yes | `300` | A small dog's day of food as a share of its body weight, in basis points: 300 is 3% (M28). Medium and large have their own. |
| `portion_medium_bp` | `integer` | yes | `250` | A medium dog's day of food as a share of its body weight, in basis points: 250 is 2.5%. |
| `portion_large_bp` | `integer` | yes | `200` | A large dog's day of food as a share of its body weight, in basis points: 200 is 2%. |
| `small_dog_max_g` | `integer` | yes | `10000` | Up to this weight, in grams, a dog is small for portions. 10000 is 10 kg. |
| `medium_dog_max_g` | `integer` | yes | `25000` | Up to this weight, in grams, a dog is medium for portions; heavier is large. 25000 is 25 kg. |
| `topper_share_bp` | `integer` | yes | `3333` | A topper plan's share of the day's food, in basis points: 3333 is a third. |
| `goal_change_bp` | `integer` | yes | `1000` | How much less a dog that should lose weight eats, and more one that should gain, in basis points: 1000 is 10%. |
| `food_pack_g` | `integer` | yes | `250` | Grams in one pack of food. Deliveries are rounded up to whole packs. A multiple of 10 grams. |
| `food_cutoff_hours` | `smallint` | yes | `24` | How many hours before a delivery's slot changes to it close; after that it is being cooked. |
| `monthly_food_discount_bp` | `integer` | yes | `0` | Discount on food paid a month ahead, in basis points: 500 is 5%. 0 for none. |
| `cook_margin_bp` | `integer` | yes | `1000` | Extra food the cook plan adds on top of what is needed, in basis points: 1000 is 10%. |
| `problem_window_hours` | `smallint` | yes | `24` | How many hours after a delivery a parent may report it damaged, late or wrong. |
| `food_orders_enabled` | `boolean` | yes | `true` | Whether the public food order page at /f/{slug} takes orders (M32). It also needs food delivery switched on. |
| `item_lead_hours` | `smallint` | yes | `24` | How many hours ahead a made-to-order item (a birthday cake) must be ordered: the database refuses one for sooner (WB156). |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `organizations_pkey`: `PRIMARY KEY (id)`
- Unique `organizations_slug_key`: `UNIQUE (slug)`
- Check `organizations_cook_margin_bp_check`: `CHECK (((cook_margin_bp >= 0) AND (cook_margin_bp <= 5000)))`
- Check `organizations_country_code_check`: `CHECK ((country_code ~ '^[A-Z]{2}$'::text))`
- Check `organizations_currency_check`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`
- Check `organizations_default_tax_rate_bp_check`: `CHECK (((default_tax_rate_bp >= 0) AND (default_tax_rate_bp <= 10000)))`
- Check `organizations_delivery_needs_kitchen`: `CHECK (((NOT offers_food_delivery) OR offers_kitchen))`
- Check `organizations_fiscal_year_start_month_check`: `CHECK (((fiscal_year_start_month >= 1) AND (fiscal_year_start_month <= 12)))`
- Check `organizations_food_cutoff_hours_check`: `CHECK (((food_cutoff_hours >= 0) AND (food_cutoff_hours <= 168)))`
- Check `organizations_food_pack_g_check`: `CHECK ((((food_pack_g >= 50) AND (food_pack_g <= 5000)) AND ((food_pack_g % 10) = 0)))`
- Check `organizations_goal_change_bp_check`: `CHECK (((goal_change_bp >= 0) AND (goal_change_bp <= 3000)))`
- Check `organizations_gst_needs_registration`: `CHECK (((tax_mode <> 'gst_india'::tax_mode) OR ((tax_id IS NOT NULL) AND (gst_state_code IS NOT NULL))))`
- Check `organizations_gst_state_code_check`: `CHECK (((gst_state_code IS NULL) OR (gst_state_code ~ '^[0-9]{2}$'::text)))`
- Check `organizations_invoice_prefix_check`: `CHECK (((invoice_prefix ~ '^[A-Z0-9]{1,4}$'::text) AND (invoice_prefix <> 'CN'::text)))`
- Check `organizations_item_lead_hours_check`: `CHECK (((item_lead_hours >= 0) AND (item_lead_hours <= 336)))`
- Check `organizations_medium_dog_max_g_check`: `CHECK (((medium_dog_max_g >= 1000) AND (medium_dog_max_g <= 150000)))`
- Check `organizations_monthly_food_discount_bp_check`: `CHECK (((monthly_food_discount_bp >= 0) AND (monthly_food_discount_bp <= 5000)))`
- Check `organizations_name_check`: `CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80)))`
- Check `organizations_parent_language_check`: `CHECK ((parent_language = ANY (ARRAY['en'::text, 'hi'::text, 'kn'::text])))`
- Check `organizations_phone_check`: `CHECK (((phone IS NULL) OR (phone ~ '^\+[1-9][0-9]{7,14}$'::text)))`
- Check `organizations_play_break_inside_day`: `CHECK ((((play_break_start IS NULL) AND (play_break_end IS NULL)) OR ((play_break_start IS NOT NULL) AND (play_break_end IS NOT NULL) AND (play_break_start > play_day_start) AND (play_break_end < play_day_end) AND (play_break_end > play_break_start))))`
- Check `organizations_play_changeover_minutes_check`: `CHECK (((play_changeover_minutes >= 0) AND (play_changeover_minutes <= 60)))`
- Check `organizations_play_hours_in_order`: `CHECK ((play_day_end > play_day_start))`
- Check `organizations_play_session_minutes_check`: `CHECK (((play_session_minutes >= 5) AND (play_session_minutes <= 240)))`
- Check `organizations_play_sessions_per_day_check`: `CHECK (((play_sessions_per_day >= 0) AND (play_sessions_per_day <= 12)))`
- Check `organizations_portion_large_bp_check`: `CHECK (((portion_large_bp >= 50) AND (portion_large_bp <= 1000)))`
- Check `organizations_portion_medium_bp_check`: `CHECK (((portion_medium_bp >= 50) AND (portion_medium_bp <= 1000)))`
- Check `organizations_portion_small_bp_check`: `CHECK (((portion_small_bp >= 50) AND (portion_small_bp <= 1000)))`
- Check `organizations_problem_window_hours_check`: `CHECK (((problem_window_hours >= 1) AND (problem_window_hours <= 168)))`
- Check `organizations_size_bands_in_order`: `CHECK ((medium_dog_max_g > small_dog_max_g))`
- Check `organizations_slug_check`: `CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'::text))`
- Check `organizations_small_dog_max_g_check`: `CHECK (((small_dog_max_g >= 1000) AND (small_dog_max_g <= 100000)))`
- Check `organizations_topper_share_bp_check`: `CHECK (((topper_share_bp >= 500) AND (topper_share_bp <= 9000)))`
- Check `organizations_upi_vpa_check`: `CHECK (((upi_vpa IS NULL) OR (upi_vpa ~ '^[a-zA-Z0-9._-]{2,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$'::text)))`
- Check `organizations_whatsapp_phone_check`: `CHECK (((whatsapp_phone IS NULL) OR (whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'::text)))`

**Triggers**

- `organizations_audit` (after insert or delete or update) runs `audit_row()`
- `organizations_lock_billing_settings` (before update of currency, fiscal_year_start_month) runs `organizations_lock_billing_settings()`
- `organizations_set_updated_at` (before update) runs `set_updated_at()`
- `organizations_validate` (before insert or update of time_zone) runs `validate_organization()`

**Access**

- Signed-in users may: select, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `organizations_delete` (delete): rows where `(id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `organizations_select` (select): rows where `(id IN ( SELECT my_org_ids() AS my_org_ids))`
- `organizations_update` (update): rows where `(id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### package_parts

What a package includes: an appointment on a day of the stay, or an extra from the price list so many times.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `package_id` | `uuid` | yes |  |  |
| `service_id` | `uuid` |  |  | An appointment service booked on the stay, on on_day. |
| `extra_id` | `uuid` |  |  | An extra (services, kind addon) put on the stay, quantity times. |
| `on_day` | `package_day` |  |  | For an appointment: the first, middle or last day of the stay. |
| `quantity` | `smallint` | yes | `1` |  |
| `sort_order` | `integer` | yes | `0` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `package_parts_pkey`: `PRIMARY KEY (id)`
- Foreign key `package_parts_org_id_extra_id_fkey`: `FOREIGN KEY (org_id, extra_id) REFERENCES services(org_id, id) ON DELETE RESTRICT`
- Foreign key `package_parts_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `package_parts_org_id_package_id_fkey`: `FOREIGN KEY (org_id, package_id) REFERENCES packages(org_id, id) ON DELETE CASCADE`
- Foreign key `package_parts_org_id_service_id_fkey`: `FOREIGN KEY (org_id, service_id) REFERENCES appointment_services(org_id, id) ON DELETE RESTRICT`
- Check `package_parts_one_kind`: `CHECK ((((service_id IS NOT NULL) AND (extra_id IS NULL) AND (on_day IS NOT NULL) AND (quantity = 1)) OR ((service_id IS NULL) AND (extra_id IS NOT NULL) AND (on_day IS NULL))))`
- Check `package_parts_quantity_check`: `CHECK (((quantity >= 1) AND (quantity <= 50)))`

**Triggers**

- `package_parts_forbid_org_change` (before update) runs `forbid_org_change()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `package_parts_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `package_parts_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `package_parts_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `package_parts_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### packages

A stay with appointments and extras included ("Holiday: extra play, a swim, a groom before going home"), billed as one line at one price or a price on request.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `name` | `text` | yes |  |  |
| `kind` | `booking_kind` | yes | `'boarding'::booking_kind` | Which stays it goes on: boarding or day boarding. |
| `price_minor` | `bigint` |  |  | The price of the whole stay with everything in it. Empty: on request, set by an owner or manager for each stay. |
| `tax_rate_bp` | `integer` |  |  |  |
| `sac_code` | `text` |  |  |  |
| `about` | `text` |  |  | What is in it, in the kennel's words. |
| `is_active` | `boolean` | yes | `true` |  |
| `sort_order` | `integer` | yes | `0` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `packages_pkey`: `PRIMARY KEY (id)`
- Unique `packages_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `packages_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `packages_about_check`: `CHECK (((about IS NULL) OR (char_length(about) <= 500)))`
- Check `packages_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `packages_price_minor_check`: `CHECK (((price_minor IS NULL) OR (price_minor >= 0)))`
- Check `packages_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `packages_tax_rate_bp_check`: `CHECK (((tax_rate_bp IS NULL) OR ((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000))))`

**Triggers**

- `packages_forbid_org_change` (before update) runs `forbid_org_change()`
- `packages_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `packages_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `packages_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `packages_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `packages_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### passes

A day boarding pack a parent bought: so many days to use between two dates. Day boarding bookings paid from it name it (bookings.pass_id).

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `client_id` | `uuid` | yes |  |  |
| `day_pack_id` | `uuid` |  |  |  |
| `name` | `text` | yes |  | The pack's name when it was sold, so renaming the pack later does not change what the parent bought. |
| `days` | `integer` | yes |  | Days of day boarding bought. pass_balances says how many are used and left. |
| `price_minor` | `bigint` | yes |  |  |
| `starts_on` | `date` | yes |  |  |
| `valid_until` | `date` | yes |  |  |
| `invoice_id` | `uuid` |  |  | The bill the pack was sold on. |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `passes_pkey`: `PRIMARY KEY (id)`
- Unique `passes_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `passes_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `passes_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE RESTRICT`
- Foreign key `passes_org_id_day_pack_id_fkey`: `FOREIGN KEY (org_id, day_pack_id) REFERENCES day_packs(org_id, id) ON DELETE SET NULL (day_pack_id)`
- Foreign key `passes_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `passes_org_id_invoice_id_fkey`: `FOREIGN KEY (org_id, invoice_id) REFERENCES invoices(org_id, id) ON DELETE SET NULL (invoice_id)`
- Check `passes_dates_in_order`: `CHECK (((valid_until >= starts_on) AND ((valid_until - starts_on) <= 730)))`
- Check `passes_days_check`: `CHECK (((days >= 1) AND (days <= 365)))`
- Check `passes_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `passes_price_minor_check`: `CHECK ((price_minor >= 0))`

**Indexes**

- `CREATE INDEX passes_org_client_idx ON public.passes USING btree (org_id, client_id, valid_until)`

**Triggers**

- `passes_forbid_org_change` (before update) runs `forbid_org_change()`
- `passes_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `passes_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `passes_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `passes_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `passes_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### payments

Money received from a parent, or refunded to one. Wagbook records payments; it does not move money. An advance is a payment linked to a booking before any invoice exists.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `client_id` | `uuid` | yes |  |  |
| `booking_id` | `uuid` |  |  |  |
| `invoice_id` | `uuid` |  |  |  |
| `direction` | `text` | yes | `'in'::text` | in: received from the parent. out: refunded to the parent. |
| `amount_minor` | `bigint` | yes |  | Always positive. direction says which way it went. |
| `method` | `payment_method` | yes |  |  |
| `reference` | `text` |  |  | UPI transaction reference (UTR), cheque number or similar, for matching against the bank statement. |
| `received_on` | `date` | yes |  | Kennel-local date the money moved. |
| `note` | `text` |  |  |  |
| `recorded_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `payments_pkey`: `PRIMARY KEY (id)`
- Foreign key `payments_org_id_booking_id_fkey`: `FOREIGN KEY (org_id, booking_id) REFERENCES bookings(org_id, id) ON DELETE SET NULL (booking_id)`
- Foreign key `payments_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE RESTRICT`
- Foreign key `payments_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `payments_org_id_invoice_id_fkey`: `FOREIGN KEY (org_id, invoice_id) REFERENCES invoices(org_id, id) ON DELETE SET NULL (invoice_id)`
- Foreign key `payments_recorded_by_fkey`: `FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `payments_amount_minor_check`: `CHECK ((amount_minor > 0))`
- Check `payments_direction_check`: `CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])))`

**Indexes**

- `CREATE INDEX payments_org_booking_idx ON public.payments USING btree (org_id, booking_id)`
- `CREATE INDEX payments_org_date_idx ON public.payments USING btree (org_id, received_on DESC)`
- `CREATE INDEX payments_org_invoice_idx ON public.payments USING btree (org_id, invoice_id)`

**Triggers**

- `payments_audit` (after insert or delete or update) runs `audit_row()`
- `payments_check_refund` (before insert or update of direction, amount_minor, invoice_id, booking_id) runs `payments_check_refund()`
- `payments_forbid_org_change` (before update) runs `forbid_org_change()`
- `payments_set_updated_at` (before update) runs `set_updated_at()`
- `payments_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `payments_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `payments_insert` (insert): new values must satisfy `(((direction = 'in'::text) AND (org_id IN ( SELECT my_org_ids() AS my_org_ids))) OR (org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role)))`
- `payments_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `payments_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### peak_periods

Busy stretches such as Diwali week or a long weekend. Used to warn about cancellation terms and to shorten play sessions when the house is full.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `name` | `text` | yes |  |  |
| `start_date` | `date` | yes |  |  |
| `end_date` | `date` | yes |  | Last day of the period, inclusive. |
| `no_refund` | `boolean` | yes | `false` | True when bookings touching this period are not refunded on cancellation. |
| `play_session_minutes` | `smallint` |  |  | Play session length during this period. Empty means the organisation's normal length. |
| `notes` | `text` |  |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `peak_periods_pkey`: `PRIMARY KEY (id)`
- Foreign key `peak_periods_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `peak_periods_check`: `CHECK ((end_date >= start_date))`
- Check `peak_periods_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `peak_periods_play_session_minutes_check`: `CHECK (((play_session_minutes IS NULL) OR ((play_session_minutes >= 5) AND (play_session_minutes <= 240))))`

**Indexes**

- `CREATE INDEX peak_periods_org_dates_idx ON public.peak_periods USING btree (org_id, start_date, end_date)`

**Triggers**

- `peak_periods_forbid_org_change` (before update) runs `forbid_org_change()`
- `peak_periods_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `peak_periods_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `peak_periods_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `peak_periods_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `peak_periods_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### pet_food

What a pet eats: its plan and goal for the kitchen's food, grams set by hand if a manager chose to, what it eats while boarding, and foods to avoid. No row: kitchen food, a full meal, keep its weight.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `org_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `plan` | `food_plan` | yes | `'full'::food_plan` |  |
| `goal` | `food_goal` | yes | `'keep'::food_goal` |  |
| `grams_by_hand` | `integer` |  |  | Grams a day set by an owner or manager instead of the worked-out portion, with a note saying why. Empty: worked out from the latest weight (portionGrams in src/lib/core/food.ts). |
| `by_hand_note` | `text` |  |  | Why the grams were set by hand. |
| `boarder_food` | `boarder_food` | yes | `'kitchen'::boarder_food` | What the pet eats while boarding. The care round and the cook plan follow it. |
| `kibble_brand` | `text` |  |  | With kibble: the brand and kind the parent named. |
| `kibble_g_per_day` | `integer` |  |  | With kibble: grams a day. |
| `avoid` | `text` |  |  | Foods to avoid for this pet, in plain words ("chicken: itchy skin"). |
| `started_on` | `date` |  |  | When the pet started on the kitchen's food. Today asks for its portion to be looked at a week later. |
| `reviewed_on` | `date` |  |  | When its portion was last looked at. |
| `updated_by` | `uuid` |  |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `pet_food_pkey`: `PRIMARY KEY (org_id, pet_id)`
- Foreign key `pet_food_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `pet_food_org_id_pet_id_fkey`: `FOREIGN KEY (org_id, pet_id) REFERENCES pets(org_id, id) ON DELETE CASCADE`
- Foreign key `pet_food_updated_by_fkey`: `FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `pet_food_avoid_check`: `CHECK (((avoid IS NULL) OR (char_length(avoid) <= 300)))`
- Check `pet_food_by_hand_has_note`: `CHECK (((grams_by_hand IS NULL) OR (by_hand_note IS NOT NULL)))`
- Check `pet_food_by_hand_note_check`: `CHECK (((by_hand_note IS NULL) OR (char_length(by_hand_note) <= 300)))`
- Check `pet_food_grams_by_hand_check`: `CHECK (((grams_by_hand IS NULL) OR ((grams_by_hand >= 10) AND (grams_by_hand <= 5000))))`
- Check `pet_food_kibble_brand_check`: `CHECK (((kibble_brand IS NULL) OR (char_length(kibble_brand) <= 80)))`
- Check `pet_food_kibble_g_per_day_check`: `CHECK (((kibble_g_per_day IS NULL) OR ((kibble_g_per_day >= 10) AND (kibble_g_per_day <= 5000))))`
- Check `pet_food_kibble_named`: `CHECK (((boarder_food <> 'kibble'::boarder_food) OR (kibble_brand IS NOT NULL)))`

**Triggers**

- `pet_food_forbid_org_change` (before update) runs `forbid_org_change()`
- `pet_food_guard_grams` (before insert or update) runs `pet_food_guard_grams()`
- `pet_food_set_updated_at` (before update) runs `set_updated_at()`
- `pet_food_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `pet_food_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `pet_food_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `pet_food_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `pet_food_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### pet_grooming

A pet's grooming card: the usual cut, products to use or avoid, skin conditions, how it behaves on the table, and how often it should be groomed. The coat is on pets (it sets prices); the last groom is its latest groom done.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `org_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `usual_cut` | `text` |  |  |  |
| `products` | `text` |  |  | Products to use or avoid ("oatmeal shampoo only"). |
| `skin` | `text` |  |  | Skin conditions to know about. |
| `behaviour` | `text` |  |  | How the pet behaves on the table ("nervous of the dryer"). |
| `every_weeks` | `smallint` |  |  | How often it should be groomed, in weeks. With it, the pet is on Today's list to send when a groom is due again. Empty: no reminder. |
| `updated_by` | `uuid` |  |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `pet_grooming_pkey`: `PRIMARY KEY (org_id, pet_id)`
- Foreign key `pet_grooming_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `pet_grooming_org_id_pet_id_fkey`: `FOREIGN KEY (org_id, pet_id) REFERENCES pets(org_id, id) ON DELETE CASCADE`
- Foreign key `pet_grooming_updated_by_fkey`: `FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `pet_grooming_behaviour_check`: `CHECK (((behaviour IS NULL) OR (char_length(behaviour) <= 300)))`
- Check `pet_grooming_every_weeks_check`: `CHECK (((every_weeks IS NULL) OR ((every_weeks >= 1) AND (every_weeks <= 52))))`
- Check `pet_grooming_products_check`: `CHECK (((products IS NULL) OR (char_length(products) <= 300)))`
- Check `pet_grooming_skin_check`: `CHECK (((skin IS NULL) OR (char_length(skin) <= 300)))`
- Check `pet_grooming_usual_cut_check`: `CHECK (((usual_cut IS NULL) OR (char_length(usual_cut) <= 300)))`

**Triggers**

- `pet_grooming_forbid_org_change` (before update) runs `forbid_org_change()`
- `pet_grooming_set_updated_at` (before update) runs `set_updated_at()`
- `pet_grooming_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `pet_grooming_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `pet_grooming_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `pet_grooming_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `pet_grooming_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### pet_weights

A pet weighed on a day. The latest is copied to pets.weight_g; food portions are worked out from it (M28).

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `weighed_on` | `date` | yes |  | The day the pet was weighed, in the kennel's time zone. |
| `weight_g` | `integer` | yes |  | Weight in grams: 34.5 kg is 34500. |
| `body_condition` | `smallint` |  |  | Body condition score from 1 (very thin) to 9 (very heavy); 4 and 5 are ideal for a dog. Empty when not scored. |
| `notes` | `text` |  |  |  |
| `recorded_by` | `uuid` |  |  | Who wrote the weight down. Set by the database. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `pet_weights_pkey`: `PRIMARY KEY (id)`
- Foreign key `pet_weights_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `pet_weights_org_id_pet_id_fkey`: `FOREIGN KEY (org_id, pet_id) REFERENCES pets(org_id, id) ON DELETE CASCADE`
- Foreign key `pet_weights_recorded_by_fkey`: `FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `pet_weights_body_condition_check`: `CHECK (((body_condition >= 1) AND (body_condition <= 9)))`
- Check `pet_weights_notes_check`: `CHECK (((notes IS NULL) OR (char_length(notes) <= 500)))`
- Check `pet_weights_weight_g_check`: `CHECK (((weight_g >= 1) AND (weight_g <= 199999)))`

**Indexes**

- `CREATE INDEX pet_weights_org_pet_idx ON public.pet_weights USING btree (org_id, pet_id, weighed_on DESC, created_at DESC)`

**Triggers**

- `pet_weights_forbid_org_change` (before update) runs `forbid_org_change()`
- `pet_weights_refresh_pet` (after insert or delete or update) runs `pet_weights_refresh_pet()`
- `pet_weights_set_updated_at` (before update) runs `set_updated_at()`
- `pet_weights_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `pet_weights_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `pet_weights_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `pet_weights_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `pet_weights_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### pets

An animal in the kennel's care. Belongs to one client.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `client_id` | `uuid` | yes |  |  |
| `name` | `text` | yes |  |  |
| `species` | `text` | yes | `'dog'::text` |  |
| `breed` | `text` |  |  |  |
| `sex` | `pet_sex` | yes | `'unknown'::pet_sex` |  |
| `is_neutered` | `boolean` |  |  |  |
| `date_of_birth` | `date` |  |  |  |
| `weight_g` | `integer` |  |  | The latest weight in grams, from pet_weights. Kept by the database (pets_latest_weight): whatever is written here is replaced. |
| `target_weight_g` | `integer` |  |  | The weight the pet should get to, in grams, when it has one. Food portions (M28) use it. |
| `color` | `text` |  |  |  |
| `coat` | `pet_coat` |  |  | Its coat, for grooming: grooming services priced by coat use it (appointment_price()). |
| `microchip` | `text` |  |  |  |
| `photo_path` | `text` |  |  | Path of the profile photo inside the pet-media storage bucket. |
| `food_notes` | `text` |  |  | What the pet eats, how much and when, in the parent's words. |
| `medical_notes` | `text` |  |  |  |
| `allergies` | `text` |  |  |  |
| `behaviour_notes` | `text` |  |  |  |
| `flags` | `text[]` | yes | `'{}'::text[]` | Short warning tags staff must see at a glance, e.g. escape_risk, bite_history, dog_reactive, anxious, on_medication, senior. |
| `vet_name` | `text` |  |  |  |
| `vet_phone` | `text` |  |  |  |
| `deleted_at` | `timestamp with time zone` |  |  | Soft delete, for the same reason as clients.deleted_at. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `pets_pkey`: `PRIMARY KEY (id)`
- Unique `pets_org_id_client_id_id_key`: `UNIQUE (org_id, client_id, id)`
- Unique `pets_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `pets_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE CASCADE`
- Foreign key `pets_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `pets_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `pets_photo_in_org`: `CHECK (paths_in_org(ARRAY[photo_path], org_id))`
- Check `pets_species_check`: `CHECK ((species = ANY (ARRAY['dog'::text, 'cat'::text, 'other'::text])))`
- Check `pets_target_weight_g_check`: `CHECK (((target_weight_g IS NULL) OR ((target_weight_g >= 1) AND (target_weight_g <= 199999))))`

**Indexes**

- `CREATE INDEX pets_org_client_idx ON public.pets USING btree (org_id, client_id)`
- `CREATE INDEX pets_org_name_idx ON public.pets USING btree (org_id, lower(name))`

**Triggers**

- `pets_forbid_org_change` (before update) runs `forbid_org_change()`
- `pets_guard_hiding` (before update of deleted_at) runs `guard_hiding()`
- `pets_latest_weight` (before insert or update) runs `pets_latest_weight()`
- `pets_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `pets_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `pets_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `pets_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `pets_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### play_sessions

A slot when one pet, or siblings of one parent together, have a yard to themselves. The schedule is planned by planPlaySessions in src/lib/core/play-schedule.ts; the constraints here make overlap impossible whatever the app does.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `yard_id` | `uuid` | yes |  |  |
| `booking_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `client_id` | `uuid` | yes |  | The pet's parent, copied from the booking by the database on every write (play_sessions_fill_client). Siblings may share a yard; different parents may not. |
| `session_date` | `date` | yes |  |  |
| `starts_at` | `time without time zone` | yes |  | Local clock time at the kennel. |
| `duration_minutes` | `smallint` | yes |  |  |
| `status` | `task_status` | yes | `'pending'::task_status` |  |
| `done_at` | `timestamp with time zone` |  |  |  |
| `done_by` | `uuid` |  |  |  |
| `note` | `text` |  |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `play_sessions_pkey`: `PRIMARY KEY (id)`
- Foreign key `play_sessions_done_by_fkey`: `FOREIGN KEY (done_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `play_sessions_org_id_booking_id_pet_id_fkey`: `FOREIGN KEY (org_id, booking_id, pet_id) REFERENCES bookings(org_id, id, pet_id) ON DELETE CASCADE`
- Foreign key `play_sessions_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `play_sessions_org_id_yard_id_fkey`: `FOREIGN KEY (org_id, yard_id) REFERENCES play_yards(org_id, id) ON DELETE CASCADE`
- Exclusion `play_sessions_one_pet_per_yard`: `EXCLUDE USING gist (yard_id WITH =, tsrange((session_date + starts_at), ((session_date + starts_at) + make_interval(mins => (duration_minutes)::integer)), '[)'::text) WITH &&, client_id WITH <>) WHERE ((status <> 'skipped'::task_status))`
- Exclusion `play_sessions_one_yard_per_pet`: `EXCLUDE USING gist (pet_id WITH =, tsrange((session_date + starts_at), ((session_date + starts_at) + make_interval(mins => (duration_minutes)::integer)), '[)'::text) WITH &&) WHERE ((status <> 'skipped'::task_status))`
- Check `play_sessions_duration_minutes_check`: `CHECK (((duration_minutes >= 5) AND (duration_minutes <= 240)))`

**Indexes**

- `CREATE INDEX play_sessions_org_date_idx ON public.play_sessions USING btree (org_id, session_date, starts_at)`

**Triggers**

- `play_sessions_fill_client` (before insert or update) runs `play_sessions_fill_client()`
- `play_sessions_forbid_org_change` (before update) runs `forbid_org_change()`
- `play_sessions_set_updated_at` (before update) runs `set_updated_at()`
- `play_sessions_stamp_done` (before insert or update) runs `stamp_done()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `play_sessions_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `play_sessions_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `play_sessions_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `play_sessions_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### play_yards

A fenced area where one pet at a time plays or exercises.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `name` | `text` | yes |  |  |
| `is_active` | `boolean` | yes | `true` |  |
| `sort_order` | `integer` | yes | `0` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `play_yards_pkey`: `PRIMARY KEY (id)`
- Unique `play_yards_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `play_yards_org_id_name_key`: `UNIQUE (org_id, name)`
- Foreign key `play_yards_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `play_yards_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 40)))`

**Triggers**

- `play_yards_forbid_org_change` (before update) runs `forbid_org_change()`
- `play_yards_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `play_yards_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `play_yards_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `play_yards_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `play_yards_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### recipe_ingredients

What goes into a version of a recipe: each stock item, raw, per kilo of cooked food.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `org_id` | `uuid` | yes |  |  |
| `version_id` | `uuid` | yes |  |  |
| `item_id` | `uuid` | yes |  |  |
| `quantity_per_kg` | `bigint` | yes |  | How much of the item, in its own unit (grams, millilitres or pieces), goes into one kilo of cooked food. |

**Constraints**

- Primary key `recipe_ingredients_pkey`: `PRIMARY KEY (org_id, version_id, item_id)`
- Foreign key `recipe_ingredients_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `recipe_ingredients_org_id_item_id_fkey`: `FOREIGN KEY (org_id, item_id) REFERENCES stock_items(org_id, id) ON DELETE RESTRICT`
- Foreign key `recipe_ingredients_org_id_version_id_fkey`: `FOREIGN KEY (org_id, version_id) REFERENCES recipe_versions(org_id, id) ON DELETE CASCADE`
- Check `recipe_ingredients_quantity_per_kg_check`: `CHECK (((quantity_per_kg >= 1) AND (quantity_per_kg <= 10000000)))`

**Triggers**

- `recipe_ingredients_check` (before insert) runs `recipe_ingredients_check()`
- `recipe_ingredients_forbid_org_change` (before update) runs `forbid_org_change()`

**Access**

- Signed-in users may: select, insert (then narrowed by the policies below). Anonymous visitors: nothing.
- `recipe_ingredients_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `recipe_ingredients_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### recipe_versions

What a recipe was at one time. Never changed: changing a recipe makes a new version, and batches and deliveries keep the version they were made from.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `recipe_id` | `uuid` | yes |  |  |
| `version` | `integer` | yes |  | Counts up from 1 for each recipe. |
| `good_for` | `text` |  |  | What it is good for, in words parents read ("light on the stomach, for older dogs"). |
| `cooked_yield_bp` | `integer` |  |  | Cooked weight as a share of the raw ingredients' weight, in basis points: 8500 means 1 kg raw cooks down to 850 g. |
| `kcal_per_kg` | `integer` |  |  | Energy in a kilo of the cooked food, in kilocalories. |
| `protein_g_per_kg` | `integer` |  |  | Protein in a kilo of the cooked food, in grams. |
| `signed_off_by` | `text` |  |  | The veterinary nutritionist who signed this version off. |
| `signed_off_on` | `date` |  |  | When it was signed off. |
| `lab_tested_on` | `date` |  |  | When food of this recipe was last tested by a laboratory. |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `recipe_versions_pkey`: `PRIMARY KEY (id)`
- Unique `recipe_versions_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `recipe_versions_org_id_recipe_id_version_key`: `UNIQUE (org_id, recipe_id, version)`
- Foreign key `recipe_versions_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `recipe_versions_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `recipe_versions_org_id_recipe_id_fkey`: `FOREIGN KEY (org_id, recipe_id) REFERENCES recipes(org_id, id) ON DELETE CASCADE`
- Check `recipe_versions_cooked_yield_bp_check`: `CHECK (((cooked_yield_bp IS NULL) OR ((cooked_yield_bp >= 1000) AND (cooked_yield_bp <= 20000))))`
- Check `recipe_versions_good_for_check`: `CHECK (((good_for IS NULL) OR (char_length(good_for) <= 500)))`
- Check `recipe_versions_kcal_per_kg_check`: `CHECK (((kcal_per_kg IS NULL) OR ((kcal_per_kg >= 0) AND (kcal_per_kg <= 10000))))`
- Check `recipe_versions_protein_g_per_kg_check`: `CHECK (((protein_g_per_kg IS NULL) OR ((protein_g_per_kg >= 0) AND (protein_g_per_kg <= 1000))))`
- Check `recipe_versions_signed_off_by_check`: `CHECK (((signed_off_by IS NULL) OR (char_length(signed_off_by) <= 120)))`
- Check `recipe_versions_version_check`: `CHECK ((version >= 1))`

**Triggers**

- `recipe_versions_forbid_org_change` (before update) runs `forbid_org_change()`
- `recipe_versions_stamp_actor` (before insert) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert (then narrowed by the policies below). Anonymous visitors: nothing.
- `recipe_versions_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `recipe_versions_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### recipes

A recipe the kitchen cooks. What goes in it is in its versions; the newest version is the one cooked. Retired, never deleted, once cooked.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `name` | `text` | yes |  |  |
| `rotation_position` | `smallint` |  |  | Its place in the rotation: each delivery of a subscription takes the next recipe in order, and the rotation repeats (four recipes and two deliveries a week repeat every two weeks). Empty: not in the rotation. |
| `use_by_days` | `smallint` | yes | `3` | How many days after cooking a pack of it may be eaten. A batch's use-by date is its cooking day plus this. |
| `storage_note` | `text` |  |  | How to store it, printed on every label ("Keep in the fridge. Use within 3 days."). |
| `is_retired` | `boolean` | yes | `false` | True once the kennel stops cooking it. Its versions and batches stay. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `recipes_pkey`: `PRIMARY KEY (id)`
- Unique `recipes_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `recipes_org_id_name_key`: `UNIQUE (org_id, name)`
- Foreign key `recipes_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `recipes_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `recipes_retired_out_of_rotation`: `CHECK (((NOT is_retired) OR (rotation_position IS NULL)))`
- Check `recipes_rotation_position_check`: `CHECK (((rotation_position IS NULL) OR ((rotation_position >= 1) AND (rotation_position <= 50))))`
- Check `recipes_storage_note_check`: `CHECK (((storage_note IS NULL) OR (char_length(storage_note) <= 200)))`
- Check `recipes_use_by_days_check`: `CHECK (((use_by_days >= 1) AND (use_by_days <= 60)))`

**Indexes**

- `CREATE UNIQUE INDEX recipes_one_per_rotation_place ON public.recipes USING btree (org_id, rotation_position) WHERE (rotation_position IS NOT NULL)`

**Triggers**

- `recipes_forbid_org_change` (before update) runs `forbid_org_change()`
- `recipes_guard_delete` (before delete) runs `recipes_guard_delete()`
- `recipes_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `recipes_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `recipes_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `recipes_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `recipes_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### recovery_codes

Two-step sign-in recovery codes, one row a code, kept only as a hash. Sealed: no policy, no grant; only make_recovery_codes(), use_recovery_code() and recovery_codes_left() reach it.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `user_id` | `uuid` | yes |  |  |
| `factor_id` | `uuid` | yes |  | The authenticator (auth.mfa_factors) the code was made for. Once that is gone or replaced, the code no longer counts. |
| `code_hash` | `text` | yes |  | SHA-256 of the code, in hex. The code itself is shown once and never stored. |
| `used_at` | `timestamp with time zone` |  |  |  |
| `used_in_session` | `text` |  |  | The session (the session_id in its token) that used the code. That session counts as having given its code. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `recovery_codes_pkey`: `PRIMARY KEY (id)`
- Unique `recovery_codes_user_id_code_hash_key`: `UNIQUE (user_id, code_hash)`
- Foreign key `recovery_codes_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- Check `recovery_codes_code_hash_check`: `CHECK ((code_hash ~ '^[0-9a-f]{64}$'::text))`
- Check `recovery_codes_used_together`: `CHECK (((used_at IS NULL) = (used_in_session IS NULL)))`

**Indexes**

- `CREATE INDEX recovery_codes_user_idx ON public.recovery_codes USING btree (user_id)`

**Access**

- Signed-in users may: nothing directly (then narrowed by the policies below). Anonymous visitors: nothing.
- No policies: no row is reachable except through SECURITY DEFINER functions.

### reminders_sent

A reminder a person sent a parent from Today, on WhatsApp from their own phone: so it leaves the list. Wagbook sends nothing itself.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `kind` | `text` | yes |  | vaccination: card needed before a stay. arrival: see you tomorrow. pickup: going home tomorrow. unpaid: a bill still owed. trial: asking a parent whose dog had the food trial about a subscription (M29). groom: a pet due for a groom again (M35). |
| `subject_id` | `uuid` | yes |  | The booking (vaccination, arrival, pickup), the bill (unpaid), the trial delivery (trial) or the last groom (groom, an appointment) it was about. |
| `sent_on` | `date` | yes |  | The kennel's date it was sent. An unpaid bill comes back three days later. |
| `sent_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `reminders_sent_pkey`: `PRIMARY KEY (id)`
- Foreign key `reminders_sent_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `reminders_sent_sent_by_fkey`: `FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `reminders_sent_kind_check`: `CHECK ((kind = ANY (ARRAY['vaccination'::text, 'arrival'::text, 'pickup'::text, 'unpaid'::text, 'trial'::text, 'groom'::text])))`

**Indexes**

- `CREATE INDEX reminders_sent_org_subject_idx ON public.reminders_sent USING btree (org_id, subject_id, kind)`

**Triggers**

- `reminders_sent_forbid_org_change` (before update) runs `forbid_org_change()`
- `reminders_sent_stamp_actor` (before insert) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `reminders_sent_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `reminders_sent_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `reminders_sent_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### service_areas

A PIN code the kennel delivers to and picks up from, with its name and charge. A code not listed is not served.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `postal_code` | `text` | yes |  |  |
| `name` | `text` | yes |  | What the kennel calls the area, e.g. Indiranagar. |
| `delivery_charge_minor` | `bigint` |  |  | What a delivery or trip there costs the parent, in minor units. Empty: free. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `service_areas_pkey`: `PRIMARY KEY (id)`
- Unique `service_areas_org_id_postal_code_key`: `UNIQUE (org_id, postal_code)`
- Foreign key `service_areas_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `service_areas_delivery_charge_minor_check`: `CHECK (((delivery_charge_minor IS NULL) OR (delivery_charge_minor >= 0)))`
- Check `service_areas_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `service_areas_postal_code_check`: `CHECK (((postal_code ~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$'::text) AND (postal_code ~ '[0-9]'::text)))`

**Triggers**

- `service_areas_forbid_org_change` (before update) runs `forbid_org_change()`
- `service_areas_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `service_areas_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `service_areas_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `service_areas_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `service_areas_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### services

The rate card. A boarding or daycare row sets the price of a stay; addon rows are extras such as grooming or pick-up.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `kind` | `service_kind` | yes |  |  |
| `name` | `text` | yes |  |  |
| `unit` | `text` | yes | `'each'::text` | What one quantity means: night for boarding, day for day boarding, each or hour for add-ons. |
| `price_minor` | `bigint` | yes |  |  |
| `tax_rate_bp` | `integer` |  |  | Tax rate for this service in basis points. Empty means use the organisation default. |
| `sac_code` | `text` |  |  | Services Accounting Code printed on Indian tax invoices. The kennel's accountant decides the code. |
| `shared_price_minor` | `bigint` |  |  | Boarding and day boarding only: the price per night or day for the second pet sharing a kennel with a pet of the same parent, set by the kennel. Empty: the second pet pays the usual price. |
| `is_default` | `boolean` | yes | `false` | The service pre-selected for new bookings of its kind. At most one per kind. |
| `is_active` | `boolean` | yes | `true` |  |
| `sort_order` | `integer` | yes | `0` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `services_pkey`: `PRIMARY KEY (id)`
- Unique `services_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `services_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `services_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `services_price_minor_check`: `CHECK ((price_minor >= 0))`
- Check `services_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `services_shared_price_minor_check`: `CHECK (((shared_price_minor IS NULL) OR (shared_price_minor >= 0)))`
- Check `services_shared_price_only_for_stays`: `CHECK (((shared_price_minor IS NULL) OR (kind <> 'addon'::service_kind)))`
- Check `services_tax_rate_bp_check`: `CHECK (((tax_rate_bp IS NULL) OR ((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000))))`
- Check `services_unit_check`: `CHECK ((unit = ANY (ARRAY['night'::text, 'day'::text, 'each'::text, 'hour'::text])))`

**Indexes**

- `CREATE UNIQUE INDEX services_one_default_per_kind ON public.services USING btree (org_id, kind) WHERE (is_default AND is_active)`
- `CREATE INDEX services_org_idx ON public.services USING btree (org_id, kind, sort_order)`

**Triggers**

- `services_audit` (after insert or delete or update) runs `audit_row()`
- `services_forbid_org_change` (before update) runs `forbid_org_change()`
- `services_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `services_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `services_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `services_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `services_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### stay_updates

A note about how a pet is doing, usually with photos. Doubles as the shift handover log. Visible ones appear on the parent's stay page.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `booking_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `body` | `text` | yes |  |  |
| `media_paths` | `text[]` | yes | `'{}'::text[]` | Paths of photos or videos inside the pet-media storage bucket. |
| `is_visible_to_parent` | `boolean` | yes | `true` | False keeps the note internal (staff handover only). |
| `shared_at` | `timestamp with time zone` |  |  | When a staff member opened WhatsApp to send this update to the parent. |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `stay_updates_pkey`: `PRIMARY KEY (id)`
- Foreign key `stay_updates_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `stay_updates_org_id_booking_id_pet_id_fkey`: `FOREIGN KEY (org_id, booking_id, pet_id) REFERENCES bookings(org_id, id, pet_id) ON DELETE CASCADE`
- Foreign key `stay_updates_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `stay_updates_at_most_six_photos`: `CHECK ((cardinality(media_paths) <= 6))`
- Check `stay_updates_body_check`: `CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)))`
- Check `stay_updates_media_in_org`: `CHECK (paths_in_org(media_paths, org_id))`

**Indexes**

- `CREATE INDEX stay_updates_org_booking_idx ON public.stay_updates USING btree (org_id, booking_id, created_at DESC)`

**Triggers**

- `stay_updates_forbid_org_change` (before update) runs `forbid_org_change()`
- `stay_updates_guard_media` (before update of media_paths) runs `stay_updates_guard_media()`
- `stay_updates_set_updated_at` (before update) runs `set_updated_at()`
- `stay_updates_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `stay_updates_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `stay_updates_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `stay_updates_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `stay_updates_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### stock_costs

What a purchase cost, the supplier's bill number and a photo of the bill. Owners and managers only. Recipe costs (M27) come from the latest of these.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `org_id` | `uuid` | yes |  |  |
| `move_id` | `uuid` | yes |  |  |
| `cost_minor` | `bigint` | yes |  | What the whole purchase cost, in minor units. |
| `bill_number` | `text` |  |  | The number on the supplier's bill. |
| `bill_path` | `text` |  |  | Photo of the supplier's bill in storage, under {org_id}/expenses/, so only owners and managers open it. |
| `expense_id` | `uuid` |  |  | The expense the purchase was also written down as, when it was (E4). |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `stock_costs_pkey`: `PRIMARY KEY (org_id, move_id)`
- Foreign key `stock_costs_org_id_expense_id_fkey`: `FOREIGN KEY (org_id, expense_id) REFERENCES expenses(org_id, id) ON DELETE SET NULL (expense_id)`
- Foreign key `stock_costs_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `stock_costs_org_id_move_id_fkey`: `FOREIGN KEY (org_id, move_id) REFERENCES stock_moves(org_id, id) ON DELETE CASCADE`
- Check `stock_costs_bill_in_org`: `CHECK (paths_in_org(ARRAY[bill_path], org_id))`
- Check `stock_costs_bill_number_check`: `CHECK (((bill_number IS NULL) OR (char_length(bill_number) <= 40)))`
- Check `stock_costs_cost_minor_check`: `CHECK ((cost_minor >= 0))`

**Triggers**

- `stock_costs_forbid_org_change` (before update) runs `forbid_org_change()`

**Access**

- Signed-in users may: select, insert (then narrowed by the policies below). Anonymous visitors: nothing.
- `stock_costs_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `stock_costs_select` (select): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### stock_items

A thing the kennel keeps in stock: chicken, rice, carrots, pouches, gas, shampoo.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `name` | `text` | yes |  |  |
| `unit` | `stock_unit` | yes |  | How it is counted. Every quantity of this item is a whole number of this unit. |
| `kind` | `stock_kind` | yes |  |  |
| `supplier_id` | `uuid` |  |  | The usual supplier, used to group the shopping list. |
| `low_level` | `bigint` |  |  | At or below this quantity the stock page shows the item as low. Empty: never low. |
| `never_in_recipe` | `boolean` | yes | `false` | True for food a dog must never eat (onion, garlic, grapes, raisins, chocolate, cooked bones, added sugar): the database refuses a recipe that uses it (M27). |
| `is_active` | `boolean` | yes | `true` | False once the kennel stops keeping it. Its movements stay. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `stock_items_pkey`: `PRIMARY KEY (id)`
- Unique `stock_items_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `stock_items_org_id_name_key`: `UNIQUE (org_id, name)`
- Foreign key `stock_items_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `stock_items_org_id_supplier_id_fkey`: `FOREIGN KEY (org_id, supplier_id) REFERENCES suppliers(org_id, id) ON DELETE SET NULL (supplier_id)`
- Check `stock_items_low_level_check`: `CHECK (((low_level IS NULL) OR (low_level >= 0)))`
- Check `stock_items_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`

**Triggers**

- `stock_items_check_never` (before update of never_in_recipe) runs `stock_items_check_never()`
- `stock_items_forbid_org_change` (before update) runs `forbid_org_change()`
- `stock_items_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `stock_items_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `stock_items_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `stock_items_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `stock_items_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### stock_moves

Every change to stock: bought in, used in cooking, thrown away, or counted. Never changed or deleted: what is in stock is the sum of these. A mistake is put right by a stock take.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `item_id` | `uuid` | yes |  |  |
| `kind` | `stock_move_kind` | yes |  |  |
| `quantity` | `bigint` | yes |  | The change, in the item's unit: positive in, negative out. For a stock take the database works it out from what was counted. |
| `happened_on` | `date` | yes |  | The day it was bought, used, thrown away or counted, in the kennel's time zone. |
| `supplier_id` | `uuid` |  |  |  |
| `use_by` | `date` |  |  | Purchases only: the use-by date of what was bought, for the stock page's "use soon" list. |
| `reason` | `waste_reason` |  |  | Waste only: why it was thrown away. |
| `counted` | `bigint` |  |  | Stock takes only: the quantity counted on the shelf. |
| `batch_id` | `uuid` |  |  | Used only: the batch of cooking that took it (M30). |
| `note` | `text` |  |  |  |
| `created_by` | `uuid` |  | `auth.uid()` | Who wrote it down. Set by the database. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `stock_moves_pkey`: `PRIMARY KEY (id)`
- Unique `stock_moves_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `stock_moves_batch_fkey`: `FOREIGN KEY (org_id, batch_id) REFERENCES batches(org_id, id) ON DELETE RESTRICT`
- Foreign key `stock_moves_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `stock_moves_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `stock_moves_org_id_item_id_fkey`: `FOREIGN KEY (org_id, item_id) REFERENCES stock_items(org_id, id) ON DELETE RESTRICT`
- Foreign key `stock_moves_org_id_supplier_id_fkey`: `FOREIGN KEY (org_id, supplier_id) REFERENCES suppliers(org_id, id) ON DELETE SET NULL (supplier_id)`
- Check `stock_moves_counted_check`: `CHECK (((counted IS NULL) OR (counted >= 0)))`
- Check `stock_moves_note_check`: `CHECK (((note IS NULL) OR (char_length(note) <= 300)))`
- Check `stock_moves_shape`: `CHECK (
CASE kind
    WHEN 'purchase'::stock_move_kind THEN ((quantity > 0) AND (reason IS NULL) AND (counted IS NULL) AND (batch_id IS NULL))
    WHEN 'used'::stock_move_kind THEN ((quantity < 0) AND (reason IS NULL) AND (counted IS NULL) AND (batch_id IS NOT NULL) AND (use_by IS NULL))
    WHEN 'waste'::stock_move_kind THEN ((quantity < 0) AND (reason IS NOT NULL) AND (counted IS NULL) AND (batch_id IS NULL) AND (use_by IS NULL))
    WHEN 'count'::stock_move_kind THEN ((counted IS NOT NULL) AND (reason IS NULL) AND (batch_id IS NULL) AND (use_by IS NULL))
    ELSE NULL::boolean
END)`

**Indexes**

- `CREATE INDEX stock_moves_org_item_idx ON public.stock_moves USING btree (org_id, item_id, happened_on)`

**Triggers**

- `stock_moves_apply` (before insert) runs `stock_moves_apply()`
- `stock_moves_forbid_org_change` (before update) runs `forbid_org_change()`
- `stock_moves_stamp_actor` (before insert) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert (then narrowed by the policies below). Anonymous visitors: nothing.
- `stock_moves_insert` (insert): new values must satisfy `((org_id IN ( SELECT my_org_ids() AS my_org_ids)) AND ((kind <> 'purchase'::stock_move_kind) OR (org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))))`
- `stock_moves_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### subscriptions

Food delivered to a pet at home on set weekdays (two a week by default), paid a week or a month ahead. Deliveries are made ahead from it (plan_subscription).

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `client_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `product_id` | `uuid` | yes |  | The subscription food in the rate card. Its price per kilo is copied onto each delivery when it is made. |
| `plan` | `food_plan` | yes | `'full'::food_plan` |  |
| `grams_per_day` | `integer` | yes |  | Grams of food a day, from the portion worked out for the pet or set by hand. |
| `weekdays` | `smallint[]` | yes |  | Delivery days, 1 Monday to 7 Sunday. Each delivery covers the days until the next. |
| `slot` | `delivery_slot` | yes | `'morning'::delivery_slot` |  |
| `address_id` | `uuid` |  |  | Where it is delivered. Empty: collected at the kennel. |
| `starts_on` | `date` | yes |  | The first day a delivery may fall on. |
| `pay_period` | `pay_period` | yes | `'week'::pay_period` |  |
| `source` | `customer_source` | yes | `'other'::customer_source` | Where the customer came from, for the food reports. |
| `paused_from` | `date` |  |  | Paused from this day. Empty: not paused. |
| `paused_until` | `date` |  |  | Paused up to and including this day. Empty with paused_from set: paused until resumed. |
| `cancelled_on` | `date` |  |  | No deliveries from this day on. |
| `cancel_reason` | `text` |  |  |  |
| `notes` | `text` |  |  |  |
| `created_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `subscriptions_pkey`: `PRIMARY KEY (id)`
- Unique `subscriptions_org_id_id_key`: `UNIQUE (org_id, id)`
- Foreign key `subscriptions_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `subscriptions_org_id_address_id_fkey`: `FOREIGN KEY (org_id, address_id) REFERENCES client_addresses(org_id, id) ON DELETE SET NULL (address_id)`
- Foreign key `subscriptions_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE RESTRICT`
- Foreign key `subscriptions_org_id_client_id_pet_id_fkey`: `FOREIGN KEY (org_id, client_id, pet_id) REFERENCES pets(org_id, client_id, id) ON UPDATE CASCADE ON DELETE RESTRICT`
- Foreign key `subscriptions_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `subscriptions_org_id_product_id_fkey`: `FOREIGN KEY (org_id, product_id) REFERENCES food_products(org_id, id) ON DELETE RESTRICT`
- Check `subscriptions_cancel_has_reason`: `CHECK (((cancelled_on IS NULL) = (cancel_reason IS NULL)))`
- Check `subscriptions_cancel_reason_check`: `CHECK (((cancel_reason IS NULL) OR (char_length(cancel_reason) <= 300)))`
- Check `subscriptions_grams_per_day_check`: `CHECK (((grams_per_day >= 10) AND (grams_per_day <= 5000)))`
- Check `subscriptions_notes_check`: `CHECK (((notes IS NULL) OR (char_length(notes) <= 500)))`
- Check `subscriptions_pause_in_order`: `CHECK (((paused_until IS NULL) OR ((paused_from IS NOT NULL) AND (paused_until >= paused_from))))`
- Check `subscriptions_weekdays_check`: `CHECK ((((cardinality(weekdays) >= 1) AND (cardinality(weekdays) <= 7)) AND (weekdays <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint])))`

**Indexes**

- `CREATE INDEX subscriptions_org_client_idx ON public.subscriptions USING btree (org_id, client_id)`

**Triggers**

- `subscriptions_forbid_org_change` (before update) runs `forbid_org_change()`
- `subscriptions_replan` (after update) runs `subscriptions_replan()`
- `subscriptions_set_updated_at` (before update) runs `set_updated_at()`
- `subscriptions_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `subscriptions_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `subscriptions_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `subscriptions_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `subscriptions_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

### suppliers

Who the kennel buys from: a butcher, a vegetable seller, a packaging shop.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `name` | `text` | yes |  |  |
| `phone` | `text` |  |  | In E.164 form, so the shopping list can be sent on WhatsApp. |
| `supplies` | `text` |  |  | What they supply, in the kennel's own words ("chicken, mutton, liver"). |
| `is_active` | `boolean` | yes | `true` | False once the kennel stops buying from them; past purchases keep the name. |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `suppliers_pkey`: `PRIMARY KEY (id)`
- Unique `suppliers_org_id_id_key`: `UNIQUE (org_id, id)`
- Unique `suppliers_org_id_name_key`: `UNIQUE (org_id, name)`
- Foreign key `suppliers_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Check `suppliers_name_check`: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- Check `suppliers_phone_check`: `CHECK (((phone IS NULL) OR (phone ~ '^\+[1-9][0-9]{7,14}$'::text)))`
- Check `suppliers_supplies_check`: `CHECK (((supplies IS NULL) OR (char_length(supplies) <= 200)))`

**Triggers**

- `suppliers_forbid_org_change` (before update) runs `forbid_org_change()`
- `suppliers_set_updated_at` (before update) runs `set_updated_at()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `suppliers_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `suppliers_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`
- `suppliers_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `suppliers_update` (update): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`; new values must satisfy `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role, 'manager'::member_role]) AS my_org_ids_with_role))`

### vaccinations

One vaccine record for a pet. Which vaccines a kennel insists on is the kennel's policy; Wagbook only stores and reminds.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `pet_id` | `uuid` | yes |  |  |
| `vaccine` | `text` | yes |  | Free text so any country's schedule fits, e.g. rabies, dhppil, kennel_cough, fvrcp. |
| `given_on` | `date` |  |  |  |
| `valid_until` | `date` |  |  | Date the protection lapses. Drives "vaccination due" warnings at booking and check-in. |
| `certificate_path` | `text` |  |  | Path of the certificate photo or PDF inside the pet-media storage bucket. |
| `notes` | `text` |  |  |  |
| `verified_by` | `uuid` |  |  | Staff member who looked at the certificate and confirmed it. |
| `verified_at` | `timestamp with time zone` |  |  |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `vaccinations_pkey`: `PRIMARY KEY (id)`
- Foreign key `vaccinations_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `vaccinations_org_id_pet_id_fkey`: `FOREIGN KEY (org_id, pet_id) REFERENCES pets(org_id, id) ON DELETE CASCADE`
- Foreign key `vaccinations_verified_by_fkey`: `FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `vaccinations_certificate_in_org`: `CHECK (paths_in_org(ARRAY[certificate_path], org_id))`
- Check `vaccinations_check`: `CHECK (((valid_until IS NULL) OR (given_on IS NULL) OR (valid_until >= given_on)))`
- Check `vaccinations_vaccine_check`: `CHECK (((char_length(vaccine) >= 1) AND (char_length(vaccine) <= 60)))`

**Indexes**

- `CREATE INDEX vaccinations_org_pet_idx ON public.vaccinations USING btree (org_id, pet_id)`

**Triggers**

- `vaccinations_forbid_org_change` (before update) runs `forbid_org_change()`
- `vaccinations_set_updated_at` (before update) runs `set_updated_at()`
- `vaccinations_stamp_verified` (before insert or update) runs `stamp_when_set()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `vaccinations_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `vaccinations_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `vaccinations_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `vaccinations_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

## Views

### course_balances

Each training course with the sessions used (confirmed, done or not come) and the sessions left.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `course_id` | `uuid` |  |  |  |
| `org_id` | `uuid` |  |  |  |
| `client_id` | `uuid` |  |  |  |
| `pet_id` | `uuid` |  |  |  |
| `service_id` | `uuid` |  |  |  |
| `name` | `text` |  |  |  |
| `sessions` | `smallint` |  |  |  |
| `invoice_id` | `uuid` |  |  |  |
| `sessions_used` | `integer` |  |  |  |
| `sessions_left` | `integer` |  |  |  |

**Access**: signed-in users may select. Runs with the caller's row level security.

### invoice_balances

Each invoice with what has been paid against it, what credit notes took off it, and what is still due (below zero: paid more than it now comes to, so a refund is owed).

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `invoice_id` | `uuid` |  |  |  |
| `org_id` | `uuid` |  |  |  |
| `client_id` | `uuid` |  |  |  |
| `booking_id` | `uuid` |  |  |  |
| `group_id` | `uuid` |  |  |  |
| `status` | `invoice_status` |  |  |  |
| `number` | `text` |  |  |  |
| `total_minor` | `bigint` |  |  |  |
| `paid_minor` | `bigint` |  |  |  |
| `credited_minor` | `bigint` |  |  |  |
| `due_minor` | `bigint` |  |  |  |
| `series_id` | `uuid` |  |  |  |
| `series_month` | `date` |  |  |  |
| `appointment_id` | `uuid` |  |  |  |

**Access**: signed-in users may select. Runs with the caller's row level security.

### pass_balances

Each day boarding pack with the days used (bookings that hold a place) and the days left.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `pass_id` | `uuid` |  |  |  |
| `org_id` | `uuid` |  |  |  |
| `client_id` | `uuid` |  |  |  |
| `name` | `text` |  |  |  |
| `days` | `integer` |  |  |  |
| `starts_on` | `date` |  |  |  |
| `valid_until` | `date` |  |  |  |
| `invoice_id` | `uuid` |  |  |  |
| `days_used` | `integer` |  |  |  |
| `days_left` | `integer` |  |  |  |

**Access**: signed-in users may select. Runs with the caller's row level security.

### recipe_current

Each recipe's newest version: the one cooked from now on.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `recipe_id` | `uuid` |  |  |  |
| `org_id` | `uuid` |  |  |  |
| `version_id` | `uuid` |  |  |  |
| `version` | `integer` |  |  |  |
| `name` | `text` |  |  |  |
| `rotation_position` | `smallint` |  |  |  |
| `is_retired` | `boolean` |  |  |  |
| `use_by_days` | `smallint` |  |  |  |

**Access**: signed-in users may select. Runs with the caller's row level security.

### stock_levels

Each item with what is in stock now: the sum of its movements.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `item_id` | `uuid` |  |  |  |
| `org_id` | `uuid` |  |  |  |
| `name` | `text` |  |  |  |
| `unit` | `stock_unit` |  |  |  |
| `kind` | `stock_kind` |  |  |  |
| `supplier_id` | `uuid` |  |  |  |
| `low_level` | `bigint` |  |  |  |
| `never_in_recipe` | `boolean` |  |  |  |
| `is_active` | `boolean` |  |  |  |
| `on_hand` | `bigint` |  |  |  |

**Access**: signed-in users may select. Runs with the caller's row level security.

## Functions

Who may call: **public** means anyone, signed in or not. **signed-in** means any authenticated user (the function itself then checks membership and role). **internal** means no API role can call it; it runs only from triggers or other functions.

### accept_intake

```
accept_intake(p_submission uuid) returns uuid
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: volatile

Staff action: turns a new intake submission into a client and pets. A parent already known by phone number is reused and left unchanged; only pets with new names are added, each with the vaccinations the parent listed and the certificate they sent for it, if any, and the weight they gave as its first weighing. A new parent who gave an address with a PIN code gets it as their home address. Returns the client id. Creating the booking is a separate step.

### accept_invitation_link

```
accept_invitation_link(p_token text) returns uuid
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Joins the signed-in person to the organisation of an invitation link, in its role. Works once; refuses an expired or withdrawn link and someone who is already a member.

### apply_package

```
apply_package(p_booking uuid, p_package uuid, p_price bigint) returns integer
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: volatile

Puts a package on a stay: the stay is billed as the package (one line at its price, or p_price, which only owners and managers give: WB206, WB022), its extras go on the stay at no charge, and each of its appointments is booked at the first free time on its day (first_free_start). Refused for a stay that is over, already has a package, is priced in parts or from a pack, repeats, or has a bill out (WB205), or of the other kind (WB204). Returns how many appointments found no free time.

### appointment_items_price

```
appointment_items_price() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: an add-on is an active add-on service (WB203), priced for the appointment's pet (appointment_price()) unless an owner or manager gives another price, with the service's tax and code. Staff cannot change what one costs afterwards (WB025).

### appointment_price

```
appointment_price(p_org uuid, p_service uuid, p_pet uuid) returns bigint
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

What a pet pays for an appointment service: the fixed price; by size, the price for its size band from its latest weight; by coat, the price for its breed, else its coat; else the service's own price. Empty on quote. Must match appointmentPrice() in src/lib/core/appointments.ts.

### appointments_check

```
appointments_check() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: an appointment takes its kind and clean-up from its service (WB190 for a service that cannot be booked) and its price, tax and code (only owners and managers give another, WB022; a course or package session is free; a quote must be priced before it holds anything, WB199). It must be in a place in service (WB191), inside its hours (WB192), on a day of its stay for a boarder (WB193), within its package (WB207) or course (WB201, WB202), and within a party's people (WB197). Done needs the certificates seen (WB194), a swim's supervisor and life jacket (WB195) and a guest's certificates (WB196). A cancelled one stays cancelled (WB198).

### audit_row

```
audit_row() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Trigger: appends one audit_log row per insert, update or delete, storing only what changed.

### available_kennels

```
available_kennels(p_org uuid, p_kind booking_kind, p_start date, p_end date, p_client uuid, p_pets integer) returns SETOF kennels
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

Active kennels that can take p_pets more pets (1 or 2) for the whole of a stay: held by nobody, or, given a parent, held only by that parent's pets with room to spare (a kennel holds two). Used to offer kennels when booking or checking in. Must agree with freeKennels() in src/lib/core/bookings.ts.

### batch_cost

```
batch_cost(p_org uuid, p_batch uuid) returns bigint
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

What a batch cost: its version's cost per kilo on the day it was cooked, times its kilos. Owners and managers only (recipe_cost_per_kg).

### batch_recipients

```
batch_recipients(p_org uuid, p_batch uuid) returns TABLE(kind text, on_date date, pet_id uuid, pet_name text, client_id uuid, client_name text, phone text, delivery_id uuid)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

Who received a batch: every delivery packed from it, and every boarder on the kitchen's food who was in house on the day the boarders ate from it (batches.boarders_on). Row level security applies.

### batches_number

```
batches_number() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a new batch is numbered by its cooking day and a count (270314-1, 270314-2), and takes its recipe and use-by date (cooked_on plus the recipe's use_by_days) from its version.

### booking_items_guard_price

```
booking_items_guard_price() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: staff add extras from the price list at the listed price (or one-off items with no price list entry) and cannot change what an extra costs afterwards.

### bookings_check_capacity

```
bookings_check_capacity() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Trigger: refuses a kennel that is out of service (WB021), a third pet in one kennel (WB027), and a booking that would need more kennels than are active on any day of the stay (WB020; two pets sharing a kennel need one).

### bookings_check_group

```
bookings_check_group() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: every booking sharing a group_id has the same client (WB024), and a booking's group_id never changes (WB026).

### bookings_check_package

```
bookings_check_package() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a stay's package and its price are set only by apply_package() and never changed afterwards (WB205).

### bookings_check_pass

```
bookings_check_pass() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a day boarding booking paid from a pack must be day boarding of the pack's parent (WB110), inside its dates (WB111), and, once it holds a place, within the days left (WB112).

### bookings_check_shared_price

```
bookings_check_shared_price() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a new booking made by staff at the shared kennel price must share its kennel with another pet of the same parent on overlapping days (WB023 otherwise).

### bookings_follow_appointments

```
bookings_follow_appointments() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a stay cancelled or not come cancels its appointments still to come; a stay whose dates change cancels those on days it no longer has.

### bookings_guard_price

```
bookings_guard_price() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: only owners and managers set or change what a stay costs. Staff can book only at a price on the price list (the usual price, or the shared kennel price for a pet sharing a kennel, with the usual price for nights alone), with no discount, and cannot change the price, discount, tax or kind of an existing booking, or when it turns from day boarding into boarding.

### bookings_keep_billed_month

```
bookings_keep_billed_month() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a day of a repeating series whose month has an issued bill cannot move into another month (WB057), where it would be billed a second time.

### bookings_stamp_status

```
bookings_stamp_status() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: records who and when as a booking is created, checked in, checked out or cancelled, and when a request joined the waiting list (its place in line, which never moves). Client-supplied values for these columns are ignored.

### check_bill_line

```
check_bill_line(p_mode tax_mode, p_intra boolean, p_include boolean, p_quantity numeric, p_unit_price_minor bigint, p_discount_minor bigint, p_taxable_minor bigint, p_tax_rate_bp integer, p_cgst_minor bigint, p_sgst_minor bigint, p_igst_minor bigint, p_tax_minor bigint) returns void
```

- Who may call: internal
- Runs as: the caller (row level security applies)
- Volatility: immutable

Raises WB037 when a line's taxable value and tax are not what its quantity, price, discount and rate give under the tax mode (within the state or across states, prices with or without tax). Used by issue_invoice and issue_credit_note.

### check_privacy_access

```
check_privacy_access(p_org uuid) returns void
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

Raises unless the caller is an owner or manager of the organisation. export_client and erase_client call it first; erase_client then also needs an owner (WB074).

### check_report_access

```
check_report_access(p_org uuid, p_from date, p_to date) returns void
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

Raises unless the caller is an owner or manager of the organisation and the period runs forwards for at most 400 days. Every report calls it first.

### client_file_paths

```
client_file_paths(p_client uuid) returns text[]
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

Paths in the pet-media bucket that hold this parent's pets' photos and certificates, photos from their stays and food deliveries, and files sent with their intake forms (with the small copy of every photo). Runs as the caller, so it lists only what they may read.

### clients_guard_phone

```
clients_guard_phone() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: only owners and managers change a parent's phone number or other number (WB002). Anyone may add a parent.

### clients_hide_pets

```
clients_hide_pets() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: hiding a parent hides their pets with the same time; showing the parent again shows the pets hidden at that time, not ones hidden on their own earlier.

### confirm_food_order

```
confirm_food_order(p_order uuid) returns uuid
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Confirms a food order once its money has arrived: a website order makes or matches the parent by phone, the pet by name (with its first weighing), the address, and the trial delivery or the subscription with its first two weeks of deliveries; a parent's change pauses the subscription, skips the delivery, or adds the extra order. Returns the parent. Any member (row level security applies); once only (WB188).

### create_invitation_link

```
create_invitation_link(p_org uuid, p_role member_role, p_display_name text) returns text
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Makes an invitation link for someone with no account yet. Owner or manager; only owners can invite owners. Returns the secret token.

### create_organization

```
create_organization(p_name text, p_slug text, p_display_name text) returns uuid
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Creates an organisation and makes the signed-in user its owner. The only way an organisation comes into being.

### default_intake_notice

```
default_intake_notice(p_org_name text, p_language text) returns text
```

- Who may call: internal
- Runs as: the caller (row level security applies)
- Volatility: immutable

Consent wording used when an organisation has not written its own, in the parent pages' language (en, hi or kn; anything else gives English).

### deliveries_check_batch

```
deliveries_check_batch() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a delivery is packed only from a batch of its own recipe (WB160), cooked on or before its day and within its use-by date (WB161).

### deliveries_check_run

```
deliveries_check_run() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a delivery is put on a run of its own day and slot (WB171).

### deliveries_guard

```
deliveries_guard() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: after its cut-off (delivery_cutoff) a delivery only moves along: packed, out, at the door, or cancelled by an owner or manager (WB151). A delivery on a bill is cancelled, never deleted (WB152). A cancelled one stays cancelled, and one that has been to the door is not cancelled (WB153).

### deliveries_price

```
deliveries_price() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a delivery's unit price, tax rate and code are copied from the rate card when it is made (WB150 when the food is not sold that way), its packs and price worked out from its grams, and its delivery charge copied from the area of its address. Only owners and managers give another unit price (WB022). A replacement costs nothing. A made-to-order item is refused sooner than the kennel's lead time (WB156).

### delivery_cutoff

```
delivery_cutoff(p_org uuid, p_date date, p_slot delivery_slot) returns timestamp with time zone
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

When changes to a delivery close: the start of its slot (8:00, 13:00 or 18:00 kennel time) less the kennel's food_cutoff_hours. Must match deliveryCutoff() in src/lib/core/food.ts.

### delivery_problems_check

```
delivery_problems_check() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a problem is reported about a delivery that was handed over, within the kennel's problem_window_hours of it (WB174).

### delivery_runs_check_rider

```
delivery_runs_check_rider() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a run is ridden by an active member of the kennel (WB170).

### erase_client

```
erase_client(p_client uuid) returns text[]
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Erases a parent on their request: empties every personal detail on the parent and the notes on their stays, deletes their addresses, the updates sent to them, their intake forms and food orders, draft bills, vaccination certificates (a card shows the owner) and photos taken at their door, and takes that text out of the history of changes. Keeps the pets with their health, routines, incidents, care and play (hidden), issued and cancelled bills (with the buyer details printed on them), payments, and the stays' dates and prices. Empties the notes, session notes and homework of their appointments. Refused while a pet is in house (WB071), a stay is still to come (WB072), food is still to be delivered (WB075) or an appointment is still to come (WB076). Returns the storage paths of the files to remove. Owner only (WB070, WB074).

### export_client

```
export_client(p_client uuid) returns jsonb
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

Everything held about one parent, for a request under the DPDP Act: their details and consent, their addresses, their pets with vaccinations, weights, food, routines and incidents, every stay with its extras, updates, care and play, appointments with their add-ons and training courses, food subscriptions, deliveries with their problems and food orders, bills with their lines and credit notes, payments, the intake forms they sent, and the paths of the files. Owner or manager (WB070).

### first_delivery_day

```
first_delivery_day(p_org uuid, p_weekdays smallint[]) returns date
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

The first day, on one of the given weekdays, whose morning delivery is still before its cut-off.

### first_free_start

```
first_free_start(p_org uuid, p_place uuid, p_pet uuid, p_day date, p_minutes integer, p_cleanup integer, p_latest_end time without time zone, p_latest boolean) returns timestamp with time zone
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

The first (or with p_latest, the last) start every 30 minutes inside a place's hours on a day where the place, with clean-up, and the pet are free, in the future and ending by p_latest_end if given. Empty when there is none. Must agree with freeTimes() in src/lib/core/appointments.ts.

### fiscal_year_label

```
fiscal_year_label(p_date date, p_start_month integer) returns text
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: immutable

Financial year label for a date, e.g. 2027-04-14 -> 2027-28 when the year starts in April. Must match fiscalYear() in src/lib/core/dates.ts.

### food_bill_lines

```
food_bill_lines(p_org uuid, p_subscription uuid, p_from date, p_to date, p_delivery uuid) returns TABLE(part text, quantity numeric, unit_price_minor bigint, discount_minor bigint, tax_rate_bp integer, sac_code text)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

The lines a food bill should have: a subscription's deliveries from p_from to p_to (one line per price and tax rate, in kilos, less the monthly discount when it is paid a month ahead), or one order's food; then the delivery charges. Cancelled deliveries and replacements are left off. Must match foodLines() in src/lib/food-bill.ts; issue_invoice() checks staff bills against it.

### food_order_paid

```
food_order_paid(p_token text) returns text
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

PUBLIC. The parent says they have paid for their order: an unpaid order becomes paid (claimed), for staff to check. Returns the order's status.

### food_orders_stamp_review

```
food_orders_stamp_review() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: who confirmed or declined an order, and when, recorded by the database.

### forbid_org_change

```
forbid_org_change() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a row never changes organisation. Without this, a member of two organisations could make a row vanish from one by moving it to the other.

### generate_care_tasks

```
generate_care_tasks(p_org uuid, p_date date) returns integer
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: volatile

Creates the day's tasks for every pet in house (checked in, on or after its first day) from the house and per-pet routines. Safe to call repeatedly; returns how many tasks were new.

### get_invitation_link

```
get_invitation_link(p_token text) returns TABLE(org_name text, role member_role, display_name text, usable boolean, already_member boolean)
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

What an invitation link is for (kennel name, role, name), for a signed-in person holding it, and whether it can still be used.

### get_public_booking_form

```
get_public_booking_form(p_token text) returns jsonb
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

PUBLIC. The parent's own booking link: the kennel's name, WhatsApp number and usual times, the parent's first name, their pets' names, which kinds of stay can be asked for, their stays already asked for or booked (dates and status only), and, when the kennel delivers food, their subscriptions with the next deliveries. Nothing for a hidden or erased parent.

### get_public_food_form

```
get_public_food_form(p_slug text) returns jsonb
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

PUBLIC. What the food order page needs: the kennel's name and UPI details, the consent wording, the trial and subscription food with their prices, the kennel's portion settings and pack size, and the PIN codes it delivers to with their charges. Nothing unless the kennel delivers food and takes orders.

### get_public_intake_form

```
get_public_intake_form(p_slug text) returns jsonb
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

PUBLIC. What the intake form page needs to show for a kennel: its name, city, WhatsApp number, usual times, consent wording, and whether it delivers (so the form asks for an address with a PIN code).

### get_public_invoice

```
get_public_invoice(p_token text) returns jsonb
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

PUBLIC. One issued (or voided) invoice, found by its secret token, with its lines, what has been paid, its credit notes with their lines, the kennel's UPI details for a pay link, and the language the parent asked for alongside English (clients.bill_translation). Drafts are never shown.

### get_public_stay

```
get_public_stay(p_token text) returns jsonb
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

PUBLIC. The parent's stay page for one booking, found by its secret token: kennel contact, pet name and photo path, dates, status, parent-visible updates with their photo paths, and a count of care done. No notes, prices, medical details or other pets. Stops working when the booking is cancelled and 30 days after check-out. The photos themselves are fetched through Storage with the same token (stay_media_visible).

### guard_hiding

```
guard_hiding() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger on pets and clients: only owners and managers hide a row (deleted_at) or show it again; never while it has a stay requested, confirmed or in house (WB019); a pet is shown again only once its parent is.

### incidents_guard_content

```
incidents_guard_content() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: once written, an incident's account (what, how serious, what was done, vet, when, which pet and stay) is changed only by an owner or manager (WB080). Anyone may mark the parent told or the incident dealt with.

### intake_submissions_stamp_review

```
intake_submissions_stamp_review() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a submission is reviewed once. Records who and when as it leaves "new", and refuses any later change of status, so a declined form cannot be reopened and accepted.

### intake_upload_allowed

```
intake_upload_allowed(p_name text) returns boolean
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

PUBLIC, through Storage only. True when the request carries the upload token of an intake form (x-wagbook-intake header) sent less than an hour ago and still waiting, and the file is named {org_id}/intake/{submission_id}/pet-N (or pet-N-2, for a second vaccine) for one of the form's pets. SECURITY DEFINER because the anonymous role can read no table.

### invite_member_by_email

```
invite_member_by_email(p_org uuid, p_email text, p_role member_role, p_display_name text) returns void
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Invites an existing account to an organisation, or corrects an invitation that has not been answered yet. Someone who is already a member is left unchanged. The person becomes a member only when they accept. Owner or manager only; only owners can invite or change owners. Returns nothing in every case.

### invoice_bookings

```
invoice_bookings(p_org uuid, p_booking uuid, p_group uuid, p_series uuid, p_month date) returns SETOF uuid
```

- Who may call: internal
- Runs as: the caller (row level security applies)
- Volatility: stable

The bookings a bill covers, in date order: its own booking; or the family's bookings that are not requests or cancelled; or the days of a series in the month starting p_month that are not requests or cancelled. Must match BILLABLE_IN_FAMILY in src/lib/billing.ts.

### invoice_expected_lines

```
invoice_expected_lines(p_org uuid, p_booking uuid, p_group uuid, p_tax_mode tax_mode, p_series uuid, p_month date, p_appointment uuid) returns TABLE(quantity numeric, unit_price_minor bigint, discount_minor bigint, tax_rate_bp integer)
```

- Who may call: internal
- Runs as: the caller (row level security applies)
- Volatility: stable

The lines a bill should have, as quantity, unit price, discount and tax rate: for each stay it covers (invoice_bookings), its stay lines (stay_charges()), each extra not in its package, and each appointment that is confirmed, done or a no-show (not a course or package session) with its add-ons; or a visitor's appointment (p_appointment) and its add-ons. A month of a series has one stay line for each price, tax rate and code, with its days added up (seriesLines() in src/lib/billing.ts). Must match stayBillLines() in src/lib/stay-bill.ts.

### invoice_lines_guard

```
invoice_lines_guard() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Trigger: invoice lines can only change while the invoice is a draft.

### invoices_check_food

```
invoices_check_food() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a food bill names an order of its parent, never a subscription's delivery (WB154), or a subscription of its parent for days no other live bill of it covers (WB155).

### invoices_check_stay

```
invoices_check_stay() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a pet booked with others is billed only on the family's bill (WB053), and a family's bill names a family booking of that parent (WB054). A day of a repeating series is billed only on its month's bill (WB055), which names a series of that parent (WB056). A bill of its own is only for a visitor's appointment of that parent (WB200).

### invoices_guard

```
invoices_guard() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: makes issued and void invoices immutable, and forces issuing and voiding through issue_invoice() and void_invoice().

### invoices_guard_insert

```
invoices_guard_insert() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: every invoice starts as a draft.

### issue_credit_note

```
issue_credit_note(p_invoice uuid, p_reason text, p_totals jsonb, p_lines jsonb) returns credit_notes
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Makes a credit note against an issued bill: checks every line as issue_invoice does, under the bill's own tax treatment and at a rate the bill charged (WB093), and that the bill is not credited beyond its total (WB092); gives the next CN/YY-YY/NNNN number for the year. Owner or manager. A reason is required (WB091).

### issue_invoice

```
issue_invoice(p_invoice uuid) returns invoices
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Issues a draft invoice: checks every line and total against the tax rules, assigns the next consecutive number for the financial year, and freezes the seller's and buyer's details (including where to pay). Owners and managers may issue any draft; staff only one whose lines are exactly what its booking (or its family's bookings, its month of a series, or its food deliveries) says. Takes in advances paid for those stays.

### make_recovery_codes

```
make_recovery_codes() returns SETOF text
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Makes ten one-use recovery codes for the signed-in person's authenticator, replacing earlier ones, and returns them (the only time they are seen). Needs a session that gave its code (WB005) and two-step sign-in on (WB006).

### merge_clients

```
merge_clients(p_keep uuid, p_merge uuid) returns uuid
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Merges a duplicate parent into another of the same kennel: moves pets (and their bookings, food subscriptions and deliveries), bills, payments, forms, food orders and addresses, fills in missing details, and hides the duplicate. Owner or manager. Issued bills keep the buyer details printed on them.

### my_invitations

```
my_invitations() returns TABLE(org_id uuid, org_name text, role member_role, invited_at timestamp with time zone)
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

Invitations waiting for the signed-in user: which organisation, and in what role. Needed because a person cannot read an organisation they have not joined yet.

### my_org_ids

```
my_org_ids() returns SETOF uuid
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

Organisations the signed-in user is an active member of, other than as a rider. The basis of tenant isolation. Empty for a session that still owes its two-step code. A rider reaches only their own run, through the rider functions (D45).

### my_org_ids_with_role

```
my_org_ids_with_role(p_roles member_role[]) returns SETOF uuid
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

Organisations where the signed-in user holds one of the given roles.

### my_rider_org_ids

```
my_rider_org_ids() returns SETOF uuid
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

Organisations where the signed-in user is an active rider (D45).

### my_runs

```
my_runs(p_date date) returns jsonb
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

The signed-in rider's runs for a day (today in their kennel when empty): each stop's name, phone, pet's name, packs, address and notes, in order. Nothing else: no prices, no medical notes, no other runs. SECURITY DEFINER because riders read no table (D45).

### new_token

```
new_token() returns text
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: volatile

A 64 character random token (244 random bits) for unguessable public links such as stay pages and invoices.

### occupancy_by_day

```
occupancy_by_day(p_org uuid, p_from date, p_to date) returns TABLE(day date, occupied integer, capacity integer, pets integer)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

For each day in a range (at most 400 days): kennels in use, total kennels, and pets in house (two sharing a kennel are two pets in one kennel). Powers the occupancy calendar.

### org_today

```
org_today(p_org uuid) returns date
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

Today's date in the kennel's time zone.

### organizations_lock_billing_settings

```
organizations_lock_billing_settings() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: refuses a change of currency or financial year start once the kennel has issued a bill (issued or cancelled), so stored amounts keep one currency and bill numbers keep running in order through the year.

### paths_in_org

```
paths_in_org(p_paths text[], p_org uuid) returns boolean
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: immutable

True when every path that is set is inside the given organisation's folder. Empty paths are allowed.

### payments_check_refund

```
payments_check_refund() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a refund names a bill or a stay (WB120) and gives back no more than was paid over what the bill now comes to after credit notes (WB121), or than the advance paid for a stay with no bill (WB122).

### pet_food_guard_grams

```
pet_food_guard_grams() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: only owners and managers set or change a portion by hand (WB146).

### pet_weights_refresh_pet

```
pet_weights_refresh_pet() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: after a weighing is added, corrected or removed, the pet's latest weight is worked out again.

### pets_latest_weight

```
pets_latest_weight() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: pets.weight_g is always the latest of the pet's weighings, whatever was written to it.

### plan_subscription

```
plan_subscription(p_subscription uuid, p_until date) returns integer
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: volatile

Makes a subscription's deliveries from today (or its start) up to p_until (at most 62 days ahead): one on each of its weekdays that is not paused, cancelled or already made, covering the days until the next, in whole packs, with the rotation's next recipe. Returns how many it made. Must match coversDays() and packedGrams() in src/lib/core/food.ts.

### play_sessions_fill_client

```
play_sessions_fill_client() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: copies the parent of a play session's booking onto the session, whatever was sent.

### protect_last_owner

```
protect_last_owner() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Trigger: stops the last active owner from being removed, demoted or deactivated.

### recipe_cost_per_kg

```
recipe_cost_per_kg(p_org uuid, p_version uuid, p_on date) returns bigint
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

What a kilo of a recipe version costs to make, in minor units, from each ingredient's latest purchase price on or before p_on (any day when empty). Null when an ingredient has no price yet. Owners and managers only (WB145).

### recipe_ingredients_check

```
recipe_ingredients_check() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: ingredients go into a version only as it is made (WB141), and never an item marked never_in_recipe (WB140).

### recipes_guard_delete

```
recipes_guard_delete() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a recipe that has been cooked is retired, never deleted (WB144).

### record_batch

```
record_batch(p_org uuid, p_version uuid, p_grams integer, p_packs integer, p_cooked_on date, p_cook uuid, p_boarders_on date, p_note text) returns uuid
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: volatile

Records a batch cooked from a recipe version and takes each ingredient out of stock: its quantity per kilo times the batch's kilos. Refused as a whole when any ingredient is short (WB130).

### record_purchase

```
record_purchase(p_org uuid, p_item uuid, p_quantity bigint, p_cost_minor bigint, p_on date, p_supplier uuid, p_use_by date, p_bill_number text, p_bill_path text, p_expense_category text) returns uuid
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: volatile

Records stock bought in with its cost, bill number and bill photo, and, when an expense category is given, the same money as an expense (E4), all in one step. Owners and managers only (WB131).

### recovery_codes_left

```
recovery_codes_left() returns integer
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

How many unused recovery codes the signed-in person has for their current authenticator. SECURITY DEFINER because recovery_codes is sealed.

### renew_request_link

```
renew_request_link(p_client uuid) returns text
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Gives a parent a new booking link and returns its token; the old link stops working. Any member of the parent's kennel.

### report_extras

```
report_extras(p_org uuid, p_from date, p_to date) returns TABLE(name text, stays integer, quantity numeric, amount_minor bigint)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

The extras sold on stays that start in the period, biggest first (at most 20): how many stays had each, how many in all, and their value at the price charged, before discount and tax. Extras from the price list are grouped by its current name; one-off items by their description. Owners and managers only.

### report_food

```
report_food(p_org uuid, p_from date, p_to date) returns TABLE(month date, active_subscriptions integer, subscriptions_started integer, subscriptions_ended integer, trials integer, trials_subscribed integer, deliveries integer, kilos_delivered numeric, food_value_minor bigint, kilos_cooked numeric, cooking_cost_minor bigint, wasted_g bigint, wasted_cost_minor bigint)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

For each month of the period: subscriptions active at its end, started and ended in it; trials handed over and how many of those parents then subscribed; deliveries handed over, their kilos and value (food and delivery); kilos cooked and what the batches cost (from their own versions and that day's prices); grams of stock thrown away and what it cost. Owners and managers only.

### report_food_riders

```
report_food_riders(p_org uuid, p_from date, p_to date) returns TABLE(day date, rider_id uuid, rider_name text, delivered integer, not_home integer, refused integer)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

Deliveries per rider per day in the period: handed over, nobody home, refused. Owners and managers only.

### report_food_sources

```
report_food_sources(p_org uuid, p_from date, p_to date) returns TABLE(source customer_source, started integer, still_active integer)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

Where the food customers who started in the period came from (a boarding parent, a referral, the website, elsewhere), and how many are still subscribed. Owners and managers only.

### report_money

```
report_money(p_org uuid, p_from date, p_to date) returns TABLE(month date, billed_minor bigint, credited_minor bigint, tax_minor bigint, bills integer, received_minor bigint, refunded_minor bigint, spent_minor bigint)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

For each month in the period: what was billed (issued bills by bill date; cancelled bills left out), what credit notes took back (by credit note date), the tax in the month net of credit notes, payments received and refunded (by the date the money moved), and expenses (by the date spent). Only days inside the period count, so a period that starts mid-month gives a part month. Owners and managers only.

### report_occupancy

```
report_occupancy(p_org uuid, p_from date, p_to date) returns TABLE(day date, boarding integer, day_boarding integer, capacity integer, kennels_used integer)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

For each day: pets staying the night (boarding), pets in for the day (day boarding), kennels in service today, and kennels used (two pets sharing a kennel use one). Counts stays that happened or are booked; not requests, cancellations or no-shows. A boarding stay counts on its nights, so not on its check-out day. Owners and managers only.

### report_tax

```
report_tax(p_org uuid, p_from date, p_to date) returns TABLE(tax_rate_bp integer, bills integer, credit_notes integer, taxable_minor bigint, cgst_minor bigint, sgst_minor bigint, igst_minor bigint, tax_minor bigint)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

Tax in the period, by rate: the value taxed and the tax (CGST, SGST and IGST under India GST) on issued bills by bill date, less credit notes by credit note date. Cancelled bills are left out (only a bill of the same month can be cancelled once taxed, WB095). Owners and managers only.

### respond_to_invitation

```
respond_to_invitation(p_org uuid, p_accept boolean) returns void
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Accepts or declines a pending invitation for the signed-in user. The only way a membership becomes active, apart from creating an organisation.

### rider_mark_stop

```
rider_mark_stop(p_delivery uuid, p_status delivery_status, p_proof_path text) returns void
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

A rider marks a stop of their own run for today: on the way (out), delivered (with a photo), nobody home or refused (WB172, WB173). SECURITY DEFINER because riders read no table; it checks the caller is the run's rider.

### rider_upload_allowed

```
rider_upload_allowed(p_object_name text) returns boolean
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

True when a stored file's path is a photo of a stop on the signed-in rider's own run for today. SECURITY DEFINER because riders read no table (D45).

### rotation_recipe

```
rotation_recipe(p_org uuid, p_index integer) returns uuid
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

The recipe at the n-th place of the rotation (0 the first), counting round again after the last. Recipes with no version yet are left out.

### safe_date

```
safe_date(p_text text) returns date
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: immutable

Reads a YYYY-MM-DD string as a date, or returns null if it is anything else. For text that arrived from the public internet.

### save_invoice_draft

```
save_invoice_draft(p_invoice uuid, p_totals jsonb, p_lines jsonb) returns void
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: volatile

Replaces a draft invoice's lines and totals in one go, so a draft is never left half written. The numbers come from src/lib/core/tax.ts; issue_invoice() checks them.

### save_recipe_version

```
save_recipe_version(p_recipe uuid, p_details jsonb, p_ingredients jsonb) returns uuid
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: volatile

Makes the next version of a recipe with its ingredients ([{item_id, quantity_per_kg}]) and its details, in one step. Owners and managers only (WB142); at least one ingredient (WB143).

### session_meets_mfa

```
session_meets_mfa() returns boolean
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

True unless the signed-in user has a two-step sign-in factor and this session has not used it yet (assurance level aal1), nor a recovery code for that factor. SECURITY DEFINER because only it may read auth.mfa_factors and recovery_codes.

### set_my_language

```
set_my_language(p_language text) returns void
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Sets the signed-in person's language (en, hi or kn) in every kennel they belong to. Changes nothing else.

### set_updated_at

```
set_updated_at() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: stamps updated_at on every update.

### stamp_actor

```
stamp_actor() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: sets a "who did this" column (named in the trigger argument) to the signed-in user on insert and keeps it unchanged afterwards, so nobody can attribute their action to someone else.

### stamp_done

```
stamp_done() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: records who and when as a task or play session is marked done, and clears it on undo. Client-supplied values for these columns are ignored.

### stamp_when_set

```
stamp_when_set() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger for a pair of "when" and "who" columns (named in the two trigger arguments) that record a one-off confirmation, such as a certificate being checked. Sending any time marks it; the database then records the real time and the signed-in user, and later edits cannot change them. Sending null clears both.

### stay_charges

```
stay_charges(p_org uuid, p_bookings uuid[]) returns TABLE(booking_id uuid, part text, quantity integer, unit_price_minor bigint, discount_minor bigint)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

What each stay costs, as bill lines: part (stay; or days, then the nights after a switch from day boarding; shared and alone for a pet at the shared kennel price; package, the whole stay as its package), quantity, price and discount. The one place a stay is priced: invoice_expected_lines() checks staff bills against it and the app builds bills from it (stayLines() in src/lib/core/stay.ts).

### stay_media_visible

```
stay_media_visible(p_name text) returns boolean
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

PUBLIC, through Storage only. True when the request carries a live stay's token (x-wagbook-stay header) and the file is that stay's pet photo or a photo on one of its updates shown to the parent (or the small copy of one). SECURITY DEFINER because the anonymous role can read no table.

### stay_range

```
stay_range(p_kind booking_kind, p_start date, p_end date) returns daterange
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: immutable

The days a stay holds a kennel: check-in up to but not including check-out for boarding; first to last day inclusive for day boarding.

### stay_updates_guard_media

```
stay_updates_guard_media() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: only an owner takes a photo off an update (WB081). Adding photos is for any member.

### stock_items_check_never

```
stock_items_check_never() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: an item is marked never_in_recipe only once no recipe in use has it in its newest version (WB140).

### stock_moves_apply

```
stock_moves_apply() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: movements of one item queue; one that would take stock below nothing is refused (WB130); a stock take records the difference between what was counted and what the movements add up to.

### storage_org_id

```
storage_org_id(p_object_name text) returns uuid
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: immutable

The organisation a stored file belongs to, read from the first folder of its path. Null when the path does not start with an organisation id.

### submit_booking_request

```
submit_booking_request(p_token text, p_payload jsonb) returns integer
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

PUBLIC. A parent asks for a stay through their booking link: each chosen pet becomes a booking requested at the kennel's usual price, holding no kennel until staff confirm it. Refused when requests are off or the link is unknown (WB100), for a malformed request (WB101), pets not theirs (WB102), dates in the past, more than a year ahead or over 90 days long (WB103), a kind of stay with no usual price (WB104), and more than 12 requested pets in a day (WB105).

### submit_food_order

```
submit_food_order(p_slug text, p_payload jsonb) returns jsonb
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

PUBLIC. An order from the kennel's food order page: a trial, or a subscription with its days and grams a day. Works out what to pay now (the trial, or the first week ahead, with delivery) and returns it with a token for saying it was paid; a PIN code not served is kept as waiting for the area, with nothing to pay. Refused when the kennel takes no orders (WB180), for a malformed order (WB181), missing details or consent (WB182), no weight (WB183), a flood (WB184) or no days or grams (WB185).

### submit_food_request

```
submit_food_request(p_token text, p_payload jsonb) returns void
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

PUBLIC. A known parent asks, through their own link, to pause a subscription (from a day, until a day or until they say), skip a delivery, or have more food on a day. Kept for staff to confirm. Refused when the link takes no requests (WB100), for a malformed request (WB181), a subscription not theirs (WB186), dates in the past or too far ahead (WB187), and more than ten in a day (WB105).

### submit_intake

```
submit_intake(p_slug text, p_payload jsonb) returns jsonb
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

PUBLIC. Receives the intake form. Validates shape and size, records consent, and stores the submission for staff to review. Never creates clients or bookings by itself. Returns {folder, upload_token}: the folder ({org_id}/intake/{submission_id}) for certificates, and the secret that lets this sender put one per pet there within the hour (intake_upload_allowed).

### subscriptions_replan

```
subscriptions_replan() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Trigger: when a subscription's grams, days, slot, address, food, plan, pause or end change, its deliveries still before their cut-off are made again: cancelled (when a bill has them, so the bill can be credited) or removed, and made anew up to as far ahead as before.

### use_recovery_code

```
use_recovery_code(p_code text) returns integer
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Spends one of the signed-in person's recovery codes on this session, which then counts as having given its code (session_meets_mfa). Returns the codes left. A wrong or used code raises WB007.

### validate_organization

```
validate_organization() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: rejects an unknown time zone, which would otherwise break every date calculation.

### void_invoice

```
void_invoice(p_invoice uuid, p_reason text) returns invoices
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Voids an issued invoice with a reason. Owner or manager only. The number stays used; issue a fresh invoice to replace it. A tax invoice from an earlier month is not voided but credited (WB095), and a bill with a credit note is credited the rest of the way (WB096).

### waiting_list

```
waiting_list(p_org uuid) returns TABLE(booking_id uuid, waitlisted_at timestamp with time zone, has_space boolean)
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

The kennel's waiting list, first in line first: each request waiting for a kennel, when it joined, and whether it would fit now (a kennel free on every day, and no other stay for the pet). Stays already over are left out. Must agree with bookings_check_capacity().
