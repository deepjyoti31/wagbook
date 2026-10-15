# 15. Backup and restore

A kennel's bookings, bills and parents' details live in one Supabase project: a Postgres database and a Storage
bucket (`pet-media`) of photos and certificates. This page says how to copy both, how to bring them back, and how to
practise that so it works on the day it is needed.

Backups contain parents' phone numbers, addresses and pets' medical notes. Keep them encrypted, somewhere only the
owner can reach, and delete old ones on a schedule. A parent erased on request (`erase_client`) is still in backups
made before the erasure until those age out; say so in your privacy notice.

## What there is to copy

| Part | Where | Copied by |
| --- | --- | --- |
| Bookings, parents, pets, bills, payments, history | Database, schema `public` | A database dump |
| Accounts and passwords (hashed), two-step sign-in factors | Database, schema `auth` | The same dump |
| Which files exist and who may read them | Database, schema `storage` | The same dump |
| The photos and certificates themselves | Storage, bucket `pet-media` | Downloading the bucket |
| The app | Your Git repository | Git |

Supabase's paid plans take a daily backup of the database by themselves (Database, Backups in the dashboard). They do
not include Storage files. The free plan has none. Whatever the plan, take your own copies too.

## Taking a backup (hosted Supabase)

You need the Supabase CLI and the database connection string (Project settings, Database, Connection string, the
"Session pooler" one; it contains the database password). Never put that string in the repository.

```bash
export DB_URL='postgresql://postgres.xxxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
day=$(date +%F)
npx -y supabase@2.120.0 db dump --db-url "$DB_URL" --role-only -f "roles-$day.sql"
npx -y supabase@2.120.0 db dump --db-url "$DB_URL" -f "schema-$day.sql"
npx -y supabase@2.120.0 db dump --db-url "$DB_URL" --use-copy --data-only -f "data-$day.sql"
```

Then the files. Sign the CLI in to your account (`npx supabase login`, which opens a browser; this is the owner's own
login, not a key the app uses), link the project once (`npx supabase link`), and copy the bucket:

```bash
npx -y supabase@2.120.0 storage cp -r ss:///pet-media "pet-media-$day" --experimental
```

Keep the four together. A copy that has the database but not the files still has every booking and bill; the pets'
photos and certificates are what would be missing.

How often: a kennel in daily use should copy the database at least weekly, and before every update of Wagbook. The
files change less; monthly is usually enough.

## Restoring

Into a **new, empty** Supabase project in the same region (never over the one you are copying from, until you have
checked the copy):

```bash
export NEW_DB_URL='postgresql://postgres.yyyy:PASSWORD@...:5432/postgres'
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "roles-$day.sql" --file "schema-$day.sql" \
  --command 'SET session_replication_role = replica' \
  --file "data-$day.sql" \
  --dbname "$NEW_DB_URL"
npx -y supabase@2.120.0 link --project-ref yyyy
npx -y supabase@2.120.0 storage cp -r "pet-media-$day" ss:///pet-media --experimental
```

`session_replication_role = replica` stops Wagbook's triggers from running while rows are put back, so issued bills,
"who and when" stamps and the history of changes come back exactly as they were, rather than being stamped again.

Then:

1. In the new project, set the Site URL, Redirect URLs, email template and rate limits as in
   [10-setup-and-deploy.md](10-setup-and-deploy.md), Part 1. Those settings are not in the database.
2. Point the app at the new project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) and redeploy.
3. Sign in, open Today, a bill, a parent's stay page and a pet's photo. Issue a test bill on a test booking and check
   its number follows the last real one; then cancel it.

People keep their passwords and two-step sign-in, because both are in the `auth` schema. Parents' links keep working,
because their secrets are in the bookings and bills.

## The drill

Practise before it is needed. `scripts/backup-drill.sh` does the whole round trip against the local Supabase
(`npx -y supabase@2.120.0 start`, needs Docker), without touching the running database:

1. backs up the whole database with `pg_dump` (schemas `public`, `auth` and `storage`), and copies the files of the
   `pet-media` bucket;
2. restores the dump into a new, empty database beside it;
3. compares every table's rows; the invoice numbering (so the next bill would carry on from the last); the number of
   policies, tables with row level security, functions the anonymous role may run, and triggers; and that every file
   named in the database is in the copy of the files;
4. removes the copy.

```bash
bash scripts/backup-drill.sh
```

### Drill log

| Date | Where | Result |
| --- | --- | --- |
| 15 October 2026 | Local Supabase (Postgres 17, CLI 2.120.0), demo data after the full end-to-end walk | Passed. 61 tables identical; invoice numbering carried on; 90 policies, 24 tables with row level security, 6 public functions and 75 triggers the same; 14 files all present. pg_restore reported 30 errors, all about Supabase's own objects that already exist in a cluster (the `vault` schema, default privileges of Supabase's admin roles, grants on `pg_catalog` functions); none about Wagbook's tables. |

Add a line here every time the drill is run, and run it on the hosted project (restore into a spare project, as
above) at least once a year. **The hosted round trip has not been done yet**; it needs the owner's Supabase account
(see `HANDOFF.md`).
