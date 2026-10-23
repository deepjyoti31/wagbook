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
alter table public.reminders_sent enable row level security;
alter table public.day_packs enable row level security;
alter table public.passes enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.credit_notes enable row level security;
alter table public.credit_note_lines enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.intake_submissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.invitation_links enable row level security;
alter table public.pet_weights enable row level security;
alter table public.client_addresses enable row level security;
alter table public.service_areas enable row level security;
alter table public.suppliers enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_moves enable row level security;
alter table public.stock_costs enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.food_products enable row level security;
alter table public.pet_food enable row level security;
alter table public.subscriptions enable row level security;
alter table public.deliveries enable row level security;
alter table public.batches enable row level security;
alter table public.delivery_runs enable row level security;
alter table public.delivery_problems enable row level security;
alter table public.food_orders enable row level security;
alter table public.appointment_places enable row level security;
alter table public.appointment_services enable row level security;
alter table public.appointment_service_prices enable row level security;
alter table public.pet_grooming enable row level security;
alter table public.courses enable row level security;
alter table public.packages enable row level security;
alter table public.package_parts enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_items enable row level security;
alter table public.trips enable row level security;
alter table public.required_vaccines enable row level security;
alter table public.health_overrides enable row level security;
alter table public.cancellation_rules enable row level security;
alter table public.credits enable row level security;
alter table public.credit_uses enable row level security;
alter table public.kennel_service enable row level security;
alter table public.shifts enable row level security;
alter table public.rota enable row level security;
alter table public.leave_requests enable row level security;
alter table public.attendance enable row level security;
alter table public.app_errors enable row level security;
alter table public.job_runs enable row level security;
alter table public.photo_archives enable row level security;
alter table public.kennel_cleans enable row level security;
alter table public.house_jobs enable row level security;
alter table public.house_job_days enable row level security;
alter table public.repairs enable row level security;
alter table public.stay_reports enable row level security;
alter table public.stay_supplies enable row level security;
alter table public.vet_visits enable row level security;

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
-- name, phone, skills, living on site and active flag can be written directly.
-- ---------------------------------------------------------------------------
grant select, delete on public.memberships to authenticated;
grant update (role, display_name, phone, is_active, skills, lives_on_site) on public.memberships to authenticated;

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
    'care_tasks', 'play_sessions', 'stay_updates', 'incidents',
    'pet_food', 'subscriptions', 'deliveries', 'delivery_runs', 'delivery_problems',
    'appointments', 'appointment_items', 'pet_grooming', 'trips',
    'house_job_days', 'repairs', 'stay_reports', 'stay_supplies', 'vet_visits'
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
              emergency_name, emergency_phone, notes, consent_at, consent_source, bill_translation, created_by, deleted_at)
  on public.clients to authenticated;
grant update (org_id, created_by, full_name, phone, alt_phone, email, address, city, postal_code, gst_state_code, tax_id,
              emergency_name, emergency_phone, notes, consent_at, consent_source, bill_translation, deleted_at)
  on public.clients to authenticated;

-- Bookings: the "who and when" stamps, the creator and the secret link token
-- are written only by the database, so they are not in the list of columns a
-- client may send.
revoke insert, update on public.bookings from authenticated;
grant insert (org_id, client_id, pet_id, kind, status, start_date, end_date, kennel_id, rate_minor, alone_rate_minor,
              boarding_from, day_rate_minor, series_id, pass_id, discount_minor, tax_rate_bp, sac_code, expected_arrival, expected_departure, cancel_reason, belongings, notes, source, group_id,
              waitlisted_at, cancel_asked_at, cancelled_by_kennel, is_trial)
  on public.bookings to authenticated;
grant update (client_id, pet_id, kind, status, start_date, end_date, kennel_id, rate_minor, alone_rate_minor,
              boarding_from, day_rate_minor, series_id, pass_id, discount_minor, tax_rate_bp, sac_code, expected_arrival, expected_departure, cancel_reason, belongings, gate_notes,
              vaccinations_checked_at, notes, group_id, waitlisted_at, package_id, package_price_minor, cancel_asked_at, cancelled_by_kennel,
              is_trial, trial_outcome, trial_note)
  on public.bookings to authenticated;
-- A package is put on a stay only through apply_package() (bookings_check_package).
-- Who may change a price is decided by a trigger, not here: owners, managers
-- and staff all sign in as the same role. See bookings_guard_price().

-- ---------------------------------------------------------------------------
-- Setup tables: any member reads; managers add, edit and delete.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['kennels', 'services', 'peak_periods', 'care_items', 'play_yards', 'day_packs', 'service_areas',
                          'suppliers', 'stock_items', 'recipes', 'food_products',
                          'appointment_places', 'appointment_services', 'appointment_service_prices', 'packages', 'package_parts',
                          'required_vaccines', 'shifts', 'rota', 'house_jobs'] loop
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

-- Day boarding packs sold to parents: any member reads them (to book a day on
-- one); owners and managers sell and correct them; owners delete.
grant select, insert, update, delete on public.passes to authenticated;
create policy passes_select on public.passes for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy passes_insert on public.passes for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy passes_update on public.passes for update to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy passes_delete on public.passes for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));
grant select on public.pass_balances to authenticated;

-- Training courses (M36), sold as packs are: any member reads them (to book a
-- session from one); owners and managers sell and correct them; owners delete.
grant select, insert, update, delete on public.courses to authenticated;
create policy courses_select on public.courses for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy courses_insert on public.courses for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy courses_update on public.courses for update to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy courses_delete on public.courses for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));
grant select on public.course_balances to authenticated;

-- Cancellation rules (M38): any member reads them (the cancel screen works them
-- out); owners and managers set them; owners delete.
grant select, insert, update, delete on public.cancellation_rules to authenticated;
create policy cancellation_rules_select on public.cancellation_rules for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy cancellation_rules_insert on public.cancellation_rules for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy cancellation_rules_update on public.cancellation_rules for update to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy cancellation_rules_delete on public.cancellation_rules for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

-- Credit (M38): any member reads a parent's credit (to spend it on a bill).
-- Owners and managers give goodwill credit; credit kept from a cancellation and
-- every use are written only by payments_credit(). Nobody changes either; an
-- owner deletes goodwill credit not yet used.
grant select, insert, delete on public.credits to authenticated;
create policy credits_select on public.credits for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy credits_insert on public.credits for insert to authenticated
  with check (kind = 'goodwill' and org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy credits_delete on public.credits for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));
grant select on public.credit_uses to authenticated;
create policy credit_uses_select on public.credit_uses for select to authenticated
  using (org_id in (select public.my_org_ids()));
grant select on public.credit_balances to authenticated;

-- Letting a pet in at the door despite the health rules (M40): owners and
-- managers, with a reason; any member reads; nobody changes one; owners delete.
grant select, insert, delete on public.health_overrides to authenticated;
create policy health_overrides_select on public.health_overrides for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy health_overrides_insert on public.health_overrides for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy health_overrides_delete on public.health_overrides for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

-- When kennels went in and out of service (M44): any member reads it; only
-- the kennels_keep_service trigger writes it, so there is no other grant.
grant select on public.kennel_service to authenticated;
create policy kennel_service_select on public.kennel_service for select to authenticated
  using (org_id in (select public.my_org_ids()));

-- The team (M43). The rota is planned by owners and managers and read by
-- everyone (it is in the setup list above; taking a person off a shift is
-- part of planning, so managers delete rota rows too, D48). Leave and
-- attendance are a person's own: they see and write their own, owners and
-- managers see and write everyone's (the triggers decide who answers leave
-- and who writes a time by hand), owners delete.
create policy rota_delete_by_managers on public.rota for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));

grant select, delete on public.leave_requests to authenticated;
grant insert (org_id, user_id, starts_on, ends_on, reason, status, answer) on public.leave_requests to authenticated;
grant update (starts_on, ends_on, reason, status, answer) on public.leave_requests to authenticated;
create policy leave_requests_select on public.leave_requests for select to authenticated
  using ((user_id = (select auth.uid()) and org_id in (select public.my_org_ids()))
         or org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy leave_requests_insert on public.leave_requests for insert to authenticated
  with check ((user_id = (select auth.uid()) and org_id in (select public.my_org_ids()))
              or org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy leave_requests_update on public.leave_requests for update to authenticated
  using ((user_id = (select auth.uid()) and org_id in (select public.my_org_ids()))
         or org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  with check ((user_id = (select auth.uid()) and org_id in (select public.my_org_ids()))
              or org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy leave_requests_delete on public.leave_requests for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

grant select, delete on public.attendance to authenticated;
grant insert (org_id, user_id, clocked_in_at, clocked_out_at, note) on public.attendance to authenticated;
grant update (clocked_in_at, clocked_out_at, note) on public.attendance to authenticated;
create policy attendance_select on public.attendance for select to authenticated
  using ((user_id = (select auth.uid()) and org_id in (select public.my_org_ids()))
         or org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy attendance_insert on public.attendance for insert to authenticated
  with check ((user_id = (select auth.uid()) and org_id in (select public.my_org_ids()))
              or org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy attendance_update on public.attendance for update to authenticated
  using ((user_id = (select auth.uid()) and org_id in (select public.my_org_ids()))
         or org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  with check ((user_id = (select auth.uid()) and org_id in (select public.my_org_ids()))
              or org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy attendance_delete on public.attendance for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

-- The day, smoother (Phase 6, M50 to M57). A kennel to clean is written only
-- by the database when its last pet leaves (bookings_leave_kennel_to_clean);
-- any member reads the list and marks one cleaned, which the database stamps.
-- House jobs are set up by owners and managers (the setup list above); their
-- ticks, repairs, stay reports, a parent's supplies and vet visits are daily
-- operations (the list above). What is left of each supply is a view.
grant select on public.kennel_cleans to authenticated;
grant update (cleaned_at) on public.kennel_cleans to authenticated;
create policy kennel_cleans_select on public.kennel_cleans for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy kennel_cleans_update on public.kennel_cleans for update to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));
grant select on public.stay_supply_left to authenticated;

-- Running for real (Phase 5, M46 to M49). Problems are read by owners
-- (M48); overnight job runs and photo archives by owners and managers (M46,
-- M49). None is written directly: log_app_error(), run_nightly_jobs() and the
-- photo archive's functions write them.
grant select on public.app_errors to authenticated;
create policy app_errors_select on public.app_errors for select to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));
grant select on public.job_runs to authenticated;
create policy job_runs_select on public.job_runs for select to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
grant select on public.photo_archives to authenticated;
create policy photo_archives_select on public.photo_archives for select to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));

-- Weighings: any member weighs a pet and reads the weights; owners and
-- managers correct one; owners delete (D29).
grant select, insert, update, delete on public.pet_weights to authenticated;
create policy pet_weights_select on public.pet_weights for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy pet_weights_insert on public.pet_weights for insert to authenticated
  with check (org_id in (select public.my_org_ids()));
create policy pet_weights_update on public.pet_weights for update to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy pet_weights_delete on public.pet_weights for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

-- A parent's addresses are personal data, like their phone numbers (D33):
-- any member reads one and adds one for a parent; only owners and managers
-- change one; owners delete (D29).
grant select, insert, update, delete on public.client_addresses to authenticated;
create policy client_addresses_select on public.client_addresses for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy client_addresses_insert on public.client_addresses for insert to authenticated
  with check (org_id in (select public.my_org_ids()));
create policy client_addresses_update on public.client_addresses for update to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy client_addresses_delete on public.client_addresses for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

-- Stock (M26): any member reads what is in stock and records what was thrown
-- away or counted; only owners and managers record a purchase. Batches write
-- what cooking used (M30). Nobody changes or deletes a movement: there are no
-- grants for it, and a stock take corrects the count.
grant select, insert on public.stock_moves to authenticated;
create policy stock_moves_select on public.stock_moves for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy stock_moves_insert on public.stock_moves for insert to authenticated
  with check (
    org_id in (select public.my_org_ids())
    and (kind <> 'purchase' or org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])))
  );
grant select on public.stock_levels to authenticated;

-- What things cost is for owners and managers only; it is never changed.
grant select, insert on public.stock_costs to authenticated;
create policy stock_costs_select on public.stock_costs for select to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy stock_costs_insert on public.stock_costs for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));

-- Recipe versions (M27) never change: any member reads them (the cook works
-- from them); owners and managers write a new one (save_recipe_version), and
-- nobody changes or deletes one.
grant select, insert on public.recipe_versions, public.recipe_ingredients to authenticated;
create policy recipe_versions_select on public.recipe_versions for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy recipe_versions_insert on public.recipe_versions for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
create policy recipe_ingredients_select on public.recipe_ingredients for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy recipe_ingredients_insert on public.recipe_ingredients for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])));
grant select on public.recipe_current to authenticated;

-- Batches (M30): any member records cooking (record_batch) and reads; nobody
-- changes one (its stock went out with it); owners delete one that took
-- nothing out.
grant select, insert, delete on public.batches to authenticated;
create policy batches_select on public.batches for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy batches_insert on public.batches for insert to authenticated
  with check (org_id in (select public.my_org_ids()));
create policy batches_delete on public.batches for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

-- Reminders sent: any member reads and records one; nobody changes one; owners delete.
grant select, insert, delete on public.reminders_sent to authenticated;
create policy reminders_sent_select on public.reminders_sent for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy reminders_sent_insert on public.reminders_sent for insert to authenticated
  with check (org_id in (select public.my_org_ids()));
create policy reminders_sent_delete on public.reminders_sent for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role(array['owner']::public.member_role[])));

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
grant insert (org_id, client_id, booking_id, group_id, series_id, series_month, subscription_id, period_start, period_end, delivery_id, appointment_id, place_of_supply_state_code, subtotal_minor, discount_minor, taxable_minor,
              cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor, notes)
  on public.invoices to authenticated;
grant update (client_id, booking_id, group_id, series_id, series_month, subscription_id, period_start, period_end, delivery_id, appointment_id, place_of_supply_state_code, subtotal_minor, discount_minor, taxable_minor,
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

-- Credit notes: any member reads them. Nobody writes them but
-- issue_credit_note(), and nobody changes or deletes one: there are no grants
-- for it.
grant select on public.credit_notes, public.credit_note_lines to authenticated;
create policy credit_notes_select on public.credit_notes for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy credit_note_lines_select on public.credit_note_lines for select to authenticated
  using (org_id in (select public.my_org_ids()));

-- invoice_counters: row level security is on and there are no policies and no
-- grants, so nobody reaches it except issue_invoice() and issue_credit_note().

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
-- food_orders (M32): written only by submit_food_order() and
-- submit_food_request(). Members read them and decline one; confirming goes
-- through confirm_food_order(). What the parent sent is never edited.
-- ---------------------------------------------------------------------------
grant select, delete on public.food_orders to authenticated;
grant update (status) on public.food_orders to authenticated;
create policy food_orders_select on public.food_orders for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy food_orders_update on public.food_orders for update to authenticated
  using (org_id in (select public.my_org_ids()) and status not in ('confirmed', 'declined'))
  with check (org_id in (select public.my_org_ids()) and status in ('declined', 'waiting_area', 'unpaid', 'paid', 'requested'));
create policy food_orders_delete on public.food_orders for delete to authenticated
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
-- Two-step sign-in recovery codes (recovery_codes itself has no policy and no grant).
grant execute on function public.make_recovery_codes() to authenticated;
grant execute on function public.use_recovery_code(text) to authenticated;
grant execute on function public.recovery_codes_left() to authenticated;
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
grant execute on function public.waiting_list(uuid) to authenticated;
grant execute on function public.generate_care_tasks(uuid, date) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.void_invoice(uuid, text) to authenticated;
grant execute on function public.issue_credit_note(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.renew_request_link(uuid) to authenticated;
grant execute on function public.save_invoice_draft(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.stay_charges(uuid, uuid[]) to authenticated;
grant execute on function public.accept_intake(uuid) to authenticated;
grant execute on function public.my_rider_org_ids() to authenticated;
grant execute on function public.save_recipe_version(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.recipe_cost_per_kg(uuid, uuid, date) to authenticated;
grant execute on function public.delivery_cutoff(uuid, date, public.delivery_slot) to authenticated;
grant execute on function public.rotation_recipe(uuid, integer) to authenticated;
grant execute on function public.plan_subscription(uuid, date) to authenticated;
grant execute on function public.food_bill_lines(uuid, uuid, date, date, uuid) to authenticated;
grant execute on function public.record_batch(uuid, uuid, integer, integer, date, uuid, date, text) to authenticated;
grant execute on function public.batch_cost(uuid, uuid) to authenticated;
grant execute on function public.batch_recipients(uuid, uuid) to authenticated;
grant execute on function public.my_runs(date) to authenticated;
grant execute on function public.rider_mark_stop(uuid, public.delivery_status, text) to authenticated;
grant execute on function public.first_delivery_day(uuid, smallint[]) to authenticated;
grant execute on function public.org_today(uuid) to authenticated;
grant execute on function public.confirm_food_order(uuid) to authenticated;
grant execute on function public.record_purchase(uuid, uuid, bigint, bigint, date, uuid, date, text, text, text) to authenticated;
grant execute on function public.safe_date(text) to authenticated;
grant execute on function public.fiscal_year_label(date, integer) to authenticated;
-- Appointments (M34 to M37).
grant execute on function public.appointment_price(uuid, uuid, uuid) to authenticated;
grant execute on function public.first_free_start(uuid, uuid, uuid, date, integer, integer, time, boolean) to authenticated;
grant execute on function public.apply_package(uuid, uuid, bigint) to authenticated;
-- Phase 3 (M38 to M42).
grant execute on function public.pet_health_problems(uuid, uuid, date) to authenticated;
grant execute on function public.rider_mark_trip(uuid, public.trip_status) to authenticated;
-- Phase 4 (M43, M44).
grant execute on function public.who_is_on(uuid) to authenticated;
grant execute on function public.kennels_in_service(uuid, date) to authenticated;

-- Phase 5 (M45 to M49): running for real.
grant execute on function public.import_parents_and_pets(uuid, jsonb) to authenticated;
grant execute on function public.log_app_error(text, text, text, uuid, text) to authenticated;
grant execute on function public.archivable_photo(text) to authenticated;
grant execute on function public.check_photo_month(uuid, date, public.member_role[]) to authenticated;
grant execute on function public.photo_space(uuid) to authenticated;
grant execute on function public.photo_month_files(uuid, date) to authenticated;
grant execute on function public.record_photo_download(uuid, date, integer, bigint) to authenticated;
grant execute on function public.record_photo_removal(uuid, date, integer, bigint) to authenticated;
grant execute on function public.photos_to_remove(uuid, date) to authenticated;

-- Phase 6 (M50 to M57): the day, smoother.
grant execute on function public.cost_to_expense(uuid, text, uuid, text) to authenticated;
grant execute on function public.record_vet_visit(uuid, uuid, date, text, text, text, bigint, text, text, jsonb) to authenticated;

-- PUBLIC surface: the complete list of what someone who is not signed in can
-- do. Keep it short. tests/db/security.test.ts pins this list.
grant execute on function public.get_public_intake_form(text) to anon, authenticated;
grant execute on function public.submit_intake(text, jsonb) to anon, authenticated;
grant execute on function public.get_public_stay(text) to anon, authenticated;
grant execute on function public.get_public_invoice(text) to anon, authenticated;
grant execute on function public.get_public_booking_form(text) to anon, authenticated;
grant execute on function public.submit_booking_request(text, jsonb) to anon, authenticated;
-- Food (M32): the order page, saying an order was paid, and a known parent's
-- changes to their food from their own link.
grant execute on function public.get_public_food_form(text) to anon, authenticated;
grant execute on function public.submit_food_order(text, jsonb) to anon, authenticated;
grant execute on function public.food_order_paid(text) to anon, authenticated;
grant execute on function public.submit_food_request(text, jsonb) to anon, authenticated;
