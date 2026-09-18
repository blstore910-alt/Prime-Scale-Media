-- =====================================================================
-- A new customer's FIRST subscription invoice is raised on signup.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY.
--
-- WHAT IS BROKEN. create_subscription_from_invite sets
--
--     next_payment_date = now() + interval '1 month'
--
-- and subscription_billing_run() raises an invoice only when that date has
-- arrived. So a customer who signs up today has an ACTIVE subscription and
-- no invoice for a month. Nothing else makes one — the admin "Create
-- Invoice" dialog always writes type 'manual_invoice'.
--
-- WHAT IT COSTS, beyond the obvious. The advertiser's billing card reads
-- "No subscription invoice due" with Pay now disabled, and — because
-- requesting an ad account requires a PAID subscription invoice — the
-- Request button is disabled too, saying "Your plan has to be active
-- first". A paying customer can do nothing on their first day, and the
-- reason is a date a month away that nobody can see.
--
-- THE FIX. The subscription starts due NOW, so the first invoice is raised
-- by the next billing run rather than in thirty days. The existing
-- first-invoice-due trigger (20260917140000) then gives it a 3-day due
-- date, which is what that migration was written for.
--
-- A FREE PLAN (amount 0) still gets no subscription and no invoice — that
-- is deliberate and unchanged: v_fee = 0 returns before the insert.
--
-- BACKFILL. Customers who signed up before this and are sitting in the
-- month-long gap are moved to due-now as well, so the same billing run
-- catches them. Only subscriptions that have NEVER been invoiced, so
-- nobody is billed twice.
--
-- ROLLBACK: re-apply 20260901500000_referral_link_from_invite.sql.
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
     and p.proname = 'create_subscription_from_invite'
   limit 1;

  if v_src is null then
    raise exception 'create_subscription_from_invite not found';
  end if;

  if position('now() + interval ''1 month''' in v_src) = 0 then
    raise notice 'Already due-on-signup (or written differently) — no change.';
    return;
  end if;

  execute replace(
    v_src,
    'now() + interval ''1 month''',
    -- Due immediately: the first run raises the first invoice.
    'now()'
  );
  raise notice 'First invoice will now be raised on signup.';
end;
$blk0$;

-- ── Backfill the ones already stuck in the gap ───────────────────────
with stuck as (
  update public.subscriptions s
     set next_payment_date = now()
   where s.status = 'active'
     and s.next_payment_date > now()
     and s.amount > 0
     and not exists (
       select 1 from public.invoices i
        where i.subscription_id = s.id
          and i.type = 'subscription'
     )
  returning s.id
)
select count(*) as subscriptions_unblocked from stuck;

-- ── Read back ────────────────────────────────────────────────────────
-- due_now is how many will be invoiced by the next billing run. Run
--     select subscription_billing_run();
-- to raise them immediately rather than waiting for the cron.
select
  (pg_get_functiondef(p.oid) not like '%interval ''1 month''%')
                                                   as due_on_signup,
  (select count(*) from public.subscriptions
    where status = 'active' and amount > 0 and next_payment_date <= now())
                                                   as due_now
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'create_subscription_from_invite';
