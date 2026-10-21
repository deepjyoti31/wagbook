# Changelog

What changed in each release of Wagbook, newest first, in words a kennel owner can follow. Each release also says
whether it brings database changes: apply them before deploying the app that expects them (see
[docs/16-releasing.md](docs/16-releasing.md)).

## Not released yet

The first release will be 0.1.0. Everything below is in it.

### For the kennel

- Bookings for boarding and day boarding, with no double booking and no overfilling, enforced by the database.
  Families booked together, requests, peak periods, a calendar, extras and prices.
- Only an owner can delete anything (an expense with its receipt, a draft bill, an extra, a person, a parent's
  details), and every deletion asks "Yes, delete it" first.
- Two pets of one parent can share a kennel, the second at a shared kennel price you set; never three, and never pets
  of different parents. Pets booked together are billed together on one bill, and siblings play together.
- Today: arrivals, pets in house, check-outs, overstays, incidents to deal with. Check-in with a checklist.
- The care round (meals, medicines, walks) in one tap, safe to tap twice, and ticks made offline sent later. Solo play
  planned yard by yard.
- Photos and updates the parent sees on their own stay page, cleaned of location data.
- Bills with GST or no tax, consecutive numbers, a UPI QR code, printing, payments and advances.
- Pets and parents with vaccinations and warnings, incidents, search, merging duplicates.
- People: invite by link or email, roles, suspend and restore.
- Reports, expenses with receipts, CSV downloads, and the history of changes.
- English, Hindi and Kannada (the Hindi and Kannada are drafts until native speakers check them).
- The intake form parents fill in themselves, now with a vaccination certificate per pet.
- A parent's details: download everything held about them, and erase it on request, keeping only what tax law needs.
- Two-step sign-in with an authenticator app, enforced by the database.
- Bills say what really happened: a sibling who leaves early pays for their own nights, and a stay that turns from day
  boarding into boarding charges day prices for the days and night prices for the nights. Bills are in English, with
  the parent's language in brackets when they ask for it.
- Only an owner or manager can change a parent's phone number. Erasing a parent's details keeps their pets' records.
- Credit notes for a bill already sent, numbered in their own series, and the kennel's own tax rate and service code
  on each price.
- Reminders to send on Today (vaccinations due, arrivals, pick-ups, unpaid bills), each one tap to WhatsApp.
- Each parent gets a booking link to ask for a stay for their own pets. Requests wait on Today until someone confirms
  them, and the kennel can turn the link off.
- Day boarding regulars: days that repeat each week, and packs of days bought up front that a day is paid from.
- GSTR-1 files for the month (b2b, b2cl, b2cs, credit notes, HSN and documents) for a GST-registered kennel to hand
  its accountant.

### For whoever runs it

- Limits on how often one address may sign in or send forms, and a Content Security Policy with a fresh nonce for
  every page.
- Running it on your own server with Docker Compose, Caddy and Supabase's self-hosting setup
  ([docs/14-self-hosting.md](docs/14-self-hosting.md)).
- Trying it on your own computer with a local Supabase and an invented kennel: `npm run setup:local` (see the
  README).
- A backup and restore drill ([docs/15-backup-and-restore.md](docs/15-backup-and-restore.md)).

### Database changes

All of them: this is the first release. Apply every file in `supabase/migrations`.
