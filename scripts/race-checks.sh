#!/usr/bin/env bash
# Two races that the in-process test database cannot stage, because they need
# two connections at once (docs/05-security-and-privacy.md, review numbers 6
# and 16). Run against the local Supabase after `npm run test:e2e` or
# `npx supabase db reset` (it uses the demo kennel from supabase/seed.sql,
# and leaves it as it found it apart from one issued test bill).
#
#   16  Two owners demote each other at the same moment: one must be refused.
#    6  A line is added to a bill while it is being issued: it must be refused.
set -euo pipefail

DB=supabase_db_wagbook
ORG=$(docker exec "$DB" psql -U postgres -At -c "select id from public.organizations where slug = 'demo'")
A=d0000000-0000-4000-8000-000000000001   # owner@demo.wagbook.test
B=d0000000-0000-4000-8000-000000000002   # manager@demo.wagbook.test, made an owner for the test
as_user() { printf "begin;\nset local role authenticated;\nselect set_config('request.jwt.claim.sub', '%s', true);\n" "$1"; }
run() { docker exec -i "$DB" psql -U postgres -At 2>&1; }
failed=0

echo "16. Two owners demote each other at once"
docker exec "$DB" psql -U postgres -Atq -c "update public.memberships set role = 'owner' where user_id = '$B' and org_id = '$ORG'"
{ as_user "$A"; echo "update public.memberships set role = 'staff' where user_id = '$B' and org_id = '$ORG'; select pg_sleep(2); commit;"; } | run > /dev/null &
sleep 0.5
second=$({ as_user "$B"; echo "update public.memberships set role = 'staff' where user_id = '$A' and org_id = '$ORG'; commit;"; } | run)
wait
owners=$(docker exec "$DB" psql -U postgres -At -c "select count(*) from public.memberships where org_id = '$ORG' and role = 'owner' and is_active")
if echo "$second" | grep -q WB011 && [ "$owners" = 1 ]; then echo "   held: the second was refused (WB011), one owner left"; else echo "   BROKEN: $second, owners: $owners"; failed=1; fi
docker exec "$DB" psql -U postgres -Atq -c "update public.memberships set role = 'owner' where user_id = '$A' and org_id = '$ORG'; update public.memberships set role = 'manager' where user_id = '$B' and org_id = '$ORG'"

echo "6. A line slipped into a bill while it is issued"
INV=$({ as_user "$A"; cat <<SQL
with c as (select id from public.clients where org_id = '$ORG' and deleted_at is null limit 1)
insert into public.invoices (org_id, client_id) select '$ORG', id from c returning id \gset
select public.save_invoice_draft(:'id',
  '{"subtotal_minor":100000,"discount_minor":0,"taxable_minor":100000,"cgst_minor":0,"sgst_minor":0,"igst_minor":0,"tax_minor":0,"round_off_minor":0,"total_minor":100000}',
  '[{"sort_order":0,"description":"Race check","sac_code":null,"quantity":1,"unit_price_minor":100000,"discount_minor":0,"taxable_minor":100000,"tax_rate_bp":0,"cgst_minor":0,"sgst_minor":0,"igst_minor":0,"tax_minor":0,"total_minor":100000}]') \g /dev/null
commit;
select :'id';
SQL
} | run | tail -1)
{ as_user "$A"; echo "select public.issue_invoice('$INV') \\g /dev/null"; echo "select pg_sleep(2); commit;"; } | run > /dev/null &
sleep 0.5
second=$({ as_user "$A"; echo "insert into public.invoice_lines (org_id, invoice_id, sort_order, description, quantity, unit_price_minor, discount_minor, taxable_minor, tax_rate_bp, cgst_minor, sgst_minor, igst_minor, tax_minor, total_minor) values ('$ORG', '$INV', 1, 'Slipped in', 1, 50000, 0, 50000, 0, 0, 0, 0, 0, 50000); commit;"; } | run)
wait
lines=$(docker exec "$DB" psql -U postgres -At -c "select count(*) from public.invoice_lines where invoice_id = '$INV'")
if echo "$second" | grep -q WB032 && [ "$lines" = 1 ]; then echo "   held: the line was refused (WB032), the bill has its one line"; else echo "   BROKEN: $second, lines: $lines"; failed=1; fi

if [ "$failed" = 0 ]; then echo "Both races held."; else exit 1; fi
