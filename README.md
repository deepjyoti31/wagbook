# Wagbook

The register for a pet boarding kennel, on a phone. Free and open source.

Wagbook is for the person who runs a kennel with a notebook, a WhatsApp group and a memory. It answers the questions that
come up twenty times a day: who is arriving, who is in which kennel, has Bruno eaten, has this stay been paid for. It is
built for India first (UPI, GST, WhatsApp, lakh and crore) and works anywhere.

It is built by a kennel for its own daily use, so it has to work on a cheap phone, in a noisy yard, with one hand.

> Status: every planned feature is built and tested, in a real browser at phone width against a local Supabase. It
> has not yet run on a hosted Supabase project or on a real phone. Read [docs/HANDOFF.md](docs/HANDOFF.md) for exactly
> what is verified and what is not.

## What it does

- **Bookings** for boarding and day boarding. Two pets can never share a kennel on the same night, and a kennel never
  takes more pets than it has kennels. The database enforces both, so no screen can get it wrong. Families, requests,
  peak periods, a calendar.
- **Today**: who arrives, who is in, who goes home, what care is still to do. Check-in with a checklist.
- **The care round**: meals, medicines, cleaning and walks in one tap each, safe to tap twice, and kept on the phone
  when the connection drops. Solo play planned yard by yard.
- **Parents never need an account.** A form they fill in themselves (food, health, vaccination card), a private page
  per stay with updates and photos, and messages and pay links that open in the kennel's own WhatsApp and the parent's
  own UPI app. No gateway, no fees, no API keys.
- **Money**: bills with GST or no tax and numbers that follow on, a UPI QR code, payments and advances, expenses with
  receipts, reports and downloads for the accountant.
- **People**: invite the team by link, owners, managers and staff, and a history of who changed what.
- **Privacy and safety**: download or erase a parent's details on request, two-step sign-in enforced by the database,
  rate limits, and a strict Content Security Policy.
- **English, Hindi and Kannada**, each person choosing their own.

[The guide for kennel owners](docs/17-guide-for-kennel-owners.md) shows it with pictures.

## What it is built with

| Part | Choice | Why |
| --- | --- | --- |
| Web app | Next.js 16 (App Router), React 19, TypeScript | One codebase for phone and desktop, installable from the browser. |
| Database, sign-in, files | Supabase (Postgres) | Relational, open source, self-hostable, has a Mumbai region. See [docs/09-decisions.md](docs/09-decisions.md). |
| Styling | Tailwind CSS 4 | Small, no component library to learn. |
| Tests | Vitest, PGlite | The whole database is tested in-process. No Docker, no account. |

## Run it

You need Node.js 22 or newer and a free Supabase project. The full walk-through, with every click, is
[docs/10-setup-and-deploy.md](docs/10-setup-and-deploy.md); to run everything on your own server with Docker, see
[docs/14-self-hosting.md](docs/14-self-hosting.md). The short version:

```bash
npm install
cp .env.example .env.local      # then fill in the two Supabase values
npm run dev                     # http://localhost:3000
```

Without the Supabase values the app still starts; signing in then takes you to a setup page saying what is missing.

To check everything without any account at all:

```bash
npm run check                   # lint, types, every unit and database test, production build
```

## Find your way around

| If you want to | Read |
| --- | --- |
| Know what state the project is in | [docs/HANDOFF.md](docs/HANDOFF.md) |
| Understand why it exists and what it will never do | [docs/01-vision-and-principles.md](docs/01-vision-and-principles.md) |
| See every feature, built or planned | [docs/02-product-spec.md](docs/02-product-spec.md) |
| Understand the code | [docs/03-architecture.md](docs/03-architecture.md) |
| Understand the data | [docs/04-data-model.md](docs/04-data-model.md) and [docs/reference/schema.md](docs/reference/schema.md) |
| Pick up the next piece of work | [docs/08-roadmap.md](docs/08-roadmap.md) |
| Work on it with Claude Code | [CLAUDE.md](CLAUDE.md) and [docs/11-working-with-claude-code.md](docs/11-working-with-claude-code.md) |
| Run it for a kennel | [docs/17-guide-for-kennel-owners.md](docs/17-guide-for-kennel-owners.md), [docs/15-backup-and-restore.md](docs/15-backup-and-restore.md), [docs/16-releasing.md](docs/16-releasing.md) |
| Contribute | [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [CHANGELOG.md](CHANGELOG.md) |

## Licence

[GNU Affero General Public License v3.0 or later](LICENSE). You may use, change and host Wagbook for free, including for a
business. If you offer a changed version to other people over a network, you must share your changes under the same
licence. The reasoning is in [docs/09-decisions.md](docs/09-decisions.md).

Wagbook is not accounting, tax or legal advice. The GST and data protection features are tools; check with your own
accountant before relying on them.
