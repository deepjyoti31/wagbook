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
next: until then, a groom or a swim can be sold as an extra on a stay. Phase 3 brings boarding up to the public rules
(credit on cancellation, pick-up from home, health papers, a public booking form). Phase 4 is the team. The launch work
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

- [ ] Not started.

**Build**

1. Places that take one booking at a time: the pool, a grooming table, a training ground, the party yard. Each with
   its hours.
2. Appointment services: name, length, the place it uses, time to clean up after, price (fixed, by size, or on quote),
   tax rate and code, the skill it needs, and whether vaccinations are checked.
3. Book an appointment for a pet staying in or visiting for the day: service, date and time, place and person. Free
   times are offered.
4. States: requested, confirmed, done, no-show, cancelled with a reason.
5. Today lists the day's appointments. A day view shows each place as a column, at 360 pixels wide.
6. A boarder's appointment is a line on its stay's bill; a visitor's has a bill of its own.

**Rules**

- The database refuses two appointments in one place at once (with clean-up time), one person in two places, and one
  pet in two places. Times are `timestamptz`; the day is the kennel's (`todayIn()`).
- The price is copied onto the appointment; staff cannot change it (D15).

**Done when**

- Two swims at overlapping times are refused with a sentence; a boarder's groom is on its bill; a visitor's groom has
  its own.

---

## M35. Grooming and spa

- [ ] Not started.

**Build**

1. The grooming menu: bath and dry, full groom, haircut, nails, ears, de-shedding, tick and flea bath, teeth; priced by
   coat and breed (the owner's answer, 21 October 2026): a coat type on the pet (short, double, long, curly, wire) and
   a price for each coat type, with a price for a named breed overriding it; add-ons on top.
2. A grooming card on the pet: coat, the usual cut, products to use or avoid, skin conditions, how the pet behaves on
   the table, the last groom.
3. Before and after photos sent to the parent as an update (D4, F3).
4. "Groom before going home" on a stay: booked on the last day, finished before pick-up.
5. A reminder when a pet is due for a groom again (D39).

**Done when**

- A stay with a groom on its last day, and the parent sees the after photo on the stay page.

---

## M36. Swimming, training and parties

- [ ] Not started.

**Build**

1. Swimming: one dog at a time (M34), with a tick for the life jacket and who supervised.
2. Training: a course of sessions sold as a pack (as M18), priced on quote by the trainer, with notes and homework after
   each session sent to the parent.
3. Birthday parties: the party yard for a set time, the birthday pet and one guest dog it already knows (the guest's
   parent and vaccinations recorded), the number of people, decorations as extras, and a cake from the kitchen.
4. Made-to-order items: a lead time the database checks (24 hours by default), the name to write on it, and delivery on
   a run (M31) with the area's charge.

**Rules**

- A guest dog meets the same vaccination rules as a boarder.

---

## M37. Packages

- [ ] Not started.

**Build**

1. A package: a stay with appointments and extras included (more play, a swim, a groom before going home), at one
   price or a price on request set by a manager.
2. Booking a package books its parts; cancelling the stay cancels them. The bill shows the package as one line.

---

## Phase 3. Boarding as the public rules promise

## M38. Cancellation rules and credit

- [ ] Not started.

**Build**

1. Weekends and holidays: which weekdays count as weekend, and the kennel's list of holiday dates (built on peak
   periods, C7).
2. A cancellation rule for each kind of service: the notice needed, and what happens to each night or appointment with
   enough notice and without it (refund, or keep as credit).
3. Credit: a parent's balance from a cancellation or a goodwill gesture, ending on a set date (12 months by default),
   spent on any bill as a payment, never more than what is left. On the parent page and on bills. A reminder goes on
   Today's list to send (D39) a month before credit runs out (the owner's answer, 21 October 2026).
4. On Cancel, Wagbook works out the refund and the credit night by night, shows both, and a manager confirms. The time
   the parent asked is recorded for the notice rule.
5. When the kennel cancels, the parent chooses a refund or credit.

**Rules**

- Credit is money: a ledger in paise the database keeps from going below zero or being spent after it ends.
- Whether kept credit needs a bill or carries tax is for the accountant (question 11 in `06`).

**Done when**

- The night-by-night arithmetic is a pure function with unit tests for a stay across a weekend and a holiday, cancelled
  with and without enough notice.

---

## M39. Pick-up and drop from home

- [ ] Not started.

**Build**

1. On a booking: pick-up, drop or both, an address (M25) and a time.
2. The price is the area's charge by default, changed by a manager, and is a line on the bill.
3. Trips join the day's run (M31), and the parent is told the time on WhatsApp.

---

## M40. Health papers at the door

- [ ] Not started.

**Build**

1. The kennel's rules: the vaccines it requires and how long each lasts, deworming and tick treatment within a set
   time, and spayed or neutered above a set age.
2. Pets get deworming and tick treatment dates and whether they are neutered; the intake form asks for them.
3. Check-in and appointments refuse or warn (a setting), with the reason. A manager may let a pet in anyway, recorded
   with a note. Reminders go out before a stay when something will be out of date.

**Rules**

- The refusal is a database rule; the override is a row, so History of changes shows who let a pet in and why.

---

## M41. A booking form for new parents

- [ ] Not started.

**Build**

1. A public page for any service the kennel offers: what, when, pick-up, the dog's details, a tick for vaccinations up
   to date, and a phone number. It shows an estimate and says nothing is charged.
2. It lands as a request with a new parent and pet waiting for review (B4), so staff confirm in one place.

**Rules**

- As M32: anonymous functions listed and tested, rate limited.

---

## M42. Reviews from parents

- [ ] Not started.

**Build**

1. After a stay or service ends, Today lists parents to ask for a review (D39), with a WhatsApp message carrying the
   kennel's review link (a setting).
2. Later, if wanted: a review page of Wagbook's own, where a parent gives stars and words and agrees to them being
   shown, and owners choose which ones to publish.

---

## Phase 4. The team

## M43. Rota and attendance

- [ ] Not started.

**Build**

1. Shifts (morning, evening, night) and who works each, including who lives on site.
2. Clocking in and out from the phone; Today shows who is on now.
3. Leave asked for and granted, and a month's attendance sheet for pay.

**Rules**

- A person sees their own attendance; owners and managers see everyone's.

---

## M44. Rough edges before production

- [ ] Not started.

**Build**

1. Send on a reminder asks whether the message went, instead of marking it sent on the tap.
2. Kennels going in and out of service by date, so past occupancy is measured against the kennels there on that day.
3. The export includes the files (photos and certificates) as well as their names.

---

## Ideas not scheduled

Kept so they are not lost. Each needs an issue and a kennel reason before it becomes a milestone.

- Multiple sites under one owner with combined reports.
- Online payments through a payment provider, and UPI Autopay for subscriptions (a cost and a new decision).
- Treats, toys and accessories sold over the counter, from stock (M26).
- A link to the kennel's own camera service on the stay page. (Wagbook itself never streams video: cost and privacy.)
- Referral codes, so a boarding parent who brings a food customer is credited (M38).
