-- =====================================================================
-- PASTE THIS WHOLE FILE INTO THE SUPABASE SQL EDITOR AND RUN IT.
--
-- Two migrations that the J1-J8 walkthrough needs and that are not on
-- the live database yet. Both are idempotent (create or replace) and
-- neither backfills anything, so running it twice is harmless.
--
--  1. commission_type_vocabulary  - BLOCKS J6. Percentage commission
--     has never accrued: the trigger tests the word 'percentage' and no
--     screen has ever written it (they write pct / onetime_pct /
--     monthly_pct). Every referral set up as Percentage earns nothing,
--     silently, and the affiliate dashboard reads 0.
--  2. first_invoice_due_in_3_days - the first subscription invoice was
--     due the day it was issued.
--
-- Each part ends with a read-back that prints what changed.
-- =====================================================================

-- ── 1 of 2 ──────────────────────────────────────────────────────────
-- =====================================================================
-- Percentage commission has never accrued. One word, two vocabularies.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY.
--
-- THE BUG. _accrue_referral_commission fires on a verified wallet top-up
-- and pays a referrer a percentage of it. Its guard is:
--
--     if coalesce(v_link.commission_type,'') <> 'percentage' then
--       return new;
--
-- and NO SCREEN IN THIS APP HAS EVER WRITTEN THE WORD 'percentage'. The
-- admin commission dialog (the only UI that sets this) offers
-- none / onetime / monthly / pct / onetime_pct / monthly_pct /
-- onetime_monthly and stores the value verbatim; both paths that create a
-- referral_links row copy advertisers.commission_type across unchanged.
--
-- So every referral ever set up as "Percentage" earns nothing, silently.
-- The trigger returns `new` — not an error, not a warning, not a log
-- line — and the affiliate's dashboard reads "Commission €0" after their
-- referral has topped up. 'onetime_pct' and 'monthly_pct' are dead the
-- same way.
--
-- WHAT THIS CHANGES: the guard accepts every type that CONTAINS a
-- percentage component. Nothing else in the function is touched — the
-- once-per-(link, topup) idempotency, the reversal branch, the
-- earnings_usd/earnings_eur split and the clamps are byte-for-byte what is
-- live, because this file was generated from it by script.
--
-- WHAT IT DOES NOT DO: it does not backfill. Top-ups that were verified
-- while the guard was wrong accrued nothing, and inventing those rows now
-- would pay commission on money that was already reported as unearned.
-- The read-back at the bottom counts them so you can decide deliberately.
--
-- ROLLBACK: re-apply 20260831220000_money_safety_fixes.sql.
-- =====================================================================

set search_path = public;

create or replace function public._accrue_referral_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advertiser_id uuid;
  v_link          record;
  v_amount        numeric;
  v_dir           int;   -- +1 accrue, -1 reverse
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    v_dir := 1;
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    v_dir := -1;   -- undo: reverse the commission for this topup
  else
    return new;
  end if;

  begin
    select w.advertiser_id into v_advertiser_id
      from public.wallets w
     where w.id = new.wallet_id;
    if v_advertiser_id is null then
      return new;
    end if;

    -- Pick the ACTIVE referral link deterministically (an advertiser
    -- could have an old rejected link + an active one).
    select rl.id,
           rl.tenant_id,
           rl.commission_type,
           rl.commission_pct,
           rl.commission_currency
      into v_link
      from public.referral_links rl
     where rl.referred_advertiser_id = v_advertiser_id
       and coalesce(rl.status, 'active') = 'active'
     order by rl.created_at asc
     limit 1;
    if not found then
      return new;
    end if;

    -- ── EVERY type that CONTAINS a percentage ─────────────────────────
    -- This tested for the single string 'percentage', and no screen in the
    -- app has ever written that word. The admin commission dialog offers a
    -- COMBINATION vocabulary — none / onetime / monthly / pct /
    -- onetime_pct / monthly_pct / onetime_monthly
    -- (components/admin/users/commission-setup-utils.ts) — and stores it
    -- verbatim on advertisers.commission_type, from where both link-creation
    -- paths copy it onto referral_links unchanged.
    --
    -- So a referral set up as "Percentage" carried 'pct', this test failed,
    -- and the trigger returned without a word: no error, no warning, no
    -- commission, ever. The affiliate's screen then reads "Commission €0"
    -- after their referral has topped up, and nothing anywhere says why.
    -- 'onetime_pct' and 'monthly_pct' were dead for the same reason.
    --
    -- The fix is here rather than in the UI because the rows that already
    -- exist say 'pct' and must start working without anybody re-entering
    -- them. lib/commission.ts states the intended convention and is
    -- imported by nothing, which is how the two drifted in the first place.
    if coalesce(v_link.commission_type, '') not in
         ('percentage', 'pct', 'onetime_pct', 'monthly_pct')
       or coalesce(v_link.commission_pct, 0) <= 0 then
      return new;
    end if;

    v_amount := round(new.amount * v_link.commission_pct / 100.0, 2);
    if v_amount <= 0 then
      return new;
    end if;

    if v_dir = 1 then
      -- Accrue once per (link, topup). If it already exists (re-verify
      -- after undo), do nothing.
      if exists (
        select 1 from public.referral_commissions
         where referral_link_id = v_link.id
           and source_wallet_topup_id = new.id
      ) then
        return new;
      end if;

      insert into public.referral_commissions (
        referral_link_id, tenant_id, type, amount, currency, status,
        topup_id, source_wallet_topup_id
      ) values (
        v_link.id, v_link.tenant_id, 'percentage', v_amount,
        coalesce(new.currency, v_link.commission_currency), 'unpaid',
        null, new.id
      );

      if new.currency = 'USD' then
        update public.referral_links
           set earnings_usd = coalesce(earnings_usd, 0) + v_amount
         where id = v_link.id;
      elsif new.currency = 'EUR' then
        update public.referral_links
           set earnings_eur = coalesce(earnings_eur, 0) + v_amount
         where id = v_link.id;
      end if;

    else
      -- Reverse: remove the commission for this topup if it's still
      -- unpaid, and unwind the earnings. A paid-out commission is left
      -- alone (money already left) — flag by leaving it for manual
      -- handling.
      delete from public.referral_commissions
       where referral_link_id = v_link.id
         and source_wallet_topup_id = new.id
         and status = 'unpaid';
      if found then
        if new.currency = 'USD' then
          update public.referral_links
             set earnings_usd = greatest(coalesce(earnings_usd, 0) - v_amount, 0)
           where id = v_link.id;
        elsif new.currency = 'EUR' then
          update public.referral_links
             set earnings_eur = greatest(coalesce(earnings_eur, 0) - v_amount, 0)
           where id = v_link.id;
        end if;
      end if;
    end if;

  exception when others then
    raise warning 'referral accrual skipped for wallet_topup %: %',
      new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- ── What was missed while the guard was wrong ────────────────────────
-- Referral links on a percentage type, and the completed top-ups by their
-- referred advertisers that produced no commission row. This is the list
-- to go through by hand if you decide to pay any of it.
select
  rl.id                                   as referral_link_id,
  a.tenant_client_code                    as referred,
  rl.commission_type,
  rl.commission_pct,
  count(wt.id)                            as completed_topups,
  coalesce(sum(wt.amount) filter (where upper(wt.currency) = 'EUR'), 0) as topped_up_eur,
  coalesce(sum(wt.amount) filter (where upper(wt.currency) = 'USD'), 0) as topped_up_usd
  from public.referral_links rl
  join public.advertisers a on a.id = rl.referred_advertiser_id
  left join public.wallets w on w.advertiser_id = rl.referred_advertiser_id
  left join public.wallet_topups wt
    on wt.wallet_id = w.id
   and wt.status = 'completed'
   and not exists (
     select 1 from public.referral_commissions rc
      where rc.referral_link_id = rl.id
        and rc.source_wallet_topup_id = wt.id
   )
 where coalesce(rl.commission_type, '') in
         ('percentage', 'pct', 'onetime_pct', 'monthly_pct')
   and coalesce(rl.commission_pct, 0) > 0
   and coalesce(rl.status, 'active') = 'active'
 group by rl.id, a.tenant_client_code, rl.commission_type, rl.commission_pct
 order by completed_topups desc;

-- ── 2 of 2 ──────────────────────────────────────────────────────────
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
as $$
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
$$;

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
