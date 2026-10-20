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

**Status:** Decided. Confirmed by the owner, 19 October 2026.

**Situation.** The goal is that every kennel can use Wagbook free for ever. The risk is a company taking the code,
improving it privately, and selling it as a hosted service that out-competes the free one.

**Decision.** GNU Affero General Public License, version 3 or later.

**Why.** It lets anyone use, change and host Wagbook, including commercially. It requires anyone who offers a changed
version over a network to share their changes. That keeps improvements flowing back to small kennels.

**Cost.** Some companies have policies against using AGPL software, which may reduce corporate contributions.
A kennel that only uses Wagbook is unaffected.

**The alternative.** MIT or Apache-2.0: simpler, friendlier to businesses, and allows closed commercial forks. Not
chosen. Changing now would need every contributor's agreement.

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


## D21. Languages: plain message files, chosen by the person, no locale in the address

**Status:** Decided, 15 October 2026 (milestone M8).

**Situation.** Staff should read Wagbook in their own language, and parents in the language their kennel chooses. The
Next.js guide (`node_modules/next/dist/docs/01-app/02-guides/internationalization.md`) describes putting the locale in
the address (`/hi/app`) with dictionaries loaded on the server, and leaves the translation mechanism to the app.

**Decision.** No locale in the address and no library. Every word lives in `src/messages/en.ts` (assembled from one
file per area in `src/messages/en/`); `hi.ts` and `kn.ts` have exactly the same shape, which TypeScript checks, and
`src/messages/messages.test.ts` checks that each translation keeps the same `{placeholders}` and leaves nothing
empty. `src/lib/i18n.ts` fills placeholders, picks plural forms with `Intl.PluralRules`, and cuts a message for a bold
value or a link (`<Rich>`). The server chooses the language (`src/lib/i18n-server.ts`): on signed-in screens the
person's own choice (`memberships.language`, set by `set_my_language()` for all their kennels); on pages for parents
the kennel's `parent_language`, which the public functions return; elsewhere a cookie set when a person chooses or
signs in, then the browser's `Accept-Language`, then English. Dates and money are formatted in the person's language
and the kennel's region (`hi-IN`). Client components get their words as props, so browsers never download whole
dictionaries. Database error sentences stay English; the app shows a translation per `WBnnn` code, carrying values
such as dates across. The static shell of each page holds no words, because it is drawn before the language is known:
the loading state is three dots, and titles sit inside the suspended part.

**Why.** The same address works for everyone on a shared phone, links sent on WhatsApp do not depend on the sender's
language, and the language follows the person rather than the device. Typed message objects catch a missing key at
build time, which a library with string keys would only catch at run time. The whole mechanism is about a hundred
lines.

**Cost.** Words stored as data stay in the language they were written in: routine names, bill line descriptions,
notes, and the amount in words on a bill (English, as on most Indian invoices). The history of changes names fields
by their column names. The Hindi and Kannada files are drafts until native speakers review them.

## D22. Offline: a service worker for Today and Care, and ticks saved on the phone

**Status:** Decided, 15 October 2026 (milestone M8).

**Situation.** Kennel connections drop. The roadmap asks that Today and Care open offline and that ticking a task
offline is kept and sent later, and forbids queueing anything that could conflict, such as a booking. Next.js 16 has
an experimental `useOffline` option that keeps every failed Server Action pending and replays it when the connection
returns.

**Decision.** `useOffline` stays off: it would replay a booking or a payment made while offline. Instead:
`public/sw.js` keeps the newest copy of `/app` and `/app/care` and the app's own hashed scripts and styles, serves those
copies only when the network fails, and shows a small three-language offline page for anything else. The Done button
on a care task (`TickButton`) saves the task id in the phone's local storage when there is no connection, or when the
request does not get through, and `OfflineSync` in the signed-in layout sends the saved ticks to `/app/care/sync`
whenever the connection is there. That endpoint can only turn a pending task to done, which is safe to repeat. The
copies and saved ticks are removed when the sign-in page opens.

**Why.** Ticking is the one write that is safe to send twice (the database keeps the first who and when), so it is
the only one that waits on the phone. Everything else fails plainly while offline, which is the honest outcome for a
booking that might clash.

**Cost.** A task ticked offline is recorded as done at the time it reached the database, not the time of the tap.
Copies of Today and Care, with pet and parent names, stay on the phone until someone opens the sign-in page or the
next copy replaces them. The service worker runs only in production builds.

## D23. A script policy with nonces, and hashes for the prerendered shell

**Status:** Decided, 15 October 2026 (milestone M9).

**Situation.** The roadmap asks for a `script-src` Content Security Policy with nonces. Next.js puts a nonce on every
script it writes at request time, read from the request's `Content-Security-Policy` header. But Wagbook uses cache
components: each page's shell is prerendered at build time, when there is no request and no nonce. That shell holds
`<script src>` tags for the app's own files and two small inline scripts: React's timing line
(`requestAnimationFrame(function(){$RT=performance.now()})`) and Turbopack's list of chunks for the page. With the
policy Next.js documents (`'nonce-…' 'strict-dynamic'`) every page stopped working.

**Decision.** `src/proxy.ts` sends, for every request, `script-src 'self' 'nonce-<fresh>' 'sha256-…'`: scripts from
files on this site, inline scripts that carry this request's nonce, and the shell's inline scripts by their SHA-256
hash. The hashes are worked out once per server from the build's own `.next/build-manifest.json`, the same way Next.js
writes those scripts (`src/lib/csp.ts`, `src/lib/csp-hashes.ts`); unit tests fail if an upgrade of React or Next.js
changes how either is written. If the manifest cannot be read, the policy is sent without a `script-src` (as before
M9) and the server logs it once, rather than breaking every page. Styles keep `'unsafe-inline'`, because React writes
style attributes and a stylesheet cannot run code.

**Why.** `'self'` is safe here because nothing a visitor sends is ever served from this origin as a script: uploads
go to Supabase Storage, the only route handlers return CSV and JSON with `nosniff`. An injected `<script>` or `onclick`
in stored text is refused by the browser, which the end-to-end walk checks. Turning cache components off to get
per-request shells would make every page slower for every kennel.

**Cost.** A file the build did not produce, served from the same origin, would be allowed. The policy depends on the
two inline scripts staying as they are; the unit tests say when they change.

## D24. Two-step sign-in is enforced by the database

**Status:** Decided, 15 October 2026 (milestone M9).

**Situation.** The roadmap asks for two-step sign-in for owners. Supabase Auth supports authenticator apps (TOTP): a
session that has given the code is at assurance level `aal2`. Nothing stops a client with only the password (`aal1`)
from calling the API directly, unless the database checks.

**Decision.** `session_meets_mfa()` is true unless the person has a verified factor and the session is still at
`aal1`. `my_org_ids()` and `my_org_ids_with_role()`, on which every policy rests, require it; so do the functions that
act on a person's own memberships (`WB005`). The app sends a session that still owes its code to `/login/code`. Any
person can turn it on for themselves under More; owners who have not see a reminder there. It is not forced on anyone.
Recovery from a lost phone is an administrator removing the factor in Supabase (documented in
[10-setup-and-deploy.md](10-setup-and-deploy.md)).

**Why.** A stolen password then reaches nothing, whether the thief uses the app or the API. Forcing it on every owner
from the first sign-in would lock out a kennel whose owner has no smartphone app yet; the reminder is the softer start.

**Cost.** There are no recovery codes: losing the phone means asking whoever runs the installation. A person who turns
it on in one browser is asked for the code in the others when the database next refuses them (`requireOrg()` checks).

## D25. Erasing a parent keeps the bills, empties everything else

**Status:** Decided, 15 October 2026 (milestone M9). Check with an accountant and a lawyer.

**Situation.** India's DPDP Act lets a parent ask a kennel to erase their details. GST law requires a business to keep
its tax invoices, with the buyer's name, for years. Bills, payments and reports rest on the parent, pet and stay rows.

**Decision.** `erase_client()` (owners only since D29) keeps the parent and pet rows, empty and named "Erased", and the
stays' dates, kennels and prices, so that bills and reports still add up; issued and cancelled bills keep the buyer
details frozen on them when they were issued, and payments stay. Everything else about the parent goes: contact
details, consent, notes, pets' details, vaccinations, routines, incidents, updates, care tasks, play, intake forms,
draft bills, files, and the personal text the history of changes had copied. It is refused while a pet is in house or a
stay is still to come. `export_client()` gives the parent everything first, as JSON.

**Why.** It is the least that tax law makes the kennel keep. Keeping empty rows instead of deleting them means no bill
or report ever points at nothing.

**Cost.** A duplicate record merged into this parent earlier (`merge_clients`) keeps its own details, hidden; erase it
as well if it is found. Payment notes and references are kept as they were typed. Whether this is exactly what the law
asks is a question for a lawyer (`HANDOFF.md`, Open questions).

## D26. Rate limits in the app's proxy, counted in memory

**Status:** Decided, 15 October 2026 (milestone M9).

**Situation.** The roadmap asks for rate limiting of the intake form and sign-in "at the edge, or a privacy-respecting
challenge". A shared store (Redis, a database table) would be a new service or a new table written by strangers. A
challenge (a puzzle, a captcha service) either sends visitors to a third party or costs a real attacker nothing.

**Decision.** `src/proxy.ts` counts posts per visitor address in the server's memory and marks those over the limit;
the action answers with a sentence instead of calling the database (`src/lib/rate-limit.ts`). It also refuses posts
over 1 MB except where photos are sent. The database's own limits on the intake form (`WB048`) and Supabase
Auth's own limits stay as the backstop for anyone who calls Supabase directly. Hosts with many copies of the app add
their own edge rule ([10-setup-and-deploy.md](10-setup-and-deploy.md)).

**Why.** No new service, no new dependency, nothing sent to a third party. On one server (the self-hosting setup) it
is exact.

**Cost.** On Vercel each copy of the app counts on its own. Whoever calls Supabase directly is not counted by the app.

## D27. Two pets of one parent may share a kennel, and a family pays on one bill

**Status:** Decided, 19 October 2026, by the owner.

**Situation.** Some families board two dogs that live together and want them in one kennel. They use one kennel, so
they expect to pay less for the second dog, and they expect one bill for the family. Until now the database refused two
pets in one kennel on the same night, and each pet's stay was billed on its own.

**Decision.** A kennel holds one pet, or two pets of the same parent. The kennel overlap constraint compares the parent,
so pets of different parents can never share; a trigger refuses a third pet (`WB027`), even when overbooking is
allowed. Capacity counts kennels in use, not pets. Each stay price (boarding, day boarding) may carry a shared kennel
price, set by the kennel, for the second pet; New booking offers "One kennel together" for two pets and books the
second at it. Staff may book that price only when the pets really share (`bookings_check_shared_price`). Pets booked
together (one `group_id`) are billed on one bill (`invoices.group_id`), never on their own (`WB053`), and a family stays
the family it was booked as (`WB026`). Siblings may share a play yard, and the planner gives siblings sharing a kennel
the same slots.

**Why.** The price is per night, like any stay price, so it stays right when dates change and needs no new
arithmetic on the bill: the database checks a family's bill with the same rules as any other (`WB050`). Sharing is
decided by the parent, not the booking, so a sibling booked later can still join its brother.

**Cost.** A second pet keeps its shared price if its sibling leaves early; a manager changes it by hand. Which pet is
"the second" is whichever was chosen second at booking. A pet cannot be added to a family after booking; it is booked
on its own and billed on its own.

## D28. No public demo; people try Wagbook on their own computer

**Status:** Decided, 19 October 2026, by the owner.

**Situation.** M10 built a demo mode (a notice on every screen, the accounts on the sign-in page, a nightly reset
script) for a public demo server. Nobody wants to run or pay for that server.

**Decision.** The demo mode and the reset script are removed. The invented kennel in `supabase/seed.sql` stays, for a
local Supabase: the README's "Try it on your own computer" and `npm run setup:local` get anyone there in a few commands.

**Why.** Code for a server that will never run is code to keep working for nothing.

**Cost.** Trying Wagbook needs Docker and a few minutes, not a link.

## D29. Only owners delete, and every deletion asks once more

**Status:** Decided, 19 October 2026, by the owner.

**Situation.** Managers could delete records and files (an expense, a draft bill, an extra, a peak period, a person,
today's play plan, a parent's details) with one tap. The owner wants to keep a way to delete things, but not by
accident and not by anyone but the owner.

**Decision.** Every delete policy in the database is for owners: tenant tables, setup tables, invoices, payments,
expenses, forms from parents, memberships (anyone may still leave) and files in storage. `erase_client` needs an owner
too (`WB074`); a manager can still download a parent's details. Screens show a delete only to owners, as two taps
(`ConfirmStep`: "This cannot be undone.", then "Yes, delete it"). Deleting an expense deletes its receipt file.
Taking something out of use (an extra off the price list, a kennel out of service, hiding a pet) is not deleting and
stays with managers.

**Why.** Deleting cannot be undone, and the person who answers for the kennel's records is the owner.

**Cost.** A kennel run day to day by a manager needs the owner for every clean-up. Erasing a parent at their request
waits for the owner.

