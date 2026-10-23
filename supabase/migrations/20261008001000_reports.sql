-- =============================================================================
-- Wagbook 0010: reports
--
-- Numbers for the owner: how full the kennel was, what was billed, received
-- and spent, tax by rate, and which extras sell. Each report is a function
-- that runs as the caller (security invoker, the default), so row level
-- security still decides what it can see. On top of that each one refuses
-- anyone who is not an owner or manager of the kennel asked about, so a
-- report never quietly answers "nothing" to someone who should not ask.
--
-- Periods are kennel-local dates, inclusive at both ends, at most a year and
-- a few days (400 days, as for the calendar).
-- =============================================================================

create function public.check_report_access(p_org uuid, p_from date, p_to date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_org is null or p_org not in (select public.my_org_ids_with_role(array['owner', 'manager']::public.member_role[])) then
    raise exception 'WB060: Reports are for owners and managers.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'WB061: Choose a period of a year or less, with the start before the end.' using errcode = '22023';
  end if;
end;
$$;
comment on function public.check_report_access(uuid, date, date) is
  'Raises unless the caller is an owner or manager of the organisation and the period runs forwards for at most 400 days. Every report calls it first.';

-- ---------------------------------------------------------------------------

create function public.report_occupancy(p_org uuid, p_from date, p_to date)
returns table (day date, boarding integer, day_boarding integer, capacity integer, kennels_used integer)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.check_report_access(p_org, p_from, p_to);
  return query
  select
    d.day::date,
    count(b.id) filter (where b.kind = 'boarding')::integer,
    count(b.id) filter (where b.kind = 'daycare')::integer,
    -- The kennels there that day (M44), not today's.
    public.kennels_in_service(p_org, d.day::date),
    -- Two pets sharing a kennel use one; a pet with no kennel recorded is counted as using one.
    count(distinct coalesce(b.kennel_id, b.id))::integer
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as d (day)
  left join public.bookings b
    on b.org_id = p_org
   and b.status in ('confirmed', 'checked_in', 'checked_out')
   and public.stay_range(b.kind, b.start_date, b.end_date) @> d.day::date
  group by d.day
  order by d.day;
end;
$$;
comment on function public.report_occupancy(uuid, date, date) is
  'For each day: pets staying the night (boarding), pets in for the day (day boarding), kennels in service that day (kennels_in_service), and kennels used (two pets sharing a kennel use one). Counts stays that happened or are booked; not requests, cancellations or no-shows. A boarding stay counts on its nights, so not on its check-out day. Owners and managers only.';

-- ---------------------------------------------------------------------------

create function public.report_money(p_org uuid, p_from date, p_to date)
returns table (
  month date,
  billed_minor bigint,
  credited_minor bigint,
  tax_minor bigint,
  bills integer,
  received_minor bigint,
  refunded_minor bigint,
  spent_minor bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.check_report_access(p_org, p_from, p_to);
  return query
  with months as (
    select m::date as month
    from generate_series(date_trunc('month', p_from)::timestamp, date_trunc('month', p_to)::timestamp, interval '1 month') as m
  ),
  billed as (
    select date_trunc('month', i.issued_on)::date as month, sum(i.total_minor) as total, sum(i.tax_minor) as tax, count(*) as n
    from public.invoices i
    where i.org_id = p_org and i.status = 'issued' and i.issued_on between p_from and p_to
    group by 1
  ),
  -- Credit notes count in the month they were made, not the bill's.
  credited as (
    select date_trunc('month', cn.issued_on)::date as month, sum(cn.total_minor) as total, sum(cn.tax_minor) as tax
    from public.credit_notes cn
    where cn.org_id = p_org and cn.issued_on between p_from and p_to
    group by 1
  ),
  paid as (
    select date_trunc('month', p.received_on)::date as month,
           sum(p.amount_minor) filter (where p.direction = 'in') as received,
           sum(p.amount_minor) filter (where p.direction = 'out') as refunded
    from public.payments p
    -- Payments from and into credit move no money (M38).
    where p.org_id = p_org and p.received_on between p_from and p_to and p.method <> 'credit'
    group by 1
  ),
  spent as (
    select date_trunc('month', e.spent_on)::date as month, sum(e.amount_minor) as total
    from public.expenses e
    where e.org_id = p_org and e.spent_on between p_from and p_to
    group by 1
  )
  select
    m.month,
    coalesce(b.total, 0)::bigint,
    coalesce(c.total, 0)::bigint,
    (coalesce(b.tax, 0) - coalesce(c.tax, 0))::bigint,
    coalesce(b.n, 0)::integer,
    coalesce(p.received, 0)::bigint,
    coalesce(p.refunded, 0)::bigint,
    coalesce(s.total, 0)::bigint
  from months m
  left join billed b on b.month = m.month
  left join credited c on c.month = m.month
  left join paid p on p.month = m.month
  left join spent s on s.month = m.month
  order by m.month;
end;
$$;
comment on function public.report_money(uuid, date, date) is
  'For each month in the period: what was billed (issued bills by bill date; cancelled bills left out), what credit notes took back (by credit note date), the tax in the month net of credit notes, payments received and refunded (by the date the money moved; not from or into credit, which moves none), and expenses (by the date spent). Only days inside the period count, so a period that starts mid-month gives a part month. Owners and managers only.';

-- ---------------------------------------------------------------------------

create function public.report_tax(p_org uuid, p_from date, p_to date)
returns table (
  tax_rate_bp integer,
  bills integer,
  credit_notes integer,
  taxable_minor bigint,
  cgst_minor bigint,
  sgst_minor bigint,
  igst_minor bigint,
  tax_minor bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.check_report_access(p_org, p_from, p_to);
  -- Bills by bill date, less credit notes by credit note date: what a return
  -- for the period declares.
  return query
  with lines as (
    select l.tax_rate_bp, i.id as bill, null::uuid as note, l.taxable_minor, l.cgst_minor, l.sgst_minor, l.igst_minor, l.tax_minor
    from public.invoices i
    join public.invoice_lines l on l.org_id = i.org_id and l.invoice_id = i.id
    where i.org_id = p_org and i.status = 'issued' and i.issued_on between p_from and p_to
    union all
    select l.tax_rate_bp, null, cn.id, -l.taxable_minor, -l.cgst_minor, -l.sgst_minor, -l.igst_minor, -l.tax_minor
    from public.credit_notes cn
    join public.credit_note_lines l on l.org_id = cn.org_id and l.credit_note_id = cn.id
    where cn.org_id = p_org and cn.issued_on between p_from and p_to
  )
  select
    x.tax_rate_bp,
    count(distinct x.bill)::integer,
    count(distinct x.note)::integer,
    sum(x.taxable_minor)::bigint,
    sum(x.cgst_minor)::bigint,
    sum(x.sgst_minor)::bigint,
    sum(x.igst_minor)::bigint,
    sum(x.tax_minor)::bigint
  from lines x
  group by x.tax_rate_bp
  order by x.tax_rate_bp;
end;
$$;
comment on function public.report_tax(uuid, date, date) is
  'Tax in the period, by rate: the value taxed and the tax (CGST, SGST and IGST under India GST) on issued bills by bill date, less credit notes by credit note date. Cancelled bills are left out (only a bill of the same month can be cancelled once taxed, WB095). Owners and managers only.';

-- ---------------------------------------------------------------------------

create function public.report_extras(p_org uuid, p_from date, p_to date)
returns table (name text, stays integer, quantity numeric, amount_minor bigint)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.check_report_access(p_org, p_from, p_to);
  return query
  select
    coalesce(s.name, bi.description),
    count(distinct bi.booking_id)::integer,
    sum(bi.quantity),
    sum(round(bi.quantity * bi.unit_price_minor))::bigint
  from public.booking_items bi
  join public.bookings b on b.org_id = bi.org_id and b.id = bi.booking_id
  left join public.services s on s.org_id = bi.org_id and s.id = bi.service_id
  where bi.org_id = p_org
    and b.status in ('confirmed', 'checked_in', 'checked_out')
    and b.start_date between p_from and p_to
  group by coalesce(s.name, bi.description)
  order by 4 desc, 1
  limit 20;
end;
$$;
comment on function public.report_extras(uuid, date, date) is
  'The extras sold on stays that start in the period, biggest first (at most 20): how many stays had each, how many in all, and their value at the price charged, before discount and tax. Extras from the price list are grouped by its current name; one-off items by their description. Owners and managers only.';

-- ---------------------------------------------------------------------------
-- Food (M33)
-- ---------------------------------------------------------------------------

create function public.report_food(p_org uuid, p_from date, p_to date)
returns table (
  month date,
  active_subscriptions integer,
  subscriptions_started integer,
  subscriptions_ended integer,
  trials integer,
  trials_subscribed integer,
  deliveries integer,
  kilos_delivered numeric,
  food_value_minor bigint,
  kilos_cooked numeric,
  cooking_cost_minor bigint,
  wasted_g bigint,
  wasted_cost_minor bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.check_report_access(p_org, p_from, p_to);
  return query
  with months as (
    select greatest(m::date, p_from) as m_from,
           least((m + interval '1 month' - interval '1 day')::date, p_to) as m_to,
           m::date as m
    from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') m
  ),
  out_deliveries as (
    select d.* from public.deliveries d
    where d.org_id = p_org and d.status = 'delivered' and d.delivery_date between p_from and p_to
  ),
  trial_deliveries as (
    select d.* from out_deliveries d where d.kind = 'trial'
  )
  select
    mo.m,
    (select count(*)::integer from public.subscriptions s
     where s.org_id = p_org and s.starts_on <= mo.m_to and (s.cancelled_on is null or s.cancelled_on > mo.m_to)),
    (select count(*)::integer from public.subscriptions s where s.org_id = p_org and s.starts_on between mo.m_from and mo.m_to),
    (select count(*)::integer from public.subscriptions s where s.org_id = p_org and s.cancelled_on between mo.m_from and mo.m_to),
    (select count(*)::integer from trial_deliveries t where t.delivery_date between mo.m_from and mo.m_to),
    (select count(*)::integer from trial_deliveries t
     where t.delivery_date between mo.m_from and mo.m_to
       and exists (select 1 from public.subscriptions s where s.org_id = p_org and s.client_id = t.client_id
                   and greatest(s.starts_on, (s.created_at at time zone (select o.time_zone from public.organizations o where o.id = p_org))::date) >= t.delivery_date)),
    (select count(*)::integer from out_deliveries d where d.delivery_date between mo.m_from and mo.m_to),
    (select coalesce(sum(d.grams), 0) / 1000.0 from out_deliveries d where d.delivery_date between mo.m_from and mo.m_to)::numeric(12, 2),
    (select coalesce(sum(d.price_minor + d.delivery_charge_minor), 0)::bigint from out_deliveries d where d.delivery_date between mo.m_from and mo.m_to),
    (select coalesce(sum(b.grams), 0) / 1000.0 from public.batches b where b.org_id = p_org and b.cooked_on between mo.m_from and mo.m_to)::numeric(12, 2),
    (select coalesce(sum(public.batch_cost(p_org, b.id)), 0)::bigint from public.batches b where b.org_id = p_org and b.cooked_on between mo.m_from and mo.m_to),
    (select coalesce(-sum(sm.quantity), 0)::bigint from public.stock_moves sm
     join public.stock_items i on i.org_id = sm.org_id and i.id = sm.item_id
     where sm.org_id = p_org and sm.kind = 'waste' and i.unit = 'g' and sm.happened_on between mo.m_from and mo.m_to),
    (select coalesce(round(sum(-sm.quantity * (
        select c.cost_minor::numeric / pm.quantity
        from public.stock_moves pm
        join public.stock_costs c on c.org_id = pm.org_id and c.move_id = pm.id
        where pm.org_id = sm.org_id and pm.item_id = sm.item_id and pm.kind = 'purchase' and pm.happened_on <= sm.happened_on
        order by pm.happened_on desc, pm.created_at desc limit 1))), 0)::bigint
     from public.stock_moves sm
     where sm.org_id = p_org and sm.kind = 'waste' and sm.happened_on between mo.m_from and mo.m_to)
  from months mo
  order by mo.m;
end;
$$;
comment on function public.report_food(uuid, date, date) is
  'For each month of the period: subscriptions active at its end, started and ended in it; trials handed over and how many of those parents then subscribed; deliveries handed over, their kilos and value (food and delivery); kilos cooked and what the batches cost (from their own versions and that day''s prices); grams of stock thrown away and what it cost. Owners and managers only.';

create function public.report_food_riders(p_org uuid, p_from date, p_to date)
returns table (day date, rider_id uuid, rider_name text, delivered integer, not_home integer, refused integer)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.check_report_access(p_org, p_from, p_to);
  return query
  select r.run_date, r.rider_id, coalesce(m.display_name, ''),
         count(*) filter (where d.status = 'delivered')::integer,
         count(*) filter (where d.status = 'not_home')::integer,
         count(*) filter (where d.status = 'refused')::integer
  from public.delivery_runs r
  join public.deliveries d on d.org_id = r.org_id and d.run_id = r.id
  left join public.memberships m on m.org_id = r.org_id and m.user_id = r.rider_id
  where r.org_id = p_org and r.run_date between p_from and p_to
  group by r.run_date, r.rider_id, m.display_name
  order by r.run_date, 3;
end;
$$;
comment on function public.report_food_riders(uuid, date, date) is
  'Deliveries per rider per day in the period: handed over, nobody home, refused. Owners and managers only.';

create function public.report_food_sources(p_org uuid, p_from date, p_to date)
returns table (source public.customer_source, started integer, still_active integer)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.check_report_access(p_org, p_from, p_to);
  return query
  select s.source, count(*)::integer,
         count(*) filter (where s.cancelled_on is null or s.cancelled_on > public.org_today(p_org))::integer
  from public.subscriptions s
  where s.org_id = p_org and s.starts_on between p_from and p_to
  group by s.source
  order by 2 desc, 1;
end;
$$;
comment on function public.report_food_sources(uuid, date, date) is
  'Where the food customers who started in the period came from (a boarding parent, a referral, the website, elsewhere), and how many are still subscribed. Owners and managers only.';

-- ---------------------------------------------------------------------------
-- All sites (M65, D55). An owner of several kennels sees them side by side.
-- Each site stays a kennel of its own (D49): this reads each one through its
-- own reports, as the caller, and never joins one site's rows to another's.
-- ---------------------------------------------------------------------------

create function public.report_sites(p_from date, p_to date)
returns table (
  org_id uuid,
  name text,
  currency text,
  nights integer,
  day_boarding_days integer,
  kennel_days integer,
  kennels_used integer,
  billed_minor bigint,
  credited_minor bigint,
  received_minor bigint,
  refunded_minor bigint,
  spent_minor bigint,
  owed_minor bigint,
  bills_owed integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_sites uuid[];
begin
  -- Only the kennels the caller owns: a manager of one site never reaches another through this.
  select coalesce(array_agg(x.id), '{}') into v_sites
  from public.my_org_ids_with_role(array['owner']::public.member_role[]) as x (id);
  if cardinality(v_sites) = 0 then
    raise exception 'WB062: The report for all sites is for owners.' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.name,
    o.currency,
    occ.nights,
    occ.day_boarding_days,
    occ.kennel_days,
    occ.kennels_used,
    mon.billed_minor,
    mon.credited_minor,
    mon.received_minor,
    mon.refunded_minor,
    mon.spent_minor,
    due.owed_minor,
    due.bills_owed
  from public.organizations o
  -- Each site's own report, which checks the caller and the period for that site (WB060, WB061).
  cross join lateral (
    select
      coalesce(sum(r.boarding), 0)::integer as nights,
      coalesce(sum(r.day_boarding), 0)::integer as day_boarding_days,
      coalesce(sum(r.capacity), 0)::integer as kennel_days,
      coalesce(sum(r.kennels_used), 0)::integer as kennels_used
    from public.report_occupancy(o.id, p_from, p_to) r
  ) occ
  cross join lateral (
    select
      coalesce(sum(r.billed_minor), 0)::bigint as billed_minor,
      coalesce(sum(r.credited_minor), 0)::bigint as credited_minor,
      coalesce(sum(r.received_minor), 0)::bigint as received_minor,
      coalesce(sum(r.refunded_minor), 0)::bigint as refunded_minor,
      coalesce(sum(r.spent_minor), 0)::bigint as spent_minor
    from public.report_money(o.id, p_from, p_to) r
  ) mon
  -- Owed today, whatever the period, as on the site's own report.
  cross join lateral (
    select coalesce(sum(b.due_minor), 0)::bigint as owed_minor, count(*)::integer as bills_owed
    from public.invoice_balances b
    where b.org_id = o.id and b.status = 'issued' and b.due_minor > 0
  ) due
  where o.id = any (v_sites)
  order by o.name, o.id;
end;
$$;
comment on function public.report_sites(date, date) is
  'All sites (M65): one row for each kennel the caller owns, from that kennel''s own reports over the period: nights and day boarding days sold, kennels available and used summed over the days (for how full), billed, credited, received, refunded and spent, and what is owed on issued bills today. Each row is in its own kennel''s currency; adding them up is done per currency by the reader. Refuses a caller who owns no kennel (WB062); a manager of one site never sees another through it.';

revoke all on function public.check_report_access(uuid, date, date) from public, anon;
revoke all on function public.report_occupancy(uuid, date, date) from public, anon;
revoke all on function public.report_money(uuid, date, date) from public, anon;
revoke all on function public.report_tax(uuid, date, date) from public, anon;
revoke all on function public.report_extras(uuid, date, date) from public, anon;
revoke all on function public.report_food(uuid, date, date) from public, anon;
revoke all on function public.report_food_riders(uuid, date, date) from public, anon;
revoke all on function public.report_food_sources(uuid, date, date) from public, anon;
revoke all on function public.report_sites(date, date) from public, anon;
grant execute on function public.check_report_access(uuid, date, date) to authenticated;
grant execute on function public.report_occupancy(uuid, date, date) to authenticated;
grant execute on function public.report_money(uuid, date, date) to authenticated;
grant execute on function public.report_tax(uuid, date, date) to authenticated;
grant execute on function public.report_extras(uuid, date, date) to authenticated;
grant execute on function public.report_food(uuid, date, date) to authenticated;
grant execute on function public.report_food_riders(uuid, date, date) to authenticated;
grant execute on function public.report_food_sources(uuid, date, date) to authenticated;
grant execute on function public.report_sites(date, date) to authenticated;
