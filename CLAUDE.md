# Wagbook: instructions for Claude Code

@AGENTS.md

Wagbook is open source kennel management software: bookings, daily care, billing and parent updates for pet boarding
kennels. India first, usable anywhere. Real kennels run their operations on it, so correctness of bookings and money
matters more than speed of delivery.

## Start of every session

1. Read `docs/HANDOFF.md`. It says what is built, what is verified, and what to do next.
2. Read the milestone you are working on in `docs/08-roadmap.md`. Do that milestone and nothing else.
3. Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (see the block above). This
   project uses Next.js 16 with cache components. Much of what you remember about Next.js is out of date.
4. Run `npm run check` once before changing anything, so you know the starting state is green.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3000. |
| `npm run check` | The gate: lint, typecheck, all tests, production build. Must pass before you say you are done. |
| `npm run test:unit` | Pure logic tests in `src/` (fast). |
| `npm run test:db` | Database tests: applies every migration to an in-process Postgres and attacks it. |
| `npm run test:e2e` | Browser walk of the whole day against a local Supabase (`npx -y supabase@2.120.0 start` first; needs Docker). Not part of `check`. |
| `npm run gen:db` | Regenerates `src/lib/supabase/database.types.ts`, `docs/reference/schema.md` and `docs/reference/error-codes.md` from the migrations. |
| `npm run typecheck` | `next typegen` then `tsc`. |

No Docker, no Supabase account and no network are needed for any of these, except `test:e2e`.

## Where things are

```
supabase/migrations/   The database. The source of truth for rules. One file per area.
src/lib/core/          Pure functions: dates, money, tax, invoice numbers, UPI, WhatsApp. No I/O. Unit tested.
src/lib/supabase/      Clients, session refresh, generated types.
src/lib/auth.ts        requireUser() and requireOrg(). The only place the session is read.
src/lib/errors.ts      Database error to plain sentence.
src/app/               Pages and Server Actions. /app is signed in; /i and /s are public.
src/components/        ui.tsx (all shared building blocks), action-form.tsx, nav.tsx, rich.tsx.
src/messages/          Every word on screen: en.ts (from en/<area>.ts), hi.ts, kn.ts. See D21.
src/lib/i18n.ts        fill(), plural(), languages. i18n-server.ts picks the reader's language.
tests/db/              Database tests and the PGlite harness.
scripts/gen-db.mts     The generator behind npm run gen:db.
docs/                  Numbered guides, plus reference/ (generated, do not edit).
```

## Rules that are not negotiable

### Database

1. **Rules live in the database.** A rule that protects money, bookings or privacy is a constraint, trigger or policy
   in a migration, with a test. The app repeats a check only to give a nicer sentence.
2. **Every tenant table has `org_id`, row level security, grants and policies.** Until the migration freeze they go
   in `…800_row_level_security.sql`, where the whole access model is read in one place; after it, in the new migration
   that creates the table. The test suite fails if a table has row level security off or no policy
   (`invoice_counters` and `recovery_codes` are the deliberate exceptions, sealed with no policy at all).
3. **Foreign keys between tenant tables are composite**: `(org_id, x_id) references x (org_id, id)`. A plain
   `x_id references x (id)` lets one kennel point at another kennel's row.
4. **Every function sets `search_path = ''`** and schema-qualifies every name. After creating one:
   `revoke all on function ... from public, anon;` then grant to `authenticated` only if the app calls it.
5. **`security definer` is the exception.** Use it only when the caller must do something row level security forbids,
   and then the function must check `auth.uid()` and membership itself. Say why in the comment.
6. **The anonymous role can call exactly twelve functions** (`get_public_intake_form`, `submit_intake`,
   `get_public_stay`, `get_public_invoice`, `get_public_booking_form`, `submit_booking_request`, the food order page's
   `get_public_food_form`, `submit_food_order`, `food_order_paid` and `submit_food_request`, and two that Storage calls:
   `stay_media_visible` for photos on a stay page and `intake_upload_allowed` for certificates sent with the intake form)
   and can touch no table. Adding another needs
   a line in `tests/db/security.test.ts` and a paragraph in `docs/05-security-and-privacy.md`.
7. **The service role key is never used.** Not in the app, not in scripts, not in tests.
8. **Money is `bigint` in minor units** (paise), in columns ending `_minor`. Tax rates are integer basis points,
   ending `_bp` (1800 is 18%). Never a float, never a decimal string in the database.
9. **Stay dates are `date`, never `timestamptz`.** "Today" is worked out in the kennel's time zone with `todayIn()`.
10. **Every table, column that is not obvious, enum and function gets a `comment on`.** The schema reference is
    generated from those comments.
11. **Errors raised on purpose start with a code**, `WBnnn: plain sentence`. Take the next free number in the range
    (see `docs/reference/error-codes.md`), and give it a sentence in `errors.codes` in every message file (a test
    checks). Never reuse or renumber a code.
12. **Migrations.** Until the first production deployment (see `docs/HANDOFF.md`, "Migration freeze"), edit the existing
    files in place. After it, never edit an applied migration; add a new timestamped file.
13. **After any migration change run `npm run gen:db`** and commit the regenerated files. A test fails if you forget.

### App

14. **Every query filters by `org_id` explicitly**, even though row level security would do it. A person can belong to
    two kennels, and row level security alone would then mix them.
15. **Every Server Action under `/app` starts with `requireOrg()`**, validates its input (zod for anything with
    structure), and returns a `FormState` (`{ error }` or `{ ok }`) or redirects. Use `friendlyError()` for database
    errors. Never show a raw error message. The exceptions are the actions that exist for people who are not signed in
    (`signIn`, `signUp`, the public intake form) and `signOut`.
16. **Anything read at request time goes inside `<Suspense>`.** Pages export a plain function that renders a shell and a
    suspended async child. Look at `src/app/app/more/kennels/page.tsx` for the pattern.
17. **A file with `"use server"` exports only async functions.** Constants and schemas shared with pages go in `src/lib/`.
18. **Data from the public internet is parsed before it is shown.** The intake payload goes through `IntakePayload`
    in `src/lib/intake.ts` every time it is read.
19. **No new dependency without a reason written in `docs/09-decisions.md`.** There is no UI library, no ORM, no state
    library, no date library, and that is on purpose.

### Writing and design

20. **Plain words, from the message files.** Every word on screen comes from `src/messages` (D21): add it to the
    English area file, then to `hi` and `kn` (the message test fails until all three match). The reader is a kennel worker on a phone. "Pets in house", not "active occupancy". Sentence case.
    Buttons say what happens: "Check in", "Add kennels".
21. **Never use the em dash character** anywhere: code, comments, copy, docs, commit messages. Use a full stop, a comma,
    a colon or brackets. (The one in `AGENTS.md` is put there by Next.js; leave it.)
22. **No all-capitals labels, no arrows in button text, no decorative gradients.** Use the tokens in
    `src/app/globals.css` and the pieces in `src/components/ui.tsx`. The design system is described in
    `docs/03-architecture.md`.
23. **Touch targets are at least 48 pixels high.** Test every screen at 360 pixels wide.

### Clean room

24. **Do not copy from other kennel software.** No text, screens, layouts, names or code from any commercial product.
    Wagbook is designed from how kennels work, not from someone else's screens. Do not scrape other products' sites.

### Privacy of real kennels

25. `docs/13-reference-deployment.md` holds one example kennel's public operating rules, unnamed. Wagbook is an
    independent project: never name a real kennel business in this repository, and add nothing about one: no
    finances, plans, dates, suppliers or customer data.

## Definition of done

A piece of work is done when all of these are true:

- [ ] `npm run check` passes.
- [ ] New database rules have a test in `tests/db/` that fails when the rule is removed.
- [ ] New pure logic has a unit test next to it.
- [ ] `npm run gen:db` has been run if a migration changed.
- [ ] The screen was looked at in a browser at 360 pixels wide (take a screenshot), or `docs/HANDOFF.md` says plainly
      that it was not.
- [ ] `docs/02-product-spec.md` marks the feature as built, and `docs/08-roadmap.md` ticks the milestone.
- [ ] `docs/HANDOFF.md` is updated: what changed, what is verified, what is next.
- [ ] No em dash was added: `npm run check:dash` prints nothing.

## When unsure

- A product question (what should happen when a parent cancels?): check `docs/02-product-spec.md` and
  `docs/13-reference-deployment.md`. If it is not answered, pick the simplest behaviour, write it down under
  "Open questions" in `docs/HANDOFF.md`, and carry on.
- A choice that cannot be undone (deleting data, changing how invoice numbers work, changing the licence): stop and ask.
- A tax or legal question: do not guess. Write the question in `docs/HANDOFF.md` for the owner to take to an accountant.
