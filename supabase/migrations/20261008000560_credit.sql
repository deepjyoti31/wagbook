-- =============================================================================
-- Wagbook 00056: cancellation rules and credit (Phase 3, M38, D47)
--
--   Rules      for boarding, day boarding and appointments: the notice
--              needed, and what happens to a weekday and to a weekend or
--              holiday night with that notice and without it. The arithmetic
--              night by night is cancellationOutcome() in
--              src/lib/core/cancellation.ts; a manager confirms what it gives.
--   Credit     money a parent keeps with the kennel instead of a refund, or a
--              goodwill gesture: a ledger that ends on a set date, spent on
--              bills as a payment "from credit", never below nothing and
--              never after it ends.
--
-- Row level security for these tables is in 0008 with the rest of the access
-- model, as for every table until the migration freeze.
-- =============================================================================

create type public.cancel_applies_to as enum ('boarding', 'daycare', 'appointment');
comment on type public.cancel_applies_to is 'What a cancellation rule is for: boarding nights, day boarding days, or appointments.';

create type public.cancel_outcome as enum ('refund', 'credit', 'keep');
comment on type public.cancel_outcome is 'What happens to a cancelled night or day: refund (the money goes back), credit (kept as the parent''s credit), keep (the kennel keeps it).';

create table public.cancellation_rules (
  org_id uuid not null references public.organizations (id) on delete cascade,
  applies_to public.cancel_applies_to not null,
  notice_hours smallint not null default 24 check (notice_hours between 0 and 720),
  weekday_on_time public.cancel_outcome not null default 'refund',
  weekday_late public.cancel_outcome not null default 'credit',
  weekend_on_time public.cancel_outcome not null default 'credit',
  weekend_late public.cancel_outcome not null default 'credit',
  updated_at timestamptz not null default now(),
  primary key (org_id, applies_to)
);

comment on table public.cancellation_rules is
  'The kennel''s cancellation rule for boarding, day boarding or appointments (M38). No row: the defaults (24 hours; a weekday refunded with notice, credit otherwise; a weekend or holiday night as credit). cancellationOutcome() applies it night by night.';
comment on column public.cancellation_rules.notice_hours is 'How many hours before a night''s check-in time (or an appointment''s start) the parent must ask, for it to count as on time.';
comment on column public.cancellation_rules.weekday_on_time is 'A weekday night or day cancelled with the notice.';
comment on column public.cancellation_rules.weekday_late is 'A weekday night or day cancelled without the notice.';
comment on column public.cancellation_rules.weekend_on_time is 'A weekend or holiday night or day cancelled with the notice.';
comment on column public.cancellation_rules.weekend_late is 'A weekend or holiday night or day cancelled without the notice.';

create trigger cancellation_rules_set_updated_at
  before update on public.cancellation_rules
  for each row execute function public.set_updated_at();

create type public.credit_kind as enum ('cancellation', 'goodwill');
comment on type public.credit_kind is 'cancellation: kept instead of a refund when a stay or service was cancelled. goodwill: given by an owner or manager, with a reason.';

create table public.credits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  kind public.credit_kind not null,
  amount_minor bigint not null check (amount_minor > 0),
  expires_on date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  payment_id uuid unique,
  booking_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, client_id) references public.clients (org_id, id) on update cascade on delete restrict,
  foreign key (org_id, booking_id) references public.bookings (org_id, id) on delete set null (booking_id),
  constraint credits_cancellation_from_a_payment check ((kind = 'cancellation') = (payment_id is not null))
);

comment on table public.credits is
  'Credit a parent holds with the kennel (M38): an amount, kept from a cancellation (a refund paid "as credit") or given as goodwill, that ends on a day. Spent through payments from credit (credit_uses). Never changed; credit_balances says what is left.';
comment on column public.credits.expires_on is 'The last day it can be spent: organizations.credit_months after it was given.';
comment on column public.credits.payment_id is 'For credit kept from a cancellation: the refund paid "as credit" that made it.';
comment on column public.credits.booking_id is 'The stay it was kept from, if any.';

create index credits_org_client_idx on public.credits (org_id, client_id, expires_on);

create trigger credits_stamp_actor
  before insert on public.credits
  for each row execute function public.stamp_actor('created_by');

create table public.credit_uses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  credit_id uuid not null,
  payment_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  created_at timestamptz not null default now(),
  foreign key (org_id, credit_id) references public.credits (org_id, id) on delete restrict
);

comment on table public.credit_uses is
  'What a payment from credit took from each credit, the soonest to end first. Written only by payments_credit(), never changed; removing the payment gives the credit back.';

create index credit_uses_org_credit_idx on public.credit_uses (org_id, credit_id);
create index credit_uses_payment_idx on public.credit_uses (payment_id);

alter table public.credits add constraint credits_payment_fkey foreign key (payment_id) references public.payments (id) on delete cascade;
alter table public.credit_uses add constraint credit_uses_payment_fkey foreign key (payment_id) references public.payments (id) on delete cascade;

-- What each credit has left: its amount less what payments took, and whether
-- it can still be spent today.
create view public.credit_balances
with (security_invoker = true)
as
select
  c.id as credit_id,
  c.org_id,
  c.client_id,
  c.kind,
  c.amount_minor,
  c.expires_on,
  c.reason,
  c.created_at,
  (c.amount_minor - coalesce(u.used, 0))::bigint as left_minor,
  c.expires_on >= public.org_today(c.org_id) as spendable
from public.credits c
left join lateral (
  select sum(cu.amount_minor) as used from public.credit_uses cu where cu.org_id = c.org_id and cu.credit_id = c.id
) u on true;

comment on view public.credit_balances is 'Each credit with what is left of it and whether it can still be spent (not past its end).';

-- Payments that move credit, not money. A refund paid "as credit" keeps the
-- money as the parent's credit, ending after the kennel's months. A payment
-- "from credit" takes from the parent's credits that can still be spent, the
-- soonest to end first, and is refused when they do not have enough.
-- SECURITY DEFINER: the ledger is written only here (no one may insert a use,
-- or a cancellation credit, directly); the payment itself was already checked
-- by the payments policies and payments_check_refund.
create function public.payments_credit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_need bigint := new.amount_minor;
  v_lot record;
  v_take bigint;
  v_months smallint;
begin
  if new.method <> 'credit' then
    return null;
  end if;
  -- Credit pays for something: spent on no bill and no stay, it would be gone with nothing to show for it.
  if new.direction = 'in' and new.invoice_id is null and new.booking_id is null then
    raise exception 'WB214: credit is spent on a bill or a stay' using errcode = '23514';
  end if;
  -- One at a time per parent, so two payments cannot both take the last of it.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('credit:' || new.client_id::text, 0));
  if new.direction = 'out' then
    select o.credit_months into v_months from public.organizations o where o.id = new.org_id;
    insert into public.credits (org_id, client_id, kind, amount_minor, expires_on, reason, payment_id, booking_id, created_by)
    values (new.org_id, new.client_id, 'cancellation', new.amount_minor,
            (public.org_today(new.org_id) + make_interval(months => v_months))::date,
            coalesce(nullif(btrim(new.note), ''), 'Kept as credit'), new.id, new.booking_id, (select auth.uid()));
    return null;
  end if;
  for v_lot in
    select b.credit_id, b.left_minor
    from public.credit_balances b
    where b.org_id = new.org_id and b.client_id = new.client_id and b.spendable and b.left_minor > 0
    order by b.expires_on, b.created_at
  loop
    exit when v_need = 0;
    v_take := least(v_need, v_lot.left_minor);
    insert into public.credit_uses (org_id, credit_id, payment_id, amount_minor) values (new.org_id, v_lot.credit_id, new.id, v_take);
    v_need := v_need - v_take;
  end loop;
  if v_need > 0 then
    raise exception 'WB211: there is only % of credit left to spend', (new.amount_minor - v_need) using errcode = '23514';
  end if;
  return null;
end;
$$;
comment on function public.payments_credit() is
  'Trigger: a refund paid as credit (method credit, out) becomes a credit ending after the kennel''s credit_months; a payment from credit (method credit, in) pays a bill or a stay (WB214) and takes from the parent''s credits still spendable, the soonest to end first, and is refused when there is not enough (WB211).';

create trigger payments_credit
  after insert on public.payments
  for each row execute function public.payments_credit();

-- A payment that moved credit is never changed: remove it (an owner) and record it again.
create function public.payments_guard_credit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.method = 'credit' or new.method = 'credit')
     and (new.method is distinct from old.method or new.amount_minor is distinct from old.amount_minor
          or new.direction is distinct from old.direction or new.client_id is distinct from old.client_id)
     and coalesce(current_setting('wagbook.merging', true), '') <> 'on' then
    raise exception 'WB212: a payment from or into credit is not changed. Remove it and record it again.' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.payments_guard_credit() is
  'Trigger: a payment from or into credit keeps its method, amount, direction and parent (WB212), so the ledger always matches it.';

create trigger payments_guard_credit
  before update on public.payments
  for each row execute function public.payments_guard_credit();

-- Credit a parent gives is only goodwill when added by hand; credit kept from a
-- cancellation comes only from a refund paid as credit (payments_credit).
create function public.credits_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'cancellation' and coalesce(current_user, '') = 'authenticated'
     and not exists (select 1 from public.payments p where p.id = new.payment_id and p.method = 'credit' and p.direction = 'out') then
    raise exception 'WB213: credit from a cancellation comes from a refund kept as credit' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function public.credits_check() is 'Trigger: a cancellation credit is only ever made from a refund paid as credit (WB213); credit added by hand is goodwill.';

create trigger credits_check
  before insert on public.credits
  for each row execute function public.credits_check();
