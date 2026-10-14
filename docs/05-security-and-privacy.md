# 5. Security and privacy

Wagbook holds people's phone numbers and addresses, their pets' medical notes, and a kennel's income. Many kennels may
share one installation. This page says what is promised, how it is enforced, what has been checked, and what is not
promised.

## The promises

1. A kennel's data is visible only to that kennel's active members.
2. Someone who is not signed in can do exactly five things, and can read no table.
3. A parent's link shows one stay or one bill and nothing else, and a stay link opens only that stay's shared photos.
4. Staff cannot do what only managers may do, and managers cannot touch owners.
5. An issued invoice cannot be changed by anyone, including owners.
6. "Who did it and when" cannot be forged or backdated by the person doing it.
7. Changes to bookings, money, settings and people are recorded in a log nobody can edit.

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
In summary:

| Data | Staff | Manager | Owner |
| --- | --- | --- | --- |
| Clients, pets, vaccinations, bookings, booking items, care tasks, play sessions, updates, incidents | Read, add, edit (editing includes hiding a parent or pet by soft delete) | Also delete | Same as manager |
| The price of a booking or an extra | Book at price list prices only; no discount; no changes afterwards (D15) | Set and change anything | Same |
| A pet's own care routine | Read, add, edit | Also delete | Same |
| House routines, kennels, rate card, peak periods, play yards | Read | Add, edit, delete | Same |
| Kennel settings | Read | Edit | Also delete the kennel |
| Draft invoices and their lines | Read, add, edit; remove lines from a draft | Also delete whole drafts | Same |
| Issue an invoice | Only one whose lines are exactly what its booking says (`WB050`) | Any draft | Same |
| Files (photos, certificates) | Add; never replace or remove | Also replace and remove | Same |
| Void an invoice | No | Yes, with a reason | Yes |
| Payments received | Read, add | Also refunds, corrections, removal | Same |
| Expenses | Nothing | Everything | Everything |
| Forms from parents | Read; accept or decline, once | Also delete | Same |
| People | See colleagues | Invite and manage staff and managers | Also owners |
| Audit log | Nothing | Read | Read |

Some columns are not writable by anyone through the API, whatever their role, because column-level grants leave them
out: a booking's check-in and check-out stamps, its creator and its link token; an invoice's status, number, dates,
frozen seller and buyer, and void fields; a membership's organisation, user and acceptance; everything a parent sent
in an intake form, and who reviewed it.

## What someone who is not signed in can do

Five functions, and no table. `tests/db/security.test.ts` pins this list; adding to it fails the build until the test
is changed on purpose.

| Function | Returns | Guard |
| --- | --- | --- |
| `get_public_intake_form(slug)` | Kennel name, city, WhatsApp number, usual times, consent wording, and whether the form is switched on | None: returned for any link name that exists. Nothing here is private. |
| `submit_intake(slug, payload)` | Nothing useful | Refused when the form is switched off (`WB040`); size cap, shape checks, consent required, flood limits |
| `get_public_stay(token)` | One stay: kennel contact, pet name, dates, status, parent-visible updates, care counts | 64 character secret; dead when cancelled, and 30 days after check-out |
| `get_public_invoice(token)` | One issued or voided invoice with its lines, the total paid so far, and the UPI details frozen on it | 64 character secret; never a draft |
| `stay_media_visible(name)` | True or false: may this request read this file? Called by the storage policy `pet_media_select_for_stay`, not by pages | The stay token must arrive in the `x-wagbook-stay` request header and belong to a live stay; the file must be the stay's pet photo or a photo on one of its updates shown to the parent (or the small copy of one) |

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

Set in `next.config.ts` for every response:

| Header | Effect |
| --- | --- |
| `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` | Cannot be framed (no clickjacking); forms cannot post elsewhere |
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

Not built yet (milestone M9): exporting everything held about one parent, and erasing a parent on request while
keeping the invoices that tax law requires.

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

## Known limitations

These are real. Do not describe Wagbook as free of them.

| Limitation | Consequence | Plan |
| --- | --- | --- |
| The signed-in screens have not been exercised against a live Supabase project | PostgREST, real Auth and real Storage may behave differently from the in-process tests | Milestone M1, first |
| Intake flood limits are per kennel and per phone number, not per visitor | A determined attacker can fill a kennel's hourly quota and block real parents for that hour | M9: rate limiting at the edge, or a challenge |
| No script-src Content Security Policy | An injected script would run. React's escaping is the only defence. | M9: nonces |
| Server Actions accept bodies up to 12 MB | Needed for photos and certificates; any action, including the public intake form, can be sent that much | M9: limits at the edge |
| A photo replaced by a new one, or a draft's update that failed, can leave a file nobody points at | Storage use grows a little; staff cannot delete files by design | M7 or M8: a manager's clean-up |
| A photo sent without JavaScript is stored as taken (only its hidden data removed) | It may show sideways and is larger | Most phones run the page's JavaScript; the photo still works |
| The intake form does not take certificate uploads yet | Parents send certificates on WhatsApp; staff add them at check-in | M9, together with rate limits at the edge, because anonymous uploads would multiply the intake flood risk |
| A pet that overstays does not hold its kennel past its end date unless someone presses Extend to today | Someone else could be booked into that kennel while the pet is still there. Today, the booking page and the calendar show it in red, and Extend to today is one tap. | Revisit with the owner (open question in `HANDOFF.md`) |
| Sign-up is open | Anyone can create an account and a kennel on a shared installation (limit of five kennels each) | Acceptable for now; revisit when a public instance exists |
| An inviter can tell whether an email has an account | The message is the same either way, but a pending row appears on People only when the account exists. With open sign-up, anyone can test any email this way. | M6: invitations by link, which need no lookup |
| Capacity is not enforced until a kennel exists | With no kennels in service, the count rule is off (Today warns). Taking a kennel out of service does not recheck bookings already made. | M2: warn when taking a kennel out of service would overfill a day |
| Two race fixes have no automated test | See the review log, numbers 6 and 16 | M1: stage them against real Postgres with two connections |
| No two-factor sign-in | A stolen password is enough | Supabase supports it; M9 |
| Links can be forwarded | Whoever has a stay link can see that stay | By design; kept minimal and expiring |
| Backups are whatever the Supabase plan provides | The free plan has no automatic backups | See [10-setup-and-deploy.md](10-setup-and-deploy.md) |

## Checklist for any change that touches data

- [ ] New table: RLS on, policies, grants, `forbid_org_change`, composite foreign keys.
- [ ] New function: `set search_path = ''`, execute revoked from `public` and `anon`, granted only where needed.
- [ ] `security definer` only with a reason in the comment and its own permission check inside.
- [ ] Nothing new for `anon` unless this page and the pinned list in the test are updated.
- [ ] A test proves another kennel cannot read or write it.
- [ ] A test proves staff cannot do the manager-only part.
- [ ] No secret added to the app.
