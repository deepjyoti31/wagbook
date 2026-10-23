# 4. Data model

This page explains the tables and the reasoning behind them. The exact columns, constraints, triggers and policies are
in the generated [reference/schema.md](reference/schema.md); that file is always right, so this page does not repeat it.

## The picture

```
organizations ──< memberships >── auth.users
      │
      ├──< clients ──< pets ──< vaccinations
      │        │        │
      │        │        └──< bookings >── kennels
      │        │                │
      │        │                ├──< booking_items >── services
      │        │                ├──< care_tasks >── care_items
      │        │                ├──< play_sessions >── play_yards
      │        │                └──< stay_updates
      │        │
      │        ├──< invoices ──< invoice_lines
      │        └──< payments
      │
      ├──< peak_periods      ├──< expenses        ├──< incidents
      ├──< intake_submissions ├──< invoice_counters └──< audit_log
```

`──<` reads "has many". Every table below `organizations` carries `org_id`.

## Tenancy: organisations and memberships

An **organisation** is one kennel business. A self-hosted Wagbook usually has one; a shared installation has many, and
they can never see each other.

A **membership** joins a signed-in user to an organisation with a role (`owner`, `manager`, `staff`), a display name,
and two flags that matter:

- `accepted_at`: empty until the person accepts the invitation.
- `is_active`: false until accepted, and can be switched off to suspend someone without deleting them.

A check constraint says a membership cannot be active unless it was accepted. So nobody can be put into a kennel
without agreeing, which matters because being a member is what lets the kennel's data appear in your account.

Two helper functions are the heart of the access model:

```sql
public.my_org_ids()                          -- organisations where I am an active member
public.my_org_ids_with_role(array['owner'])  -- ... with one of these roles
```

Every policy is written in terms of them: `org_id in (select public.my_org_ids())`. They are `security definer` so that
reading `memberships` inside a policy on `memberships` does not recurse.

`protect_last_owner` stops an organisation losing its last active owner (`WB011`), taking a lock so two owners cannot
demote each other at the same instant.

Organisations come into being only through `create_organization()`, people join only through
`invite_member_by_email()` then `respond_to_invitation()`. There is no insert policy on either table.

## Why composite foreign keys

A plain foreign key `pet_id references pets (id)` only says "this pet exists". It does not say "this pet belongs to the
same kennel as the booking". A member of kennel A who learned a pet id from kennel B could attach it to their own rows.

So tenant tables are unique on `(org_id, id)` and children reference both columns:

```sql
foreign key (org_id, pet_id) references public.pets (org_id, id)
```

Bookings go one step further: `(org_id, client_id, pet_id) references pets (org_id, client_id, id)`, so a booking's
client is always the pet's real parent.

A trigger, `forbid_org_change`, sits on every tenant table and refuses any update that changes `org_id` (`WB004`).
Without it, someone who belongs to two kennels could move a row from one to the other.

## Parents and pets

**clients** are pet parents. Unique by phone number within a kennel (among those not deleted), because the phone
number is how a kennel recognises a returning parent. `consent_at` and `consent_source` record when and how they agreed
to their details being kept. `erased_at` is set only by `erase_client()` when a parent asks to be erased: the row stays,
empty and hidden, because issued bills and past stays point at it (D25).

**pets** belong to one client. Text fields for food, medical notes, allergies and behaviour are deliberately free text:
kennels write "half a cup of curd rice, no chicken" and no set of dropdowns survives contact with that. `flags` is a
list of short warning tags shown in red on Today and on the Pets list (not yet on the Bookings list).

Both are soft deleted (`deleted_at`), because old bookings and invoices must still make sense.

**vaccinations** hold vaccine, date given, valid until, and a path to the certificate in storage.

## Kennels and bookings

**kennels** are the physical units. `is_active = false` means out of service. The count of active kennels is the
capacity. Each change in or out of service is dated (`service_from`, today unless an earlier day is given) and kept in
**kennel_service**, one row a change, written only by a trigger (M44). `kennels_in_service(org, day)` counts the
kennels there on a day, which the occupancy report and the calendar use for past days.

**services** is the rate card: one default row per stay kind (`boarding`, `daycare`), plus any number of add-ons.

**bookings** are one pet's stay.

- `kind` is `boarding` (nights) or `daycare` (days).
- `start_date` and `end_date` are dates at the kennel. For boarding, nights are `end_date - start_date`. For day
  boarding, `end_date` is the last day attended, so a single day has both dates equal.
- `rate_minor` and `tax_rate_bp` are copied from the rate card at booking time. Old bookings never change price
  because the rate card did.
- `status` moves `requested` to `confirmed` to `checked_in` to `checked_out`, or ends at `cancelled` or `no_show`.
  Only `confirmed` and `checked_in` hold space.
- `public_token` is a 64 character random secret used in the parent's link.

### How double booking is made impossible

The function `stay_range(kind, start, end)` turns a booking into the range of days it occupies a kennel:

| Stay | Occupies |
| --- | --- |
| Boarding 14th to 17th | 14th, 15th, 16th (free on the 17th, the day of check-out) |
| Day boarding 14th to 16th | 14th, 15th, 16th |
| Day boarding on the 14th | 14th |

Then two exclusion constraints, which Postgres checks atomically even when two people press the button at the same
moment:

```sql
-- one kennel, one pet at a time
exclude using gist (kennel_id with =, stay_range(kind, start_date, end_date) with &&)
  where (kennel_id is not null and status in ('confirmed', 'checked_in'))

-- one pet, one place at a time
exclude using gist (pet_id with =, stay_range(kind, start_date, end_date) with &&)
  where (status in ('confirmed', 'checked_in'))
```

A booking need not have a kennel yet, so a third rule covers the total: the trigger `bookings_check_capacity` counts
bookings holding space on each day of the stay and refuses the booking if any day would exceed the number of active
kennels (`WB020`). It takes a per-organisation advisory lock so two simultaneous bookings cannot both squeeze into the
last place. With no active kennels at all the count rule is skipped, so a kennel that has not set itself up yet can
still take bookings. `allow_overbooking` on the organisation turns this one rule off; nothing turns off the exclusion constraints.

`staysOverlap()` in `src/lib/core/dates.ts` is the same rule in TypeScript, for showing things before saving.

**booking_items** are extras on a booking (a groom, a vet visit), each with its own price and tax rate.

**peak_periods** are named date ranges (a festival week) with an optional no-refund flag and optional shorter play
sessions.

**Waiting list.** A request may carry `waitlisted_at`: when it joined the waiting list, stamped by the database and
never moved while it waits, cleared when it is answered (D42). `waiting_list()` lists the waiting requests in order,
with whether each would fit now.

## Daily care

**care_items** are routines. With no pet, a routine applies to every pet in house ("Breakfast, 9:00"). With a pet, only
to that pet ("Thyroid tablet, 20:00").

**care_tasks** are the routines made concrete for one pet on one day. `generate_care_tasks(org, date)` creates any that
are missing for pets in house on that date and can be called as often as you like. A task is `pending`, `done` or
`skipped`. When it becomes done, a trigger stamps `done_by` and `done_at` from the session, ignoring anything the
client sent.

**play_yards** and **play_sessions**: a session is one pet in one yard for a time range. Two exclusion constraints say
a yard holds one pet at a time and a pet is in one yard at a time. This is what "solo play" means in data.

**stay_updates** are short notes on a stay, with photos, flagged visible to the parent or internal.

**incidents** record anything that went wrong: category, severity, what was done, whether the parent and vet were told.

## Money

Covered properly in [06-billing-and-gst.md](06-billing-and-gst.md). In short:

- **invoices** start as drafts with no number. `issue_invoice()` validates, numbers and freezes them. After that,
  triggers refuse every edit and delete. `void_invoice()` is the only way to cancel one.
- **invoice_lines** hold quantity, unit price, discount, tax rate and the computed amounts.
- **invoice_counters** hold the last number used per organisation and financial year.
- **payments** are money moving: `direction` is `in` for money received and `out` for a refund. `amount_minor` is
  always positive. Optionally tied to an invoice.
- **invoice_balances** is a view: total, paid and due for each invoice.
- **expenses** are what the kennel spent, with an optional receipt file. Owners and managers only.

A bill covers one stay (`booking_id`), a family booked together (`group_id`), a month of a repeating series
(`series_id` with `series_month`, D41), or none of them (a one-off bill); never two. A refund is a payment out that
gives back only what was paid and is not owed (`payments_check_refund`, D40).

## Reports

No tables. Seven functions, `report_occupancy`, `report_money`, `report_tax`, `report_extras` and the food reports
`report_food`, `report_food_riders` and `report_food_sources`, each taking a kennel
and a period of up to 400 days, run as the caller and refuse anyone who is not an owner or manager (D20). What each
counts is in its comment, and so in [reference/schema.md](reference/schema.md).

## The kitchen and food

Phase 1 (M26 to M33, D44), in `20261008000550_kitchen.sql`. **Stock** is `stock_items` and their `stock_moves`: never
updated or deleted; what is in stock is their sum (`stock_levels`), and a trigger refuses a movement below nothing and
turns a stock take into the difference. What a purchase cost sits apart in `stock_costs`, for owners and managers.
**Recipes** have `recipe_versions` with their `recipe_ingredients`, written once (`save_recipe_version`). **Food** for sale
is `food_products`; what a pet eats is `pet_food`. A **subscription** makes `deliveries` ahead (`plan_subscription`), each
with grams, recipe, price, tax and charge copied on; a trigger prices every delivery and another closes it at its cut-off.
A food bill is an invoice with `subscription_id` and a period, or `delivery_id`, checked by `food_bill_lines()`.
**Batches** take stock out with `used` movements (`record_batch`); a delivery packs from one (`batch_id`). **Runs**
(`delivery_runs`) hold deliveries in order; `delivery_problems` record what went wrong. **Food orders** (`food_orders`,
in the public pages file) come from the website or a parent's link and become rows above only through
`confirm_food_order`.

## Appointments

Phase 2 (M34 to M37, D46), in `20261008000450_appointments.sql`. **Places** (`appointment_places`) take one appointment at
a time between their daily hours. **Services** (`appointment_services`) have a length, a place, minutes to clean up, a
skill, and a price: fixed, by size or by coat (`appointment_service_prices`, a breed before a coat), or on quote;
`appointment_price()` works out a pet's price, and an add-on (`is_addon`) is priced on top of another appointment
(`appointment_items`). An **appointment** is one pet, service, place and person between two `timestamptz`; three
exclusion constraints keep a place (to `held_until`, the end of its clean-up), a pet and a person to one at a time while
confirmed or done, and a trigger (`appointments_check`) copies the price and checks hours, the stay, courses, packages
and what done needs. A boarder's appointment names its stay (`booking_id`) and is billed on it; a visitor's has its own
bill (`invoices.appointment_id`). A **course** (`courses`, with `course_balances`) is sold up front and pays for sessions
that name it. A pet's **grooming card** is `pet_grooming`, its coat `pets.coat`. A **package** (`packages`,
`package_parts`) goes on a stay through `apply_package()`: `bookings.package_id` and `package_price_minor`, with its
extras (`booking_items.in_package`) and appointments (`appointments.in_package`) at no charge.

## Cancellations, credit, trips and health

Phase 3 (M38 to M42, D47). In `20261008000560_credit.sql`: a kennel's **cancellation rules** (`cancellation_rules`,
one row for each of boarding, day boarding and appointments; no row means the defaults), its weekend days and credit
months (`organizations.weekend_days`, `credit_months`), and holidays as peak periods (`peak_periods.is_holiday`). A
cancelled stay records when the parent asked and whether the kennel cancelled (`bookings.cancel_asked_at`,
`cancelled_by_kennel`). **Credit** is a ledger: each lot (`credits`, from a cancellation or goodwill, with its end
date) and each spending (`credit_uses`), written only by the trigger on payments (`payments_credit`): a refund paid as
credit (`method = 'credit'`, direction out) makes a lot, a payment from credit (direction in) spends the soonest to
end. `credit_balances` says what is left and whether it can be spent today. In `20261008000460_trips_and_health.sql`:
**trips** (`trips`), a pick-up on a stay's first day or a drop on its last, with an address, a time and its slot, a
price copied from the area (`service_areas.trip_charge_minor`, else its delivery charge), a status, and a place on a
run (`run_id`, `run_position`). **Health at the door**: the kennel's rules (`organizations.health_check`,
`deworm_days`, `tick_days`, `neuter_months`, and `required_vaccines`), the pet's dates (`pets.dewormed_on`,
`tick_treated_on`), what a pet lacks on a day (`pet_health_problems()`), and an owner's or manager's reason for letting
a pet in anyway (`health_overrides`). The review link is `organizations.review_url`.

## The team

Phase 4 (M43, D48), in `20261008000470_team.sql`. **shifts** are the kennel's shifts with their hours (a shift that
ends at or before its start ends the next day). **rota** puts one person on one shift on one day; it copies the
shift's hours as kennel clock times (`starts_at`, `ends_at`), and an exclusion constraint keeps a person on one shift
at a time, as bookings keep a kennel to one stay. **leave_requests** are days off, asked for and then granted,
refused or withdrawn; granted leave takes the person off the rota on those days and the rota then refuses them.
**attendance** is one stretch of work, clocked in and out, the times stamped by the database unless an owner or
manager writes them by hand with a note; a stretch counts on the kennel date it began (`work_date`), and another
exclusion constraint keeps a person to one stretch at a time. Who lives on site is `memberships.lives_on_site`; the
whole area shows while `organizations.keeps_rota` is on. Leave and attendance are each person's own: they read and
write their own rows, owners and managers everyone's, and `who_is_on()` tells everyone the names of who is clocked in
now. Attendance is kept for pay: a person with some cannot be removed (`attendance_keeps_member`), only suspended.

## Running for real

Phase 5 (M46 to M49, D50), in `20261008000750_operations.sql`. **job_runs** is each time an overnight job ran for a
kennel: `run_nightly_jobs()` runs every job for every kennel, each in its own sub-transaction, and pg_cron calls it
each night where it is installed (the migration schedules it). The jobs are plain functions, safe to run twice:
`job_plan_deliveries()` makes subscriptions' deliveries 21 days ahead, `job_forget_old_rows()` removes problems and job
runs older than 90 days. **app_errors** are errors on the server while someone was signed in, written only by
`log_app_error()` (scrubbed of contacts, 200 an hour at most) and read by owners. **photo_archives** is one row a
month of photos downloaded as a ZIP and then removed by an owner (never removed before downloaded,
`photo_archives_removed_after_download`). Which files a photo archive covers is `archivable_photo()`: photos under
`updates`, `deliveries` and `care`, never their small copies, pets' own photos, certificates or receipts.
`photo_space()` and `photo_month_files()` read Storage's own `storage.objects` as the caller. Importing a spreadsheet
(M47) adds no table: `import_parents_and_pets()` writes clients, addresses, pets, weights and vaccinations as the
caller, all or nothing.

## The day, smoother

Phase 6 (M50 to M57, D52), in `20261008000570_the_day.sql`. **kennel_cleans** is a kennel to clean: written by the
database when the last pet in it is checked out (`bookings_leave_kennel_to_clean`), cleaned when someone taps Cleaned
(stamped, never cleared, `WB250`); one open at a time for each kennel. **house_jobs** are the opening, closing and
cleaning lists (every day or one weekday); **house_job_days** is a job ticked on a day, stamped like a care task.
**repairs** are things broken, reported and fixed by anyone, their cost an expense through `cost_to_expense()`.
**pets.passed_away_on** marks a pet that has passed away: `pets_after_passing` cancels its stays, appointments,
subscriptions and deliveries still to come, `refuse_passed_pet` refuses anything new (`WB254`), and
`pets.flowers_sent_at` is the flowers on Today. **stay_reports** holds what staff add to a stay's report (words, picked
photos from its updates to the parent); the report itself is worked out when read. **care_items.needs_photo** is
copied on to **care_tasks.needs_photo**, and `care_tasks_done_with_photo` keeps such a task from being done without
its photo. **stay_supplies** is what a parent brought (grams of food or doses of medicine, and how much each meal or
dose uses), and the view **stay_supply_left** counts it down from the ticked tasks. **bookings.is_trial**,
`trial_outcome` and `trial_note` are a trial day (day boarding only, `bookings_trial_is_a_day`). **vet_visits** are a
pet's visits to the vet, recorded with `record_vet_visit()`: the visit, a line on the stay's bill
(`booking_item_id`), the expense (`expense_id`) and the medicines as the pet's own routines, in one step.

## Appointments, parents and the team

Phase 7 (M58 to M61, D53). A move is an update of `appointments.starts_at`, `ends_at`, `place_id` and `staff_id`,
checked by `appointments_check` like a new one; only an appointment still to come moves (`WB270`, `WB271`).
`free_starts()` lists a place's free times on a day, and `first_free_start()` takes the first or last of them.
**appointments.source** and **delivery_problems.from_parent** say a parent asked or told it from their own link; only
`submit_booking_request()` and `submit_food_request()` can set them. **rota_patterns** (in `20261008000470_team.sql`)
is a person's usual week, one shift on one weekday; `fill_rota()` puts each on the rota four weeks ahead, skipping
leave and clashes, and remembers how far it filled (`filled_until`), so a day is filled once; `rota.pattern_id` says
which pattern made a day. `forgotten_clock_outs()` lists stretches still open two hours after their shift. Alerts are
in `20261008000650_alerts.sql`: **alerts** (a kind, a pet's name and a page, written only by triggers),
**alert_choices** (each person's own), **push_subscriptions** (each phone's push address, the person's own),
**push_outbox** (a phone to wake for an alert, sealed) and **push_secret** (the SHA-256 of the installation's push
secret, sealed). `take_pushes()` hands the app the phones to wake, for the secret only; `my_alerts()` is what a woken
phone shows.

## Money and stock

Phase 8 (M62 to M64, D54), in `20261008000580_shop_and_orders.sql`. A thing for sale is a **stock_items** row with a
price over the counter (`sell_price_minor`), a tax rate (`sell_tax_rate_bp`) and an HSN code, sold by the piece
(`stock_items_sold_by_the_piece`). **sales** is one sale, to a parent or to the kennel's walk-in buyer
(`clients.is_walk_in`, one per kennel, no phone, no pets, made by `walk_in_client()`), on a stay (`booking_id`) or not;
**sale_lines** holds each thing with the price, rate and code it was sold at, copied from the item by
`sale_lines_price`. Both are written only by `sell()` and changed only by `cancel_sale()`; each line takes its stock out
as a `stock_moves` row of kind `sale` (`sale_line_id`), and a cancellation puts it back as another. A sale on a stay is
in `invoice_expected_lines()` (now plpgsql, so it may read these later tables); one not on a stay has a bill of its own
(`invoices.sale_id`, one live bill per sale), checked by `sale_bill_lines()`. **supplier_orders** and
**supplier_order_lines** are an order to a supplier and its lines, never changed; what came is a `purchase` movement
with `supplier_order_id`, checked by `stock_moves_check_order` (open order, item on it, no more than still to come).
**supplier_order_progress** gives ordered, received and still to come per line, and **stock_on_order** what is still
to come per item on open orders. `record_supplier_bill()` writes the supplier's bill as an expense and keeps it on the
order (`expense_id`). **tally_settings** holds the kennel's ledger names in Tally, one row or none (the defaults).

## Intake

**intake_submissions** hold what a parent sent through the public form: a few extracted columns (name, phone,
requested dates) and the full `payload` as JSON. A submission is inert. `accept_intake()` is the only thing that turns
one into a client and pets, and only staff can call it. `upload_token` is returned to the sender only, and lets them
add a vaccination certificate for each of a pet's two vaccines to `{org_id}/intake/{id}/pet-N` and `pet-N-2` in Storage within the hour
(`intake_upload_allowed`); accepting puts that file on the pet's new vaccinations.

The payload has a version (`v: 1`). Its shape is defined once in SQL (`submit_intake` validates it) and once in
TypeScript (`src/lib/intake.ts`). If you change it, add `v: 2` and keep reading `v: 1`, because old submissions stay in
the table.

## Audit log

**audit_log** gets one row for every insert, update and delete on the tables where history matters: bookings, booking
items, invoices, payments, expenses, services, incidents, organisations and memberships. It stores who, when, which
row, and only the columns that changed. Nobody can write to it through the API; a trigger does. Owners and managers
can read it, on the History of changes screen.

## Storage

One private bucket, `pet-media`, 10 MB per file, images, PDF and MP4. Paths start with the organisation id:

```
{org_id}/pets/{pet_id}/profile.jpg
{org_id}/vaccinations/{vaccination_id}.pdf
{org_id}/updates/{update_id}/1.jpg
```

The first folder decides who may read or write. Nothing is public; a page that shows a photo asks for a short-lived
signed link.

## Conventions, and why

| Convention | Why |
| --- | --- |
| Money as `bigint` paise | Floating point cannot hold 0.1 exactly. Whole paise add up. |
| Tax rates in basis points | 18% is 1800, 2.5% is 250. No decimals anywhere. |
| Stay dates as `date` | A stay is "the 14th to the 17th" wherever the server is. Time zones turn timestamps into off-by-one-day bugs. |
| "Today" from the kennel's `time_zone` | A server in another country must agree with the kennel about what day it is. |
| Phones in E.164 | One form to compare, and what WhatsApp links need. |
| Who and when stamped by triggers (`stamp_actor`, `stamp_when_set`, `stamp_done`, `bookings_stamp_status`) | A client cannot claim someone else did it, or backdate it. |
| Copied prices and frozen invoices | History does not change when settings do. |
| `comment on` everything | The schema reference is generated from the comments. |

## Changing the model

1. Edit or add a migration (see CLAUDE.md rule 12 for which).
2. New table: `org_id`, unique `(org_id, id)`, composite foreign keys, `set_updated_at` trigger if it has
   `updated_at`, `forbid_org_change` trigger, RLS enabled, grants, policies, comments.
3. Write the test that fails without your rule.
4. `npm run gen:db`.
5. Use the new types in the app.
6. `npm run check`.
