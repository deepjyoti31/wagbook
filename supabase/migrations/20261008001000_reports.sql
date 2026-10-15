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
returns table (day date, boarding integer, day_boarding integer, capacity integer)
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
    (select count(*)::integer from public.kennels k where k.org_id = p_org and k.is_active)
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
  'For each day: pets staying the night (boarding), pets in for the day (day boarding), and kennels in service today. Counts stays that happened or are booked; not requests, cancellations or no-shows. A boarding stay counts on its nights, so not on its check-out day. Owners and managers only.';

-- ---------------------------------------------------------------------------

create function public.report_money(p_org uuid, p_from date, p_to date)
returns table (
  month date,
  billed_minor bigint,
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
  paid as (
    select date_trunc('month', p.received_on)::date as month,
           sum(p.amount_minor) filter (where p.direction = 'in') as received,
           sum(p.amount_minor) filter (where p.direction = 'out') as refunded
    from public.payments p
    where p.org_id = p_org and p.received_on between p_from and p_to
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
    coalesce(b.tax, 0)::bigint,
    coalesce(b.n, 0)::integer,
    coalesce(p.received, 0)::bigint,
    coalesce(p.refunded, 0)::bigint,
    coalesce(s.total, 0)::bigint
  from months m
  left join billed b on b.month = m.month
  left join paid p on p.month = m.month
  left join spent s on s.month = m.month
  order by m.month;
end;
$$;
comment on function public.report_money(uuid, date, date) is
  'For each month in the period: what was billed (issued bills by bill date; cancelled bills left out) and the tax in it, payments received and refunded (by the date the money moved), and expenses (by the date spent). Only days inside the period count, so a period that starts mid-month gives a part month. Owners and managers only.';

-- ---------------------------------------------------------------------------

create function public.report_tax(p_org uuid, p_from date, p_to date)
returns table (
  tax_rate_bp integer,
  bills integer,
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
  return query
  select
    l.tax_rate_bp,
    count(distinct i.id)::integer,
    sum(l.taxable_minor)::bigint,
    sum(l.cgst_minor)::bigint,
    sum(l.sgst_minor)::bigint,
    sum(l.igst_minor)::bigint,
    sum(l.tax_minor)::bigint
  from public.invoices i
  join public.invoice_lines l on l.org_id = i.org_id and l.invoice_id = i.id
  where i.org_id = p_org and i.status = 'issued' and i.issued_on between p_from and p_to
  group by l.tax_rate_bp
  order by l.tax_rate_bp;
end;
$$;
comment on function public.report_tax(uuid, date, date) is
  'Tax on issued bills in the period, by rate: the value taxed and the tax (CGST, SGST and IGST under India GST). Bills are counted by bill date; cancelled bills are left out. Owners and managers only.';

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

revoke all on function public.check_report_access(uuid, date, date) from public, anon;
revoke all on function public.report_occupancy(uuid, date, date) from public, anon;
revoke all on function public.report_money(uuid, date, date) from public, anon;
revoke all on function public.report_tax(uuid, date, date) from public, anon;
revoke all on function public.report_extras(uuid, date, date) from public, anon;
grant execute on function public.check_report_access(uuid, date, date) to authenticated;
grant execute on function public.report_occupancy(uuid, date, date) to authenticated;
grant execute on function public.report_money(uuid, date, date) to authenticated;
grant execute on function public.report_tax(uuid, date, date) to authenticated;
grant execute on function public.report_extras(uuid, date, date) to authenticated;
