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

**Status:** Decided, 15 October 2026 (milestone M9). Not forced on owners: confirmed by the owner, 21 October 2026.
Recovery codes added by D43.

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

**Status:** Decided, 15 October 2026 (milestone M9). Changed by D30: the pets now stay. Check with an accountant and a
lawyer.

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

**Cost.** Which pet is "the second" is whichever was chosen second at booking. (A second pet used to keep its shared
price when its sibling left early; since D32 those nights are billed at the usual price.) A pet cannot be added to a family after booking; it is booked
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

## D30. Erasing a parent keeps their pets

**Status:** Decided, 21 October 2026, by the owner. Amends D25.

**Situation.** Erasing a parent (D25) also emptied their pets and deleted the pets' vaccinations, routines and
incidents. A bite or an injury is something the kennel may need to know about later, and a pet's health and habits are
the kennel's record of the animal, not the parent's contact details.

**Decision.** `erase_client()` keeps the pets as they are: details, photo, vaccinations, routines, incidents, care
tasks and play sessions, hidden from lists because their parent is gone. It still empties the parent, the notes on
their stays (belongings, what was said at the gate, notes, the reason for cancelling, times), deletes the updates sent
to the parent (with their photos), their intake forms (with their files) and draft bills, and takes the stays' notes
out of the history of changes. Vaccination certificate files are deleted and the vaccination rows keep their dates,
because a vaccination card usually shows the owner's name and address.

**Why.** The owner's call. The law asks for the parent's personal data to go; an animal's record that no longer names
its parent is not that.

**Cost.** Free text kept on a pet or incident can mention the parent ("mum says he bites"); it is not searched or
emptied, and is a question for the lawyer (`HANDOFF.md`). The microchip number stays with the pet: the owner's view
(21 October 2026) is that it is not the parent's personal data. The pets cannot be shown in lists again, because their
erased parent stays hidden.

## D31. Bills are in English; a parent may ask for their language alongside

**Status:** Decided, 21 October 2026, by the owner.

**Situation.** The parent's bill was shown in the kennel's language for parents (D21), with "Tax invoice" in English
and the translation in brackets. Bills are documents for tax, and the owner wants them in English.

**Decision.** `/inv/{token}` is in English. On the parent's page, Bills offers "English only" (the default), "English
and हिन्दी" or "English and ಕನ್ನಡ" (`clients.bill_translation`); with a language chosen, every heading of the bill is
followed by its translation in brackets (`billWords()` in `src/lib/bill-words.ts`). Lines that carry amounts stay in
English only, so no amount is printed twice. Bill lines were already stored in English. The WhatsApp message that
sends the bill stays in the kennel's language for parents; it is a message, not the bill. The staff screens of a bill
stay in each person's own language.

**Why.** English is what an accountant and a tax officer read. A parent who reads Hindi or Kannada better can still
have the headings in their language, on request.

**Cost.** The choice is per parent, not per bill. A bill shows the parent's current choice, not the one at the time
it was issued (it is a display choice; nothing on the bill changes).

## D32. A stay is priced in parts when it changes on the way

**Status:** Decided, 21 October 2026, by the owner. Amends D27.

**Situation.** A pet at the shared kennel price kept that price when its sibling went home early, and a stay that began
as day boarding and turned into boarding could only be priced as one or the other for the whole stay.

**Decision.** `stay_charges()` in the database prices every stay, and both the app's bills and the staff check on
issuing (`invoice_expected_lines`, `WB050`) use it:

- A pet booked at the shared price carries the usual price for nights alone (`bookings.alone_rate_minor`, filled in by
  New booking; staff cannot book the shared price without it, `WB023`). Each night (or day) its kennel holds a sibling
  of the same parent is billed at the shared price; each other night at the usual price. A sibling checked out early
  counts only up to the day it went home; one cancelled, not arrived, or in another kennel does not count.
- Day boarding that turns into boarding records the first night (`bookings.boarding_from`) and the day price
  (`day_rate_minor`): the days before the first night are billed as day boarding, the nights from it as boarding. The
  booking is boarding from then on, and holds its kennel for the whole stay, as before. Owners and managers do this
  from the booking page (Staying overnight); staff cannot (`WB022`).
- The discount goes on the stay's largest line.

**Why.** The bill follows what happened, and staff can still issue it without a manager, because the database worked
out the same lines.

**Cost.** A pet moved to another kennel counts as alone for its whole stay, because a booking has one kennel. A pet
whose sibling left early still pays its own booked nights in full; refunding the sibling's unused nights stays a
manager's change of dates or price. Only day boarding turning into boarding is handled; the other way round is a change
of the whole stay's kind.

## D33. Only owners and managers change a parent's phone numbers

**Status:** Decided, 21 October 2026, by the owner.

**Situation.** Any member could change any detail of a parent, including the mobile number, which is how a parent is
recognised, messaged on WhatsApp and matched when they send a form.

**Decision.** `clients_guard_phone` refuses a change to `phone` or `alt_phone` by staff (`WB002`). Staff still add new
parents with their numbers, and change everything else, including the emergency contact's number. The parent page
shows staff a line saying who can change the numbers, instead of the boxes.

**Why.** A wrong number sends a parent's updates and bills to someone else.

**Cost.** A staff member who takes a new number from a parent at the gate asks a manager to put it in.

## D34. A bill is taken back with a credit note

**Status:** Decided, 21 October 2026, by the owner, after the research in `06` ("What the law says").

**Situation.** An issued bill could only be cancelled, and a cancelled bill dropped out of the tax figure of the month
it was issued. Under GST, a bill already reported in a return is not cancelled: it is undone with a credit note
(section 34), counted in the month the credit note is issued. A kennel also needs to give back part of a bill, such as
nights not stayed.

**Decision.** Owners and managers make a credit note on an issued bill (`issue_credit_note`): the whole bill, while
nothing has been credited (its own lines, to the paisa), or part of it (one line of an amount, at one of the bill's
tax rates, `WB093`). Its tax is worked out as on the bill when the bill was issued (`invoices.prices_include_tax`
frozen at issue, and the seller's frozen tax mode), and checked by the same function as a bill's lines
(`check_bill_line`, `WB037`). It never takes back more than is left (`WB092`), needs a reason (`WB091`), and takes the
next number in its own series per financial year, `CN/YY-YY/NNNN` (so no bill prefix may be `CN`). Nobody can change
or delete one. What a bill owes is its total, less credit notes, less payments; below zero, a refund is owed. Reports
and the bills download count each credit note in its own month, at minus. A tax invoice from an earlier month cannot
be cancelled (`WB095`), nor a bill that has a credit note (`WB096`); cancelling stays for a mistake in the month it was
made, and for a kennel that does not charge tax. The parent's bill link lists its credit notes, and each opens as its
own printable page (`?cn=`).

**Why.** It is what tax law asks of a registered kennel, and what any kennel needs for a partial refund. Keeping the
bill as it was means a return already filed stays true.

**Cost.** "Earlier month" assumes a monthly return; a kennel filing quarterly could have cancelled within the
quarter. Credit notes have no time limit in Wagbook; section 34 says they reduce tax only until 30 November after the
year ends (a credit note after that is a commercial one). There are no debit notes.

## D35. The kennel sets its own tax rate and code for each price

**Status:** Decided, 21 October 2026, by the owner, while question 10 in `06` waits for an accountant.

**Situation.** Sources disagree on the GST rate and service code for boarding (`06`). The owner wants each kennel to
apply its own accountant's answer, without waiting for one.

**Decision.** Settings, Tax and invoices has a rate and a SAC code for boarding and for day boarding; Extras has a rate
and a code for each extra, shown when the kennel charges tax. An empty rate means the kennel's usual rate. They are
copied onto each booking and extra when it is made, and from there onto the bill (as before: `services.tax_rate_bp`,
`services.sac_code`). Wagbook still ships no rate and no code.

**Why.** The kennel answers for its own tax; Wagbook should make whatever its accountant says easy to apply.

**Cost.** A changed rate applies to bookings made after the change; bookings already made keep the rate they were
given, and a manager changes one by hand if needed.

## D36. A known parent asks for a stay through their own link

**Status:** Decided, 21 October 2026, by the owner.

**Situation.** Regular parents ask for dates on WhatsApp, and staff type the booking in. The intake form is for a new
parent and asks for everything again.

**Decision.** Each parent has a booking link of their own (`/b/{token}`, `clients.request_token`), sent from their
page by WhatsApp or copied. Behind it the parent sees their pets' names and their stays already asked for or booked,
and asks for pets, a kind of stay and dates, with a note. Each pet becomes a booking with status `requested`, priced at
the kennel's usual price, from the parent (`source = 'parent'`). A request holds no kennel; staff confirm it as any
request, and Today says how many are waiting. Two public functions do this (`get_public_booking_form`,
`submit_booking_request`), with the limits in `05`. Any member can make a new link, which ends the old one; Settings
can turn requests off; erasing the parent clears the link.

**Why.** It saves the back and forth, and a request can never take space from anyone, so a forwarded link costs at
most a request to decline.

**Cost.** Two more things a stranger can call (eight in all). A parent sees their own stays' dates through the link,
so a forwarded link shows them to whoever holds it.

## D37. Day boarding regulars: repeating days and prepaid packs

**Status:** Decided, 21 October 2026, by the owner.

**Situation.** A regular comes for day boarding on set weekdays, and many kennels sell days in advance.

**Decision.** New booking repeats day boarding on chosen weekdays until a date (70 days at most, one pet): each day is
its own booking, sharing `series_id`, so check in, care and cancelling work as for any day; the booking page says how
many are left and cancels the rest in one go. Kennels define packs on Extras (`day_packs`: days, price, how long it
lasts, tax rate and code), and owners and managers sell one from the parent's page (`passes`), which makes a draft bill
for it. A day boarding booking paid from a pack costs nothing on its own (`pass_id`, rate 0); New booking pays from
the parent's packs when asked (the pack ending soonest first), and the booking page offers "Pay from the pack" when
one covers it, which staff may use. The database keeps a pack from giving more days than were bought, inside its
dates, for its own parent's day boarding (`bookings_check_pass`, `WB110` to `WB112`); requests and cancelled days hold
none. What a pack has left is `pass_balances`.

**Why.** Regulars are a large share of day boarding, and paying in advance is how they usually pay.

**Cost.** A series is not billed together: a day not on a pack is billed on its own (changed by D41: billed by the
month). A day that did not come (no-show) still uses a pack day. Selling a pack is for owners and managers.

## D38. GSTR-1 files for the accountant

**Status:** Decided, 21 October 2026, by the owner.

**Situation.** A GST-registered kennel files GSTR-1 each month, and its accountant retypes bills from the bills
download.

**Decision.** Reports offers, for a GST kennel, the month's GSTR-1 as CSV files in the columns of the GST offline tool:
b2b, b2cl (another state, over ₹1 lakh, from August 2024), b2cs (added up, less credit notes on such bills), cdnr,
cdnur, hsn and docs (`gstr1Sheet()` in `src/lib/core/gstr1.ts`). Column names are the tool's own, in English, and the
files have no byte order mark.

**Why.** The numbers already exist; laying them out saves the accountant a day.

**Cost.** The column names were written from the tool's templates as we know them and could not be checked against
the tool from here: check them before the first upload. The newer split of the HSN table into B2B and B2C is not done.

## D39. Reminders are a list to send, not messages Wagbook sends

**Status:** Decided, 21 October 2026, by the owner.

**Situation.** Staff forget to ask for a vaccination card, say see you tomorrow, or chase an unpaid bill.

**Decision.** Today lists what is due (`remindersToSend()`): a vaccination card for a stay within a week, arrivals
and pick-ups tomorrow, and bills issued three or more days ago with money owed. Send opens WhatsApp with the message
typed, in the kennel's language for parents, and records it (`reminders_sent`), so it leaves the list; an unpaid bill
comes back three days later. Wagbook sends nothing itself (`07`).

**Why.** The staff member's own WhatsApp, at no cost, as everywhere else in Wagbook.

**Cost.** Tapping Send marks it sent even if the person then does not press Send in WhatsApp.

## D40. Going home early, refunds, and crediting a bill whose stay changed

**Status:** Decided, 21 October 2026 (milestone M20), when the owner asked for refunds when a stay ends early or is
cancelled.

**Situation.** Cancelling recorded a reason but no decision about money, a pet that went home early still paid for
every booked night, and a refund could be recorded for any amount, even more than was paid.

**Decision.** At check-out before the booked end, the booking page asks: bill to today, or bill as booked. Bill to today
moves the end to today (a boarding stay keeps at least its first night, `shortenedEnd()`), so a draft or a new bill is
for the days stayed. An issued bill is never changed: its page compares it with what its stays now come to
(`stayBillLines()`, the same lines Make bill writes) and offers a credit note for the difference, worked out on the
server for each tax rate on the bill under the bill's own tax treatment (`differenceCredit()`). A refund then gives
back what was paid over. The database allows a refund only of money paid and not owed: on a bill, what was paid over
its total less its credit notes (`WB121`); on a stay with no bill, its advance (`WB122`); always naming one of them
(`WB120`). Refunds stay for owners and managers (the payments policy). A cancelled stay shows its advance, and owners
and managers refund it there; keeping it is simply not refunding it, and a no-refund peak period is named beside the
choice.

**Why.** The rule that protects money is in the database, and the books always say why money went back: a credit note
for the tax return, then the refund. Choosing at check-out keeps it one tap for staff, without a manager.

**Cost.** Staff choose how an early leaver is billed. A kept advance on a cancelled stay is money in with no bill for
it; whether it needs a bill (a cancellation charge, with tax) is a question for the accountant (`06`). The difference
is computed against today's view of the stays: it is offered only when a stay really changed (`staysChanged()`), but
then a line a manager added to the bill by hand counts in it, so a bill edited by hand needs its amount checked.

## D41. A repeating series is billed by the month

**Status:** Decided, 21 October 2026 (milestone M23), when the owner asked to bill a day boarding series together.

**Situation.** Each day of a series was billed on its own: a regular coming three days a week got twelve bills a month.

**Decision.** A bill may be for a month of a series (`invoices.series_id`, `series_month`, the first of the month),
covering that month's days that are not requests or cancelled, with one stay line for each price, tax rate and code,
days added up and listed, and each day's extras with its date (`seriesLines()`; the database groups the same way in
`invoice_expected_lines()`, so staff can issue it). Make bill on any day of a series makes or opens its month's bill.
A day of a series is never billed alone (`WB055`), a month has one live bill (`invoices_one_live_per_series_month`),
advances on any day of the month count against it, and a day on an issued month's bill cannot move to another month
(`WB057`), where it would be billed again.

**Why.** Regulars pay monthly. A calendar month is simple to explain, to number, and to find.

**Cost.** A series that runs across two months gets two bills. Days paid from a pack still appear, at ₹0. A family of
two regulars gets a bill for each pet.

## D42. The waiting list is requests that wait, in order

**Status:** Decided, 21 October 2026 (milestone M21), when the owner asked for a waiting list when full.

**Situation.** In a full peak week, kennels keep a list on paper of families to call if someone cancels.

**Decision.** A request can be put on the waiting list (`bookings.waitlisted_at`). The database stamps the real time it
joined, keeps that place while it waits, and clears it when the request is confirmed or cancelled; only a request can
be on it. `waiting_list()` lists them, first in line first, with whether each would fit now (a kennel free on every day
of the stay, and no other stay for the pet). Today shows those that fit, with Tell the parent on WhatsApp and Confirm
booking; the request's page says its place, and the calendar draws requests and the waiting list under the kennels.

**Why.** A request already holds no space and is confirmed through the same rules as any booking, so the list needed
only an order and a question ("would it fit now?"), not a new kind of booking.

**Cost.** Two people waiting for the same last kennel both show as fitting until one is confirmed; the second is then
refused with the usual sentence. Pets of one family on the list are checked one by one, as if each needs its own
kennel. Wagbook does not send the message by itself (D39).

## D43. Recovery codes for two-step sign-in, kept inside Wagbook

**Status:** Decided, 21 October 2026 (milestone M24), when the owner asked for recovery codes.

**Situation.** Losing the phone with the authenticator app meant asking whoever runs the installation (D24). Supabase
Auth has no recovery codes, and removing a factor needs either a session that gave its code or the service role key,
which Wagbook never uses (rule 7).

**Decision.** Wagbook makes ten one-use codes (`make_recovery_codes()`, only from a session that gave its code from
the app), shows them once, and keeps only their SHA-256 hashes in a sealed table (`recovery_codes`: no policy, no
grant). On the code page, "Use a recovery code instead" spends one (`use_recovery_code()`): that session, by its
`session_id`, then counts as having given its code in `session_meets_mfa()`, and nowhere else. Codes belong to the
authenticator they were made for, so turning two-step off or setting up a new phone makes them worthless. Making new
codes replaces the old ones.

**Why.** A person locked out at 7 in the morning with dogs to feed can work, without anyone holding a key that could
open every account.

**Cost.** A code does not remove the lost authenticator: Supabase Auth still sees the session at `aal1`, so the person
cannot turn two-step off or set up a new phone until the administrator removes the factor (`10`), and each sign-in
until then needs another code. A recovered session lasts as long as that sign-in does. Codes are 12 hex characters (48
bits); guessing is limited by the sign-in rate limits.

---

## D44. Wagbook grows from a boarding register into the kennel's whole business

**Status:** Decided, 21 October 2026, when the owner asked for appointments, a kitchen and food subscriptions before
any production deployment.

**Situation.** Every boarding milestone (M2 to M24) is built. A kennel rarely only boards: the example kennel in `13`
also grooms, runs a pool, trains, holds birthday parties, picks dogs up from home, and cooks fresh food for its boarders
and for dogs at home, sold as a trial and a subscription delivered twice a week. Today those live in notebooks,
spreadsheets and WhatsApp, apart from the parents and pets Wagbook already knows.

**Decision.** Wagbook takes them on, as milestones M25 to M44 in `08`: services booked by time, stock, recipes, food
subscriptions with deliveries, the cook plan and delivery runs, cancellation credit, and a rota. Each area is switched
on per kennel, so a kennel that only boards sees none of it. They share Wagbook's parents, pets, bills, payments and
reminders rather than having their own.

**Why.** One parent record across boarding and food is the point: a boarder's parent becomes a food customer and a food
customer comes back to board, and staff see one history. A kennel kitchen is also small enough that general food
delivery software would be heavier than the job.

**Cost.** Wagbook roughly doubles in size, and the new areas bring a fourth role (riders, M31), more public pages
(M32, M41) and goods with their own tax questions (`06`, questions 13 to 15). The migration freeze waits until the
schema these milestones need has settled.

**Look again** if a kennel using Wagbook would rather connect a separate food or delivery tool, or if the food side
grows beyond one kitchen.


---

## D45. Riders are a fourth role that reaches no table

**Status:** Decided, 22 October 2026, building M31. The owner's answer of 21 October 2026: a rider sees their own run and
nothing else.

**Situation.** Food goes out on delivery runs. Riders are often hired by the day or come from an agency; they need the
names, addresses, phones and packs of their stops, and nothing about prices, pets' health or other parents. Every other
role (owner, manager, staff) reads the whole kennel through row level security that asks `my_org_ids()`.

**Decision.** A fourth role, `rider`, in `member_role`. `my_org_ids()` leaves riders out, so every policy in the access
model gives a rider nothing, and no table is opened to them. A rider reaches their work only through two functions:
`my_runs(date)` (their own runs for a day, each stop with name, phone, pet, packs, address and notes) and
`rider_mark_stop()` (on the way, delivered, nobody home or refused, on their own run, today), both `security definer`
and checking the caller is the run's rider. One storage policy lets a rider add a photo at the door of a stop of their
own run for today (`rider_upload_allowed`). The app sends a rider to `/rider` and away from the kennel's screens. A
member of another role with the skill rider can also ride, seeing what their role already sees.

**Why.** The database is the boundary (`05`): leaving riders out of `my_org_ids()` means a forgotten policy can never leak
to them, rather than relying on every policy remembering to exclude them. Functions that return only what a run needs
are the narrowest possible door.

**Cost.** A rider cannot see a stop that is not on their run, even to help a colleague; the kennel moves the stop. A
rider's language comes from their membership, as anyone's does.

**Look again** if riders need to see yesterday's runs, or if pick-ups of boarders (M39) need more than an address.

---

## D46. Appointments are held by the database, by place, pet and person

**Status:** Decided, 22 October 2026, building Phase 2 (M34 to M37).

**Situation.** Grooming, swims, training and parties are booked by the hour, not by the night. A pool or a grooming
table takes one dog at a time and needs cleaning afterwards; a groomer cannot be at two tables; a pet cannot be in the
pool and on the table. Some are for pets staying in, some for visitors. Prices depend on the dog (its size or coat), or
are quoted by the trainer.

**Decision.** Appointments are rows with `timestamptz` start and end, in a **place** with its daily hours. Three
exclusion constraints, like the kennel overlap for stays (D3), refuse a place, a pet or a person in two appointments at
once; the place is held to the end of the service's clean-up (`held_until`, kept by a trigger). Requests hold nothing,
as stay requests do. The database works out the price for the pet (`appointment_price()`: fixed, by size from the latest
weight, by coat with a named breed first, or on quote) and copies it, with the tax rate and code, onto the appointment;
only owners and managers give another (D15), and an appointment on quote can only be a request until it is priced. A
boarder's appointment names its stay and is a line of the stay's bill; a visitor's has a bill of its own
(`invoices.appointment_id`); `invoice_expected_lines()` knows both, so staff issue either only as the database prices
it (`WB050`). A training course is sold up front as a day boarding pack is (D37). A **package** is put on a stay by
`apply_package()`, which bills the stay as one line and books its parts at the first free times; the parts then cost
nothing on their own. Cancelling or shortening a stay cancels its appointments that no longer fit.

**Why.** The same reasons as for stays: rules about money and double booking belong in the database, where a second
tab, a slow phone or a bug in a screen cannot get round them. Copying the price keeps old appointments as they were
sold. Billing a boarder's groom on the stay's bill is what parents expect: one bill for the stay.

**Cost.** An appointment cannot move to another time: it is cancelled and booked again (the free times make that quick).
Add-ons on a visitor's course session have no bill to go on. Two pets of one family cannot share one appointment (two
dogs in the pool together); each is booked on its own. The free times are offered every 30 minutes from the place's
opening.

**Look again** if kennels want group sessions (a class of six puppies), appointments moved by dragging, or reminders to
parents before an appointment.

## D47. Cancellation is worked out in the app and kept in the database; health is checked at the door by the database

**Status:** Decided, 22 October 2026, building Phase 3 (M38 to M42).

**Situation.** The public rules a kennel promises parents say what happens to an advance when a stay is cancelled
(refunded with enough notice, kept as credit on a weekend or a holiday), that pets need their papers in order to come
in, that pets can be picked up from home, and that a new parent can ask to book without ringing. Each of these touches
money, the door or the public internet.

**Decision.** The night-by-night arithmetic of a cancellation is a pure function (`cancellationOutcome()`), shown on
the stay's page and worked out again from the database when an owner or manager confirms it: the refund is an ordinary
refund, and the credit a refund paid "as credit" (`payments.method = 'credit'`). Credit itself is a ledger in the
database (`credits`, `credit_uses`, `credit_balances`), filled and spent only by triggers on payments, oldest first,
never below zero, never after it ends (`WB211`), and a credit payment is never changed (`WB212`). What a pet lacks at
the door is `pet_health_problems()`, matched by `healthProblems()` in the app for lists; while a kennel refuses, the
check-in and a visitor's appointment are refused by triggers (`WB210`) unless a row in `health_overrides` says who let
the pet in and why. A pick-up or drop is a row of its own (`trips`), priced by the database from the area as deliveries
are, on the stay's bill and on the day's runs. The booking form for new parents sends the intake form's own payload
with a `request` in it, through `submit_intake()`; accepting it (`accept_intake()`) also makes the request. Reviews are
a link and a reminder, nothing more.

**Why.** The rules a parent was promised are about money, so the money is kept where a slow phone or a second tab
cannot get round it, while the rule itself stays easy to change and to test. Confirming in one step keeps a person in
charge of a refund. A new public function would be one more thing the anonymous role can call (rule 6); reusing the
intake form keeps it at twelve, with its rate limit, size limit and checks.

**Cost.** Changing a cancellation rule does not change a cancellation already confirmed. Credit kept is treated as a
refund for the books until an accountant says otherwise (question 15 in `06`). The booking form takes one pet; a family
uses the intake form. Appointments take no advance, so no screen sets a cancellation rule for them yet. Wagbook has no
review page of its own.

**Look again** if kennels want partial refunds per night, credit moved between parents, a review page of their own, or
appointment advances.

## D48. The team: a rota planned by managers, leave and attendance each person's own, times stamped by the database

**Status:** Decided, 22 October 2026, building Phase 4 (M43 and M44).

**Situation.** A kennel with caretakers on site day and night runs on shifts, and pays people by the days and hours
they worked. The roadmap asks for shifts and who works them, clocking in and out from the phone, leave asked for and
granted, and a month's sheet for pay, with each person seeing their own attendance and owners and managers everyone's.
It also asks for three rough edges to be smoothed before production: Send on a reminder that marks it sent before
anyone knows it went, occupancy measured against today's kennels for every past day, and an export that names files
without holding them.

**Decision.** Shifts, the rota, leave and attendance are tables of their own (`shifts`, `rota`, `leave_requests`,
`attendance`), switched on per kennel (`organizations.keeps_rota`, as D44 switches each area). The rota is planned by
owners and managers and read by everyone; taking a person off a shift is part of planning, so managers delete rota rows
too, an exception to D29 (the row is a plan, not a record). Leave and attendance follow the roadmap's rule in row level
security: a person reads and writes their own, owners and managers everyone's; who answers leave is a trigger (an owner
or manager, never their own unless an owner). Clocking in and out takes the database's clock; a time by hand is for an
owner or manager, with a note, and lands in History of changes. Two exclusion constraints keep a person on one shift
and one stretch at a time. Today's "On now" uses `who_is_on()`, a `security definer` function that gives the names of
people clocked in to anyone working at the kennel, and nothing more. A stretch counts on the day it began, so a night
shift counts on its evening, and the month's sheet is worked out in the app (`attendanceSheet()`) from the rows the
reader may see. Riders keep no rota: they reach no table (D45). For M44: Send asks "Did the message go?" and records it
only on "Yes, it went"; each change of a kennel in or out of service is kept (`kennel_service`) and past days count
the kennels there that day; the export is a ZIP of the JSON and the files, written by a small function of Wagbook's
own (`zipStore()`, files stored as they are, since photos and PDFs are compressed already) rather than a new library.

**Why.** A time someone types for themselves is a time someone can round up; a time the database stamps is not, and a
manager's correction carries their name and reason. Pay depends on the sheet, so the rules that make it right (one
stretch at a time, no hand-written times by staff, attendance kept when a person goes) live in the database with
tests. Seeing who else is on is part of working a shift; seeing when a colleague clocked in is not, so the function
gives names only.

**Cost.** Hours are counted only from stretches clocked out; a forgotten clock-out shows on the sheet until a manager
puts it right. A person with attendance cannot be removed, only suspended. The rota has no repeating pattern (put
someone on for up to 31 days at a time) and no cover requests. Riders are not on the rota. A ZIP of a parent with
hundreds of photos is built in memory on the server.

**Look again** if kennels want repeating rotas, overtime rules, pay worked out in Wagbook, riders on the rota, or
clocking in tied to being at the kennel (location or a code on the wall).


## D49. Running for real: what comes after the roadmap, and photos kept until the owner archives them

**Status:** Decided, 22 October 2026, by the owner, adding M45 to M65 to the roadmap.

**Situation.** Every milestone to M44 is built. Asked what a kennel will need once it runs on Wagbook every day, the
owner chose: forgotten and changed passwords and Google sign-in; jobs that run overnight; importing from a
spreadsheet; knowing when the site breaks; cleaning kennels between guests; checklists and repairs; a pet that has
passed away; a stay report; photo proof on care tasks and "Pack all"; a parent's own food and medicines; a trial day;
vet visits; moving an appointment; booking an appointment and reporting a delivery problem from the parent's link; a
repeating rota; alerts on staff phones; selling over the counter; orders to suppliers; an export for Tally; and
several sites under one owner.

**Decision.**

- **Photos are kept until the owner archives them.** They are already made smaller on the phone before upload (1600
  pixels on the long edge, JPEG, and a 480 pixel copy). Nothing is removed by itself. When space runs short, the owner
  downloads a month of photos as a ZIP (to keep on Google Drive or elsewhere), and only then may remove that month's
  full photos from Wagbook. The small copy stays so pages still show something. Health papers and expense receipts are
  never archived this way.
- **A trial day is offered, never required.** A kennel may book one; nothing stops a first stay without it.
- **When a pet passes away, the kennel sends flowers.** Wagbook stops every reminder, delivery and request for the
  pet and puts "Send flowers" on Today with the parent's address.
- **Several sites stay separate kennels.** Each keeps its own parents, pets, prices and bills; an owner of several
  sees combined reports. Sharing a parent's record across sites is not done: it would widen who sees personal data,
  and change row level security everywhere.
- **Not now:** online payment through a payment provider (the owner will add it later), and messaging many parents at
  once (not needed).

**Why.** Deleting a parent's photos is a choice that cannot be undone, so it is the owner's, made with a copy in hand,
never a timer's. Separate sites keep the access model as it is and still answer the owner's question, "how are all my
sites doing?".

**Cost.** A kennel on a small storage plan has to remember to archive; Settings shows the space used (M49). An owner
cannot see one parent's stays across two sites in one place.

**Look again** if storage costs become a burden even with archiving, or if parents regularly use more than one site
and want one link for all of them.

## D50. Phase 5: jobs in the database, problems written as the person, an archive the owner holds

**Status:** Decided, 22 October 2026, building Phase 5 (M45 to M49).

**Situation.** Before a kennel runs on Wagbook: people who forget a password are locked out; nothing runs unless a
screen opens; every parent and pet would be typed by hand; nobody would know when the site breaks; and photos fill a
small storage plan within months. Wagbook never uses the service role key (D5), has no new library without a reason,
and keeps the anonymous role to twelve functions.

**Decision.**

- **Sign-in (M45)** uses Supabase Auth's own reset, change and Google sign-in. A reset link lands on `/auth/confirm`
  like the sign-up link and opens `/login/new-password`. Changing a password checks the current one on a second
  connection that keeps no session (Supabase Auth's `current_password` is only checked when the project asks for it),
  so the person's own session and two-step level are untouched. Google starts from a link to `/auth/google`, not a
  form, so the `form-action` rule stays `'self'`; it is shown only when `GOOGLE_SIGN_IN=on`.
- **Overnight jobs (M46)** are plain functions in the database, run by `run_nightly_jobs()`, each kennel and job in
  its own sub-transaction, with a row in `job_runs` for each. The migration switches on pg_cron and schedules it where
  the database has it, so a hosted project needs no setup. Only work that changes rows is a job: making deliveries
  ahead and forgetting old rows. Credit that ends, reminders on Today and forgotten clock-outs are worked out when read,
  so they need no job (M60 shows forgotten clock-outs from the rows).
- **Import (M47)** reads the CSV in the app (`readImport()`, a small pure function, no library) and writes it in one
  database function that runs as the caller, all or nothing. A parent is matched by phone and left as they are, as the
  intake form does; a pet known by name for that parent is skipped.
- **Problems (M48)** are written by the app's `onRequestError` hook as the signed-in person, through a `security
  definer` function that scrubs contacts and stops a flood. Errors with nobody signed in stay in the server's log only:
  writing them would need the service role key. The health check calls an existing public function with a name no
  kennel has, so the public surface stays at twelve.
- **The photo archive (M49)** follows D49: the owner downloads a month as a ZIP (written a file at a time by
  `ZipWriter`, so a big month is never in memory whole), and only then may remove that month's full photos. The
  database gives the list of files to remove only to an owner, only after the download; storage lets only owners
  delete. The small copies stay and pages fall back to them.

**Why.** Each piece keeps Wagbook's two oldest rules: the database decides, and no key that bypasses it is used.
Jobs in the database run the same way on a hosted project and a self-hosted one, with nothing else to deploy.

**Cost.** Errors on public pages are not listed for owners. A self-hosted database without pg_cron has no overnight
jobs (the food screens still make deliveries). The archive's ZIP is the owner's to keep: once a month is removed,
Wagbook holds only small copies.

**Look again** if kennels want errors on public pages listed (a narrow public function would be the way, with a test
and a paragraph in `05`), more nightly work, or an archive that goes straight to Google Drive.

---

## D51. Next.js 16.4.1 for three security advisories

**Status:** Decided, 23 October 2026.

**Situation.** `npm audit --omit=dev` listed three advisories for `next` from 16.0.0 to 16.4.0: remote code execution
in the image optimization API when SVG files are used (critical, GHSA-2464-fhr4-w9xw), denial of service in the App
Router through Server Actions (high, GHSA-p3m5-59mp-jv5r), and remote code execution in `use cache` functions
returning typed arrays (critical, GHSA-673q-mjm6-r5xr). `next build` on 16.4.0 also stopped once with a
"SecurityFatalError" upgrade notice and went on when run again.

**Decision.** `next` and `eslint-config-next` go from 16.4.0 to 16.4.1, the first release outside all three ranges,
still pinned exactly. 16.4.2 came out a day later with wider changes (its own documentation differs in about forty
pages); 16.4.1 is the smallest step that fixes the advisories. The documentation in `node_modules/next/dist/docs/` is
the same in 16.4.0 and 16.4.1, so nothing in the code had to change. Only the Next.js packages moved in
`package-lock.json`.

**How exposed Wagbook was.** Server Actions: fully, as every form in the app is one, and the public forms (intake,
booking, food order) take them from anyone. `use cache`: not used anywhere in `src/`. The image optimization API:
Wagbook never imports `next/image` (photos are short-lived signed Storage links shown with a plain `<img>`, see
`src/components/pet-avatar.tsx`) and `next.config.ts` has no `images` setting. But Next.js still answers
`/_next/image` for files in `public/` unless `images.unoptimized` is set, and `public/icons/` holds two SVG files, so
the route was reachable on a self-hosted server even though no page uses it (checked on 16.4.1 with `next start`:
`/_next/image?url=/icons/icon.svg&w=64&q=75` reads the file and answers 400, "image type is not allowed"). Lower
than for an app that serves images through it, not none.

**Cost.** None found: the full gate passes on 16.4.1. `npm audit` without `--omit=dev` still reports `braces` (high,
denial of service on deeply nested patterns) through `eslint-config-next`'s `fast-glob`; that runs only at lint time
on the project's own files, and npm's only offer is a downgrade to `eslint-config-next` 14.

**Look again** at the next advisory for `next`: upgrade to the first patched release in the same way, and run
`npm audit --omit=dev` before each release. Setting `images: { unoptimized: true }` in `next.config.ts` would make
`/_next/image` answer 404 and close that route for good, since nothing uses it.

---

## D52. Phase 6: the day, smoother, with the rules in the database and nothing worked out twice

**Status:** Decided, 23 October 2026, building Phase 6 (M50 to M57).

**Situation.** The owner's list for running every day (D49) asked for kennels cleaned between guests, the jobs that
are not about a pet, a kind end for a pet that has passed away, a report for the parent at check-out, photo proof on
care, the parent's own food and medicines, trial days and vet visits. Each touches money, bookings or what parents
see, so the database has to hold the rule, and nothing new may be typed twice.

**Decision.**

- **Cleaning (M50).** A kennel is to clean only because a pet really left it: the check-out writes the row
  (`bookings_leave_kennel_to_clean`, `security definer`, as `kennel_service` is written), and only when the last pet in
  it leaves, so a sibling still in it is not disturbed. Cleaned is stamped by the database and never cleared.
  Checking into a kennel still to clean is asked about, not refused: the check-in action stops, keeps the checklist,
  and the booking page asks "Check in anyway?". A kennel out of service is never asked about.
- **House jobs (M51)** are a list owners and managers set (opening, closing, cleaning; every day or one weekday) and a
  row a day only once someone ticks one, stamped as care tasks are. Repairs are anyone's to report and mark fixed; the
  cost becomes an expense through `cost_to_expense()`, which runs as the caller so the expenses policies decide.
- **A pet that has passed away (M52)** is a day on the pet, set by owners and managers. A trigger then cancels the
  stays and appointments still to come with no charge ("Passed away"), ends its food and cancels deliveries still to
  go; another refuses anything new for it (`WB254`). The reminders stop because what they are worked out from is
  gone; the three read from history (a groom due, a review, a food trial's follow-up) leave the pet out in their
  queries. Undo is for a week, and brings nothing back. Flowers are on Today until marked sent, with the cost as an
  expense for owners and managers.
- **The stay report (M53)** is not stored: it is worked out when read (`stayReport()`), from the stay's care tasks,
  play, weighings and the incidents the parent was told of. Only the kennel's words and the photos picked are stored,
  and the photos must already be on an update shown to the parent, so the report shows nothing new. The public stay
  page gets the report from `get_public_stay`, still one of the twelve public functions; incidents are named by kind,
  never by their account.
- **Photo proof (M54)** is a routine's choice, copied on to each task and never changed afterwards, and a check
  constraint keeps such a task from being done without its photo. The photo sits on the pet's record under
  `{org}/care/` (which the photo archive already covers) until staff share it on an update. Such a task is not ticked
  offline: it needs the connection for the photo. "Pack all" packs each delivery from the newest batch of its recipe
  in date, as the page offers one at a time, and leaves the rest.
- **Supplies (M55)** count down from the ticks, not from a counter anyone keeps: a view (`stay_supply_left`) works out
  what is left, how many days that lasts by the pet's routines now, and whether it runs out before the stay ends.
- **A trial day (M56)** is day boarding marked as one, with its result on the booking; nothing requires one.
- **Vet visits (M57)** are recorded in one step by `record_vet_visit()`, as the caller: the visit, a line on the stay's
  bill (staff may add a one-off line, as before), the expense when the caller is an owner or manager (staff leave it for
  them, with a button), and each medicine as the pet's own routine.

**Why.** The same two rules as before: the database decides, and nothing is entered twice. A report or a count
worked out when read can never disagree with the care that was ticked.

**Cost.** The report changes if a care task is changed after check-out (it is what was recorded). Supplies are
counted against the routines as they are now, so a routine stopped mid-stay changes the days left. A passing undone
leaves its cancellations as they are. Pack all can pack from a batch the cook meant for another day; the page still
offers one at a time.

**Look again** if kennels want the report frozen at check-out, supplies by the meal (a different amount at breakfast
and dinner), or house jobs with photo proof too.
