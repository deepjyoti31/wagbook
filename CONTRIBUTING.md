# Contributing to Wagbook

Thank you for helping. Wagbook exists so that the smallest kennel can have software as good as the largest. Every
contribution is judged against that.

## Before you start

- Read [docs/01-vision-and-principles.md](docs/01-vision-and-principles.md). It lists what Wagbook will not do. A pull
  request that adds a payment gateway, a paid tier or a tracking script will be declined however good the code is.
- For anything larger than a bug fix, open an issue first and describe the kennel problem you are solving, in kennel
  words. "Staff forget evening medication" is a good issue. "Add a notifications microservice" is not.
- Look at [docs/08-roadmap.md](docs/08-roadmap.md). If your idea is a milestone already, say you are taking it.

## Set up

```bash
git clone <your fork>
cd wagbook
npm install
npm run check
```

That is all you need to work on the database rules and pure logic. To click through the screens you also need a Supabase
project: see [docs/10-setup-and-deploy.md](docs/10-setup-and-deploy.md).

## The rules

They are the same for people and for coding agents, and they are written once, in [CLAUDE.md](CLAUDE.md), under "Rules
that are not negotiable" and "Definition of done". Please read that section. The ones that catch people out:

- A new table needs row level security and policies, or the tests fail.
- Money is whole paise in a `bigint`. Never a float.
- Every query filters by `org_id`.
- Run `npm run gen:db` after changing a migration.
- Do not copy text, screens or code from other kennel software.

## Pull requests

- One change per pull request. Small is good.
- Say what you tested and how. If you changed a screen, attach a screenshot at phone width.
- `npm run check` must pass. CI runs it for you.
- Write commit messages as a sentence saying what changed for the user: "Refuse a kennel that is out of service".

## Reporting a security problem

Do not open a public issue. See [SECURITY.md](SECURITY.md). Say what you
did, what you saw, and what you expected. [docs/05-security-and-privacy.md](docs/05-security-and-privacy.md) describes
what Wagbook promises, so you can tell a bug from a known limitation.

## Translations

Wagbook's words are plain on purpose so they translate well. Translation support is on the roadmap (milestone M8). Until
it lands, please do not send translated copies of screens.

## Licence of contributions

By contributing you agree that your contribution is licensed under the same licence as the project,
[AGPL-3.0-or-later](LICENSE).
