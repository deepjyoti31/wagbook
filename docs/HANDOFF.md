# Handoff

The state of Wagbook right now. Read this first; rewrite it last. Keep it a description of the present, not a diary.

Last updated: 8 October 2026, at the end of milestone M0.

## In one paragraph

The database for the whole product exists, with its rules enforced and tested (136 tests). The first screens exist:
sign-in, kennel setup, kennels, people, settings, pets, bookings, Today, the parent intake form and its review, and the
parent stay page. Those screens compile, typecheck and build, and the public ones have been opened in a browser, but
**no signed-in screen has ever run against a real Supabase project**. That is the first thing to do.

## What is verified, and how

| Thing | Verified by | Confidence |
| --- | --- | --- |
| Every migration applies in order | `tests/db/smoke.test.ts`, on in-process Postgres 18 (PGlite) | High for Postgres. Not yet tried on Supabase itself. |
| Tenant isolation, role limits, the anonymous surface | `tests/db/security.test.ts`, `hardening.test.ts` | High |
| No double booking, capacity, same-day turnover, day boarding | `tests/db/bookings.test.ts` | High |
| Invoice numbering, freezing, voiding, tax checks, payments | `tests/db/billing.test.ts` | High |
| Intake form with hostile input, accepting, reviewing once, stay page contents and expiry | `tests/db/intake.test.ts`, `hardening.test.ts` | High |
| The tests themselves catch breakage | Four deliberate breaks (RLS off, overlap constraint dropped, anon granted a table, invoice guard dropped); each failed tests | High |
| Pure logic: dates, money, GST, invoice numbers, play planning, UPI, WhatsApp, error sentences, safe redirects | `src/lib/core/core.test.ts` (33), `src/lib/errors.test.ts` (4), `src/lib/safe-redirect.test.ts` (3) | High |
| Generated types and reference docs match the migrations | `tests/db/generated.test.ts` | High |
| Lint, types, production build | `npm run check` | High |
| Landing, sign-in, sign-up, setup and not-found pages render at phone width | Looked at in a browser (screenshots) with placeholder settings | Medium |
| Signed-out visitors are sent to sign-in from `/app` and `/onboarding` | Browser and curl | High |
| Sign-in shows a clear message when the server cannot be reached | Browser | High |
| Security headers are sent; `/auth/confirm` refuses off-site redirects | curl against the built app | High |

## What is NOT verified

Be honest with yourself about this list. Do not shorten it without doing the work.

| Thing | Why not | Risk |
| --- | --- | --- |
| **Every signed-in screen** (onboarding, Today, bookings, pets, kennels, people, settings, intake review) | Built without access to a Supabase project or Docker. Checked by the compiler against generated types only. | Queries may behave differently through PostgREST: embedded selects, RPC argument names, upsert with `onConflict`, zero-row updates. Expect a handful of small fixes. |
| The public intake form and stay page with real data | Same | Same |
| Migrations on real Supabase | The tests use a stand-in for Supabase's `auth`, `storage` and `extensions` schemas | A migration could fail on privileges or on something the stand-in does not model. Likely places: `create extension btree_gist with schema extensions`, policies on `storage.objects`, the insert into `storage.buckets`. |
| Sign-up email confirmation, the `/auth/confirm` round trip | Needs real Auth | The email template in the setup guide is from documentation, not tried |
| `docs/10-setup-and-deploy.md` | Never followed end to end | Menu names may be off; a step may be missing |
| `.github/workflows/ci.yml` | Never run | Should pass; it runs `npm run check` |
| The Claude Code cloud SessionStart hook | Written from documentation, never run in a cloud session | If it fails, run `npm ci` by hand; nothing else depends on it |
| Anything on a real phone | Only desktop Chromium at 390 pixels wide | Touch target and keyboard behaviour |
| Storage upload paths and policies in use | No screen uses storage yet | Covered structurally by tests only |

## Do this next

**Milestone M1** in [08-roadmap.md](08-roadmap.md): prove everything against a real Supabase project, fix what
breaks, add demo data and end-to-end tests. Nothing else should start until M1 is done, because every later milestone
builds screens on the same patterns.

What M1 needs from a person before a session can start:

1. The repository on GitHub. If you received this as a folder rather than a clone:

   ```bash
   git init -b main
   git add -A
   git commit -m "Wagbook foundation (M0)"
   git remote add origin https://github.com/YOUR-ACCOUNT/wagbook.git
   git push -u origin main
   ```

   Keep it private until the licence decision below is confirmed.
2. A Supabase project for development (not the kennel's real one), Mumbai region, with the nine migrations applied.
   See [10-setup-and-deploy.md](10-setup-and-deploy.md), Part 1.
3. A Claude Code cloud environment that can reach that project and has its URL and publishable key. See
   [11-working-with-claude-code.md](11-working-with-claude-code.md).
4. On the dev project, either email confirmation turned off, or two test accounts created by hand.

## Migration freeze

**Not frozen.** No production database exists. Migrations in `supabase/migrations/` may be edited in place.

When the first production project is created, replace this paragraph with: "Frozen on (date). Never edit an existing
migration. Add new files."

## Decisions waiting for the owner

| Decision | Where | Default taken |
| --- | --- | --- |
| Licence: AGPL-3.0-or-later, or something more permissive | [09-decisions.md](09-decisions.md), D2 | AGPL. Confirm before the first public release; changing later needs every contributor's consent. |
| May staff change a booking's price? | [05-security-and-privacy.md](05-security-and-privacy.md), known limitations | Yes for now; the audit log records it. Decide in M2. |
| Should the reference kennel be named in `13-reference-deployment.md`? | That file | Unnamed. |
| Where the public repository lives, and under which GitHub account or organisation | | Not created yet |
| Invoice prefix and the GST questions | [06-billing-and-gst.md](06-billing-and-gst.md), "Questions to take to an accountant" | Tax off, prefix `WB` |

## Open questions

Product behaviours that were chosen as the simplest thing and may need the owner's view. Add to this list rather than
guessing silently.

- A pet that stays past its check-out date does not keep holding its kennel. M2 adds "Extend to today". Should an
  overstaying pet instead block the kennel automatically?
- Cancelling a booking asks for no reason and records no refund decision yet.
- The intake form asks for up to six pets. Enough?
- A person can own at most five kennels on one installation. Enough?
- Forms stay "new" until someone deals with them; there is no expiry.

## Known rough edges in what is built

- After a form fails validation on the server, the fields reset to their defaults. Fix by returning the submitted
  values in `FormState` and using them as `defaultValue`.
- Rows on Today and Bookings are not links; there is no booking page yet (M2).
- New booking lists every pet in one dropdown (capped at 2,000). Fine for a new kennel; needs search later (M6).
- New booking offers every kennel in service, not only the free ones. The database refuses a taken one with a clear
  sentence. The check-in picker on Today does offer only free kennels.
- People shows names and roles but not email addresses (the app cannot read `auth.users`). An inviter who mistypes an
  email sees the same message, and simply no new row in the list.
- Settings has no fields yet for time zone, currency, locale or financial year start. They default to India.
- No favicon beyond `icon.svg`; no social preview image.
- The landing page is a single screen of text.

## How to check the state yourself

```bash
npm ci
npm run check        # dash check, lint, typecheck, 136 tests, build
```

All of it should pass on a clean clone with no environment variables set.

## Session log

One line per session, newest first. What changed, in a sentence. Details belong in commits and pull requests.

- 8 October 2026. M0: foundation built; two review passes and fixes (see `05`, review log); documentation written.
