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
capacity.

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

## Reports

No tables. Four functions, `report_occupancy`, `report_money`, `report_tax` and `report_extras`, each taking a kennel
and a period of up to 400 days, run as the caller and refuse anyone who is not an owner or manager (D20). What each
counts is in its comment, and so in [reference/schema.md](reference/schema.md).

## Intake

**intake_submissions** hold what a parent sent through the public form: a few extracted columns (name, phone,
requested dates) and the full `payload` as JSON. A submission is inert. `accept_intake()` is the only thing that turns
one into a client and pets, and only staff can call it. `upload_token` is returned to the sender only, and lets them
add one vaccination certificate per pet to `{org_id}/intake/{id}/pet-N` in Storage within the hour
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
