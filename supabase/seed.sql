-- =============================================================================
-- Wagbook demo data, for a local Supabase (`npx supabase start` or
-- `npx supabase db reset`). NEVER run this against a real kennel's database.
--
-- Everyone and every pet here is invented. Dates are relative to the day the
-- seed runs, so the demo always has pets in house, arrivals today and stays
-- to come.
--
-- Sign in with any of these (password: wagbook-demo):
--   owner@demo.wagbook.test     owner
--   manager@demo.wagbook.test   manager
--   staff@demo.wagbook.test     staff
-- =============================================================================

-- Accounts, as Supabase Auth would create them on sign-up. Fixed ids so the
-- rest of this file can refer to them.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('wagbook-demo', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'owner@demo.wagbook.test'),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'manager@demo.wagbook.test'),
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'staff@demo.wagbook.test')
) as u (id, email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.email like '%@demo.wagbook.test';

-- Everything below is done as the demo owner, through the same functions and
-- rules the app uses.
do $$
declare
  v_owner constant uuid := 'd0000000-0000-4000-8000-000000000001';
  v_manager constant uuid := 'd0000000-0000-4000-8000-000000000002';
  v_staff constant uuid := 'd0000000-0000-4000-8000-000000000003';
  v_org uuid;
  v_today date;
  v_family uuid := gen_random_uuid();
  v_family2 uuid := gen_random_uuid();
  v_kennel uuid[];
  v_client uuid[];
  v_pet uuid[];
  v_booking uuid;
  i integer;
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_org := public.create_organization('Wagbook Demo Kennel', 'demo', 'Asha');
  v_today := (now() at time zone 'Asia/Kolkata')::date;

  update public.organizations set
    phone = '+919800000001',
    whatsapp_phone = '+919800000001',
    city = 'Bengaluru',
    state = 'Karnataka',
    upi_vpa = 'demokennel@okdemo',
    upi_payee_name = 'Wagbook Demo Kennel',
    play_sessions_per_day = 2,
    play_session_minutes = 20,
    play_changeover_minutes = 5,
    play_day_start = '07:00',
    play_day_end = '19:00',
    play_break_start = '11:00',
    play_break_end = '16:00'
  where id = v_org;

  -- The team: invited, then each accepts.
  perform public.invite_member_by_email(v_org, 'manager@demo.wagbook.test', 'manager', 'Ravi');
  perform public.invite_member_by_email(v_org, 'staff@demo.wagbook.test', 'staff', 'Meena');
  perform set_config('request.jwt.claim.sub', v_manager::text, true);
  perform public.respond_to_invitation(v_org, true);
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform public.respond_to_invitation(v_org, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  -- Twelve kennels.
  for i in 1..12 loop
    insert into public.kennels (org_id, name, sort_order) values (v_org, 'K' || lpad(i::text, 2, '0'), i);
  end loop;
  select array_agg(k.id order by k.sort_order) into v_kennel from public.kennels k where k.org_id = v_org;

  -- The price list.
  insert into public.services (org_id, kind, name, unit, price_minor, is_default) values
    (v_org, 'boarding', 'Boarding', 'night', 120000, true),
    (v_org, 'daycare', 'Day boarding', 'day', 72000, true);
  insert into public.services (org_id, kind, name, unit, price_minor, sort_order) values
    (v_org, 'addon', 'Grooming', 'each', 200000, 1),
    (v_org, 'addon', 'Pick-up and drop', 'each', 50000, 2);

  -- House routines and yards.
  insert into public.care_items (org_id, kind, label, details, due_time, sort_order) values
    (v_org, 'meal', 'Breakfast', 'Their own food, as the parent says', '09:00', 1),
    (v_org, 'cleaning', 'Clean kennel', null, '11:00', 2),
    (v_org, 'meal', 'Lunch', null, '14:00', 3),
    (v_org, 'meal', 'Dinner', null, '19:00', 4);
  insert into public.play_yards (org_id, name, sort_order) values (v_org, 'Yard A', 1), (v_org, 'Yard B', 2);

  insert into public.peak_periods (org_id, name, start_date, end_date, no_refund, play_session_minutes)
  values (v_org, 'Demo festival week', v_today + 20, v_today + 26, true, 15);

  -- Parents (invented) and their pets.
  insert into public.clients (org_id, full_name, phone, city, consent_at, consent_source) values
    (v_org, 'Priya Demo', '+919800000101', 'Bengaluru', now(), 'staff'),
    (v_org, 'Arjun Sample', '+919800000102', 'Bengaluru', now(), 'staff'),
    (v_org, 'Kavya Example', '+919800000103', 'Bengaluru', now(), 'staff'),
    (v_org, 'Rohan Test', '+919800000104', 'Bengaluru', now(), 'staff'),
    (v_org, 'Neha Placeholder', '+919800000105', 'Bengaluru', now(), 'staff'),
    (v_org, 'Vikram Mock', '+919800000106', 'Bengaluru', now(), 'staff');
  select array_agg(c.id order by c.phone) into v_client from public.clients c where c.org_id = v_org;

  insert into public.pets (org_id, client_id, name, breed, sex, weight_kg, food_notes, medical_notes, flags) values
    (v_org, v_client[1], 'Biscuit', 'Labrador', 'male', 31.5, '300 g kibble, twice a day', null, '{}'),
    (v_org, v_client[1], 'Pepper', 'Indie', 'female', 18.0, 'Same as Biscuit', null, '{}'),
    (v_org, v_client[2], 'Mango', 'Golden Retriever', 'male', 29.0, null, 'Thyroid tablet every morning', '{on_medication}'),
    (v_org, v_client[3], 'Coco', 'Beagle', 'female', 12.5, null, null, '{escape_risk}'),
    (v_org, v_client[4], 'Bruno', 'German Shepherd', 'male', 36.0, null, null, '{dog_reactive}'),
    (v_org, v_client[5], 'Tofu', 'Shih Tzu', 'female', 6.5, 'Wet food only', null, '{senior}'),
    (v_org, v_client[6], 'Rocky', 'Indie', 'male', 22.0, null, null, '{}'),
    (v_org, v_client[6], 'Luna', 'Indie', 'female', 19.0, null, null, '{anxious}');
  select array_agg(p.id order by p.name) into v_pet from public.pets p where p.org_id = v_org;
  -- In name order: 1 Biscuit, 2 Bruno, 3 Coco, 4 Luna, 5 Mango, 6 Pepper, 7 Rocky, 8 Tofu.

  insert into public.vaccinations (org_id, pet_id, vaccine, given_on, valid_until)
  select v_org, p, 'rabies', v_today - 200, v_today + 165 from unnest(v_pet) as p;

  -- Mango's own tablet.
  insert into public.care_items (org_id, pet_id, kind, label, details, due_time)
  values (v_org, v_pet[5], 'medication', 'Thyroid tablet', '1 tablet with breakfast', '08:30');

  -- In house now: Biscuit and Pepper together, Mango, and Bruno (who was due to leave yesterday).
  insert into public.bookings (org_id, client_id, pet_id, kind, status, start_date, end_date, kennel_id, rate_minor, group_id, belongings)
  values
    (v_org, v_client[1], v_pet[1], 'boarding', 'checked_in', v_today - 2, v_today + 3, v_kennel[1], 120000, v_family, 'Blue bed, lead'),
    (v_org, v_client[1], v_pet[6], 'boarding', 'checked_in', v_today - 2, v_today + 3, v_kennel[2], 120000, v_family, null),
    (v_org, v_client[2], v_pet[5], 'boarding', 'checked_in', v_today - 1, v_today, v_kennel[3], 120000, null, 'Tablets in a box'),
    (v_org, v_client[4], v_pet[2], 'boarding', 'checked_in', v_today - 4, v_today - 1, v_kennel[4], 120000, null, null);

  -- Arriving today: Coco (kennel chosen), Tofu for a day of day boarding.
  insert into public.bookings (org_id, client_id, pet_id, kind, status, start_date, end_date, kennel_id, rate_minor)
  values
    (v_org, v_client[3], v_pet[3], 'boarding', 'confirmed', v_today, v_today + 4, v_kennel[5], 120000),
    (v_org, v_client[5], v_pet[8], 'daycare', 'confirmed', v_today, v_today, null, 72000);

  -- Coming up: Rocky and Luna together during the festival week, and a request.
  insert into public.bookings (org_id, client_id, pet_id, kind, status, start_date, end_date, kennel_id, rate_minor, group_id)
  values
    (v_org, v_client[6], v_pet[7], 'boarding', 'confirmed', v_today + 19, v_today + 23, v_kennel[6], 120000, v_family2),
    (v_org, v_client[6], v_pet[4], 'boarding', 'confirmed', v_today + 19, v_today + 23, v_kennel[7], 120000, v_family2),
    (v_org, v_client[2], v_pet[5], 'boarding', 'requested', v_today + 10, v_today + 12, null, 120000, null);

  -- Grooming for Biscuit before going home.
  select b.id into v_booking from public.bookings b where b.org_id = v_org and b.pet_id = v_pet[1] and b.status = 'checked_in';
  insert into public.booking_items (org_id, booking_id, service_id, description, unit_price_minor)
  select v_org, v_booking, s.id, s.name, s.price_minor from public.services s where s.org_id = v_org and s.name = 'Grooming';

  -- Today's care, with breakfast already done for the first two.
  perform public.generate_care_tasks(v_org, v_today);
  update public.care_tasks t set status = 'done'
  where t.org_id = v_org and t.task_date = v_today and t.label = 'Breakfast' and t.pet_id in (v_pet[1], v_pet[6]);

  -- A parent-visible update on Biscuit's stay.
  insert into public.stay_updates (org_id, booking_id, pet_id, body)
  values (v_org, v_booking, v_pet[1], 'Biscuit ate all his breakfast and had a long sniff around Yard A.');

  -- What the kennel spent lately, for Reports and Expenses (invented shops).
  insert into public.expenses (org_id, spent_on, category, vendor, amount_minor, method) values
    (v_org, v_today - 3, 'Food', 'Demo pet supplies', 840000, 'upi'),
    (v_org, v_today - 1, 'Cleaning', 'Demo hardware', 125000, 'cash');

  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;
