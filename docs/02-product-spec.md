# 2. Product specification

Every feature Wagbook has or plans to have. Each is marked:

- **Built**: there is a screen, and the rule behind it is tested.
- **Database ready**: the tables, rules and tests exist, but there is no screen yet.
- **Planned**: nothing exists. The milestone that will build it is named.

When you build something, change its mark here in the same change.

## The people

| Person | Signs in? | What they can do |
| --- | --- | --- |
| Owner | Yes | Everything, including deleting anything (D29), inviting and removing owners, and deleting the kennel. |
| Manager | Yes | Everything except deleting, managing owners and deleting the kennel. Changes kennels, prices, settings; voids invoices; records refunds. |
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
/app/bookings/{id}    One booking                                    signed in
/app/calendar         Kennels by day                                 signed in
/app/care             Today's care tasks                             signed in
/app/play             Today's solo play timetable                    signed in
/app/dogs             Pets (search)                                  signed in
/app/dogs/new         Add a pet and its parent                       signed in
/app/dogs/{id}        One pet: details, photo, vaccinations, stays, incidents  signed in
/app/dogs/{id}/incident  Write down an incident                      signed in
/app/clients/{id}     One parent: details, pets, stays, bills, merge signed in
/app/more             Menu, account, switch kennel, sign out         signed in
/app/more/intake      Forms from parents                             signed in
/app/more/kennels     Kennels                                        signed in
/app/more/routines    Daily (house) routines                         signed in
/app/more/play        Play yards, play hours, yard calculator        signed in
/app/more/extras      Extras on the price list                       signed in
/app/more/peak        Peak periods                                   signed in
/app/more/reports     Reports and CSV downloads                      owners and managers
/app/more/expenses    Expenses with receipts                         owners and managers
/app/more/history     History of changes (the audit log)             owners and managers
/app/more/people      People and invitations                         signed in
/app/more/settings    Kennel details, prices, UPI, tax, region, intake signed in
/app/bills            Bills: owed, drafts, recent                    signed in
/app/bills/{id}       One bill and its payments                      signed in
/app/bookings/{id}/update  Write an update with photos               signed in
/i/{slug}             A kennel's intake form                         public
/s/{token}            One stay, for the parent                       public, secret link
/inv/{token}          One bill, for the parent                       public, secret link
```

/join/{token}         Join a kennel with an invitation link          public, then signed in

The folder is called `dogs` because that is what almost every kennel calls them; the screen says "Pets" because cats
board too. Leave both as they are.

---

**Deleting (D29).** Only an owner deletes anything: an expense (with its receipt), a draft bill, an extra on a booking,
a peak period, a person or an invitation, today's play plan, a parent's details. Each asks once more ("This cannot be
undone.", then "Yes, delete it"), and the database refuses anyone else.

## A. Getting started

### A1. Create an account. Built.

Email and password. Supabase sends a confirmation email whose link lands on `/auth/confirm`. If the database cannot be
reached, the form says so instead of blaming the password.

### A2. Create a kennel. Built.

Three fields: kennel name, link name (the `slug`, used in `/i/{slug}`), your name. The person becomes the owner. They
land on Kennels with a welcome note asking them to add kennels. A person can own at most five kennels (`WB012`).

### A3. Add kennels. Built.

Add one kennel with any name ("Garden suite"), at the end of the list, or a numbered row in one go: prefix `K`, how
many, first number, gives `K01` to `K60`. Repeating a row never duplicates. Each kennel's Change renames it and sets
its position in the list, which is also the order the care round walks. Two kennels cannot share a name. A kennel can
be taken out of service and put back. The number of kennels in service is the kennel's capacity. Owners and managers
(M12).

### A4. Invite the team. Built.

On People, an owner or manager enters a name, an email and a role. The person must already have an account. They see
the invitation at `/onboarding` the next time they sign in (and a link to it on More if they already work somewhere),
and become a member only when they press Join. The confirmation message is the same whether or not the email has an
account, but a pending row appears in the list only when it does, so the inviter can tell (see known limitations in
[05](05-security-and-privacy.md)). Inviting someone who is already a member changes nothing.
Managers cannot invite or remove owners.

**Invitation links (M6).** For someone with no account yet: an owner or manager enters a name and a role and presses
Make a link, then sends it with "Send on WhatsApp" or Copy link. The link works once, for seven days, and can be
withdrawn. Whoever opens it creates an account or signs in, sees which kennel and role it is for, and presses Join. A
signed-out visitor learns nothing from the link. Only owners can make a link that grants owner.

**Changing people (M6).** On People, Change opens a colleague's name and role, Suspend (they lose access at once; their
history stays) or Restore, and Remove (owners only, after a second tap). Managers change staff and managers; only owners
change owners.

### A5. Work at more than one kennel. Built.

More lists the other kennels the person belongs to, with a Switch button. The choice is remembered in a cookie. The
cookie is only a preference: membership is checked on every request.

### A6. Settings. Built.

Kennel details (name, phones, email, address, usual drop-off and pick-up times), usual prices for boarding and day
boarding and a shared kennel price for each (the second pet of one parent in one kennel; empty means the usual price), UPI ID and payee name, tax (off, India GST, or one tax at one rate; GSTIN, state, rate, legal name, invoice
prefix, whether prices include tax), intake form (on or off, consent wording). Staff can look but not save. Solo play
settings are on Play yards (D3).

Region (built in M4): time zone, currency, number and date style, the month the financial year starts, and whether bill
totals are rounded to a whole unit.

---

## B. Parents and pets

### B1. Add a pet by hand. Built.

One form for parent and pet. The parent is found by mobile number: if the number is already known, the pet is added to
that parent. Fields: parent mobile, name, consent tick; pet name, animal, breed, sex, neutered, weight, food, medical
notes and medicines, allergies, behaviour, and "staff should know" flags (see `src/lib/pets.ts`).

### B2. Pets list. Built.

Search by the pet's name, the parent's name, or the parent's phone number typed any way (`98765 43210`, `+91...`). Each
row shows the pet's photo, breed, weight, flags in red, the parent (opening their page) with a tap-to-call number, and
"Book a stay". The pet's name opens its page.

### B3. Intake form for parents. Built.

`/i/{slug}`. One page, no account. The parent enters their details and an emergency contact, up to six pets (with food,
health, behaviour, a vaccination and a photo or PDF of its certificate, and optionally another vaccination with its own
card), the dates they want, and
ticks a consent box. The consent wording is the kennel's own, or a default. The submission waits for staff; it changes
nothing until accepted. A certificate needs the vaccine's name beside it. If the form goes but a certificate does not,
the thank-you page says to send it on WhatsApp.

Protection against abuse: the form can be switched off; a submission is at most 20,000 bytes; at most 60 unreviewed
submissions per kennel per hour and 5 per phone number per hour (`WB048`); at most 10 sends from one address in ten
minutes (M9, `src/lib/rate-limit.ts`). Certificates (M9, a second per pet in M13): one file for each of a pet's two vaccines, at most 10 MB, photo or PDF, only within an
hour of sending the form and only while it waits for staff, using the secret the form got back
(`intake_upload_allowed`). See [05-security-and-privacy.md](05-security-and-privacy.md).

### B4. Review forms from parents. Built.

More, then Forms from parents. Shows the kennel's intake link with "Send on WhatsApp" and "Open the form". Each waiting
form shows the parent, a tap-to-call number, requested dates, and each pet with medical notes and allergies marked in
red. A parent whose number is already known is marked "Has been here before as (name)". Three choices: Accept and book
(creates the parent and pets, then opens New booking with the most recently added pet and the requested dates filled
in; it does not carry over boarding or day boarding), Decline, Mark as junk. A form is reviewed once: after any of the
three it cannot be reopened. A form that cannot
be read fully cannot be accepted; the screen says to call the parent.

Accepting never rewrites an existing client's details. Only pets with new names are added. A certificate the parent
sent shows as "See the certificate for (pet)", and accepting puts it on that pet's new vaccination.

### B5. Pet page. Built.

`/app/dogs/{id}`: photo, breed, weight, flags, the parent; incidents (with "Parent has been told" and "Dealt with");
vaccinations with their status (valid, expires soon within 30 days, expired, no date) and certificates, and Add a
vaccination; stays; change the photo; every detail editable by any member (name, animal, breed, sex, neutered, date of
birth, weight, colour, microchip, food, health, allergies, behaviour, flags, vet). Book a stay.

### B6. Parent page. Built.

`/app/clients/{id}`: phone numbers, what they owe in all, WhatsApp; their pets, stays and bills with what is due; every
detail editable (name, phones, email, address, emergency contact, GSTIN and state, notes, consent if none is on record).
For owners and managers, "What we hold about them": download their details; owners can also erase them (B8).

**Merging (B9, M6).** For owners and managers: "Same person as another parent?" finds another record by its phone
number and merges it into this one. Pets, their stays, bills (issued ones keep the buyer printed on them), payments and
forms move here; missing details are filled in from the other record, both sets of notes are kept, and the other
number is kept as "another number". The other record is hidden, not deleted (`merge_clients`).

### B7. Vaccination records. Built.

Table `vaccinations` (vaccine, given on, valid until, certificate file). The intake form collects the dates. The pet page
shows each with its status and certificate, and adds one with a photo or PDF of its certificate. Warnings
(`vaccinationWarnings()`): a request or confirmed booking says when there are no vaccinations on record, when one
expired before arrival, or when one runs out before the pet goes home; arrivals on Today carry "Check vaccinations";
the check-in checklist lists them with their dates. Only dates are judged: which vaccines a kennel requires is its own
policy. Parents can send a certificate with the intake form (B3, M9).

### B9. Hide a pet or parent from lists. Built.

For a pet who no longer comes, or has died, and a parent who no longer comes. At the end of the pet or parent page,
owners and managers press **Hide this pet** or **Hide this parent and their pets**. The pet or parent leaves the pets
list, search and New booking; their page stays, reached from past stays, with a notice and **Show in lists again**.
Hidden pets are listed under **Hidden pets** at the foot of the pets list. Nothing is deleted.

What the database refuses (`guard_hiding()`):

| Rule | Error |
| --- | --- |
| Staff hiding or showing a pet or parent | `WB002` |
| Hiding while a stay is requested, confirmed or in house | `WB019` |
| Showing a pet again while its parent is hidden | `WB019` |

Hiding a parent hides their pets at the same moment; showing the parent again brings back those pets, but not a pet
that was hidden on its own before. Merging and erasing hide rows the same way.

### B8. A parent's details: download and erase. Built (M9).

On the parent page, for owners and managers (`WB070` for anyone else); erasing is for owners only (`WB074`):

- **Download their details** gives one JSON file (`export_client`): the parent and their consent, each pet with its
  vaccinations, own routine and incidents, every stay with its extras, updates, care tasks and play, bills with their
  lines, payments, the intake forms they sent, and the storage paths of their photos and certificates (the file names
  them; it does not contain them).
- **Erase their details**, after ticking "I understand that this cannot be undone" (`erase_client`): deletes their
  pets' vaccinations, routines and incidents, every update, care task and play session of their stays, their intake
  forms, draft bills, and every photo and certificate file; empties every personal detail on the parent, their pets and
  their stays (the parent and pets are then shown as "Erased" where a past stay or bill names them); and takes the
  personal text out of the history of changes. Issued and cancelled bills stay, with the buyer printed on them, and so
  do payments and the stays' dates and prices, because tax law requires the kennel to keep them. Refused while a pet is
  in house (`WB071`) or a stay is still to come (`WB072`). The erasure itself is in the history of changes. The phone
  number is free for a new record afterwards.

---

## C. Bookings

### C1. New booking. Built.

Pet (and, ticked, any other pets of the same parent: see C4), boarding or day boarding, dates, kennel (optional:
"Decide at check-in"), notes for staff. Two buttons: Confirm booking, or Save as request (C6). The price is the usual
price for the kind of stay; only owners and managers see a Price box and can type another. The price and tax rate are
copied onto the booking, so changing the rate card later never changes an old booking. Opening it from the calendar
fills in the kennel and the date. After booking, the booking page opens.

The pet list starts with recently booked and recently added pets and their families, not every pet the kennel has. A
search box above it finds any pet by name, breed, parent's name, or three or more digits of the parent's phone: the
list narrows at once, and the server is asked for the rest as you type (`searchPets()`, M13); when one pet matches it
is chosen. The kennel list offers only kennels free on the dates typed, and changes as
the dates change (`freeKennels()`, the same rule as `available_kennels()`); a sentence says when some are left out.

What the database refuses, whatever the screen does:

| Rule | Error |
| --- | --- |
| Pets of different parents in one kennel on overlapping nights | `bookings_no_kennel_overlap` |
| A third pet in one kennel | `WB027` |
| One pet in two bookings at once | `bookings_no_pet_overlap` |
| More kennels in use on any day than kennels in service (once at least one kennel exists; two siblings sharing use one) | `WB020` |
| A kennel that is out of service | `WB021` |
| Boarding with no night; check-out before check-in; longer than a year | check constraints |
| Staff booking at a price that is not on the price list, or with a discount | `WB023` |
| Staff changing a booking's price, discount, tax or kind | `WB022` |
| Pets of two different parents in one family booking | `WB024` |

A kennel is free again on the day its guest checks out, so one dog can leave and another arrive in the same kennel on
the same day. Day boarding holds its kennel for every day of the visit, including the last.

### C2. Bookings list. Built.

Two tabs: Current and upcoming; Past. Each row: kennel tag, pet, status (a request says "Request"), "Family" when booked
with other pets, any peak period it touches, parent, dates, nights or days, price. A row opens the booking page, where
cancelling happens. A Calendar button opens C5.

### C3. Booking page. Built.

`/app/bookings/{id}`. The pet, kennel, status, dates, peak periods it touches and the pet's warning flags, then:

- **Next**: for a request, Confirm booking. For a confirmed booking, the check-in checklist (D6) and Did not arrive.
  For a pet in house, Check out, Send update, and Extend to today when it has stayed past its check-out date.
- **Parent's stay page**: the link, Copy link, Open it, and Send confirmation (WhatsApp, with dates, nights and the
  estimated total).
- **Booked together**: the other pets of a family booking.
- **What it costs**: the stay and its extras as lines with an estimated total (tax included where the kennel charges
  it); add an extra from the price list or a one-off item; owners can remove one, after a second tap.
- **Change this booking**: dates, kennel (free ones offered), expected drop-off and pick-up times, belongings, notes;
  price per night or day, a discount, and boarding or day boarding (the kind of stay) for owners and managers only
  (`WB022` for staff). Changing the kind leaves the price as typed, with a hint to check it; the kennel and pet
  overlap rules apply to the new kind at once.
- **The pet's own routines** (D2) and what the parent said about food, health, allergies and behaviour.
- **Cancel**, with a reason (required), and a warning when the stay touches a no-refund peak period.

After a step that changes the status, the page comes back saying what happened. The bill is M4.

### C4. Family bookings. Built.

In New booking, choosing a pet lists the other pets of the same parent with a tick box each. Ticked pets are booked in
the same statement (all or none), share a `group_id`, and show each other on the booking page. The database refuses a
group that mixes parents (`WB024`), and a family stays as it was booked (`WB026`).

With two pets ticked, Kennels offers "A kennel each" (the first pet gets the chosen kennel, the other gets one at
check-in) or "One kennel together": then a kennel must be chosen, only kennels with room for both are offered, both
pets get it, and the second is booked at the shared kennel price from Settings (when one is set). A kennel holds two
pets of one parent at most, never pets of different parents (D27); Today, the booking page and the calendar offer and
label a sibling's kennel ("K05, with Coco"), and the booking page says "Shares K05 with Coco." The calendar shows both in
the kennel's square, and its top row counts kennels in use, with the number of pets when siblings share.

The family pays on one bill (E1).

### C5. Calendar. Built.

`/app/calendar`. Kennels down the side, fourteen days across, Earlier and Later to move, scrolling sideways on a phone
with the kennel column fixed. A row of "in house of kennels" per day from `occupancy_by_day()`, red when full. Each cell
shows the pet holding that kennel that night (green when in house, grey when booked, red when still here after its
check-out date) and opens the booking. An empty cell from today on opens New booking for that kennel and day. Pets with
no kennel yet are counted in a last row. Requests are not shown; a note says how many there are.

### C6. Requests. Built.

Save as request in New booking. A request holds no space and is not counted for capacity or kennels. Confirm booking on
its page turns it into a confirmed booking, and only then do the database's space rules apply.

### C7. Peak periods. Built.

More, then Peak periods: add (name, first and last day, no refund, shorter play sessions) and remove, owners and
managers. A stay touches a period when any night it holds a kennel (any day, for day boarding) falls inside it
(`peaksTouching()`). Such bookings carry a badge on Bookings and on the booking page, and cancelling one marked no
refund shows a warning. Prices never change.

### C8. Rate card and extras. Built.

Settings edits the two usual prices. More, then Extras: add an extra (each time or by the hour), change its price, take
it off the list; owners and managers. On the booking page anyone adds an extra at its listed price, or a one-off item
with its own price (a vet bill paid for the parent). Changing what an extra costs is for owners and managers
(`WB025`); removing one from a booking is for owners (the delete policy, D29).

---

## D. The day

### D1. Today. Built.

The date, "N in house of M kennels, N to arrive", today's care counts ("Meals 2 of 12", medicines in red until done)
linking to the Care screen, a prompt when forms from parents are waiting, then two lists. Pet names open the booking.

- **Arriving**: confirmed bookings due today or earlier (so yesterday's no-show is still visible, marked "Was due").
  Each has a kennel picker offering only kennels free for the whole stay, and Check in.
- **In house**: checked-in pets, with "Leaves today" or "Was due to leave" badges, "Send update" (opens WhatsApp to the
  parent with a message and the stay link) and Check out. Check out is the main button on the day the pet leaves. A pet
  still here after its check-out date also gets Extend to today, which moves the check-out date to today, or says
  which pet the kennel is promised to and what to do instead.

Pet flags (for example "bite history" or "escape risk") show in red on every row.

### D2. Daily care tasks. Built.

`care_items` are routines: house routines for every pet (meals at set times, cleaning) and routines for one pet (a
tablet at 8 pm). More, then Daily routines: the house routines, a starter set (breakfast, a kennel clean, lunch, dinner),
add and stop; owners and managers. A pet's own routines are added and stopped from its booking page by anyone.

`generate_care_tasks(org, date)` turns routines into the day's `care_tasks` for every pet checked in, from its first day
until it is checked out (so an overstaying pet is still fed). Today and the Care screen call it when opened; it is safe
to repeat.

`/app/care`: today's tasks grouped by time; within a time, medicines first, then kennel by kennel in kennel order. A pending
medicine has a red edge and badge and is never folded away. One tap on Done; a second tap does nothing (the database keeps
the first who and when). Skip opens a note; a medicine cannot be skipped without one (constraint
`care_tasks_skipped_medication_needs_note`). Undo puts a task back. Filters: Still to do, and by kind.

Proof photos on care tasks are not built; the field meant for them was removed (M13).

### D3. Solo play timetable. Built.

More, then Play yards (owners and managers): yards (add, take out of use), sessions per pet per day, minutes per session,
minutes between pets, opening hours and an optional break. A calculator there answers "how many yards do I need"
(`yardsNeeded()`) for any numbers, as a plain form that works without JavaScript.

`/app/play`: Plan today builds a fair timetable for every pet in house (`planPlaySessions()`): everyone gets a first
session before anyone gets a second, at least two hours between a pet's sessions, pets taken in kennel order, around any
sessions already planned, so it can be pressed again after new arrivals. A peak period's shorter session length applies.
The timetable is shown by yard. Done, Undo, Move (time and yard) and Skip (frees the slot). Siblings sharing a kennel
are planned together, in the same slots. The database refuses pets of different parents in one yard at once, or one
pet in two yards; Move says so in a sentence. Owners and managers can clear the sessions still
to happen.

### D4. Updates to parents. Built.

Write update, from a pet's row on Today or from its booking: a note, up to four photos, and "Show to the parent" (on by
default; off makes it a note for the team). Saving puts it on the stay page and offers "Send on WhatsApp" with the
note and the stay link. The booking page lists its updates with their photos and who can see them.

Photos are redrawn in the browser before upload: turned the right way up, about 1,600 pixels on the long edge, saved as
JPEG, which leaves behind the location and camera data, plus a small copy for lists. The server strips metadata again
from any JPEG. Paths follow the storage layout, organisation first.

A pet's photo, set from its booking page, shows small on every row (Today, Bookings, Care, Play), and on the stay
page.

### D5. Incidents. Built.

"Incident" on a pet's row on Today (and "Write down an incident" on its page) opens a short form: what happened (illness,
injury, fight, escape, behaviour, damage, other), how serious (low, medium: tell the parent today, high: tell the parent
and a vet now), what happened in words, what was done, vet seen, parent told. It is tied to the pet's current stay. The
pet page lists them with "Parent has been told" (the database stamps who and when) and "Dealt with". Today shows, at the
top, every open high one and every open medium or high one the parent has not been told about. Owners and managers can
correct what an incident says ("Correct it"); the database refuses anyone else (`WB080`), and History of changes keeps
what it said before.

### D6. Check-in checklist. Built.

On the booking page of a confirmed booking: kennel (free ones offered), the pet's vaccinations with "Expired" or "Runs
out during the stay" in red, a tick for "I have seen the vaccination certificates" (the database stamps who and when),
belongings, and anything said at the gate. Check in from Today stays one tap and leaves these alone.

---

## E. Money

Details in [06-billing-and-gst.md](06-billing-and-gst.md).

### E1. Bills. Built.

Make bill, on the booking page (and offered after check-out), builds a draft from the booking: the stay at its booked
rate, discount and tax, then each extra (`billForBooking()`, `stayLines()`, `computeInvoice()`), saved in one go
(`save_invoice_draft`). A stay has one live bill; pressing Make bill again brings a draft back in line with the booking
or opens the issued bill. Owners and managers can change, add and remove lines of a draft. Issue checks every sum
(`issue_invoice`), gives the next number for the financial year and freezes it; staff can issue only a bill exactly as
its booking prices it (`WB050`). Send bill opens WhatsApp with `billMessage()` and the bill's link. Owners and managers
cancel an issued bill with a reason; the number stays used. Bills, under More: what is owed first, then drafts, then
recent.

Pets booked together are billed together: Make the family bill puts each pet's stay and extras on one bill
(`billForFamily()`), with every pet of the family that is not a request or cancelled. A pet of a family is never billed
on its own (`WB053`); advances on any of the pets count against the family's bill (D27).

### E2. Bill for the parent. Built.

`/inv/{token}`: titled Tax invoice or Bill; the kennel's name, legal name, address, GSTIN or tax number and state; the
number and date; who is billed; place of supply under GST; each line with its SAC, quantity, price, discount and tax
(CGST and SGST, IGST, or the kennel's one tax); totals, round off, and the amount in words; what is paid and what is
due. While money is due and the bill carries a UPI ID: "Pay with UPI" on phones and a QR code everywhere, drawn on the
server (D17). "Print or save as PDF" prints a clean A4 page. A cancelled bill says so. Never marked paid by a tap: only
a payment recorded by the kennel.

### E3. Payments. Built.

On a bill: Record payment (amount defaults to what is due, method, date, reference such as the UPI transaction number);
owners and managers can record a refund. On a booking before its bill: Record advance. Issuing the bill takes in the
advances for that stay, and payments on a cancelled bill move to the next one for the same stay. Wagbook records
payments; it never moves money.

### E4. Expenses. Built.

`/app/more/expenses`, owners and managers only: amount, what it was for (common words offered, any word allowed), date,
how it was paid, shop or person, a note, and a photo or PDF of the receipt. The month's total and its total for each
kind of expense, then each expense with its receipt; one written down by mistake can be removed (the history of
changes keeps it). Receipt files are for owners and managers only, like the expenses.

### E5. Reports. Built.

`/app/more/reports`, owners and managers only, one month at a time:

- How full: nights sold, day boarding days, kennels used as a share of kennels available, the busiest day, and a bar
  for each day (with the same numbers in a table). Counts confirmed, current and finished stays; kennels are the ones
  in service today.
- Money in the month: billed (issued bills by bill date, cancelled ones left out, with the tax in them), received,
  refunded, spent, and received less spent; what is owed on bills today; the last twelve months side by side.
- Tax by rate from the month's issued bills (CGST, SGST and IGST under India GST).
- Extras that sell, on stays starting in the month.
- Download for a spreadsheet: bookings, bills, payments or expenses for up to 400 days, as a CSV file.

The numbers come from database functions (`report_occupancy`, `report_money`, `report_tax`, `report_extras`) that
refuse anyone who is not an owner or manager of the kennel.

### E6. History of changes. Built.

`/app/more/history`, owners and managers only: the audit log in words, newest first. "Booking changed" by whom and
when, with each field, named in the reader's language, as it was and as it is now; filter by kind of record and by
person; a link to the booking, bill or pet where there is one. Staff do not see it, Reports or Expenses under More.

---

## F. For parents

### F1. Stay page. Built.

`/s/{token}`. Kennel name, pet's name, status (waiting, confirmed, staying now, gone home), dates, usual drop-off and
pick-up times, updates from the kennel, a count of care done each day ("3 of 3 meals"), and a WhatsApp button to the
kennel. Times are on the kennel's clock.

It shows no prices, no staff notes, no medical details and no other pets. The link stops working when the booking is
cancelled and thirty days after check-out. The page is marked not to be indexed by search engines.

### F2. Booking confirmation message. Built.

Send confirmation on the booking page opens WhatsApp to the parent with `bookingConfirmedMessage()`: dates, nights (days
for day boarding), the estimated total and the stay link.

### F3. Photos. Built.

The stay page shows the pet's photo and each shared update's photos (the small copy, opening the full photo), through
links that last an hour. The page asks Storage with the stay's own token; the database lets that token open only that
stay's shared photos (D18, and `05`, "Photos on the stay page").

---

## G. Across everything

| Feature | State |
| --- | --- |
| Install to the phone's home screen (web app manifest, icons) | Built |
| Works offline or on a bad connection | Built: Today and Care open from the last copy on the phone; ticking a care task offline is saved and sent when the connection is back (D22). Everything else waits for the connection. |
| Languages other than English | Built: English, Hindi and Kannada (drafts until reviewed). Each person chooses their own under More; owners and managers choose the language of parents' pages and messages in Settings (D21). |
| Audit log of every change to bookings, money, settings and people | Built: History of changes (E6) |
| Daily reminders (arrivals tomorrow, vaccinations expiring) | Built: "Send me tomorrow's summary" on Today, for owners and managers, opens WhatsApp with tomorrow's arrivals, who goes home, and vaccinations running out within 30 days for pets staying. |
| Demo data for trying Wagbook | Built: `supabase/seed.sql`, for a local Supabase; `npm run setup:local` points the app at it (README, "Try it on your own computer"). No public demo (D28). |
| Two-step sign-in | Built (M9): any person can turn it on under More, Two-step sign-in (an authenticator app). Owners without it see a reminder. Once on, a session with only the password reaches nothing in the database. |
| Limits on how often strangers can post | Built (M9): sign in and two-step codes 20, intake form 10, joining 20, per address per ten minutes; posts over 1 MB refused outside photo uploads (`src/lib/rate-limit.ts`) |
| Scripts only from Wagbook itself | Built (M9): a Content-Security-Policy with a fresh nonce for every page (D23) |

## Words on screen

Buttons and messages use the words in [12-glossary.md](12-glossary.md). Error sentences come from the database (see
[reference/error-codes.md](reference/error-codes.md)) and `src/lib/errors.ts`. They say what went wrong and what to do,
in one or two short sentences, and never apologise.
