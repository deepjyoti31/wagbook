# 3. Architecture

## The shape of it

```
 Phone or laptop browser
        |
        |  HTML, forms
        v
 Next.js app (Vercel or any Node host)
   src/proxy.ts            refreshes the session cookie, bounces signed-out visitors
   src/app/**/page.tsx     Server Components: read with the user's own session
   src/app/**/actions.ts   Server Actions: validate, write, return a sentence
        |
        |  HTTPS, as the signed-in user (or as nobody, for public pages)
        v
 Supabase
   Auth       email and password, session in cookies
   Postgres   every table, every rule, row level security
   Storage    one private bucket for photos and certificates
```

There is no separate API server and no background worker. The Next.js server talks to Supabase with the visitor's own
session, so the database always knows who is asking and applies row level security to every query. The app holds no
key that could bypass those rules.

The browser runs almost no JavaScript of Wagbook's own: forms post to Server Actions and pages come back rendered. The
only client components are the form wrapper, the navigation highlight, the error page, and the parent intake form
(which adds and removes pets).

## Three layers, and what belongs in each

| Layer | Where | Holds | Tested by |
| --- | --- | --- | --- |
| Rules | `supabase/migrations/*.sql` | Tables, constraints, triggers, policies, functions. Anything that must be true no matter what. | `tests/db/*.test.ts` |
| Logic | `src/lib/core/*.ts` | Pure functions with no I/O: dates, money, tax, invoice numbers, play timetables, UPI and WhatsApp links. | `src/lib/core/core.test.ts` |
| Screens | `src/app`, `src/components` | Reading, showing, collecting input, calling the two layers above. | Typecheck, build, a browser |

How to decide where something goes:

- Could getting it wrong lose money, double book, or leak data? **Rules.**
- Is it arithmetic or text building that a screen and a test both need? **Logic.**
- Is it about what a person sees or taps? **Screens.**

Some arithmetic exists twice on purpose: `computeInvoice()` in TypeScript builds an invoice, and `issue_invoice()` in
SQL independently checks every line before freezing it. `fiscalYear()` and `fiscal_year_label()` are the same function
in two languages. Tests compare them. If you change one, change the other.

## Folder by folder

```
.claude/settings.json          SessionStart hook for Claude Code cloud sessions
.github/workflows/ci.yml       Runs npm run check on pushes to main and on pull requests
scripts/
  gen-db.mts                   Generates types and reference docs from the migrations
  cloud-session-start.sh       npm ci in a fresh cloud session
  check-dash.mjs               House style: fails if an em dash is found
supabase/migrations/           See "The database", below
src/
  proxy.ts                     Next.js 16's name for middleware
  app/
    layout.tsx globals.css     Root shell and the design tokens
    page.tsx                   Landing page
    login/ auth/confirm/       Sign in, sign up, email link landing
    onboarding/                Accept an invitation or create a kennel
    setup/                     Shown when env vars are missing
    app/                       Everything signed in
      layout.tsx               Kennel name and navigation
      page.tsx actions.ts      Today; check in, check out, switch kennel
      bookings/ dogs/ more/    One folder per area; page.tsx plus actions.ts
    i/[slug]/                  Public intake form
    s/[token]/                 Public stay page
  components/
    ui.tsx                     Every shared visual piece
    action-form.tsx            ActionForm and SubmitButton (client)
    nav.tsx                    Bottom or top navigation (client)
  lib/
    core/                      Pure logic, one file per subject, re-exported by index.ts
    supabase/
      env.ts                   Reads the two env vars; isSupabaseConfigured()
      server.ts                createClient() with cookies; createAnonClient() without
      session.ts               Session refresh used by proxy.ts
      database.types.ts        GENERATED
    auth.ts                    getUser, requireUser, getMemberships, requireOrg, rememberOrg
    errors.ts                  friendlyError()
    forms.ts                   FormState, text(), checked()
    safe-redirect.ts           safeDestination(): keeps redirects on this site
    intake.ts                  zod schema of the public intake payload
    pets.ts                    Warning flags offered for a pet
    queries.ts                 Shared read queries (bookingCards)
    site.ts                    siteOrigin(): the public address for links
tests/db/
  supabase-shim.sql            Stand-in for Supabase's roles, auth and storage schemas
  harness.ts fixtures.ts       createTestDb(), as(), seedKennel(), book()
  *.test.ts                    One file per area, plus hardening.test.ts
docs/                          You are here
```

## How a request works

### Reading: a page

```tsx
// src/app/app/more/kennels/page.tsx (shortened)
export default function KennelsPage({ searchParams }: PageProps<"/app/more/kennels">) {
  return (
    <>
      <PageTitle title="Kennels" />
      <Suspense fallback={<Loading label="Loading kennels" />}>
        <Kennels searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Kennels({ searchParams }) {
  const { org, canManage } = await requireOrg();          // 1. who is asking, for which kennel
  const supabase = await createClient();                  // 2. a client carrying their session
  const { data, error } = await supabase
    .from("kennels").select("id, name, is_active")
    .eq("org_id", org.id)                                 // 3. always filter by org_id
    .order("sort_order");
  if (error) throw new Error("Could not load kennels.");  // 4. error.tsx shows a plain page
  return ( ... );
}
```

Why it is shaped like this:

- The project has `cacheComponents: true`. Next.js prerenders everything it can at build time. Anything that depends on
  the request (cookies, search params, the database) must sit inside `<Suspense>`, or the build fails. So every page is
  a static shell plus one suspended async component.
- `getUser()` calls `await connection()` first, which tells Next.js "this can only be known per request". That makes it
  impossible to prerender a signed-in page by accident.
- `PageProps<"/route">` and `LayoutProps<"/route">` are global types generated by `next typegen`. `params` and
  `searchParams` are promises.
- `requireOrg()` is wrapped in React's `cache`, so calling it from the layout and the page costs one lookup.

### Writing: a Server Action

```ts
// src/app/app/more/kennels/actions.ts (shortened)
"use server";

export async function setKennelActive(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();                              // 1. authenticate
  const id = z.uuid().safeParse(form.get("kennelId"));             // 2. validate
  if (!id.success) return { error: "That kennel could not be found." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("kennels")
    .update({ is_active: form.get("active") === "true" })
    .eq("org_id", org.id).eq("id", id.data)                        // 3. org_id again
    .select("id");
  if (error) return { error: friendlyError(error) };               // 4. plain sentence
  if (data.length === 0) return { error: "Only an owner or manager can change kennels." };

  revalidatePath("/app", "layout");                                // 5. refresh what is shown
  return {};
}
```

Points to copy:

- A Server Action is a public HTTP endpoint. It must check who is calling, every time. `requireOrg()` does that.
- When row level security forbids an update, Postgres does not raise an error. It updates zero rows. So after an update
  or delete, select the id back and treat zero rows as "not allowed".
- Return `{ error }` or `{ ok }`; `ActionForm` shows it. Use `redirect()` to move to another page after success.
- The form is `<ActionForm action={theAction}>` with a `<SubmitButton>`. Hidden inputs carry ids.

### Public pages

`/i/{slug}`, `/s/{token}` and `/inv/{token}` use `createAnonClient()`, which has no session, and call one of the public
database functions. Those functions return only what the page shows. Public pages never query a table. The stay page
also asks Storage for signed photo links with `createAnonClient({ stayToken })`; see `05`, "Photos on the stay page".

## The database

Nine migration files, applied in name order. Each starts with a header comment explaining its area.

| File | Area |
| --- | --- |
| `…100_foundation.sql` | Extensions, shared helpers, organisations, memberships, invitations, the `my_org_ids()` helpers |
| `…200_clients_and_pets.sql` | Parents, pets, vaccinations |
| `…300_kennels_and_bookings.sql` | Kennels, rate card, peak periods, bookings, the no-overlap and capacity rules |
| `…400_daily_care.sql` | Routines, tasks, play yards and sessions, updates, incidents |
| `…500_billing.sql` | Invoices, lines, numbering, the immutability guards, payments, expenses |
| `…600_intake_and_public_pages.sql` | Intake submissions and the four public functions |
| `…700_audit_log.sql` | The audit log and its triggers |
| `…800_row_level_security.sql` | Every grant, every policy, in one place |
| `…900_storage.sql` | The `pet-media` bucket and its policies |

Row level security is in its own file so the whole access model can be read top to bottom. A new table adds its
policies there (or in its own new migration once migrations are frozen; see CLAUDE.md rule 12).

Conventions (all enforced or checked by tests where possible):

| Convention | Example |
| --- | --- |
| Money in minor units, `bigint` | `rate_minor = 120000` is ₹1,200.00 |
| Rates in basis points | `tax_rate_bp = 1800` is 18% |
| Stay dates are `date` | `start_date`, `end_date` |
| Phones in E.164 | `+919876543210` |
| Composite foreign keys | `(org_id, pet_id) references pets (org_id, id)` |
| Functions pin the search path | `set search_path = ''` and `public.` everywhere |
| Deliberate errors carry a code | `raise exception 'WB020: no space on %'` |
| Soft delete where history matters | `clients.deleted_at`, `pets.deleted_at` |
| Who and when are stamped by triggers | `checked_in_by`, `done_by`, `recorded_by` |

More in [04-data-model.md](04-data-model.md).

## Generated files

`npm run gen:db` starts an in-process Postgres, applies the migrations, reads the catalogue, and writes:

- `src/lib/supabase/database.types.ts`: the types the Supabase client uses, so `supabase.from("kennels")` knows its
  columns and `supabase.rpc("available_kennels", …)` knows its arguments.
- `docs/reference/schema.md`: every table, column, constraint, trigger, policy and function, with their comments.
- `docs/reference/error-codes.md`: every `WBnnn` code and where it is raised.

`tests/db/generated.test.ts` fails if any of the three is out of date. This replaces `supabase gen types`, which needs
Docker or a live project.

## Testing

```
npm run test:unit    56 tests   pure logic, under a second
npm run test:db     135 tests   real Postgres in-process, about 40 seconds
npm run test:e2e     18 tests   a real browser against the built app and a local Supabase (needs Docker)
```

### How the database tests work

`createTestDb()` starts PGlite (Postgres compiled to WebAssembly, running inside the test process), loads
`tests/db/supabase-shim.sql` (the `anon` and `authenticated` roles, `auth.users`, `auth.uid()`, `storage.objects`: just
enough of Supabase for the migrations to apply), then applies the real migration files.

`as(db, actor, fn)` runs `fn` the way a request through Supabase would: it switches to the `authenticated` or `anon`
role and sets the user id that `auth.uid()` returns.

```ts
const k = await seedKennel(db, { kennels: 3, pets: 2 });   // an org, its owner, a client, pets, kennels
const staff = await addMember(db, k, "staff");             // invite + accept
await as(db, user(staff), () => db.query("update public.kennels set name = 'x'"));  // touches 0 rows
const e = await errorOf(() => as(db, anon, () => db.query("select * from public.clients")));
expect(e.code).toBe("42501");
```

Do not nest `as()` calls: the inner one resets the role and the outer callback carries on as the wrong actor. Arrange
data first, then act.

What each file covers:

| File | Covers |
| --- | --- |
| `smoke.test.ts` | The migrations apply. |
| `security.test.ts` | Every table has RLS and a policy; anon can touch nothing but five functions; tenants are isolated in every table; role limits. |
| `bookings.test.ts` | No double booking, capacity, same-day turnover, day boarding, status stamps, the price rule, extras, families, requests, overstays, the check-in checklist. |
| `care.test.ts` | Medicines need a reason to be skipped, a double tap keeps the first stamp, the stay page counts what was ticked, play hours, moving a play session. |
| `seed.test.ts` | `supabase/seed.sql` applies on top of the migrations and builds the demo kennel. |
| `bills.test.ts` | `computeInvoice()` against `issue_invoice()` over awkward cases in all three tax modes; staff issue only what the booking says; one live bill per booking; advances; saving drafts. |
| `media.test.ts` | Photos on a stay page reach only the holder of that stay's token; stored paths stay in their kennel; another kennel cannot read a file. |
| `billing.test.ts` | Numbering, freezing, voiding, tax checks, payments, balances. |
| `intake.test.ts` | The public form, hostile payloads, accepting, the stay page. |
| `hardening.test.ts` | Regression tests for the findings of the security reviews. Read [05](05-security-and-privacy.md) before touching. |
| `generated.test.ts` | Generated files are current. |

These tests have been checked by breaking the database on purpose (switching off RLS on a table, dropping the overlap
constraint, granting anon a table, dropping the invoice guard). Each break made tests fail. When you add a rule, do the
same once: remove the rule, see your test fail, put it back.

### The end-to-end tests

`e2e/walk.spec.ts` walks a kennel's day in Chromium at 360 pixels wide: sign in, check in with the checklist, a double
booking refused, a family request confirmed, an overstay extended, the care round, play, a cancellation, a parent's
intake form accepted, the stay page in a private window, a manager's price change and extra, the calendar, and a new
person creating a kennel and inviting a colleague who joins and switches.

```bash
npx -y supabase@2.120.0 start     # once; needs Docker. Applies migrations and supabase/seed.sql
npm run test:e2e                  # resets the database to the seed, builds the app, runs the walk
E2E_BASE_URL=http://localhost:3000 npx playwright test    # against a dev server you already run
```

The tests share one database and run in order. `scripts/e2e.mjs` resets it first, so a run always starts from the seed.

### What is not tested automatically

A hosted Supabase project (the local stack is the same software, but email, settings screens and network differ),
real phones, and WhatsApp itself (Wagbook only builds the link). `HANDOFF.md` records what has been checked by hand.

## Design system

The whole look is in two files: tokens in `src/app/globals.css`, pieces in `src/components/ui.tsx`.

**Idea.** Wagbook is a register, so screens are ledgers: rows on white paper on a cool grey ground. The one piece of
decoration is the kennel door tag, a marigold tag with a punched hole, which is how a kennel is shown everywhere.

**Colour always means the same thing.**

| Token | Hex | Means |
| --- | --- | --- |
| `ink` | `#14213d` | Text, primary buttons |
| `slate` | `#55607a` | Secondary text |
| `ground` | `#edf0f5` | Page background |
| `paper` | `#ffffff` | Cards and rows |
| `rule` | `#d5dae4` | Borders |
| `marigold` | `#f2a900` | Needs attention: arrivals, the door tag |
| `leaf` | `#1b7446` | Done, in house, success |
| `alert` | `#b3261e` | Medical, allergies, incidents, errors |

Each of the last three has a `-soft` background tint. Colour is never the only signal: a badge always has words.

**Type.** The system font, so nothing downloads on a slow connection. Numbers are tabular everywhere so dates and
prices line up. Headings are heavy and tight; body text is 16 pixels or larger.

**Pieces.** `PageTitle`, `Section` (a heading with a count), `Ledger` and `LedgerRow`, `Empty`, `DoorTag`, `Badge`
(neutral, attention, good, alert), `Field` (label, hint, control), `Input`, `Textarea`, `Select`, `Loading`, `Notice`,
and `buttonStyles` (primary, secondary, quiet, whatsapp). Build screens from these. If a screen needs something new,
add it to `ui.tsx`; do not style one-off elements in a page.

**Layout.** One column, 48 pixel touch targets, navigation along the bottom on phones and along the top from the `sm`
breakpoint. Four destinations: Today, Bookings, Pets, More.

**Words.** Sentence case. No all-capitals labels. No arrows in buttons. No em dashes. Empty states say what to do next.

## Environment variables

| Name | Needed | What |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | The project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (or the next one) | The publishable key. Safe in the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Alternative | The older name for the same thing. |
| `NEXT_PUBLIC_SITE_URL` | In production | Public address, no trailing slash. Used in links sent to parents. On Vercel, `VERCEL_PROJECT_PRODUCTION_URL` is used if this is empty. |

There is no secret. If you find yourself adding one, read [05-security-and-privacy.md](05-security-and-privacy.md)
first.

`NEXT_PUBLIC_` values are compiled into the build. Change them, then rebuild.
