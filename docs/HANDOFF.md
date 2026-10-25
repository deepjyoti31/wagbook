# Handoff

The state of Wagbook right now. Read this first; rewrite it last. Keep it a description of the present, not a diary.

Last updated: 25 October 2026, after M68 (orders from a kennel's own website, delivery days by area, cakes).

## In one paragraph

Every milestone from M2 to M68 is built, and the launch work in M1 waits for the owner: the roadmap is finished
except M1 and the ideas not scheduled. M68 (25 October 2026, D57), asked for by the owner: a kennel's own website sends
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
not scheduled. What has still never happened: a **hosted** Supabase project (the rest of M1) and a real phone. **The Hindi and Kannada are first drafts.**

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
| M68: an area's delivery days decide a subscription's and a trial's days; a cake is priced with delivery, needs notice and a delivery day, and is confirmed into its delivery even after the notice passed; a resend with the same reference is kept once; the website address is an origin | `tests/db/website-orders.test.ts`; the area days, the resend index and the confirm exemption each removed once to see a test fail | High |
| M68: reading a website's request (`SiteRequest`, `bookingPayload()`, `foodPayload()`, `originAllowed()`, `isWebsiteOrigin()`) | `src/lib/site-request.test.ts` | High |
| M68 in a browser: a kennel's website (served locally) sent a boarding request, a grooming request, a subscription ("I have paid" too), a cake refused on Sunday and taken on Wednesday, and an order outside the areas to a real Wagbook on the local Supabase; another origin refused; a resend kept once; a cake ordered on `/f/` and confirmed by staff; Orders and requests, Forms from parents, Areas, Settings and `/f/` looked at at 360 pixels | By hand with Playwright, 25 October 2026; the walk (83 steps) passes against the local Supabase. Its first run that day failed once at the booking form for new parents (`/book/`, not changed in M68): the drop-off date typed came back empty, as if the page reset it as it loaded. The second run passed. Watch for it | High for the local stack |
| Every migration applies in order | `tests/db/smoke.test.ts` on PGlite, and `supabase start` / `supabase db reset` on Supabase's Postgres 17.11 image (CLI 2.120.0) | High |
| `supabase/seed.sql` applies and builds the demo kennel | `tests/db/seed.test.ts`, and the local Supabase | High |
| Tenant isolation, role limits, the anonymous surface | `tests/db/security.test.ts`, `hardening.test.ts` | High |
| No double booking, capacity, same-day turnover, day boarding | `tests/db/bookings.test.ts` | High |
| Price only set or changed by owners and managers (D15), families one parent, requests hold no space, extending over a conflict refused, checklist stamps | `tests/db/bookings.test.ts`; each rule removed once to see its test fail | High |
| A skipped medicine needs a note; a double tap keeps the first who and when; the stay page counts what was ticked; play hours; moving a play session | `tests/db/care.test.ts`; the medicine rule removed once to see its test fail | High |
| Invoice numbering, freezing, voiding, tax checks, payments | `tests/db/billing.test.ts` | High |
| TypeScript and SQL agree on every bill: three tax modes, prices with and without tax, other-state GST, rounding on and off, odd paise, discounts, zero rate, the worked example in `06` | `tests/db/bills.test.ts` | High |
| Staff issue only a bill that matches its booking (`WB050`); one live bill per booking; advances join the bill; drafts saved in one go | `tests/db/bills.test.ts`; each rule removed once to see its test fail | High |
| The bug review after M67: a payment is the money of its bill's or stay's parent (`WB058`), credit is spent on a bill or a stay (`WB214`); a voided bill's payments, refunds with them, move to the next bill for the same thing; a stay made already checked in meets the health papers; staff change no delivery's kind, charge or tax; a parent with past deliveries can be erased, each delivery keeping its charge; erasing scrubs appointments, courses, trips and draft bills from the history; a discount never takes more than its line; a food order's weight dated by the kennel's calendar; a supplier's bill stays in its kennel's folder | `tests/db/credit.test.ts`, `bills.test.ts`, `trips-and-health.test.ts`, `subscriptions.test.ts`, `privacy.test.ts`, `appointment-services.test.ts`, `stay-charges.test.ts`, `food-orders.test.ts`, `media.test.ts`; each rule removed once to see its test fail | High |
| A cancelled stay's money is settled once (`cancelledStayMoney()`, `stillToSettle()`); the discount cap in `wholeStayCharge()`; rate limits on `/book/` and the photo limit on `/b/` | `src/lib/core/cancellation.test.ts`, `stay.test.ts`, `src/lib/rate-limit.test.ts`; the settling rule broken once to see its tests fail | High |
| The bug review after M67 in a browser at 360 pixels: a discount above the stay refused in words; a cancelled stay paid ₹9,000 for a ₹1,200 night offers "Refund ₹1,200", says Done, and on a later visit offers nothing more (the ₹7,800 kept shows as an advance); Today lists a bill issued five days ago as "Bill unpaid" | `npm run test:e2e` against the local Supabase: 83 steps passing, 24 October 2026; and a one-off script for the screenshots, the bill's date set back by hand | High for the local stack |
| The UPI QR code scans back to the exact pay link | `src/lib/core/qr.test.ts`, decoded with `jsqr` | High |
| Photos on a stay page reach only the holder of that stay's link, only shared ones, only while the stay is live; stored paths stay in their kennel; another kennel cannot read a file | `tests/db/media.test.ts`; rules removed once to see the tests fail | High |
| Location data is removed from photos | `src/lib/core/jpeg.test.ts`; and end to end, a real JPEG with planted GPS data comes back from Storage without it, resized to 1,600 pixels | High |
| Printed bills | Printed to A4 PDF from Chromium for all three tax modes (no tax, India GST, one tax): white page, no buttons, everything in `06` | Medium: looked at, not compared by an accountant |
| Intake form with hostile input, accepting, reviewing once, stay page contents and expiry | `tests/db/intake.test.ts`, `hardening.test.ts` | High |
| Pure logic: dates, money, GST, invoice numbers, play planning (including around existing sessions), peaks, calendar grid, UPI, WhatsApp, vaccination status and warnings | `src/lib/core/core.test.ts` and others (60) | High |
| Invitation links (who makes them, single use, expiry, withdrawal), merging parents (pets, stays, issued bills, payments move; printed buyer kept), suspend and restore | `tests/db/people.test.ts`; rules removed once to see the tests fail | High |
| Reports refuse staff, other kennels, strangers and the anonymous role (`WB060`); a member of two kennels gets only the one asked for; occupancy counts nights not check-out days and leaves out requests and cancellations; money by month (payments, refunds, expenses; cancelled bills left out); tax by rate equals the bill's own arithmetic; extras ranked; receipt files for owners and managers only | `tests/db/reports.test.ts`; the role check and the receipt rule each removed once to see the tests fail | High |
| CSV files: quoting, CRLF, byte order mark, formula-looking text defused; month arithmetic; the history in words | `src/lib/core/reports.test.ts`, `src/lib/history.test.ts` | High |
| Generated types and reference docs match the migrations | `tests/db/generated.test.ts` | High |
| The signed-in screens work through PostgREST, real Auth and real Storage | `npm run test:e2e` against the local Supabase: sign in, check in with checklist, double booking refused with the right sentence, staff sees no price box, family request then confirm, extend an overstay, care round with a double tap, plan and tick play, cancel with a reason, parent intake form in a private window then accept and book, stay page in a private window, manager price change and extra, calendar books from an empty square, sign up, create a kennel, add kennels, invite, join, switch, sign out, an advance, check out then make, issue and pay a bill (the parent sees the QR and then "Paid in full"), a manager edits a draft bill, a pet photo and an update with a photo seen by the parent, a vaccination with a PDF certificate, search by phone and parent name, a pet's details changed and a high incident shown on Today until dealt with, a parent's details changed and a duplicate merged in, a new person joining through an invitation link then suspended and restored, an expense with a receipt (staff refused reports, expenses, history and downloads), the month's report and all four downloads, the history filtered to one person's booking changes | High for the local stack |
| Every screen at 360 pixels wide, no sideways scroll, no browser errors | In English, Hindi and Kannada (M8). Screenshots of Today, Bookings, booking page (staff and manager), New booking, Calendar, Care, Play, More, Daily routines, Play yards, Extras, Peak periods, Bills, a bill, the parent's bill, Write update, the stay page with photos, a pet, an incident, a parent, People, search, Reports, Expenses, History of changes. M9 and M10 (15 October 2026): the sign-in code page,
two-step sign-in (set up with the picture, and on), the parent page's export and erase section, the intake form with a
certificate field (English and Kannada), More in Hindi, the demo sign-in page; and the fourteen pictures in
`docs/guide/` | Medium: desktop Chromium at phone size, not a phone |
| Each person's language is theirs alone, in every kennel they work at; parents' language set by owners and managers; the consent wording stored in the language the parent read | `tests/db/languages.test.ts`; the own-rows rule removed once to see its test fail | High |
| Every message exists in all three languages with the same placeholders; every database error code has a sentence | `src/messages/messages.test.ts`, `src/lib/errors.test.ts` | High for completeness, none for quality (see below) |
| Language plumbing: placeholders, plurals by each language's rule, Accept-Language, values in bold | `src/lib/i18n.test.ts` | High |
| English screens unchanged by the move to message files | The 25 end-to-end tests from before M8 pass unchanged | High |
| Hindi and Kannada on screen | End-to-end: a manager switches to Hindi (navigation, Today, Settings, a booking in Hindi), and the kennel's stay page reads in Kannada for a parent. Every main screen screenshotted in both at 360 pixels: none wider than the phone | Medium: looked at, not read by a native speaker |
| Ticks made offline: kept once however often tapped, cleaned of junk, sent and forgotten | `src/lib/offline-ticks.test.ts`; end-to-end: tick with no connection, see "not sent yet", reconnect, see it sent | High |
| Service worker: Today and Care open with no connection, scripts included; other pages show the offline page; the sign-in page forgets the copies | End-to-end, with every request to the site cut off | High in Chromium |
| Daily summary text | `src/lib/core/core.test.ts`; end-to-end checks the WhatsApp link | High |
| Pages run only the app's own scripts: fresh nonce per request, the shell's two inline scripts by hash, an injected script refused, no browser errors on the main screens | `src/lib/csp.test.ts` (fails if React or Next.js change how they write those scripts); end-to-end; and the Docker image behind Caddy | High in Chromium |
| Rate limits: the 21st sign-in post from one address in ten minutes gets the sentence, not the database; forged `X-Real-IP` and `X-Forwarded-For` do not help behind Caddy | `src/lib/rate-limit.test.ts`; end-to-end; 22 forged tries through the Compose stack | High on one server |
| Two-step sign-in: a password-only session reaches no kennel, no membership, no own-membership function (`WB005`), and cannot enrol a new authenticator, through the API; turning on, signing in with the code, turning off | `tests/db/privacy.test.ts` (the rule removed once to see it fail); end-to-end with real Supabase Auth and a computed TOTP code, plus a direct Supabase client as the thief | High |
| Export and erase: owners and managers only, another kennel gets "not found", refused while in house or still to come; afterwards only bills, payments and bare stays remain, no personal text in the history, the record stays hidden, the phone number is free | `tests/db/privacy.test.ts` (the history redaction removed once to see it fail); end-to-end: a downloaded export, then erasure, then the certificate file gone from real Storage | High |
| Certificates on the intake form: one per pet, only with the form's own secret, only for an hour and while waiting, cannot be read back, replaced or removed; staff see them and accepting puts them on the vaccinations | `tests/db/privacy.test.ts` (the hour removed once to see it fail); end-to-end through real Storage | High |
| Races 6 and 16 from the first review | `scripts/race-checks.sh` with two live sessions on the local Supabase's Postgres 17 | High |
| Backup and restore: 61 tables, invoice numbering, 90 policies, 24 tables with row level security, 6 public functions, 75 triggers and every file survive a dump and restore | `scripts/backup-drill.sh` on the local Supabase | High locally; the hosted round trip not done |
| The Docker image and `deploy/compose.yml` with Caddy: both addresses, sign-in, main screens, demo notices | Built and run here against the CLI's Supabase (`docs/14-self-hosting.md`, "What has been verified") | High for that setup |
| New booking: the pet search (name, breed, parent, phone digits) and only free kennels offered for the dates typed | `src/lib/core/bookings.test.ts`; end-to-end (K05 hidden while Coco holds it, offered again from the day she leaves; a pet found by phone digits); screenshot at 360 pixels, 16 October 2026 | High |
| Currency and financial year start fixed once a bill is issued, including a cancelled one (`WB052`); drafts do not count | `tests/db/billing.test.ts` (the trigger removed once to see it fail); Settings shows both locked and still saves, checked in a browser at 360 pixels against the local Supabase | High |
| Hiding a pet or parent: owners and managers only, refused with a stay requested, confirmed or in house, a parent's pets go and come back with them (not ones hidden before), a pet waits for its parent | `tests/db/people.test.ts` (the triggers removed once to see the tests fail); end-to-end: a manager hides a new pet, it leaves search, is found under Hidden pets and shown again, and a pet with a stay to come is refused with the sentence | High |
| Owners and managers change a booking between boarding and day boarding; the kennel overlap then follows the new kind | `tests/db/bookings.test.ts` (staff refused with `WB022` already tested there); end-to-end: a manager turns a request into day boarding and back | High |
| Two pets of one parent share a kennel; never three (`WB027`, even with overbooking allowed), never another parent's pet; capacity counts kennels in use; a sibling's kennel is offered while it has room; the occupancy report counts kennels used | `tests/db/families.test.ts`; each rule removed once to see its test fail | High |
| The shared kennel price: staff may book it only for a pet really sharing (`WB023` otherwise); only on stays, not extras | `tests/db/families.test.ts` (the check removed once to see it fail) | High |
| A family booked together pays on one bill: a pet of it is never billed alone (`WB053`), one live bill per family, staff issue it only as the bookings price it, cancelled pets left off, advances on any pet count; a family stays the family it was booked as (`WB026`); merging parents keeps a family together, play sessions included | `tests/db/families.test.ts`; rules removed once to see the tests fail. Merging a parent with a family booking used to be refused (`WB024` mid-merge); fixed | High |
| Siblings play together; different parents never share a yard; the planner gives siblings sharing a kennel the same slots | `tests/db/families.test.ts`, `src/lib/core/core.test.ts` | High |
| New booking "One kennel together", the shared price, "Shares K09 with Luna", both pets in K09's square on the calendar, the family bill with both pets | End-to-end; screenshots at 360 pixels, 19 October 2026 | High for the local stack |
| Naming kennels: add one with its own name, rename, move to the top; a taken name refused | End-to-end at 360 pixels | High |
| Incidents corrected only by owners and managers (`WB080`); staff still mark told and dealt with | `tests/db/care.test.ts` (the rule removed once to see it fail); end-to-end | High |
| A second vaccine and card on the intake form: `pet-N-2` accepted, `pet-N-3` refused, each card on its own vaccination after accepting | `tests/db/privacy.test.ts` (the matching removed once to see it fail); end-to-end through real Storage | High |
| New booking finds a pet not in its starting list, by parent's name and by phone digits | Checked by hand against the local Supabase with 41 extra parents, 19 October 2026 (not an automated test) | Medium |
| Staff do not see Reports, Expenses or History of changes under More | End-to-end | High |
| Only owners delete: every kind of record, a person (anyone may still leave), a file, and erasing a parent (`WB074`); managers and staff touch nothing | `tests/db/deletion.test.ts`; the rules removed once to see the tests fail | High |
| Deleting takes two taps, and an expense takes its receipt with it; a manager is not offered Remove | End-to-end (the receipt's link stops working); screenshot at 360 pixels, 20 October 2026 | High |
| History of changes in the reader's language | `src/lib/history.test.ts`; end-to-end ("Price per night or day: was ...") | High |
| A pet at the shared price: nights shared at that price, nights alone at the usual price; a sibling checked out early counts up to that day; one cancelled or in another kennel does not; the discount on the largest line; staff must book the usual price for nights alone (`WB023`) and cannot change it (`WB022`); staff issue the split bill and not the unsplit one (`WB050`) | `tests/db/stay-charges.test.ts`, `tests/db/families.test.ts`; the split and the staff rule each removed once to see the tests fail | High |
| Day boarding turned into boarding: days then nights, each at its price; first night inside the stay and a day price (`bookings_boarding_from_inside_stay`, `bookings_day_part_has_a_price`); staff refused (`WB022`); staff issue it only as days then nights | `tests/db/stay-charges.test.ts` | High |
| The booking page's split costs, Staying overnight, and a sibling leaving early | End-to-end at 360 pixels, 21 October 2026 | High for the local stack |
| Only owners and managers change a parent's phone or other number (`WB002`); staff still change the rest and add parents | `tests/db/people.test.ts` (the rule removed once to see it fail); end-to-end: staff see no phone box | High |
| Erasing keeps the pets (details, photo, vaccinations without the card, routines, incidents), deletes updates, forms and certificate files | `tests/db/privacy.test.ts`; end-to-end (the certificate's link stops working) | High |
| Bills in English; the parent's language in brackets after each heading when asked (`clients.bill_translation`) | `src/lib/bill-words.test.ts`, `tests/db/languages.test.ts`; end-to-end ("Bill (बिल)") | High |
| Credit notes: part and whole of a bill, own numbers per year, never more than is left (`WB092`), a rate the bill charged (`WB093`), reason (`WB091`), owners and managers only, sums checked (`WB037`), not writable or deletable by anyone, on the parent's bill; an earlier month's tax invoice and a credited bill not cancelled (`WB095`, `WB096`); reports and the money report count them in their own month; prefix `CN` refused | `tests/db/credit-notes.test.ts`; the month rule and the limit each removed once to see the tests fail; `src/lib/billing.test.ts` | High |
| A credit note made on the bill page, owed shown as paid over, Cancel replaced by a sentence, the parent opens the credit note | End-to-end at 360 pixels | High for the local stack |
| Tax rate and SAC code per stay and per extra, typed as a percent and 4 to 8 digits | `src/lib/core/tax-input.test.ts`; Settings and Extras looked at in a browser at 360 pixels | Medium: not walked by an end-to-end test |
| Reminders: which are due (vaccination within a week, arrivals and pick-ups tomorrow, unpaid three days), once sent gone, an unpaid bill back after three days; the sent record stamped and never changed | `src/lib/core/reminders.test.ts`, `tests/db/care.test.ts`; end-to-end: Send opens WhatsApp and the reminder leaves the list | High |
| Booking requests: the link shows only the parent's own pets and stays; requests at the usual price holding no kennel; other parents' pets, past or long dates, a kind with no price, a flood and a switched-off kennel refused; a new link ends the old; the token cannot be set by hand | `tests/db/requests.test.ts`, `tests/db/security.test.ts` (eight public functions); end-to-end from a private window | High |
| Packs: paid days at ₹0, never beyond the days bought (a family counts each pet), inside the dates, for the pack's parent; requests hold none until confirmed; staff move a day onto a pack but not off; sold only by owners and managers; packs move when parents merge; a series is day boarding | `tests/db/regulars.test.ts`; `src/lib/core/bookings.test.ts` (series dates, which pack pays); end-to-end: a pack sold and issued, seven repeating days paid from it | High |
| GSTR-1 sheets: b2b, b2cl over ₹1 lakh to another state, b2cs net of credit notes, cdnr, hsn, docs with cancelled bills | `src/lib/core/gstr1.test.ts` | Medium: column names not checked against the GST offline tool; not walked in a browser (the demo kennel charges no tax) |
| Refunds: never more than was paid over a bill less its credit notes (`WB121`), or than a stay's advance (`WB122`), always naming one (`WB120`); a payment changed later is checked too | `tests/db/refunds.test.ts`; the rule removed once to see the tests fail | High |
| Going home early: billed to today (a boarding stay keeps its first night) or as booked; the bill page offers the credit note for the difference, worked out on the server, then the refund | `src/lib/core/bookings.test.ts` (`shortenedEnd`); end-to-end: a paid bill credited ₹2,400 and refunded, a bigger refund refused; screenshots at 360 pixels, 21 October 2026 | High for the local stack |
| The waiting list: the place in line stamped by the database and never moved, cleared when answered, only for requests; which would fit now, first in line first, not on days the pet already stays, past stays left out | `tests/db/waiting-list.test.ts`; the stamp removed once to see the test fail; end-to-end: New booking, the request's page, the calendar row, Today's Tell the parent and Confirm | High |
| A series billed by the month: one line for each price, extras with their dates, staff issue it, a day never billed alone (`WB055`), one live bill a month, a series of the bill's parent (`WB056`), advances taken in, a billed day kept in its month (`WB057`) | `tests/db/series-bills.test.ts`; the `WB055` rule removed once to see the test fail; end-to-end: Make the bill for the month and issue it | High |
| A photo taken off an update only by an owner (`WB081`), and the stay page stops showing it | `tests/db/media.test.ts` (the rule removed once to see it fail); end-to-end through real Storage | High |
| Recovery codes: made only at `aal2` with a factor (`WB005`, `WB006`), ten, hashed, sealed; one lets one session in, once; a used or wrong one refused (`WB007`); new codes void old ones; a new authenticator voids codes and the sessions they let in | `tests/db/recovery-codes.test.ts` (the session check removed once to see it fail); end-to-end against the local Supabase Auth (its tokens carry `session_id`) | High for the local stack |
| What the kennel offers: off for a new kennel, delivery refused without the kitchen, switched by owners and managers only; the intake form told whether to ask for an address | `tests/db/groundwork.test.ts`; the rule removed once to see it fail; end-to-end: the database's sentence, then saved | High |
| A parent's addresses: anyone adds, owners and managers change, owners delete, PIN code and https map link checked, never another kennel's parent; in the export, moved on merge, deleted on erasure; a new parent's intake address becomes their home | `tests/db/groundwork.test.ts`, `tests/db/intake.test.ts` (the update policy, the merge and the erasure line each removed once to see the tests fail); end-to-end: added, "We deliver here", staff not offered Change | High |
| Areas served: one row a PIN code, no negative charge, staff refused | `tests/db/groundwork.test.ts`; end-to-end: added and shown | High |
| Skills: set by owners and managers from the list, not by staff | `tests/db/groundwork.test.ts`; end-to-end: Cook set on People | High |
| Weights in grams: the pet carries the latest by date whatever is written to it, corrected by owners and managers, removed by owners; in the export; the intake form's weight is the first weighing | `tests/db/groundwork.test.ts`, `tests/db/intake.test.ts` (the trigger and the delete policy each removed once to see the tests fail); `src/lib/core/groundwork.test.ts`; end-to-end: trend, target and a new weight | High |
| M25 screens at 360 pixels (Settings, Areas you serve, a parent's addresses, a pet's weight, People with skills) | End-to-end checks no sideways scroll; screenshots taken 21 October 2026 | Medium: desktop Chromium at phone size |
| Stock (M26): the sum of its movements, never below nothing (`WB130`), never changed or deleted by anyone; costs kept from staff; a purchase as an expense in one step; a stock take records the difference; a week of buying, cooking and throwing away adds up to a stock take | `tests/db/stock.test.ts`, `tests/db/kitchen.test.ts`; `src/lib/core/food.test.ts` (lots by use-by date) | High |
| Recipes (M27): versions never change (`WB141`), owners and managers only (`WB142`), never-in-recipe items refused (`WB140`), cost per kilo from the latest prices for owners and managers (`WB145`), two versions each batch costed from its own, cooked recipes retired not deleted (`WB144`) | `tests/db/recipes.test.ts` | High |
| Portions (M28): the worked example (20 kg dog, 500 g full, 167 g topper), size bands, goals, set by hand only by managers (`WB146`) | `src/lib/core/food.test.ts`, `tests/db/kitchen.test.ts` | High |
| Subscriptions (M29): two days a week made ahead in whole packs, the rotation, one per day, price kept when the rate card changes, staff cannot set a price, paused for a week and resumed, changed, cancelled; the cut-off (`WB151`, `WB153`); trial once per pet; items per piece; food bills issued by staff only as the deliveries come to (`WB050`), no day on two bills (`WB155`), a subscription's delivery never billed alone (`WB154`), billed deliveries never deleted (`WB152`), a cancelled delivery credited | `tests/db/subscriptions.test.ts`; `src/lib/kitchen.test.ts` (bill lines) | High |
| Batches (M30): numbered by day, use-by from the recipe, stock taken out by version and weight or refused as a whole (`WB130`), packing only from a batch of the delivery's recipe in date (`WB160`, `WB161`), who received a batch (deliveries and boarders on kitchen food), the cook plan for ten deliveries and six boarders equal to a count by hand, the shopping list | `tests/db/kitchen.test.ts`, `src/lib/core/food.test.ts` | High |
| Riders (M31, D45): a rider reads every table and gets only their own membership; their run for today and nothing else, no prices or medical notes; marks only their own stops today (`WB172`, `WB173`); adds a photo only to their own stop; runs only for members (`WB170`); problems within the window (`WB174`) and replaced at no charge | `tests/db/riders.test.ts` | High |
| Food orders (M32): the order page only while the kennel takes orders; the amount worked out in the database; a PIN code not served waits with nothing to pay; hostile input refused (`WB180` to `WB185`); the anonymous role reads no order back; Confirm makes the parent, pet, weight and subscription once (`WB188`); a parent's pause and skip from their own link (`WB186`, `WB187`); twelve public functions | `tests/db/food-orders.test.ts`, `tests/db/security.test.ts` | High |
| Food reports (M33): staff, riders and other kennels refused (`WB060`); subscriptions, trials then subscribed, deliveries, kilos, value, cooking cost from batches, waste and its cost; riders by day; sources | `tests/db/food-reports.test.ts` | High |
| Erasing a parent with food: refused while a subscription or delivery is still to come (`WB075`); then their food orders, addresses and the subscription's notes go; door photos are in the list of files to remove | `tests/db/food-orders.test.ts` | High |
| Merging parents with food: subscriptions and deliveries follow their pets (`on update cascade`), today's included past the cut-off | `tests/db/subscriptions.test.ts` | High |
| The kitchen and food in a browser at 360 pixels: stock, a recipe costed, food prices, Biscuit's portion, a subscription every day billed for two weeks and credited for a cancelled delivery, paused; the cook plan, a batch, packing, labels, who got the batch; a rider joining by link and seeing only their run, marking a stop delivered; an order from the food page (portion and price as typed, UPI, I have paid), an area not served, Confirm making a subscription; a parent's pause from their own link; the food report and its CSV, staff refused | `npm run test:e2e` against the local Supabase (55 tests), screenshots taken 22 October 2026 | High for the local stack |
| Appointments (M34): a place, a pet and a person in one appointment at a time, the place held through its clean-up; requests hold nothing; hours (`WB192`), places out of service (`WB191`), add-ons not booked alone (`WB190`); the price copied for the pet, by coat with a breed first, staff refused a change (`WB022`), quotes only requests until priced (`WB199`); done needs the certificates seen (`WB194`) and stays cancelled once cancelled (`WB198`); a boarder's appointment on a day of its stay (`WB193`), on its stay's bill (staff refused without it, `WB050`) and never on its own (`WB200`); cancelled with its stay or when the stay no longer has its day; a visitor's bill with its add-ons priced by the database (`WB203`, `WB025`); another kennel sees none of it | `tests/db/appointments.test.ts`; the place exclusion, the certificates rule and the course limit each removed once to see the tests fail | High |
| Grooming cards, swims (`WB195`), courses sold by managers only and never beyond their sessions (`WB201`, `WB202`), parties' people (`WB197`) and guest (`WB196`, another pet), the cake's lead time (`WB156`), appointments in a parent's export and erasure (`WB076`) | `tests/db/appointment-services.test.ts` | High |
| Packages (M37): only through `apply_package()` (`WB205`), one line on the bill which staff issue, extras and appointments free, the swim on the middle day and the groom by the check-out time, prices on request for managers (`WB206`, `WB022`), the stay's kind (`WB204`), parts with no free time counted, parts not booked twice (`WB207`), cancelled with the stay | `tests/db/packages.test.ts` | High |
| Free times, prices by size and coat, appointment bill lines, the package line, grooms due | `src/lib/core/appointments.test.ts`, `stay.test.ts`, `reminders.test.ts` | High |
| Appointments in a browser at 360 pixels: setup (places, services by coat, an add-on, a package), two swims at overlapping times refused with the sentence after booking in two tabs, the day's board, a visitor's groom priced by coat with an add-on and its own bill issued, a boarder's groom before going home on the stay's bill with the after photo on the parent's stay page, a stay with a package billed as one line with its swim and groom booked | `npm run test:e2e` (5 new tests, 60 in all) against the local Supabase; screenshots taken 22 October 2026 | High for the local stack |
| Credit (M38): a refund kept as credit never more than the advance and ending after the kennel's months, staff refused (they cannot pay out), spent as a payment never beyond what is left (`WB211`), soonest to end first and never once ended, never changed (`WB212`) and given back when its payment is removed, goodwill for owners and managers only and cancellation credit only through a refund (`WB213`), no money moved in the month's report | `tests/db/credit.test.ts` | High |
| Trips (M39): first and last days in the slot of their time at the area's charge, outside the areas only for owners and managers (`WB215`), staff never changing a price, lines on the stay's bill staff issue only with them, moved and cancelled with the stay (`WB216`), on a run of their own day and slot, marked only by that run's rider today; health at the door (M40): check-in refused saying what is lacking (`WB210`), the database and `healthProblems()` agreeing, let in by an owner or manager only, warn refusing nothing | `tests/db/trips-and-health.test.ts` | High |
| The booking form (M41): the public prices and services for the estimate, a stay request at the usual price for each pet with the pick-up noted, an appointment request at the time asked, the parent and pet made when the request cannot be taken | `tests/db/booking-form.test.ts`, `tests/db/intake.test.ts`, `security.test.ts` (still twelve public functions) | High |
| Night-by-night cancellation across a weekend and a holiday with and without notice, the kennel cancelling, packages, packs and discounts; health problems; the booking form's estimate; trip lines; health, credit and review reminders | `src/lib/core/cancellation.test.ts`, `health.test.ts`, `estimate.test.ts`, `trips.test.ts`, `reminders.test.ts` | High |
| Phase 3 in a browser at 360 pixels: cancellation rules saved; a paid stay cancelled by the kennel, the parent's choice of credit confirmed, the credit on the parent page and goodwill added; a pet with no rabies card refused at check-in with the sentence, let in with a reason, then checked in; a pick-up added to a stay at the area's price, on the day's run, and on the stay's bill; the booking form in a private window with its estimate, accepted by staff into a request; a review reminder on Today with the link | `npm run test:e2e` (5 new tests, 65 in all) against the local Supabase; screenshots taken 22 October 2026 | High for the local stack |
| The rota (M43): a person on one shift at a time, a night shift ending the next morning, planned by owners and managers (staff refused), read by everyone; no shift off the list (`WB220`), rider or suspended person (`WB221`), or day of granted leave (`WB222`); a shift's new hours move its rota from today on | `tests/db/team.test.ts` | High |
| Leave (M43): answered by owners and managers only (`WB223`), never their own unless an owner (`WB224`); refused and withdrawn final, granted days kept, no overlaps (`WB225`); granting takes the person off the rota; each person sees their own | `tests/db/team.test.ts`; the `WB224` check and the rota clearing each removed once to see the tests fail | High |
| Attendance (M43): clocking in and out stamped by the database whatever is sent; one stretch at a time; times by hand only by owners and managers (`WB226`) with a note (`WB227`), never later than now (`WB228`), in History of changes; counted on the kennel day it began; each person sees their own; `who_is_on()` gives names to the kennel's own people only; riders and suspended people refused (`WB221`); a person with attendance cannot be removed, the kennel's deletion takes it all | `tests/db/team.test.ts`; the stamping and the kept-member rule each removed once to see the tests fail | High |
| Kennels in and out of service by date (M44): counted from the day added, a change dated earlier, never after today (`WB230`) or before the last change (`WB231`), out and back on one day, the history written only by the database; the occupancy report and the calendar count the kennels there each day | `tests/db/kennel-service.test.ts`; the report's per-day count removed once to see the test fail | High |
| The week's days, shift spans across midnight, who is on the rota now, hours, leave days in a month, the month's sheet (a night shift on its evening, open stretches flagged), times typed by hand; the ZIP writer (CRC-32, UTF-8 names, read back, damage noticed) | `src/lib/core/team.test.ts`, `src/lib/core/zip.test.ts`; a ZIP from `zipStore()` passes `unzip -t` | High |
| Phase 4 in a browser at 360 pixels: the rota switched on, the usual shifts, Meena on three mornings and Ravi living on site; Meena clocking in on Today and seeing On now; her leave asked for and granted, the rota then refusing her; clocking out; a manager writing yesterday by hand, the month's sheet and its CSV; Meena seeing only her own; a kennel out of service from three days ago and back; Send asking whether the message went ("Not yet" keeps it); a parent's export as a ZIP holding the certificate | `npm run test:e2e` against the local Supabase: the whole walk (65 steps passing, the team step then failing on a vanishing message, fixed with `?done=`), then the 2 new steps alone after the fix; screenshots taken 22 October 2026 | High for the local stack |
| Phase 5 in the database: overnight jobs make deliveries ahead once (a second run makes none), a failing job written down while the others and other kennels still run, old problems forgotten, the jobs out of the app's reach; problems scrubbed of emails and phone numbers (dates kept), written for the person's own kennel, read by owners only, 200 an hour; the import matching parents by phone and pets by name, all or nothing, owners and managers only, 2,000 rows; the photo archive's space by month, a month's files with their pets, this month refused (`WB241`), removal only by an owner (`WB242`) after a download (`WB243`), the small copies left; and the migration with pg_cron on Supabase's Postgres (`cron.job` holds `wagbook-nightly`) | `tests/db/operations.test.ts` (14 tests); `supabase db reset` on the local Supabase | High |
| The CSV reader and import checker, error scrubbing, the reset link's session check, file sizes, the ZIP written a piece at a time | `src/lib/core/import.test.ts`, `problems.test.ts`, `sign-in.test.ts`, `sizes.test.ts`, `zip.test.ts` | High |
| Phase 5 in a browser at 360 pixels: a new owner asks for a reset link (the same answer for an unknown address), opens it from the local mail catcher, chooses a new password, the old one refused, changes it again under More (a wrong current one refused), a normal session refused the reset page, the link refused a second time; a manager checks a CSV (a bad phone named by line), brings in a parent with two pets, the same file then finding them known, staff kept out; `/api/health` answering ok; owners seeing the overnight jobs after `run_nightly_jobs()`, a page made to fail on purpose listed under Problems by the error hook, managers seeing jobs only, staff kept out; a month of update photos downloaded as a ZIP with a folder for the pet, removed by the owner after the manager's download, the small copies left | `npm run test:e2e` against the local Supabase: the whole walk, 71 steps passing, 22 October 2026; screenshots taken | High for the local stack |
| Phase 6 in the database: the last pet out leaves its kennel to clean (a sibling still in keeps it off), Cleaned stamped and never undone (`WB250`), nobody adds to the list by hand; checklists set by managers and ticked by anyone with who and when; a repair's cost an expense for managers only (`WB002`), once; a pet passed away: staff refused (`WB251`), never a later day (`WB252`), its stay, subscription, deliveries and appointment cancelled, nothing new booked or subscribed (`WB254`), left off the parent's booking link, undone within a week only (`WB253`); a stay report only for a stay in or gone home (`WB260`), only photos the parent was shown (`WB261`), on the stay page only after check-out; a task that needs a photo refused done without one, even when told it does not; supplies counted down from the ticks, short when they will not last; a trial is day boarding and only a trial has a result; a vet visit's bill line, expense (managers) and medicine task in one step, staff leaving the expense, never a later day (`WB256`), never another kennel's stay; the export carries vet visits and supplies | `tests/db/the-day.test.ts` (16 tests); the photo rule, the kept photo rule, the last-pet check, the refusal for a passed pet, the report's photo check and the week each removed once to see the tests fail | High |
| The stay report's figures, house jobs by weekday, the week to undo a passing, supplies in words | `src/lib/core/the-day.test.ts` | High |
| Phase 6 in a browser at 360 pixels: food from home added and running short on Today; check-in; a routine that needs a photo, ticked only with the photo and shared with the parent; a vet visit on the bill and the expenses with its medicine on the routine; what goes home at check-out; the stay report saved with words and a photo, then read by the parent in a private window; the kennel to clean on Today and the calendar, the next pet asked about and checked in anyway, then Cleaned; the usual checklists added and ticked on Today, cleaning on Care; a repair fixed and written as an expense; a trial day marked, checked in and noted, shown on the pet page; a pet with a stay to come marked as passed away, the stay cancelled, the pet off the list, flowers on Today and marked sent, then undone; Pack all after the count | `npm run test:e2e` against the local Supabase (Postgres 17.11, pg_cron): the whole walk, 74 steps passing, 23 October 2026; screenshots taken. The walk found four sentences that vanished with their row (Cleaned, Flowers sent, a repair fixed, a list taken off or added): they now go back to the page with `?done=`; Pack all's form stays to say what it did | High for the local stack |
| Phase 7 in the database: a move onto a taken place, pet or person refused and onto a free time made, keeping its add-ons, within the place's hours and the stay's days, only for an appointment still to come (`WB270`) and to a time still to come (`WB271`), the old time in the audit log; the parent's link offering a day's free times without those taken, an appointment asked for at one of them landing as a request from the parent priced by the kennel and on the pet's stay, refused for another parent's pet, an add-on, a time not free or too far, past six a day, or when appointments are off; a problem told for the parent's own delivery within the window, once, with its photo let in only at the path given back, with the link's secret, within the hour; staff unable to pass anything as the parent's; a usual week filling four weeks minus leave, a day taken off by hand staying off, a clash skipped, a pattern's days to come taken with it, never changed in place (`WB275`), planned by managers only; a forgotten clock-out found two hours after its shift and closed at the shift's end, another's not closable by staff; alerts for the people who chose them only, taken once with the secret only (`WB277`), a pet gone home unpaid alerted and a paid one not, choices and phones each person's own, the outbox and secret sealed, a gone phone forgotten | `tests/db/moving.test.ts` (6), `parent-link.test.ts` (10), `rota-patterns.test.ts` (7), `alerts.test.ts` (5), `security.test.ts` (thirteen public functions, four sealed tables); each new rule removed once to see its tests fail (the move rules, the free-time check, the one-problem rule, the parent marker, the leave skip, the filled-once rule, the secret, the choices) | High |
| VAPID signing, alert sentences in every language | `src/lib/vapid.test.ts` (a token the public key verifies, keys that are not a pair refused), `src/lib/alerts.test.ts` | High |
| Phase 7 in a browser at 360 pixels: a swim booked and moved to another day and time from the free times, the WhatsApp link with the new time, History of changes showing the appointment's old start; a parent asking for a swim from their own link in a private window, staff seeing it under "Asked for by parents" and on Today; a parent telling a trial delivery came damaged with a photo (the photo reached the local Storage through the policy), staff seeing it on Food with the photo and on Today, and dealing with it; a usual week of mornings filling 23 days (28, less two of leave and three already on by hand), the rota listing it; a manager left clocked in from yesterday's shift shown on Today and clocked out at 15:00 with one tap; alerts chosen under More, a parent's booking request, then a push handed to the phone's service worker (through the browser's DevTools protocol) showing "Wagbook Demo Kennel: A parent asked for a stay for Rocky." with no phone number | `npm run test:e2e` against the local Supabase: the whole walk, 78 steps passing, 23 October 2026; screenshots taken. The walk found the problem form's sentence vanishing with the form (the delivery moves to "Already told"): it now goes back to the page with `?told=`; and PostgREST seeing two ways from memberships to organizations once `alert_choices` and `rota_patterns` existed: the one embed now names its key | High for the local stack |
| Phase 9 in the database: all sites for an owner of two gives each site's nights, day boarding, kennels available and used, money received, refunded and spent by its own dates, bills by the month issued and what is owed today, and the totals added up; requests and cancellations left out; a manager, staff, a stranger and the anonymous role refused (`WB062`), a manager of one site refused the other's reports (`WB060`); a person who owns one kennel and manages another gets only the one they own; a period over 400 days refused (`WB061`); staff of two sites read each site's rows one at a time; ten kennels owned and the eleventh refused (`WB012`) | `tests/db/sites.test.ts` (8); the owner-only rule and the limit each removed once to see the tests fail | High |
| Adding up sites: one site as its own report, two together, how full from the kennels and not an average, currencies never added together | `src/lib/core/sites.test.ts` | High |
| Phase 9 in a browser at 360 pixels: the demo owner adds a second site from More (Back to Wagbook offered), adds its kennels, opens All sites from Reports: "2 sites", the new site at nothing and "You are working here now", nights, billed, received and owed together equal to the demo kennel's; Switch to the demo kennel from its section; the manager offered no link and refused the page with the sentence, the new site's name nowhere | `npm run test:e2e` against the local Supabase: the whole walk, 82 steps passing, 23 October 2026; screenshots taken (`m65-add-site`, `m65-all-sites`) | High for the local stack |
| `npm run setup:local` writes `.env.local` for the local Supabase | Run by hand, 19 October 2026 | High |
| Phase 8 in the database: selling the last piece and refused the next (`WB130`), nothing of a refused sale left; refused while the kennel does not sell (`WB280`), for what has no price (`WB281`), by weight (`stock_items_sold_by_the_piece`), with no lines (`WB287`), by riders and other kennels; priced from the item whatever is sent, a later price change leaving a sale as it was, staff unable to change a price; nobody writing a sale, its lines or a sale's stock by hand; the walk-in buyer one per kennel, no phone, no pets (`WB286`), never merged (`WB018`), not made by hand; a bill of its own issued by staff only as sold (`WB050`), once (`invoices_one_live_per_sale`), only to its buyer (`WB288`); a sale on a stay on that stay's bill (staff refused without it), nothing more once it is out (`WB283`), not on a cancelled stay (`WB282`); cancelled by owners and managers with a reason (`WB002`, `WB285`), once (`WB284`), its stock back and its draft bill gone, in the history; in the parent's export. Orders: placed by managers only, nothing in stock until it comes, lines never changed, received in part by staff (no cost) and in full by a manager with a cost, never more than still to come (`WB292`), only what is on it (`WB291`), not once closed (`WB290`); the bill an expense once (`WB293`); the shopping list leaving out what is on order; an order with receipts never deleted | `tests/db/shop.test.ts` (10), `tests/db/supplier-orders.test.ts` (8); the cap on what comes, the issued stay bill check and the price from the item each removed once to see the tests fail | High |
| Sale bill lines, the counter's quantities, what to reorder, quantities typed back; the shopping list less what is on order; the Tally files: party ledgers, XML escaping, every voucher balanced, bills, credit notes, receipts, refunds, credit journals, expenses, one tax and IGST, masters once each | `src/lib/core/shop.test.ts`, `food.test.ts`, `tally.test.ts` | High for the arithmetic; none for Tally accepting the file (see below) |
| Phase 8 in a browser at 360 pixels: the shop switched on, a chew bone and a rope toy added with prices and bought in on the Stock page; staff sell both chew bones to a walk-in, the bill opens to "Walk-in" and is issued (no WhatsApp button, no phone); the chew bone's box then disabled and on the list to reorder; four rope toys of three refused with the database's sentence; a rope toy sold on a stay in house, listed under "Sold on this stay", then cancelled by a manager with its stock back; an order to Ali Meats for 50 kg of chicken with a note, the WhatsApp link to the supplier's number with the lines, marked sent; the kitchen not asking for chicken while it is on order; staff (no cost box) putting 30 kg in stock, "20 kg to come"; the manager writing the bill (₹6,600) as an expense and closing the order; ledger names saved, and the month's ZIP holding the two XML files, the walk-in's ledger and Sales voucher, the supplier's bill, every voucher balanced | `npm run test:e2e` against the local Supabase: the whole walk, 81 steps passing, 23 October 2026; screenshots taken. The walk found the "sale cancelled" sentence vanishing with its form: it now goes back to the page with `?done=sale-cancelled` | High for the local stack; the Tally files not imported into Tally |
| M66: a checked-out pet's pending tasks and play sessions after the moment it left are removed, earlier ones and anything done or skipped kept, another pet's untouched, by staff (who delete nothing themselves); undoing a check-out takes its kennel off the list to clean unless already cleaned | `tests/db/the-day.test.ts` ("a pet that has gone home", 2 tests); the time-of-day branch, the security definer, the play delete and the undo's kennel rule each removed once to see a test fail | High |
| M66 in a browser at 360 pixels, as staff: Mango checked out at 14:00, Care then lists only his tablet, breakfast and kennel clean (lunch and dinner gone), Today's meals 2 of 10 (was 12); Undo check-out puts him back in house with lunch and dinner on Care and K03 not to clean; checked out again, the bill first on the booking page; More grouped for staff (Every day, The team, Set up) | By hand with Playwright against the local Supabase, 24 October 2026; screenshots taken | High for the local stack |
| M66 against the whole walk | `npm run test:e2e` against the local Supabase: 82 steps passing, 24 October 2026 (a Saturday). The first run failed at the food subscription step, which started a subscription two days ahead and billed "this week" first: from a Saturday or a Sunday that week has no delivery ("No deliveries to bill in that period"). The step now bills each offered week that has a delivery | High for the local stack |
| M67: what is owed at check-out (an issued bill's balance or paid, a draft's total or the stay as it is now less advances, covered by an advance, nothing to say, a day of a series) | `src/lib/core/owed.test.ts` (5) | High |
| M67 in a browser at 360 pixels, as staff: Today lists Arriving, then Going home today (Bruno, past his date: "No bill yet: about ₹3,600 to pay"; Mango with a ₹500 advance: "about ₹700 to pay. ₹500 paid ahead is taken off"), then In house (Biscuit and Pepper); Bookings found by phone (Vikram Mock's two) and by parent name, an empty search says so, and 120 past bookings page as 100 with Older bookings, then 20 with Newer bookings | By hand with Playwright against the local Supabase, 24 October 2026; screenshots taken | High for the local stack |
| M66 Bills past 1,000 bills | Against the local Supabase with 1,100 older drafts: the old page said "Nothing is owed." with Bruno's ₹3,600 bill issued and unpaid (shown as paid); the new page says "₹3,600 owed on 1 bill" and lists it, also with 400 newer bills pushing it out of the 300 newest | High for the local stack |
| `npm run dev` renders pages | Before M66 the login page stayed at its loading dots (the script policy had no `script-src`, so `default-src 'self'` refused every inline script); after, sign-in and Today render with no browser errors. `src/lib/csp.test.ts` checks the fallback | High |
| Lint, types, production build | `npm run check` | High |
| Next.js 16.4.1 (D51): `npm audit --omit=dev` finds nothing; the build no longer stops with the "SecurityFatalError" notice; the whole app works on it | `npm run check` (665 tests and the build, after merging Phase 5), and `npm run test:e2e` against the local Supabase (71 passed after the merge), 23 October 2026 | High |
| `.github/workflows/ci.yml` on GitHub | Runs on every pull request and on `main`; green on pull request 3 and its merge (18 October 2026) | High |

## What is NOT verified

| Thing | Why not | Risk |
| --- | --- | --- |
| A kennel's real website sending to a hosted Wagbook (M68) | Tried with the website served locally and Wagbook on the local Supabase; no hosted project yet | The browser's origin must match Settings exactly: `https://name` with or without `www.`, and a preview address of the website is a different origin |
| A hosted Supabase project, and `docs/10-setup-and-deploy.md` followed end to end | Needs a person with a Supabase account | The local stack is the same software, so schema problems are unlikely. Settings screens, email templates and menu names in the guide may be off. |
| Sign-up email confirmation and the `/auth/confirm` round trip | Locally, email confirmation is off (`supabase/config.toml`) | The email template in the setup guide is from documentation, not tried |
| Anything on a real phone | Only Chromium at 360 pixels | Touch, keyboard covering fields, date and time pickers |
| "A full meal round for twenty dogs in under two minutes" (M3), "billed, sent, paid and marked paid from a phone in under a minute" (M4), "today's photo within seconds on a slow connection" (M5) | Not timed on a phone or a throttled connection | Each step is one round trip; the stay page loads small copies (480 pixels) of photos. Probably fine; slow networks are M8 |
| The CSV downloads opened in Excel, Google Sheets and LibreOffice | Checked as text in tests: byte order mark, quoting, CRLF | Low; an accountant opening one would settle it |
| The tax by rate report as the basis for a GST return | Adds up issued bills by bill date, leaving out cancelled ones; not checked by an accountant | Question 8 for the accountant in `06`; see Open questions |
| Scanning the QR code with a real UPI app, and paying | No phone here. The code decodes to the exact link in tests. | Some apps ignore the amount (see `07`) |
| Photos from a real phone camera (HEIC on iPhone, very large photos, rotation) | Tested with a JPEG made in the browser | The browser redraws photos the right way up; a format the browser cannot read is refused with a sentence |
| Send update, Send confirmation, the intake link on WhatsApp | Only the link is built; WhatsApp was not opened | Low: the functions are unit tested |
| Storage upload paths and policies in use | No screen uses storage yet | Covered structurally by tests only |
| The Claude Code cloud SessionStart hook in a fresh container | Two sessions in a row found an old `node_modules` (`jsqr`, `qrcode-generator`, `@playwright/test` missing), because the hook skipped `npm ci` whenever the folder existed. On 16 October 2026 it was changed to install again when `package-lock.json` differs from the last install, and run by hand twice (installs, then skips) | If `npm run check` fails on missing modules, run `npm ci` and say so here |
| Supabase's own self-hosting stack (`docs/14-self-hosting.md`, Part 1), HTTPS certificates, SMTP, `db push` through its pooler | Needs a server with public names | The CLI's Supabase is the same software; names of settings may differ by version |
| The script policy on Vercel | Vercel may not ship `.next/build-manifest.json` to the proxy | Before M66 pages would then have stayed at their loading dots (no `script-src`); now inline scripts are allowed without a nonce (logged). Check the header after the first deploy (`10`, "Check the browser protections"): it should carry `'sha256-` |
| Rate limits on Vercel | Each copy of the app counts on its own | Add a Vercel Firewall rule (`10`, "Rate limits") |
| Going home today for a stay whose bill was cancelled and not yet made again (the bug review after M67) | Not looked at in a browser, and `owedFor()` has no test of its own (it only reads; the money it now counts is what `issue_invoice()` takes in, which `tests/db/bills.test.ts` checks) | Low: it can only say less is owed, by what was paid on the cancelled bill |
| Erasure against the law | Not read by a lawyer | D25 says what is kept and why; see Open questions |
| Recovery codes on a hosted Supabase project | Walked only against the CLI's Supabase Auth (v2.197.0) | They rely on the `session_id` claim in access tokens, which Supabase Auth has carried for years |
| Two waiting requests for the same last kennel | The database test confirms both show as fitting, then the second is refused at Confirm | By design (D42); a kennel with long waiting lists may want "first in line only" |
| The food order page's UPI QR scanned and paid | No phone here | As for bills (`07`) |
| A rider's photo at the door through real Storage | The storage policy is tested in the database (`rider_upload_allowed`); the walk marks Delivered without a photo | Low |
| Labels printed on paper | Looked at on screen only | Sizes and cutting lines may want adjusting for the kennel's printer |
| An independent security review of M9 | The second review was Claude Code's own pass | Have a person outside the project review before a public instance |
| A rider marking a pick-up or drop in the browser | The walk puts a trip on a run and sees it there; `rider_mark_trip()` is tested in the database only | Low: the rider page's trip buttons call the same tested function |
| The booking form asking for an appointment, in the browser | The walk sends a boarding request; appointment requests are tested in the database (`tests/db/booking-form.test.ts`) | Low |
| Spending credit on a bill in the browser | The walk keeps an advance as credit and adds goodwill; spending it is tested in the database (`tests/db/credit.test.ts`) | Low |
| Phase 3 screens in Hindi and Kannada | Words drafted and checked for completeness by the message test; not screenshotted | Long Kannada words may wrap on the cancellation panel |
| Phase 4 screens in Hindi and Kannada | Words drafted and checked for completeness by the message test; not screenshotted | The rota's day cards and the attendance summary may wrap in Kannada |
| Clocking in on a real phone, at a real shift change | Walked in Chromium at 360 pixels only | Two people clocking in from one phone works (each signs in), but a shared phone left signed in clocks in whoever is signed in |
| The attendance CSV opened in a spreadsheet for pay | Checked as text in the walk | Low: the same CSV writer as the reports |
| "Continue with Google" with a real Google account | No Google client here; the button, the route to Supabase Auth and the return through `/auth/confirm` are the same code paths as the email link, which is walked | Medium: the Google client's redirect URI and Supabase's provider settings are the usual mistakes (`10`) |
| The reset email with the recommended template, opened on another phone | The walk uses the local default template (a code tied to the browser that asked) | Low: `/auth/confirm` handles both kinds of link, as it does for sign-up |
| pg_cron firing at night on a hosted project | On the local Supabase the migration scheduled it (`cron.job` shows `wagbook-nightly`) and the walk ran `run_nightly_jobs()` by hand; nobody waited for 02:00 | Low |
| An uptime service watching `/api/health` | Checked with a request in the walk; no service set up | Low |
| A month's ZIP of thousands of photos | Built a photo at a time (`ZipWriter`), so memory holds one photo; the walk zips a handful | Low; a ZIP over 4 GB or 65,535 photos would need ZIP64, which is not written |
| Phase 6 screens in Hindi and Kannada | Words drafted and checked for completeness by the message test; not screenshotted | The house jobs on Today and the vet visit form may wrap in Kannada |
| A photo task done with a real phone camera, and the stay report opened on a parent's phone | Walked in Chromium at 360 pixels with a photo made in the browser | Low: the same photo path as updates (M5) |
| The demo kennel with the Phase 6 setup | `supabase/seed.sql` adds no checklists, supplies or vet visits | Low: "Add the usual checklists" fills the lists in one tap |
| Alerts reaching a real phone through a real push service | No push service is reachable here, and Playwright's Chromium has no keys for one: "Allow alerts on this phone" was not walked, and the walk hands the push to the service worker directly. The VAPID header is unit tested against RFC 8292's shape, not against FCM, Mozilla or Apple | Medium: set alerts up on a hosted install and allow them on an Android phone and an iPhone added to the home screen (`10`, "Alerts on phones") before telling staff to rely on them |
| Phase 7 screens in Hindi and Kannada | Words drafted and checked for completeness by the message test; not screenshotted | The usual week's weekday list and the alert sentences may wrap in Kannada |
| The overnight `fill_rota` job on a hosted project | Run inside `run_nightly_jobs()` in the database tests and when the rota opens in the walk; pg_cron not watched at night | Low |
| The Tally files imported into Tally | No Tally here. The XML follows Tally's published import format (ENVELOPE, Import Data, LEDGER and VOUCHER messages, debits negative with ISDEEMEDPOSITIVE Yes), and every voucher is checked to balance; nobody has imported one | Medium: ask the accountant to import one month into a copy of the company (question 17 in `06`) and fix `src/lib/core/tally.ts` where Tally objects. Ledgers that already exist in Tally are written without an action so they should be left alone; that is not proven |
| Phase 8 screens in Hindi and Kannada | Words drafted and checked for completeness by the message test; not screenshotted | The counter's form and the order lines may wrap in Kannada |
| Phase 9 screens in Hindi and Kannada | Words drafted and checked for completeness by the message test; not screenshotted | Long site names may wrap the figures' grid |
| An owner with sites in two currencies or two time zones, in the browser | The adding up per currency is unit tested; the walk has two sites in rupees in one time zone | Low |
| HSN codes and rates for things sold over the counter | The kennel types them; nobody has checked them | Question 16 in `06` |
| A parent's ZIP with hundreds of photos | The walk exports one parent with one certificate; the ZIP is checked by `unzip -t` and a reader in the tests | The ZIP is built in memory on the server; a very large export may be slow on a small server |

## Do this next

**Connecting a kennel's own website (M68)**, once the hosted project exists:

- Make the hosted database from the migrations as they are now (they include M68), then freeze them.
- Settings, **Your own website**: the website's address, `https://` and the name only. Wagbook then shows the address
  the website's forms send to; the website's settings must name the same, with the kennel's short name at the end.
- Kitchen settings, Food prices: the trial, subscription food per kilo and the cake (a made-to-order item), at the
  website's prices. Settings, the notice for made-to-order items (24 hours unless the kennel says otherwise).
- Areas you serve: every PIN code delivered to, with its charge and its two delivery days. A PIN code not listed waits
  for its area, cakes included.
- Send one booking, one subscription and one cake from the real website, and confirm them in Wagbook.

**Before the first real day at a kennel** (from the pre-launch review, M66; none of it needs code):

- **Host it on Supabase's paid plan** (daily backups, never paused), in Mumbai, and finish M1 (item 1 below). Take your
  own copy every week from day one ([15-backup-and-restore.md](15-backup-and-restore.md)).
- **Write the kennel's terms into Consent wording** (More, Settings, Intake form): the boarding terms, permission to take
  a pet to a vet in an emergency (and up to what cost), and the cancellation terms. Every new parent ticks it on the
  intake form, and the date and wording are kept. Wagbook has no separate terms page or vet permission per stay.
- **Set the kennel up once**: Settings (WhatsApp number, UPI ID, check-in and check-out times, tax left off until the
  accountant says), prices, Daily routines, kennels named as on their doors, Health papers (warn or refuse), Cancellation
  rules, Peak periods. Then bring in today's parents and pets (More, Bring in parents and pets) and book and check in the
  pets already there.
- **Agree as a team that every meal and medicine is ticked when it is given.** Parents see "Care given" on their stay
  page every day, and the stay report counts what was ticked: a day of untidy ticking reads as a pet not fed.
- **Do a dry run on the team's real phones** before parents see anything: sign in on each phone and add it to the home
  screen, check in, tick a round, send an update with a photo from an iPhone and an Android phone, make and issue a bill,
  scan its QR code with a real UPI app, and open each WhatsApp message.
- **One account each, two-step sign-in for owners and managers**, with recovery codes written down. Sign out on a shared
  phone at the end of a shift.
- **Keep the paper register for the first weeks.** Today and Care open offline once loaded on a phone, but Wagbook prints
  no care sheet or kennel-door card.

Then, in order:

1. **Finish M1** (needs the owner), if the kennel will run on a hosted Supabase: create a project (Mumbai), follow
   [10-setup-and-deploy.md](10-setup-and-deploy.md) Part 1 exactly, fix the guide where it is wrong, sign up with real
   email confirmation, and walk the first run. Check the script policy header and the rate limits on the hosted deploy
   (`10`, "Looking after it"). Then record the migration freeze below.
2. **Switch on "Private vulnerability reporting"** in the GitHub repository's settings, so `SECURITY.md` works.
3. **Have the Hindi and Kannada read by native speakers**, ideally kennel staff, on a phone (list below).
4. **Run the hosted backup round trip once** ([15-backup-and-restore.md](15-backup-and-restore.md)) and log it.
5. **Ask a person outside the project for a security review.**
6. **Take the questions in `06` to an accountant** (rate and SAC for boarding, which the kennel can now set itself;
   quarterly filers and cancelling; the tax by rate figure), and **the erasure questions in `05` to a lawyer** (Rule
   8(3), pets' free text). The research in both is a starting point, read from public commentary, not advice.

7. **Ask the accountant questions 11, 12 and 15 in `06`**: whether a kept advance on a cancelled stay needs a bill (a
   cancellation charge, with tax), whether a monthly bill for a regular's days is issued in time, and when credit kept
   from a cancellation carries tax (kept, spent, or run out).

8. **Upgrade Next.js.** `npm audit` lists two advisories for `next` 16.4.0 (a critical one in image optimization with
   SVG files, and a denial of service through Server Actions), and `next build` sometimes stops once with an upgrade
   notice (it builds on a second try). Upgrade to the first patched release and run the gate and the walk again.

9. **Before a GST kennel uploads the GSTR-1 files**, load one month into the GST offline tool and fix any column
   name it rejects (`src/lib/core/gstr1.ts`).

**Building: nothing is scheduled.** Phases 5 to 9 (M45 to M65) are built, so the roadmap is finished but for M1. The
next milestone comes from the owner, or from an idea under "Ideas not scheduled" in `08` once it has an issue and a
kennel reason. Before a kennel relies on the file for Tally, the accountant imports one month (`06`, questions 16 and
17). Alongside, steps 1 to 9 above still
need the owner, then the migration freeze; and when the hosted project exists, also: set the "Reset Password" email
template and the `/auth/confirm**` redirect (`10`, step 1.4), set up Google if wanted (`10`, "Sign in with Google"),
check `cron.job` has `wagbook-nightly`, point an uptime service at `/api/health`, and if the kennel wants alerts on
phones, set them up (`10`, "Alerts on phones") and allow them on a real Android phone and an iPhone added to the home
screen.
Ideas beyond M65 wait for a kennel reason (the roadmap's "Ideas not scheduled", each with an issue first). The
owner has said production is not soon, so migrations stay editable in place until then. Worth doing before
production without the owner: have a person read the Phase 1 to 4 Hindi and Kannada, and walk the team screens on a
real phone at a shift change. The
accountant should also give the SAC codes and rates for grooming, swimming and training (question 1 in `06`). Before a kennel sells food, the accountant should answer questions
13 and 14 in `06` (the food's HSN code and rate, the delivery charge, and any kitchen licence or label wording).

To run everything locally in a session that has Docker (a Claude Code cloud container does, with `dockerd` started by
hand):

```bash
dockerd > /tmp/dockerd.log 2>&1 &          # only if the Docker daemon is not running
SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx -y supabase@2.120.0 start   # docker.io if the default registry refuses
npm run test:e2e
bash scripts/race-checks.sh
bash scripts/backup-drill.sh
```

If Docker Hub answers "429 Too Many Requests" for an image (the Node or Caddy image for `docker build`), pull it from
Google's mirror and retag it: `docker pull mirror.gcr.io/library/node:22-alpine && docker tag
mirror.gcr.io/library/node:22-alpine node:22-alpine`.

## Migration freeze

**Not frozen.** No production database exists. Migrations in `supabase/migrations/` may be edited in place.

When the first production project is created, replace this paragraph with: "Frozen on (date). Never edit an existing
migration. Add new files."

## Decisions waiting for the owner

| Decision | Where | Default taken |
| --- | --- | --- |
| Rate and SAC for boarding, day boarding and grooming (after the accountant) | [06-billing-and-gst.md](06-billing-and-gst.md), "What the law says" and the questions | Tax off; each kennel sets its own rate and code (D35) |
| Whether erasure must wait a year under DPDP Rule 8(3) (after the lawyer; the Rule starts around 13 May 2027) | [05-security-and-privacy.md](05-security-and-privacy.md), "What the law says" | Erased at once |
| How many kennels one person may own (M65 asked for the limit of five to be looked at again) | [09-decisions.md](09-decisions.md), D55 | Ten |

Decided: only owners and managers set or change a price (D15), extended to bills in M4. The licence is AGPL-3.0-or-later
(D2, confirmed 19 October 2026). The repository is public on the owner's GitHub account; conduct reports go to the owner
there. No public demo (D28). The example kennel in `13` is never named, and Wagbook is independent of any kennel.
Overstays stay manual (Extend to today). A family booked together pays on one bill, and two pets of one parent may share
a kennel at a shared price the kennel sets, two at most; siblings may play together (D27). Erasing a parent stays; only
owners delete anything, with a second tap, and a deleted expense takes its receipt with it (D29, 20 October 2026).
On 21 October 2026: bills in English, a parent's language in brackets only when they ask (D31); two-step sign-in
reminded, not forced (D24); erasing a parent keeps the pets' records (D30); only owners and managers change a parent's
phone numbers (D33); a pet left alone in a shared kennel pays the usual price for those nights, and day boarding that
turns into boarding is billed as days then nights (D32); credit notes (D34); each kennel sets its own GST rate and code
(D35); a microchip number is not the parent's personal data and stays with the pet.
On 22 October 2026 (D49): M45 to M65 added; photos are kept, already made smaller on the phone, until the owner
downloads a month and then removes it, never by themselves; a trial day is offered, never required; when a pet passes
away the kennel sends flowers; several sites stay separate kennels with combined reports; online payment through a
provider is for later, and messaging many parents at once is not wanted.

## Translations waiting for a native speaker

Hindi (`src/messages/hi/`) and Kannada (`src/messages/kn/`) were drafted without a native speaker. Every message is
there, but the words need checking, starting with the screens staff use most (Today, Care, the booking page) and what
parents see (intake form, stay page, bill, WhatsApp messages). The drafts were least sure of:

- **Both:** "WhatsApp" is in Latin letters in most places and in the local script in a few; choose one. Pets of
  unknown sex get masculine verbs in Hindi. Kannada avoids case endings on names ("{pet} ಬಗ್ಗೆ"); check it reads
  naturally. The red warning tags (escape risk, bite history, dog reactive) must be short and unmistakable.
- **Hindi:** confirm (पक्की करें), draft bill (कच्चा बिल), merge parents (जोड़ें, or विलय), suspend (रोकें),
  invitation (न्योता), consent (इजाज़त), vet (पशु डॉक्टर or वेट), severity High (ज़्यादा or गंभीर), the official GST
  terms (place of supply, taxable value), and the danda after numbers.
- **Kannada:** tax words (ಟ್ಯಾಕ್ಸ್ or ತೆರಿಗೆ, used both ways), place of supply, issue a bill (ನೀಡು or ಇಶ್ಯೂ ಮಾಡು),
  extend (ಹೆಚ್ಚಿಸಿ or ವಿಸ್ತರಿಸಿ), routine (ರೂಟೀನ್ or ದಿನಚರಿ), undo (ಹಿಂಪಡೆಯಿರಿ or ಅನ್‌ಡೂ), cash (ಕ್ಯಾಶ್ or ನಗದು),
  decline (ತಿರಸ್ಕರಿಸಿ may be too formal), and "Pets" in the bottom bar, shortened to ಪ್ರಾಣಿಗಳು to fit.

Drafted in M9 and M10, also unchecked: the two-step sign-in screens (दो-चरण साइन इन, ಎರಡು ಹಂತದ ಸೈನ್ ಇನ್), the
words for "authenticator app" (kept close to English in both), "erase" (मिटाएं, ಅಳಿಸಿ), the export and erase section
of the parent page, the certificate field on the intake form, the rate limit sentence, and the demo notices.

Drafted on 19 October 2026, also unchecked: sharing a kennel (एक केनेल में साथ, ಒಂದೇ ಕೆನೆಲ್‌ನಲ್ಲಿ; "shared kennel
price" as साझा केनेल का दाम and ಹಂಚಿಕೊಂಡ ಕೆನೆಲ್ ಬೆಲೆ), the family bill, naming and ordering kennels (क्रम, ಕ್ರಮ),
correcting an incident (ठीक करें, ತಿದ್ದಿ), the second vaccine on the intake form, and the 127 field names of History of
changes (`src/messages/hi/fields.ts`, `src/messages/kn/fields.ts`).

Drafted on 23 October 2026 (Phase 9), also unchecked: All sites (सभी शाखाएं, ಎಲ್ಲಾ ಶಾಖೆಗಳು; "site" drafted as "branch",
शाखा and ಶಾಖೆ), "Add another site" on More, "Back to Wagbook" on the page that creates a kennel, and `WB062`. Only
owners read these.

Drafted on 23 October 2026 (Phase 7), also unchecked: moving an appointment (समय बदलें, ಸಮಯ ಬದಲಿಸಿ) and the WhatsApp
message with the new time (parents read it); the parent's link asking for an appointment and telling a delivery went
wrong (डिलीवरी में कुछ गड़बड़?, ಡೆಲಿವರಿಯಲ್ಲಿ ಏನಾದರೂ ತಪ್ಪಾಗಿದೆಯೇ?); the usual week on the rota (आम हफ़्ता, ಸಾಮಾನ್ಯ ವಾರ)
and "did not clock out" (क्लॉक आउट, ಕ್ಲಾಕ್ ಔಟ್ kept close to English); and alerts (अलर्ट, ಎಚ್ಚರಿಕೆಗಳು), whose
sentences show on a locked phone, so they must be short and plain.

Drafted on 23 October 2026 (Phase 6), also unchecked: the whole of `src/messages/hi/day.ts` and
`src/messages/kn/day.ts` (to clean, checklists and repairs, passed away and flowers, the stay report, photo proof, Pack
all, brought from home, trial days, vet visits), the nine new error sentences and three constraint sentences in
`core.ts`, and the More link. Parents read the stay report, its WhatsApp message, the message asking for more food or
medicine, and the vet visit message: check those first. "Passed away" was drafted as नहीं रहा and ಇನ್ನಿಲ್ಲ (gentle, but
check), "to clean" as सफ़ाई बाकी and ಸ್ವಚ್ಛಗೊಳಿಸಬೇಕು, "trial day" as ट्रायल दिन and ಪ್ರಯೋಗದ ದಿನ, "vet" as डॉक्टर and
ವೈದ್ಯರು, "dose" as खुराक and ಡೋಸ್.

Drafted on 22 October 2026 (Phase 4), also unchecked: the whole of `src/messages/hi/team.ts` and
`src/messages/kn/team.ts` (rota, leave, attendance, On now), the eight new constraint sentences and eleven error
sentences in `core.ts`, "Did the message go?" on Today, the kennels' "in service since" words, and the export's
download line. "Rota" was drafted as रोस्टर and ಪಾಳಿ ಪಟ್ಟಿ, "shift" as शिफ़्ट and ಪಾಳಿ, "clock in" as हाज़िरी लगाएं and
ಹಾಜರಿ ಹಾಕಿ, "clock out" as काम ख़त्म करें and ಕೆಲಸ ಮುಗಿಸಿ, "leave" as छुट्टी and ರಜೆ, "lives on site" as यहीं रहते हैं and
ಇಲ್ಲೇ ವಾಸ. Staff read these every day: check the On now panel first.

Drafted on 22 October 2026 (Phase 3), also unchecked: the whole of `src/messages/hi/rules.ts` and
`src/messages/kn/rules.ts` (cancellation rules and the cancelled stay's panel, credit, pick-up and drop, health papers,
the booking form, the review link), the three new reminders parents read (health papers, credit ending, asking for a
review) in `core.ts`, and the payment method "credit" (क्रेडिट, ಕ್ರೆಡಿಟ್). Parents read the booking form, the trip
message and the three reminders: check those first. Deworming was drafted as कीड़े की दवा and ಜಂತು ಔಷಧಿ, tick treatment
as टिक का इलाज and ಉಣ್ಣಿ ಚಿಕಿತ್ಸೆ, neutering as नसबंदी and ಸಂತಾನಹರಣ, goodwill as सद्भावना and ಸದ್ಭಾವನೆ.

Drafted on 22 October 2026 (Phase 2), also unchecked: the whole of `src/messages/hi/appointments.ts` and
`src/messages/kn/appointments.ts` (appointment setup, booking, the day, grooming, courses, packages), the 21 new error
sentences and 13 constraint sentences in `core.ts`, and the groom reminder parents read. Coats were drafted as
छोटे बाल / दोहरी परत / लंबे बाल / घुंघराले / खुरदरे बाल and ಚಿಕ್ಕ ಕೂದಲು / ಎರಡು ಪದರ / ಉದ್ದ ಕೂದಲು / ಗುಂಗುರು / ಒರಟು ಕೂದಲು;
"on quote" as पूछकर तय and ಕೇಳಿ ನಿಗದಿ; "add-on" kept as ऐड-ऑन and ಆಡ್-ಆನ್; "homework" as होमवर्क and ಮನೆಗೆಲಸ. The
training notes message goes to parents: check it first.

Drafted on 22 October 2026 (Phase 1), also unchecked: the whole of `src/messages/hi/kitchen.ts` and
`src/messages/kn/kitchen.ts` (the kitchen, food for homes, riders, the food order page, food reports), and the 32 new
error sentences and 20 constraint sentences in `core.ts`. Parents read the food order page, the food section of their
link, the WhatsApp message asking about a subscription after a trial, and the rider's "on the way" message: check those
first. "Topper" was kept as टॉपर and ಟಾಪರ್; "batch" as बैच and ಬ್ಯಾಚ್; "rotation" as बारी and ಸರದಿ; "run" as राउंड and
ಸುತ್ತು; "cut-off" was said in words (बदलाव बंद, ಬದಲಾವಣೆ ಮುಚ್ಚುತ್ತದೆ).

Drafted on 21 October 2026 (M25), also unchecked: the whole of `src/messages/hi/beyond.ts` and
`src/messages/kn/beyond.ts` (what the kennel offers, areas served, addresses, weights, skills), the intake form's
address, area and PIN code, and the four new constraint sentences. "Rider" was drafted as डिलीवरी राइडर and
ಡೆಲಿವರಿ ರೈಡರ್; "body condition" as शरीर की हालत and ದೇಹ ಸ್ಥಿತಿ.

Drafted on 21 October 2026 (M20 to M24), also unchecked: the waiting list (वेटिंग लिस्ट, ಕಾಯುವ ಪಟ್ಟಿ), the WhatsApp
message telling a parent a kennel is free (parents read it), going home early and the two check-out buttons, "The stay
changed" and refunds on the bill page, the month's bill for a series, removing a photo, recovery codes (रिकवरी कोड,
ರಿಕವರಿ ಕೋಡ್ kept close to English), and the new error sentences (`WB006`, `WB007`, `WB055` to `WB057`, `WB081`, `WB120` to
`WB122`).

Drafted on 21 October 2026 (M16 to M19), also unchecked: the reminder messages to parents (the most important to get
right, as parents read them), the booking request page, repeating days and packs, and the GSTR-1 file names on Reports.

Drafted on 21 October 2026 (M15), also unchecked: credit notes (क्रेडिट नोट, ಕ್ರೆಡಿಟ್ ನೋಟ್ kept close to English) and
the tax rate and SAC code boxes.

Drafted on 21 October 2026, also unchecked: sharing a kennel and having it to oneself on a bill (केनेल साझा, केनेल में
अकेले; ಕೆನೆಲ್ ಹಂಚಿಕೊಂಡು, ಕೆನೆಲ್‌ನಲ್ಲಿ ಒಬ್ಬಂಟಿ), Staying overnight (रात को रुकना, ರಾತ್ರಿ ಉಳಿಯುವುದು), the line saying only
managers change phone numbers, the Bills choice on the parent page, the new erase wording, and the plain titles of a
tax invoice now shown in brackets after the English (टैक्स इनवॉइस, ಟ್ಯಾಕ್ಸ್ ಇನ್‌ವಾಯ್ಸ್).

Drafted on 16 October 2026, also unchecked: hiding from lists (सूचियों से छिपाएं, ಪಟ್ಟಿಗಳಿಂದ ಮರೆಮಾಡಿ) and the hidden
pets list, "Find a pet" on New booking, the sentence about taken kennels, the hint that the currency and year start
are fixed, and the hint under Stay on a booking.

## Open questions

Product behaviours that were chosen as the simplest thing and may need the owner's view.

Chosen in M68 (D57) as the simplest thing:

- A cake may be delivered on any day some area takes deliveries, with the kennel's notice, not only on its own area's
  days. Should it follow its own area's days?
- An area's delivery days hold only for orders from the order page and the website; staff making a subscription by
  hand may choose any days.
- A booking from a website may come without dates or a pick-up address; staff agree them on the call.

Chosen in the pre-launch review (M66, D56) as the simplest thing:

- Undo check-out is for anyone who can check out (staff too), only on the day of the check-out and only while no bill
  for the stay is issued. Should it be a manager's?
- Undoing a check-out leaves the dates as they are. A pet checked out with "bill to today" comes back with its stay
  ending today, and someone puts the dates right under Change this booking.
- At check-out, tasks with no time on that day are kept; so are tasks due earlier that nobody ticked (they stay on
  Care to tick or skip).
- The day a pet arrives still gets that day's tasks from before it came: a pet checked in at 15:00 has a 09:00
  breakfast to tick or skip. Leave those out too?
- Parents see "Care given" counts on their stay page every day. Should a kennel be able to hide them?

- An advance kept on a cancelled stay (not refunded) is money in with no bill for it. Should Wagbook offer a bill for a
  cancellation charge? Waits for the accountant (question 11 in `06`).
- Staff choose at check-out whether an early leaver is billed to today or as booked (D40). Should that be a manager's
  choice, or follow the peak period's no-refund rule by itself?
- Staff cannot remove an extra added by mistake; a manager has to. Right?
- Staff may add a one-off item at any price (for a vet bill paid for the parent). Right?
- In a family booking of "a kennel each", only the first pet gets the chosen kennel; the others get theirs at
  check-in. "One kennel together" is offered only for exactly two pets.
- A pet whose sibling leaves early pays the usual price for the nights alone (D32). The sibling that left pays its own
  booked nights in full unless it was checked out with "bill to today" (D40).
- A pet at the shared price that moves kennel counts as alone for its whole stay, because a booking has one kennel.
- Only day boarding turning into boarding is split; boarding that turns into day boarding is a change of the whole
  stay's kind.
- A parent's bill translation is per parent, and a bill shows the current choice, not the one when it was issued.
- Siblings booked separately (not together) can still share a kennel, but each is billed on its own and the second is
  at the usual price unless a manager changes it.
- A pet cannot be added to a family after it is booked (`WB026`); it is booked and billed on its own.
- A pet's play sessions are at least two hours apart (`PLAY_GAP_MINUTES`). Should this be a setting?
- Skipping a task other than a medicine needs no note.
- Staff can make and edit a draft bill but cannot issue an edited one. Should staff see the line editor at all? (They
  do not today.)
- A bill made before check-out is not rebuilt when the stay changes afterwards; Make bill on the draft brings it back
  in line, and an issued bill must be cancelled and made again.
- Only owners take a photo off an update (D29). A photo on the wrong pet's page is a privacy matter: should managers
  be able to as well?
- Invitation links are not tied to an email or phone: whoever holds one can join, once (D19). Right for how kennels
  hire?
- Merging parents keeps the record you are on and hides the other. There is no "unmerge".
- Hiding a pet or parent from lists is for owners and managers only, and hiding a parent hides their pets too. A
  hidden parent has no list of their own: they are reached from their pets (under Hidden pets) or a past stay. Right?
- Staff may still change the emergency contact's number; only the parent's own numbers are for managers (D33).
- The intake form asks for up to six pets, and New booking books up to six together. Enough?
- A person can own at most ten kennels on one installation (D55, raised from five for several sites). Enough?
- Forms from parents stay "new" until someone deals with them; there is no expiry.
- Words stored as data stay in the language they were typed in: routine names, extras, kennel names, notes, the
  default prices (named in the language of whoever set them), and expense categories. Is that right for a kennel
  whose staff read different languages?
- A care task ticked offline counts as done when it reaches the database. Should the screen show the time of the tap?
- The daily summary is a button the owner presses. Should it be sent by itself each evening (it would need WhatsApp's
  paid Business API, which `07` explains Wagbook does not use)?
- Reports are for owners and managers only (D20), including how full the kennel was. Should staff see occupancy?
- A tax invoice can be cancelled only in the month it was issued, which assumes a monthly return. A kennel filing
  quarterly might cancel within the quarter. For the accountant.
- Credit notes have no time limit in Wagbook; section 34 lets one reduce tax only until 30 November after the year.
- "Received less spent" is money in and out in the month, not profit: it ignores what is owed and when bills fall.
- Erasing a parent keeps their issued bills, payments, the stays' dates and prices, and the pets (D25, D30). What we
  found (`05`) says tax law's 72 months covers the bills; DPDP Rule 8(3) may ask for a year's hold before erasing; free
  text on pets may still point at the parent. (For a lawyer.) The owner's view: a microchip number is not personal data.
- A recovery code lets one sign-in in, but the lost phone stays on the account until an administrator removes it (D43).
  A recovered session lasts as long as that sign-in. Enough for a small kennel?
- The rate limits are 20 sign-in tries, 10 forms and 20 joins per address per ten minutes. A kennel whose whole team
  signs in from one connection at shift change should not reach 20; tell us if it does.

Chosen in M25 as the simplest thing:

- Anyone adds an address for a parent; only owners and managers change one (as phone numbers, D33). Staff who take
  down a new address at the gate are not stopped, but cannot correct a typo afterwards.
- Accepting an intake form makes a home address only for a new parent. A returning parent's addresses are left as
  they are, as the rest of their record is; staff add the new one by hand.
- Areas served are matched by PIN code alone. A PIN code that covers places the kennel serves and places it does not
  is all or nothing.
- A weight can be written for any day up to today, and the latest by date is the pet's weight; one written today for
  last week does not replace a newer one.

Chosen in Phase 9 (M65) as the simplest thing:

- All sites covers only the kennels the reader owns. A manager over several sites (an "area manager") does not see it;
  should they?
- All sites shows one month, for the calendar month in each site's own dates; there is no month by month table and no
  CSV of all sites. Each site's own Reports still has both.
- "Owed today" on All sites is today's, whatever the month chosen, as on a site's own report.
- A new site starts empty: prices, routines, settings and people are set up again in it. Nothing is copied from the
  first site.

Chosen in Phase 6 (M50 to M57) as the simplest thing:

- A kennel is to clean only when its last pet leaves; siblings sharing one leave it to clean when the second goes. A
  pet checked in anyway leaves the kennel on the list until someone taps Cleaned.
- House jobs are every day or one weekday; a weekly job not done on its day is not carried to the next. Nobody but an
  owner deletes a tick; Undo puts it back to be done.
- A repair's cost is written as an expense on the day it was marked fixed, in the category "Repairs" in the reader's
  language. Flowers are "Flowers", vet visits "Vet", likewise.
- Passing cancels stays still requested or confirmed, whatever their dates. A pet in the kennel when it passed away
  is checked out by hand. Bills already issued, credit and packs are left as they are. Undoing the passing restores
  nothing that was cancelled.
- The stay report counts a meal offered when it was ticked done or skipped; one never reached is left out. Incidents
  appear by kind only, and only those the parent was told of. Weight in is the last weighing up to the first day (up to
  a month before); weight out the last one during the stay.
- Supplies count against the pet's routines as they are now, the same amount every meal or dose. A medicine without a
  routine chosen counts every medicine round of the pet.
- A trial day is marked on the booking page of day boarding, not on New booking, and its price is the day's price
  unless a manager changes it.
- A vet visit's cost always goes on the stay's bill (marked to be paid back on the expense). A visit the kennel pays
  for itself is recorded with no cost, and the expense written by hand.
- A task that needs a photo cannot be ticked offline.

Chosen in Phase 5 (M45 to M49) as the simplest thing:

- A spreadsheet's parent who is already known by phone is left exactly as they are: a new email or address in the file
  is not written. The first line's parent details win when one phone has several lines.
- An imported parent gets no consent date (`consent_source` is "staff", as a parent added by hand). Should an import
  record that the kennel holds consent on paper?
- The import's PIN code problem says "six digits" even outside India, where any postal code with a digit is taken.
- A month's photos are noted as downloaded when the ZIP has been sent in full; Wagbook cannot know the owner kept it.
  The page says to keep it before removing.
- Removing a month removes every archivable photo taken that month, including any taken after the download (none can
  be: only a month that has ended is offered).
- Errors are written for the kennel in the person's `wb_org` cookie, or their first kennel; a person working at two
  kennels may see an error from one listed under the other's owner.

Chosen in Phase 4 (M43, M44) as the simplest thing:

- The rota has no repeating pattern: a manager puts someone on a shift for up to 31 days in a row, and again next
  month. Is a weekly pattern wanted?
- A stretch of work counts on the day it began, so a night shift counts on its evening, and only once clocked out. A
  forgotten clock-out stays open (and the person shows as on now) until a manager puts it right.
- Riders keep no rota and do not clock in (they reach no table, D45). Should they?
- Leave is days, not hours, and has no kinds (sick, paid, unpaid). The month's sheet counts granted days only.
- Granting leave takes the person off the rota on those days without asking; the rota then shows the shift short.
- A person with attendance on record cannot be removed, only suspended (`attendance_keeps_member`), so "leaving" a
  kennel is not possible for them either; an owner suspends them.
- Clocking in is from any phone the person is signed in on; nothing ties it to being at the kennel.
- Who is on now is told to everyone working at the kennel, names only; the times are for owners and managers.
- A kennel counts from the day it was added. One that was there before Wagbook knew needs its "In service since" put
  right on Kennels, or past reports undercount it. The demo kennels are in service from a year back.
- A change in or out of service dated the same day as the kennel's last change counts from today (the database
  cannot tell "the same day" from "no day given").
- The export leaves out the small copy of each photo (it is the same photo, smaller).

Chosen in Phase 3 (M38 to M42) as the simplest thing:

- Cancellation rules are on screen for boarding and day boarding only. Appointments take no advance (they are paid on
  their own bill after), so the database's rule for them has nothing to decide yet. Should appointments take an
  advance, and be refunded or kept as credit by the same kind of rule?
- A night's notice is the time from when the parent asked to that night's check-in time. "When the parent asked" is
  now unless staff type an earlier time (never a later one).
- The advance goes to the refund first, then to credit; what is left is kept. A package stay is spread evenly over its
  nights, the remainder on the last; a discount comes off the last nights; a night paid from a day pack is worth
  nothing (the pack keeps its day).
- When the kennel cancels, everything goes back: all as money or all as credit, as the parent chooses. There is no
  mix.
- Settling is one step for an owner or manager; a different refund agreed with the parent is still recorded by hand.
- Credit lasts the kennel's months from the day it is given (12 by default), is spent oldest first, and is offered on
  a bill's payment form only while something is owed. It is never an advance or a refund.
- A trip is on the stay's first day (pick-up) or last day (drop), at most one of each; its date moves with the stay.
  Staff add a trip only to an address in an area served; an owner or manager can price one outside.
- Health papers are checked on the stay's first day, or today if later; a pet of unknown age is not held to the
  neutering rule. While the kennel only warns, nothing is refused.
- The booking form takes one pet; a family uses the intake form. The estimate is the usual price times nights (at
  least one) or days; appointments show their price, "from" when it depends on the dog.
- A review is asked for once per stay or visit, and only the latest for each parent within the week; a daycare series
  is never asked day by day.

Chosen in Phase 2 (M34 to M37) as the simplest thing:

- Requested appointments hold nothing, as stay requests do; Confirm is refused if the time was taken meanwhile.
- A no-show is billed, as a stay's no-show is. A cancelled appointment is not.
- A person is busy only for the appointment itself; the clean-up holds the place, not the person.
- Done needs the pet's certificates seen when the service checks them; a boarder's check-in counts. A swim done needs
  a supervisor and the life jacket answered (yes or no). Is "no life jacket" ever acceptable, or should it be refused?
- A groom is due again from three days before its weeks are up, and is reminded once for each groom.
- Groom before going home takes the latest free time that ends by the stay's expected pick-up, or the kennel's
  check-out time.
- A package's appointment on the "middle" day goes on the day halfway through the stay, rounded down.
- Cancelling or shortening a stay cancels its appointments still to come that no longer fit, with a reason in English.
- Staff may put a package with a set price on a stay; one priced on request needs an owner or manager.

Chosen in Phase 1 (M26 to M33) as the simplest thing:

- A subscription is for one pet. A parent with two dogs has two subscriptions, delivered to the same door as two stops
  (the run puts them next to each other by address).
- Each delivery of a subscription takes the next recipe of the rotation (its n-th delivery the n-th place). Boarders
  eat the rotation's recipes by day, each recipe for three or four days in fourteen, so the kitchen cooks one recipe a
  day for its boarders. Is that how the kitchen wants to cook?
- Who received a batch counts the boarders on the kitchen's food in house on the day the batch says they ate from it;
  the cook says which day when recording the batch.
- Changes to a subscription remake the deliveries still before their cut-off, and the rotation counts again from the
  remade ones, so a recipe can repeat across a change.
- A delivery charge takes the food's tax rate and code (question 13 in `06`).
- A parent tells the kennel a delivery went wrong from their own link (M59), once per delivery, within the problem
  window; staff can still write one down for them. A parent's appointment request offers the times the place is free;
  a time their own pet is busy is refused when they send it, rather than left out of the list. Should the list leave
  those out too?
- Confirming a website order makes the subscription but records no payment: staff make the week's bill and record the
  money on it.
- A rider marks Delivered without a photo if they choose; the photo is not required.
- Portions are reviewed once, a week after a pet starts; there is no regular review after that.

## Known rough edges in what is built

Found in the pre-launch review (M66), not built; each wants an owner's yes first:

- **Bookings** (since M67 searchable, with Past paged) still shows at most 300 current and upcoming without a search,
  and a search shows up to 100 matches with no paging: type more of the name.
- **Care** ticks one pet at a time: 60 dogs are 60 taps a meal. There is no "done for everyone at 09:00, except...",
  which principle 8 (say true things) argues against unless each pet is still shown.
- **Nothing prints** for staff without phones or a dead connection: no kennel-door card (name, food, medicines, flags,
  parent and vet), no day sheet.
- **Other lists the 1,000-row cap could cut**: a month's attendance for a large team (15 people clocking twice a day
  for 31 days is 930 rows), the stock page (asks for 2,000 moves), and Reports' "owed today" (only past 1,000 unpaid
  bills). Bills was fixed in M66.
- A new kennel's owner gets no checklist of what to set up first; `17` and the More menu are the guide.

- Food: pick-ups and drops of boarders do not join runs yet (M39). The shopping list does not know what is already ordered from a supplier. Labels have no barcode. Pack all
  takes the newest batch in date of each recipe; to use another, pack one at a time. Stock has no units other than
  grams, millilitres and pieces (no "a dozen eggs").
- Deliveries are made ahead only when someone opens the Kitchen or Food for homes (three weeks each time); nothing runs
  by itself overnight.

- Appointments: a move keeps the bill; an issued bill keeps the old date in its line text (bills are never rewritten).
  Two pets of one family cannot share one appointment (two dogs in the pool together). There is no group class. A visitor's add-ons on
  a course session have no bill to go on. Before and after photos reach the parent only for a boarder (a visitor has no
  stay page; send them on WhatsApp). Parents ask for appointments from their own link (M59), not from the booking form
  for new parents. Appointment setup has no
  way to rename a place or a service: take it off the list and add it again. The day's board draws an appointment from
  its start to its end rounded to the half hour. The grooming menu is what the kennel types in; no list is filled in
  for it. A party's cake is a one-off food order with its own bill, not a line of the party's bill.
- Managers may correct a weighing through the database, but the pet page offers only Remove (owners).

- A no-show uses a pack day. A series that runs across two months gets a bill for each month; days paid from a pack
  show on the month's bill at ₹0.
- The difference offered on a bill is worked out from the stays as they are now. A line a manager added to a bill by
  hand is never offered back on its own (`staysChanged()`), but when the stays changed as well, the amount offered
  includes it: check the amount on a bill edited by hand before crediting it.
- "Did the message go?" is asked only with JavaScript; without it, Send opens WhatsApp and the reminder stays.
- A parent's booking link shows the dates of their stays to whoever holds it.

- No debit notes, and no composition scheme mode (a bill of supply's own words are not printed).
- The credit note form offers "the whole bill" only while nothing has been credited; after that, an amount.

- A care task's photo cannot be replaced once the task is done; undo the task and add it again (the old file stays in
  storage). A shared proof photo becomes an update like any other.
- The stay report is worked out each time it is read, so changing a care task after check-out changes it.
- Supplies cannot be corrected or removed on screen once added (an owner can, through the database); add another line
  for a second pack.
- The calendar has no drag and drop (by design in M2). It draws 30 requests at most; more are on the bookings list.
- The bills list puts the parent and pets on their own line under the number, so a phone row is taller than before.
- People shows names and roles but not email addresses (the app cannot read `auth.users`).
- The calendar's top row counts kennels in use; when siblings share, the number of pets is shown under it.
- No favicon beyond `icon.svg`; no social preview image. The landing page is a single screen of text.
- A pet that overstays counts in the occupancy report only up to its check-out date unless someone pressed Extend.
- Bill line descriptions ("Boarding, 3 nights") and the amount in words stay in English on bills in every language.
- The service worker runs only in production builds, so `npm run dev` never shows the offline behaviour.
- History of changes shows an added row's fields collapsed and names only people, pets, parents, kennels and price list
  rows; other ids read "a record no longer here". An erasure shows as a change to "clients".
- An erased parent appears as "Erased" (stored in English) where a past stay or bill names them. Their pets keep their
  names but are hidden for good, because their parent stays hidden.
- Phase 5: the photo page does not refresh itself after a download: reload to see "Remove these from Wagbook". The
  import's preview is lost if the page is reloaded (send the file again). Errors on public pages are not listed.
  Archived small copies are shown without the word "Archived".
- All sites (M65): no CSV, no month by month table, and no way to compare one site's month with another month. A site
  the owner suspended themselves from, or left, drops out of it.
- Rota and attendance: a usual week fills the rota only when an owner or manager opens it, after a usual week is
  added, or overnight (M60); a usual week changes by taking a day away and adding it again. No cover requests or swaps, no overtime rules, no pay worked out, no
  clocking in tied to the kennel's place. A shift taken off the list keeps its old rota rows; its name cannot change.
- A certificate sent with the intake form is lost if the form arrives but the upload fails: the parent is told to send
  it on WhatsApp.
- On the two-step page, after the first code is accepted, the page redraws in its "on" state, so the longer "have your
  phone with you" sentence is not seen (the "on" panel says to keep the app instead).
- Alerts (M61): an alert the app could not hand to a push service waits until the next request that may raise one.
  A phone asleep for more than a day misses alerts older than a day (Today still shows what waits). A forgotten
  clock-out shows only for a stretch that began within a shift on the rota.
- `scripts/race-checks.sh` and `scripts/backup-drill.sh` need the local Supabase, so they are not part of
  `npm run check` or CI.

## How to check the state yourself

```bash
npm ci
npm run check        # dash check, lint, typecheck, 787 tests, build
```

All of it should pass on a clean clone with no environment variables set. With Docker, also `npm run test:e2e`,
`scripts/race-checks.sh` and `scripts/backup-drill.sh` (see above).

## Session log

One line per session, newest first. What changed, in a sentence. Details belong in commits and pull requests.

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
