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
| Rider (D45) | Yes | Only their own delivery run for the day, at `/rider`: name, address, phone, packs and the note for the door of each stop. No prices, no medical notes, no other parents, no table at all. |
| Parent | Never | Opens links sent to them: the intake form, their pet's stay page, their bill, their own booking link. Orders food from the kennel's food page. |

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
/app/more             Menu (grouped: Every day, Money and records,   signed in
                      The team, Set up, Looking after Wagbook),
                      account, switch kennel, sign out
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
/app/kitchen          Cook plan, shopping list, batches, packing     signed in (kitchen on)
/app/kitchen/stock    Stock, purchases, waste, stock takes, suppliers signed in (kitchen on)
/app/kitchen/recipes  Recipes, versions, rotation, cost per kilo     signed in (kitchen on)
/app/kitchen/batches/{id}  One batch and who received it           signed in (kitchen on)
/app/kitchen/labels   Pack labels to print for a day                 signed in (kitchen on)
/app/kitchen/settings Portions, packs, cut-off, food prices          signed in (kitchen on)
/app/food             Food for homes: orders, deliveries, subscriptions  signed in (delivery on)
/app/food/new         Start a subscription, or a one-off order       signed in (delivery on)
/app/food/subscriptions/{id}  One subscription, its deliveries and bills  signed in (delivery on)
/app/food/runs        Delivery runs for a day                        signed in (delivery on)
/app/food/orders      Orders from the website and parents' requests  signed in (delivery on)
/app/appointments     Appointments for a day, a column per place     signed in (appointments on)
/app/appointments/new Book an appointment: pet, service, free times  signed in (appointments on)
/app/appointments/{id}  One appointment: confirm, done, add-ons, bill  signed in (appointments on)
/app/more/appointments  Places, services, prices by size and coat, packages  signed in (appointments on)
/app/more/cancellation  Weekend days, credit months, cancellation rules  signed in
/app/more/health      Health rules at the door                       signed in
/app/more/rota        The week's rota, shifts, who lives on site     signed in (rota on)
/app/more/leave       Ask for leave; owners and managers answer      signed in (rota on)
/app/more/attendance  Clocking in and out, the month's sheet, CSV    signed in (rota on)
/app/more/password    Change one's own password                      signed in
/app/more/import      Bring in parents and pets from a spreadsheet   owners and managers
/app/more/photos      Photos and space, the photo archive            owners and managers
/app/more/problems    Problems and overnight jobs                    owners and managers
/login/forgot         Ask for a link to choose a new password        public
/login/new-password   Choose the new password, from the emailed link signed in by the link
/auth/google          Continue with Google (when set up)             public
/api/health           For an uptime service                          public
/book/{slug}          A kennel's booking form for new parents        public
/rider                A rider's own run for today                    riders (D45)
/f/{slug}             A kennel's food order page                     public
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
land on Kennels with a welcome note asking them to add kennels. A person can own at most ten kennels (`WB012`, D55). An owner adds another from More, **Add another site** (L21).

### A3. Add kennels. Built.

Add one kennel with any name ("Garden suite"), at the end of the list, or a numbered row in one go: prefix `K`, how
many, first number, gives `K01` to `K60`. Repeating a row never duplicates. Each kennel's Change renames it and sets
its position in the list, which is also the order the care round walks. Two kennels cannot share a name. A kennel can
be taken out of service and put back, from today or the day it happened (M44); the kennel's Change also puts right the
day its present state began, for a kennel that was there before Wagbook knew. The number of kennels in service is the
kennel's capacity. Each change is kept (`kennel_service`), so a past day is measured against the kennels there that day
(`WB230`: never after today; `WB231`: never before the last change). Owners and managers (M12).

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
boarding and a shared kennel price for each (the second pet of one parent in one kennel; empty means the usual price), UPI ID and payee name, tax (off, India GST, or one tax at one rate; GSTIN, state, usual rate, legal name, invoice
prefix (not CN, which credit notes use), whether prices include tax, and a rate and SAC code for boarding and for day
boarding, D35), intake form (on or off, consent wording). Staff can look but not save. Solo play
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
The parent's own numbers (mobile and another number) are changed by owners and managers only (`WB002`,
`clients_guard_phone`); staff see a line saying so instead of the boxes, and still add new parents with their numbers
(D33). **Bills**: "English only" (the default), or "English and हिन्दी" or "English and ಕನ್ನಡ" for a parent who asks
(D31, E2). For owners and managers, "What we hold about them": download their details; owners can also erase them (B8).

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

- **Download their details and files** gives one ZIP file (M44): `parent.json` (`export_client`) with the parent and
  their consent, their addresses, each pet with its vaccinations, weights, own routine and incidents, every stay with
  its extras, updates, care tasks and play, bills with their lines, payments, the intake forms they sent, and the
  storage paths of their files; and the files themselves (pet photos, certificates, photos from stays and deliveries)
  under `files/` at those paths. The small copy of each photo is left out; a file that could not be read is listed in
  `files_not_included`.
- **Erase their details**, after ticking "I understand that this cannot be undone" (`erase_client`): empties every
  personal detail on the parent (the parent is then shown as "Erased" where a past stay or bill names them) and the
  notes on their stays; deletes their addresses, the updates sent to them (with their photos), their intake forms (with their files),
  draft bills, and the vaccination certificate files, because a card carries the owner's name and address; and takes
  the stays' notes out of the history of changes. **The pets stay** (D30): their details, photo, vaccinations (without
  the card), routines, incidents, care tasks and play, hidden from lists. Issued and cancelled bills stay, with the
  buyer printed on them, and so do payments and the stays' dates and prices, because tax law requires the kennel to
  keep them. Refused while a pet is in house (`WB071`) or a stay is still to come (`WB072`). The erasure itself is in
  the history of changes. The phone number is free for a new record afterwards.

### B10. What the kennel offers. Built (M25, D44).

Settings, **What this kennel offers**: three switches, all off for a new kennel. Boarding is always on.

| Switch | Turns on |
| --- | --- |
| Appointments: grooming, swimming, training and parties | Appointments and Appointment setup under More, appointments on Today, on a stay and on the pet page (grooming card, courses), and the skills groomer, trainer and swim supervisor (I1 to I7) |
| A kitchen that cooks fresh food | Kitchen under More (stock, recipes, the cook plan, batches, labels, kitchen settings), Food on the pet page, boarders' food on the care round, the kitchen on Today, food reports, and the skill cook (H1 to H5, H8) |
| Food delivered to parents' homes | Parents' addresses, Areas you serve and Food for homes under More (subscriptions, orders, runs), the address and PIN code on the intake form, the food order page, food on parents' own links, the role and skill rider (H4, H6, H7) |

Delivery needs the kitchen: the database refuses delivery without it (`organizations_delivery_needs_kitchen`). With
every switch off, Wagbook looks as it did before M25.

### B11. A parent's addresses. Built (M25).

On the parent page, while the kennel delivers: **Addresses**, each Home, Work or Other, with the house or flat number,
building and street, the area, a PIN code (six digits in India), an optional map link (https only) and a note for
whoever delivers. Each says **We deliver here: Indiranagar, ₹50 a delivery** when its PIN code is in the areas served,
or **Not in the areas you serve**. Anyone adds an address; only owners and managers change one, because it is
personal data like a phone number (D33); owners remove one. The intake form asks for the address, area and PIN code
when the kennel delivers, and accepting the form of a new parent makes it their home address. Addresses are in the
parent's export, move when parents are merged, and are deleted when the parent is erased.

### B12. Areas you serve. Built (M25).

More, **Areas you serve** (shown while the kennel delivers): one row a PIN code, with the area's name and an optional
delivery charge (empty is free). Owners and managers add and change them; owners remove them. A PIN code appears once
(`service_areas_org_id_postal_code_key`). Delivery runs (M31) and pick-ups from home (M39) use them.

### B13. Weights. Built (M25).

On the pet page, **Weight**: the latest weight and its date, how it changed since the weighing before ("Down 1.3 kg
since 14 Oct 2026"), the body condition score if one was given (1 very thin to 9 very heavy), and the target weight.
**Write down a weight** takes the kilos (34.5 or 34,5), the day (today or earlier) and an optional score and note;
anyone may write one. The list of weights opens below; owners remove one written by mistake, and managers may correct
one through the database. Weights are kept in grams. The pet's weight on lists is always the latest weighing: the
database keeps it, and nothing else can write it. The weight given on the intake form, or when adding a pet, is its
first weighing. Food portions (M28) are worked out from the latest weight and the target.

### B14. Skills. Built (M25).

On People, owners and managers mark what each person can be given to do: cook, groomer, trainer, swim supervisor or
rider, showing only the skills for what the kennel offers. Skills choose who is offered a job (the cook plan, the
delivery run, an appointment); they never change what a person can see, which stays with their role. Only owners set
an owner's skills.

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

Two tabs: Current and upcoming; Past. A search box finds bookings by the pet's name or the parent's name or phone
number, as on Pets, in the tab shown (up to 100 matches, M67). Past shows 100 at a time, newest first, with Older
bookings and Newer bookings. Each row: kennel tag, pet, status (a request says "Request"), "Family" when booked
with other pets, any peak period it touches, parent, dates, nights or days, price. A row opens the booking page, where
cancelling happens. A Calendar button opens C5.

### C3. Booking page. Built.

`/app/bookings/{id}`. The pet, kennel, status, dates, peak periods it touches and the pet's warning flags, then:

- **Next**: for a request, Confirm booking, and Put on the waiting list or Take off the waiting list (C6b). For a
  confirmed booking, the check-in checklist (D6) and Did not arrive. For a pet in house, Check out, Send update, and
  Extend to today when it has stayed past its check-out date. A pet going home before its booked end gets two buttons
  instead of Check out (D40): "Check out, bill to today" ends the stay today (a boarding stay keeps its first night),
  so the bill is for the days stayed; "Check out, bill as booked" leaves the dates alone. A no-refund peak period is
  named beside them.
- **Gone home** (M66, D56): once a pet is checked out, the **Bill** section comes first, with Make bill (or the bill
  made). On the day of the check-out, while no bill for the stay is issued, **Undo check-out** puts a pet checked out by
  mistake back in house: its kennel is held again (refused if another pet took it), comes off the list to clean, and
  the rest of today's care is back on Care. The dates stay as they are; a stay shortened at check-out is put right
  under Change this booking.
- **Parent's stay page**: the link, Copy link, Open it, and Send confirmation (WhatsApp, with dates, nights and the
  estimated total).
- **Booked together**: the other pets of a family booking.
- **What it costs**: the stay and its extras as lines with an estimated total (tax included where the kennel charges
  it); add an extra from the price list or a one-off item; owners can remove one, after a second tap. The stay is
  priced by the database (`stay_charges`, D32): one line, or "Boarding, sharing a kennel" and "Boarding, kennel to
  itself" for a pet at the shared price, or "Day boarding" then "Boarding" for a stay that turned into boarding.
- **Change this booking**: dates, kennel (free ones offered), expected drop-off and pick-up times, belongings, notes;
  price per night or day, a discount, and boarding or day boarding (the kind of stay) for owners and managers only
  (`WB022` for staff). Changing the kind applies to the whole stay and leaves the price as typed, with a hint to check
  it; the kennel and pet overlap rules apply to the new kind at once. Owners and managers also see the price with the
  kennel to itself (a pet at the shared price) and the price per day before the first night (a stay that turned into
  boarding).
- **Staying overnight** (owners and managers, on day boarding that is still open): first night (today by default),
  check-out date and price per night (the usual boarding price by default). Change to boarding keeps the days before
  the first night as day boarding at their own price and makes the nights from it boarding (`boarding_from`,
  `day_rate_minor`, D32). A first night on the first day turns the whole stay into boarding. The booking then says
  "Day boarding until 15 Apr, then staying nights from 16 Apr." The database refuses a first night outside the stay
  (`bookings_boarding_from_inside_stay`).
- **The pet's own routines** (D2) and what the parent said about food, health, allergies and behaviour.
- **Cancel**, with a reason (required), and a warning when the stay touches a no-refund peak period. When an advance was
  paid it says so; after cancelling, the page lists what was paid and refunded, and owners and managers record a refund
  of the advance there, never more than was paid (`WB122`, D40). A stay with an issued bill is credited on its bill.
- **Updates**: owners can take a photo posted by mistake off an update, after a second tap (D29). The file is deleted
  and the parent's stay page stops showing it; the database refuses anyone else (`WB081`).

After a step that changes the status, the page comes back saying what happened. The bill is M4.

### C4. Family bookings. Built.

In New booking, choosing a pet lists the other pets of the same parent with a tick box each. Ticked pets are booked in
the same statement (all or none), share a `group_id`, and show each other on the booking page. The database refuses a
group that mixes parents (`WB024`), and a family stays as it was booked (`WB026`).

With two pets ticked, Kennels offers "A kennel each" (the first pet gets the chosen kennel, the other gets one at
check-in) or "One kennel together": then a kennel must be chosen, only kennels with room for both are offered, both
pets get it, and the second is booked at the shared kennel price from Settings (when one is set), carrying the usual
price for any night it has the kennel to itself (`alone_rate_minor`, D32): when its sibling leaves early (checked out
before its date, or its dates shortened), comes late or moves kennel, those nights are billed at the usual price. Staff
can book the shared price only with the usual price for nights alone (`WB023`). A kennel holds two
pets of one parent at most, never pets of different parents (D27); Today, the booking page and the calendar offer and
label a sibling's kennel ("K05, with Coco"), and the booking page says "Shares K05 with Coco." The calendar shows both in
the kennel's square, and its top row counts kennels in use, with the number of pets when siblings share.

The family pays on one bill (E1).

### C4b. Day boarding regulars. Built (M18, D37).

**Repeat.** On New booking, day boarding for one pet can repeat on chosen weekdays until a date (70 days at most). Each
day is its own booking, sharing a series (`series_id`); the booking page says "Repeats: 7 days in all, 5 still to come"
and offers Cancel the rest of the series (this day and every later one not started, with a reason).

**Packs.** Extras lists day boarding packs (name, days, price, how many days it lasts, and a tax rate and code when the
kennel charges tax). On the parent page, owners and managers sell one with a start date: the pack and a draft bill for
it, opened to issue. The parent page lists each pack with its days left. New booking pays day boarding from the
parent's packs when ticked (on by default; the pack ending soonest first), at ₹0 on the stay, and the booking page
offers "Pay from the pack" for a day not yet on one. The database keeps a pack within its days, dates and parent
(`WB110` to `WB112`); a cancelled day gives its day back; a request holds none until confirmed.

**Billed by the month (M23, D41).** The days of a series are billed together, a calendar month at a time: Make the bill
for October 2027 on any day's booking page builds one bill for that month's days that are not requests or cancelled,
one line for each price ("Day boarding: Tofu, 12 days in October 2027 (2, 4, 7 ... Oct)") and each day's extras with
its date. Days paid from a pack are a line at ₹0. Advances paid on any day of the month count against it. A day of a
series is never billed on its own (`WB055`), a month has one live bill
(`invoices_one_live_per_series_month`), and a day on an issued month's bill cannot move into another month (`WB057`).

### C5. Calendar. Built.

`/app/calendar`. Kennels down the side, fourteen days across, Earlier and Later to move, scrolling sideways on a phone
with the kennel column fixed. A row of "in house of kennels" per day from `occupancy_by_day()`, red when full. Each cell
shows the pet holding that kennel that night (green when in house, grey when booked, red when still here after its
check-out date) and opens the booking. An empty cell from today on opens New booking for that kennel and day. Pets with
no kennel yet are counted in a last row. Requests and the waiting list (M22) follow under "Requests and waiting list
(no space held)": one row each, the pet's name and "Request" or "Waiting", and its days in yellow with a dashed edge,
opening the request. The waiting list comes first. Up to 30 are drawn; a note says when there are more.

### C6. Requests. Built.

Save as request in New booking. A request holds no space and is not counted for capacity or kennels. Confirm booking on
its page turns it into a confirmed booking, and only then do the database's space rules apply.

### C6b. Waiting list. Built (M21, D42).

A request can wait for a kennel: Add to the waiting list in New booking, or Put on the waiting list on a request's
page. The database stamps when it joined (its place in line, which nobody can move), and it leaves the list when it is
confirmed or cancelled (`bookings_stamp_status`). The request's page says "Number 2 on the waiting list" and whether a
kennel is free for it now; the bookings list and the calendar mark it. When a kennel frees up for a waiting stay on
every one of its days (`waiting_list()`), Today lists it under "A kennel is free for the waiting list", first in line
first, with Tell the parent (WhatsApp, with the dates) and Confirm booking. Two waiting for the last kennel may both
show; whoever is confirmed second is refused as any booking would be (`WB020`).

### C7. Peak periods. Built.

More, then Peak periods: add (name, first and last day, no refund, shorter play sessions) and remove, owners and
managers. A stay touches a period when any night it holds a kennel (any day, for day boarding) falls inside it
(`peaksTouching()`). Such bookings carry a badge on Bookings and on the booking page, and cancelling one marked no
refund shows a warning. Prices never change.

### C8. Rate card and extras. Built.

Settings edits the two usual prices, and their tax rate and SAC code. More, then Extras: add an extra (each time or by
the hour), change its price (and, when the kennel charges tax, its rate and SAC code, D35), take it off the list; owners
and managers. On the booking page anyone adds an extra at its listed price, or a one-off item
with its own price (a vet bill paid for the parent). Changing what an extra costs is for owners and managers
(`WB025`); removing one from a booking is for owners (the delete policy, D29).

---

## D. The day

### D1. Today. Built.

The date, "N in house of M kennels, N to arrive", today's care counts ("Meals 2 of 12", medicines in red until done)
linking to the Care screen, incidents to deal with, then three lists, and only after them everything else (forms from
parents, parents' requests, the waiting list, flowers, kennels to clean, checklists, supplies, appointments, the kitchen,
reminders to send). The lists come first so the gate's work is never a long scroll away (M67). Pet names open the
booking.

- **Arriving**: confirmed bookings due today or earlier (so yesterday's no-show is still visible, marked "Was due").
  Each has a kennel picker offering only kennels free for the whole stay, and Check in.
- **Going home today** (M67, only when there is one): checked-in pets due out today or already past their check-out
  date, with the same buttons as In house and a line saying what the parent owes, which opens the bill (or the booking):
  "Owes ₹3,600 on bill WB/26-27/0001", "Bill WB/26-27/0001 is paid", "Bill not issued yet: ₹2,400 to pay", or, with no
  bill, "No bill yet: about ₹700 to pay. ₹500 paid ahead is taken off", worked out as Make bill would
  (`owedAtCheckOut()`, `owedFor()`). A family booked together shows its family's bill; a day of a series says it is on
  the month's bill. The line loads on its own, so Today is not held up.
- **In house**: the other checked-in pets, with "Leaves today" or "Was due to leave" badges, "Send update" (opens WhatsApp to the
  parent with a message and the stay link) and Check out. Check out is the main button on the day the pet leaves; a pet
  booked for longer gets "Check out early", which opens its booking to choose how to bill it (D40). A pet
  still here after its check-out date also gets Extend to today, which moves the check-out date to today, or says
  which pet the kennel is promised to and what to do instead.
- **A kennel is free for the waiting list** (above the care counts, only when there is one): see C6b.

Pet flags (for example "bite history" or "escape risk") show in red on every row.

### D1b. Reminders to send. Built (M16, D39).

On Today, "To send": a vaccination card to ask for (a confirmed stay within a week with no record, or one that lapses
before the pet goes home), see you tomorrow (with the usual drop-off time), going home tomorrow (with the pick-up
time), and bills issued three or more days ago with money owed (with the bill's link). Each says the pet or bill, the
parent, and Send, which opens WhatsApp with the message typed in the kennel's language for parents and then asks "Did the
message go?": **Yes, it went** takes it off the list (an unpaid bill comes back three days later), **Not yet** leaves it
(M44). Today also says how many requests from parents are waiting.

### D2. Daily care tasks. Built.

`care_items` are routines: house routines for every pet (meals at set times, cleaning) and routines for one pet (a
tablet at 8 pm). More, then Daily routines: the house routines, a starter set (breakfast, a kennel clean, lunch, dinner),
add and stop; owners and managers. A pet's own routines are added and stopped from its booking page by anyone.

`generate_care_tasks(org, date)` turns routines into the day's `care_tasks` for every pet checked in, from its first day
until it is checked out (so an overstaying pet is still fed). Today and the Care screen call it when opened; it is safe
to repeat. When a pet is checked out, its tasks and play sessions still to do after that moment are removed by the
database (`bookings_end_care_at_check_out`, M66, D56), so Care, Play, Today's counts and the parent's stay page stop
asking for them; tasks due before it left stay as they were.

`/app/care`: today's tasks grouped by time; within a time, medicines first, then kennel by kennel in kennel order. A pending
medicine has a red edge and badge and is never folded away. One tap on Done; a second tap does nothing (the database keeps
the first who and when). Skip opens a note; a medicine cannot be skipped without one (constraint
`care_tasks_skipped_medication_needs_note`). Undo puts a task back. Filters: Still to do, and by kind.

Proof photos on care tasks are not built; the field meant for them was removed (M13). Planned again in M54.

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

Make bill, on the booking page (and offered after check-out), builds a draft from the booking: the stay as the
database prices it (`stay_charges`: at its booked rate, or split into nights shared and nights alone, or days and then
nights, D32), with its discount on the largest line and its tax, then each extra (`billForBooking()`, `stayLines()`,
`computeInvoice()`), saved in one go
(`save_invoice_draft`). A stay has one live bill; pressing Make bill again brings a draft back in line with the booking
or opens the issued bill. Owners and managers can change, add and remove lines of a draft. Issue checks every sum
(`issue_invoice`), gives the next number for the financial year and freezes it; staff can issue only a bill exactly as
its booking prices it (`WB050`). Send bill opens WhatsApp with `billMessage()` and the bill's link. Owners and managers
cancel an issued bill with a reason; the number stays used. A tax invoice from an earlier month, or a bill with a credit
note, is not cancelled but credited (`WB095`, `WB096`). Bills, under More: what is owed first (every unpaid bill,
however old, M66), then drafts, then recent.

**Credit notes (D34).** On an issued bill, owners and managers make a credit note: the whole bill (while nothing has
been credited) or part of it (an amount at one of the bill's tax rates), with a reason. It has its own number
(`CN/27-28/0001`), its tax worked out as on the bill, and never takes back more than is left (`WB092`). The bill page
lists its credit notes; what is owed drops by them, and below zero says how much was paid over, for a refund.

**When the stay changed (M20, D40).** An issued bill whose stays now come to less than it (a pet billed only to today,
dates shortened, a stay or a day cancelled) shows "The stay changed": what the stays now come to, and Credit ₹2,400 for
owners and managers (staff are told to ask one). The credit note is worked out on the server, never taken from the
form: for each tax rate on the bill, what it billed less what credit notes took back less what the stays now come to,
under the bill's own tax treatment. A stay that now comes to nothing, on a bill not yet credited, is credited with the
bill's own lines. Then the bill says how much was paid over, and the refund amount is filled in.

Pets booked together are billed together: Make the family bill puts each pet's stay and extras on one bill
(`billForFamily()`), with every pet of the family that is not a request or cancelled. A pet of a family is never billed
on its own (`WB053`); advances on any of the pets count against the family's bill (D27).

### E2. Bill for the parent. Built.

`/inv/{token}`: in English (D31). For a parent who asked for their language (Bills, on the parent page), every heading is
followed by its Hindi or Kannada in brackets, "Tax invoice (टैक्स इनवॉइस)"; lines with amounts stay in English only.
Titled Tax invoice or Bill; the kennel's name, legal name, address, GSTIN or tax number and state; the
number and date; who is billed; place of supply under GST; each line with its SAC, quantity, price, discount and tax
(CGST and SGST, IGST, or the kennel's one tax); totals, round off, and the amount in words; what is paid and what is
due. While money is due and the bill carries a UPI ID: "Pay with UPI" on phones and a QR code everywhere, drawn on the
server (D17). "Print or save as PDF" prints a clean A4 page. A cancelled bill says so. Never marked paid by a tap: only
a payment recorded by the kennel. The bill's credit notes are listed under it, and each opens as its own printable
credit note (`?cn=`): number, date, the bill it is against, why, its lines and total.

### E3. Payments. Built.

On a bill: Record payment (amount defaults to what is due, method, date, reference such as the UPI transaction number);
owners and managers can record a refund. On a booking before its bill: Record advance. Issuing the bill takes in the
advances for that stay, and payments on a cancelled bill move to the next one for the same stay. Wagbook records
payments; it never moves money.

A refund (D40) gives back only what the parent paid and is not owed: on a bill, what was paid over the bill less its
credit notes (`WB121`, so a stay that got cheaper is credited first and the tax return sees why); on a stay with no
bill, the advance paid for it (`WB122`); and it always names a bill or a stay (`WB120`).

### E4. Expenses. Built.

`/app/more/expenses`, owners and managers only: amount, what it was for (common words offered, any word allowed), date,
how it was paid, shop or person, a note, and a photo or PDF of the receipt. The month's total and its total for each
kind of expense, then each expense with its receipt; one written down by mistake can be removed (the history of
changes keeps it). Receipt files are for owners and managers only, like the expenses.

### E5. Reports. Built.

`/app/more/reports`, owners and managers only, one month at a time:

- How full: nights sold, day boarding days, kennels used as a share of kennels available, the busiest day, and a bar
  for each day (with the same numbers in a table). Counts confirmed, current and finished stays; kennels are the ones
  in service on each day (M44, `kennels_in_service()`).
- Money in the month: billed (issued bills by bill date, less credit notes by their own date, cancelled bills left
  out, with the tax in them), credit notes, received,
  refunded, spent, and received less spent; what is owed on bills today; the last twelve months side by side.
- Tax by rate from the month's issued bills, less the month's credit notes (CGST, SGST and IGST under India GST).
- Extras that sell, on stays starting in the month.
- Download for a spreadsheet: bookings, bills (with credit notes, at minus, and the bill each is against), payments or
  expenses for up to 400 days, as a CSV file.

The numbers come from database functions (`report_occupancy`, `report_money`, `report_tax`, `report_extras`) that
refuse anyone who is not an owner or manager of the kennel.

### E5b. GSTR-1 files. Built (M19, D38).

On Reports, for a GST-registered kennel: the month's bills and credit notes as the GST offline tool's CSV files, one
link each: b2b, b2cl, b2cs, cdnr, cdnur, hsn and docs. Owners and managers. Check the columns against the tool before
the first upload.

### E6. History of changes. Built.

`/app/more/history`, owners and managers only: the audit log in words, newest first. "Booking changed" by whom and
when, with each field, named in the reader's language, as it was and as it is now; filter by kind of record and by
person; a link to the booking, bill or pet where there is one. Staff do not see it, Reports or Expenses under More.

---

## F. For parents

### F0. Asking for a stay. Built (M17, D36).

`/b/{token}`, a known parent's own link, sent from their page (Send on WhatsApp, or Copy; Make a new link ends the old
one). In the kennel's language for parents: hello and the usual times, their pets to tick, the kind of stay (when both
have a usual price), dates, a note, Send request; then "Sent. The kennel will confirm on WhatsApp." It lists their
stays already asked for or booked. Each pet asked for becomes a request at the usual price, which holds no kennel until
staff confirm it. Settings can turn requests off; the page then says to message the kennel.

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

## H. The kitchen and food (Phase 1, M26 to M33, D44)

All of it shows only while the kennel offers a kitchen (B10); delivery, subscriptions, runs and the food order page
also need food delivery on. A kennel with both off sees none of it. Grams, millilitres, pieces and paise throughout;
never a decimal in the database.

### H1. Stock. Built (M26).

**Kitchen, Stock**: each item (name, counted in grams, millilitres or pieces, kind, usual supplier, a low level, and
"a dog must never eat this") with what is in stock, a **Low** badge at or below its level, and **Use soon**: what is
left of each purchase that passes its use-by date in the next two days, oldest first (stock is taken from the soonest
to go off, `lotsLeft()`). **Suppliers** with phone and what they supply.

Stock is never edited: it is the sum of its movements (`stock_moves`), and the database refuses a movement that takes an
item below nothing (`WB130`). **Bought in** (owners and managers): quantity typed as 10 kg, 750 g, 2 l or 12, the cost,
the day, a use-by date, the supplier's bill number and a photo of the bill, and "Also write it down as an expense"
(ticked by default), which records the same money as an expense (E4) in the same step (`record_purchase`). Costs and
bill photos are for owners and managers only (`stock_costs`, the photo under the expenses folder). **Thrown away**
(anyone): quantity and a reason (spoiled, past its date, dropped, other). **Stock take** (anyone): the counted quantity;
the database records the difference ("Rice counted: -100 g difference"). Used in cooking is written only by a batch
(H5). Nobody changes or deletes a movement, not even an owner.

### H2. Recipes. Built (M27).

**Kitchen, Recipes**: each recipe with its place in the rotation, its current version and, for owners and managers,
what a kilo costs from each ingredient's latest purchase price ("No cost yet" while an ingredient has no price). A
recipe's page shows what goes into a kilo of cooked food, raw, what it is good for (parents read this), kcal and
protein a kilo, who signed it off (a veterinary nutritionist) and when, and when it was last lab tested.

**Make a new version** (owners and managers, `save_recipe_version`): changing a recipe always makes a new version; a
version and its ingredients never change afterwards (`WB141`). Batches and deliveries keep the version they were made
from. Items marked "never in a recipe" are not offered, and the database refuses them (`WB140`), and refuses marking
an item so while a recipe in use has it. **Rotation and keeping**: the place in the rotation (one recipe per place),
how many days it keeps after cooking (a batch's use-by date), and how to store it (printed on labels). A recipe that
has been cooked is retired, never deleted (`WB144`).

**The rotation.** Each delivery of a subscription takes the next recipe in order (the n-th delivery the n-th place,
round again after the last), so four recipes and two deliveries a week repeat every two weeks. Boarders eat the
rotation's recipes by day: its recipes share fourteen days in turn (`boarderRecipeIndex()`).

### H3. Food prices and portions. Built (M28).

**Kitchen settings**, for owners and managers: **Food prices**: a trial (a fixed price and weight, once per pet),
subscription food per kilo, one-off food per kilo, and items made to order per piece (a birthday cake), each with its
own tax rate and HSN code (D35; pet food is goods, question 13 in `06`). **Portions**: a day's food as a share of body
weight by size (3%, 2.5% and 2% for small, medium and large dogs, small up to 10 kg and medium up to 25 kg by default),
a topper as a share of the day's food (a third), and how much losing or gaining weight changes it (10%). **Packing and
deliveries**: grams in a pack (250), the cut-off (24 hours before a delivery's slot), the discount for paying a month
ahead, the margin the cook plan adds (10%), the window for reporting a problem (24 hours), and whether the food order
page takes orders.

**The worked example.** A 20 kg dog keeping its weight is medium: 20,000 g x 2.5% is **500 g a day** on a full meal,
and a third of that, **167 g**, as a topper. To lose weight, 450 g; to gain, 550 g. Each step rounds to the nearest
gram (`portionGrams()`, unit tested).

**On the pet page, Food**: the portion and how it was worked out ("624 g a day: large dog, 2% of 31.2 kg"), or set by
hand with a note (owners and managers only, `WB146`); the plan and goal; what it eats while boarding: fresh food from the
kitchen (the default), a kibble the parent names with grams a day, or food the parent sends; foods to avoid; and its
subscriptions. A pet on the kitchen's food is due a look at its portion a week after it starts: the pet page and Today
say so until someone marks it looked at. The care round shows each boarder's food on its meal tasks.

### H4. Subscriptions and orders. Built (M29).

**Food for homes** (More): orders and requests waiting, the next week's deliveries, and every subscription.
**Start a subscription** for a pet: the food, plan, grams a day (the worked-out portion by default), delivery days (Tuesday
and Friday by default), a slot (morning from 8, afternoon from 1, evening from 6), the address (or collected at the
kennel), the first day, paid a week or a month ahead, and where the customer came from.

Deliveries are made ahead (`plan_subscription`, three weeks each time the food screens open): one on each delivery day,
covering the days until the next, rounded up to whole packs (500 g a day, Tuesday to Friday, is 1.5 kg in six packs),
with the rotation's next recipe. Grams, recipe, price, tax and the area's delivery charge are copied onto each delivery
when it is made, so changing the rate card never changes one already planned. One delivery per subscription per day.

**Change** grams, plan, days, slot, address or how it is paid; **pause** between two days or until resumed; **end** it
from a day with a reason. Changes close at the cut-off: deliveries still open to change are made again (cancelled and
kept when a bill has them, so the bill can be credited), and those past the cut-off go as they are. After the cut-off
staff cannot change a delivery; a manager can cancel it with a reason (`WB151`). A delivery that has been to the door is
never cancelled (`WB153`).

**One-off orders**: a trial (once per pet), food by the kilo, or an item made to order, for a day and an address.

**Bills**: "Make the bill for 3 Nov to 9 Nov" on the subscription (a week from Monday, or the calendar month), from its
deliveries: one line for each price in kilos, less the monthly discount when paid a month ahead, then the delivery
charges. Staff issue it only as the deliveries come to (`WB050`, checked against `food_bill_lines`); one live bill per
period, and no day on two (`WB155`). A one-off order has its own bill. A delivery cancelled after its bill is issued is
offered back on the bill's page as a credit note (D34, D40), and the bill's due feeds the unpaid reminders (D39).

**Today** lists trials handed over three to fourteen days ago whose parents have no subscription, with "Ask on
WhatsApp".

### H5. The cook plan and batches. Built (M30).

**Kitchen**, for a day (tomorrow by default): **What to cook**: for each recipe, the grams for that day's deliveries and
for the boarders on the kitchen's food (each boarder's grams a day, eating the rotation's recipe of the day), plus the
margin, rounded up to 100 g (`cookPlan()`). Boarders with no weight are named and left out. **Shopping list**: what those
recipes need less what is in stock, by supplier, each with "Send to Ali Meats" on WhatsApp.

**Record a batch**: recipe, cooked weight, packs, the day, the cook, and the day the boarders eat from it. It is
numbered by its day (`270314-2`), takes its use-by date from the recipe, and takes each ingredient out of stock by its
version and weight in the same step, refused as a whole when stock is short (`record_batch`). **Packing**: each delivery
ticked packed with the batch it was packed from: only a batch of its own recipe, cooked by its day and within its use-by
date (`WB160`, `WB161`). **Labels to print**: one label for each pack: pet, recipe, grams, batch, cooked on, use by, how to
store it, on A4. **A batch's page** answers who received it: every delivery packed from it, and the boarders on the
kitchen's food in house the day they ate from it (`batch_recipients`), with their parents' phones. Owners and managers
see what it cost, from its own version and that day's prices.

### H6. Delivery runs and riders. Built (M31, D45).

**Delivery runs**, for a day: start a run for a rider (a member with the role Rider or the skill Rider) and a slot, add
the day's deliveries to it, move stops up and down, open each stop's map, and open the whole route in Google Maps.

**Riders** are a fourth role with the least access of any (D45). A rider signs in to `/rider` and sees only their own runs
for today: each stop's name, address, phone, pet, packs and notes; Call, Map, "On the way" (a WhatsApp message from
their phone), and Delivered (with a photo at the door), Nobody home or Refused. No table is open to a rider; everything
comes through `my_runs()` and `rider_mark_stop()`, which check the run is theirs and today's. A rider opening the
kennel's screens is sent back to their run.

**Problems**: on the subscription, a delivery handed over can be reported damaged, late or wrong, with the parent's photo,
within the kennel's window (`WB174`). It is replaced (a new delivery at no charge) or refunded (a credit note and a refund
from the bill), or closed with nothing done.

### H7. Ordering food from the kennel's website. Built (M32).

`/f/{slug}`, a link the kennel puts on its own website: a trial or regular deliveries, the dog's name and weight (the
portion is worked out as they type: "About 300 g a day for a medium dog"), days and slot, address and PIN code ("We
deliver to Indiranagar", or "We do not deliver to that PIN code yet"), their name and phone, and consent. The page shows
what the first week costs; the database works it out again (`submit_food_order`), and that is what is asked: the UPI QR
code and link, then **I have paid**. A PIN code not served is kept as waiting for its area, with nothing to pay; staff see
how many wait in each PIN code.

**Orders from the website** (Food for homes): staff check the money has arrived and **Confirm**, which makes or finds the
parent by phone, the dog by name (with its weight as the first weighing), the address, and the trial delivery or the
subscription with its first two weeks of deliveries (`confirm_food_order`). Or **Decline**.

**A known parent's own link** (F0) shows their dog's subscriptions with the next deliveries, and asks to pause deliveries,
skip one, or have extra food on a day. Each arrives as a request; Confirm makes the change.

### H8. Food reports. Built (M33).

**Reports**, while the kennel has a kitchen, for the month: active subscriptions, started and ended; trials and how many
then subscribed; deliveries, kilos delivered and a day, and food sold; kilos cooked, the cooking cost and the cost a
kilo (from each batch's own version and that day's prices); what was thrown away and its cost; deliveries by rider by
day; and where customers came from. Downloads as CSV: food month by month for the year, and deliveries by rider.
Owners and managers only, refused in the database (`WB060`, as D20).

## I. Appointments (Phase 2, M34 to M37, D46)

All of it shows only while the kennel offers appointments (B10). A kennel with it off sees none of it. Times are
`timestamptz`; the day an appointment is on is the kennel's (its time zone). Money in paise, lengths in whole minutes.

### I1. Places and services. Built (M34).

**More, Appointment setup**, for owners and managers (staff read it). **Places**: things that take one booking at a time
(the pool, a grooming table, a training ground, the party yard), each with its hours (09:00 to 18:00 by default) and in
service or not. **Services**: name, kind (grooming, swimming, training, party, other), how long it takes, the place it
uses, the minutes to clean up after it (the place stays taken), the price, the tax rate and code (D35), the skill it
needs (groomer, trainer, swim supervisor), whether vaccinations are checked (on by default), and for a party the most
people. A price is **fixed**, **by size** (small, medium, large from the pet's latest weight, using the kitchen's size
bands), **by coat** (I5), or **on quote**. An **add-on** is a service priced on top of another (nails with a bath,
decorations for a party): it takes no place and no time of its own.

### I2. Booking an appointment. Built (M34).

**Appointments** (More, and Today): **Book an appointment** for a pet staying in or visiting for the day. Find the pet,
choose the service, the day, the place (the service's own by default) and the person (people with the service's skill
first). Wagbook offers the free times, every 30 minutes inside the place's hours: those where the place (with its
clean-up), the pet and the person are all free, and not in the past. A pet in the kennel that day is booked on its stay.

States: **requested** (written down, holds nothing), **confirmed** (holds the place, the pet and the person), **done**,
**no-show** and **cancelled** with a reason (it stays cancelled). The database refuses two appointments in one place at
once, clean-up included (`appointments_no_place_overlap`), one pet in two places (`appointments_no_pet_overlap`) and one
person in two places (`appointments_no_person_overlap`); a time outside the place's hours (`WB192`); a place out of
service (`WB191`); a boarder's appointment on a day that is not of its stay (`WB193`); and **done** for a service that
checks vaccinations until someone has seen the certificates, on the appointment or at the stay's check-in (`WB194`).

**The price** is worked out by the database when booked (`appointment_price()`) and copied onto the appointment, with its
tax rate and code; staff cannot change it (`WB022`, D15). A service on quote is booked by staff as a request, and an
owner or manager sets the price before it is confirmed (`WB199`).

### I3. The day. Built (M34).

**Today** lists the day's appointments: time, pet, service, place, person and state. **Appointments** shows a day with
each place as a column and the hours down the side, at 360 pixels wide (the columns scroll inside their box, never the
page), with the day before and after, and a list of the day under it. An appointment's page has Confirm, Done, Did not
come, Cancel with a reason, add-ons, the price (owners and managers change it), notes for whoever does it, and its bill.

### I4. Bills for appointments. Built (M34).

A boarder's appointment is a line on its stay's bill ("Full groom for Biscuit (14 Nov, 10:00)"), with its add-ons,
when it is confirmed, done or a no-show; not when requested or cancelled. A visitor's appointment has a bill of its own
(`invoices.appointment_id`); a boarder's never does (`WB200`). Staff issue either only as the database prices it
(`WB050`, `invoice_expected_lines()`). An appointment cancelled after its bill went out is offered back as a credit note,
as a stay is (D34, D40).

### I5. Grooming. Built (M35).

**The grooming menu**: grooming services (bath and dry, full groom, haircut, nails, ears, de-shedding, tick and flea
bath, teeth) priced **by coat**: a price for each coat type (short, double, long, curly, wire), with a price for a named
breed overriding it, and the service's own price when neither is set. Add-ons go on top.

**On the pet page, Grooming**: the coat, the usual cut, products to use or avoid, skin conditions, how the pet behaves on
the table, how often it should be groomed, and the last groom. A pet due for a groom again (its last groom plus its
weeks) is on Today's list to send (D39), once for each groom.

**Before and after photos**: a boarder's groom has "Send before and after photos", which writes an update on its stay
(F3), so the parent sees them on the stay page. **Groom before going home** on a stay books the groom on its last day, at
the latest free time that finishes by the pick-up time (the stay's expected departure, or the kennel's check-out time).

### I6. Swimming, training and parties. Built (M36).

**Swimming**: one dog at a time (the place's rule, I2). Marking a swim done asks whether the dog wore a life jacket and
who supervised; the database refuses a swim done without both (`WB195`).

**Training courses**: owners and managers sell a course of sessions for a pet (a training service, so many sessions, the
price the trainer quoted), on a bill of its own, as a day boarding pack is (D37). Each session booked from the course
costs nothing on its own, and the course never gives more sessions than were bought (`WB201`). After a session, notes and
homework, and **Send to the parent** on WhatsApp.

**Birthday parties**: the party yard for a set time, the birthday pet and one guest dog (a pet of the kennel, so its
parent and vaccinations are recorded), the number of people (never more than the service allows, `WB197`), decorations
as add-ons, and a cake from the kitchen. A party is marked done only once the guest's certificates have been seen too
(`WB196`): a guest meets the same rule as a boarder.

**Made-to-order items** (H4): the name to write on it, and a lead time the database checks (24 hours by default, a kitchen
setting, `WB156`); delivered on a run with the area's charge, or collected at the party.

### I7. Packages. Built (M37).

**More, Appointment setup, Packages**: a stay with appointments and extras included (a swim on the middle day, a groom on
the last day, three extra play sessions), for boarding or day boarding, at one price or a price on request.

On a stay, **Add a package** (owners and managers; staff for a package with a set price): the stay is then billed as
the package, one line ("Holiday package: Biscuit, 7 nights (3 Nov 2026 to 10 Nov 2026)"), and its parts are booked in
the same step (`apply_package()`): its extras, and each appointment at the first free time on its day (a groom on the
last day finishing by pick-up). A part with no free time is listed on the stay with **Book a time**. Parts cost nothing
on their own. Cancelling the stay cancels its appointments still to come; a stay shortened (going home early) cancels
those on days it no longer has.

## J. Boarding as the public rules promise (Phase 3, M38 to M42, D47)

### J1. Cancellation rules and credit. Built (M38).

**More, Cancellation rules** (owners and managers change it): which weekdays count as the weekend (Saturday and
Sunday by default), how many months credit lasts (12), and a rule for each of boarding and day boarding: the notice
needed (24 hours), and what happens to a weekday and to a weekend or holiday night with that notice and without it:
**refund**, **credit**, or **keep**. Holidays are peak periods ticked "a holiday" (C7). The database also takes a rule
for appointments, but no screen sets it yet: appointments take no advance (they are paid on their own bill), so there
is nothing for it to decide (see Open questions in `HANDOFF.md`).

**Cancelling a stay** records when the parent asked (now, or earlier when they rang yesterday) and whether the kennel
cancelled. Wagbook then works out each night (each day for day boarding) on its own: its notice is the time from the
ask to that day's check-in time; its rule is the weekday or the weekend one (`cancellationOutcome()`, unit tested). When
the kennel cancels, the parent chooses: everything refunded, or everything as credit. The money paid in advance goes to
the refund first, then to credit; the rest is kept. An owner or manager confirms both in one step on the stay's page:
the refund, and the credit, which is a refund paid "as credit" (`payments.method = 'credit'`). A different refund agreed
with the parent can still be recorded by hand under it.

**Credit** is a ledger (`credits`, `credit_uses`): each amount kept as credit, or given as goodwill by an owner or
manager with a reason, ends on a set date. It is spent on any bill as a payment "from credit", the soonest to end first,
never more than what is left and never after it ends (`WB211`), and a payment from credit is never changed (`WB212`).
The parent page shows what is left and when it ends; a bill's payment form offers it. Today lists a reminder to send a
month before credit runs out (D39). Reports leave payments from and into credit out of money in and out: no money moved.

### J2. Pick-up and drop from home. Built (M39).

While the kennel delivers (B10), a stay has **Pick-up** and **Drop**: an address of the parent (B11) and a time. The
price is the area's trip charge (B12, the delivery charge when none is set), copied when added; an owner or manager may
give another, and must for an address outside the areas served (`WB215`). A trip is a line on the stay's bill ("Pick-up
for Biscuit (3 Nov, 09:00)"). Pick-up is on the stay's first day and drop on its last (`WB216`); cancelling the stay
cancels its trips and changing its dates moves them. **Tell the parent** opens WhatsApp with the time. Trips join the
day's runs (H6) by their slot, and a rider sees and marks them like deliveries (`my_runs()`, `rider_mark_trip()`).

### J3. Health papers at the door. Built (M40).

**More, Health papers** (owners and managers): the vaccines the kennel requires and how many months each lasts when the
card gives no date, deworming and tick treatment within so many days, spayed or neutered above an age in months, and
whether failing them **warns** or **refuses** (off by default). Pets have the days they were last dewormed and treated
for ticks, on the pet page and the intake form. `pet_health_problems()` says what a pet lacks on a day. A stay's page (before check-in) and a visitor's appointment page show the problems, and while the kennel refuses, the database refuses them (`WB210`)
unless an owner or manager let the pet in with a note (`health_overrides`, in History of changes). Today lists stays
starting within a week whose pet will lack something, to send the parent (D39).

### J4. A booking form for new parents. Built (M41).

`/book/{slug}`: what (boarding, day boarding, or an appointment service the kennel offers), when (dates, or a day and a
time), pick-up from home with its address (while the kennel delivers), one pet's name, animal, breed, sex, neutering and
date of birth, a tick that vaccinations are up to date, the parent's name and phone, a note, and consent. It shows an estimate from the kennel's prices and says nothing is
charged. It lands in Forms from parents (B4) through the intake form's own function: accepting it makes the parent and
pet and the request (a stay or an appointment) and opens it, so staff confirm in one place. A request the kennel cannot
take as asked (no usual price, a time outside the place's hours) is left for staff to book by hand. Its link is on
Forms from parents. No new public function, and the intake form's rate limit (D47).

### J5. Reviews from parents. Built (M42).

Settings, **Review link** (an https address, such as the kennel's Google review page). With it, Today lists parents to
ask for a review: a stay checked out or a visitor's appointment done in the last week, once each and only the latest for
each parent (not each day of a daycare series), with the WhatsApp message carrying the link (D39). A review page of Wagbook's own is not built.

## K. The team (Phase 4, M43, D48)

Switched on in Settings, What this kennel offers: "A rota for the team, with leave and clocking in and out"
(`organizations.keeps_rota`). Off, none of it is shown.

### K1. Shifts and the rota. Built (M43).

**More, Rota**: the week, Monday to Sunday, a card for each day with each shift and who works it; the week before and
after. Owners and managers set up **shifts** (a name and hours; "Add morning, evening and night" gives 07:00 to 15:00,
15:00 to 23:00 and 23:00 to 07:00, a shift ending before it starts ending the next morning), change their hours (the
rota from today on follows), and take one off the list. They **put someone on the rota** for one shift on one day or
on each day up to 31 days, and take a person off a shift. The database keeps a person on one shift at a time
(`rota_one_shift_at_a_time`), and refuses a shift off the list (`WB220`), a rider or someone not working here now
(`WB221`), and a day of granted leave (`WB222`). **Living on site** marks the caretakers who live at the kennel
(`memberships.lives_on_site`). Staff read the rota.

### K2. Clocking in and out. Built (M43).

Today, **On now**: the reader's own **Clock in** or **Clock out** (with "You are on since 07:02"), who is clocked in
(names only, for everyone: `who_is_on()`), who is on the rota now but not clocked in, and who lives on site. The
database stamps both times; a person cannot write their own (`WB226`). An owner or manager writes a time by hand for
someone who forgot, or puts one right, always with a note (`WB227`), never later than now (`WB228`), and History of
changes keeps who did it. A person is in one stretch at a time (`attendance_one_at_a_time`). A person sees their own
attendance; owners and managers everyone's. A person with attendance on record is suspended, not removed
(`attendance_keeps_member`).

### K3. Leave. Built (M43).

**More, Leave**: anyone asks for days off (first and last day, a reason if they want), and sees and withdraws their
own. Owners and managers see what is waiting and grant or refuse it with an answer, see granted leave to come, and
may put leave in for someone, already granted. Nobody answers their own leave unless an owner (`WB223`, `WB224`);
refused and withdrawn leave is final, and granted leave keeps its days (`WB225`); requests do not overlap. Granting
takes the person off the rota on those days.

### K4. The month's attendance for pay. Built (M43).

**More, Attendance**: a month at a time, each person's days worked, hours (from stretches clocked out), days on leave,
shifts on the rota, and stretches not clocked out, then day by day with the times and any note. A stretch counts on the
day it began, so a night shift counts on its evening (`attendanceSheet()`). **Download the month (CSV)**: a line for
each person and day, with first in, last out, hours as a decimal, leave, shifts and notes. Staff see and download their
own.

---

## L. Running for real (M45 to M65, D49)

Chosen by the owner on 22 October 2026 for a kennel that runs on Wagbook every day. Each milestone writes its own
section here when it starts, and marks it "Built" when it ends. The roadmap holds what to build, the rules and when
each is done.

| Feature | Milestone | State |
| --- | --- | --- |
| Forgotten password by email, change password, sign in with Google | M45 | Built (L1) |
| Jobs that run by themselves overnight (`pg_cron`) | M46 | Built (L2) |
| Bring in parents, pets and vaccinations from a spreadsheet | M47 | Built (L3) |
| A health check for an uptime service, and server errors for owners | M48 | Built (L4) |
| Photo archive: download a month, then free the space (the owner's choice, never by itself) | M49 | Built (L5) |
| Kennels to clean between guests | M50 | Built (L6) |
| Opening and closing checklists, repeating cleaning jobs, repairs | M51 | Built (L7) |
| A pet that has passed away: nothing more sent, flowers to the parent | M52 | Built (L8) |
| A stay report for the parent at check-out | M53 | Built (L9) |
| Photo proof on care tasks, and "Pack all" in the kitchen | M54 | Built (L10) |
| A parent's own food and medicines, counted down | M55 | Built (L11) |
| A trial day for new dogs, never required | M56 | Built (L12) |
| Vet visits during a stay, on the bill and the expenses | M57 | Built (L13) |
| Move an appointment | M58 | Built (L14) |
| Book an appointment and report a delivery problem from the parent's link | M59 | Built (L15) |
| A rota that repeats each week, and forgotten clock-outs put right | M60 | Built (L16) |
| Alerts on staff phones (web push) | M61 | Built (L17) |
| Treats, toys and accessories sold over the counter, from stock | M62 | Built (L18) |
| Orders to suppliers, received into stock | M63 | Built (L19) |
| Export for Tally | M64 | Built (L20) |
| Several sites under one owner, with combined reports | M65 | Built (L21) |

### L1. Passwords and Google. Built (M45, D50).

**Forgot your password?** under the sign-in form opens `/login/forgot`: the person writes their email and is told a
link is on its way, the same sentence whether or not the address has an account. The emailed link lands on
`/auth/confirm` and opens `/login/new-password`, where they choose a new one and go to Today. With two-step sign-in on,
the code page comes first. A link works once. **More, Change password** (`/app/more/password`) asks for the current
password and a new one; the person's phones stay signed in. Someone who only signs in with Google is told they have no
password and how to add one. **Continue with Google** shows on the sign-in page when the installation has set it up
(`GOOGLE_SIGN_IN=on`, `10-setup-and-deploy.md`); a Google account with the same email as an existing one signs in to
it, and an invitation link works either way.

### L2. Overnight jobs. Built (M46, D50).

Each night at 02:00 India time pg_cron runs `run_nightly_jobs()`: food deliveries are made three weeks ahead for every
subscription, as opening the Kitchen does, and problems and job runs older than 90 days are cleared. Each job for each
kennel is written down (`job_runs`); one that fails says why and the others still run. Running them twice does nothing
twice. Owners and managers see the latest run of each under **More, Problems and overnight jobs**.

### L3. Bring in parents and pets from a spreadsheet. Built (M47, D50).

**More, Bring in parents and pets** (owners and managers): **Download the template (CSV)** gives the columns (in
English, as they are) and one invented example line. One pet a line; several pets of one parent are several lines with
the same phone; up to three vaccinations a line; dates as `2021-03-01` or `01/03/2021`. **Check the file** shows what
would go in, saving nothing: new parents, parents already known by phone (left as they are), new pets, pets already
known by name (left as they are), vaccinations, and every line with a problem, with its line, column and a sentence.
**Download the lines with problems (CSV)** gives those lines back with a last column saying what is wrong. **Bring in
N lines** saves the good lines, all of them or none (`import_parents_and_pets`, at most 2,000 lines, `WB240`). Staff
see none of it.

### L4. Knowing when something breaks. Built (M48, D50).

`/api/health` answers `{"status":"ok"}` (200) while the app reaches its database, and 503 when it cannot, for an uptime
service to watch. An error on the server while someone is signed in is written down for their kennel, with no email
address or phone number in it (`log_app_error`, 200 an hour at most). **More, Problems and overnight jobs**: the
overnight jobs (owners and managers), and for owners the errors of the last 90 days, the same error once with how
often and when last, where it happened (opening a page, saving a form, a download) and Next.js's code for it.

### L5. Photos and space. Built (M49, D49, D50).

**More, Photos and space** (owners and managers): all files' size, then month by month how many files and how big,
and how many photos an archive covers (updates to parents, grooming before and after, riders' door photos; never pets'
own photos, certificates or receipts). For a month that has ended: **Download photos (ZIP)**, a folder for each pet,
each photo named by its day. Once downloaded, an owner sees **Remove these from Wagbook**, which asks once more ("This
cannot be undone") and removes that month's full photos; the small copy of each stays, and every page that showed the
photo shows the small copy. The month then reads "Removed" with how many and how much. Nothing is removed by itself.

### L6. Kennels to clean. Built (M50, D52).

When the last pet in a kennel is checked out, the kennel is **to clean**: Today lists it under **To clean** with when
the pet left and a **Cleaned** button, and the calendar marks it under its name. The database writes the row and
stamps who cleaned and when (`kennel_cleans`); a kennel cleaned stays cleaned (`WB250`). A sibling still in the kennel
keeps it off the list. Checking a pet into a kennel still to clean, from Today or the booking page, opens the booking
page with "K03 was not cleaned. Check in anyway?" (the checklist typed so far is kept); **Check in anyway** checks in,
or another kennel can be chosen. A kennel out of service is not listed or asked about.

### L7. Checklists, cleaning and repairs. Built (M51, D52).

**More, Checklists and repairs**: owners and managers keep three lists, **Opening**, **Closing** and **Cleaning**, each
job every day or on one weekday, with a time if wanted; **Add the usual checklists** gives a start. Today shows
"Opening 1 of 4" and "Closing 0 of 4" with a **Done** button on each job (and Undo); Care shows the day's cleaning.
Who ticked and when is stamped (`house_job_days`). **Repairs**: anyone reports something broken and marks it fixed
with what it cost and what was done; an owner or manager taps **Write as an expense** (category Repairs,
`cost_to_expense`).

### L8. A pet that has passed away. Built (M52, D52).

On the pet page, owners and managers **Mark as passed away** with the day (today or before, `WB252`). From then: stays
and appointments still to come are cancelled with no charge ("Passed away"), food subscriptions end and deliveries
still to go are cancelled, and nothing new is booked, asked for or made for the pet (`WB254`, the parent's booking
link no longer lists it). No reminder is left about it: the stays it came from are gone, and grooms, reviews and food
trial follow-ups leave it out. The pet leaves the pet list, search and New booking; its page keeps everything, marked
"Passed away", and its parent's page says so. Today shows **Send flowers to {parent}, for {pet}** with the parent's
address until someone taps **Flowers sent** (an owner or manager can write the cost, an expense under Flowers). **Undo,
this was a mistake** is offered for a week (`WB253`); what was cancelled stays cancelled.

### L9. The stay report. Built (M53, D52).

Once a pet has gone home, the booking page shows its **Stay report**: nights (or days), meals eaten of those offered,
each medicine given of those due, play sessions, the weight coming in and going home, and the kinds of incident the
parent was told of, all worked out from what was recorded (`stayReport()`). Staff add a few words and pick up to six
photos from those already sent to the parent (`WB261`), then **Send the stay report** opens WhatsApp with the stay link.
The parent's stay page shows "{pet}'s stay report" at the top for the 30 days the link lasts. Internal notes, prices and
what an incident said never appear.

### L10. Photo proof and Pack all. Built (M54, D52).

A routine can ask for a photo (**Needs a photo**, on Daily routines and a pet's own routine). Its tasks show "Needs a
photo" on Care and have no Done button: staff take the photo and tap **Done with photo**; the database refuses such a
task done without one (`care_tasks_done_with_photo`), and the task keeps the rule whatever is sent. The photo is on the
pet's record; **Share with the parent** puts it on an update the parent sees. The photo archive covers these photos.
In the Kitchen, **Pack all** says how many deliveries it will pack, then packs each from the newest batch of its recipe
in date; any with no batch in date are left and counted.

### L11. Brought from home. Built (M55, D52).

On the booking page, before or during the stay, **Brought from home**: food (grams) or a medicine (doses), how much each
meal or dose uses, and for a medicine the routine it is given at. It counts down as meals or doses are ticked
(`stay_supply_left`): "800 g left of 1 kg", "Lasts 2 more days", and **Will run out before the stay ends** when it
will. Today lists those under **Running out**, with **Ask the parent** (WhatsApp) and, for food, **Use our food** (to
the booking's extras). At check-out the booking page says what goes home: "Goes home: Own kibble (500 g)."

### L12. Trial day. Built (M56, D52).

Day boarding can be marked **This is a trial day** on its booking page. Once the dog is in, staff note **How did it
go?** (settled, anxious, or reactive with other dogs) and a sentence. The pet page and the next booking's check-in say
"Trial day on 3 Nov 2026: Anxious." with the sentence, and Today's arrivals carry the result as a badge. Nothing
requires a trial.

### L13. Vet visits. Built (M57, D52).

On a stay in the kennel, **Vet visit**: the day, why, the vet, what the vet said, the cost and up to three medicines
with their time. In one step (`record_vet_visit`): the visit goes on the pet's health record, the cost on the stay's
bill as "Vet visit: {why}", and for an owner or manager in the expenses (category Vet, marked to be paid back); staff
leave the expense to an owner or manager, who taps **Write as an expense**. Each medicine becomes the pet's own routine,
so its tasks start today. **Tell the parent** opens WhatsApp with a short message. The pet page lists every visit.

### L14. Move an appointment. Built (M58, D53).

On an appointment still to come, **Move** opens the free times: a new day, and the place and person if they change.
The appointment keeps its length, add-ons and bill. The database checks the new time as it checks a new appointment
(the place with its clean-up, the pet and the person one at a time, the place's hours, a boarder's stay), refuses a
done, missed or cancelled appointment (`WB270`) and a time already gone (`WB271`). After the move, **Send the new time to
the parent** opens WhatsApp in the kennel's language for parents. History of changes (owners and managers) lists
appointments, with the old time and the new.

### L15. More from the parent's own link. Built (M59, D53).

When the kennel offers appointments, the parent's link has **Book an appointment**: what, which pet and the day, then
one of the free times (from today to 60 days ahead). It lands as a request, holding nothing, priced as the kennel
prices it, on the pet's stay if it is staying that day; six a day at most. Staff see it on Appointments under **Asked
for by parents**, and Today says one is waiting. When the kennel delivers food, a delivery handed over within the
problem window shows under **Something wrong with a delivery?**: damaged, late or wrong, a note and a photo, once per
delivery. It lands on Food under **Delivery problems to deal with** (and on the subscription's page), marked **Told by
the parent**, with the photo; Today counts the problems waiting. A problem with a trial or an order is dealt with on
Food. The link still reaches the database through its own functions only.

### L16. A rota that repeats, and forgotten clock-outs. Built (M60, D53).

On Rota, **Usual week**: a person, a shift and the weekdays. It fills the rota four weeks ahead and on, week after
week (when an owner or manager opens the rota, and overnight). A day of granted leave or a day the person is already on
a shift at that time is left out; a day taken off by hand stays off. Taking a weekday away takes its days still to come
off the rota. A stretch still open two hours after the end of the shift it began in shows on Today for owners and
managers: "{name} did not clock out", with **Clocked out at the end of the shift (15:00)**, which writes that time with
a note, in History of changes as any time by hand.

### L17. Alerts on staff phones. Built (M61, D53).

Under More, **Alerts on your phone**: **Allow alerts on this phone**, and which alerts the person wants: a parent asks
for a stay or an appointment, a new form from a parent, a food order or change, an incident written down, a pet gone
home with the bill unpaid. An alert names the kennel and the pet and opens the page; it never shows a parent's phone
number or address. The push itself carries nothing: the phone asks Wagbook, signed in, what happened. Alerts are off
until an installation sets them up (`10-setup-and-deploy.md`, "Alerts on phones"); no paid service is used. On an
iPhone, Wagbook must be added to the home screen first.

### L18. Selling over the counter. Built (M62, D54).

Switched on in Settings, What this kennel offers (**Treats, toys and other things sold over the counter**). Under
More, **Shop**: owners and managers add things to sell (name, kind, price of one, tax rate, HSN code, reorder level,
usual supplier) and change or stop a price; a sale already made keeps its own. They are stock like the kitchen's,
bought in, counted and thrown away on the Stock page, sold by the piece. **Sell to a walk-in**: how many of each, and
the bill opens at once, to "Walk-in", ready to issue (anyone may issue it as it was sold). On a parent's page, **Sell**
puts it on a stay that is booked or in the kennel, or on a bill of its own; on a stay's page, on that stay's bill, which
Make bill then includes. The database prices every line and takes the stock out in the same step, and refuses more
than is in stock with its sentence (`WB130`). **To reorder** lists what is at or below its level, with what is already
on order, and **Order more**. **Sold today** lists the day's sales with their bills; an owner or manager cancels one
made by mistake, with a reason, before its bill goes out, and the stock comes back. A stay's bill that has gone out
takes nothing more (`WB283`): sell on a bill of its own.

### L19. Orders to suppliers. Built (M63, D54).

Under More, **Orders to suppliers** (with the kitchen or the shop on). Owners and managers place an order to a
supplier: how much of each thing in its own unit, the supplier's usual things first, a note; then **Send on WhatsApp**
and **I have sent it**. The kitchen's shopping list leaves out what is still to come on an order, shows what is on
order, and **Order from {supplier}** opens an order with its quantities filled in. Anyone puts in stock **What came**,
in full or in part, with a use-by date (and a cost for recipe costs, owners and managers); never more than is still to
come, and not on a closed order. Owners and managers write **The supplier's bill** down as an expense once, with its
number and photo, and **Close the order** when the rest is not coming. Stock goes in on receiving, never on ordering.

### L20. Export for Tally. Built (M64, D54).

On Reports, **Download for Tally**: the month as a ZIP of two XML files Tally imports, the ledgers first (Import,
Masters) and the vouchers after (Import, Transactions). Each issued bill is a Sales voucher, each credit note a Credit
Note, money in or out by cash or bank a Receipt or Payment, credit kept or spent a Journal, and each expense a Payment
from its kind's ledger. **Ledger names in Tally** (owners and managers) sets once the company and the names of the
sales, tax, round off, cash, bank and credit ledgers and the groups for parents and expenses. Not yet imported into Tally
by a person: an accountant checks one month first (`HANDOFF.md`).

### L21. Several sites. Built (M65, D55).

Each site is a kennel of its own in Wagbook, with its own parents, pets, prices, bills, people and settings (D49). An
owner adds another under **More, Add another site**, which opens the same three questions as the first kennel (with
**Back to Wagbook** to return); a person owns ten kennels at most (`WB012`). Switching between sites stays where it was:
**More, You also work at**, a button for each. Staff and managers who work at two sites are invited to each and see
each one in turn, never both on one screen.

**All sites** (Reports, **See all your sites together**, shown to an owner of two or more): the month for each kennel
the reader owns, from that kennel's own reports, then **All sites together**: nights sold, day boarding days, kennels
used, billed (less credit notes), received, refunded, spent, received less spent, and what is owed on issued bills
today. Kennels used together counts every site's kennels over the month, not an average of the sites. Sites that bill
in different currencies are added up in each currency apart. Each site has **Switch to** its own name, to go and work
there. Kennels the reader manages but does not own are left out, and a manager or staff member is refused the page
(`WB062`); the figures come from `report_sites()`, which reads each owned kennel through its own reports and never
joins one kennel's rows to another's.

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
| Two-step sign-in | Built (M9): any person can turn it on under More, Two-step sign-in (an authenticator app). Owners without it see a reminder. Once on, a session with only the password reaches nothing in the database. Recovery codes (M24, D43): ten one-use codes, made on the same page and shown once; "Use a recovery code instead" on the code page lets that one session in without the phone. |
| Limits on how often strangers can post | Built (M9): sign in and two-step codes 20, intake form 10, joining 20, booking links 10, the food order page 10, per address per ten minutes; posts over 1 MB refused outside photo uploads (`src/lib/rate-limit.ts`) |
| Scripts only from Wagbook itself | Built (M9): a Content-Security-Policy with a fresh nonce for every page (D23) |

## Words on screen

Buttons and messages use the words in [12-glossary.md](12-glossary.md). Error sentences come from the database (see
[reference/error-codes.md](reference/error-codes.md)) and `src/lib/errors.ts`. They say what went wrong and what to do,
in one or two short sentences, and never apologise.
