-- =====================================================================
-- One unpaid subscription invoice at a time.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY.
--
-- WHAT HAPPENED. subscription_billing_run raises one invoice per PERIOD:
--
--     if exists (select 1 from invoices
--                 where subscription_id = r.id and period_start = v_period)
--     then continue;
--
-- In ordinary operation that is enough, because next_payment_date only
-- advances when an invoice is PAID. But anything that moves that date
-- while an invoice is still unpaid mints a second one for a new period,
-- and the customer is shown two bills for one month.
--
-- Three ways to move it: reactivating a plan that was disabled, an admin
-- editing the date, and — today — a hand-written UPDATE setting it to
-- now() so the first invoice would finally be raised. That last one is
-- how PSM0005 ended up with two unpaid EUR 5 invoices, due a day apart.
--
-- It also covers the walk-forward the review found: a plan disabled for
-- three months and then reactivated generated three invoices in a row and
-- auto-debited each of them. With this guard it raises the first, waits
-- for it to be paid, and moves on — which is what a monthly plan means.
--
-- THE GUARD. Do not raise a subscription invoice while that subscription
-- already has an unpaid one. Period remains the deduplication key for the
-- ordinary path; this is the second condition.
--
-- ROLLBACK: re-apply 20260901380000_subscription_billing.sql.
-- =====================================================================

set search_path = public;

do $blk0$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'subscription_billing_run'
   limit 1;

  if v_src is null then
    raise exception 'subscription_billing_run not found';
  end if;

  if position('i.subscription_id = r.id and i.period_start = v_period' in v_src) = 0
  then
    raise notice 'Guard written differently — no change made. Check by hand.';
    return;
  end if;

  execute replace(
    v_src,
    'i.subscription_id = r.id and i.period_start = v_period',
    'i.subscription_id = r.id
         and (i.period_start = v_period
              or i.status = ''unpaid'')'
  );
  raise notice 'Billing run will not add a second unpaid invoice.';
end;
$blk0$;

-- ── Clean up the duplicates that already exist ───────────────────────
-- For each subscription with MORE THAN ONE unpaid subscription invoice,
-- keep the NEWEST and void the rest. Newest, because it is the one the
-- customer's screen offers to pay and the one whose amount reflects the
-- current plan.
--
-- period_start is detached on the way out, the same thing
-- change_subscription_amount does, so the unique index on (subscription,
-- period) does not block a future invoice for that month.
with ranked as (
  select
    i.id,
    row_number() over (
      partition by i.subscription_id
      order by i.created_at desc
    ) as rn
    from public.invoices i
   where i.type = 'subscription'
     and i.status = 'unpaid'
     and i.subscription_id is not null
),
voided as (
  update public.invoices i
     set status = 'void', period_start = null
    from ranked r
   where r.id = i.id
     and r.rn > 1
  returning i.id
)
select count(*) as duplicate_invoices_voided from voided;

-- ── Read back ────────────────────────────────────────────────────────
-- guard_installed must be true, and no subscription may hold more than
-- one unpaid invoice.
select
  (pg_get_functiondef(p.oid) like '%i.status = ''unpaid''%') as guard_installed
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'subscription_billing_run';

select
  subscription_id,
  count(*) as unpaid_now
  from public.invoices
 where type = 'subscription'
   and status = 'unpaid'
   and subscription_id is not null
 group by subscription_id
having count(*) > 1;
