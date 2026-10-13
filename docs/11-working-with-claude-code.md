# 11. Working on Wagbook with Claude Code

Wagbook is built to be continued by Claude Code sessions, on your own machine or in the cloud, with a person reviewing.
This page explains how the repository is prepared for that, how to set up a cloud environment, and how to ask for
work so that it comes back right.

Claude Code's features change. Where this page describes the product rather than this repository, check the current
documentation at [code.claude.com/docs](https://code.claude.com/docs).

## How the repository is prepared

| Thing | What it does |
| --- | --- |
| `CLAUDE.md` | Read automatically at the start of every session. The rules, the commands, the definition of done. |
| `AGENTS.md` | Written by Next.js. Tells agents to read the bundled Next.js docs. Imported by `CLAUDE.md`. |
| `docs/HANDOFF.md` | The current state. Every session reads it first and rewrites it last. |
| `docs/08-roadmap.md` | Work cut into session-sized milestones with acceptance criteria. |
| `.claude/settings.json` | A SessionStart hook that installs dependencies in a fresh cloud session. |
| `scripts/cloud-session-start.sh` | The hook's script. Does nothing on your own machine. |
| `npm run check` | One command that says whether the work is acceptable. Needs no network, Docker or account. |
| Database tests with PGlite | The rules can be tested inside the session, with no Supabase project. |
| Generated types and docs | An agent cannot forget to update them: a test fails. |
| `npm run check:dash` | House style, enforced. |

The most important design choice is in the last four rows: **a session can prove its own work**. Ask for the proof.

## Setting up a cloud environment

A Claude Code cloud session starts a fresh virtual machine, clones your repository from GitHub, and works there. So
the code must be on GitHub first.

### One time

1. Push this repository to GitHub (private is fine).
2. Connect GitHub to Claude and give it access to the repository.
3. Create a cloud environment for the repository. Settings that matter:

   **Network access.** The default level allows package registries and GitHub, which is all `npm run check` needs.
   Leave it at the default for most work.

   For milestone M1 and anything else that must reach your Supabase project, the session needs to reach
   `YOUR-PROJECT-REF.supabase.co`, which the default level does not allow. Use a custom allow list and add that one
   host (or `*.supabase.co`). Prefer a separate environment for this, used only when needed.

   **Environment variables.** Assume anything you put here can be read by anyone who can use the environment, and by
   the session itself. So:

   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: fine. They are public by design.
   - The database password, the service role key, a personal access token: **never**. Wagbook does not need them. If
     migrations need applying to the real project, a person runs `supabase db push` on their own machine after
     reviewing the pull request.

   **Setup script.** Not needed. The SessionStart hook runs `npm ci` when `node_modules` is missing. If you prefer the
   environment's own setup script (it is cached between sessions when quick), use:

   ```bash
   npm ci --no-audit --no-fund
   ```

### A separate Supabase project for development

Do not point cloud sessions at the project your kennel runs on. Create a second free project called something like
`wagbook-dev`, apply the same migrations, and use its URL and publishable key in the cloud environment. Sessions can
then sign up test accounts and create invented kennels without touching real parents' data.

Even the publishable key deserves this care: with sign-up open, a session can create accounts and data in whatever
project it points at.

## Starting a session

Say which milestone, and say what proof you want. The repository does the rest.

### A milestone

```
Read CLAUDE.md and docs/HANDOFF.md. Then do milestone M2 from docs/08-roadmap.md, items 1 and 2 only
(the booking page, and extras).

Work on a branch called m2-booking-page. Before you finish:
- npm run check must pass; paste the last lines of its output.
- Take a screenshot of each new screen at 360 pixels wide.
- Update docs/02-product-spec.md, docs/08-roadmap.md and docs/HANDOFF.md.
- Open a pull request describing what you built, what you verified and what you could not verify.
```

### A bug

```
Read CLAUDE.md. Bug: [what you did, what happened, what should have happened].

First write a test that fails because of the bug. Then fix it. Show me the test failing before and passing after.
Do not change anything unrelated.
```

### A database change

```
Read CLAUDE.md and docs/04-data-model.md. I need [the kennel situation in plain words].

Propose the table or rule change first and wait for my reply. Check "Migration freeze" in docs/HANDOFF.md to see
whether to edit an existing migration or add a new one.
```

### A review

```
You are reviewing, not building. Read docs/05-security-and-privacy.md. Then read the diff of this branch against main
and try to break promises 1 to 7 on that page. For each problem: how to reproduce it, as a failing test in tests/db/
if possible. Do not fix anything.
```

Use a fresh session for reviews. A session that wrote the code is a poor judge of it.

## What works well

- **One milestone, or part of one, per session.** The roadmap is cut for this. "Do M2 and M3" comes back half done.
- **Ask for evidence.** Test output, screenshots, the exact commands run. "It should work" is not evidence.
- **Keep `HANDOFF.md` honest.** If a screen was not looked at in a browser, it must say so. The next session will
  believe whatever is written there.
- **Let it read the Next.js docs.** They ship in `node_modules/next/dist/docs/`. Version 16 differs from older
  examples, and a session that skips this step writes code for the wrong version.
- **Review migrations yourself.** Read every changed line in `supabase/migrations/` before merging. That folder is the
  security boundary.
- **Small pull requests.** Easier to review, easier to undo.

## What goes wrong, and the cure

| Symptom | Cause | Cure |
| --- | --- | --- |
| Build fails with a message about data outside Suspense | Request-time data read at the top of a page | Move it into an async child inside `<Suspense>` (see `03-architecture.md`) |
| A `"use server"` file fails to build | It exports something that is not an async function | Move constants to `src/lib/` |
| The type of a Supabase result is an error string | The select string was built by joining pieces | Write it as one string literal |
| `generated.test.ts` fails | A migration changed and `npm run gen:db` was not run | Run it, commit the result |
| A test passes that should fail | Nested `as()` calls reset the role | Arrange data first, act second |
| An update "succeeds" but nothing changed | Row level security filtered the row; Postgres reports zero rows, not an error | Select the id back and check the count |
| Old Next.js patterns (`middleware.ts`, synchronous `params`, `getServerSideProps`) | Written from memory | Point at the bundled docs and `AGENTS.md` |
| The session cannot reach Supabase | Network allow list | Custom network access with the project's host |
| Em dashes in copy | Habit | `npm run check:dash` fails the gate |

## Working locally instead

Everything above applies on your own machine with `claude` in the repository folder. The SessionStart hook does
nothing there. Locally you can also run `npm run dev` beside the session and look at the screens yourself, which is
the best review there is.

## Limits to keep in mind

- A cloud session's machine is temporary. Anything not pushed to a branch is gone when it ends.
- A session can run a browser inside its machine and take screenshots of public pages and, with a dev project
  reachable, signed-in ones. It cannot receive a confirmation email. For signed-in flows on the dev project, either
  turn email confirmation off there, or create the test accounts yourself and give the session a throwaway password
  in the prompt (never a real one).
- A session will do what the documents say. If a document is wrong, the work will be wrong in the same way. Fixing the
  document is part of fixing the bug.
