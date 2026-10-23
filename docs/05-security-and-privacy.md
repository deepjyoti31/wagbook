# 5. Security and privacy

Wagbook holds people's phone numbers and addresses, their pets' medical notes, and a kennel's income. Many kennels may
share one installation. This page says what is promised, how it is enforced, what has been checked, and what is not
promised.

## The promises

1. A kennel's data is visible only to that kennel's active members.
2. Someone who is not signed in can do exactly twelve things, and can read no table.
9. A rider (D45) sees only their own delivery run for the day, and can read no table.
3. A parent's link shows one stay or one bill and nothing else, and a stay link opens only that stay's shared photos.
4. Staff cannot do what only managers may do, and managers cannot touch owners.
5. An issued invoice cannot be changed by anyone, including owners.
6. "Who did it and when" cannot be forged or backdated by the person doing it.
7. Changes to bookings, money, settings and people are recorded in a log nobody can edit.
8. Someone who has turned on two-step sign-in cannot be reached with their password alone.

Each is enforced in the database and has tests that fail when the enforcement is removed.

## Where the boundary is

**The database is the security boundary. Nothing else is.**

The Next.js server connects to Supabase with the visitor's own session and the publishable key. It has no more power
than the visitor's browser would have talking to Supabase directly. So a bug in a page or Server Action cannot leak
another kennel's data: the database will not return it.

It follows that:

- The **service role key is never used**. It bypasses row level security. One careless use would undo everything
  above. If a feature seems to need it, write a narrow `security definer` function instead.
- Checks in the app (`requireOrg()`, zod, the proxy redirect) are for good error messages and for defence in depth.
  They are not what keeps data safe.
- Anyone can call Supabase's API directly with the publishable key, skipping the app. Every rule must hold then too.
  This is why the tests talk straight to the database.

## Who can do what

The complete model is `supabase/migrations/20261008000800_row_level_security.sql`, written to be read top to bottom.
In summary (deleting anything is for owners, D29):

| Data | Staff | Manager | Owner |
| --- | --- | --- | --- |
| Clients, pets, vaccinations, bookings, booking items, care tasks, play sessions, updates, incidents | Read, add, edit (editing includes hiding a parent or pet by soft delete), but not a parent's own phone numbers (`WB002`, D33) | Also a parent's phone numbers | Also delete |
| The price of a booking or an extra | Book at price list prices only; no discount; no changes afterwards (D15) | Set and change anything | Same |
| A pet's own care routine | Read, add, edit | Same as staff | Also delete |
| A parent's delivery addresses (M25) | Read, add | Also change (personal data, like a phone number) | Also delete |
| A pet's weights (M25) | Read, add | Also correct | Also delete |
| Areas served (M25) | Read | Add, edit | Also delete |
| What the kennel offers, and people's skills (M25) | Read | Change (only owners set an owner's skills) | Same |
| House routines, kennels, rate card, peak periods, play yards | Read | Add, edit | Also delete |
| Kennel settings | Read | Edit | Also delete the kennel |
| Draft invoices and their lines | Read, add, edit; remove lines from a draft | Same as staff | Also delete whole drafts |
| Issue an invoice | Only one whose lines are exactly what its booking says (`WB050`) | Any draft | Same |
| Files (photos, certificates) | Add; never replace or remove | Also replace | Also remove |
| Void an invoice | No | Yes, with a reason; a tax invoice only in its own month (`WB095`) | Yes |
| Credit notes | Read | Make one, with a reason (`issue_credit_note`); nobody changes or deletes one | Same |
| Payments received | Read, add | Also refunds and corrections | Also removal |
| Expenses, and their receipt files | Nothing | Read, add, edit | Also delete (with the receipt file) |
| Reports and CSV downloads | Nothing (`WB060`) | Read | Read |
| Forms from parents | Read; accept or decline, once | Same as staff | Also delete |
| A parent's details: download everything, erase on request | No (`WB070`) | Download (`export_client`) | Also erase (`erase_client`, `WB074`, D29) |
| People | See colleagues | Invite (by email or link), suspend, restore, rename and change the role of staff and managers | Also owners |
| Merge two parents | No | Yes (`merge_clients`) | Same |
| Stock (M26): items, suppliers, what is in stock | Read; record waste and stock takes | Also add items and suppliers, record purchases | Also delete items and suppliers |
| What stock cost, and supplier bills (`stock_costs`) | Nothing | Read, add (with a purchase); nobody changes one | Same |
| Stock movements | Read; nobody changes or deletes one, not even an owner (a stock take corrects) | Same | Same |
| Recipes and their versions (M27) | Read | Add, new versions (`save_recipe_version`), retire; a version never changes | Also delete a recipe never cooked |
| Cost per kilo of a recipe or batch | Nothing (`WB145`) | Read | Read |
| A pet's food (M28) | Read, edit, but not grams set by hand (`WB146`) | Also grams by hand | Also delete |
| Food prices, kitchen settings | Read | Add, edit | Also delete |
| Subscriptions and deliveries (M29) | Read, add, change before the cut-off; the database prices them | Also a delivery's price; cancel after the cut-off with a reason | Also delete a delivery not on a bill |
| Batches (M30) | Read, record (with their stock) | Same | Also delete one that took nothing |
| Delivery runs and problems (M31) | Read, add, change | Same | Also delete |
| Food orders from the website and parents' links (M32) | Read; confirm (`confirm_food_order`) or decline; what the parent sent is never edited | Same | Also delete |
| Food reports (M33) | Nothing (`WB060`) | Read | Read |
| Places, services, their prices, packages (M34, M37) | Read | Add, edit, take off the list | Also delete |
| Appointments and add-ons (M34) | Read, book, confirm, mark done, cancel; the database prices them; not the price (`WB022`, `WB025`) | Also set or change a price, and price a quote | Also delete |
| Grooming cards (M35) | Read, edit | Same | Also delete |
| Training courses (M36) | Read; book sessions from one | Sell, correct | Also delete |
| Putting a package on a stay (M37) | One with a set price (`apply_package`) | Also one priced on request (`WB206`) | Same |
| Cancellation rules, weekend days, credit months (M38) | Read | Change | Same |
| Settling a cancelled stay: its refund and credit (M38) | No: a refund is for owners and managers | Yes, worked out again from the database, never more than the advance (`WB122`) | Same |
| Credit (M38) | Read; spend it on a bill as a payment, never more than is left (`WB211`) | Also give goodwill credit, with a reason | Also delete goodwill credit not yet spent; credit from a cancellation is made only by a refund kept as credit (`WB213`) |
| Pick-ups and drops (M39) | Read, add, cancel with a reason; the database prices them; only to an area served (`WB215`) | Also another price, and outside the areas | Also delete |
| Health rules at the door (M40) | Read | Change | Also delete a required vaccine |
| Letting a pet in without its papers (M40) | No | Yes, with a reason (`health_overrides`, in History of changes) | Same |
| Shifts and the rota (M43) | Read | Plan: add shifts, put people on and take them off (D48) | Also delete a shift |
| Leave (M43) | Ask for and withdraw their own; read their own | Read everyone's; grant or refuse, never their own (`WB223`, `WB224`); put leave in for someone | Also answer their own; delete |
| Attendance (M43) | Clock themselves in and out (the database stamps the time); read their own; see who is on now, names only (`who_is_on`) | Read everyone's; write or correct a time by hand with a note (`WB226`, `WB227`), in History of changes | Also delete |
| When kennels went in or out of service (M44) | Read | Read; written only by the database from the kennel's own change | Same |
| Bring in parents and pets from a spreadsheet (M47) | No (`WB002`) | Yes (`import_parents_and_pets`, runs as the caller, at most 2,000 rows, `WB240`) | Same |
| Overnight job runs (M46) | Nothing | Read; written only by `run_nightly_jobs()`, which the app cannot call | Same |
| Problems: errors on the server (M48) | Write their own through `log_app_error()`, never read | Same as staff | Also read |
| Photo archive (M49): space by month, a month's photos as a ZIP | Nothing (`WB002`) | Read, download | Same |
| Removing a downloaded month's photos (M49) | No | No (`WB242`); storage deletes are for owners | Yes, only after the month was downloaded (`WB243`); the small copies stay |
| A rider (D45) | No table at all: their own runs for today through `my_runs()`, marking their own stops through `rider_mark_stop()` and their own pick-ups and drops through `rider_mark_trip()` (M39), a photo at the door of their own stop | | |
| Audit log (History of changes) | Nothing | Read | Read |

`who_is_on()` (M43) is `security definer`: a person reads only their own attendance, but anyone working at the kennel
may know who else is clocked in. It checks the caller works at the kennel asked about and returns names only, no
times. `kennels_keep_service()` is a `security definer` trigger: `kennel_service` has no grant to write, so it only
ever says what `kennels.is_active` said, and when. Neither is granted to the anonymous role.

Phase 5 (M46 to M49, D50) adds three `security definer` functions. `log_app_error()` writes a problem for the kennel
the caller works at (or their first): nobody may insert into `app_errors` directly, so every row is scrubbed of email
addresses and phone numbers (`scrub_error_text()`) and a kennel gets at most 200 an hour; it does nothing for someone not
signed in. `record_photo_download()` and `record_photo_removal()` keep the photo archive's record (who downloaded, then
who removed, in that order); each checks the caller's role itself. The overnight jobs (`run_nightly_jobs()` and the
jobs it runs) are granted to nobody: pg_cron runs them as the database's owner, and each job filters by kennel itself.
Importing a spreadsheet and reading the space photos take run as the caller, so row level security and storage's own
policies apply. The health check (`/api/health`) calls `get_public_intake_form()` with a name no kennel can have, so it
adds nothing to what a stranger can do: still twelve public functions.

Changing a password (M45) checks the current one first, on a separate connection that keeps no session, so a stolen
session alone cannot change the password; the page is rate limited (10 tries per ten minutes per address). Resetting a
forgotten password gives the same answer whether or not the address has an account. With two-step sign-in on, Supabase
Auth asks for the code before a reset password is saved. Sign in with Google (M45) is off unless whoever deploys
Wagbook sets it up; it starts from a link, not a form, so the browser's `form-action` rule is never relaxed.

Some columns are not writable by anyone through the API, whatever their role, because column-level grants leave them
out: a booking's check-in and check-out stamps, its creator and its link token; an invoice's status, number, dates,
frozen seller and buyer, and void fields; a membership's organisation, user and acceptance; everything a parent sent
in an intake form, and who reviewed it.

## What someone who is not signed in can do

Twelve functions, and no table. `tests/db/security.test.ts` pins this list; adding to it fails the build until the test
is changed on purpose.

| Function | Returns | Guard |
| --- | --- | --- |
| `get_public_intake_form(slug)` | Kennel name, city, WhatsApp number, usual times, consent wording, whether the form is switched on, and for the booking form (M41) its currency, its usual boarding and day boarding prices and the appointment services it offers with their prices | None: returned for any link name that exists. Nothing here is private: a kennel publishes its prices. |
| `submit_intake(slug, payload)` | The folder for this form's certificates and its upload secret | Refused when the form is switched off (`WB040`); size cap, shape checks, consent required, flood limits |
| `get_public_stay(token)` | One stay: kennel contact, pet name, dates, status, parent-visible updates, care counts | 64 character secret; dead when cancelled, and 30 days after check-out |
| `get_public_invoice(token)` | One issued or voided invoice with its lines, the total paid so far, and the UPI details frozen on it | 64 character secret; never a draft |
| `get_public_booking_form(token)` | A known parent's own booking link: kennel name, WhatsApp number and usual times, the parent's first name, their pets' names, the kinds of stay they can ask for, and their stays already asked for or booked (dates and status) | 64 character secret per parent (`clients.request_token`); nothing for a hidden or erased parent; no prices, notes or other parents |
| `submit_booking_request(token, payload)` | How many pets were asked for | Same secret; refused when the kennel turns requests off (`WB100`); only the parent's own listed pets (`WB102`); dates from today to a year ahead, 90 days at most (`WB103`); a usual price must exist (`WB104`); 12 requested pets a day at most (`WB105`); size cap. Makes bookings with status `requested`, which hold no kennel |
| `get_public_food_form(slug)` | The kennel's food order page (M32): name, WhatsApp number, UPI details, consent wording, the trial and subscription food with their prices, the portion settings and pack size, and the PIN codes served with their charges | None beyond the link name, and only while the kennel delivers food and takes orders. Nothing here is private: a kennel publishes its prices and areas |
| `submit_food_order(slug, payload)` | A token for the order, its status, and what to pay now, worked out by the database | Refused when the kennel takes no orders (`WB180`); size cap and shape checks (`WB181` to `WB185`), consent required, a valid phone and PIN code, a dog's weight; three orders a day per phone and thirty in ten minutes per kennel (`WB184`). Makes a `food_orders` row and nothing else: no parent, pet, subscription or charge |
| `food_order_paid(token)` | The order's status | The order's 64 character token; only moves an unpaid order to "says paid", for staff to check |
| `submit_food_request(token, payload)` | Nothing | A known parent's own link secret, as `submit_booking_request`; only their own subscriptions (`WB186`); dates from today to 120 days ahead (`WB187`); ten a day (`WB105`). Makes a request for staff, never a change by itself |
| `stay_media_visible(name)` | True or false: may this request read this file? Called by the storage policy `pet_media_select_for_stay`, not by pages | The stay token must arrive in the `x-wagbook-stay` request header and belong to a live stay; the file must be the stay's pet photo or a photo on one of its updates shown to the parent (or the small copy of one) |
| `intake_upload_allowed(name)` | True or false: may this request add this file? Called by the storage policy `pet_media_insert_for_intake`, not by pages | The form's upload secret must arrive in the `x-wagbook-intake` header; the form must be under an hour old and still waiting for staff; the name must be `{org}/intake/{form}/pet-N` (or `pet-N-2`, for a pet's second vaccine) for one of the form's pets. Adding only: one file per name, nothing can be read back, replaced or removed |

**Pages without a function of their own (Phase 5).** `/api/health` (M48) calls `get_public_intake_form()` with a name
no kennel can have and says only whether the database answered. `/login/forgot` and `/login/new-password` (M45) go to
Supabase Auth, not to a function: the first gives the same answer for any address, and the second works only for the
session the emailed link made. `/auth/google` only sends the browser to Google through Supabase Auth.

**Certificates with the intake form (milestone M9).** `submit_intake` hands back a 64 character secret made for that
form. The app sends each certificate to Storage as the anonymous role with the secret in the `x-wagbook-intake`
header, and the storage policy lets the file in only through `intake_upload_allowed()`. Staff read the files as members
of the kennel (the folder is the kennel's own). The bucket keeps its limits: 10 MB, photos and PDF. The app turns a
photo into a JPEG without its hidden data first; someone calling Storage directly could send a file as it is, which
only staff ever open, from Supabase's address rather than Wagbook's. Worst case for a kennel that is flooded: 60
waiting forms an hour (`WB048`), six files each.

**Booking requests from parents (milestone M17).** A known parent gets a link of their own from the kennel (Copy or
Send on the parent page). Behind it, the parent sees their pets' names and the dates of their own stays, and can ask
for a stay. Each pet asked for becomes a booking with status `requested` at the kennel's usual price. A request holds
no kennel, so a forwarded or leaked link cannot take space from anyone: at worst it adds requests that staff decline.
Staff renew the link (`renew_request_link`, any member), and the old one stops working; the token is not writable
through the API. Erasing the parent clears it. The app limits posts to the page per address, like the intake form.

**Ordering food (milestone M32).** The food order page is public by design: a kennel puts its link on its own
website. An order holds nothing and charges nothing; it is a row staff read and confirm once the money has arrived
(`confirm_food_order`, any member, `security definer` because what the parent sent is never writable through the API).
The amount shown for payment is worked out in the database from the kennel's own prices, never taken from the page. The
token returned lets the parent say "I have paid" and nothing else; it cannot read the order back. A known parent's own
booking link (M17) also shows their subscriptions' next delivery dates and asks for a pause, a skipped delivery or more
food, which arrive as requests. The app limits posts to `/f/` per address like the intake form. Erasing a parent deletes
their food orders, matched by parent or by phone.

**The booking form for new parents (milestone M41, D47).** `/book/{slug}` adds no public function. It sends the intake
form's own payload through `submit_intake()`, with a `request` in it, so the same switch, size cap, consent, shape
checks and flood limits apply, and the app limits posts per address as on `/i/`. Nothing is booked from the public
internet: the form waits in Forms from parents, and only a member accepting it (`accept_intake()`) makes the parent,
the pet and a booking or appointment with status `requested`, which holds nothing. The estimate on the page is worked
out in the browser from the published prices and never sent back.

**Riders (milestone M31, D45).** A rider is a member whose role leaves them out of `my_org_ids()`, so no policy in the
access model gives them anything. `my_runs()`, `rider_mark_stop()` and `rider_mark_trip()` (all `security definer`, checking
the caller is the run's rider, today) are their only way in, and `rider_upload_allowed()` lets them add a photo at the door of their
own stop for today. `tests/db/riders.test.ts` signs in as a rider and reads every table in the schema: only their own
membership row comes back.

**Photos on the stay page (milestone M5).** A parent has no account, Postgres cannot sign storage links, and the
service role key is never used. So the stay page asks Storage for signed links as the anonymous role, sending the stay
token in the `x-wagbook-stay` header. Storage passes request headers to Postgres (`request.headers`), and the policy
lets the anonymous role read a file only when `stay_media_visible()` says so. The links last an hour. Listing the
bucket with a stay token shows that stay's shared photos and nothing else; without a token, nothing. Paths stored on
rows must sit in the row's own organisation's folder (constraints `*_in_org`), so a member of two kennels cannot put
one kennel's photo on the other's stay. `tests/db/media.test.ts` covers this, and the end-to-end walk checks a real
photo through real Storage.

A stay page never includes prices, staff notes, medical notes, flags, the parent's phone, or other pets.

Tokens are 64 hex characters made from two random UUIDs (244 random bits, from the database's cryptographic
generator). They cannot be guessed. They can
be forwarded: anyone holding a link can open it. That is the intended trade for "parents never log in", and it is why
a stay link shows so little and expires.

## Data from the public internet

The intake form is the one place strangers write into the system. Treat everything from it as hostile:

- `submit_intake` checks the size (20,000 bytes), the shape, the count of pets (1 to 6), and that consent is ticked.
  It stores the payload and creates nothing else.
- A person reviews it. `accept_intake` requires the submission to be `new`, truncates every text field, parses dates
  with `safe_date()` (which returns null instead of raising), ignores unknown species and sexes, and **never rewrites
  an existing client**: a stranger who knows a parent's phone number cannot change that parent's name or address by
  submitting a form.
- The review screen reads the payload through the zod schema in `src/lib/intake.ts`. If it does not fit, the screen
  shows nothing from it and offers no Accept button.
- React escapes everything it renders. Never use `dangerouslySetInnerHTML` with stored text.

## Browser protections

Set in `next.config.ts` for every response, and the Content-Security-Policy in `src/proxy.ts`:

| Header | Effect |
| --- | --- |
| `Content-Security-Policy` (set by `src/proxy.ts`, a fresh nonce per request, D23) | Scripts run only from Wagbook's own files, inline only with this request's nonce or the hash of the prerendered shell's two small scripts; images only from Wagbook and the Supabase project; requests only to Wagbook; cannot be framed (no clickjacking); forms cannot post elsewhere; no plugins |
| `X-Frame-Options: DENY` | The same, for old browsers |
| `X-Content-Type-Options: nosniff` | Files are not reinterpreted as scripts |
| `Referrer-Policy: strict-origin-when-cross-origin` | A parent's secret link is not sent to other sites as a referrer |
| `Permissions-Policy` | Camera, microphone, location and payment APIs are off |
| `Strict-Transport-Security` | HTTPS only |

Other points:

- Session cookies are set by `@supabase/ssr` and refreshed in `src/proxy.ts`. The server reads identity with
  `auth.getClaims()`, which verifies the token's signature.
- Server Actions are protected against cross-site requests by Next.js, which compares the request's origin with the host.
- `/auth/confirm` resolves its `next` parameter as a browser would and refuses anything that leaves the site.
- Links sent to parents are built from `NEXT_PUBLIC_SITE_URL`, never from the request's Host header in production, so
  a forged header cannot put an attacker's address into a WhatsApp message.
- Public pages carry `robots: noindex`.
- **Limits at the edge of the app (M9, D26).** `src/proxy.ts` counts posts per visitor address: sign in, create an
  account and two-step codes 20, the intake form 10, joining 20, each per ten minutes. Over the limit, the action
  answers with a sentence and does not call the database. Posts over 1 MB are refused (413), except to signed-in pages
  and the intake form, which may send photos (12 MB). The address is what the host in front reports (`x-real-ip`, then
  `x-forwarded-for`): Vercel and the Caddy server of the self-hosting setup overwrite those headers. Supabase Auth keeps
  its own limits per address for anyone who calls it directly, and the intake form keeps its database limits.

## Two-step sign-in

Milestone M9, decision D24. Any person can turn it on for themselves under More, Two-step sign-in: Supabase Auth gives a
secret, shown as a picture to scan with an authenticator app, and the first code proves it was set up. From then on:

- Signing in with the password gives a session at assurance level `aal1`. The app sends it to `/login/code`.
- The database refuses such a session everything: `my_org_ids()` and `my_org_ids_with_role()`, which every policy
  uses, return nothing for it (`session_meets_mfa()`), and the functions that act on a person's own memberships raise
  `WB005`. So a stolen password is useless through the API as well. The end-to-end walk checks this with a direct API
  client.
- Supabase Auth refuses to add another authenticator, or remove one, from an `aal1` session.
- A person who lost their phone signs in with one of their recovery codes (below), or asks whoever runs the
  installation to remove the factor (see [10-setup-and-deploy.md](10-setup-and-deploy.md)).

Owners who have not turned it on see a reminder under More. It is not forced.

**Recovery codes (M24, D43).** On the same page, a session that gave its code from the app makes ten one-use codes
(`make_recovery_codes()`), shown once. Only their SHA-256 hashes are kept, in `recovery_codes`, which has row level
security on and no policy and no grant (like `invoice_counters`): only the three functions reach it, all `security
definer`, each checking `auth.uid()` itself. "Use a recovery code instead" on `/login/code` spends one
(`use_recovery_code()`, behind the sign-in rate limit): the session that used it, named by the `session_id` in its
token, then passes `session_meets_mfa()`, and no other session does. A code counts only while the authenticator it was
made for is still there, so turning two-step off or replacing the phone voids every code and every session they let in.
A recovered session cannot make more codes (it is not `aal2`), and Supabase Auth still treats it as `aal1`, so it cannot
remove the lost factor either; that stays with the administrator. Tested in `tests/db/recovery-codes.test.ts` and in the
browser walk.

## Privacy

Wagbook is built with India's Digital Personal Data Protection Act in mind. It is a tool; the kennel is the one
responsible for its parents' data, and should take its own advice.

What the software does:

- **Asks before keeping.** The intake form cannot be submitted without ticking consent. The wording is the kennel's
  own. When, and by which route, consent was given is stored on the client (`consent_at`, `consent_source`).
- **Collects what a kennel needs** to look after a pet and bill for it. No government ids, no dates of birth of people.
- **Shows the least possible.** Parent pages show one stay. Staff see their own kennel only.
- **Sends nothing to third parties.** No analytics, no advert scripts, no tracking pixels, no fonts from other servers.
- **Keeps photos private.** The storage bucket is private; images are shown through short-lived signed links.
- **Records who changed what.**

- **Gives a parent their details.** On the parent page, owners and managers download everything held about the parent
  as one file (`export_client`), addresses and pets' weights included.
- **Erases on request** (`erase_client`, D25 and D30). The parent's contact details, consent and notes, their delivery
  addresses (M25), the notes on their stays, the updates sent to them, their intake forms, draft bills, and the files among those (with vaccination
  certificates, because a card shows the owner) are deleted or emptied, and the stays' notes that the history of
  changes had copied are taken out of it. The pets stay, hidden, with their health, routines, incidents, care and
  play: the kennel's record of the animal (D30). What tax law makes the kennel keep stays: issued and cancelled bills
  with the buyer printed on them, payments, and the stays' dates and prices. Refused while a pet is in house or a stay
  is still to come.

What erasing does not reach: backups made before it (they age out on the backup schedule), a duplicate record merged
into the parent earlier, the description of a bill line or extra (such as "Vet visit for Bruno"), payment notes, and
anything about the parent typed into a pet's notes or an incident.

### What the law says, as far as we could find

Read on 21 October 2026 from public commentary, not from a lawyer, and not from the official texts themselves (the
Gazette sites could not be reached from where this was written). Take it to a lawyer before relying on it.

- **When it applies.** The Digital Personal Data Protection Rules, 2025 were notified on 13 or 14 November 2025 (sources
  differ). Most duties, erasure and retention among them (Rules 3 and 5 to 16), start eighteen months later, around
  13 May 2027 ([Bar and Bench](https://www.barandbench.com/view-point/meity-notifies-final-digital-personal-data-protection-rules-2025),
  [Mondaq](https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified)).
- **Erasure.** Section 8(7) of the Act: erase personal data when consent is withdrawn or the purpose is no longer
  served, unless keeping it is necessary to comply with a law. Section 12(3) gives the person a right to ask for
  erasure, with the same exception ([DSCI FAQ](https://www.dsci.in/files/content/documents/2025/faq-on-data-retention-and-data-erasure-v2.pdf),
  [K S and K](https://ksandk.com/data-protection-and-data-privacy/data-retention-deletion-dpdp-act-india/)).
- **Tax law is such a law.** Section 36 of the CGST Act: a registered business keeps its accounts and records,
  invoices included, for 72 months from the due date of the annual return for that year
  ([KnowYourGST](https://www.knowyourgst.com/gstlaw/cgst-act/36-period-of-retention-of-accounts-36/)). So issued bills
  with the buyer's name stay, as D25 has it. Payments are part of the accounts too.
- **Deletion after a period with 48 hours' notice** (Rule 8(1) and (2), Third Schedule) is for named classes of large
  platforms (e-commerce, gaming, social media), not for a kennel.
- **A question for the lawyer: Rule 8(3).** It asks every Data Fiduciary to keep personal data, the related traffic
  data and logs of processing for at least one year from the processing, for the purposes in the Seventh Schedule
  (mostly the State's). Commentators read it differently: some as a duty for every business, which would mean an
  erasure request must wait, or keep a sealed copy, for a year; some as limited to processing for those purposes
  ([NALSAR Tech Law Forum](https://techlawforum.nalsar.ac.in/privacy-with-a-footnote-data-retention-under-the-dpdp-framework/),
  [S.S. Rana](https://ssrana.in/articles/meity-notifies-final-digital-personal-data-protection-rules-2025/)). Wagbook
  erases at once. If the lawyer says Rule 8(3) applies, erasure needs a year's sealed hold before May 2027.
- **Pets.** The Act covers data about an individual who can be identified. A pet's record that no longer names its
  parent is not that, as far as we can tell (D30). The owner's view is that a microchip number is not the parent's
  personal data either, so it stays with the pet. Free text that mentions the parent is a question for the lawyer.

For a kennel in India, choose Supabase's Mumbai region so the data stays in the country.

## Review log

### 8 October 2026: adversarial review of the database

An independent reviewer was given the migrations and asked to break the promises above. It found sixteen problems. All
were fixed. Most have a regression test in `tests/db/hardening.test.ts` (number 5 is covered in `billing.test.ts`,
number 10 in `src/lib/safe-redirect.test.ts`). Two have no automated test because they are races between two
simultaneous transactions, which the in-process test database cannot stage: number 6 and the last-owner half of
number 16. They are listed so that nobody reintroduces them.

| # | Severity | What was possible | Fix |
| --- | --- | --- | --- |
| 1 | High | Staff could void an invoice with a plain UPDATE of its status, skipping `void_invoice()` | The guard trigger allows the change to `void` only while `void_invoice()` is running (a transaction-local flag); status is not a writable column |
| 2 | High | A manager could re-add an owner by email with a lower role and so demote them | Adding became inviting; an invitation never changes someone who is already a member; only owners can touch owners |
| 3 | High | Anyone could be made a member of a kennel without agreeing, and rows could be backdated | Memberships start inactive and unaccepted; only the invited person can accept; a check constraint ties active to accepted; timestamps are not writable |
| 4 | Medium | A draft could be inserted with a chosen sequence number, squatting on future invoice numbers | Number, sequence, year and dates are not writable; an insert trigger forces a clean draft |
| 5 | Medium | A draft could carry made-up totals, and issuing trusted them | `issue_invoice()` recomputes every line and the totals and refuses a mismatch (`WB037`) |
| 6 | Medium | A line could be slipped into an invoice in the instant it was being issued | Issuing locks the invoice row; the line guard takes a shared lock on it |
| 7 | Medium | Day boarding over several days did not hold its last day, so the kennel could be double booked | `stay_range` takes the stay kind; day boarding includes its last day |
| 8 | Medium | A member of two kennels could move a row from one to the other by changing `org_id` | `forbid_org_change` trigger on every tenant table (`WB004`) |
| 9 | Medium | The intake form could be flooded, and an accepted form could overwrite a real client's details | Size cap and hourly limits (`WB048`); accepting never rewrites an existing client |
| 10 | Medium | `/auth/confirm?next=` could redirect to another site using a backslash trick | The value is resolved as a URL and must stay on the same origin |
| 11 | Low | "Recorded by", "done by" and "created by" could be set to someone else | Triggers stamp these from the session and ignore what the client sends |
| 12 | Low | Some child rows referenced a parent by id alone, so they could point across kennels | Composite `(org_id, id)` foreign keys throughout |
| 13 | Low | Capacity was not rechecked when only the kennel changed, or when a kennel was out of service | The capacity trigger also fires on kennel changes and refuses an inactive kennel (`WB021`) |
| 14 | Low | A parent's link worked for ever, and a bill's pay link followed later changes to the kennel's UPI ID | Stay links expire; the UPI details are frozen on the invoice when issued |
| 15 | Low | Staff could overwrite files in storage | Updating a stored file is manager only |
| 16 | Low | Assorted: last-owner check could be raced; a declined form could be accepted later; hostile dates could raise errors | A lock in `protect_last_owner`; accepting requires status `new` (`WB049`); `safe_date()` |

The same pass fixed the app-side items: the open redirect, the Host header trust, the missing response headers, and
hiding Accept for unreadable forms.

### 8 October 2026, second pass: documentation checked against the code

A second reviewer compared every statement in these documents with the code. Besides wording, it found these, all
fixed, with tests under "second pass" in `tests/db/hardening.test.ts`:

| # | Severity | What was possible | Fix |
| --- | --- | --- | --- |
| 17 | Medium | The first fix for number 2 was incomplete: re-inviting an accepted member still changed their role, so a manager could demote another manager, and an owner another owner, through "invite" | An invitation leaves an accepted member untouched; only an unanswered invitation can be corrected |
| 18 | Low | Five "who and when" pairs were still client-writable: who added a parent or an extra, who checked a vaccination certificate, who told the parent about an incident, who reviewed a form | `stamp_actor` triggers on `clients` and `booking_items`; a new `stamp_when_set` trigger for the confirmations; a review trigger on `intake_submissions` |
| 19 | Low | Any member could set a declined form back to "new" and then accept it, or edit what the parent had sent | Only `status` and `client_id` are writable; the status can change once (`WB049`) |
| 20 | Low | The ten thousandth invoice of a year would have been numbered as the thousandth and refused as a duplicate | Numbers grow past four digits |

**Add an entry here for every future review**, with the date, who or what reviewed, what was found, and the tests.

### 13 October 2026: price rule and the M2 and M3 screens

What changed: the price guard triggers (D15), the family booking rule, the medicine skip rule, and the screens of
milestones M2 and M3. Checked: each new rule's test fails when the rule is removed (`bookings_guard_price`,
`booking_items_guard_price`, `bookings_check_group`, the medicine note constraint). The new triggers are
`security invoker` and set `search_path = ''`; they read only rows the caller can already read. No new function is
granted to `anon`. Every new Server Action starts with `requireOrg()`, filters by `org_id`, and repeats the role check
only to give a sentence (the database is what refuses).

### 14 October 2026: bills, photos and the fifth public function

What changed: bills (M4) and photos (M5). Staff can issue only a bill that matches its booking (`WB050`); one live bill
per booking; advances attach when a bill is issued. A fifth function reachable by the anonymous role,
`stay_media_visible()`, used only by a storage policy, and path constraints keeping every stored path in its row's
organisation. Photos are cleaned of location data twice: redrawn in the browser, and stripped of metadata segments on
the server (`stripJpegMetadata()`). Checked: each new rule's test fails without it; a real JPEG with planted GPS data,
uploaded through the app, comes back from Storage without it; another kennel's member and a request without the
token cannot read the file.

### 14 October 2026: people, invitation links and merging

What changed: `invitation_links` (no direct writes; owners and managers read and withdraw), `create_invitation_link()`
(owner or manager; owner links only by owners), `get_invitation_link()` and `accept_invitation_link()` (any signed-in
person holding the token; single use, seven days, withdrawable), and `merge_clients()` (owner or manager; may move
issued bills to another parent through a session flag that only it sets, while the printed buyer stays frozen). All
`security definer` with the reason in their comments; none is granted to the anonymous role. The join page shows a
signed-out visitor nothing about the kennel. Checked: `tests/db/people.test.ts`, each rule removed once to see its test
fail; the end-to-end walk joins a new account through a link, uses it once, and suspends and restores it.

### 14 October 2026: reports, expenses and downloads

What changed: four report functions (`report_occupancy`, `report_money`, `report_tax`, `report_extras`). They run as
the caller (security invoker), so row level security still applies, and each first calls `check_report_access()`,
which refuses anyone who is not an owner or manager of the kennel asked about (`WB060`) and any period longer than
400 days (`WB061`); every query in them filters by the kennel, so a member of two kennels never gets the other's
numbers. Receipt files (`{org_id}/expenses/...`) are now for owners and managers only in the storage policies, like
the expenses table. CSV downloads (`/app/more/reports/download`) are for owners and managers, sent with
`Cache-Control: private, no-store`, and every text cell that a spreadsheet would run as a formula (starting with `=`,
`+`, `-`, `@`, a tab or a carriage return) gets a leading apostrophe, because names typed on the public intake form
reach these files. Checked: `tests/db/reports.test.ts` (staff, another kennel, a stranger and the anonymous role are
refused; a member of both kennels sees only the one asked about; staff cannot add or see a receipt file), with the role
check and the receipt rule each removed once to see the tests fail; `src/lib/core/reports.test.ts` for the CSV
escaping; the end-to-end walk checks that staff get the refusal sentence and a 403 from the download.

### 15 October 2026: languages, offline ticks and the service worker

What changed: `memberships.language`, written only through `set_my_language()` (security definer, because staff may
not update membership rows; it touches only the caller's own rows and only that column, `WB013` for anything not
offered), and `organizations.parent_language` for owners and managers. The public functions return the kennel's
parent language, and the bill its locale; nothing else became public. The intake form's default consent wording is
stored in the language the parent read. A service worker (`public/sw.js`) keeps the last copy of Today and Care, which
hold pet and parent names and phone numbers, on the phone for offline use; the sign-in page asks it to forget them,
and with them any ticks not yet sent. `/app/care/sync` takes ticks made offline: it requires a signed-in member, a
same-origin request and a JSON body of task ids, and can only turn this kennel's pending tasks to done. Checked:
`tests/db/languages.test.ts` (the own-rows rule removed once to see its test fail), `src/lib/offline-ticks.test.ts`,
and the end-to-end walk ticks a task offline, comes back online, and sees it sent.

### 15 October 2026: second review (milestone M9)

**Who.** Claude Code, as a separate adversarial pass at the end of the session that built M9. It is not independent of
the author in the way the first review was; a review by a person outside the project is still recommended before a
public instance (`HANDOFF.md`).

**What was checked.** Every promise above against the code as it stands, with M9's changes read as an attacker would:
the script policy and what same-origin content could run under `'self'`; the rate limits and whether their marker
header can be forged (the proxy removes it from every incoming request); two-step sign-in through the API with only a
password (the end-to-end walk now does this with a direct Supabase client: no organisations, no memberships, and
Supabase Auth refuses to enrol a new authenticator); the anonymous upload path (names, other forms' secrets, expiry,
reading back, replacing, removing); export and erase (staff, another kennel, the anonymous role, what is left in the
history of changes); and every new function's `search_path`, grants and `security definer` reason.

**Races 6 and 16, staged at last.** The first review left two race fixes without a test, because the in-process
database has one connection. With a real Postgres (the local Supabase), `scripts/race-checks.sh` runs both with two
sessions at once: two owners demoting each other (the second waits for the lock and is refused, `WB011`), and a line
added to a bill while it is being issued (it waits, then is refused, `WB032`). Both held.

**Found and fixed:**

| # | Severity | What was possible | Fix |
| --- | --- | --- | --- |
| 21 | Low | Staff could bring an erased parent's empty record back into the lists by clearing `deleted_at`, and type details into it | Check `clients_erased_stay_hidden`; `erased_at` itself is not writable (column grants) |
| 22 | Low | The script policy allowed the browser to connect to the Supabase project, which the app never does | `connect-src 'self'` only |
| 23 | Low | `erase_client` (security definer) answered "only an owner or manager" for another kennel's parent, telling a stranger that the record exists | It answers "not found" (`WB003`) unless the caller is a member of the parent's kennel |
| 24 | Low | Pets added on the intake form after removing others got keys past six and were silently dropped | The action reads keys up to 60 and still refuses more than six pets |

**Looked at and left as they are** (in "Known limitations" below): `'self'` for scripts; per-server counting of rate
limits; intake uploads by direct API callers (bounded by the form's hourly limits; staff open them from Supabase's
address).

## Known limitations

These are real. Do not describe Wagbook as free of them.

| Limitation | Consequence | Plan |
| --- | --- | --- |
| The signed-in screens have not been exercised against a live Supabase project | PostgREST, real Auth and real Storage may behave differently from the in-process tests | Milestone M1, first |
| The intake form's database limits are per kennel and per phone number | Someone calling Supabase directly, from many addresses, can still fill a kennel's hourly quota and block real parents for that hour. The app limits each address (D26). | Add the host's own rate limiting for `/i/` (Vercel Firewall, Cloudflare) on a public installation |
| The app's rate limits are counted in each server's memory | On a host that runs many copies (Vercel), each copy counts on its own | Exact on one server (self-hosting); add the host's edge rules elsewhere |
| Scripts from the same site are allowed (`'self'`) | A script file that is not the build's, served from Wagbook's address, would run | Nothing visitors send is served from that address (D23) |
| The script policy needs the build's manifest | If `.next/build-manifest.json` cannot be read, pages are sent with no script rule (logged) | Check the header after deploying (`10-setup-and-deploy.md`) |
| Posts to signed-in pages and the intake form may be 12 MB | Needed for photos and certificates | Everything else is capped at 1 MB at the edge |
| A photo replaced by a new one, or a draft's update that failed, can leave a file nobody points at | Storage use grows a little; only owners delete files, by design (D29) | An owner's clean-up. A deleted expense now takes its receipt with it |
| A photo sent without JavaScript is stored as taken (only its hidden data removed) | It may show sideways and is larger | Most phones run the page's JavaScript; the photo still works |
| Errors on public pages (intake form, stay page, bills) are not written down for owners (M48) | Owners see only errors met while someone was signed in; the rest are in the server's own log | By design: writing them would need the service role key, which is never used |
| An archived month's ZIP (M49) is the only full copy of its photos once removed | A ZIP lost by the owner cannot be recovered from Wagbook | The page says so before removing; the small copies stay |
| Anyone holding a form's upload secret can add its certificates for an hour | Only the sender has it; the files can only be added, at most two per pet | By design |
| A pet that overstays does not hold its kennel past its end date unless someone presses Extend to today | Someone else could be booked into that kennel while the pet is still there. Today, the booking page and the calendar show it in red, and Extend to today is one tap. | Revisit with the owner (open question in `HANDOFF.md`) |
| Sign-up is open | Anyone can create an account and a kennel on a shared installation (limit of five kennels each) | Acceptable for now; revisit when a public instance exists |
| An inviter can tell whether an email has an account | The message is the same either way, but a pending row appears on People only when the account exists. With open sign-up, anyone can test any email this way. | Invitation links (M6) need no lookup; the email invitation stays for people who already have an account. Remove it if this matters more than the convenience. |
| An invitation link works for whoever holds it | A forwarded link lets someone else join, once, in its role, within seven days | Send it to one person; withdraw it from People if it went astray; suspend or remove the wrong person. The person's name and role show on People as soon as they join. |
| Capacity is not enforced until a kennel exists | With no kennels in service, the count rule is off (Today warns). Taking a kennel out of service does not recheck bookings already made. | M2: warn when taking a kennel out of service would overfill a day |
| Two race fixes are tested only against a real Postgres | Review numbers 6 and 16: `scripts/race-checks.sh` needs the local Supabase, so it is not part of `npm run check` | Run it after changing invoices or memberships |
| Two-step sign-in is optional; recovery codes let a session in but do not remove the lost phone | A person without it can be reached with a stolen password; a person who loses their phone and their codes needs an administrator, and one who uses a code needs the administrator to set up a new phone | Owners see a reminder; recovery codes (D43); recovery by the administrator is documented in `10` |
| Erasing a parent leaves backups, merged duplicates, bill line descriptions and payment notes | See "Privacy" | Backups age out; erase a merged duplicate too |
| Links can be forwarded | Whoever has a stay link can see that stay | By design; kept minimal and expiring |
| Copies of Today and Care stay on a phone for offline use | Whoever holds the phone, still signed in or not, can open the last copy (pet names, parents' phone numbers) with no connection | The copy is replaced on every visit and forgotten when the sign-in page opens. A shared phone should sign out at the end of a shift. |
| A care task ticked offline is recorded at the time it reached the database | The history shows the sync time, not the time of the tap | By design: the database stamps who and when, and a phone's clock is not trusted |
| Backups are whatever the Supabase plan provides | The free plan has no automatic backups | See [10-setup-and-deploy.md](10-setup-and-deploy.md) |

## Checklist for any change that touches data

- [ ] New table: RLS on, policies, grants, `forbid_org_change`, composite foreign keys.
- [ ] New function: `set search_path = ''`, execute revoked from `public` and `anon`, granted only where needed.
- [ ] `security definer` only with a reason in the comment and its own permission check inside.
- [ ] Nothing new for `anon` unless this page and the pinned list in the test are updated.
- [ ] A test proves another kennel cannot read or write it.
- [ ] A test proves staff cannot do the manager-only part.
- [ ] No secret added to the app.
