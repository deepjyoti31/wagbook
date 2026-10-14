# Handoff

The state of Wagbook right now. Read this first; rewrite it last. Keep it a description of the present, not a diary.

Last updated: 14 October 2026, after milestone M6.

## In one paragraph

The database for the whole product exists, with its rules enforced and tested (142 database tests, 60 unit tests).
Built: M2 (bookings), M3 (the care round and play), M4 (bills, payments, the parent's bill with a UPI QR code, printing),
M5 (photos: pet photos on every row, updates with photos, photos on the stay page, certificates) and M6 (pet and parent
pages, search by parent and phone, vaccination warnings, incidents, people with invitation links, merging parents). The
whole day, from booking to a paid bill and a photo the parent sees, plus a new colleague joining through a link, is
walked in a real browser at 360 pixels wide against a **local** Supabase (`npm run test:e2e`, 22 of 22 pass, also green
in CI). What has still never happened is a **hosted** Supabase project:
the setup guide, real sign-up email and production settings. That is what is left of M1.

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
| Generated types and reference docs match the migrations | `tests/db/generated.test.ts` | High |
| The signed-in screens work through PostgREST, real Auth and real Storage | `npm run test:e2e` against the local Supabase: sign in, check in with checklist, double booking refused with the right sentence, staff sees no price box, family request then confirm, extend an overstay, care round with a double tap, plan and tick play, cancel with a reason, parent intake form in a private window then accept and book, stay page in a private window, manager price change and extra, calendar books from an empty square, sign up, create a kennel, add kennels, invite, join, switch, sign out, an advance, check out then make, issue and pay a bill (the parent sees the QR and then "Paid in full"), a manager edits a draft bill, a pet photo and an update with a photo seen by the parent, a vaccination with a PDF certificate, search by phone and parent name, a pet's details changed and a high incident shown on Today until dealt with, a parent's details changed and a duplicate merged in, a new person joining through an invitation link then suspended and restored | High for the local stack |
| Every screen at 360 pixels wide, no sideways scroll, no browser errors | Screenshots of Today, Bookings, booking page (staff and manager), New booking, Calendar, Care, Play, More, Daily routines, Play yards, Extras, Peak periods, Bills, a bill, the parent's bill, Write update, the stay page with photos, a pet, an incident, a parent, People, search | Medium: desktop Chromium at phone size, not a phone |
| Lint, types, production build | `npm run check` | High |

## What is NOT verified

| Thing | Why not | Risk |
| --- | --- | --- |
| A hosted Supabase project, and `docs/10-setup-and-deploy.md` followed end to end | Needs a person with a Supabase account | The local stack is the same software, so schema problems are unlikely. Settings screens, email templates and menu names in the guide may be off. |
| Sign-up email confirmation and the `/auth/confirm` round trip | Locally, email confirmation is off (`supabase/config.toml`) | The email template in the setup guide is from documentation, not tried |
| `.github/workflows/ci.yml` on GitHub | Never run there. The `e2e` job is new. | It runs exactly what passed here; image pulls in CI may be slow |
| Anything on a real phone | Only Chromium at 360 pixels | Touch, keyboard covering fields, date and time pickers |
| "A full meal round for twenty dogs in under two minutes" (M3), "billed, sent, paid and marked paid from a phone in under a minute" (M4), "today's photo within seconds on a slow connection" (M5) | Not timed on a phone or a throttled connection | Each step is one round trip; the stay page loads small copies (480 pixels) of photos. Probably fine; slow networks are M8 |
| Scanning the QR code with a real UPI app, and paying | No phone here. The code decodes to the exact link in tests. | Some apps ignore the amount (see `07`) |
| Photos from a real phone camera (HEIC on iPhone, very large photos, rotation) | Tested with a JPEG made in the browser | The browser redraws photos the right way up; a format the browser cannot read is refused with a sentence |
| Send update, Send confirmation, the intake link on WhatsApp | Only the link is built; WhatsApp was not opened | Low: the functions are unit tested |
| Storage upload paths and policies in use | No screen uses storage yet | Covered structurally by tests only |
| The Claude Code cloud SessionStart hook | Not checked this session | If it fails, run `npm ci` by hand |

## Do this next

1. **Finish M1** (needs the owner): create a development Supabase project (Mumbai), follow
   [10-setup-and-deploy.md](10-setup-and-deploy.md) Part 1 exactly, fix the guide where it is wrong, sign up with real
   email confirmation, and walk the first run. Then let CI run on GitHub once and fix anything in the `e2e` job.
2. **Then M7, reports and expenses** ([08-roadmap.md](08-roadmap.md)).

To run everything locally in a session that has Docker (a Claude Code cloud container does, with `dockerd` started by
hand):

```bash
dockerd > /tmp/dockerd.log 2>&1 &          # only if the Docker daemon is not running
SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx -y supabase@2.120.0 start   # docker.io if the default registry refuses
npm run test:e2e
```

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
| Invoice prefix and the GST questions | [06-billing-and-gst.md](06-billing-and-gst.md), "Questions to take to an accountant" | Tax off, prefix `WB` |

Decided: only owners and managers set or change a price (D15), extended to bills in M4.

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
- Any member can edit any detail of a pet or parent, including phone numbers. Should changing a parent's phone be for
  managers only?
- The intake form asks for up to six pets, and New booking books up to six together. Enough?
- A person can own at most five kennels on one installation. Enough?
- Forms from parents stay "new" until someone deals with them; there is no expiry.

## Known rough edges in what is built

- The kind of stay (boarding or day boarding) cannot be changed on a booking; cancel and book again.
- New booking lists every pet in one dropdown (capped at 2,000). Needs search later (M6).
- New booking offers every kennel in service, not only the free ones. The database refuses a taken one with a clear
  sentence. The booking page and Today offer only free kennels.
- `care_items.requires_photo` is not offered or enforced: proof photos on tasks are not built.
- The bill's stay line shows its dates as 2026-10-12 rather than 12 Oct 2026 (it comes from `stayLines()` and is frozen
  on issued bills).
- Pets and parents cannot be hidden from lists from the screen yet (soft delete exists in the database).
- Incidents cannot be edited once written; add a new one or ask a manager.
- The calendar does not show requests (it says how many there are) and has no drag and drop (by design in M2).
- People shows names and roles but not email addresses (the app cannot read `auth.users`).
- Settings has no fields yet for time zone, currency, locale or financial year start. They default to India (M4).
- No favicon beyond `icon.svg`; no social preview image. The landing page is a single screen of text.

## How to check the state yourself

```bash
npm ci
npm run check        # dash check, lint, typecheck, 202 tests, build
```

All of it should pass on a clean clone with no environment variables set. With Docker, also `npm run test:e2e` (see
above).

## Session log

One line per session, newest first. What changed, in a sentence. Details belong in commits and pull requests.

- 14 October 2026. M6 (pet and parent pages, search, vaccination warnings, incidents, people, invitation links,
  merging parents); fixed another vanishing success message (incident buttons).
- 14 October 2026. M4 (bills, payments, UPI QR, printing; staff issue only bills that match the booking) and M5
  (photos, updates, stay page photos through a token-checked storage policy, certificates) built; e2e walk extended to
  18 tests.
- 13 October 2026. M2 and M3 built; price made manager only (D15); M1 done against a local Supabase (seed, config,
  Playwright walk, CI job); fixed success messages that vanished on Today and the booking page, and forms losing what
  was typed after an error.
- 8 October 2026. M0: foundation built; two review passes and fixes (see `05`, review log); documentation written.
