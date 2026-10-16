#!/usr/bin/env bash
# Puts the public demo back as it was: the invented kennel of
# supabase/seed.sql, no files, no accounts but the three demo ones.
# Run nightly on the demo server (docs/14-self-hosting.md, "The public demo"):
#
#   30 21 * * *  /srv/wagbook/deploy/demo-reset.sh >> /var/log/wagbook-demo-reset.log 2>&1
#
# (21:30 UTC is 03:00 in India.) NEVER point this at a real kennel's database.
#
# Needs: DEMO_DB_URL (the demo database's connection string, as postgres),
# SUPABASE_DIR (the folder of Supabase's self-hosting compose files).
set -euo pipefail
: "${DEMO_DB_URL:?set DEMO_DB_URL}"
: "${SUPABASE_DIR:?set SUPABASE_DIR}"
cd "$(dirname "$0")/.."

# A last guard: every night wipes visitors' kennels, so a kennel other than
# the demo that is days old means this is not the demo database.
real=$(psql "$DEMO_DB_URL" -At -c "select count(*) from public.organizations where slug <> 'demo' and created_at < now() - interval '3 days'")
if [ "$real" != "0" ]; then
  echo "$(date -u +%FT%TZ) refusing: this database has $real kennels older than three days. It is not the demo."
  exit 1
fi

echo "$(date -u +%FT%TZ) resetting the demo"
# Every kennel (the demo's and any a visitor made), then every account, so that
# nothing a visitor did survives: their own accounts, and any password or
# two-step factor they set on the demo ones. The seed makes the demo ones again.
psql "$DEMO_DB_URL" -v ON_ERROR_STOP=1 -q -c "delete from public.organizations" -c "delete from auth.users"
# Photos and certificates visitors added. The files first, then their rows go with the reset.
rm -rf "$SUPABASE_DIR/volumes/storage/stub/stub/pet-media"
psql "$DEMO_DB_URL" -v ON_ERROR_STOP=1 -q -c "delete from storage.objects where bucket_id = 'pet-media'" || true
# The database, back to the migrations and supabase/seed.sql.
npx -y supabase@2.120.0 db reset --db-url "$DEMO_DB_URL"
echo "$(date -u +%FT%TZ) done"
