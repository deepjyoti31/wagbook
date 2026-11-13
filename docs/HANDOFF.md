# Handoff

The state of Wagbook right now. Read this first; rewrite it last. Keep it a description of the present, not a diary.

Last updated: 12 November 2026, after the twelve design boards were matched board for board (M71, D61).

## In one paragraph

**M72 (12 November 2026, D61), asked for by the owner ("finish everything"):** the printed bill now matches its board,
the parent's stay page shows the stay's bill with Pay with UPI (a new migration after the freeze,
`20261112000100_stay_page_bill.sql`: `get_public_stay()` also returns the issued bill, who wrote each update by first
name, and when care was last given), and the rest of what the boards show is built: the pet's sex, age and weight in a
stay's head, "N stays before" and a health papers card on New booking, Remind and the months' kennels used and nights on
Reports, one-tap Decline on the calendar, WhatsApp messages that open with their first words typed, and the boards'
shorter words on a tablet and a phone. Every other screen was checked at three widths, and a box inside a card is now a
quiet fill everywhere. **Apply the new migration to the hosted database before deploying** (`db push`).

**M71 (12 November 2026, D61), asked for by the owner:** the screens built in M70 did not match the design boards they
were built from, so the twelve boards (Today at 1440, 820 and 390 pixels, the calendar, a stay, Care, New booking,
Reports, sign in, the printed bill, the parent's stay page and More) were rebuilt against them, each page keeping its
queries and Server Actions. The frontend was not deleted and rebuilt: the page files are where the data is read, and
sixty-five screens have no board. A booking's page is now in tabs (`?tab=`; `?tab=all`, or the cookie
`wb_stay_view=all`, is the long page the walk reads). No database change, no new dependency. What the boards show and
was not built is under "What is NOT verified" and "Open questions". The paragraph below is the state before M71.

Every milestone from M0 to M70 is built: the roadmap is finished but for the ideas not scheduled. The owner finished
M1 (a hosted Supabase project, reported on 4 November 2026), so **the migrations are frozen**: a change to the database
is a new file (the first is `20261104000100_review_fixes.sql`). The Hindi and Kannada have been read by native
speakers. A bug review on 4 November 2026 fixed five things, each with a test: a cancelled stay's refund and credit
left out the tax paid on its nights when prices leave tax out (`unitsWithTax()`); a credit note could take back more
at a tax rate than the bill charged at it (`WB097`); Undo check-out was held to its day and an unissued bill only by the
app (`WB028`, now the database); the food orders page and Today's trial follow-ups read a capped list and could leave
orders and parents out; and a few dates were shown in UTC. Next.js went to 16.4.5 and zod to 4.6.7. M70 (2 November 2026, D59), asked for by the owner: the screens looked basic, so
twelve were designed and agreed first, then built into the shared pieces so every screen changed together. A dark
sidebar with icons, a bookings search and who is signed in; sections are cards with a count pill, and a list straight
in a section runs to its edges; Today opens with four figures and a bar for each kind of care; stays are bars on the
calendar; a stay's page has a header card; sign in and the pages around it share one frame (`AuthShell`); parents'
pages are warmer (`.wb-parent`), and the stay page has the pet's photo large and a WhatsApp button in reach. Icons are
drawn in `src/components/icons.tsx` (no library). No database change. M69 (2 November 2026, D58), asked for by the owner after trying Wagbook on a
real Supabase project: the signed-in screens are laptop first and responsive down to a phone. A laptop has a sidebar
(Today, Bookings, Calendar, Care, Pets, More, then the day's work from More and the money for owners and managers, from
one list in `src/lib/menu.ts`) and a wide page; Today (from 1536 pixels) and the pages of one booking, pet, parent,
bill, appointment and food subscription (from 1280) are in two columns (`Columns`), split where the phone's order
already was, so a phone sees the same order; forms lay out by their column's width (container queries, `@lg:` not
`sm:`); pages that are one form are kept readable (`Narrow`); More is in two columns. A tablet has the bar along the
top, a phone the bar along the bottom, as before. No database change. Both navigations are in the page and one is
hidden, so a browser test should find words by role or inside `main`, not with a bare `getByText`. M68 (25 October 2026, D57), asked for by the owner: a kennel's own website sends
its booking and food forms to Wagbook (`/api/site/{slug}`, Settings, **Your own website**), through the public
functions that already existed, so the anonymous role still calls thirteen; the website's reference number is kept,
shown to staff and used as the UPI note, and a resend is kept once; each area can have its own **delivery days**, which
a subscription and a trial then take; and a made-to-order item (a birthday cake) can be ordered once from the order page
or the website, priced with the area's delivery charge and paid ahead, on a day with notice and with deliveries
(`WB189`, `WB300`). A bug review of the whole code after M67 (24 October 2026) fixed fourteen bugs,
each with a test: one parent's money or credit could pay another parent's bill (now `WB058`, and credit spent on
nothing `WB214`); money paid on a cancelled family, series, appointment, sale or food bill was left on it, and a refund
on a cancelled bill stopped the next one being issued; a stay made already checked in skipped the health papers at the
door; staff could take the delivery charge or tax off a delivery; erasing a parent who had ever had food delivered
was refused (`WB151`, their address could not leave past deliveries), and erasing left their appointment, course,
trip and draft bill notes in the history of changes; a stay made shorter after its discount broke its page and bill; a
cancelled stay's refund and credit were offered again for the money the kennel kept; Going home today left out money
paid on a cancelled bill; Today's unpaid reminders read only the 200 oldest bills; `/book/` had no limit per address
and `/b/` refused a parent's photo of a problem over 1 MB; a food order's weight was dated in UTC; and a supplier's bill
could point into another kennel's folder. M67 (24 October 2026), asked for after the review: Today puts Arriving, a new
**Going home today** and In house straight under the care counts and incidents, with the other notices after them, and
each pet going home says what its parent owes (from its bill, or what Make bill would write now less what was paid
ahead, `owedAtCheckOut()`); Bookings has a search box (pet, parent or phone) and Past pages back 100 at a time. M66 (24 October 2026, D56) is the owner's pre-launch review: the app was walked
as staff and owner at 360 pixels against the local Supabase and six things that would hurt in the first busy weeks were
fixed. A pet checked out now leaves nothing on Care, Play or Today's counts after the moment it left, and its parent's
page no longer says a meal after pick-up was missed (`bookings_end_care_at_check_out`); **Undo check-out** puts a pet
checked out by mistake back, the same day and before its bill is issued; a gone-home booking shows its bill first;
Bills lists every unpaid bill however many bills exist (it used to read balances in one request capped at 1,000 rows,
so past 1,000 bills unpaid ones could show as paid); More is grouped under headings; and the script policy no longer
leaves every page at its loading dots when the build's manifest cannot be read (always under `npm run dev`, and
possibly on a host that leaves the file out). The review's list of what to do before the first real day is under "Do
this next". Phase 9 (M65, `02` section L21, D55) is built: each site is a kennel of its own,
added by an owner from More ("Add another site", up to ten kennels each, `WB012`); an owner of two or more sees **All
sites** under Reports, each kennel they own from its own reports and then added up per currency (nights, day boarding,
how full, billed, received, refunded, spent, owed today), through `report_sites()`, which reads only kennels the caller
owns and refuses anyone who owns none (`WB062`). Phase 8 (M62 to M64, `02`
sections L18 to L20, D54) is built: treats, toys and accessories sold over the counter from the same stock as the
kitchen's (switched on in Settings), each line priced by the database from its item and its stock taken out in the same
step, all or nothing, more than is in stock refused (`WB130`); a sale goes on a stay's bill (until that bill is out,
`WB283`) or on a bill of its own, to a parent or to the kennel's one "Walk-in" buyer (`clients.is_walk_in`: no phone,
no pets, never merged); a manager cancels one made by mistake before its bill goes out and the stock comes back; what
runs low is listed to reorder. Orders to suppliers are placed by managers and sent on WhatsApp, put in stock by anyone
as they come, never more than is still to come (`WB290` to `WB292`), with the supplier's bill an expense once
(`WB293`); the kitchen's shopping list leaves out what is on order and can place the order. Reports downloads a month
as two XML files for Tally (ledgers, then vouchers) with the ledger names the kennel sets once; **not yet imported into
Tally by a person**. Phase 7 (M58 to M61, `02`
sections L14 to L17, D53) is built: an appointment moves to another day, time, place or person from the free times,
checked by the database like a new one (`WB270`, `WB271`), with the new time sent to the parent on WhatsApp and the old
one in History of changes; from their own link a parent asks for an appointment at a free time (a request, on
Appointments under "Asked for by parents") and tells the kennel a delivery went wrong, with a photo (on Food under
"Delivery problems to deal with"), through the link's own functions; each person's usual week fills the rota four
weeks ahead, minus leave and clashes, a day taken off by hand staying off, and a stretch still open two hours after its
shift shows on Today for owners and managers, closed at the shift's end with a note; and alerts on staff phones
(chosen by each person under More) for requests, new forms, food orders, incidents and pets gone home unpaid, where the
push carries nothing and the phone asks Wagbook what happened, signed in. Alerts are off until an installation sets
four settings (`node scripts/push-keys.mjs`); `take_pushes()`, guarded by the installation's push secret, is the
thirteenth function the anonymous role may call. Phase 6 (M50 to M57, `02`
sections L6 to L13, D52) is built: a kennel left by its last pet is "To clean" on Today and the calendar until someone
taps Cleaned, and checking into one asks first; opening and closing checklists on Today, cleaning that repeats on
Care, and repairs whose cost becomes an expense; a pet marked as passed away has its stays, appointments and food
cancelled with no charge, nothing new made for it, and flowers to send on Today (undone within a week); a stay report
for the parent once the pet has gone home, worked out from what was recorded, with the kennel's words and photos;
routines that need a photo, and Pack all in the kitchen; the parent's own food and medicines counted down by the ticks,
with a warning when they will not last; trial days and how they went; and vet visits that put the cost on the bill and
in the expenses and the medicines on the routine in one step. M45 to M65 ("Running for
real", D49) were added on 22 October 2026; Phase 5 (M45 to M49, `02` section L, D50) is built: "Forgot your password?"
by email, Change password under More, and "Continue with Google" when an installation sets it up (`GOOGLE_SIGN_IN=on`);
overnight jobs run by pg_cron in the database (deliveries made ahead, old rows forgotten), each run written down;
parents, pets and vaccinations brought in from a CSV with a preview and the bad lines to download, all or nothing;
`/api/health` for an uptime service and errors on the server listed for owners, scrubbed of contacts; and a photo
archive, a month downloaded as a ZIP and then removed by an owner, the small copies kept. Phase 4 (M43
and M44, `02` section K, D48): shifts and a week's rota planned by owners and managers, who lives on site, clocking in
and out from Today with the time stamped by the database and "On now" for everyone, leave asked for and answered
(never one's own, unless an owner) taking the person off the rota, and a month's attendance for pay with a CSV; a
time by hand is an owner's or manager's, with a note. All of it is switched on in Settings (`keeps_rota`), so a
kennel that leaves it off sees nothing new. M44: Send on a reminder asks "Did the message go?" and takes it off the
list only on "Yes, it went"; kennels go in and out of service from a day, every change kept, and past days are
measured against the kennels there that day; a parent's export is a ZIP of `parent.json` and their files. Phase 3
(M38 to M42, `02` section J, D47): cancellation rules by weekday and weekend or holiday and by notice, worked out night
by night and confirmed by an owner or manager as a refund and credit; credit as a ledger the database keeps (spent on
any bill, never below nothing or after it ends) with goodwill credit and a reminder before it ends; pick-up from home
and drop back home, priced by the area, on the bill and on the day's runs for the rider; health papers at the door
(required vaccines, deworming, ticks, neutering) warned or refused by the database, with a manager able to let a pet
in with a reason, and a reminder before the stay; a public booking form for new parents with an estimate, landing in
Forms from parents through the intake form's own function (still twelve public functions); and review reminders on
Today from a review link. Phase 2,
appointments (M34 to M37, `02` section I, D46): places that take one booking at a time with their hours; grooming,
swims, training and parties priced fixed, by size, by coat and breed, or on quote, with add-ons; free times offered,
and the database keeping a place (with its clean-up), a pet and a person to one appointment at a time; a day's view
with a column per place; a boarder's appointment on its stay's bill and a visitor's on its own; grooming cards, groom
before going home, before and after photos and groom reminders; swims with the life jacket and supervisor; training
courses sold up front; parties with one guest dog and a cake; packages billed as one line with their parts booked by
the database. Phase 1 was the
groundwork (M25), then stock, recipes, food prices and portions, subscriptions and orders, the cook plan and batches,
delivery runs with a rider role, a public food order page, and food reports (M26 to M33, `02` section H). Each is
switched on per kennel (Settings, What this kennel offers): a kennel with the kitchen and delivery off sees exactly
what it saw before, and the 49 boarding steps of the browser walk pass unchanged. The kitchen keeps stock as the sum of
its movements, never below nothing; recipes in versions that never change, with foods a dog must never eat refused;
portions from each dog's weight; subscriptions that make their deliveries ahead in whole packs with the rotation's
recipe, closing to changes at a cut-off; food bills checked by the database like stays and credited for cancelled
deliveries; batches that take stock out and answer who received them; riders, a fourth role that reaches no table
(D45); and twelve public functions now, four for food (`05`). The owner's earlier answers (boarders' food, riders,
monthly payment, credit reminders) are built in. Nothing is left on the roadmap but M1's launch work and the ideas
not scheduled. What has still never happened in the code's own checks: a real phone.

Before Phase 1: M25 added what the kennel offers, parents' addresses matched to the areas served by PIN code, people's
skills, and weights in grams. M20 to M24: going home early and refunds (D40), the waiting list (D42), requests on the
calendar, a series billed by the month (D41), removing a photo, recovery codes (D43). M16 to M19: reminders on Today
(D39), parents' booking links (D36), day boarding regulars and packs (D37), GSTR-1 files (D38). M14 and M15: stays priced
in parts (D32), credit notes (D34), each kennel's own tax rate (D35), the owner's answers on phones, erasure and bills
(D30, D31, D33). Earlier: families (D27), only owners delete (D29), the licence (AGPL), no public demo (D28). The
database rules are tested in-process (`npm run check`: 787 tests in all on 24 October 2026), and the whole day is
walked in a real browser at 360 pixels wide against a **local** Supabase (`npm run test:e2e`, 83 steps).

## What is verified, and how

| Thing | Verified by | Confidence |
| --- | --- | --- |
| M71: the twelve screens beside their boards | Each board rendered to an image from the design's own files, and the screen screenshotted with Playwright on `next dev` against the local Supabase with the demo seed, at the board's width: Today at 1440, 820 and 390, the calendar, a stay, New booking (a pet chosen, a wrong check-out date), Reports and sign in at 1440, Care, More and the parent's stay page at 390. 12 November 2026 | High for layout, sizes and colours; the demo seed is small, so busy states (a full calendar, To send, an open incident, a bill owed) were built from the boards' markup and not seen with data |
| M71: no sideways scroll and no browser errors | Today, the calendar, Care (both views), Bookings, New booking, More, Reports, Bills, Pets, Settings, Checklists and every tab of a stay opened at 1366, 820 and 360 pixels with a script, 12 November 2026 | High in Chromium |
| `npm run check` on the final code | Passes after M72: the dash check, lint, typecheck, 850 tests and the production build, 12 November 2026 | High |
| M71 and M72: the browser walk | `npm run test:e2e` against the local Supabase: 84 steps passing on the final code after M72, 12 November 2026. The walk was updated for the screens that changed shape. No database change.
- 10 November 2026: a bug review fixed three things. (1) A price times a part quantity was multiplied as floats, so
  where the exact product ends in half a paisa (0.35 x 449.50) the app rounded down and the database up, and the bill
  was refused for good (`WB037`): now in whole hundredths (`multiply()` in `src/lib/core/money.ts`, used by
  `computeLine()`, the food bill's monthly discount and the draft line check). (2) "Credit the difference" on a
  visitor's appointment bill always said nothing had changed, because the action read the bill without
  `appointment_id` and `sale_id`: read now, and `ScopeColumns` requires every column. (3) A booking's "What it costs",
  and the total in the WhatsApp confirmation, left out pick-ups, drops and things sold on the stay, which its bill
  includes (`tripAndSaleLines()`). No database change, no new message. `npm run check` passes; the walk (83 steps)
  passes against the local Supabase.

- 10 November 2026, later: four more from the same review. (4) The public forms (`/i/`, `/book/`, `/f/`) read a phone
  number without + as Indian at every kennel, so a British "07911 123456" was kept as +91 79111 23456: they now read it
  by the kennel's country (`normalizePhoneIn()`, unit tested; the pages bind `country_code` from
  `get_public_intake_form`), and the postal code likewise. (5) A second tap on "Flowers sent" wrote the expense
  again, and on a delivery problem made a second replacement: both now happen once (the replacement of a lost race is
  cancelled with the reason "Made twice", stored in English). (6) The service worker kept `/app?done=...` as the
  offline copy of Today, repeating its sentence: only the plain address is kept now (`wb-4`). (7) `PhotoInput` clears
  the small copies of an earlier choice. No database change. Not looked at in a browser beyond the walk: a kennel
  outside India, and the double taps.

- 5 November 2026: the front page is gone (D60), asked for by the owner: "/" goes to `/app`, which opens the kennel
  for someone signed in and the sign-in page (with "Create an account") for anyone else. A redirect in
  `next.config.ts`; its unused word ("Set up your kennel") taken out of the three message files. No database change.

- 4 November 2026: the owner finished M1 and had the Hindi and Kannada read; migrations frozen. A bug review fixed
  five things, each with a test: tax left out of a cancelled stay's refund (unit test), credit notes past a rate's
  billed value (`WB097`, database test), Undo check-out held only by the app (`WB028`, database test), capped lists on
  the food orders page and Today's trial follow-ups, and dates shown in UTC. Both rules in the first migration after
  the freeze, `20261104000100_review_fixes.sql`. Next.js 16.4.5, zod 4.6.7. The walk (83 steps) passed on the new
  Next.js against the local Supabase (images pulled through `mirror.gcr.io` where Docker Hub answered 429).
- 2 November 2026: M70 (D59), asked for by the owner: a finished look. Twelve screens designed on a canvas and agreed,
  then built: tokens, icons, section cards, figures, meters, the dark sidebar, Today's figures, calendar bars, a stay's
  header, Care's rows, form cards, the chart, More, `AuthShell` for sign in and onboarding, warmer parents' pages and
  the bill as a sheet. Two new words on Today in three languages. Checked with sample data at three widths; the local
  Supabase would not start here, so the walk ran in CI, where it found five things the redesign broke (all fixed):
  walk steps that read the old Today sentence and a figure's old classes, button labels that could not wrap, a sidebar
  search label that matched other fields, and money figures too wide for a phone.
- 2 November 2026: M69 (D58), asked for by the owner: laptop first. A sidebar on laptops, the top bar on tablets and
  the bottom bar on phones; two columns on Today and the pages of one booking, pet, parent, bill, appointment and
  subscription; forms by container queries; one-form pages narrowed; More in two columns. The links of More moved to
  `src/lib/menu.ts` (6 unit tests). No database change, no new dependency. Every signed-in screen looked at at four
  widths against the local Supabase; the walk (83 steps) passes at 360 pixels after one step was made to look for
  the exact word "Change" (the hidden sidebar's "History of changes" matched first). Principle 1 in `01`, rule 23 in `CLAUDE.md` and the design system in `03` now say
  laptop first.

- 25 October 2026: M68 (D57), asked for by the owner: requests from a kennel's own website (`/api/site/{slug}`, no new
  public function), delivery days on each area, and a made-to-order item (a cake) ordered once and paid ahead with
  delivery. Two new error codes (`WB189`, `WB300`, a new range); `service_areas.delivery_weekdays`,
  `organizations.website_url`, `food_orders` and `intake_submissions` gained `site_ref`; no new dependency. 14 database
  tests, 15 unit tests; `npm run check`: 816 tests; the walk 83 steps; tried in a browser with a website against the local
  Supabase. Migrations edited in place (not frozen): the first
  hosted database must be made from this work. Also fixed `tests/db/sites.test.ts`, which failed every evening after
  18:30 UTC (it took UTC's date where the bill is dated by the kennel's).

- 24 October 2026: a bug review of the whole code after M67. Fourteen bugs fixed (listed in "In one paragraph"), each
  with a test that fails without the fix: 10 database tests changed or added, 4 unit tests, 1 browser step (the
  discount refused, and a cancelled stay's money settled once). Two new error codes (`WB058`, `WB214`);
  `invoice_balances` gained `issued_on`; no new public function, no new dependency. `npm run check`: 787 tests. The
  walk (83 steps) passes against the local Supabase (images from Docker Hub, where `ghcr.io`'s downloads were refused),
  the changed screens were looked at at 360 pixels, and both races in `scripts/race-checks.sh` held.

- 24 October 2026: M67, asked for after the review: Going home today on Today with what each parent owes, the lists
  moved above the notices, and Bookings searchable with Past paged. 5 unit tests; no database change. `npm run check`: 773 tests; the walk 82 steps.
- 24 October 2026: the owner's pre-launch review (M66, D56). Walked as staff and owner at 360 pixels against the local
  Supabase; fixed care left behind at check-out (a database rule, 2 tests), added Undo check-out, the bill first after
  check-out, every unpaid bill on Bills past 1,000 bills, More grouped, and the script policy that broke `npm run dev`.
  `npm run check`: 768 tests; the walk 82 steps, after fixing its food subscription step, which failed on Saturdays and
  Sundays. No new public function or error code. The list for the first real day is in "Do this next".

- 23 October 2026: Phase 9 built (M65, D55): several sites under one owner, All sites under Reports from
  `report_sites()` (each owned kennel through its own reports, added up per currency in the app), Add another site on
  More, and ten kennels per owner instead of five. 8 database tests (the owner-only rule and the limit each removed
  once to see a test fail), 4 unit tests, 1 browser step (82 in all, passing against the local Supabase). `npm run
  check`: 766 tests. No new public function. The roadmap is finished but for M1.
- 23 October 2026: Phase 8 built (M62 to M64, D54): selling over the counter from stock (a walk-in buyer, sales on a
  stay's bill or a bill of their own), orders to suppliers received into stock with the bill as an expense, and the
  month's file for Tally. 18 database tests (the cap on what comes, the issued stay bill check and the price from the
  item each removed once to see a test fail), 17 unit tests, 3 browser steps (81 in all, passing against the local
  Supabase). `npm run check`: 754 tests. No new public function. The Tally files are not yet imported into Tally.
- 23 October 2026: Phase 7 built (M58 to M61, D53): moving appointments, appointment requests and delivery problems from
  the parent's link, the usual week and forgotten clock-outs, alerts on staff phones (pushes that carry nothing).
  28 database tests (each new rule removed once to see its test fail), 4 unit tests, 4 browser steps (78 in all,
  passing against the local Supabase). `npm run check`: 719 tests. The thirteenth public function is `take_pushes`.
  CI's walk then failed at the alerts step: Playwright's headless shell reports notifications as denied, so the walk
  now uses Playwright's full Chromium (`channel: "chromium"`) where no browser is preinstalled, and the alerts page
  waits for the service worker on a first visit.
- 23 October 2026: Phase 6 built (M50 to M57, D52): kennels to clean, checklists and repairs, a pet that passed away,
  the stay report, photo proof and Pack all, food and medicines from home, trial days, vet visits. 16 database tests
  (each new rule removed once to see its test fail), 6 unit tests, 3 browser steps (74 in all, passing against the
  local Supabase, images pulled through `mirror.gcr.io` where Docker Hub answered 429). `npm run check`: 687 tests.
- 23 October 2026. Next.js and `eslint-config-next` 16.4.0 to 16.4.1, the first release outside three advisories
  (image optimization with SVG, Server Actions denial of service, `use cache` with typed arrays); D51 says how exposed
  Wagbook was. `npm run check` (665 tests) and the 71-step e2e walk pass on it, with Phase 5 merged in. Before the
  upgrade the build stopped with Next.js's "SecurityFatalError" notice. `npm audit` still lists `braces` through
  `eslint-config-next` (lint time only, see D51). CI's walk once failed at "Switch to" after Join: the step went on
  before Join's redirect; it now waits for `/app` after Join and after Switch.
- 22 October 2026: Phase 5 built (M45 to M49, D50): passwords and Google, overnight jobs, import, problems, photo archive.
- 22 October 2026: the owner chose what comes after M44; M45 to M65 written into the roadmap, `02` section L and D49.

- 22 October 2026. Phase 4, M43 and M44: shifts, the rota, living on site, clocking in and out with On now on Today,
  leave, the month's attendance and its CSV (D48); Send asks whether the message went; kennels in and out of service
  by date, with past occupancy counted against the kennels there that day; the export as a ZIP with the files.
  e2e walk extended to 67 tests, run against the local Supabase (images pulled through `mirror.gcr.io` where the registry
  refused). The walk found the "Add morning, evening and night" and leave answers losing their sentence with their
  form; they now go back to the page with `?done=`.

- 22 October 2026. Phase 2, M34 to M37: places, services and prices, appointments held by the database by place, pet
  and person, the day's board, bills for boarders and visitors, grooming cards and reminders, swims, courses, parties,
  made-to-order lead time, packages (D46). 34 database tests, 5 browser steps (60 in all), run against the local
  Supabase (images pulled through `mirror.gcr.io` when Docker Hub and ECR refused).

- 22 October 2026. Phase 1, M26 to M33: stock, recipes, food prices and portions, subscriptions and orders, the cook
  plan and batches, delivery runs and riders (D45), the food order page (four more public functions, twelve in all),
  food reports. e2e walk extended to 55 tests, run against the local Supabase (images pulled through `mirror.gcr.io`,
  then Supabase's own registry when Docker Hub refused). The walk found row actions whose sentence vanished with the
  row (cancel a delivery, put a stop on a run, confirm an order, deal with a problem, a rider marking a stop): they now
  go back to the page with `?done=`, as elsewhere. Counts of packs, stops and days read "1 pack", not "1 packs".

- 21 October 2026. M25: what the kennel offers, parents' addresses and areas served, skills, weights in grams (D44).
  e2e walk extended to 49 tests, all passing against the local Supabase (images pulled through `mirror.gcr.io`).
  The owner's answers on boarders' food, riders, monthly payment, credit reminders and grooming prices recorded in
  the roadmap.
- 21 October 2026. Roadmap extended to M44 for appointments, the kitchen and food subscriptions (D44); the example
  kennel's public rules for those added to `13`; questions 13 to 15 added for the accountant in `06`. Docs only.

- 21 October 2026. M20 to M24, asked for by the owner: refunds and going home early (D40), the waiting list (D42),
  requests on the calendar, a series billed by the month (D41), removing a photo, recovery codes (D43). e2e walk
  extended to 48 tests, run against the local Supabase (images pulled through `mirror.gcr.io`).
- 21 October 2026. M16 to M19: reminders to send on Today, booking requests through a parent's own link, repeating
  day boarding and day boarding packs, GSTR-1 files. e2e walk extended to 43 tests.
- 21 October 2026. M15: credit notes (bill page, parent's bill, reports, download) and the kennel's own tax rate and
  SAC code per stay and per extra.
- 21 October 2026. M14, the owner's answers: stays priced in parts (`stay_charges`: nights alone, day boarding then
  boarding), parents' phone numbers for managers, erasure keeps pets, bills in English with a translation on request,
  and GST and DPDP research for the accountant and lawyer. e2e walk extended to 39 tests.

- 20 October 2026. Only owners delete (D29): every delete policy, erasing a parent (`WB074`), a second tap on every
  deletion, and a deleted expense removes its receipt.
- 19 October 2026. The owner's decisions recorded (licence, no demo, independent of any kennel). M11: shared kennels
  with a shared price and one bill per family; siblings play together. M12: kennels named freely. M13: server pet
  search, staff menu, history field names, second intake card, incident corrections. e2e walk extended to 36 tests.
- 16 October 2026. Rough edges: the cloud session hook reinstalls when `package-lock.json` changes; bill stay lines
  read "14 Apr 2027"; New booking searches pets and offers only free kennels; currency and financial year start fixed
  once a bill is issued (`WB052`); pets and parents hidden from lists and shown again (`WB019`); a booking's kind of
  stay changed by owners and managers. e2e walk extended to 34 tests.
- 15 October 2026. M9 (script policy with nonces and hashes, rate limits, two-step sign-in in the database, export and
  erase, intake certificates, backup drill, second review with races 6 and 16 staged) and M10 (Docker image and
  Compose with Caddy, public demo mode and nightly reset, templates, code of conduct, changelog, releasing, owner's
  guide with pictures); e2e walk extended to 33 tests.
- 15 October 2026. M8 (every word in message files, by five helpers working in parallel; Hindi and Kannada drafts
  by six translators; each person's language and the parents' language; ticks saved offline; a service worker for
  Today and Care; the daily summary); e2e walk extended to 29 tests.
- 14 October 2026. M7 (reports as functions that refuse staff, expenses with receipts for managers only, CSV
  downloads, history of changes); e2e walk extended to 25 tests.
- 14 October 2026. M6 (pet and parent pages, search, vaccination warnings, incidents, people, invitation links,
  merging parents); fixed another vanishing success message (incident buttons).
- 14 October 2026. M4 (bills, payments, UPI QR, printing; staff issue only bills that match the booking) and M5
  (photos, updates, stay page photos through a token-checked storage policy, certificates) built; e2e walk extended to
  18 tests.
- 13 October 2026. M2 and M3 built; price made manager only (D15); M1 done against a local Supabase (seed, config,
  Playwright walk, CI job); fixed success messages that vanished on Today and the booking page, and forms losing what
  was typed after an error.
- 8 October 2026. M0: foundation built; two review passes and fixes (see `05`, review log); documentation written.
