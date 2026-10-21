# Handoff

The state of Wagbook right now. Read this first; rewrite it last. Keep it a description of the present, not a diary.

Last updated: 21 October 2026, after milestones M16 to M19 (reminders, booking requests, day boarding regulars, GSTR-1 files).

## In one paragraph

Every milestone on the roadmap is built, M2 to M19. The latest: Today lists the reminders to send on WhatsApp (M16,
D39); a known parent asks for a stay through their own link, as a request that holds no kennel (M17, D36, two more
public functions, eight in all); day boarding repeats on chosen weekdays, and packs of days are sold with a bill and
paid from (M18, D37); and a GST kennel downloads the month's GSTR-1 as the offline tool's CSV files (M19, D38). Before
that (M15): credit notes take back all or part of an issued
bill with their own numbers, counted in their own month, and a tax invoice from an earlier month is credited, never
cancelled (D34); each kennel sets its own tax rate and SAC code for boarding, day boarding and each extra (D35). Before
that (M14, the owner's answers of 21 October 2026): a pet at
the shared kennel price pays the usual price for the nights it has the kennel to itself, and day boarding that turns
into boarding is billed as days and then nights, both priced by the database (`stay_charges`, D32); only owners and
managers change a parent's phone numbers (D33); erasing a parent keeps their pets' records (D30); bills are in English,
with the parent's language in brackets on request (D31); and what the law says on GST invoices, cancelling bills,
keeping records and erasure is written up for the accountant and the lawyer (`06`, `05`). Before that: shared
kennels and family bills (M11, D27), kennels named freely (M12), rough edges and only owners delete (M13, D29). The
owner confirmed the licence (AGPL),
dropped the public demo for a local quick start (D28, `npm run setup:local`), and keeps Wagbook independent of any
kennel. The database rules are tested in-process (239 database tests, 156 unit tests), and the whole day is walked in a
real browser at 360 pixels wide against a **local** Supabase (`npm run test:e2e`, 43 tests). What has still never
happened: a **hosted** Supabase project (the rest of M1) and a real phone. **The Hindi and Kannada are first drafts.**

## What is verified, and how

| Thing | Verified by | Confidence |
| --- | --- | --- |
| Every migration applies in order | `tests/db/smoke.test.ts` on PGlite, and `supabase start` / `supabase db reset` on Supabase's Postgres 17.11 image (CLI 2.120.0) | High |
| `supabase/seed.sql` applies and builds the demo kennel | `tests/db/seed.test.ts`, and the local Supabase | High |
| Tenant isolation, role limits, the anonymous surface | `tests/db/security.test.ts`, `hardening.test.ts` | High |
| No double booking, capacity, same-day turnover, day boarding | `tests/db/bookings.test.ts` | High |
| Price only set or changed by owners and managers (D15), families one parent, requests hold no space, extending over a conflict refused, checklist stamps | `tests/db/bookings.test.ts`; each rule removed once to see its test fail | High |
| A skipped medicine needs a note; a double tap keeps the first who and when; the stay page counts what was ticked; play hours; moving a play session | `tests/db/care.test.ts`; the medicine rule removed once to see its test fail | High |
| Invoice numbering, freezing, voiding, tax checks, payments | `tests/db/billing.test.ts` | High |
| TypeScript and SQL agree on every bill: three tax modes, prices with and without tax, other-state GST, rounding on and off, odd paise, discounts, zero rate, the worked example in `06` | `tests/db/bills.test.ts` | High |
| Staff issue only a bill that matches its booking (`WB050`); one live bill per booking; advances join the bill; drafts saved in one go | `tests/db/bills.test.ts`; each rule removed once to see its test fail | High |
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
| `npm run setup:local` writes `.env.local` for the local Supabase | Run by hand, 19 October 2026 | High |
| Lint, types, production build | `npm run check` | High |
| `.github/workflows/ci.yml` on GitHub | Runs on every pull request and on `main`; green on pull request 3 and its merge (18 October 2026) | High |

## What is NOT verified

| Thing | Why not | Risk |
| --- | --- | --- |
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
| The script policy on Vercel | Vercel may not ship `.next/build-manifest.json` to the proxy | Pages still work without it (no script rule, logged). Check the header after the first deploy (`10`, "Check the browser protections") |
| Rate limits on Vercel | Each copy of the app counts on its own | Add a Vercel Firewall rule (`10`, "Rate limits") |
| Erasure against the law | Not read by a lawyer | D25 says what is kept and why; see Open questions |
| An independent security review of M9 | The second review was Claude Code's own pass | Have a person outside the project review before a public instance |

## Do this next

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

8. **Before a GST kennel uploads the GSTR-1 files**, load one month into the GST offline tool and fix any column
   name it rejects (`src/lib/core/gstr1.ts`).

After that the roadmap is empty: new work starts from issues with a kennel reason ("Ideas not scheduled" in `08`).

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

- Cancelling records a reason but no refund decision (bills are M4).
- Staff cannot remove an extra added by mistake; a manager has to. Right?
- Staff may add a one-off item at any price (for a vet bill paid for the parent). Right?
- In a family booking of "a kennel each", only the first pet gets the chosen kennel; the others get theirs at
  check-in. "One kennel together" is offered only for exactly two pets.
- A pet whose sibling leaves early pays the usual price for the nights alone (D32), but the sibling that left still
  pays its own booked nights in full; refunding them is a manager's change of dates. Should check-out before the
  date shorten the stay by itself?
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
- An update's photos cannot be removed once posted, except by deleting files as a manager in Supabase.
- Invitation links are not tied to an email or phone: whoever holds one can join, once (D19). Right for how kennels
  hire?
- Merging parents keeps the record you are on and hides the other. There is no "unmerge".
- Hiding a pet or parent from lists is for owners and managers only, and hiding a parent hides their pets too. A
  hidden parent has no list of their own: they are reached from their pets (under Hidden pets) or a past stay. Right?
- Staff may still change the emergency contact's number; only the parent's own numbers are for managers (D33).
- The intake form asks for up to six pets, and New booking books up to six together. Enough?
- A person can own at most five kennels on one installation. Enough?
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
- Two-step sign-in has no recovery codes; a lost phone needs an administrator (`10`). Enough for a small kennel?
- The intake form accepts one certificate per pet. Some parents have two cards (rabies, and the yearly shot).
- The rate limits are 20 sign-in tries, 10 forms and 20 joins per address per ten minutes. A kennel whose whole team
  signs in from one connection at shift change should not reach 20; tell us if it does.

## Known rough edges in what is built

- A repeating series is not billed together; a day not paid from a pack is billed on its own. A no-show uses a pack
  day.
- Tapping Send on a reminder marks it sent even if WhatsApp's own Send is not pressed.
- A parent's booking link shows the dates of their stays to whoever holds it.

- No debit notes, and no composition scheme mode (a bill of supply's own words are not printed).
- The credit note form offers "the whole bill" only while nothing has been credited; after that, an amount.

- Proof photos on care tasks are not built (the unused field was removed in M13).
- The calendar does not show requests (it says how many there are) and has no drag and drop (by design in M2).
- People shows names and roles but not email addresses (the app cannot read `auth.users`).
- The calendar's top row counts kennels in use; when siblings share, the number of pets is shown under it.
- No favicon beyond `icon.svg`; no social preview image. The landing page is a single screen of text.
- Reports measure how full the kennel was against the kennels in service **today** for every day; there is no history
  of kennels going in or out of service.
- A pet that overstays counts in the occupancy report only up to its check-out date unless someone pressed Extend.
- Bill line descriptions ("Boarding, 3 nights") and the amount in words stay in English on bills in every language.
- The service worker runs only in production builds, so `npm run dev` never shows the offline behaviour.
- History of changes shows an added row's fields collapsed and names only people, pets, parents, kennels and price list
  rows; other ids read "a record no longer here". An erasure shows as a change to "clients".
- An erased parent appears as "Erased" (stored in English) where a past stay or bill names them. Their pets keep their
  names but are hidden for good, because their parent stays hidden.
- The export names photos and certificates by their storage paths; it does not include the files.
- A certificate sent with the intake form is lost if the form arrives but the upload fails: the parent is told to send
  it on WhatsApp.
- On the two-step page, after the first code is accepted, the page redraws in its "on" state, so the longer "have your
  phone with you" sentence is not seen (the "on" panel says to keep the app instead).
- `scripts/race-checks.sh` and `scripts/backup-drill.sh` need the local Supabase, so they are not part of
  `npm run check` or CI.

## How to check the state yourself

```bash
npm ci
npm run check        # dash check, lint, typecheck, 395 tests, build
```

All of it should pass on a clean clone with no environment variables set. With Docker, also `npm run test:e2e`,
`scripts/race-checks.sh` and `scripts/backup-drill.sh` (see above).

## Session log

One line per session, newest first. What changed, in a sentence. Details belong in commits and pull requests.

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
