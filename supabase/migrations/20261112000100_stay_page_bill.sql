-- =============================================================================
-- Wagbook 20261112000100: the parent's stay page shows the stay's bill (M72)
--
-- get_public_stay() also returns: the stay's issued bill (number, total, what
-- is due, currency and the bill's own link token), the first name of whoever
-- wrote each update, and when care was last ticked. Nothing else changes: the
-- same token, the same rows, and it still stops working when the booking is
-- cancelled and 30 days after check-out. No table changes.
--
-- The bill's token is the secret of the parent's bill page (/inv/{token}),
-- which the kennel already sends to the same parent. Whoever holds the stay
-- link can now open that bill. A draft or cancelled bill is never returned.
-- =============================================================================

create or replace function public.get_public_stay(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kennel', jsonb_build_object(
      'name', o.name,
      'whatsapp_phone', o.whatsapp_phone,
      'phone', o.phone,
      'check_in_time', to_char(o.check_in_time, 'HH24:MI'),
      'check_out_time', to_char(o.check_out_time, 'HH24:MI'),
      'time_zone', o.time_zone,
      'locale', o.locale,
      'language', o.parent_language
    ),
    'pet', jsonb_build_object('name', p.name, 'species', p.species, 'breed', p.breed, 'photo', p.photo_path),
    'booking', jsonb_build_object(
      'kind', b.kind,
      'status', b.status,
      'start_date', b.start_date,
      'end_date', b.end_date,
      'checked_in_at', b.checked_in_at,
      'checked_out_at', b.checked_out_at
    ),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object('at', u.created_at, 'body', u.body, 'photos', u.media_paths, 'by', u.written_by) order by u.created_at desc)
      from (
        select su.created_at, su.body, su.media_paths,
               -- The first name the kennel gave whoever wrote it ("Ravi"), and nothing else about them.
               (select nullif(split_part(btrim(m.display_name), ' ', 1), '')
                from public.memberships m
                where m.org_id = su.org_id and m.user_id = su.created_by) as written_by
        from public.stay_updates su
        where su.booking_id = b.id and su.is_visible_to_parent
        order by su.created_at desc
        limit 100
      ) u
    ), '[]'::jsonb),
    'care', coalesce((
      select jsonb_agg(jsonb_build_object('date', t.task_date, 'kind', t.kind, 'done', t.done, 'total', t.total)
                       order by t.task_date desc, t.kind)
      from (
        select ct.task_date, ct.kind,
               count(*) filter (where ct.status = 'done') as done,
               count(*) filter (where ct.status <> 'skipped') as total
        from public.care_tasks ct
        where ct.booking_id = b.id
        group by ct.task_date, ct.kind
      ) t
    ), '[]'::jsonb),
    -- The stay's issued bill (M72), if it has one: what it comes to, what is
    -- still due, and the bill's own link, so the parent can open and pay it
    -- from the stay page. A family's bill is found from any of its pets.
    'bill', (
      select jsonb_build_object(
        'number', ib.number,
        'total_minor', ib.total_minor,
        'due_minor', ib.due_minor,
        'currency', i.currency,
        'token', i.public_token
      )
      from public.invoice_balances ib
      join public.invoices i on i.id = ib.invoice_id
      where ib.org_id = b.org_id
        and ib.status = 'issued'
        and (ib.booking_id = b.id or (b.group_id is not null and ib.group_id = b.group_id))
      order by ib.issued_on desc, ib.number desc
      limit 1
    ),
    -- When the latest care task of the stay was ticked, for "up to 10:30".
    'care_until', (select max(ct.done_at) from public.care_tasks ct where ct.booking_id = b.id and ct.status = 'done'),
    -- The stay report (M53), once the pet has gone home: what staff added, and
    -- the records it is worked out from (stayReport() in src/lib/core).
    'report', case when b.status = 'checked_out' then jsonb_build_object(
      'words', (select r.words from public.stay_reports r where r.booking_id = b.id),
      'photos', coalesce((select to_jsonb(r.photo_paths) from public.stay_reports r where r.booking_id = b.id), '[]'::jsonb),
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object('kind', ct.kind, 'label', ct.label, 'status', ct.status) order by ct.task_date, ct.due_time)
        from public.care_tasks ct
        where ct.booking_id = b.id and ct.kind in ('meal', 'medication')
      ), '[]'::jsonb),
      'play', (select count(*) from public.play_sessions ps where ps.booking_id = b.id and ps.status = 'done'),
      'weights', coalesce((
        select jsonb_agg(jsonb_build_object('on', w.weighed_on, 'grams', w.weight_g) order by w.weighed_on, w.created_at)
        from public.pet_weights w
        where w.org_id = b.org_id and w.pet_id = b.pet_id and w.weighed_on between b.start_date - 30 and b.end_date
      ), '[]'::jsonb),
      'incidents', coalesce((
        select jsonb_agg(jsonb_build_object('on', (i.occurred_at at time zone o.time_zone)::date, 'category', i.category) order by i.occurred_at)
        from public.incidents i
        where i.booking_id = b.id and i.parent_notified_at is not null
      ), '[]'::jsonb)
    ) end
  )
  from public.bookings b
  join public.organizations o on o.id = b.org_id
  join public.pets p on p.id = b.pet_id
  where char_length(p_token) = 64
    and b.public_token = p_token
    and b.status not in ('cancelled', 'no_show')
    and p.deleted_at is null
    -- The link stops working a month after the pet goes home.
    and (b.status <> 'checked_out' or b.checked_out_at > now() - interval '30 days');
$$;
comment on function public.get_public_stay(text) is
  'PUBLIC. The parent''s stay page for one booking, found by its secret token: kennel contact, pet name and photo path, dates, status, parent-visible updates with their photo paths and the first name of who wrote each, a count of care done and when care was last ticked, the stay''s issued bill if it has one (number, total, what is due, currency and the token of its own page; never a draft or a cancelled bill), and once the pet has gone home the stay report (M53): the kennel''s words and picked photos, meals and medicines by label and whether done, play sessions done, weighings around the stay, and the kinds of incident the parent was told of. No notes, prices of lines, incident accounts or other pets. Stops working when the booking is cancelled and 30 days after check-out. The photos themselves are fetched through Storage with the same token (stay_media_visible).';

-- The grants of a function are kept by "create or replace"; said again so this file can be read on its own.
revoke all on function public.get_public_stay(text) from public;
grant execute on function public.get_public_stay(text) to anon, authenticated;
