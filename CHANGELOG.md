# Changelog

What changed in each release of Wagbook, newest first, in words a kennel owner can follow. Each release also says
whether it brings database changes: apply them before deploying the app that expects them (see
[docs/16-releasing.md](docs/16-releasing.md)).

## Not released yet

The first release will be 0.1.0. Everything below is in it.

### For the kennel

- Bookings for boarding and day boarding, with no double booking and no overfilling, enforced by the database.
  Families booked together, requests, peak periods, a calendar, extras and prices.
- Only an owner can delete anything (an expense with its receipt, a draft bill, an extra, a person, a parent's
  details), and every deletion asks "Yes, delete it" first.
- Two pets of one parent can share a kennel, the second at a shared kennel price you set; never three, and never pets
  of different parents. Pets booked together are billed together on one bill, and siblings play together.
- Today: arrivals, pets in house, check-outs, overstays, incidents to deal with. Check-in with a checklist.
- The care round (meals, medicines, walks) in one tap, safe to tap twice, and ticks made offline sent later. Solo play
  planned yard by yard.
- Photos and updates the parent sees on their own stay page, cleaned of location data.
- Bills with GST or no tax, consecutive numbers, a UPI QR code, printing, payments and advances.
- Pets and parents with vaccinations and warnings, incidents, search, merging duplicates.
- People: invite by link or email, roles, suspend and restore.
- Reports, expenses with receipts, CSV downloads, and the history of changes.
- English, Hindi and Kannada (the Hindi and Kannada are drafts until native speakers check them).
- The intake form parents fill in themselves, now with a vaccination certificate per pet.
- A parent's details: download everything held about them, and erase it on request, keeping only what tax law needs.
- Two-step sign-in with an authenticator app, enforced by the database.
- Bills say what really happened: a sibling who leaves early pays for their own nights, and a stay that turns from day
  boarding into boarding charges day prices for the days and night prices for the nights. Bills are in English, with
  the parent's language in brackets when they ask for it.
- Only an owner or manager can change a parent's phone number. Erasing a parent's details keeps their pets' records.
- Credit notes for a bill already sent, numbered in their own series, and the kennel's own tax rate and service code
  on each price.
- Reminders to send on Today (vaccinations due, arrivals, pick-ups, unpaid bills), each one tap to WhatsApp.
- Each parent gets a booking link to ask for a stay for their own pets. Requests wait on Today until someone confirms
  them, and the kennel can turn the link off.
- Day boarding regulars: days that repeat each week, and packs of days bought up front that a day is paid from.
- GSTR-1 files for the month (b2b, b2cl, b2cs, credit notes, HSN and documents) for a GST-registered kennel to hand
  its accountant.
- A pet going home early is billed to today or as booked, your choice at check-out. A bill already paid offers a
  credit note for the nights not stayed, then the refund; a cancelled stay's advance is refunded from its booking.
  Refunds can never be more than was paid over.
- A waiting list: a request waits in the order it joined, and Today tells you when a kennel frees up for it, with a
  message to the parent ready on WhatsApp. Requests and the waiting list show on the calendar.
- A regular's repeating day boarding is billed once a month, on one bill.
- Owners can take a photo posted by mistake off an update.
- Recovery codes for two-step sign-in, for when a phone is lost.
- Appointments, switched on in Settings: places that take one booking at a time (the pool, a grooming table, the
  party yard) with their hours; grooming, swims, training and parties priced by size, by coat and breed, or on quote,
  with add-ons. Free times offered; the database never lets a place, a pet or a person be booked twice at once, with
  time to clean up. A day's view with a column for each place. A boarder's groom goes on the stay's bill, a visitor's
  has its own.
- Grooming cards on the pet page, "Groom before going home" on a stay, before and after photos on the parent's stay
  page, and a reminder when a groom is due again.
- Swims recorded with the life jacket and who supervised; training courses sold up front with notes and homework sent
  to the parent; birthday parties with one guest dog and a cake from the kitchen (24 hours' notice).
- Packages: a stay with a swim, a groom and extra play included, billed as one line, its appointments booked for you.
- Cancellation rules (More): weekend days, holidays from peak periods, the notice needed, and what each night becomes:
  refunded, kept as credit, or kept. Cancelling a stay works out each night and an owner or manager confirms the
  refund and the credit in one step; when the kennel cancels, the parent chooses. Credit on the parent page, spent on
  any bill, never more than is left or after it ends, with a reminder a month before it does. Goodwill credit too.
- Pick-up from home and drop back home on a stay, priced by the area, on the day's runs for the rider, a line on the
  bill, and a WhatsApp message telling the parent the time.
- Health papers at the door (More): required vaccines, deworming, tick treatment and neutering, warning or refusing at
  check-in and a visitor's appointment; an owner or manager can let a pet in with a reason. Pets and the intake form
  have deworming and tick dates. Today reminds parents a week before.
- A booking form for new parents at `/book/{your link}`, with an estimate; it lands in Forms from parents, and
  accepting it adds the request.
- A review link in Settings: Today lists parents to ask for a review after a stay or a visit.
- The team (switch on "A rota for the team" in Settings): shifts and a week's rota, who lives on site, clocking in and
  out from the phone with Today showing who is on now, leave asked for and answered, and a month's attendance for pay
  with a CSV download. Clock times are stamped by the database; an owner or manager puts one right with a note.
- Send on a reminder now asks "Did the message go?" and takes it off the list only when it did.
- Kennels go in and out of service from a day, and reports count the kennels that were there on each past day.
- Downloading a parent's details now gives a ZIP with their pets' photos and certificates as well.
- Settings says what else the kennel offers: appointments, a kitchen, food delivery. All off to start, so a kennel
  that only boards sees nothing new. With delivery on: parents' delivery addresses, matched by PIN code to the areas
  you serve and their charge. Skills on People (cook, groomer, trainer, swim supervisor, rider). Each pet's weight
  over time, with a target and a body condition score.
- The kitchen (switch it on in Settings): stock that is the sum of what came in and went out, with purchases written
  down as expenses in the same step, waste and stock takes; suppliers; recipes in versions that never change, a
  rotation, and a list of foods a dog must never eat that no recipe may use; food prices and portions worked out from
  each dog's weight; what each boarder eats, on the care round; what to cook tomorrow, the shopping list on WhatsApp,
  batches that take their ingredients out of stock, labels to print, packing from a batch in date, and who received
  any batch.
- Food for homes (switch on delivery): subscriptions delivered on set days in whole packs, paused, changed and ended
  up to a cut-off; trials, orders and cakes; bills a week or a month ahead, credited for deliveries cancelled
  afterwards; delivery runs with a rider role that sees only its own run; problems replaced or refunded; a public
  food order page with the price worked out and UPI payment; parents pausing or skipping from their own link; and food
  reports with CSV downloads.
- The day, smoother: a kennel the last pet left is "To clean" on Today and the calendar until someone taps Cleaned,
  and checking into one asks first. Opening and closing checklists on Today, cleaning that repeats on Care, and repairs
  whose cost becomes an expense. A pet that has passed away has everything still to come cancelled with no charge, and
  Today reminds you to send the family flowers. A stay report for the parent once the pet goes home, with your words
  and photos. Routines that need a photo, and Pack all in the kitchen. The parent's own food and medicines counted
  down, with a warning before they run out. Trial days for new dogs. Vet visits on the bill, in the expenses and on the
  pet's routine in one step.
- Appointments move to another day, time, place or person from the free times, and the parent is told on WhatsApp.
- From their own link, a parent asks for an appointment at a free time, and tells the kennel a delivery went wrong,
  with a photo.
- Each person's usual week fills the rota four weeks ahead, minus their leave; a forgotten clock-out is closed at the
  end of the shift from Today.
- Alerts on staff phones for requests from parents, new forms, incidents and pets gone home unpaid, chosen by each
  person; nothing paid for, and no parent's contact in an alert.
- A shop: treats, toys and other things sold over the counter from stock, to a walk-in on a bill of their own, or to a
  parent on their stay's bill or a bill of its own. More than is in stock is refused, and what runs low is listed to
  reorder.
- Orders to suppliers on WhatsApp, put in stock as they come (in full or in part), with the supplier's bill as an
  expense. The kitchen's shopping list leaves out what is already on order.
- The month's bills, credit notes, payments and expenses as two files for Tally, with the ledger names your
  accountant uses. Have your accountant check one month before relying on it.

### For whoever runs it

- Limits on how often one address may sign in or send forms, and a Content Security Policy with a fresh nonce for
  every page.
- Running it on your own server with Docker Compose, Caddy and Supabase's self-hosting setup
  ([docs/14-self-hosting.md](docs/14-self-hosting.md)).
- Trying it on your own computer with a local Supabase and an invented kennel: `npm run setup:local` (see the
  README).
- A backup and restore drill ([docs/15-backup-and-restore.md](docs/15-backup-and-restore.md)).
- Alerts on phones, off until set up: `node scripts/push-keys.mjs` makes the four settings and the line for the
  database ([docs/10-setup-and-deploy.md](docs/10-setup-and-deploy.md), "Alerts on phones").

### Database changes

All of them: this is the first release. Apply every file in `supabase/migrations`.
