-- =====================================================================
-- PSM invariant check — run after any testing session
-- =====================================================================
-- Paste the whole file into the Supabase SQL editor and run it.
--
-- The editor only shows the LAST statement's result, so this is written as
-- ONE query returning one row per check. Read it left to right: every column
-- ending in _must_be_0 has to be 0, and `verdict` says so in words.
--
-- Nothing here writes. Safe to run any time, including on a live tenant.
-- =====================================================================

with
-- 1. Exactly one ACTIVE exchange-rate row per tenant.
--    Every reader does .eq("is_active", true).maybeSingle(), which ERRORS on
--    a second row — and from that moment the app cannot convert currency at
--    all. Saving rates twice used to insert rather than replace.
rates as (
  select count(*) as bad
    from (
      select tenant_id
        from public.exchange_rates
       where is_active
       group by tenant_id
      having count(*) <> 1
    ) t
),

-- 2. No supplier provenance on a customer-readable row.
--    Advertisers read their own ad_accounts with select("*"), so anything
--    here reaches their browser. The supplier must never be visible to a
--    customer under any name.
supplier_leak as (
  select count(*) as bad
    from public.ad_accounts
   -- ::jsonb because the ?| operator exists only for jsonb, and these
   -- columns are plain json on the live database.
   where metadata::jsonb ?| array['source', 'supplier_external_id', 'allocated_from_pool_id']
),

-- 3. No staff PII on customer-readable rows.
--    top_ups and topup_logs are both readable by the advertiser who owns
--    them. `author` carries the profile id and nothing else.
staff_leak as (
  select
    (select count(*) from public.top_ups
      where author is not null
        and (author::jsonb ? 'email' or author::jsonb ? 'name'))
    +
    (select count(*) from public.topup_logs
      where author is not null
        and (author::jsonb ? 'email' or author::jsonb ? 'name')) as bad
),

-- 4. Never refunded more for a period than was collected for it.
--    change_subscription_amount could pay out the same money on every
--    up-then-down cycle. Each payout is now recorded; this compares the sum
--    of payouts against the invoice they were clamped to.
refunds as (
  select count(*) as bad
    from (
      select
        wa.reference,
        sum(wa.delta) as refunded,
        max(i.total)  as collected
        from public.wallet_adjustments wa
        join public.invoices i
          on i.id::text = split_part(wa.reference, ':', 2)
       where wa.reference like 'subscription_change_refund:%'
         and wa.status = 'approved'
       group by wa.reference
      having sum(wa.delta) > max(i.total)
    ) t
),

-- 5. No integration job abandoned mid-flight.
--    A job left in 'processing' is a funded top-up the supplier was never
--    told about. The worker reclaims them after a 10-minute lease, so
--    anything older than 15 minutes means the reaper is not running.
stuck_jobs as (
  select count(*) as bad
    from public.integration_jobs
   where status = 'processing'
     and coalesce(updated_at, created_at) < now() - interval '15 minutes'
),

-- 6. The owner-only bank tables are actually owner-only.
--    Expect the four bank_accounts policies plus bank_ledger_owner_all, and
--    NEITHER of the two old permissive ones. A server action is not a
--    boundary when the table under it is open.
bank_rls as (
  select count(*) as bad
    from pg_policies
   where schemaname = 'public'
     and policyname in ('bank_accounts_admin_write', 'bank_ledger_admin_all')
),

-- 7. Money jobs waiting while the gate is shut.
--    Not a fault — but arming SUPPLIER1_AUTOPUSH releases ALL of these at
--    once, within 60 seconds. Know the number before you open the gate.
held_money_jobs as (
  select count(*) as n
    from public.integration_jobs
   where provider = 'supplier1'
     and operation in ('push_topup', 'push_withdraw')
     and status in ('pending', 'processing')
)

select
  rates.bad          as tenants_with_wrong_active_rate_count_must_be_0,
  supplier_leak.bad  as ad_accounts_leaking_supplier_must_be_0,
  staff_leak.bad     as rows_leaking_staff_pii_must_be_0,
  refunds.bad        as periods_over_refunded_must_be_0,
  stuck_jobs.bad     as jobs_stuck_processing_must_be_0,
  bank_rls.bad       as permissive_bank_policies_must_be_0,
  held_money_jobs.n  as money_jobs_waiting_on_the_gate,
  case
    when rates.bad + supplier_leak.bad + staff_leak.bad + refunds.bad
       + stuck_jobs.bad + bank_rls.bad = 0
    then 'ALL CLEAR'
    else 'SOMETHING IS WRONG — read the columns above'
  end as verdict
  from rates, supplier_leak, staff_leak, refunds, stuck_jobs, bank_rls, held_money_jobs;
