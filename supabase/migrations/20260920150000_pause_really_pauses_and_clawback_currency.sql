-- =====================================================================
-- Pause really pauses, and a clawback finds the money it is clawing
-- =====================================================================
-- Two faults the 2026-09-20 sweep found, both of which move money.
--
-- 1. A PAUSED SUBSCRIPTION WAS STILL COLLECTED.
--    The auto-debit loop in 20260901380000_subscription_billing.sql
--    joins subscriptions and filters only `s.status <> 'cancelled'`.
--    `paused` is not cancelled, so the cron called
--    invoice_pay_from_wallet on it -- and the paid-trigger then wrote
--    `status = 'active'`, so paying the invoice silently un-paused the
--    plan. An admin who pauses a customer on the 3rd watches EUR 200
--    leave their wallet on the 8th and the plan read active again.
--
-- 2. PAUSING DID NOT STOP THE CLOCK.
--    next_payment_date only advances when an invoice is PAID, and
--    pausing writes no date. So a plan paused on 1 Feb and resumed on
--    1 May had next_payment_date = 1 Feb: the generate loop raised
--    February, then March, then April, one per run. Three months of
--    nothing, invoiced and auto-debited.
--
--    The owner's decision (2026-09-20): paused months are never
--    invoiced. Resuming starts from today. (Mid-month plan CHANGES stay
--    a whole month, deliberately -- that is a separate decision and it
--    is not touched here.)
--
-- 3. A CLAWBACK NEVER FIRED FOR A CUSTOMER WHO TOPPED UP IN EUR.
--    20260919100000 forces ad_account_withdrawals.currency to 'USD' by
--    trigger -- correctly, an ad-account balance is USD. The clawback
--    then took that USD as the currency for EVERYTHING: it looked for
--    the customer's USD wallet top-up volume, found none because they
--    fund in euros, and returned 0 at the first gate. A referred
--    customer could put in EUR 40,000, earn the affiliate EUR 2,000,
--    take USD 10,000 back off an ad account, and the affiliate kept the
--    lot.
--
--    The denominator has to be in the same unit as the amount coming
--    back. For a withdrawal that is USD, so it is measured against what
--    ever actually went ONTO ad accounts (top_ups.topup_amount, USD by
--    construction). A wallet refund still carries its own wallet's
--    currency and is unchanged.
--
--    And the clawback is then taken from the currency the affiliate
--    actually has standing earnings in, rather than from the currency
--    the money happened to come back in.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

-- ── 1. Paying an invoice must not un-pause a plan ────────────────────
create or replace function public._on_subscription_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk0$
begin
  if new.status = 'paid'
     and coalesce(old.status, '') is distinct from 'paid'
     and new.subscription_id is not null then
    begin
      update public.subscriptions
         set status =
               case
                 -- cancelled stays cancelled; paused stays PAUSED. It
                 -- used to become 'active' here, so settling an invoice
                 -- raised before the pause silently restarted billing.
                 when status in ('cancelled', 'paused') then status
                 else 'active'
               end,
             next_payment_date =
               (coalesce(new.period_start, current_date)::date + interval '1 month'),
             updated_at = now()
       where id = new.subscription_id;
    exception when others then
      raise warning 'subscription advance failed for invoice %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$blk0$;

drop trigger if exists trg_on_subscription_invoice_paid on public.invoices;
create trigger trg_on_subscription_invoice_paid
  after update of status on public.invoices
  for each row execute function public._on_subscription_invoice_paid();

-- ── 2. Resuming skips the months it was off ──────────────────────────
-- Called by the resume path. Walks next_payment_date forward in whole
-- months until it is in the future, so the generate loop has nothing
-- historical to raise. Whole months, not "today", so the customer keeps
-- their billing day.
create or replace function public.subscription_resume_skips_paused_months(
  p_subscription_id uuid
) returns date
language plpgsql
security definer
set search_path = public
as $blk1$
declare
  v_next date;
  v_guard int := 0;
begin
  select next_payment_date::date into v_next
    from public.subscriptions
   where id = p_subscription_id;

  if v_next is null then
    return null;
  end if;

  -- A guard, not a while(true): a corrupt date must not spin.
  while v_next <= current_date and v_guard < 600 loop
    v_next := (v_next + interval '1 month')::date;
    v_guard := v_guard + 1;
  end loop;

  update public.subscriptions
     set next_payment_date = v_next,
         updated_at = now()
   where id = p_subscription_id;

  return v_next;
end;
$blk1$;

revoke all on function public.subscription_resume_skips_paused_months(uuid)
  from public, anon;
grant execute on function public.subscription_resume_skips_paused_months(uuid)
  to authenticated;

-- ── 3. SUPERSEDED: this block targets a function nothing calls ───────
-- The live billing cron calls subscription_billing_run(), not
-- process_recurring_subscriptions (vercel.json, 03:00). And
-- subscription_billing_run ALREADY excludes paused from both loops:
-- it generates for ('active','past_due') and collects where status is
-- not in ('cancelled','inactive','paused'). So this block is a no-op
-- against the engine that runs, and its report line will read
-- "NOT APPLIED" for a fault that does not exist. Left in place because
-- it is harmless and idempotent; do not act on its verdict.
-- ── 3. The billing run leaves a paused plan alone ────────────────────
-- Both loops. GENERATE already filtered to active/past_due; AUTO-DEBIT
-- did not, which is the hole. Rather than re-author the whole function
-- (its body is long and live-only in places), the auto-debit join gets
-- the missing condition by replacing the one predicate.
do $blk2$
declare
  v_src  text;
  v_new  text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'process_recurring_subscriptions'
   limit 1;

  if v_src is null then
    raise notice 'OVERGESLAGEN: process_recurring_subscriptions bestaat niet';
    return;
  end if;

  if position('s.status not in (''cancelled'', ''paused'')' in v_src) > 0 then
    raise notice 'AL GEDAAN: de auto-debit loop slaat paused al over';
    return;
  end if;

  if position('s.status <> ''cancelled''' in v_src) = 0 then
    raise notice 'OVERGESLAGEN: de verwachte regel staat er niet in';
    return;
  end if;

  v_new := replace(
    v_src,
    's.status <> ''cancelled''',
    's.status not in (''cancelled'', ''paused'')'
  );
  execute v_new;
  raise notice 'GELUKT: de auto-debit loop slaat paused nu over';
end;
$blk2$;

-- ── 4. The clawback measures against the right money ─────────────────
create or replace function public._claw_back_referral_commission(
  p_advertiser_id uuid,
  p_amount numeric,
  p_currency text,
  p_source text,
  p_source_id uuid,
  p_reason text default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $blk3$
declare
  v_link_id     uuid;
  v_link_tenant uuid;
  v_src_cur   text := upper(coalesce(p_currency, 'EUR'));
  v_cur       text;
  v_volume    numeric := 0;
  v_earned    numeric := 0;
  v_clawed    numeric := 0;
  v_stand_eur numeric := 0;
  v_stand_usd numeric := 0;
  v_share     numeric := 0;
  v_amount    numeric := 0;
begin
  if p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  select rl.id, rl.tenant_id into v_link_id, v_link_tenant
    from public.referral_links rl
   where rl.referred_advertiser_id = p_advertiser_id
   order by rl.created_at
   limit 1;
  if not found then
    return 0;
  end if;

  -- ── THE DENOMINATOR IN THE SAME UNIT AS THE AMOUNT ────────────────
  --
  -- An ad-account withdrawal is USD by trigger, so it is measured
  -- against what ever went ONTO ad accounts -- top_ups.topup_amount is
  -- USD for every payment currency. Matching it against USD WALLET
  -- top-ups was the bug: a customer who funds in euros has none, the
  -- volume was 0, and the function returned at the first gate.
  --
  -- A wallet refund carries its own wallet's currency, so that side
  -- keeps the wallet-top-up denominator it always had.
  if p_source = 'ad_account_withdrawal' then
    select coalesce(sum(t.topup_amount), 0) into v_volume
      from public.top_ups t
     where t.advertiser_id = p_advertiser_id
       and t.status = 'completed'
       and coalesce(t.is_deleted, false) = false;
  else
    select coalesce(sum(wt.amount), 0) into v_volume
      from public.wallet_topups wt
      join public.wallets w on w.id = wt.wallet_id
     where w.advertiser_id = p_advertiser_id
       and wt.status = 'completed'
       and upper(coalesce(wt.currency, 'EUR')) = v_src_cur;
  end if;

  if v_volume <= 0 then
    return 0;
  end if;

  -- What is still standing, per currency. upper() on both sides: the
  -- clawbacks side used to compare a raw column against an uppercased
  -- variable, so a lower-case row never matched its own history.
  select
    coalesce(sum(case when upper(coalesce(rc.currency, 'EUR')) = 'EUR'
                      then rc.amount else 0 end), 0),
    coalesce(sum(case when upper(coalesce(rc.currency, 'EUR')) = 'USD'
                      then rc.amount else 0 end), 0)
    into v_stand_eur, v_stand_usd
    from public.referral_commissions rc
   where rc.referral_link_id = v_link_id;

  select
    v_stand_eur - coalesce(sum(case when upper(coalesce(cb.currency, 'EUR')) = 'EUR'
                                    then cb.amount else 0 end), 0),
    v_stand_usd - coalesce(sum(case when upper(coalesce(cb.currency, 'EUR')) = 'USD'
                                    then cb.amount else 0 end), 0)
    into v_stand_eur, v_stand_usd
    from public.referral_clawbacks cb
   where cb.referral_link_id = v_link_id;

  -- Claw back from the currency the affiliate actually holds. The
  -- source currency first when there is something there; otherwise the
  -- other one. referral_clawbacks is unique on (source, source_id), so
  -- this is one row and one currency by design.
  if v_src_cur = 'USD' and v_stand_usd > 0 then
    v_cur := 'USD'; v_earned := v_stand_usd;
  elsif v_src_cur = 'EUR' and v_stand_eur > 0 then
    v_cur := 'EUR'; v_earned := v_stand_eur;
  elsif v_stand_eur > 0 then
    v_cur := 'EUR'; v_earned := v_stand_eur;
  elsif v_stand_usd > 0 then
    v_cur := 'USD'; v_earned := v_stand_usd;
  else
    return 0;   -- nothing standing in either currency
  end if;

  v_clawed := 0;   -- already netted off above

  v_share := least(p_amount / v_volume, 1);
  v_amount := round((v_earned * v_share)::numeric, 2);
  v_amount := least(v_amount, round(v_earned::numeric, 2));
  if v_amount <= 0 then
    return 0;
  end if;

  insert into public.referral_clawbacks
    (tenant_id, referral_link_id, advertiser_id, amount, currency,
     source, source_id, returned_amount, topup_volume, share, reason)
  values
    (v_link_tenant, v_link_id, p_advertiser_id, v_amount, v_cur,
     p_source, p_source_id, round(p_amount::numeric, 2),
     round(v_volume::numeric, 2), round(v_share, 4), p_reason)
  on conflict (source, source_id) do nothing;

  if not found then
    return 0;   -- already clawed back for this row
  end if;

  if v_cur = 'USD' then
    update public.referral_links
       set earnings_usd = greatest(coalesce(earnings_usd, 0) - v_amount, 0),
           updated_at = now()
     where id = v_link_id;
  else
    update public.referral_links
       set earnings_eur = greatest(coalesce(earnings_eur, 0) - v_amount, 0),
           updated_at = now()
     where id = v_link_id;
  end if;

  return v_amount;
end;
$blk3$;

revoke all on function public._claw_back_referral_commission(uuid, numeric, text, text, uuid, text)
  from public, anon, authenticated;

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
select
  'paying an invoice no longer un-pauses' as item,
  case
    when position('''cancelled'', ''paused''' in
      coalesce((
        select pg_get_functiondef(p.oid) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = '_on_subscription_invoice_paid'
        limit 1), '')) > 0
    then 'OK' else 'NOT APPLIED'
  end as status
union all
select
  'the auto-debit loop skips paused',
  case
    when position('not in (''cancelled'', ''paused'')' in
      coalesce((
        select pg_get_functiondef(p.oid) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'process_recurring_subscriptions'
        limit 1), '')) > 0
    then 'OK' else 'NOT APPLIED - read the notices above'
  end
union all
select
  'resume helper exists',
  case
    when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'subscription_resume_skips_paused_months'
    ) then 'OK' else 'MISSING'
  end
union all
select
  'the clawback measures ad-account money in USD',
  case
    when position('p_source = ''ad_account_withdrawal''' in
      coalesce((
        select pg_get_functiondef(p.oid) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = '_claw_back_referral_commission'
        limit 1), '')) > 0
    then 'OK' else 'NOT APPLIED'
  end
union all
select
  'plans currently paused',
  coalesce((
    select count(*)::text from public.subscriptions where status = 'paused'
  ), '0');
