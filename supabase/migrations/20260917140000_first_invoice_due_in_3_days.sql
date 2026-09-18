-- =====================================================================
-- The FIRST subscription invoice is due in 3 days, the rest in 7
-- =====================================================================
-- Asked for directly: "hoezo 16 oct — moet binnen 3 dagen na sign up, maar
-- button moet wel blijven, en na normale invoices is het 7 dagen."
--
-- ⚠️ APPLY ON SUPABASE MANUALLY. Read the whole header first — the SELECT at
-- the bottom is a check, not a change, and it is safe to run on its own.
--
-- WHY A TRIGGER AND NOT AN EDIT TO THE BILLING FUNCTION
--
-- Every path that raises a subscription invoice hard-codes
-- `now() + interval '7 days'` — five of them across four repo migrations,
-- and the live database also carries hand-authored functions that appear in
-- no migration at all (this has already bitten us twice: the wallet-topup
-- double credit, and the user_profiles UPDATE policy that was simply
-- missing). Editing each insert means reproducing whole function bodies
-- blind, and missing one means the rule silently does not apply there.
--
-- A BEFORE INSERT trigger applies to every path at once, including the ones
-- we cannot see, and it is one object to reason about.
--
-- WHAT IT DOES NOT DO
--   * It does not touch an invoice that already exists.
--   * It does not touch `subscription_adjustment` — an adjustment is never
--     anybody's first invoice, and shortening its term would punish a
--     customer for upgrading.
--   * It does not change `next_payment_date` on the subscription. The plan
--     still renews monthly; this is only about when the FIRST one has to be
--     paid.
--   * It leaves the due date alone if the insert did not set one, so a code
--     path that deliberately raises an invoice with no term keeps that.
--
-- WHY "first" IS PER ADVERTISER, NOT PER SUBSCRIPTION
-- A customer who cancels and is re-invited gets a new subscription row. They
-- are not a new customer, and they should not get the short term again.
-- =====================================================================

set search_path = public;

create or replace function public._invoice_first_subscription_due_date()
returns trigger
language plpgsql
as $blk0$
begin
  -- Only subscription invoices, only when a term was set at all.
  if new.due_date is null then return new; end if;
  if coalesce(new.type, '') <> 'subscription' then return new; end if;
  if new.advertiser_id is null then return new; end if;

  -- Their FIRST ever subscription invoice: 3 days. Anything after: leave the
  -- 7 days the inserting path chose.
  if not exists (
    select 1
      from public.invoices i
     where i.advertiser_id = new.advertiser_id
       and i.type = 'subscription'
       and coalesce(i.status, '') <> 'void'
  ) then
    new.due_date := now() + interval '3 days';
  end if;

  return new;
end;
$blk0$;

drop trigger if exists trg_invoice_first_subscription_due_date on public.invoices;
create trigger trg_invoice_first_subscription_due_date
  before insert on public.invoices
  for each row execute function public._invoice_first_subscription_due_date();

-- =====================================================================
-- CHECK — read this before and after. It changes nothing.
-- =====================================================================
-- 1. Does invoices.due_date even exist, and is it a timestamp?
-- 2. Which functions hard-code a due-date interval, so we know what the
--    trigger is overriding.
-- 3. Any advertiser who already has exactly one subscription invoice — the
--    trigger will NOT retro-date it, so those keep the term they were given.
select
  (select data_type
     from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invoices'
      and column_name = 'due_date')                       as due_date_type,
  (select count(*)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ilike '%due_date%')                    as functions_setting_a_due_date,
  (select count(*)
     from public.invoices
    where type = 'subscription')                          as subscription_invoices_today,
  (select count(*)
     from pg_trigger
    where tgname = 'trg_invoice_first_subscription_due_date'
      and not tgisinternal)                               as trigger_installed;
