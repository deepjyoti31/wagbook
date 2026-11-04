-- =============================================================================
-- Wagbook 20261104000100: fixes from the review of 4 November 2026
--
-- 1. A credit note takes back no more at a tax rate than the bill charged at
--    that rate.
-- 2. A check-out is undone only on its day and before its bill is issued.
--
-- The first migration made after the freeze (docs/HANDOFF.md): the migrations
-- before it are never edited.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Credit notes, rate by rate
--
-- issue_credit_note() kept a credit note within what is left of its bill in
-- all and in taxable value, and at a rate the bill charged. On a bill with
-- lines at two rates (an 18% stay and a 5% food line, or a 0% line), that let
-- a credit note at the higher rate take back value billed at the lower one,
-- and so more tax than the bill ever charged at that rate: wrong in a tax
-- return. Now each rate is held to its own lines.
-- ---------------------------------------------------------------------------

create function public.credit_note_lines_within_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_invoice uuid;
  v_billed bigint;
  v_credited bigint;
begin
  select cn.invoice_id into v_invoice
  from public.credit_notes cn
  where cn.org_id = new.org_id and cn.id = new.credit_note_id;

  -- What the bill charged at this rate, before tax.
  select coalesce(sum(l.taxable_minor), 0)::bigint into v_billed
  from public.invoice_lines l
  where l.org_id = new.org_id and l.invoice_id = v_invoice and l.tax_rate_bp = new.tax_rate_bp;

  -- What its credit notes take back at this rate, this line included.
  select coalesce(sum(cl.taxable_minor), 0)::bigint into v_credited
  from public.credit_note_lines cl
  join public.credit_notes cn on cn.org_id = cl.org_id and cn.id = cl.credit_note_id
  where cn.org_id = new.org_id and cn.invoice_id = v_invoice and cl.tax_rate_bp = new.tax_rate_bp;

  if v_credited > v_billed then
    raise exception 'WB097: a credit note cannot take back more at a tax rate than the bill charged at that rate' using errcode = '23514';
  end if;
  return null;
end;
$$;
comment on function public.credit_note_lines_within_rate() is
  'Trigger: the credit notes of a bill never take back more taxable value at a tax rate than the bill''s lines at that rate (WB097), so no credit note gives back tax the bill did not charge.';

revoke all on function public.credit_note_lines_within_rate() from public, anon;

create trigger credit_note_lines_within_rate
  after insert on public.credit_note_lines
  for each row execute function public.credit_note_lines_within_rate();

-- ---------------------------------------------------------------------------
-- 2. Undoing a check-out (M66)
--
-- Undo check-out puts a pet checked out by mistake back in house, on the day
-- of the check-out and while the stay's bill is not issued. Only the app held
-- to that: anyone could put a stay that went home weeks ago, and was billed,
-- back in house through the API, holding its kennel and making care again.
-- Now the database holds to it, for everyone.
-- ---------------------------------------------------------------------------

create function public.bookings_check_undo_check_out()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'checked_out' and new.status = 'checked_in'
     and (old.checked_out_at is null
          or (old.checked_out_at at time zone (select o.time_zone from public.organizations o where o.id = old.org_id))::date
             <> public.org_today(old.org_id)
          or exists (
            select 1 from public.invoices i
            where i.org_id = old.org_id and i.status = 'issued'
              and (i.booking_id = old.id
                   or i.group_id = old.group_id
                   or (i.series_id = old.series_id and i.series_month = date_trunc('month', old.start_date)::date))))
  then
    raise exception 'WB028: only a check-out made today, with no bill issued yet, can be undone' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.bookings_check_undo_check_out() is
  'Trigger: a checked out stay goes back to checked in (Undo check-out, M66) only on the kennel''s day of the check-out and while no bill for it (its own, its family''s or its month of a series) is issued (WB028).';

revoke all on function public.bookings_check_undo_check_out() from public, anon;

create trigger bookings_check_undo_check_out
  before update of status on public.bookings
  for each row execute function public.bookings_check_undo_check_out();
