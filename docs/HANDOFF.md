# Handoff

The state of Wagbook right now. Read this first; rewrite it last. Keep it a description of the present, not a diary.

Last updated: 13 October 2026, after milestones M2 and M3 and most of M1.

## In one paragraph

The database for the whole product exists, with its rules enforced and tested (116 database tests, 48 unit tests).
Milestones M2 (bookings: booking page, families, requests, calendar, extras, peak periods, overstays, check-in
checklist, price for managers only) and M3 (the care round, daily routines, solo play timetable, yard calculator) are
built. Every migration and the demo seed apply on Supabase's own Postgres image, and the whole day has been walked in
a real browser at 360 pixels wide against a **local** Supabase (`npm run test:e2e`, 13 of 13 pass). What has still never
happened is a **hosted** Supabase project: the setup guide, real sign-up email and production settings. That is what is
left of M1.

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
| Intake form with hostile input, accepting, reviewing once, stay page contents and expiry | `tests/db/intake.test.ts`, `hardening.test.ts` | High |
| Pure logic: dates, money, GST, invoice numbers, play planning (including around existing sessions), peaks, calendar grid, UPI, WhatsApp | `src/lib/core/core.test.ts` and others (48) | High |
| Generated types and reference docs match the migrations | `tests/db/generated.test.ts` | High |
| The signed-in screens work through PostgREST and real Auth: embedded selects, RPCs, upserts, bulk inserts, column grants | `npm run test:e2e` against the local Supabase: sign in, check in with checklist, double booking refused with the right sentence, staff sees no price box, family request then confirm, extend an overstay, care round with a double tap, plan and tick play, cancel with a reason, parent intake form in a private window then accept and book, stay page in a private window, manager price change and extra, calendar books from an empty square, sign up, create a kennel, add kennels, invite, join, switch, sign out | High for the local stack |
| Every new screen at 360 pixels wide, no sideways scroll, no browser errors | Screenshots of Today, Bookings, booking page (staff and manager), New booking, Calendar, Care, Play, More, Daily routines, Play yards, Extras, Peak periods, against the demo data | Medium: desktop Chromium at phone size, not a phone |
| Lint, types, production build | `npm run check` | High |

## What is NOT verified

| Thing | Why not | Risk |
| --- | --- | --- |
| A hosted Supabase project, and `docs/10-setup-and-deploy.md` followed end to end | Needs a person with a Supabase account | The local stack is the same software, so schema problems are unlikely. Settings screens, email templates and menu names in the guide may be off. |
| Sign-up email confirmation and the `/auth/confirm` round trip | Locally, email confirmation is off (`supabase/config.toml`) | The email template in the setup guide is from documentation, not tried |
| `.github/workflows/ci.yml` on GitHub | Never run there. The `e2e` job is new. | It runs exactly what passed here; image pulls in CI may be slow |
| Anything on a real phone | Only Chromium at 360 pixels | Touch, keyboard covering fields, date and time pickers |
| "A full meal round for twenty dogs in under two minutes" (M3) | Not timed on a phone. Each tap is one round trip to the server. | Probably fine on a good connection; slow networks are M8 |
| Send update, Send confirmation, the intake link on WhatsApp | Only the link is built; WhatsApp was not opened | Low: the functions are unit tested |
| Storage upload paths and policies in use | No screen uses storage yet | Covered structurally by tests only |
| The Claude Code cloud SessionStart hook | Not checked this session | If it fails, run `npm ci` by hand |

## Do this next

1. **Finish M1** (needs the owner): create a development Supabase project (Mumbai), follow
   [10-setup-and-deploy.md](10-setup-and-deploy.md) Part 1 exactly, fix the guide where it is wrong, sign up with real
   email confirmation, and walk the first run. Then let CI run on GitHub once and fix anything in the `e2e` job.
2. **Then M4, bills and payments** ([08-roadmap.md](08-roadmap.md)). Build the bill from the booking (its stay line and
   extras, as the booking page's estimate already does with `quoteStay()`), and settle the price rule for bills (D15,
   "Look again").

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

Decided this session: only owners and managers set or change a price (D15).

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
- The intake form asks for up to six pets, and New booking books up to six together. Enough?
- A person can own at most five kennels on one installation. Enough?
- Forms from parents stay "new" until someone deals with them; there is no expiry.

## Known rough edges in what is built

- The kind of stay (boarding or day boarding) cannot be changed on a booking; cancel and book again.
- New booking lists every pet in one dropdown (capped at 2,000). Needs search later (M6).
- New booking offers every kennel in service, not only the free ones. The database refuses a taken one with a clear
  sentence. The booking page and Today offer only free kennels.
- `care_items.requires_photo` is not offered or enforced (photos are M5).
- The calendar does not show requests (it says how many there are) and has no drag and drop (by design in M2).
- People shows names and roles but not email addresses (the app cannot read `auth.users`).
- Settings has no fields yet for time zone, currency, locale or financial year start. They default to India (M4).
- No favicon beyond `icon.svg`; no social preview image. The landing page is a single screen of text.

## How to check the state yourself

```bash
npm ci
npm run check        # dash check, lint, typecheck, 164 tests, build
```

All of it should pass on a clean clone with no environment variables set. With Docker, also `npm run test:e2e` (see
above).

## Session log

One line per session, newest first. What changed, in a sentence. Details belong in commits and pull requests.

- 13 October 2026. M2 and M3 built; price made manager only (D15); M1 done against a local Supabase (seed, config,
  Playwright walk, CI job); fixed success messages that vanished on Today and the booking page, and forms losing what
  was typed after an error.
- 8 October 2026. M0: foundation built; two review passes and fixes (see `05`, review log); documentation written.
