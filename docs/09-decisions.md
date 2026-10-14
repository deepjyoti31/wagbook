# 9. Decisions

Why things are the way they are. One entry per decision that someone might later question. Entries are never deleted:
if a decision is reversed, add a new entry that says so and mark the old one "Superseded by Dn".

Format: the situation, what was decided, why, what it costs, and when to look again.

---

## D1. Supabase for the database, sign-in and files

**Status:** Decided, 8 October 2026.

**Situation.** Wagbook needs a database, sign-in and file storage. It must be easy for one person and a coding agent
to build on, cost nothing or nearly nothing for a small kennel, be self-hostable (the project is open source and
promises kennels their own data), keep Indian data in India, and still fit in five years. The two candidates were
Supabase and Firebase.

**Decision.** Supabase.

**Why.**

| Need | Supabase | Firebase |
| --- | --- | --- |
| The data is relational: a parent has pets, a pet has bookings, a booking has a kennel, an invoice has lines | Postgres. Joins, foreign keys, transactions. | Firestore is a document store. Joins are done by hand in app code. |
| "This kennel is free from the 14th to the 17th" | A range type and an exclusion constraint. The database refuses a double booking by itself. | No equivalent. It would be app code plus transactions, and any client that skips the code can double book. |
| Consecutive invoice numbers with no gaps | A row lock in a transaction | Possible with transactions, awkward and easy to get wrong |
| Many kennels in one installation, isolated | Row level security, written and tested in SQL | Security rules in their own language, harder to test exhaustively |
| Anyone can run their own copy | Open source. Self-hosts with Docker. | Closed. Runs only on Google's cloud. An open source Wagbook on Firebase could not be self-hosted. |
| Leaving | It is Postgres. `pg_dump` and go anywhere. | Export and rewrite. |
| Data in India | Mumbai region | Mumbai region |
| Reports | SQL | Export to something else first |
| Predictable cost | Fixed monthly plan | Per read and write. A chatty screen costs money. |

Firebase is better at offline sync on phones and at push notifications. Wagbook's offline need is narrow (ticking
tasks, milestone M8) and can be met with a service worker.

**Cost.** A hard dependency on Postgres features (range types, exclusion constraints, RLS). That is intended: Postgres
will outlive every framework in this repository. Supabase-specific surface is small: the Auth API, the Storage API, and
the PostgREST client. All three have self-hosted and alternative implementations.

**Five-year check.** A kennel with 60 kennels at full occupancy creates on the order of ten thousand bookings and a few
hundred thousand task rows a year. That is small for Postgres. The free plan's database size comfortably holds years of
one kennel's rows; photos are what grow, and those are in Storage and can be resized and expired. A shared public
instance for many kennels would move to a paid plan, which is a fixed monthly price.

**Look again if** Supabase changes its licence or stops offering self-hosting.

---

## D2. Licence: AGPL-3.0-or-later

**Status:** Provisional. The project owner must confirm before the first public release.

**Situation.** The goal is that every kennel can use Wagbook free for ever. The risk is a company taking the code,
improving it privately, and selling it as a hosted service that out-competes the free one.

**Decision.** GNU Affero General Public License, version 3 or later.

**Why.** It lets anyone use, change and host Wagbook, including commercially. It requires anyone who offers a changed
version over a network to share their changes. That keeps improvements flowing back to small kennels.

**Cost.** Some companies have policies against using AGPL software, which may reduce corporate contributions.
A kennel that only uses Wagbook is unaffected.

**The alternative.** MIT or Apache-2.0: simpler, friendlier to businesses, and allows closed commercial forks. If the
owner would rather maximise adoption than protect against closed forks, switch **before** accepting outside
contributions; afterwards every contributor would have to agree.

**To do.** Owner confirms or changes. Then remove "Provisional" here and in `HANDOFF.md`.

---

## D3. Parents never have accounts

**Status:** Decided.

**Decision.** Parents use secret links. No sign-up, no password, no app.

**Why.** Every account is a forgotten password and a support call. A link in WhatsApp is how parents already receive
everything. It also halves the authentication surface.

**Cost.** A link can be forwarded. So a link shows one stay or one bill, very little on it, and stay links expire.
Parents cannot see a history of their stays; the kennel can send any link again.

**Look again if** parent self-booking is built. Even then, prefer a one-time code to the phone over a password.

---

## D4. WhatsApp by click to chat, UPI by link. No APIs, no gateway.

**Status:** Decided. Full reasoning in [07-whatsapp-and-upi.md](07-whatsapp-and-upi.md).

**Decision.** Wagbook opens WhatsApp with a message typed and opens the UPI app with an amount filled in. A person
sends; a person confirms payment.

**Why.** Zero setup, zero fees, zero secrets, and it works for a kennel with one phone.

**Cost.** Nothing is automatic. Wagbook does not know a message was sent or a payment made.

---

## D5. The database enforces the rules; the app holds no secret

**Status:** Decided.

**Decision.** Row level security on every table. The Next.js server talks to Supabase as the visitor. The service role
key is never used. Privileged operations are narrow `security definer` functions that check the caller themselves.

**Why.** A bug in a page cannot then leak another kennel's data. The rules can be tested directly, without a browser.
A self-hoster has no secret to leak.

**Cost.** Some things are more work without an all-powerful server key: inviting a person, issuing a number, public
pages. Each became a small function. Anything needing a real secret later (sending email, a WhatsApp provider) will
need a deliberate new decision.

---

## D6. Test the database in-process with PGlite

**Status:** Decided.

**Situation.** The rules live in SQL, so they must be tested against a real Postgres. The usual way, a local Supabase,
needs Docker, and Claude Code cloud sessions and many contributors' laptops may not have it running.

**Decision.** PGlite: Postgres compiled to WebAssembly, started inside the test process, with a small stand-in for
Supabase's roles and schemas. The same engine generates the TypeScript types and the schema reference.

**Why.** `npm run check` works anywhere with Node, offline, in under a minute.

**Cost.** PGlite is not Supabase. It has no PostgREST, Auth or Storage service, and the stand-in could differ from the
real thing. So milestone M1 adds end-to-end tests against real Supabase alongside. Both stay.

---

## D7. People join by invitation and acceptance

**Status:** Decided, after the security review.

**Decision.** An owner or manager invites an existing account by email. The membership is inactive until the invited
person accepts. An invitation never changes someone who is already a member. Inviting returns nothing in every case.

**Why.** The first design added people directly. That let anyone force a person into a kennel, and let a manager
demote an owner. It also told the caller whether an email was registered.

**Cost.** The person must create an account first. The inviter gets the same message either way, but can still tell
whether the email has an account, because a pending row appears on People only when it does. M6 adds invitations by
link, which need no lookup.

---

## D8. Next.js App Router with cache components, server-rendered forms

**Status:** Decided.

**Decision.** Next.js 16, Server Components for reading, Server Actions for writing, `cacheComponents` on. Almost no
client JavaScript.

**Why.** Pages work on slow phones and bad connections because they are HTML. Forms work before JavaScript loads. One
deployable thing. Types flow from the database to the page.

**Cost.** Next.js moves fast and version 16 differs from what most examples and most models' training show. Hence the
rule to read the docs in `node_modules/next/dist/docs/` before writing code. Request-time data must sit inside
`<Suspense>`, which shapes every page.

---

## D9. No UI library, no ORM, no state library, no date library

**Status:** Decided.

**Decision.** Tailwind and a single `ui.tsx`. The Supabase client with generated types. React's own form state. Dates
as `YYYY-MM-DD` strings with a few functions in `src/lib/core/dates.ts`.

**Why.** Each library is something to learn, upgrade and work around. The app's needs are small and specific. Dates
without times need none of what date libraries are for, and avoiding `Date` for stay dates removes a class of time
zone bugs.

**Cost.** A little more code written by hand.

**Runtime dependencies today:** `next`, `react`, `react-dom`, `@supabase/ssr`, `@supabase/supabase-js`, `zod`,
`server-only`, `qrcode-generator` (D17). Adding one needs an entry here.

---

## D10. Money in integer minor units

**Status:** Decided.

**Decision.** `bigint` paise in the database, integers in TypeScript, basis points for rates.

**Why.** Binary floating point cannot represent 0.1. Sums of floats drift by a paisa, and a tax invoice that is a
paisa out is wrong.

---

## D11. One codebase for a single kennel and for many

**Status:** Decided.

**Decision.** Every table has `org_id` from the start. A self-hosted Wagbook simply has one organisation.

**Why.** Adding tenancy later means rewriting every query and every policy. Having it from the start costs one column
and makes a free shared instance possible.

---

## D12. Migrations are edited in place until first deployment

**Status:** Decided. Ends at the date recorded under "Migration freeze" in `HANDOFF.md`.

**Decision.** While no production database exists, change the original migration files, so the history reads as a
clean description of the schema. Once one exists, files are append-only.

---

## D13. Words: "parent", "pet", "kennel"

**Status:** Decided. See [12-glossary.md](12-glossary.md).

**Decision.** On screen: parent (not owner, customer or client), pet (not animal or guest), kennel (the business and
also the unit a pet sleeps in; context makes it clear). In code and tables: `clients`, `pets`, `organizations`,
`kennels`.

**Why.** "Owner" on screen would collide with the kennel's owner role. "Parent" is what Indian kennels and their
customers say. Table names follow what a developer expects to find.

---

## D14. Hosting: Vercel for the app, Supabase Cloud for data, by default

**Status:** Decided as the documented default. Not required.

**Decision.** The setup guide walks through Vercel's free plan and Supabase's free plan, Mumbai region.

**Why.** No server to look after, HTTPS and a domain out of the box, both free to start. The app is a standard Next.js
server and runs anywhere Node does; the self-hosting guide in M10 covers Docker.

**Cost.** Two vendors' free plans have limits and terms that can change. Vercel's free plan is for non-commercial
use; a kennel running its business on it should read the terms and may need the paid plan or another host.

---

## D15. Only owners and managers decide what a stay costs

**Status:** Decided by the owner, 13 October 2026 (milestone M2).

**Situation.** Staff run the day and make most bookings. A booking's price could be changed by anyone, recorded only
in the audit log. A dishonest worker could lower a price and pocket the difference.

**Decision.** Staff book at the price on the price list and cannot change it. Owners and managers set any price and
discount. In detail, enforced by triggers in `20261008000300_kennels_and_bookings.sql`:

- A new booking by staff must have a rate, tax rate and SAC code exactly as an active price list row of its kind gives
  them, and no discount (`WB023`).
- Staff cannot change an existing booking's rate, discount, tax rate, SAC code or kind (`WB022`).
- Staff add extras from the price list only at the listed price (`WB023`), may add a one-off item with no price list
  entry at any price (a vet bill paid for the parent; it only ever adds to the bill), and cannot change what an extra
  costs afterwards (`WB025`). Removing an extra was already manager only.

**Why a trigger and not column grants.** The roadmap suggested column grants and a policy. Every member signs in as
the same database role, `authenticated`, so a grant cannot tell a manager from staff, and an update policy cannot
compare old and new values. A `before` trigger can, using `my_org_ids_with_role()`.

**Cost.** A kennel with no usual price set cannot be booked by staff until a manager sets one. The screen says so.

**Extended in M4 (14 October 2026).** Staff may make and change draft bills, but `issue_invoice()` lets staff issue
only a bill whose lines are exactly what its booking says: the stay at the booked rate, discount and tax, and each extra
at its own price (`invoice_expected_lines()`, `WB050`). An edited bill is issued by an owner or manager. The screen
offers line editing to owners and managers only.

---

## D16. Playwright for the end-to-end tests, and the Supabase CLI through npx

**Status:** Decided, 13 October 2026 (milestone M1).

**Decision.** `@playwright/test` is a development dependency. The Supabase CLI is run with `npx -y supabase@2.120.0`
(pinned in `scripts/e2e.mjs` and the CI workflow) rather than installed as a dependency.

**Why.** The roadmap asks for browser tests of the whole day against a local Supabase. Playwright drives a real
Chromium at phone width, waits for the page by itself, and records a trace on failure. Installing the Supabase CLI as
a package would download a binary on every `npm ci`, for everyone, including cloud sessions that never run Docker.

**Cost.** One large development dependency. The tests need Docker and are kept out of `npm run check`.

---

## D17. QR codes drawn by qrcode-generator, checked by jsqr

**Status:** Decided, 14 October 2026 (milestone M4).

**Situation.** A bill shows a UPI QR code. `07-whatsapp-and-upi.md` rules out third-party QR image services (they
would see every bill's payment details) and allows a dependency with no dependencies of its own, or a short encoder.

**Decision.** `qrcode-generator` (MIT, no dependencies) builds the QR matrix; `src/lib/core/qr.ts` turns it into one
SVG path drawn on the server. `jsqr` (Apache-2.0, no dependencies) is a development dependency used only by
`qr.test.ts`, which decodes the drawn code and checks it gives back the exact UPI link.

**Why not write the encoder.** A QR code is Reed-Solomon codes, masks and version tables. A parent scans it to pay; a
long-used library is less likely to be wrong than a new one, and the decode test catches either.

**Cost.** Two small packages. If one is abandoned, the other still checks a replacement.

---

## D18. Photos for parents through Storage, with the stay token in a header

**Status:** Decided, 14 October 2026 (milestone M5).

**Situation.** The stay page must show photos to a parent who has no account. Files are private. The service role key
is never used, Postgres cannot sign Storage links, and Wagbook holds no other secret.

**Decision.** The stay page asks Storage for signed links (an hour) as the anonymous role and sends the stay token in an
`x-wagbook-stay` header. Storage passes request headers to Postgres, and a policy on `storage.objects` calls
`stay_media_visible(name)`, which allows the read only for that live stay's pet photo and the photos on its updates shown
to the parent. Tested in PGlite (`media.test.ts`) and through the real Storage in the end-to-end walk.

**Why.** The rule lives in the database like every other rule, no secret is added, and a parent's link opens their own
photos only. A route handler streaming files would still have needed some credential to read them.

**Cost.** A fifth function the anonymous role can run (pinned in `security.test.ts`). It depends on Storage passing
`request.headers` to Postgres, which Supabase's Storage does today; if it stopped, photos on stay pages would stop
showing (safely: nothing would be exposed). The end-to-end test would fail first.

**Photos are stored twice.** The photo (long edge 1,600 pixels) and a small copy (480 pixels, `name.small.jpg`) for
lists and slow connections, both made in the browser. Supabase's image resizing is a paid feature and is not used.

---

## D19. Invitation links that work for whoever holds them, once

**Status:** Decided, 14 October 2026 (milestone M6).

**Situation.** Kennel staff often have no email they check, and the person adding them is on WhatsApp. The email
invitation (D7) needs an account first and reveals whether an email has one.

**Decision.** An owner or manager makes a link for a name and a role. It works once, for seven days, and can be
withdrawn. It is not tied to an email or phone: whoever opens it signs up or signs in and joins. The link carries a
64-character token; the join page says nothing about the kennel until the visitor is signed in.

**Why.** It fits how kennels hire (a message on WhatsApp), needs no lookup of accounts, and the person still has to act
to join, as D7 requires. Binding it to an email would bring back the email problem; binding it to a phone number would
need phone sign-in, which Wagbook does not have.

**Cost.** A forwarded link lets someone else join, once, in that role. The new member appears on People at once and can
be suspended or removed. See `05`, known limitations.

## D20. Reports are database functions that refuse staff; downloads are CSV

**Status:** Decided, 14 October 2026 (milestone M7).

**Situation.** The roadmap asks for reports as views or functions that obey row level security. Staff can already
read bookings, bills and payments one by one (they run the day), but expenses are for owners and managers, and a
kennel's takings in one number are the owner's business.

**Decision.** Each report is a `security invoker` function taking the kennel and a period. Before anything else it
calls `check_report_access()`, which raises `WB060` unless the caller is an owner or manager of that kennel, and
`WB061` for a period over 400 days. Charts are plain HTML and CSS. Downloads are CSV files built by
`src/lib/core/csv.ts`, with a byte order mark for Excel and formula-looking text defused; no spreadsheet library.

**Why.** Invoker functions keep row level security in force, so a mistake in a report cannot show another kennel's
rows. The explicit refusal makes "staff do not see reports" a database rule with a test, rather than a hidden menu
item, and it means staff get a clear sentence rather than a page of zeros (they cannot see expenses, so their numbers
would be wrong, not just private). CSV opens everywhere an accountant works and needs no dependency.

**Cost.** Staff cannot see even how full the kennel was last month; the calendar shows the days ahead. A view with
`security_invoker` would have been simpler to query from PostgREST, but could not take a period or refuse anyone.

