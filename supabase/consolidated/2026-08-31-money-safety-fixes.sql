-- Money-safety fixes from the adversarial review (2 P1s).
--
-- 1. Commission double-accrue: the accrual fired on every
--    pending→completed transition with no dedup, so an undo→re-verify
--    (or a completed→pending→completed sequence from Wise) inserted a
--    SECOND commission row and bumped earnings again. Now it dedups on
--    the source topup and REVERSES on undo, mirroring the balance
--    trigger. Also picks the ACTIVE link deterministically.
--
-- 2. Refund/adjustment over-debit: approve debited the wallet with no
--    balance floor, so if the customer spent the money between the
--    request and the approval, the wallet went negative and the payout
--    double-paid. Now approve refuses when it would overdraw.


-- ─────────────────────────────────────────────────────────────────
-- 1a. Dedup column on referral_commissions (hand-authored table; no
--     FK so it can't clash with topup_id's ambiguous target).
-- ─────────────────────────────────────────────────────────────────
alter table public.referral_commissions
  add column if not exists source_wallet_topup_id uuid;

create unique index if not exists referral_commissions_source_uq
  on public.referral_commissions (referral_link_id, source_wallet_topup_id)
  where source_wallet_topup_id is not null;

-- ─────────────────────────────────────────────────────────────────
-- 1b. Accrual trigger: dedup + reverse-on-undo + deterministic link.
-- ─────────────────────────────────────────────────────────────────
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

    if coalesce(v_link.commission_type, '') <> 'percentage'
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


-- ─────────────────────────────────────────────────────────────────
-- 2a. Refund approve — refuse to overdraw the wallet.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.wallet_refund_approve(
  p_refund_id uuid
)
returns public.wallet_refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  record;
  v_owner  boolean;
  v_rf     public.wallet_refunds%rowtype;
  v_wallet public.wallets%rowtype;
  v_bal    numeric;
  v_row    public.wallet_refunds%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select exists (
    select 1 from public.tenants
     where id = v_admin.tenant_id and owner_id = auth.uid()
  ) into v_owner;
  if not v_owner then
    raise exception 'Only the tenant owner can approve refunds'
      using errcode = '42501';
  end if;

  select * into v_rf
    from public.wallet_refunds
   where id = p_refund_id
   for update;
  if not found then
    raise exception 'Refund not found' using errcode = '42704';
  end if;
  if v_rf.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_rf.status <> 'pending' then
    raise exception 'Refund is not pending' using errcode = '22000';
  end if;

  -- Lock the wallet and check the floor before debiting.
  select * into v_wallet from public.wallets where id = v_rf.wallet_id for update;
  v_bal := case when v_rf.currency = 'USD'
                then coalesce(v_wallet.usd_balance, 0)
                else coalesce(v_wallet.eur_balance, 0) end;
  if v_bal < v_rf.amount then
    raise exception 'Insufficient wallet balance for this refund (have %, need %)',
      v_bal, v_rf.amount using errcode = '22000';
  end if;

  if v_rf.currency = 'USD' then
    update public.wallets set usd_balance = coalesce(usd_balance,0) - v_rf.amount,
           updated_at = now() where id = v_rf.wallet_id;
  else
    update public.wallets set eur_balance = coalesce(eur_balance,0) - v_rf.amount,
           updated_at = now() where id = v_rf.wallet_id;
  end if;

  update public.wallet_refunds
     set status = 'approved', reviewed_by = v_admin.profile_id,
         reviewed_at = now(), updated_at = now()
   where id = p_refund_id
  returning * into v_row;
  return v_row;
end;
$$;


-- ─────────────────────────────────────────────────────────────────
-- 2b. Adjustment approve — refuse to drive the balance negative on a
--     downward correction.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.wallet_adjustment_approve(
  p_adjustment_id uuid
)
returns public.wallet_adjustments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  record;
  v_owner  boolean;
  v_adj    public.wallet_adjustments%rowtype;
  v_wallet public.wallets%rowtype;
  v_bal    numeric;
  v_row    public.wallet_adjustments%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select exists (
    select 1 from public.tenants
     where id = v_admin.tenant_id and owner_id = auth.uid()
  ) into v_owner;
  if not v_owner then
    raise exception 'Only the tenant owner can approve adjustments'
      using errcode = '42501';
  end if;

  select * into v_adj
    from public.wallet_adjustments
   where id = p_adjustment_id
   for update;
  if not found then
    raise exception 'Adjustment not found' using errcode = '42704';
  end if;
  if v_adj.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_adj.status <> 'pending' then
    raise exception 'Adjustment is not pending' using errcode = '22000';
  end if;

  select * into v_wallet from public.wallets where id = v_adj.wallet_id for update;
  v_bal := case when v_adj.currency = 'USD'
                then coalesce(v_wallet.usd_balance, 0)
                else coalesce(v_wallet.eur_balance, 0) end;
  if v_bal + v_adj.delta < 0 then
    raise exception 'Adjustment would make the balance negative (have %, delta %)',
      v_bal, v_adj.delta using errcode = '22000';
  end if;

  if v_adj.currency = 'USD' then
    update public.wallets set usd_balance = coalesce(usd_balance,0) + v_adj.delta,
           updated_at = now() where id = v_adj.wallet_id;
  else
    update public.wallets set eur_balance = coalesce(eur_balance,0) + v_adj.delta,
           updated_at = now() where id = v_adj.wallet_id;
  end if;

  update public.wallet_adjustments
     set status = 'approved', reviewed_by = v_admin.profile_id,
         reviewed_at = now(), updated_at = now()
   where id = p_adjustment_id
  returning * into v_row;
  return v_row;
end;
$$;
