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

- [ ] Not started. **Do this first.** Nothing in M0's screens has run against a live project.

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

- [ ] Not started.

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

- [ ] Not started.

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

- [ ] Not started. Read [06-billing-and-gst.md](06-billing-and-gst.md) first.

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

- [ ] Not started.

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

- [ ] Not started.

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

- [ ] Not started.

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

- [ ] Not started.

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

- [ ] Not started.

**Build**

1. Script-src Content Security Policy with nonces.
2. Rate limiting for the intake form and sign-in at the edge, or a privacy-respecting challenge on the intake form.
3. Export everything about one parent as a file. Erase a parent on request, keeping issued invoices with the buyer
   details the law requires.
4. Two-factor sign-in for owners.
5. A documented backup and restore drill.
6. A second independent security review. Log it in `05`.

---

## M10. Ready for the world

- [ ] Not started.

**Build**

1. A self-hosting guide with Docker Compose (self-hosted Supabase plus the app).
2. A public demo with seeded, invented data that resets nightly.
3. Issue and pull request templates, a code of conduct, a release process and changelog.
4. A short guide for a kennel owner, with screenshots, written for someone who has never used such software.
5. Confirm the licence decision (see `09-decisions.md`, D2) before the first public announcement.

---

## Ideas not scheduled

Kept so they are not lost. Each needs an issue and a kennel reason before it becomes a milestone.

- Recurring day boarding (every weekday).
- Waiting list when full.
- Packages and prepaid passes.
- Parent self-booking requests from a public page.
- Multiple sites under one owner with combined reports.
- Staff rota and attendance.
- Stock of food and medicines.
- Grooming appointments by time slot.
- Cameras. (Probably never: cost, privacy, and it is not what a register is for.)
