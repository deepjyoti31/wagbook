# 8. Roadmap

Milestones in order. Each is sized so one focused Claude Code session, or one contributor over a few evenings, can
finish it and leave `npm run check` green. Do them in order unless `HANDOFF.md` says otherwise: later ones lean on
earlier ones.

Each milestone has **Build** (what to make), **Rules** (decisions already taken, do not reopen them) and **Done when**
(acceptance, in addition to the definition of done in `CLAUDE.md`).

Tick the box and add the date when a milestone is finished.

---

## M0. Foundation

- [x] Finished 8 October 2026.

Database for the whole product with row level security, 136 tests, generated types and reference docs, design system,
sign-in, onboarding, kennels, pets, bookings, Today, intake form and review, stay page, people and invitations,
settings, security review and fixes, documentation.

---

## M1. Prove it against a real Supabase

- [ ] Partly done, 13 October 2026. Done: every migration and the seed apply on Supabase's own Postgres 17 (the local
  stack from the Supabase CLI); `supabase/seed.sql` and `supabase/config.toml`; the whole walk below runs as Playwright
  tests (`npm run test:e2e`, 13 tests) against that local stack, and a second CI job runs it. Still to do, and it needs a
  person: follow `10-setup-and-deploy.md` on a hosted Supabase project, try the real sign-up email and the
  `/auth/confirm` round trip, and record the migration freeze when production exists. See `HANDOFF.md`.

**Build**

1. Follow [10-setup-and-deploy.md](10-setup-and-deploy.md) exactly, on a fresh Supabase project. Fix the guide
   wherever it is wrong or unclear. Apply the nine migrations. Note any that fail on real Supabase and fix them (the
   tests use a stand-in for Supabase's own schemas, so differences are possible; likely spots are the `extensions`
   schema, `storage.objects` policies, and privileges of the migration role).
2. Walk the whole flow by hand at phone width and fix what breaks: create account, confirm email, create kennel, add
   kennels, set prices, add a pet, book, try to double book (must be refused with a clear sentence), check in with a
   kennel, send update, check out, cancel a booking, send the intake link, submit the form in a private window, accept
   it, open the stay link in a private window, invite a second account, accept, switch kennel, sign out.
3. Add `supabase/seed.sql` with a demo kennel (invented names only), and a `supabase/config.toml` so `supabase start`
   works for people who have Docker.
4. Add end-to-end tests with Playwright covering the walk in step 2, run against a local Supabase
   (`supabase start`). Add an npm script `test:e2e`. Keep it out of `npm run check` (it needs Docker) and add a
   second CI job for it.
5. Record in `HANDOFF.md` exactly which screens are now verified.

**Rules**

- Migrations may still be edited in place during M1. At the end of M1, once a production project exists, write the
  date under "Migration freeze" in `HANDOFF.md`. From then on, new files only.
- Test accounts and demo data use invented people. Never real parents.
- No secret goes in the repository or in a cloud environment's variables. See
  [11-working-with-claude-code.md](11-working-with-claude-code.md).

**Done when**

- A stranger can go from an empty Supabase project to a booked, checked-in dog by following the guide alone.
- `npm run test:e2e` passes locally and in CI.
- Every "Built" item in the product spec has been used against real Supabase, or has been demoted to "Database ready"
  with a note.

---

## M2. Bookings, properly

- [x] Finished 13 October 2026. Price is manager only (D15).

**Build**

1. `/app/bookings/{id}`: one booking. Edit dates, kennel, price, notes, belongings. Check in, check out, cancel with a
   reason, mark as did not arrive. Stay link with copy and "Send confirmation" on WhatsApp.
2. Extras: manage add-on services in Settings; add and remove `booking_items` on the booking page.
3. Family bookings: choose several pets of one parent in New booking; they share a `group_id` and are shown together.
4. `/app/calendar`: kennels down the side, days across, fourteen days at a time, scrolls sideways on a phone. Tap an
   empty cell to book that kennel from that day. Use `occupancy_by_day()` for the totals row.
5. Requests: save a booking as "requested" (holds no space) and confirm it later.
6. Peak periods: a screen in Settings; a badge on bookings that touch one; a warning when cancelling one flagged
   no-refund.
7. Overstay: when a checked-in pet is past its end date, offer "Extend to today" on Today, which moves `end_date` and
   is refused cleanly if the kennel is promised to someone else.
8. Check-in checklist: belongings, vaccinations confirmed, anything said at the gate.
9. Make rows on Today and Bookings link to the booking page.

**Rules**

- Dates changing on a booking go through the same constraints; show `friendlyError()` and keep what the person typed.
- Decide and record in `09-decisions.md` whether staff may change a price (see known limitations in `05`). If it
  becomes manager only, do it with column grants and a policy, and test it.
- The calendar is one server-rendered grid. No drag and drop in this milestone.

**Done when**

- A booking can be created, moved, extended and cancelled without leaving the booking page.
- Tests cover extras totals, group bookings, extend-over-a-conflict, and requests holding no space.

---

## M3. The care round

- [x] Finished 13 October 2026. Not timed with a stopwatch on a real phone; see `HANDOFF.md`.

**Build**

1. Settings: house routines (`care_items` with no pet): label, kind, time. Offer a starter set.
2. Pet routines: add a medicine or special meal for one pet, from the booking page and at check-in.
3. `/app/care`: today's tasks, grouped by time, then by kennel in walking order. One tap marks done. Long press or a
   second button skips with a note. Calls `generate_care_tasks()` when the page loads.
4. Counts on Today ("Meals 42 of 60") linking to the Care screen filtered to what is pending.
5. `/app/play`: yards in Settings; "Plan today" uses `planPlaySessions()` and saves `play_sessions`; the screen shows
   the timetable by yard; tap to mark a session done or move it.
6. A "what do I need" calculator in Settings using `yardsNeeded()`: given dogs, sessions, minutes and opening hours,
   how many yards.

**Rules**

- Marking done must work with one thumb and survive a double tap (the update is idempotent).
- Medication tasks are red and never grouped away. A skipped medication requires a note.
- Play planning never mixes dogs. The exclusion constraints already refuse it; show the refusal clearly.

**Done when**

- A worker can do a full meal round for twenty dogs from the Care screen in under two minutes on a phone.
- The stay page's care counts match what was ticked.

---

## M4. Bills and payments

- [x] Finished 14 October 2026. Staff issue only bills that match their booking (D15). Not timed on a real phone; see
  `HANDOFF.md`.

**Build**

1. From a booking: "Make bill" builds a draft from `stayLines()`; lines can be edited; "Issue" calls
   `issue_invoice()`.
2. `/app/bills`: unpaid first, then recent. `/app/bills/{id}`: the bill, payments, "Record payment", "Void" for
   managers.
3. `/inv/{token}`: the parent's bill page, using `get_public_invoice()`. Print stylesheet so "Save as PDF" from the
   browser gives a clean A4 invoice. Amount in words. "Pay with UPI" button on phones and a QR code everywhere.
4. Record payment: amount (defaults to the balance), method, date, reference. Advances from the booking page.
5. Check-out offers "Make bill" and then "Send bill" on WhatsApp with `billMessage()`.
6. Settings: time zone, currency, locale, financial year start, round totals.

**Rules**

- If `issue_invoice()` raises `WB037`, the TypeScript and SQL arithmetic disagree. Fix the bug; never loosen the check.
- No PDF library. The browser prints.
- No third-party QR service. See [07-whatsapp-and-upi.md](07-whatsapp-and-upi.md).
- Never show "paid" from a link tap. Only a recorded payment makes a bill paid.

**Done when**

- A stay can be billed, sent, paid and marked paid from a phone in under a minute.
- A printed invoice shows everything `06` lists, for all three tax modes.
- Tests compare `computeInvoice()` with `issue_invoice()` over a table of awkward cases (odd paise, inclusive prices,
  discounts, zero rate).

---

## M5. Photos and updates

- [x] Finished 14 October 2026, except certificate upload in the intake form, moved to M9 with the edge rate limits
  (anonymous uploads would multiply the intake flood risk; see `05`). Certificates are uploaded by staff on the booking
  page until the pet page exists (M6). Photos for parents: D18.

**Build**

1. Upload from the phone camera to the `pet-media` bucket, resized in the browser before upload (long edge about
   1,600 pixels).
2. Pet profile photo, shown small on every row for recognising dogs.
3. Write an update from a pet's row: note, photos, "show to parent" on by default. Then opens WhatsApp.
4. Stay page shows updates with photos through signed links that last an hour.
5. Vaccination certificate upload on the pet page and in the intake form.

**Rules**

- Paths follow the layout in the storage migration. The first folder is the organisation id.
- The public stay page gets photos through a new or extended `security definer` function returning signed paths, or a
  route handler that checks the token. Either way, add tests and update `05`.
- Strip location data from photos before upload.

**Done when**

- A parent opens a stay link and sees today's photo within seconds on a slow connection.
- Another kennel's member cannot fetch the file, by test.

---

## M6. Pets, parents and people

- [x] Finished 14 October 2026. Invitation links: D19.

**Build**

1. `/app/dogs/{id}`: view and edit everything; vaccinations with status (valid, expires soon, expired); stays;
   incidents; photo.
2. `/app/clients/{id}`: view and edit; pets; stays; bills; balance; WhatsApp.
3. Search by parent name and phone as well as pet name.
4. Vaccination warnings at booking and check-in.
5. Incident log: add from a pet's row; list on the pet page; Today shows open high-severity ones.
6. People: change role and name; suspend and restore; invite someone with no account by sending a sign-up link that
   carries the invitation.
7. Merge two clients who turn out to be the same parent.

**Done when**

- Nothing about a pet or parent needs the Supabase dashboard to change.

---

## M7. Reports and expenses

- [x] Finished 14 October 2026. The audit log viewer is called History of changes. Reports refuse staff (D20).

**Build**

1. `/app/more/reports`: occupancy by day for a month (a simple bar per day), nights sold, income by month, unpaid
   bills, tax collected by rate, top add-ons.
2. Expenses: add with category, amount, date, receipt photo; monthly totals.
3. CSV download for bookings, invoices, payments and expenses for a date range.
4. Audit log viewer for owners and managers, filtered by table and person.

**Rules**

- Reports are SQL views or functions with `security_invoker`, tested for tenant isolation like tables.
- Charts are plain HTML and CSS. No chart library.

---

## M8. Works anywhere, in any language

- [x] Finished 15 October 2026, with Hindi and Kannada as drafts until native speakers review them. Languages: D21.
  Offline: D22 (Next.js's experimental offline retry is left off, because it would replay a booking).

**Build**

1. Move every on-screen string to message files. English first, then Hindi and Kannada, reviewed by native speakers.
2. Language choice per member, and per kennel for parent pages.
3. Offline tolerance: a service worker that caches the shell and the Today and Care screens; ticking a task while
   offline queues and syncs.
4. A daily summary the owner can send themselves on WhatsApp: tomorrow's arrivals and departures, vaccinations
   expiring.

**Rules**

- Choose the internationalisation approach by reading the Next.js docs in `node_modules` first; record it in `09`.
- Database error sentences are English. Map `WBnnn` codes to translated sentences in the app.
- Offline writes are limited to idempotent actions (ticking a task). Never queue a booking offline: it could conflict.

---

## M9. Hardening and privacy tools

- [x] Finished 15 October 2026. Item 6 was an adversarial pass by Claude Code, not an independent person; one is
  still recommended before a public instance (see `05`, review log, and `HANDOFF.md`).

**Build**

1. [x] Script-src Content Security Policy with nonces (D23: nonces, plus hashes for the prerendered shell).
2. [x] Rate limiting for the intake form and sign-in at the edge (D26: the app's proxy, per address; posts over 1 MB
   refused outside uploads).
3. [x] Export everything about one parent as a file. Erase a parent on request, keeping issued invoices with the buyer
   details the law requires (D25, `export_client`, `erase_client`).
4. [x] Two-factor sign-in for owners (D24: any person may turn it on; the database enforces it).
5. [x] A documented backup and restore drill ([15-backup-and-restore.md](15-backup-and-restore.md),
   `scripts/backup-drill.sh`, run locally; the hosted round trip waits for the owner).
6. [x] A second security review, logged in `05` (with races 6 and 16 staged on real Postgres, `scripts/race-checks.sh`).
7. [x] Vaccination certificate upload in the intake form (moved from M5): anonymous uploads under the submission's own
   folder, at most one per pet, only within an hour of submitting, behind the same rate limits as item 2
   (`intake_upload_allowed`).

---

## M10. Ready for the world

- [x] Finished 19 October 2026. The owner confirmed the licence; the public demo was dropped for trying Wagbook on
  your own computer (D28).

**Build**

1. [x] A self-hosting guide with Docker Compose (self-hosted Supabase plus the app): [14-self-hosting.md](14-self-hosting.md),
   `Dockerfile`, `deploy/`. Verified on one computer against the CLI's Supabase; Supabase's own self-hosting stack not
   tried.
2. [x] ~~A public demo that resets nightly~~. Dropped (D28): the seeded, invented kennel runs on a local Supabase
   instead (README, "Try it on your own computer", `npm run setup:local`).
3. [x] Issue and pull request templates, a code of conduct, a release process and changelog (`.github/`,
   `CODE_OF_CONDUCT.md`, [16-releasing.md](16-releasing.md), `CHANGELOG.md`).
4. [x] A short guide for a kennel owner, with screenshots: [17-guide-for-kennel-owners.md](17-guide-for-kennel-owners.md)
   (`scripts/guide-screenshots.mjs` takes the pictures again).
5. [x] Confirm the licence decision: AGPL-3.0-or-later, confirmed 19 October 2026 (D2).

---

## M11. Families

- [x] Finished 19 October 2026. Asked for by the owner: some families board two dogs in one kennel (D27).

**Build**

1. [x] Two pets of one parent may share a kennel, never three, never with another parent's pet, all in the database.
   Capacity counts kennels in use.
2. [x] A shared kennel price for the second pet, set by the kennel in Settings; New booking offers "One kennel
   together" for two pets.
3. [x] Today, the booking page and the calendar offer and show a shared kennel.
4. [x] One bill for a family booked together; advances on any of the pets count against it.
5. [x] Siblings may play together, and are planned together.

---

## M12. Name kennels freely

- [x] Finished 19 October 2026. Asked for by the owner: name kennels when adding them.

**Build**

1. [x] Add one kennel with a name of your choosing, beside the numbered row.
2. [x] Rename a kennel.
3. [x] Change a kennel's position in the list (the care round's walking order).

---

## M13. Rough edges

- [x] Finished 19 October 2026.

**Build**

1. [x] New booking starts with recent pets and searches the rest on the server as you type.
2. [x] More shows Reports, Expenses and History of changes only to owners and managers.
3. [x] History of changes names fields in the reader's language.
4. [x] A second vaccination with its own card on the intake form.
5. [x] Owners and managers correct an incident (`WB080` for anyone else).
6. [x] The unused `care_items.requires_photo` is removed.
7. [x] Deleting an expense removes its receipt file. Only owners delete anything, and every deletion asks once more
   (D29).

---

## M14. The owner's answers

- [x] Finished 21 October 2026.

**Build**

1. [x] A pet at the shared kennel price pays the usual price for nights it has the kennel to itself; a sibling
   checked out early counts up to the day it left (`stay_charges`, D32).
2. [x] Day boarding that turns into boarding is billed as days and then nights, each at its price (Staying overnight
   on the booking page, D32).
3. [x] Only owners and managers change a parent's phone numbers (`WB002`, D33).
4. [x] Erasing a parent keeps their pets' records (D30).
5. [x] Bills are in English, with a parent's language in brackets on request (D31).
6. [x] What the law says on GST invoices, cancelling bills, record keeping and erasure, written up for the accountant
   and the lawyer (`06`, `05`).

---

## M15. Credit notes, and the kennel's own tax rates

- [x] Finished 21 October 2026.

**Build**

1. [x] Credit notes on issued bills: the whole bill or part of it, their own `CN/YY-YY/NNNN` numbers, tax as on the
   bill, never more than is left (D34). On the bill page, the parent's bill link, Reports and the bills download.
2. [x] A tax invoice from an earlier month, or a credited bill, is credited instead of cancelled (`WB095`, `WB096`).
3. [x] A tax rate and SAC code for boarding, day boarding and each extra, set by the kennel (D35).

---

## M16. Reminders to send

- [x] Finished 21 October 2026. Today lists vaccination cards to ask for, arrivals and pick-ups tomorrow, and unpaid
  bills; Send opens WhatsApp and the reminder leaves the list (D39).

---

## M17. Booking requests from parents

- [x] Finished 21 October 2026. A parent's own link, requests that hold no kennel, two public functions (D36).

---

## M18. Day boarding regulars

- [x] Finished 21 October 2026. Repeating day boarding, day boarding packs sold with a bill, days paid from packs (D37).

---

## M19. GSTR-1 files

- [x] Finished 21 October 2026. The month's bills and credit notes as the GST offline tool's CSV files (D38).

---

## M20. Refunds when a stay ends early or is cancelled

- [x] Finished 21 October 2026. Asked for by the owner (D40).

**Build**

1. [x] Check-out before the booked end asks: bill to today (the stay ends today, keeping a boarding stay's first night)
   or bill as booked. Today sends an early leaver to its booking to choose.
2. [x] An issued bill whose stays now come to less offers a credit note for the difference, worked out on the server for
   each tax rate on the bill; then the refund amount is filled in.
3. [x] A cancelled stay lists its advance, and owners and managers refund it there.
4. [x] The database refuses a refund of more than was paid over the bill (`WB121`) or than the advance (`WB122`), and a
   refund that names neither (`WB120`).

---

## M21. Waiting list when full

- [x] Finished 21 October 2026. Asked for by the owner (D42).

**Build**

1. [x] Add to the waiting list in New booking, and Put on or Take off on a request's page. The database stamps each
   one's place in line and clears it when the request is answered.
2. [x] `waiting_list()` says which waiting requests would fit now; Today lists them first in line first, with Tell the
   parent on WhatsApp and Confirm booking.

---

## M22. Requests and the waiting list on the calendar

- [x] Finished 21 October 2026. Asked for by the owner.

**Build**

1. [x] One row a request under the kennels, the waiting list first, its days drawn as holding no space.

---

## M23. A day boarding series billed by the month

- [x] Finished 21 October 2026. Asked for by the owner (D41).

**Build**

1. [x] A bill for a month of a series: its days that are not requests or cancelled, one line for each price, each
   day's extras with its date. Staff can issue it as the database prices it.
2. [x] A day of a series is never billed alone (`WB055`); a month has one live bill; a day on an issued month's bill
   cannot move into another month (`WB057`).

---

## M24. Small fixes

- [x] Finished 21 October 2026. Asked for by the owner.

**Build**

1. [x] Two vaccination cards per pet on the intake form: already built in M13 (a card for each of two vaccines); the
   open question in `HANDOFF.md` was stale and is removed.
2. [x] Owners take a photo posted by mistake off an update; its file is deleted (D29, `WB081`).
3. [x] Recovery codes for two-step sign-in (D43).

---

# Beyond boarding: M25 to M44

Added 21 October 2026, when the owner asked for Wagbook to run the rest of a kennel's business (D44): grooming and
other services booked by time, a kitchen that cooks for boarders and for dogs at home, and food sold as a trial, as
one-off orders and as a subscription delivered twice a week. The kennel's public rules for all of it are in
[13-reference-deployment.md](13-reference-deployment.md), "Beyond boarding".

How these milestones work:

- **Each area is switched on per kennel** (M25). A kennel that only boards sees none of it.
- **Each milestone starts by writing its section in `02-product-spec.md`**, marked "Planned", and ends by marking it
  "Built". Product questions the section cannot answer go under "Open questions" in `HANDOFF.md`.
- Every rule in `CLAUDE.md` holds: rules in the database with a test, `org_id` and row level security on every table,
  money in paise, quantities as whole numbers, every word in English, Hindi and Kannada.

**The order, and why.** Phase 1, the kitchen and food, comes first. Recurring deliveries, rotating recipes and stock
are where a notebook or spreadsheet breaks first, and nothing in Wagbook covers them yet. Phase 2, appointments, comes
next (built 22 October 2026). Phase 3 brings boarding up to the public rules
(credit on cancellation, pick-up from home, health papers, a public booking form; built 22 October 2026). Phase 4, the
team and the rough edges before production, was built the same day. The launch work
in M1 can happen at any point; the migration freeze waits for it.

---

## Phase 0. Groundwork

## M25. Groundwork for more than boarding

- [x] Finished 21 October 2026 (B10 to B14 in `02`).

**Build**

1. [x] Settings, "What this kennel offers": Appointments, Kitchen, Food delivery, each on or off. The bottom bar, More and
   Today show only what is on. (Only More has something to hide so far: Areas you serve.)
2. [x] Addresses for parents: more than one (home, office), each with area, pincode, a map link and a note for whoever
   delivers. On the parent page and the intake form.
3. [x] Areas served: the pincodes the kennel delivers to and picks up from, each with an optional delivery charge.
4. [x] People's skills: cook, groomer, trainer, swim supervisor, rider. Used to offer the right person for a job, not for
   access (access stays with roles, until M31).
5. [x] A pet's weight over time: weighed on a date, by whom, with an optional body condition score (1 to 9) and a target
   weight. Shown on the pet page; the latest weight is what portions use (M28). `pets.weight_kg` became `weight_g`,
   kept by the database from the weighings.

**Rules**

- An address is a parent's personal data, like a phone number (D33): owners and managers change it, it is in the
  export, and erasure removes it.
- Weights are whole grams (`_g`), never a decimal.

**Done when**

- A kennel with everything off looks exactly as it does today (the e2e walk passes unchanged).
- Erasure removes addresses, tested in the database.

---

## Phase 1. The kitchen and food

## M26. Stock

- [x] Finished 22 October 2026 (H1 in `02`).

**Build**

1. [x] Items kept in stock: name, unit (grams, millilitres or pieces), kind (meat, organ, egg, grain, vegetable, oil,
   supplement, packaging, fuel, grooming product, medicine), usual supplier, a low level.
2. [x] Suppliers: name, phone, what they supply.
3. [x] Stock in: a purchase with date, supplier, quantity, cost, use-by date, the supplier's bill number and a photo of it.
   Saving a purchase can save it as an expense (E4) in the same step.
4. [x] Stock out: used in cooking (written by M30, not by hand), thrown away with a reason (spoiled, past its date,
   dropped), and a stock take that sets the counted quantity and records the difference.
5. [x] The stock page: what is in, what is low, what passes its use-by date in the next two days, oldest first.

**Rules**

- Stock is never edited. It is the sum of its movements, and the database refuses a movement that takes an item below
  zero (a stock take is the only way to correct it).
- Owners and managers record purchases and see costs. Staff record use, waste and stock takes, and see no cost.

**Done when**

- A week of buying, cooking and throwing away adds up to a stock take, in a database test.

---

## M27. Recipes

- [x] Finished 22 October 2026 (H2 in `02`).

**Build**

1. [x] A recipe: name, what it is good for (parents read this), each stock item with its raw quantity per kilo of cooked
   food, the cooked yield, kcal and protein per kilo, who signed it off (a veterinary nutritionist) and when, and when
   it was last lab tested.
2. [x] Versions: changing a recipe makes a new version. A batch and a delivery keep the version they were made from.
3. [x] A rotation: recipes in order, one per delivery, repeating (by default every two weeks).
4. [x] Items marked "never in a recipe" (onion, garlic, grapes, raisins, chocolate, cooked bones, added sugar): the database
   refuses a recipe that uses one.
5. [x] Cost per kilo from the latest purchase prices, for owners and managers.

**Rules**

- Only owners and managers make or change recipes. A recipe that has been cooked is retired, never deleted.

**Done when**

- Two versions of one recipe, a batch of each, each costed from its own version, in a database test.

---

## M28. Food products and portions

- [x] Finished 22 October 2026 (H3 in `02`).

**Build**

1. [x] Food in the rate card: a trial (fixed price and quantity, once per pet), subscription food per kilo, one-off orders
   per kilo, and made-to-order items per piece (a birthday cake), each with its own tax rate and code (D35).
2. [x] Plans: full meal, or topper (a share of the day's food, a third by default).
3. [x] Portions: grams a day from the pet's latest weight, its size band and a goal (lose, keep, gain), using the kennel's
   own percentages (by default 3%, 2.5% and 2% of body weight for small, medium and large dogs). A manager may set the
   grams by hand with a note. Today lists portions to review a week after a pet starts.
4. [x] On the pet page: the plan, grams a day, foods to avoid, and the weight trend.
5. [x] What a boarder eats (the owner's answer, 21 October 2026): fresh food from the kitchen by default, or a kibble the
   parent names (brand, and grams a day), or food the parent sends. Chosen per pet; the care round and the cook plan
   follow it.

**Rules**

- Portion arithmetic is pure, in `src/lib/core/`, with unit tests. Grams and paise, never decimals.
- Pet food is goods, not a service: the tax rate and code need the accountant (question in `06`) before a GST kennel
  sells it.

**Done when**

- The portion for a 20 kg dog on a full meal and on a topper matches the worked example in the spec section.

---

## M29. Subscriptions and orders

- [x] Finished 22 October 2026 (H4 in `02`).

**Build**

1. [x] A subscription: parent, pets, plan, grams a day, delivery days (two a week by default), a time slot, an address,
   a start date, and how it is paid: weekly or monthly in advance (the owner's answer, 21 October 2026). The owner
   sets a discount for monthly payment, as a percentage (`_bp`), in Settings.
2. [x] Deliveries made ahead from it: each covers the days until the next, rounded up to whole packs (pack size a
   setting, 250 g by default), with the recipe the rotation gives it.
3. [x] Pause (between two dates, or until resumed), change the grams, plan, days or address, or cancel. Changes close a
   set time before a delivery (24 hours by default); after that it is cooked.
4. [x] One-off orders: a trial, food by the kilo, or a made-to-order item, for a date and address.
5. [x] Today lists trials delivered a few days ago, to ask the parent about a subscription.
6. [x] Bills: a subscription's deliveries billed ahead for the week (or the month), as a series is (D41). A delivery
   cancelled before it is cooked is credited (credit notes, D34). Unpaid weeks join the reminders (D39).

**Rules**

- One delivery per subscription per date. Grams, recipe and price are copied onto each delivery when it is made, so
  changing the rate card never changes one already planned.
- After the cut-off, staff cannot change a delivery; a manager can cancel it with a reason.

**Done when**

- A subscription two days a week, paused for a week, resumed, changed, cancelled, billed and credited: database tests
  and an e2e walk.

---

## M30. The cook plan and batches

- [x] Finished 22 October 2026 (H5 in `02`).

**Build**

1. [x] What to cook: kilos of each recipe for tomorrow's deliveries and for boarders on kitchen food (each boarder's grams
   a day), plus a margin (a setting).
2. [x] The shopping list: what those recipes need less what is in stock, by supplier, to send on WhatsApp.
3. [x] A batch: recipe version, kilos, packs, date, cook, a batch number, and a use-by date (a setting per recipe).
   Recording it takes its ingredients out of stock.
4. [x] Labels for each pack: pet, recipe, grams, batch, cooked on, use by, how to store it. A4 sheets to print.
5. [x] Packing: each delivery ticked packed, with the batch it was packed from.

**Rules**

- A delivery is packed only from a batch of its own recipe that is within its use-by date.
- From a batch, Wagbook answers who received it (deliveries and boarders). That is the food safety question.

**Done when**

- The cook plan for a day of ten deliveries and six boarders equals a count by hand; a batch takes stock down; "who
  got batch N" is answered, all in tests.

---

## M31. Delivery runs

- [x] Finished 22 October 2026 (H6, D45 in `02`).

**Build**

1. [x] The day's run: one rider's deliveries for a slot, one after another (the owner's answer, 21 October 2026: a rider
   sees their own run and nothing else), by area, in an order staff can change, a map link for each stop, and the whole
   route opened in Google Maps.
2. [x] A rider sees only their run: name, address, phone, packs and the note for the door. No prices, no pets' medical
   notes, no other parents.
3. [x] At the door: delivered (with a photo), nobody home, or refused. "On the way" as a WhatsApp link from the rider's
   phone.
4. [x] Problems: a parent reports a pack damaged, late or wrong (with a photo, within 24 hours by default). Staff replace it
   (a new delivery at no charge) or refund it (a credit note and a refund).
5. [ ] Pick-ups and drops of boarders (M39) join the same run. Waits for M39; runs already hold any delivery of the
   day and slot.

**Rules**

- Riders are a fourth role with the least access of any (a new decision, D45 when built). Row level security limits
  them to their own run for the day; a test signs in as a rider and finds nothing else.

**Done when**

- The rider test passes, and the e2e walk delivers a run at 360 pixels wide.

---

## M32. Ordering food from the kennel's website

- [x] Finished 22 October 2026 (H7 in `02`).

**Build**

1. [x] A public order page, with a link a kennel can put on its own website: trial or subscription, the dog's name and
   weight, the portion and price worked out, delivery days and slot, address and pincode.
2. [x] A pincode not served: the details are kept as "waiting for your area" and the parent is told nothing was charged.
   Staff see how many wait in each pincode.
3. [x] Payment: the UPI QR with the amount, then "I have paid". The order lands as a request; staff confirm once the money
   has arrived, which makes or matches the parent (by phone), the pet and the subscription.
4. [x] A known parent pauses, skips or orders more from their own link (as F0 does for stays).

**Rules**

- More anonymous functions (rule 6): each needs its line in `tests/db/security.test.ts`, a paragraph in `05`, and the
  same rate limits as the intake form.

**Done when**

- An order from a private window becomes a subscription after Confirm; hostile input is refused (`hardening` tests).

---

## M33. Food reports

- [x] Finished 22 October 2026 (H8 in `02`).

**Build**

1. [x] Active subscriptions and trials, kilos a day, deliveries per rider per day, trials that became subscriptions,
   subscriptions ended each month, food revenue and cost per kilo (from batches and purchases), waste, and where
   customers came from (a boarding parent, a referral, the website).
2. [x] CSV downloads, as in M7.

**Rules**

- Owners and managers only, refused in the database (as D20).

---

## Phase 2. Appointments

## M34. Services by appointment

- [x] Finished 22 October 2026 (I1 to I4 in `02`, D46).

**Build**

1. [x] Places that take one booking at a time: the pool, a grooming table, a training ground, the party yard. Each with
   its hours.
2. [x] Appointment services: name, length, the place it uses, time to clean up after, price (fixed, by size, or on quote),
   tax rate and code, the skill it needs, and whether vaccinations are checked.
3. [x] Book an appointment for a pet staying in or visiting for the day: service, date and time, place and person. Free
   times are offered.
4. [x] States: requested, confirmed, done, no-show, cancelled with a reason.
5. [x] Today lists the day's appointments. A day view shows each place as a column, at 360 pixels wide.
6. [x] A boarder's appointment is a line on its stay's bill; a visitor's has a bill of its own.

**Rules**

- The database refuses two appointments in one place at once (with clean-up time), one person in two places, and one
  pet in two places. Times are `timestamptz`; the day is the kennel's (`todayIn()`).
- The price is copied onto the appointment; staff cannot change it (D15).

**Done when**

- Two swims at overlapping times are refused with a sentence; a boarder's groom is on its bill; a visitor's groom has
  its own.

---

## M35. Grooming and spa

- [x] Finished 22 October 2026 (I5 in `02`).

**Build**

1. [x] The grooming menu: bath and dry, full groom, haircut, nails, ears, de-shedding, tick and flea bath, teeth; priced by
   coat and breed (the owner's answer, 21 October 2026): a coat type on the pet (short, double, long, curly, wire) and
   a price for each coat type, with a price for a named breed overriding it; add-ons on top.
2. [x] A grooming card on the pet: coat, the usual cut, products to use or avoid, skin conditions, how the pet behaves on
   the table, the last groom.
3. [x] Before and after photos sent to the parent as an update (D4, F3).
4. [x] "Groom before going home" on a stay: booked on the last day, finished before pick-up.
5. [x] A reminder when a pet is due for a groom again (D39).

**Done when**

- A stay with a groom on its last day, and the parent sees the after photo on the stay page.

---

## M36. Swimming, training and parties

- [x] Finished 22 October 2026 (I6 in `02`).

**Build**

1. [x] Swimming: one dog at a time (M34), with a tick for the life jacket and who supervised.
2. [x] Training: a course of sessions sold as a pack (as M18), priced on quote by the trainer, with notes and homework after
   each session sent to the parent.
3. [x] Birthday parties: the party yard for a set time, the birthday pet and one guest dog it already knows (the guest's
   parent and vaccinations recorded), the number of people, decorations as extras, and a cake from the kitchen.
4. [x] Made-to-order items: a lead time the database checks (24 hours by default), the name to write on it, and delivery on
   a run (M31) with the area's charge. A party's cake is collected at the kennel; one delivered goes on a run as any
   order does.

**Rules**

- A guest dog meets the same vaccination rules as a boarder.

---

## M37. Packages

- [x] Finished 22 October 2026 (I7 in `02`).

**Build**

1. [x] A package: a stay with appointments and extras included (more play, a swim, a groom before going home), at one
   price or a price on request set by a manager.
2. [x] Booking a package books its parts; cancelling the stay cancels them. The bill shows the package as one line.

---

## Phase 3. Boarding as the public rules promise

## M38. Cancellation rules and credit

- [x] Finished 22 October 2026 (J1 in `02`, D47).

**Build**

1. [x] Weekends and holidays: which weekdays count as weekend, and the kennel's list of holiday dates (built on peak
   periods, C7).
2. [x] A cancellation rule for each kind of service: the notice needed, and what happens to each night or appointment with
   enough notice and without it (refund, or keep as credit). On screen for boarding and day boarding; appointments take
   no advance yet, so their rule waits (`HANDOFF.md`, Open questions).
3. [x] Credit: a parent's balance from a cancellation or a goodwill gesture, ending on a set date (12 months by default),
   spent on any bill as a payment, never more than what is left. On the parent page and on bills. A reminder goes on
   Today's list to send (D39) a month before credit runs out (the owner's answer, 21 October 2026).
4. [x] On Cancel, Wagbook works out the refund and the credit night by night, shows both, and a manager confirms. The time
   the parent asked is recorded for the notice rule.
5. [x] When the kennel cancels, the parent chooses a refund or credit.

**Rules**

- Credit is money: a ledger in paise the database keeps from going below zero or being spent after it ends.
- Whether kept credit needs a bill or carries tax is for the accountant (question 15 in `06`).

**Done when**

- The night-by-night arithmetic is a pure function with unit tests for a stay across a weekend and a holiday, cancelled
  with and without enough notice.

---

## M39. Pick-up and drop from home

- [x] Finished 22 October 2026 (J2 in `02`, D47).

**Build**

1. [x] On a booking: pick-up, drop or both, an address (M25) and a time.
2. [x] The price is the area's charge by default, changed by a manager, and is a line on the bill.
3. [x] Trips join the day's run (M31), and the parent is told the time on WhatsApp.

---

## M40. Health papers at the door

- [x] Finished 22 October 2026 (J3 in `02`, D47).

**Build**

1. [x] The kennel's rules: the vaccines it requires and how long each lasts, deworming and tick treatment within a set
   time, and spayed or neutered above a set age.
2. [x] Pets get deworming and tick treatment dates and whether they are neutered; the intake form asks for them.
3. [x] Check-in and appointments refuse or warn (a setting), with the reason. A manager may let a pet in anyway, recorded
   with a note. Reminders go out before a stay when something will be out of date.

**Rules**

- The refusal is a database rule; the override is a row, so History of changes shows who let a pet in and why.

---

## M41. A booking form for new parents

- [x] Finished 22 October 2026 (J4 in `02`, D47).

**Build**

1. [x] A public page for any service the kennel offers: what, when, pick-up, the dog's details, a tick for vaccinations up
   to date, and a phone number. It shows an estimate and says nothing is charged.
2. [x] It lands as a request with a new parent and pet waiting for review (B4), so staff confirm in one place.

**Rules**

- As M32: anonymous functions listed and tested, rate limited.

---

## M42. Reviews from parents

- [x] Finished 22 October 2026 (J5 in `02`, D47).

**Build**

1. [x] After a stay or service ends, Today lists parents to ask for a review (D39), with a WhatsApp message carrying the
   kennel's review link (a setting).
2. [ ] Later, if wanted (not built): a review page of Wagbook's own, where a parent gives stars and words and agrees to them being
   shown, and owners choose which ones to publish.

---

## Phase 4. The team

## M43. Rota and attendance

- [x] Finished 22 October 2026 (K1 to K4 in `02`, D48).

**Build**

1. [x] Shifts (morning, evening, night) and who works each, including who lives on site.
2. [x] Clocking in and out from the phone; Today shows who is on now.
3. [x] Leave asked for and granted, and a month's attendance sheet for pay.

**Rules**

- A person sees their own attendance; owners and managers see everyone's.

---

## M44. Rough edges before production

- [x] Finished 22 October 2026 (A3, B8, D1b and E5 in `02`, D48).

**Build**

1. [x] Send on a reminder asks whether the message went, instead of marking it sent on the tap.
2. [x] Kennels going in and out of service by date, so past occupancy is measured against the kennels there on that day.
3. [x] The export includes the files (photos and certificates) as well as their names.

---

# Running for real: M45 to M65

Added 22 October 2026, when the owner asked what a kennel will need once it runs on Wagbook every day, and chose the
list below (D49). M45 to M65 are built. The same ways of working hold as for M25 to M44: each milestone starts by
writing its section in `02-product-spec.md` (the table in section L names them all, marked "Planned"), every rule in
`CLAUDE.md` holds, and every word is in English, Hindi and Kannada.

**The order, and why.** Phase 5 comes first because a kennel cannot start without it: people who forget a password are
locked out today, nothing runs by itself overnight, every parent and pet would be typed in by hand, nobody would know
when the site breaks, and photos fill a small storage plan in months. Phase 6 makes the day smoother for staff and
parents. Phase 7 finishes appointments, the parent's link and the rota. Phase 8 is money and stock. Phase 9, several
sites, comes last because it touches the most code.

**Not on the roadmap, by the owner's choice (22 October 2026):** online payment through a payment provider (later),
and messaging many parents at once (not needed).

---

## Phase 5. Before the first kennel

## M45. Sign-in: forgotten passwords, changing a password, Google

- [x] Finished 22 October 2026 (L1 in `02`, D50). Google sign-in is built and switched off by default; it was not tried
  against a real Google account (no Google client here), see `HANDOFF.md`.

**Build**

1. [x] "Forgot your password?" on the sign-in page: Supabase Auth sends a reset link by email, it lands on
   `/auth/confirm`, and the person sets a new password. The same answer whether or not the email has an account.
2. [x] "Change password" under More, for a person signed in. Asks for the current password first.
3. [x] "Continue with Google" on the sign-in page, through Supabase Auth's Google provider. A Google account with the same
   email as an existing account signs in to that account (Supabase links them).
4. [x] `10-setup-and-deploy.md` and `14-self-hosting.md`: how to make the Google OAuth client and switch the provider on,
   and the email template for the reset link. Google sign-in is optional: with no client set up, the button is not
   shown.

**Rules**

- Two-step sign-in still applies after a password reset and after Google: a session without the second step reaches
  nothing in the database, as today (D24).
- Invitation links work the same whichever way a person signs in.
- The reset form counts against the sign-in rate limit (`src/lib/rate-limit.ts`). Google sign-in starts from a link (a
  GET, which the app's limits do not count, so the `form-action` rule can stay `'self'`); Supabase Auth's own limits
  apply to it. Changing a password has a limit of its own.
- The service role key is still never used.

**Done when**

- The e2e walk resets a password through the local Supabase's mail catcher (Inbucket) and signs in with the new one.
- Signing in with Google is walked once on a hosted project by a person, or `HANDOFF.md` says plainly that it was not.

---

## M46. Jobs that run by themselves overnight

- [x] Finished 22 October 2026 (L2 in `02`, D50). Credit that ends, Today's reminders and forgotten clock-outs needed no
  job: Wagbook works each of them out when it is read. The jobs are making deliveries ahead and forgetting old rows.

**Build**

1. [x] A nightly run inside the database with Supabase's `pg_cron`, one job per task, each a plain function that can also
   be run by hand:
   - make food deliveries ahead for every active subscription (what opening the Kitchen does today);
   - forget problems and job runs older than 90 days (M48);
   - not needed as jobs, because they are worked out when read: credit that has run out, Today's reminders, and a
     stretch of attendance still open after its shift (M60 shows it from the rows).
2. [x] More, Problems and overnight jobs: when the last nightly run happened and whether each job worked.
3. [x] Self-hosting: how to switch `pg_cron` on, and what happens without it (the jobs still run when the screens open, as
   today).

**Rules**

- Each job is idempotent: running it twice makes nothing twice.
- The jobs run as the database owner, so each one filters by kennel itself and is tested for it.
- A job that fails leaves a row saying so; it never stops the other jobs.

**Done when**

- A database test runs each job twice and finds the same result as running it once.
- A kennel where nobody opens the Kitchen for a week still has its deliveries made.

---

## M47. Bring in parents and pets from a spreadsheet

- [x] Finished 22 October 2026 (L3 in `02`, D50).

**Build**

1. [x] More, Import: a CSV template to download (parents, their pets, vaccinations), and an upload.
2. [x] A preview before anything is saved: rows that will be added, rows that look like an existing parent (same phone),
   and rows with problems, each with a plain sentence.
3. [x] Import saves the good rows in one go; the rows with problems can be downloaded, fixed and uploaded again.

**Rules**

- Owners and managers only.
- Phone numbers are checked and written as the rest of Wagbook writes them; a duplicate phone is never a second
  parent.
- The whole import is one transaction: all of it or none of it.
- No new library: the CSV reader is a small pure function with unit tests.

**Done when**

- A CSV of 500 rows with mistakes in it previews in seconds and imports the good rows.
- A test feeds every kind of bad row (missing name, bad phone, bad date, unknown species) and gets a sentence for each.

---

## M48. Knowing when something breaks

- [x] Finished 22 October 2026 (L4 in `02`, D50). Errors are written down only while someone is signed in: an error on
  a public page stays in the server's log (writing it would need the service role key).

**Build**

1. [x] `/api/health`: answers "ok" when the app can reach the database, for an uptime service (UptimeRobot, Better Stack
   or similar, free plans) to watch every few minutes.
2. [x] Errors on the server written to a table (time, page, a short message, no personal data), and More, Problems and
   overnight jobs for owners: the last 90 days, the same error once with how often it happened.
3. [x] `10-setup-and-deploy.md`: set up an uptime service that sends a message to the owner's phone when the health check
   fails.

**Rules**

- No parent's or pet's details in an error row. Messages are cut short and stripped of email addresses and phone
  numbers.
- Error rows are kept 90 days.

**Done when**

- Stopping the database makes `/api/health` fail; starting it again makes it pass.

---

## M49. Photo archive: download, then free the space

- [x] Finished 22 October 2026 (L5 in `02`, D49, D50). On its own page, More, Photos and space, rather than in Settings.
  "Archived" is not written under a small copy: the page simply shows the small copy where the photo was.

**Build**

1. [x] More, Photos and space: how much space photos and files take, month by month.
2. [x] "Download photos for a month": a ZIP of every photo taken that month (updates, grooming before and after, a
   rider's door photos, care task proof once M54 adds it; incidents have no photos), in folders by pet, named by date.
3. [x] "Remove these from Wagbook": offered only after that month's ZIP was downloaded, for owners, with "This cannot be
   undone." and a second tap. The full photos are removed from storage; the small copy (480 pixels) stays, so pages
   still show something, with "Archived" under it.

**Rules**

- Photos are already made smaller on the phone before they are sent (1600 pixels on the long edge, JPEG). They are kept
  in full until the owner archives them. Nothing is removed by itself.
- Not archived: vaccination certificates and other health papers, expense receipts (tax records), and pets' own
  photos (staff need them every day).
- Only owners remove (D29). Each archive is a row: which month, who, when, how many files.
- The ZIP is built one month at a time and sent a photo at a time, so it fits in memory on a small server.

**Done when**

- A test removes a month and finds the small copies still there and the full photos gone, and a staff member is
  refused.
- The e2e walk downloads a month and opens the ZIP.

---

## Phase 6. The day, smoother

## M50. Kennel cleaning between guests

- [x] Finished 23 October 2026 (L6 in `02`, D52). Checking into a kennel still to clean is asked, not refused; a sibling still in the kennel keeps it off the list until the last pet leaves.

**Build**

1. [x] After check-out, the kennel shows "To clean" on Today and the calendar until someone taps "Cleaned".
2. [x] Checking a pet into a kennel still to clean asks "This kennel was not cleaned. Check in anyway?".

**Rules**

- Who cleaned and when is kept.
- A kennel out of service is not asked about.

**Done when**

- A database test checks a pet out and finds its kennel to clean, and clean again after "Cleaned".

---

## M51. Jobs that are not about a pet

- [x] Finished 23 October 2026 (L7 in `02`, D52). The checklists and the cleaning are on More, Checklists and repairs; Today shows the opening and closing lists, Care the cleaning.

**Build**

1. [x] Checklists for the day: opening and closing (lights, water, gates locked), each item ticked by whoever did it.
2. [x] Cleaning jobs that repeat (yard daily, deep clean weekly), on Care alongside the pets' tasks.
3. [x] Repairs: something broken (pump, fan, fencing), who reported it, who fixed it, and what it cost, which can become an
   expense.

**Rules**

- Owners and managers set the checklists and repeating jobs; anyone ticks them and reports a repair.

**Done when**

- Today shows the day's checklist and what is left of it.

---

## M52. A pet that has passed away

- [x] Finished 23 October 2026 (L8 in `02`, D52). The reminders stop because what they come from is cancelled; the three read from history (grooms, reviews, food trials) leave the pet out in their queries.

**Build**

1. [x] On the pet page, for owners and managers: "Passed away", with the date.
2. [x] From that day, nothing is sent or made for the pet: no vaccination, groom, health paper or review reminder, no food
   delivery (subscriptions end), no booking requests, and future bookings and appointments are cancelled with no
   charge.
3. [x] Today shows "Send flowers to {parent}", with the parent's address, until someone marks it done. The cost can be
   written as an expense.
4. [x] The pet's page keeps everything, marked "Passed away", and the pet leaves the lists.

**Rules**

- The database stops the reminders, not the screens: every reminder query leaves the pet out, with a test.
- Undo is possible for a week, for a mistake.

**Done when**

- A database test marks a pet with a subscription, a booking and a vaccination due, and finds nothing left to send.

---

## M53. A stay report at check-out

- [x] Finished 23 October 2026 (L9 in `02`, D52). The report is worked out when read; only the words and the picked photos are stored.

**Build**

1. [x] At check-out, a report for the parent on the stay page: nights, meals eaten (of those offered), play sessions,
   weight in and out, any medicine given, incidents (as told to the parent), and the photos staff pick.
2. [x] "Send the stay report" opens WhatsApp with the link, alongside the bill.
3. [x] Staff can add a few words before sending.

**Rules**

- Worked out from what is already recorded (care tasks, play, weights, incidents); nothing is typed twice.
- Internal notes never appear on it.

**Done when**

- A unit test builds a report from a stay's records; the walk sends one.

---

## M54. Photo proof on care tasks, and "Pack all"

- [x] Finished 23 October 2026 (L10 in `02`, D52). A task that wants a photo is not ticked offline. Pack all is walked in the browser after its count (the walk gives the recipe a week's use-by first).

**Build**

1. [x] A care task can ask for a photo (a medicine given, a wound cleaned). The task is done when the photo is added.
2. [x] The routine says which tasks want a photo; the photo goes on the pet's record, not the parent's page, unless staff
   share it.
3. [x] Kitchen, packing: "Pack all" marks every pack of the day packed in one tap, with a count first.

**Rules**

- A photo on a care task uses the same storage rules as other pet photos.

**Done when**

- A task that wants a photo cannot be ticked without one (a database rule, with a test).

---

## M55. A parent's own food and medicines

- [x] Finished 23 October 2026 (L11 in `02`, D52). The days left are tested in the database (`stay_supply_left`); a medicine can be tied to its routine.

**Build**

1. [x] At check-in, what the parent brought: food (packs and grams) and medicines (count), with the daily amount.
2. [x] Care counts it down as meals and doses are ticked; the booking shows "4 days left".
3. [x] A reminder on Today when it will run out before the stay ends: ask the parent, or switch to the kennel's food at
   its price (an extra on the bill).
4. [x] At check-out, what is left goes home: it is listed with the belongings.

**Rules**

- Quantities are whole grams and whole doses.

**Done when**

- A test ticks meals and finds the days left go down, and a reminder appear when they fall short of the stay.

---

## M56. Trial day for new dogs

- [x] Finished 23 October 2026 (L12 in `02`, D52). A trial is marked on the booking page of day boarding, not on New booking.

**Build**

1. [x] A trial visit, booked like day boarding, for a pet before its first stay. Optional: a kennel offers it if it wants;
   nothing requires it.
2. [x] After it, staff note how the pet settled (settled, anxious, reactive with other dogs) and a sentence. It shows on the
   pet page and at check-in.

**Rules**

- A trial never blocks a booking.

**Done when**

- The walk books a trial, notes the result and sees it at the next check-in.

---

## M57. Vet visits during a stay

- [x] Finished 23 October 2026 (L13 in `02`, D52). Staff record a visit and its bill line; the expense is an owner's or manager's, one tap.

**Build**

1. [x] On a stay: "Vet visit", with the reason, the vet, what the vet said, medicines prescribed (which become care tasks)
   and the cost.
2. [x] The cost goes on the stay's bill as a line, and the kennel's spend as an expense, in one step.
3. [x] "Tell the parent" opens WhatsApp with a short message.

**Rules**

- A vet visit is part of the pet's health record and stays with the pet.

**Done when**

- A test records a visit and finds the line on the bill, the expense and the new care task.

---

## Phase 7. Appointments, parents and the team

## M58. Move an appointment

- [x] Finished 23 October 2026 (L14 in `02`, D53). The appointment's own trigger and constraints check the new time;
  `WB270` and `WB271` keep a move to appointments and times still to come.

**Build**

1. "Move" on an appointment: pick a new day and time from the free times. The person and place can change too.
2. The parent gets the new time on WhatsApp.

**Rules**

- The database checks the new time as it checks a new appointment (place, pet and person one at a time, D46).
- A move keeps the appointment, its add-ons and its bill; History of changes shows the old time.

**Done when**

- A test moves an appointment onto a taken time and is refused, and onto a free one and succeeds.

---

## M59. More from the parent's own link

- [x] Finished 23 October 2026 (L15 in `02`, D53). Both go through the link's existing functions
  (`get_public_booking_form`, `submit_booking_request`, `submit_food_request`) and the photo through
  `intake_upload_allowed`: no new public function for the page. Any delivery to the parent can be reported, a trial too.

**Build**

1. A parent books an appointment from their link: the service, the pet, a free time. It lands as a request, as stay
   requests do, and staff confirm it.
2. A parent reports a problem with a food delivery from their link, with a photo. It lands where staff see delivery
   problems today.

**Rules**

- Any new public function is added to the list in `CLAUDE.md`, `tests/db/security.test.ts` and
  `05-security-and-privacy.md`. Prefer extending the link's existing functions.
- Rate limited, and the photo upload checked by a storage policy, as the intake form's certificates are.

**Done when**

- The walk books an appointment and reports a delivery problem from a parent's link in a private window.

---

## M60. A rota that repeats, and forgotten clock-outs

- [x] Finished 23 October 2026 (L16 in `02`, D53). `fill_rota()` fills four weeks ahead from the rota page, after a
  pattern is added, and overnight; a day filled once is never filled again.

**Build**

1. A weekly pattern for each person (Monday morning, Tuesday evening, and so on) that fills the rota week after week
   until changed. A week can still be changed by hand.
2. A stretch still open well after its shift ended shows on Today for owners and managers ("{name} did not clock out"),
   with a one-tap "Clocked out at the end of the shift", which writes the shift's end time with a note.

**Rules**

- Leave still takes a person off the rota on its days, pattern or not.
- The correction is a hand-written time like any other (with a note, in History of changes).

**Done when**

- A test sets a pattern and finds the next four weeks filled, minus a day of leave.

---

## M61. Alerts on staff phones

- [x] Finished 23 October 2026 (L17 in `02`, D53). Pushes carry nothing; the phone asks Wagbook what happened. No
  library: VAPID signing with `node:crypto`. `take_pushes()` is the thirteenth function the anonymous role may call,
  useless without the installation's secret. See `HANDOFF.md` for what the walk could and could not reach.

**Build**

1. Browser notifications (web push) to people who allow them on their phone: a new booking request, intake form, food
   order or appointment request; an incident written down; a bill still unpaid at check-out.
2. Each person chooses which alerts they want, under More.

**Rules**

- An alert says what happened and links to it; it carries no parent's phone number or address.
- No paid service. If a library is needed for the push messages, it needs a decision in `09`.

**Done when**

- An alert reaches Chromium in the walk when a booking request arrives.

---

## Phase 8. Money and stock

## M62. Selling over the counter

- [x] Finished 23 October 2026 (L18 in `02`, D54). Things for sale are stock items with a price; `sell()` prices each
  line and takes the stock out in one step; a walk-in is billed to the kennel's one "Walk-in" buyer.

**Build**

1. Items to sell (treats, toys, collars, shampoo) with a price, tax rate and code, kept in stock like the kitchen's.
2. "Sell" from the parent page or a stay: pick items, they go on a bill (the stay's, or a bill of their own), and stock
   goes down.
3. A walk-in sale with no parent: a bill to "Walk-in".
4. Stock to reorder when it falls below a level.

**Rules**

- Stock is the sum of its movements and never below nothing, as in the kitchen (M26).
- Switched on per kennel in What this kennel offers.

**Done when**

- A test sells the last item and is refused the next one.

---

## M63. Orders to suppliers

- [x] Finished 23 October 2026 (L19 in `02`, D54). Anyone receives against an open order, never more than is still to
  come; `stock_on_order` is taken off the kitchen's shopping list.

**Build**

1. An order to a supplier: items and quantities, sent on WhatsApp.
2. Received in full or in part, which puts the stock in.
3. The supplier's bill recorded against the order, as an expense.
4. The kitchen's shopping list counts what is already ordered.

**Rules**

- Stock goes in on receiving, not on ordering.

**Done when**

- The shopping list stops asking for what is on an order not yet received.

---

## M64. Export for Tally

- [x] Built 23 October 2026 (L20 in `02`, D54): two XML files, ledgers then vouchers, by `src/lib/core/tally.ts`.
  **Not yet imported into Tally by a person**; `HANDOFF.md` says so, and the accountant checks one month first.

**Build**

1. Reports, "Download for Tally": a month's bills, credit notes, payments and expenses as a file Tally can import
   (Tally's XML format), with the ledger names the kennel sets once.

**Rules**

- Written by a small function of Wagbook's own, with unit tests; no new library.
- The accountant checks one month before it is relied on (`HANDOFF.md`).

**Done when**

- A month imports into Tally without errors, checked by a person, or `HANDOFF.md` says plainly that it was not.

---

## Phase 9. Several sites

## M65. Several sites under one owner

- [x] Finished 23 October 2026 (L21 in `02`, D55). `report_sites()` reads each kennel the caller owns through its own
  reports; the app adds them up per currency (`combineSites()`). An owner may now own ten kennels, not five.

**Build**

1. Each site is a kennel of its own in Wagbook, as today; an owner of several sees "All sites" in Reports: occupancy,
   money in, bills owed and expenses, side by side and together.
2. Switching site stays where it is (More, switch kennel); staff working at two sites see both.
3. The limit of five kennels per owner is looked at again.

**Rules**

- Each site keeps its own parents, pets, prices and bills (D49). Combining reports reads each site separately and adds
  them up; it never mixes rows.
- Only an owner of every site sees the combined report.

**Done when**

- A test with two sites and one owner gives the combined totals, and a manager of one site cannot see the other's.

---

## Ideas not scheduled

Kept so they are not lost. Each needs an issue and a kennel reason before it becomes a milestone.

- Online payments through a payment provider, and UPI Autopay for subscriptions (a cost and a new decision). The owner
  will add this later (22 October 2026).
- A link to the kennel's own camera service on the stay page. (Wagbook itself never streams video: cost and privacy.)
- Referral codes, so a boarding parent who brings a food customer is credited (M38).
