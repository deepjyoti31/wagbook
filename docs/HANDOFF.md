# Handoff

The state of Wagbook right now. Read this first; rewrite it last. Keep it a description of the present, not a diary.

Last updated: 16 October 2026, after milestones M9 and M10 and a round of rough edges.

## In one paragraph

Every milestone on the roadmap is built: M2 to M8 (bookings, care, bills, photos, pets and people, reports, languages,
offline), M9 (a script policy with nonces, rate limits, two-step sign-in enforced by the database, downloading and
erasing a parent's details, certificates on the intake form, a backup and restore drill, a second security review) and
M10 (running it on your own server with Docker Compose, a public demo that resets nightly, templates, code of conduct,
changelog, release process, and a guide for kennel owners with pictures). The database rules are tested in-process (182
database tests, 125 unit tests), and the whole day is walked in a real browser at 360 pixels wide against a **local**
Supabase (`npm run test:e2e`, 34 tests). What has still never happened: a **hosted** Supabase project (the rest of M1),
a real phone, and a server for the public demo. **The Hindi and Kannada are first drafts.** The licence (M10, item 5)
waits for the owner.

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
| `deploy/demo-reset.sh` | Run against the local Supabase | Medium |
| New booking: the pet search (name, breed, parent, phone digits) and only free kennels offered for the dates typed | `src/lib/core/bookings.test.ts`; end-to-end (K05 hidden while Coco holds it, offered again from the day she leaves; a pet found by phone digits); screenshot at 360 pixels, 16 October 2026 | High |
| Currency and financial year start fixed once a bill is issued, including a cancelled one (`WB052`); drafts do not count | `tests/db/billing.test.ts` (the trigger removed once to see it fail); Settings shows both locked and still saves, checked in a browser at 360 pixels against the local Supabase | High |
| Hiding a pet or parent: owners and managers only, refused with a stay requested, confirmed or in house, a parent's pets go and come back with them (not ones hidden before), a pet waits for its parent | `tests/db/people.test.ts` (the triggers removed once to see the tests fail); end-to-end: a manager hides a new pet, it leaves search, is found under Hidden pets and shown again, and a pet with a stay to come is refused with the sentence | High |
| Owners and managers change a booking between boarding and day boarding; the kennel overlap then follows the new kind | `tests/db/bookings.test.ts` (staff refused with `WB022` already tested there); end-to-end: a manager turns a request into day boarding and back | High |
| Lint, types, production build | `npm run check` | High |

## What is NOT verified

| Thing | Why not | Risk |
| --- | --- | --- |
| A hosted Supabase project, and `docs/10-setup-and-deploy.md` followed end to end | Needs a person with a Supabase account | The local stack is the same software, so schema problems are unlikely. Settings screens, email templates and menu names in the guide may be off. |
| Sign-up email confirmation and the `/auth/confirm` round trip | Locally, email confirmation is off (`supabase/config.toml`) | The email template in the setup guide is from documentation, not tried |
| `.github/workflows/ci.yml` on GitHub | Never run there. The `e2e` job is new. | It runs exactly what passed here; image pulls in CI may be slow |
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
| The public demo running somewhere | No server | `deploy/demo-reset.sh` was tried locally only |
| The script policy on Vercel | Vercel may not ship `.next/build-manifest.json` to the proxy | Pages still work without it (no script rule, logged). Check the header after the first deploy (`10`, "Check the browser protections") |
| Rate limits on Vercel | Each copy of the app counts on its own | Add a Vercel Firewall rule (`10`, "Rate limits") |
| Erasure against the law | Not read by a lawyer | D25 says what is kept and why; see Open questions |
| An independent security review of M9 | The second review was Claude Code's own pass | Have a person outside the project review before a public instance |

## Do this next

1. **Finish M1** (needs the owner): create a development Supabase project (Mumbai), follow
   [10-setup-and-deploy.md](10-setup-and-deploy.md) Part 1 exactly, fix the guide where it is wrong, sign up with real
   email confirmation, and walk the first run. Then let CI run on GitHub once and fix anything in the `e2e` job. Check
   the script policy header and the rate limits on the hosted deploy (`10`, "Looking after it").
2. **Decide the licence** (M10, item 5; D2) and the code of conduct's contact address, before any public announcement.
3. **Have the Hindi and Kannada read by native speakers**, ideally kennel staff, on a phone (list below).
4. **Run the hosted backup round trip once** ([15-backup-and-restore.md](15-backup-and-restore.md)) and log it.
5. **Put up the public demo** on its own small server ([14-self-hosting.md](14-self-hosting.md), "The public demo"),
   and link it from the README.
6. **Ask a person outside the project for a security review**, and take the erasure rules (D25) and question 8 in `06`
   to a lawyer and an accountant.

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
| Licence: AGPL-3.0-or-later, or something more permissive | [09-decisions.md](09-decisions.md), D2 | AGPL. Confirm before the first public release; changing later needs every contributor's consent. |
| Should the reference kennel be named in `13-reference-deployment.md`? | That file | Unnamed. |
| Where the public repository lives, and under which GitHub account or organisation | | Private for now |
| Whether a bill may be in Hindi or Kannada (question 9 for the accountant) | [06-billing-and-gst.md](06-billing-and-gst.md) | Bills say "Tax invoice" in English with the translation in brackets |
| The contact address for the code of conduct (and so for conduct reports) | `CODE_OF_CONDUCT.md`, "Contact" | None yet: set one before the first public release |
| Whether owners must use two-step sign-in, rather than be reminded | D24 | Reminded, not forced |
| Where the public demo runs, and who pays for it | [14-self-hosting.md](14-self-hosting.md) | Not running |
| Invoice prefix and the GST questions | [06-billing-and-gst.md](06-billing-and-gst.md), "Questions to take to an accountant" | Tax off, prefix `WB` |

Decided: only owners and managers set or change a price (D15), extended to bills in M4.

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

Drafted on 16 October 2026, also unchecked: hiding from lists (सूचियों से छिपाएं, ಪಟ್ಟಿಗಳಿಂದ ಮರೆಮಾಡಿ) and the hidden
pets list, "Find a pet" on New booking, the sentence about taken kennels, the hint that the currency and year start
are fixed, and the hint under Stay on a booking.

## Open questions

Product behaviours that were chosen as the simplest thing and may need the owner's view.

- A pet that stays past its check-out date does not hold its kennel unless someone presses Extend to today. It is shown
  in red on Today, its booking and the calendar, and it keeps getting care tasks. Should it instead block the kennel
  automatically?
- Cancelling records a reason but no refund decision (bills are M4).
- Staff cannot remove an extra added by mistake; a manager has to. Right?
- Staff may add a one-off item at any price (for a vet bill paid for the parent). Right?
- In a family booking only the first pet gets the chosen kennel; the others get theirs at check-in.
- A pet's play sessions are at least two hours apart (`PLAY_GAP_MINUTES`). Should this be a setting?
- Skipping a task other than a medicine needs no note.
- A family booking is billed pet by pet (one bill per booking). Should the family get one bill?
- Staff can make and edit a draft bill but cannot issue an edited one. Should staff see the line editor at all? (They
  do not today.)
- A bill made before check-out is not rebuilt when the stay changes afterwards; Make bill on the draft brings it back
  in line, and an issued bill must be cancelled and made again.
- An update's photos cannot be removed once posted, except by deleting files as a manager in Supabase.
- Invitation links are not tied to an email or phone: whoever holds one can join, once (D19). Right for how kennels
  hire?
- Merging parents keeps the record you are on and hides the other. There is no "unmerge".
- Changing a booking between boarding and day boarding keeps the price that is in the box; the manager changes it by
  hand (a hint says so). Should it switch to the usual price for the new kind instead?
- Hiding a pet or parent from lists is for owners and managers only, and hiding a parent hides their pets too. A
  hidden parent has no list of their own: they are reached from their pets (under Hidden pets) or a past stay. Right?
- Any member can edit any detail of a pet or parent, including phone numbers. Should changing a parent's phone be for
  managers only?
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
- Tax by rate counts issued bills by their bill date and leaves cancelled ones out. A bill cancelled in a later month
  disappears from the earlier month's figure. Is that what the accountant wants for GST returns, or should a
  cancellation show in the month it happened? (A question for the accountant.)
- "Received less spent" is money in and out in the month, not profit: it ignores what is owed and when bills fall.
- Erasing a parent keeps their issued bills, payments and the stays' dates and prices, and empties everything else
  (D25). Is that what the DPDP Act and GST law ask, no more and no less? (For a lawyer.)
- Erasing also deletes the pets' incidents. A bite incident might matter to the kennel later. Keep incidents, emptied of
  names, instead?
- Two-step sign-in has no recovery codes; a lost phone needs an administrator (`10`). Enough for a small kennel?
- The intake form accepts one certificate per pet. Some parents have two cards (rabies, and the yearly shot).
- The rate limits are 20 sign-in tries, 10 forms and 20 joins per address per ten minutes. A kennel whose whole team
  signs in from one connection at shift change should not reach 20; tell us if it does.

## Known rough edges in what is built

- `care_items.requires_photo` is not offered or enforced: proof photos on tasks are not built.
- New booking still loads every pet into one list (capped at 2,000) and narrows it in the browser as you type.
- Incidents cannot be edited once written; add a new one or ask a manager.
- The calendar does not show requests (it says how many there are) and has no drag and drop (by design in M2).
- People shows names and roles but not email addresses (the app cannot read `auth.users`).
- No favicon beyond `icon.svg`; no social preview image. The landing page is a single screen of text.
- Reports measure how full the kennel was against the kennels in service **today** for every day; there is no history
  of kennels going in or out of service.
- A pet that overstays counts in the occupancy report only up to its check-out date unless someone pressed Extend.
- Removing an expense leaves its receipt file in storage (see `05`, known limitations).
- More lists Reports, Expenses and History of changes to staff too; staff who open them get a sentence saying they are
  for owners and managers.
- History of changes names fields by their database column names, in English, in every language.
- Bill line descriptions ("Boarding, 3 nights") and the amount in words stay in English on bills in every language.
- The service worker runs only in production builds, so `npm run dev` never shows the offline behaviour.
- History of changes shows an added row's fields collapsed and names only people, pets, parents, kennels and price list
  rows; other ids read "a record no longer here". An erasure shows as a change to "clients".
- An erased parent and their pets appear as "Erased" (stored in English) where a past stay or bill names them.
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
npm run check        # dash check, lint, typecheck, 307 tests, build
```

All of it should pass on a clean clone with no environment variables set. With Docker, also `npm run test:e2e`,
`scripts/race-checks.sh` and `scripts/backup-drill.sh` (see above).

## Session log

One line per session, newest first. What changed, in a sentence. Details belong in commits and pull requests.

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
