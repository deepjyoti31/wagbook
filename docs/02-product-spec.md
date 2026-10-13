# 2. Product specification

Every feature Wagbook has or plans to have. Each is marked:

- **Built**: there is a screen, and the rule behind it is tested.
- **Database ready**: the tables, rules and tests exist, but there is no screen yet.
- **Planned**: nothing exists. The milestone that will build it is named.

When you build something, change its mark here in the same change.

## The people

| Person | Signs in? | What they can do |
| --- | --- | --- |
| Owner | Yes | Everything, including inviting and removing owners, and deleting the kennel. |
| Manager | Yes | Everything except managing owners and deleting the kennel. Changes kennels, prices, settings; voids invoices; records refunds. |
| Staff | Yes | Runs the day: bookings, check-in and out, pets, care tasks, updates, incidents, payments received, issuing invoices. |
| Parent | Never | Opens links sent to them: the intake form, their pet's stay page, their bill. |

One person can belong to several kennels, with a different role in each.

## Map of the app

```
/                     Landing page                                   public
/login                Sign in, create account                        public
/setup                Shown when the database settings are missing   public
/auth/confirm         Where email links land                         public
/onboarding           Accept an invitation, or create a kennel       signed in
/app                  Today                                          signed in
/app/bookings         Current and upcoming, Past                     signed in
/app/bookings/new     New booking                                    signed in
/app/dogs             Pets (search)                                  signed in
/app/dogs/new         Add a pet and its parent                       signed in
/app/more             Menu, account, switch kennel, sign out         signed in
/app/more/intake      Forms from parents                             signed in
/app/more/kennels     Kennels                                        signed in
/app/more/people      People and invitations                         signed in
/app/more/settings    Kennel details, prices, UPI, tax, play, intake signed in
/i/{slug}             A kennel's intake form                         public
/s/{token}            One stay, for the parent                       public, secret link
```

Planned routes: `/app/bookings/{id}`, `/app/calendar`, `/app/care`, `/app/play`, `/app/bills`, `/app/dogs/{id}`,
`/app/clients/{id}`, `/app/more/reports`, `/app/more/expenses`, `/inv/{token}` (a bill, for the parent).

The folder is called `dogs` because that is what almost every kennel calls them; the screen says "Pets" because cats
board too. Leave both as they are.

---

## A. Getting started

### A1. Create an account. Built.

Email and password. Supabase sends a confirmation email whose link lands on `/auth/confirm`. If the database cannot be
reached, the form says so instead of blaming the password.

### A2. Create a kennel. Built.

Three fields: kennel name, link name (the `slug`, used in `/i/{slug}`), your name. The person becomes the owner. They
land on Kennels with a welcome note asking them to add kennels. A person can own at most five kennels (`WB012`).

### A3. Add kennels. Built.

Add a run in one go: prefix `K`, how many, first number, gives `K01` to `K60`. Repeating it never duplicates. A kennel
can be taken out of service and put back. The number of kennels in service is the kennel's capacity.

### A4. Invite the team. Built.

On People, an owner or manager enters a name, an email and a role. The person must already have an account. They see
the invitation at `/onboarding` the next time they sign in (and a link to it on More if they already work somewhere),
and become a member only when they press Join. The confirmation message is the same whether or not the email has an
account, but a pending row appears in the list only when it does, so the inviter can tell (see known limitations in
[05](05-security-and-privacy.md)). Inviting someone who is already a member changes nothing.
Managers cannot invite or remove owners.

Planned (M6): change a member's role and name from the screen; invite someone who has no account yet by sending a link.

### A5. Work at more than one kennel. Built.

More lists the other kennels the person belongs to, with a Switch button. The choice is remembered in a cookie. The
cookie is only a preference: membership is checked on every request.

### A6. Settings. Built.

Kennel details (name, phones, email, address, usual drop-off and pick-up times), usual prices for boarding and day
boarding, UPI ID and payee name, tax (off, India GST, or one tax at one rate; GSTIN, state, rate, legal name, invoice
prefix, whether prices include tax), solo play (sessions per pet per day, minutes), intake form (on or off, consent
wording). Staff can look but not save.

Planned (M4): time zone, currency, locale and financial year start as visible settings. Today they are columns with
Indian defaults.

---

## B. Parents and pets

### B1. Add a pet by hand. Built.

One form for parent and pet. The parent is found by mobile number: if the number is already known, the pet is added to
that parent. Fields: parent mobile, name, consent tick; pet name, animal, breed, sex, neutered, weight, food, medical
notes and medicines, allergies, behaviour, and "staff should know" flags (see `src/lib/pets.ts`).

### B2. Pets list. Built.

Search by name. Each row shows breed, weight, flags in red, the parent with a tap-to-call number, and "Book a stay".

### B3. Intake form for parents. Built.

`/i/{slug}`. One page, no account. The parent enters their details and an emergency contact, up to six pets (with food,
health, behaviour and vaccinations), the dates they want, and ticks a consent box. The consent wording is the kennel's
own, or a default. The submission waits for staff; it changes nothing until accepted.

Protection against abuse: the form can be switched off; a submission is at most 20,000 bytes; at most 60 unreviewed
submissions per kennel per hour and 5 per phone number per hour (`WB048`). This is blunt on purpose. See
[05-security-and-privacy.md](05-security-and-privacy.md).

### B4. Review forms from parents. Built.

More, then Forms from parents. Shows the kennel's intake link with "Send on WhatsApp" and "Open the form". Each waiting
form shows the parent, a tap-to-call number, requested dates, and each pet with medical notes and allergies marked in
red. A parent whose number is already known is marked "Has been here before as (name)". Three choices: Accept and book
(creates the parent and pets, then opens New booking with the most recently added pet and the requested dates filled
in; it does not carry over boarding or day boarding), Decline, Mark as junk. A form is reviewed once: after any of the
three it cannot be reopened. A form that cannot
be read fully cannot be accepted; the screen says to call the parent.

Accepting never rewrites an existing client's details. Only pets with new names are added.

### B5. Pet page. Planned (M6).

Everything about one pet: details, edit, photo, vaccinations with expiry warnings, past stays, incidents.

### B6. Parent page. Planned (M6).

One parent: their pets, stays, bills, what they owe, edit details, WhatsApp button.

### B7. Vaccination records. Database ready.

Table `vaccinations` (vaccine, given on, valid until, certificate file). The intake form already collects them. Planned
(M6): show and edit them, warn at booking and at check-in when one has expired or will expire during the stay.

### B8. Forget a parent. Planned (M9).

Export everything held about a parent, and erase it on request, keeping only what tax law requires (issued invoices).

---

## C. Bookings

### C1. New booking. Built.

Pet, boarding or day boarding, dates, kennel (optional: "Decide at check-in"), price (optional: uses the usual price),
notes for staff. The price and tax rate are copied onto the booking, so changing the rate card later never changes an
old booking.

What the database refuses, whatever the screen does:

| Rule | Error |
| --- | --- |
| Two pets in one kennel on overlapping nights | `bookings_no_kennel_overlap` |
| One pet in two bookings at once | `bookings_no_pet_overlap` |
| More pets in house on any day than kennels in service (once at least one kennel exists) | `WB020` |
| A kennel that is out of service | `WB021` |
| Boarding with no night; check-out before check-in; longer than a year | check constraints |

A kennel is free again on the day its guest checks out, so one dog can leave and another arrive in the same kennel on
the same day. Day boarding holds its kennel for every day of the visit, including the last.

### C2. Bookings list. Built.

Two tabs: Current and upcoming; Past. Each row: kennel tag, pet, status, parent, dates, nights or days, price. A
confirmed or requested booking can be cancelled.

### C3. Booking page. Planned (M2).

One booking: change dates, kennel, price, notes; add extras (grooming and so on) from the rate card; belongings list;
check in and out; cancel with a reason; mark as did not arrive; link to the parent's stay page; the bill.

### C4. Family bookings. Database ready.

`bookings.group_id` ties together bookings made at once for pets of one family. Planned (M2): choose several pets in New
booking.

### C5. Calendar. Planned (M2).

A grid of kennels by days showing who is where, with free kennels obvious. `occupancy_by_day()` already returns the
count per day.

### C6. Requests. Database ready.

A booking can have status `requested`, which holds no space. Planned (M2): let staff save a request and confirm it later.

### C7. Peak periods. Database ready.

Table `peak_periods`: a named range of dates with an optional no-refund flag and an optional shorter play session.
Planned (M2): a settings screen, a badge on bookings that touch a peak period, a warning when cancelling one.

### C8. Rate card and extras. Database ready.

Table `services` holds the usual price per kind and any number of extras. Settings edits the two usual prices today.
Planned (M2): manage extras; add them to a booking as `booking_items`.

---

## D. The day

### D1. Today. Built.

The date, "N in house of M kennels, N to arrive", a prompt when forms from parents are waiting, then two lists.

- **Arriving**: confirmed bookings due today or earlier (so yesterday's no-show is still visible, marked "Was due").
  Each has a kennel picker offering only kennels free for the whole stay, and Check in.
- **In house**: checked-in pets, with "Leaves today" or "Was due to leave" badges, "Send update" (opens WhatsApp to the
  parent with a message and the stay link) and Check out. Check out is the main button on the day the pet leaves.

Pet flags (for example "bite history" or "escape risk") show in red on every row.

### D2. Daily care tasks. Database ready.

`care_items` are routines: house routines for every pet (meals at set times, cleaning) and routines for one pet (a
tablet at 8 pm). `generate_care_tasks(org, date)` turns them into the day's `care_tasks` for every pet in house; it is
safe to call again. A task is ticked done (who and when are stamped by the database and cannot be forged) or skipped
with a note. Planned (M3): the Care screen, grouped by time of day, one tap to tick.

### D3. Solo play timetable. Database ready.

`play_yards` and `play_sessions`; the database refuses two pets in one yard at once, and one pet in two yards at once.
`planPlaySessions()` in `src/lib/core/play-schedule.ts` builds a fair timetable, and `yardsNeeded()` answers "how many
yards do I need to keep my promise". Planned (M3): the Play screen and a "what do I need" calculator in Settings.

### D4. Updates to parents. Partly built.

Today, "Send update" opens WhatsApp with a message and the stay link. Database ready: `stay_updates`, short notes marked
visible to the parent, shown on the stay page. Planned (M5): write an update with photos from the pet's row; it appears
on the stay page and opens WhatsApp.

### D5. Incidents. Database ready.

Table `incidents`: what happened, how serious, what was done, whether the parent and a vet were told. Planned (M6): log
one from a pet's row in two taps; show a pet's history.

### D6. Check-in checklist. Planned (M2).

At check-in: confirm vaccinations, record belongings, note anything the parent said at the gate.

---

## E. Money

Nothing in this section has a screen yet. All of it is in the database, with tests. Details in
[06-billing-and-gst.md](06-billing-and-gst.md).

### E1. Bills. Database ready. Screens planned (M4).

A draft invoice is built from a booking (`stayLines()` and `computeInvoice()` in `src/lib/core`). Issuing it
(`issue_invoice`) checks every line's arithmetic, gives it the next number for the financial year, and freezes it,
including the kennel's and parent's details as they were that day. An issued invoice can never be edited or deleted,
only voided with a reason by an owner or manager; the number stays used.

### E2. Bill for the parent. Database ready. Screen planned (M4).

`/inv/{token}`: the bill, what has been paid, and a "Pay with UPI" button and QR code for the balance.
`get_public_invoice` already returns exactly what that page needs.

### E3. Payments. Database ready. Screen planned (M4).

Record money received: amount, method (UPI, cash, card, bank transfer, other), date, reference. Advances are payments
not yet tied to an invoice. A refund is a payment marked as going out (the amount is always positive), and only owners and managers can record one. Wagbook records
payments; it never moves money.

### E4. Expenses. Database ready. Screen planned (M7).

What the kennel spent, by category, with a receipt photo.

### E5. Reports. Planned (M7).

Occupancy by day and month, income by month, what is owed, GST collected by rate, export to a spreadsheet.

---

## F. For parents

### F1. Stay page. Built.

`/s/{token}`. Kennel name, pet's name, status (waiting, confirmed, staying now, gone home), dates, usual drop-off and
pick-up times, updates from the kennel, a count of care done each day ("3 of 3 meals"), and a WhatsApp button to the
kennel. Times are on the kennel's clock.

It shows no prices, no staff notes, no medical details and no other pets. The link stops working when the booking is
cancelled and thirty days after check-out. The page is marked not to be indexed by search engines.

### F2. Booking confirmation message. Built as a function, not yet wired.

`bookingConfirmedMessage()` writes it. Planned (M2): a "Send confirmation" button after booking.

### F3. Photos. Planned (M5).

Photos attached to updates, shown on the stay page through short-lived links. The `pet-media` storage bucket and its
access rules exist.

---

## G. Across everything

| Feature | State |
| --- | --- |
| Install to the phone's home screen (web app manifest, icons) | Built |
| Works offline or on a bad connection | Planned (M8) |
| Languages other than English | Planned (M8) |
| Audit log of every change to bookings, money, settings and people | Database ready. Viewer planned (M7). |
| Daily reminders (arrivals tomorrow, vaccinations expiring) | Planned (M8) |
| Demo data for trying Wagbook | Planned (M1) |

## Words on screen

Buttons and messages use the words in [12-glossary.md](12-glossary.md). Error sentences come from the database (see
[reference/error-codes.md](reference/error-codes.md)) and `src/lib/errors.ts`. They say what went wrong and what to do,
in one or two short sentences, and never apologise.
