-- =====================================================================
-- Yearly plans: pay once, save a fifth, no refund part-way.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. Phase 1 of 2 — this is the engine. The
-- screens that let somebody CHOOSE yearly come next, so applying it alone
-- changes nothing for anybody: every existing subscription is monthly and
-- stays monthly.
--
-- THE SHAPE, as the owner chose it: one plan with a Monthly / Yearly pill
-- under it and a "Save 20%" badge — the way Stripe and most fintech do it
-- — rather than a second plan row per term. So the DISCOUNT lives on the
-- plan and the TERM lives on the subscription.
--
-- WHAT THIS CHANGES IN THE ENGINE
--
--   1. plans.yearly_discount_pct — null or 0 means this plan has no
--      yearly option at all, so the pill does not appear for it.
--   2. subscriptions.billing_period and advertiser_plans.billing_period —
--      'month' (the default, and what every existing row gets) or 'year'.
--   3. The paid trigger advances next_payment_date by twelve months
--      instead of one when the subscription is yearly. It was
--      `+ interval '1 month'`, hard-coded, which would have re-billed a
--      yearly customer every month.
--   4. A yearly subscription is NOT refunded when it is lowered or
--      stopped part-way. It runs to its date and nothing goes back — the
--      owner's rule. Refused in the function, not only on the screen,
--      because the screen is not a boundary.
--
-- WHAT IT DOES NOT DO: it does not touch the auto-debit, the dunning or
-- the grace period. A failed 2,000 euro collection is not the same event
-- as a failed 200 euro one and deserves its own thinking; until then a
-- yearly invoice behaves exactly like a monthly one on that path.
-- =====================================================================

set search_path = public;

-- ── 1. The discount, on the plan ─────────────────────────────────────
alter table public.plans
  add column if not exists yearly_discount_pct numeric(5,2)
    check (yearly_discount_pct is null
           or (yearly_discount_pct >= 0 and yearly_discount_pct < 100));

comment on column public.plans.yearly_discount_pct is
  'Percent off twelve months when paid yearly. NULL or 0 = no yearly option for this plan, and the Monthly/Yearly pill does not appear.';

-- ── 2. The term, on the subscription ─────────────────────────────────
alter table public.subscriptions
  add column if not exists billing_period text not null default 'month';

do $blk0$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'subscriptions_billing_period_chk'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_billing_period_chk
      check (billing_period in ('month', 'year'));
  end if;
end;
$blk0$;

alter table public.advertiser_plans
  add column if not exists billing_period text not null default 'month';

do $blk1$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'advertiser_plans_billing_period_chk'
  ) then
    alter table public.advertiser_plans
      add constraint advertiser_plans_billing_period_chk
      check (billing_period in ('month', 'year'));
  end if;
end;
$blk1$;

-- ── 3. A paid yearly invoice moves the date a YEAR ───────────────────
do $blk2$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = '_on_subscription_invoice_paid'
   limit 1;

  if v_src is null then
    raise notice '_on_subscription_invoice_paid not found — nothing changed.';
    return;
  end if;
  if position('billing_period' in v_src) > 0 then
    raise notice 'Already term-aware — no change.';
    return;
  end if;
  if position('(coalesce(new.period_start, current_date)::date + interval ''1 month'')'
              in v_src) = 0
  then
    raise notice
      'The advance is written differently — patch it by hand, or a yearly customer is billed monthly.';
    return;
  end if;

  execute replace(
    v_src,
    '(coalesce(new.period_start, current_date)::date + interval ''1 month'')',
    '(coalesce(new.period_start, current_date)::date
                + case when billing_period = ''year''
                       then interval ''1 year''
                       else interval ''1 month'' end)'
  );
  raise notice 'A paid yearly invoice now advances a year.';
end;
$blk2$;

-- ── 4. A yearly term is never refunded part-way ──────────────────────
-- change_subscription_amount takes p_refund. For a yearly subscription it
-- is refused outright: the customer keeps the term they bought and
-- nothing goes back. That is the rule, and the screen says so before they
-- pay — an unannounced refusal is where chargebacks come from.
do $blk3$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'change_subscription_amount'
   limit 1;

  if v_src is null then
    raise notice 'change_subscription_amount not found.';
    return;
  end if;
  if position('yearly terms are not refunded' in v_src) > 0 then
    raise notice 'Already refuses a yearly refund — no change.';
    return;
  end if;
  if position('v_sub.next_payment_date' in v_src) = 0 then
    raise notice 'Cannot find a safe insertion point — add the guard by hand.';
    return;
  end if;

  -- Fold the refusal in where the subscription row is already in scope.
  execute replace(
    v_src,
    'v_period := coalesce(v_sub.next_payment_date::date, current_date);',
    'if coalesce(v_sub.billing_period, ''month'') = ''year'' and p_refund then
      raise exception ''A yearly plan runs to its end date — yearly terms are not refunded part-way.''
        using errcode = ''22000'';
    end if;
    v_period := coalesce(v_sub.next_payment_date::date, current_date);'
  );
  raise notice 'A yearly term can no longer be refunded part-way.';
end;
$blk3$;

-- ── Read back ────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='plans'
      and column_name='yearly_discount_pct')              as plans_have_discount,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='subscriptions'
      and column_name='billing_period')                   as subs_have_term,
  (select position('billing_period' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='_on_subscription_invoice_paid')
                                                          as paid_trigger_term_aware,
  (select position('yearly terms are not refunded' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='change_subscription_amount')
                                                          as yearly_refund_refused;

-- Everything that exists is monthly, and stays monthly until somebody is
-- deliberately put on a yearly term.
select billing_period, count(*) as subscriptions
  from public.subscriptions
 group by billing_period;
