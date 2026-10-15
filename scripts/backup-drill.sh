#!/usr/bin/env bash
# The backup and restore drill (roadmap M9), against the local Supabase from
# `npx -y supabase@2.120.0 start`. See docs/15-backup-and-restore.md.
#
#   1. Back up the whole database (public, auth and storage schemas) with
#      pg_dump, and the files of the pet-media bucket.
#   2. Restore the database into a new, empty database next to it.
#   3. Check that every table has the same rows, that invoice numbering would
#      carry on where it stopped, and that every file named in the database is
#      in the copy of the files.
#   4. Remove the copy.
#
# It changes nothing in the running database. Needs Docker; no keys.
set -euo pipefail

DB=supabase_db_wagbook
STORAGE=supabase_storage_wagbook
WORK="${TMPDIR:-/tmp}/wagbook-drill"
rm -rf "$WORK" && mkdir -p "$WORK"

psql_in() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -At "$@"; }

echo "1. Backing up the database and the files"
docker exec "$DB" pg_dump -U postgres -Fc --dbname postgres -f /tmp/wagbook-drill.dump
docker cp "$DB:/tmp/wagbook-drill.dump" "$WORK/database.dump"
docker cp "$STORAGE:/mnt/stub/stub/pet-media" "$WORK/pet-media" 2>/dev/null || mkdir -p "$WORK/pet-media"
echo "   database: $(du -h "$WORK/database.dump" | cut -f1), files: $(find "$WORK/pet-media" -type f | wc -l)"

echo "2. Restoring into an empty database"
psql_in -d postgres -c "drop database if exists wagbook_drill" >/dev/null
psql_in -d postgres -c "create database wagbook_drill" >/dev/null
# Supabase's own extensions and roles already exist in the cluster; errors
# about objects that are already there are expected and listed, not fatal.
docker exec "$DB" pg_restore -U postgres --dbname wagbook_drill --no-owner --role=postgres /tmp/wagbook-drill.dump 2> "$WORK/restore-warnings.txt" || true
echo "   restore notes: $(grep -c 'error' "$WORK/restore-warnings.txt" || true) (see $WORK/restore-warnings.txt)"

echo "3. Comparing"
tables=$(psql_in -d postgres -c "select format('%I.%I', table_schema, table_name) from information_schema.tables
  where table_type = 'BASE TABLE' and table_schema in ('public', 'auth', 'storage') order by 1")
failed=0
for t in $tables; do
  a=$(psql_in -d postgres -c "select count(*) from $t")
  b=$(psql_in -d wagbook_drill -c "select count(*) from $t" 2>/dev/null || echo "missing")
  if [ "$a" != "$b" ]; then echo "   DIFFERENT: $t has $a rows, the copy $b"; failed=1; fi
done
echo "   $(echo "$tables" | wc -w) tables compared"

q="select coalesce(string_agg(org_id || ':' || fiscal_year || ':' || last_seq, ',' order by org_id, fiscal_year), '') from public.invoice_counters"
if [ "$(psql_in -d postgres -c "$q")" != "$(psql_in -d wagbook_drill -c "$q")" ]; then
  echo "   DIFFERENT: invoice numbering"; failed=1
else
  echo "   invoice numbering carries on where it stopped"
fi

# The rules matter as much as the rows: policies, row level security, and who may run what.
for check in \
  "select count(*) || ' policies' from pg_policies where schemaname in ('public', 'storage')" \
  "select count(*) || ' tables with row level security' from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relrowsecurity" \
  "select count(*) || ' functions anon may run' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')" \
  "select count(*) || ' triggers' from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal"; do
  a=$(psql_in -d postgres -c "$check"); b=$(psql_in -d wagbook_drill -c "$check")
  if [ "$a" != "$b" ]; then echo "   DIFFERENT: $a, the copy $b"; failed=1; else echo "   same: $a"; fi
done

missing=0
for f in $(psql_in -d postgres -c "select name from storage.objects where bucket_id = 'pet-media'"); do
  [ -e "$WORK/pet-media/$f" ] || { echo "   MISSING FILE: $f"; missing=1; }
done
[ "$missing" = 0 ] && echo "   every file named in the database is in the copy of the files" || failed=1

echo "4. Removing the copy"
psql_in -d postgres -c "drop database wagbook_drill" >/dev/null
docker exec "$DB" rm -f /tmp/wagbook-drill.dump

if [ "$failed" = 0 ]; then echo "Drill passed."; else echo "Drill FAILED."; exit 1; fi
