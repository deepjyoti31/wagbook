# Schema reference

> GENERATED FILE. Do not edit by hand. Run `npm run gen:db` after changing anything in `supabase/migrations`.
> The descriptions come from `comment on` statements in the migrations, so fix wording there.

This is the exact shape of the database after every migration has run. For the reasoning behind it, read
[04-data-model.md](../04-data-model.md) and [05-security-and-privacy.md](../05-security-and-privacy.md).

Migrations applied: 11. Tables: 29. Views: 2. Functions: 76.

## Contents

- [Enumerated types](#enumerated-types)
- Tables: [audit_log](#audit_log), [booking_items](#booking_items), [bookings](#bookings), [care_items](#care_items), [care_tasks](#care_tasks), [clients](#clients), [credit_note_lines](#credit_note_lines), [credit_notes](#credit_notes), [day_packs](#day_packs), [expenses](#expenses), [incidents](#incidents), [intake_submissions](#intake_submissions), [invitation_links](#invitation_links), [invoice_counters](#invoice_counters), [invoice_lines](#invoice_lines), [invoices](#invoices), [kennels](#kennels), [memberships](#memberships), [organizations](#organizations), [passes](#passes), [payments](#payments), [peak_periods](#peak_periods), [pets](#pets), [play_sessions](#play_sessions), [play_yards](#play_yards), [reminders_sent](#reminders_sent), [services](#services), [stay_updates](#stay_updates), [vaccinations](#vaccinations)
- Views: [invoice_balances](#invoice_balances), [pass_balances](#pass_balances)
- [Functions](#functions)

## Enumerated types

| Type | Values | Meaning |
| --- | --- | --- |
| `booking_kind` | `boarding`, `daycare` | boarding: overnight, charged per night. daycare: day boarding with no night, charged per day. |
| `booking_status` | `requested`, `confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show` | requested: asked for, not yet accepted, holds no space. confirmed: space is held. checked_in: the pet is in house. checked_out: gone home. cancelled and no_show: space released. |
| `care_kind` | `meal`, `medication`, `walk`, `play`, `cleaning`, `other` | What sort of care a routine or task is. Used to group and count tasks. |
| `incident_severity` | `low`, `medium`, `high` | low: worth noting. medium: the parent should be told today. high: the parent and a vet should be told now. |
| `intake_status` | `new`, `accepted`, `rejected`, `spam` | new: waiting for staff. accepted: turned into a client and pets. rejected: declined by staff. spam: junk, kept only to spot patterns. |
| `invoice_status` | `draft`, `issued`, `void` | draft: being prepared, editable, has no number. issued: numbered and frozen. void: cancelled after issue; the number stays used. |
| `member_role` | `owner`, `manager`, `staff` | owner: everything, including people and deleting the organisation. manager: everything except owners. staff: daily operations. |
| `payment_method` | `upi`, `cash`, `card`, `bank_transfer`, `other` | How money moved. Wagbook records this; it does not process payments. |
| `pet_sex` | `male`, `female`, `unknown` | unknown is the honest default when nobody has said. |
| `service_kind` | `boarding`, `daycare`, `addon` | boarding: an overnight stay, priced per night. daycare: day boarding, priced per day. addon: an extra such as grooming. |
| `task_status` | `pending`, `done`, `skipped` | pending: still to do. done: completed (who and when are stamped). skipped: deliberately not done, with a note saying why. |
| `tax_mode` | `none`, `simple`, `gst_india` | none: no tax charged. simple: one tax at one rate (VAT, sales tax). gst_india: CGST+SGST within a state, IGST across states. |

## Tables

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
- Check `bookings_pass_covers_the_price`: `CHECK (((pass_id IS NULL) OR ((kind = 'daycare'::booking_kind) AND (rate_minor = 0) AND (discount_minor = 0) AND (alone_rate_minor IS NULL) AND (boarding_from IS NULL))))`
- Check `bookings_rate_minor_check`: `CHECK ((rate_minor >= 0))`
- Check `bookings_sac_code_check`: `CHECK (((sac_code IS NULL) OR (sac_code ~ '^[0-9]{4,8}$'::text)))`
- Check `bookings_series_is_day_boarding`: `CHECK (((series_id IS NULL) OR (kind = 'daycare'::booking_kind)))`
- Check `bookings_source_check`: `CHECK ((source = ANY (ARRAY['staff'::text, 'intake'::text, 'parent'::text])))`
- Check `bookings_tax_rate_bp_check`: `CHECK (((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000)))`

**Indexes**

- `CREATE INDEX bookings_org_client_idx ON public.bookings USING btree (org_id, client_id)`
- `CREATE INDEX bookings_org_dates_idx ON public.bookings USING btree (org_id, start_date, end_date)`
- `CREATE INDEX bookings_org_pass_idx ON public.bookings USING btree (org_id, pass_id) WHERE (pass_id IS NOT NULL)`
- `CREATE INDEX bookings_org_pet_idx ON public.bookings USING btree (org_id, pet_id)`
- `CREATE INDEX bookings_org_series_idx ON public.bookings USING btree (org_id, series_id) WHERE (series_id IS NOT NULL)`
- `CREATE INDEX bookings_org_status_idx ON public.bookings USING btree (org_id, status)`

**Triggers**

- `bookings_audit` (after insert or delete or update) runs `audit_row()`
- `bookings_check_capacity` (after insert or update of status, start_date, end_date, kind, kennel_id) runs `bookings_check_capacity()`
- `bookings_check_group` (before insert or update of group_id, client_id) runs `bookings_check_group()`
- `bookings_check_pass` (before insert or update of pass_id, status, start_date, end_date, kind, client_id) runs `bookings_check_pass()`
- `bookings_check_shared_price` (after insert) runs `bookings_check_shared_price()`
- `bookings_forbid_org_change` (before update) runs `forbid_org_change()`
- `bookings_guard_price` (before insert or update) runs `bookings_guard_price()`
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
| `consent_source` | `text` |  |  | intake_form: the parent ticked the box themselves. staff: a staff member recorded verbal consent. |
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
- Check `clients_consent_source_check`: `CHECK (((consent_source IS NULL) OR (consent_source = ANY (ARRAY['intake_form'::text, 'staff'::text]))))`
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
| `payload` | `jsonb` | yes |  | The whole form as JSON (version 1): {v, parent:{name,phone,email,address,city,emergency_name,emergency_phone}, pets:[{name,species,breed,sex,is_neutered,date_of_birth,weight_kg,food_notes,medical_notes,allergies,behaviour_notes,vet_name,vet_phone,vaccinations:[{vaccine,given_on,valid_until}]}], stay:{kind,start_date,end_date,notes}, consent}. |
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
- Foreign key `invoices_issued_by_fkey`: `FOREIGN KEY (issued_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Foreign key `invoices_org_id_booking_id_fkey`: `FOREIGN KEY (org_id, booking_id) REFERENCES bookings(org_id, id) ON DELETE SET NULL (booking_id)`
- Foreign key `invoices_org_id_client_id_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES clients(org_id, id) ON DELETE RESTRICT`
- Foreign key `invoices_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
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
- Check `invoices_one_stay_or_one_family`: `CHECK (((booking_id IS NULL) OR (group_id IS NULL)))`
- Check `invoices_place_of_supply_state_code_check`: `CHECK (((place_of_supply_state_code IS NULL) OR (place_of_supply_state_code ~ '^[0-9]{2}$'::text)))`
- Check `invoices_round_off_minor_check`: `CHECK (((round_off_minor >= '-99'::integer) AND (round_off_minor <= 99)))`
- Check `invoices_sgst_minor_check`: `CHECK ((sgst_minor >= 0))`
- Check `invoices_subtotal_minor_check`: `CHECK ((subtotal_minor >= 0))`
- Check `invoices_tax_minor_check`: `CHECK ((tax_minor >= 0))`
- Check `invoices_taxable_minor_check`: `CHECK ((taxable_minor >= 0))`
- Check `invoices_total_minor_check`: `CHECK ((total_minor >= 0))`
- Check `invoices_void_fields_only_when_void`: `CHECK ((((status = 'void'::invoice_status) = (voided_at IS NOT NULL)) AND ((status = 'void'::invoice_status) OR ((voided_by IS NULL) AND (void_reason IS NULL)))))`

**Indexes**

- `CREATE UNIQUE INDEX invoices_one_live_per_booking ON public.invoices USING btree (org_id, booking_id) WHERE ((booking_id IS NOT NULL) AND (status <> 'void'::invoice_status))`
- `CREATE UNIQUE INDEX invoices_one_live_per_family ON public.invoices USING btree (org_id, group_id) WHERE ((group_id IS NOT NULL) AND (status <> 'void'::invoice_status))`
- `CREATE INDEX invoices_org_booking_idx ON public.invoices USING btree (org_id, booking_id)`
- `CREATE INDEX invoices_org_client_idx ON public.invoices USING btree (org_id, client_id)`
- `CREATE INDEX invoices_org_issued_idx ON public.invoices USING btree (org_id, issued_on DESC)`

**Triggers**

- `invoices_audit` (after insert or delete or update) runs `audit_row()`
- `invoices_check_stay` (before insert or update of booking_id, group_id, client_id) runs `invoices_check_stay()`
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
| `created_at` | `timestamp with time zone` | yes | `now()` |  |
| `updated_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `organizations_pkey`: `PRIMARY KEY (id)`
- Unique `organizations_slug_key`: `UNIQUE (slug)`
- Check `organizations_country_code_check`: `CHECK ((country_code ~ '^[A-Z]{2}$'::text))`
- Check `organizations_currency_check`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`
- Check `organizations_default_tax_rate_bp_check`: `CHECK (((default_tax_rate_bp >= 0) AND (default_tax_rate_bp <= 10000)))`
- Check `organizations_fiscal_year_start_month_check`: `CHECK (((fiscal_year_start_month >= 1) AND (fiscal_year_start_month <= 12)))`
- Check `organizations_gst_needs_registration`: `CHECK (((tax_mode <> 'gst_india'::tax_mode) OR ((tax_id IS NOT NULL) AND (gst_state_code IS NOT NULL))))`
- Check `organizations_gst_state_code_check`: `CHECK (((gst_state_code IS NULL) OR (gst_state_code ~ '^[0-9]{2}$'::text)))`
- Check `organizations_invoice_prefix_check`: `CHECK (((invoice_prefix ~ '^[A-Z0-9]{1,4}$'::text) AND (invoice_prefix <> 'CN'::text)))`
- Check `organizations_name_check`: `CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80)))`
- Check `organizations_parent_language_check`: `CHECK ((parent_language = ANY (ARRAY['en'::text, 'hi'::text, 'kn'::text])))`
- Check `organizations_phone_check`: `CHECK (((phone IS NULL) OR (phone ~ '^\+[1-9][0-9]{7,14}$'::text)))`
- Check `organizations_play_break_inside_day`: `CHECK ((((play_break_start IS NULL) AND (play_break_end IS NULL)) OR ((play_break_start IS NOT NULL) AND (play_break_end IS NOT NULL) AND (play_break_start > play_day_start) AND (play_break_end < play_day_end) AND (play_break_end > play_break_start))))`
- Check `organizations_play_changeover_minutes_check`: `CHECK (((play_changeover_minutes >= 0) AND (play_changeover_minutes <= 60)))`
- Check `organizations_play_hours_in_order`: `CHECK ((play_day_end > play_day_start))`
- Check `organizations_play_session_minutes_check`: `CHECK (((play_session_minutes >= 5) AND (play_session_minutes <= 240)))`
- Check `organizations_play_sessions_per_day_check`: `CHECK (((play_sessions_per_day >= 0) AND (play_sessions_per_day <= 12)))`
- Check `organizations_slug_check`: `CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'::text))`
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
| `weight_kg` | `numeric(5,2)` |  |  |  |
| `color` | `text` |  |  |  |
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
- Check `pets_weight_kg_check`: `CHECK (((weight_kg IS NULL) OR ((weight_kg > (0)::numeric) AND (weight_kg < (200)::numeric))))`

**Indexes**

- `CREATE INDEX pets_org_client_idx ON public.pets USING btree (org_id, client_id)`
- `CREATE INDEX pets_org_name_idx ON public.pets USING btree (org_id, lower(name))`

**Triggers**

- `pets_forbid_org_change` (before update) runs `forbid_org_change()`
- `pets_guard_hiding` (before update of deleted_at) runs `guard_hiding()`
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

### reminders_sent

A reminder a person sent a parent from Today, on WhatsApp from their own phone: so it leaves the list. Wagbook sends nothing itself.

| Column | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | yes | `gen_random_uuid()` |  |
| `org_id` | `uuid` | yes |  |  |
| `kind` | `text` | yes |  | vaccination: card needed before a stay. arrival: see you tomorrow. pickup: going home tomorrow. unpaid: a bill still owed. |
| `subject_id` | `uuid` | yes |  | The booking (vaccination, arrival, pickup) or the bill (unpaid) it was about. |
| `sent_on` | `date` | yes |  | The kennel's date it was sent. An unpaid bill comes back three days later. |
| `sent_by` | `uuid` |  | `auth.uid()` |  |
| `created_at` | `timestamp with time zone` | yes | `now()` |  |

**Constraints**

- Primary key `reminders_sent_pkey`: `PRIMARY KEY (id)`
- Foreign key `reminders_sent_org_id_fkey`: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Foreign key `reminders_sent_sent_by_fkey`: `FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- Check `reminders_sent_kind_check`: `CHECK ((kind = ANY (ARRAY['vaccination'::text, 'arrival'::text, 'pickup'::text, 'unpaid'::text])))`

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
- `stay_updates_set_updated_at` (before update) runs `set_updated_at()`
- `stay_updates_stamp_actor` (before insert or update) runs `stamp_actor()`

**Access**

- Signed-in users may: select, insert, update, delete (then narrowed by the policies below). Anonymous visitors: nothing.
- `stay_updates_delete` (delete): rows where `(org_id IN ( SELECT my_org_ids_with_role(ARRAY['owner'::member_role]) AS my_org_ids_with_role))`
- `stay_updates_insert` (insert): new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `stay_updates_select` (select): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`
- `stay_updates_update` (update): rows where `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`; new values must satisfy `(org_id IN ( SELECT my_org_ids() AS my_org_ids))`

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

## Functions

Who may call: **public** means anyone, signed in or not. **signed-in** means any authenticated user (the function itself then checks membership and role). **internal** means no API role can call it; it runs only from triggers or other functions.

### accept_intake

```
accept_intake(p_submission uuid) returns uuid
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: volatile

Staff action: turns a new intake submission into a client and pets. A parent already known by phone number is reused and left unchanged; only pets with new names are added, each with the vaccinations the parent listed and the certificate they sent for it, if any. Returns the client id. Creating the booking is a separate step.

### accept_invitation_link

```
accept_invitation_link(p_token text) returns uuid
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Joins the signed-in person to the organisation of an invitation link, in its role. Works once; refuses an expired or withdrawn link and someone who is already a member.

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

### bookings_guard_price

```
bookings_guard_price() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: only owners and managers set or change what a stay costs. Staff can book only at a price on the price list (the usual price, or the shared kennel price for a pet sharing a kennel, with the usual price for nights alone), with no discount, and cannot change the price, discount, tax or kind of an existing booking, or when it turns from day boarding into boarding.

### bookings_stamp_status

```
bookings_stamp_status() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: records who and when as a booking is created, checked in, checked out or cancelled. Client-supplied values for these columns are ignored.

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

Paths in the pet-media bucket that hold this parent's pets' photos and certificates, photos from their stays, and files sent with their intake forms (with the small copy of every photo). Runs as the caller, so it lists only what they may read.

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

### erase_client

```
erase_client(p_client uuid) returns text[]
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Erases a parent on their request: empties every personal detail on the parent and the notes on their stays, deletes the updates sent to them, their intake forms, draft bills and vaccination certificates (a card shows the owner), and takes that text out of the history of changes. Keeps the pets with their health, routines, incidents, care and play (hidden), issued and cancelled bills (with the buyer details printed on them), payments, and the stays' dates and prices. Refused while a pet is in house (WB071) or a stay is still to come (WB072). Returns the storage paths of the files to remove. Owner only (WB070, WB074).

### export_client

```
export_client(p_client uuid) returns jsonb
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: stable

Everything held about one parent, for a request under the DPDP Act: their details and consent, their pets with vaccinations, routines and incidents, every stay with its extras, updates, care and play, bills with their lines and credit notes, payments, the intake forms they sent, and the paths of the files. Owner or manager (WB070).

### fiscal_year_label

```
fiscal_year_label(p_date date, p_start_month integer) returns text
```

- Who may call: signed-in
- Runs as: the caller (row level security applies)
- Volatility: immutable

Financial year label for a date, e.g. 2027-04-14 -> 2027-28 when the year starts in April. Must match fiscalYear() in src/lib/core/dates.ts.

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

PUBLIC. The parent's own booking link: the kennel's name, WhatsApp number and usual times, the parent's first name, their pets' names, which kinds of stay can be asked for, and their stays already asked for or booked (dates and status only). Nothing for a hidden or erased parent.

### get_public_intake_form

```
get_public_intake_form(p_slug text) returns jsonb
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

PUBLIC. What the intake form page needs to show for a kennel: its name, city, WhatsApp number, usual times and consent wording.

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
invoice_bookings(p_org uuid, p_booking uuid, p_group uuid) returns SETOF uuid
```

- Who may call: internal
- Runs as: the caller (row level security applies)
- Volatility: stable

The bookings a bill covers: its own booking, or the family's bookings that are not requests or cancelled. Must match BILLABLE_IN_FAMILY in src/lib/billing.ts.

### invoice_expected_lines

```
invoice_expected_lines(p_org uuid, p_booking uuid, p_group uuid, p_tax_mode tax_mode) returns TABLE(quantity numeric, unit_price_minor bigint, discount_minor bigint, tax_rate_bp integer)
```

- Who may call: internal
- Runs as: the caller (row level security applies)
- Volatility: stable

The lines a bill should have, as quantity, unit price, discount and tax rate: for each stay it covers (invoice_bookings), its stay lines (stay_charges()) and each extra.

### invoice_lines_guard

```
invoice_lines_guard() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Trigger: invoice lines can only change while the invoice is a draft.

### invoices_check_stay

```
invoices_check_stay() returns trigger
```

- Who may call: internal (trigger)
- Runs as: the caller (row level security applies)
- Volatility: volatile

Trigger: a pet booked with others is billed only on the family's bill (WB053), and a family's bill names a family booking of that parent (WB054).

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

Issues a draft invoice: checks every line and total against the tax rules, assigns the next consecutive number for the financial year, and freezes the seller's and buyer's details (including where to pay). Owners and managers may issue any draft; staff only one whose lines are exactly what its booking (or its family's bookings) says. Takes in advances paid for those stays.

### merge_clients

```
merge_clients(p_keep uuid, p_merge uuid) returns uuid
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

Merges a duplicate parent into another of the same kennel: moves pets (and their bookings), bills, payments and forms, fills in missing details, and hides the duplicate. Owner or manager. Issued bills keep the buyer details printed on them.

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

Organisations the signed-in user is an active member of. The basis of tenant isolation. Empty for a session that still owes its two-step code.

### my_org_ids_with_role

```
my_org_ids_with_role(p_roles member_role[]) returns SETOF uuid
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

Organisations where the signed-in user holds one of the given roles.

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

- Who may call: internal
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

### session_meets_mfa

```
session_meets_mfa() returns boolean
```

- Who may call: signed-in
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: stable

True unless the signed-in user has a two-step sign-in factor and this session has not used it yet (assurance level aal1). SECURITY DEFINER because only it may read auth.mfa_factors.

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

What each stay costs, as bill lines: part (stay; or days, then the nights after a switch from day boarding; shared and alone for a pet at the shared kennel price), quantity, price and discount. The one place a stay is priced: invoice_expected_lines() checks staff bills against it and the app builds bills from it (stayLines() in src/lib/core/stay.ts).

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

### submit_intake

```
submit_intake(p_slug text, p_payload jsonb) returns jsonb
```

- Who may call: public
- Runs as: the database owner (SECURITY DEFINER), so it performs its own permission checks
- Volatility: volatile

PUBLIC. Receives the intake form. Validates shape and size, records consent, and stores the submission for staff to review. Never creates clients or bookings by itself. Returns {folder, upload_token}: the folder ({org_id}/intake/{submission_id}) for certificates, and the secret that lets this sender put one per pet there within the hour (intake_upload_allowed).

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
