# 16. Releasing

How a version of Wagbook is made, and what someone running it does to update. Releases are for people who run their
own copy; the code on `main` is always meant to work, but a release says "this set of changes belongs together, and
here is what to do".

## Version numbers

`MAJOR.MINOR.PATCH`, as in `package.json`.

- **PATCH** (0.1.1): fixes only. No database changes, nothing to do but deploy.
- **MINOR** (0.2.0): new features, and possibly new migrations. Apply them, then deploy.
- **MAJOR** (1.0.0): something an installation must do by hand beyond applying migrations (a setting, a data step),
  spelled out in the changelog. Before 1.0.0, MINOR may do this too, and the changelog says so.

## Making a release

From an up-to-date `main`, on a branch:

1. **The gate.** `npm run check` passes. With Docker: `npm run test:e2e`, `bash scripts/race-checks.sh` and
   `bash scripts/backup-drill.sh` pass against the local Supabase.
2. **Migrations.** After the migration freeze (`HANDOFF.md`), every database change is a new timestamped file; no
   applied file has changed (`git diff <last tag> -- supabase/migrations` shows only added files). Try them on a copy of
   a real database (a restore from [15-backup-and-restore.md](15-backup-and-restore.md)) before tagging.
3. **The changelog.** Rename "Not released yet" in `CHANGELOG.md` to the version and date
   (`## 0.2.0, 3 January 2027`), and start a new empty "Not released yet" above it. Write each line for a kennel
   owner: what they can do now, not which file changed. End with "Database changes": the new migration files, or
   "None".
4. **The version.** Set it in `package.json` (`npm version 0.2.0 --no-git-tag-version`, which also updates the lock
   file).
5. **Merge, then tag** the merge commit on `main`: `git tag -a v0.2.0 -m "Wagbook 0.2.0"` and push the tag.
6. **The GitHub release.** Create it from the tag, with that version's changelog section as its text.

Never put a parent's details, a real kennel's name or a key in a changelog, a tag message or a release.

## Updating an installation

Read the changelog from your version to the new one first.

- **Vercel and hosted Supabase:** `npx supabase db push` (applies new migrations to the linked project), then let
  Vercel deploy the new commit. Migrations first, always: an app that expects a column the database lacks fails;
  a database with a column the old app ignores does not.
- **Your own server (Docker Compose):** take a backup ([15-backup-and-restore.md](15-backup-and-restore.md)), then

  ```bash
  git fetch --tags && git checkout v0.2.0
  npx -y supabase@2.120.0 db push --db-url "$DB_URL"
  docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
  ```

If an update goes wrong, deploy the previous tag of the app. A migration is not undone by that; restore the backup you
took if the database must go back too.

## Security fixes

A fix for something reported privately (`SECURITY.md`) is released as a PATCH as soon as it is ready, with a
changelog line that says what kind of problem it was and who should update, without a recipe for using it. The
details go in the review log of [05-security-and-privacy.md](05-security-and-privacy.md) after installations have had
time to update.
