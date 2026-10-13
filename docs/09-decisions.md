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
`server-only`. Adding one needs an entry here.

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
