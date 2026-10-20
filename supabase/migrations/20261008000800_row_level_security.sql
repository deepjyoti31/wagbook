-- =============================================================================
-- Wagbook 0008: row level security and privileges
--
-- This file is the whole access model. Read docs/05-security-and-privacy.md
-- alongside it.
--
--   anon (not signed in)   No table access at all. May call only the PUBLIC
--                          functions granted at the bottom of this file.
--   authenticated          May touch only rows of organisations they are an
--                          active member of. Role decides how much:
--     staff     daily operations: clients, pets, bookings, care, updates,
--               incidents, draft invoices, recording payments
--     manager   plus the rate card, kennels, settings, expenses, people,
--               voiding invoices, reading the audit log
--     owner     plus deleting things (the owner's decision, 19 October 2026:
--               D29), other owners and deleting the organisation
--
-- RULE: every new table must enable row level security and add its policies
-- in the same migration that creates it. tests/db/security.test.ts fails the
-- build if a table is left open.
-- =============================================================================

-- Start from nothing. Supabase grants broad default privileges on the public
-- schema; we take them away and grant back exactly what is intended.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
-- Postgres itself lets everyone (the PUBLIC pseudo-role) run a new function,
-- and a per-schema default cannot take that away. So:
-- RULE: every later migration that creates a function must end with
--   revoke all on function public.the_function(args) from public, anon;
-- followed by the grants it really needs.

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.clients enable row level security;
alter table public.pets enable row level security;
alter table public.vaccinations enable row level security;
alter table public.kennels enable row level security;
alter table public.services enable row level security;
alter table public.peak_periods enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.care_items enable row level security;
alter table public.care_tasks enable row level security;
alter table public.play_yards enable row level security;
alter table public.play_sessions enable row level security;
alter table public.stay_updates enable row level security;
alter table public.incidents enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.intake_submissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.invitation_links enable row level security;

-- ---------------------------------------------------------------------------
-- organizations
-- Created only through create_organization(). Members read; managers edit;
-- owners delete.
-- ---------------------------------------------------------------------------
grant select, update, delete on public.organizations to authenticated;

create policy organizations_select on public.organizations for select to authenticated
  using (id in (select public.my_org_ids()));
create policy organizations_update on public.organizations for update to authenticated
  using (id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  with check (id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy organizations_delete on public.organizations for delete to authenticated
  using (id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

-- ---------------------------------------------------------------------------
-- memberships
-- Everyone sees their colleagues, and their own rows (so a pending invitation
-- is visible to the person invited). Managers manage staff and managers; only
-- owners can change or remove an owner. People are added by invitation
-- (invite_member_by_email) and become active only by accepting
-- (respond_to_invitation), so there is no insert policy, and only the role,
-- name, phone and active flag can be written directly.
-- ---------------------------------------------------------------------------
grant select, delete on public.memberships to authenticated;
grant update (role, display_name, phone, is_active) on public.memberships to authenticated;

create policy memberships_select on public.memberships for select to authenticated
  using (org_id in (select public.my_org_ids()) or (user_id = (select auth.uid()) and (select public.session_meets_mfa())));
create policy memberships_update on public.memberships for update to authenticated
  using (
    org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[]))
    or (role <> 'owner' and org_id in (select public.my_org_ids_with_role(array['manager']::public.member_role[])))
  )
  with check (
    org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[]))
    or (role <> 'owner' and org_id in (select public.my_org_ids_with_role(array['manager']::public.member_role[])))
  );
-- Removing a person is a deletion, so it is for owners (D29).
create policy memberships_delete on public.memberships for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));
-- Anyone can leave an organisation. The last owner cannot (protect_last_owner).
create policy memberships_delete_self on public.memberships for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- invitation_links: owners and managers see their kennel's links and withdraw
-- them. Made only by create_invitation_link(), used only by
-- accept_invitation_link(), so there is no insert or delete.
-- ---------------------------------------------------------------------------
grant select on public.invitation_links to authenticated;
grant update (revoked_at) on public.invitation_links to authenticated;

create policy invitation_links_select on public.invitation_links for select to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy invitation_links_update on public.invitation_links for update to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));

-- ---------------------------------------------------------------------------
-- Daily operations: any member reads, adds and edits; managers delete.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'pets', 'vaccinations', 'bookings', 'booking_items',
    'care_tasks', 'play_sessions', 'stay_updates', 'incidents'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id in (select public.my_org_ids()))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (org_id in (select public.my_org_ids()))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (org_id in (select public.my_org_ids())) with check (org_id in (select public.my_org_ids()))',
      t || '_update', t);
    execute format(
'create policy %I on public.%I for delete to authenticated using (org_id in (select public.my_org_ids_with_role(array[''owner'']::public.member_role[])))',
      t || '_delete', t);
  end loop;
end;
$$;

-- Clients: only erase_client() marks a parent as erased. (org_id and
-- created_by stay writable so that their triggers, forbid_org_change and
-- stamp_actor, give their own answer.)
revoke insert, update on public.clients from authenticated;
grant insert (org_id, full_name, phone, alt_phone, email, address, city, postal_code, gst_state_code, tax_id,
              emergency_name, emergency_phone, notes, consent_at, consent_source, created_by, deleted_at)
  on public.clients to authenticated;
grant update (org_id, created_by, full_name, phone, alt_phone, email, address, city, postal_code, gst_state_code, tax_id,
              emergency_name, emergency_phone, notes, consent_at, consent_source, deleted_at)
  on public.clients to authenticated;

-- Bookings: the "who and when" stamps, the creator and the secret link token
-- are written only by the database, so they are not in the list of columns a
-- client may send.
revoke insert, update on public.bookings from authenticated;
grant insert (org_id, client_id, pet_id, kind, status, start_date, end_date, kennel_id, rate_minor, discount_minor,
              tax_rate_bp, sac_code, expected_arrival, expected_departure, cancel_reason, belongings, notes, source, group_id)
  on public.bookings to authenticated;
grant update (client_id, pet_id, kind, status, start_date, end_date, kennel_id, rate_minor, discount_minor,
              tax_rate_bp, sac_code, expected_arrival, expected_departure, cancel_reason, belongings, gate_notes,
              vaccinations_checked_at, notes, group_id)
  on public.bookings to authenticated;
-- Who may change a price is decided by a trigger, not here: owners, managers
-- and staff all sign in as the same role. See bookings_guard_price().

-- ---------------------------------------------------------------------------
-- Setup tables: any member reads; managers add, edit and delete.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['kennels', 'services', 'peak_periods', 'care_items', 'play_yards'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id in (select public.my_org_ids()))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (org_id in (select public.my_org_ids_with_role(array[''owner'', ''manager'']::public.member_role[])))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (org_id in (select public.my_org_ids_with_role(array[''owner'', ''manager'']::public.member_role[]))) with check (org_id in (select public.my_org_ids_with_role(array[''owner'', ''manager'']::public.member_role[])))',
      t || '_update', t);
    execute format(
'create policy %I on public.%I for delete to authenticated using (org_id in (select public.my_org_ids_with_role(array[''owner'']::public.member_role[])))',
      t || '_delete', t);
  end loop;
end;
$$;

-- Staff set up a pet's own routine (a tablet at 8) during check-in, so they
-- may add and edit care items that belong to a pet. House routines stay with
-- managers.
create policy care_items_insert_for_pet on public.care_items for insert to authenticated
  with check (pet_id is not null and org_id in (select public.my_org_ids()));
create policy care_items_update_for_pet on public.care_items for update to authenticated
  using (pet_id is not null and org_id in (select public.my_org_ids()))
  with check (pet_id is not null and org_id in (select public.my_org_ids()));

-- ---------------------------------------------------------------------------
-- invoices and their lines
-- Any member drafts and reads. Triggers freeze issued invoices; issuing and
-- voiding go through functions. Only drafts can be deleted (trigger), by
-- managers (policy).
-- ---------------------------------------------------------------------------
-- A client may write only the money and the notes of a draft. Status, number,
-- dates, the frozen seller and buyer, the void fields, the creator and the
-- secret link token belong to the database.
grant select, delete on public.invoices to authenticated;
grant insert (org_id, client_id, booking_id, group_id, place_of_supply_state_code, subtotal_minor, discount_minor, taxable_minor,
              cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor, notes)
  on public.invoices to authenticated;
grant update (client_id, booking_id, group_id, place_of_supply_state_code, subtotal_minor, discount_minor, taxable_minor,
              cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor, notes)
  on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_lines to authenticated;

create policy invoices_select on public.invoices for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy invoices_insert on public.invoices for insert to authenticated
  with check (org_id in (select public.my_org_ids()));
create policy invoices_update on public.invoices for update to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));
create policy invoices_delete on public.invoices for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy invoice_lines_insert on public.invoice_lines for insert to authenticated
  with check (org_id in (select public.my_org_ids()));
create policy invoice_lines_update on public.invoice_lines for update to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));
create policy invoice_lines_delete on public.invoice_lines for delete to authenticated
  using (org_id in (select public.my_org_ids()));

grant select on public.invoice_balances to authenticated;

-- invoice_counters: row level security is on and there are no policies and no
-- grants, so nobody reaches it except issue_invoice().

-- ---------------------------------------------------------------------------
-- payments: any member records money received and reads; only managers
-- record refunds, correct or remove.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.payments to authenticated;

create policy payments_select on public.payments for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy payments_insert on public.payments for insert to authenticated
  with check (
    (direction = 'in' and org_id in (select public.my_org_ids()))
    or org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[]))
  );
create policy payments_update on public.payments for update to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy payments_delete on public.payments for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

-- ---------------------------------------------------------------------------
-- expenses: owners and managers only. Deleting one is for owners (D29).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.expenses to authenticated;

create policy expenses_select on public.expenses for select to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy expenses_update on public.expenses for update to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy expenses_delete on public.expenses for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

-- ---------------------------------------------------------------------------
-- intake_submissions: written only by submit_intake(). Members read and
-- review; owners delete. What the parent sent can never be edited: only the
-- status and the matched client are writable, and a trigger records the
-- reviewer and refuses a second change of status.
-- ---------------------------------------------------------------------------
grant select, delete on public.intake_submissions to authenticated;
grant update (status, client_id) on public.intake_submissions to authenticated;

create policy intake_submissions_select on public.intake_submissions for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy intake_submissions_update on public.intake_submissions for update to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));
create policy intake_submissions_delete on public.intake_submissions for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

-- ---------------------------------------------------------------------------
-- audit_log: owners and managers read. Nobody writes; the trigger does.
-- ---------------------------------------------------------------------------
grant select on public.audit_log to authenticated;

create policy audit_log_select on public.audit_log for select to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));

-- ---------------------------------------------------------------------------
-- A row never changes organisation.
-- The policies above check that a row's new org_id is one the user belongs
-- to, but a person can belong to two organisations, so on their own they
-- would let a row be moved from one to the other. This trigger closes that.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'org_id' and tb.table_type = 'BASE TABLE'
    order by 1
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.forbid_org_change()',
      t || '_forbid_org_change', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Needed to evaluate the policies and constraints above.
grant execute on function public.session_meets_mfa() to authenticated;
grant execute on function public.my_org_ids() to authenticated;
grant execute on function public.my_org_ids_with_role(public.member_role[]) to authenticated;
grant execute on function public.stay_range(public.booking_kind, date, date) to authenticated;
grant execute on function public.new_token() to authenticated;

-- Signed-in actions.
grant execute on function public.create_organization(text, text, text) to authenticated;
grant execute on function public.invite_member_by_email(uuid, text, public.member_role, text) to authenticated;
grant execute on function public.my_invitations() to authenticated;
grant execute on function public.respond_to_invitation(uuid, boolean) to authenticated;
grant execute on function public.create_invitation_link(uuid, public.member_role, text) to authenticated;
grant execute on function public.get_invitation_link(text) to authenticated;
grant execute on function public.accept_invitation_link(text) to authenticated;
grant execute on function public.set_my_language(text) to authenticated;
grant execute on function public.merge_clients(uuid, uuid) to authenticated;
grant execute on function public.occupancy_by_day(uuid, date, date) to authenticated;
grant execute on function public.available_kennels(uuid, public.booking_kind, date, date, uuid, integer) to authenticated;
grant execute on function public.generate_care_tasks(uuid, date) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.void_invoice(uuid, text) to authenticated;
grant execute on function public.save_invoice_draft(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.accept_intake(uuid) to authenticated;
grant execute on function public.safe_date(text) to authenticated;
grant execute on function public.fiscal_year_label(date, integer) to authenticated;

-- PUBLIC surface: the complete list of what someone who is not signed in can
-- do. Keep it short. tests/db/security.test.ts pins this list.
grant execute on function public.get_public_intake_form(text) to anon, authenticated;
grant execute on function public.submit_intake(text, jsonb) to anon, authenticated;
grant execute on function public.get_public_stay(text) to anon, authenticated;
grant execute on function public.get_public_invoice(text) to anon, authenticated;
