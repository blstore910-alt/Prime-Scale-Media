-- Referral commission accrual.
--
-- When a wallet top-up completes for a referred advertiser, the
-- advertiser who referred them (their affiliate) earns commission.
-- Until now nothing wrote to referral_commissions, so /my-referrals
-- and /commissions were always empty in real use. This adds a
-- trigger that accrues on the same pending→completed transition the
-- balance trigger already fires on.
--
-- DESIGN — SAFETY FIRST
--   Accrual runs in its own BEGIN/EXCEPTION block. If ANYTHING goes
--   wrong (missing column on the hand-authored referral_* tables, a
--   bad rate, etc.) the exception is swallowed and the top-up
--   approval + balance credit still succeed. A missed commission is
--   recoverable; a topup approval that hard-fails on every click is
--   not. Errors are surfaced via RAISE WARNING for the server logs.
--
-- CONVENTIONS
--   commission_pct is a WHOLE percent (UI input min 0 / max 100), so
--   percentage commission = amount * commission_pct / 100.
--   referral_commissions.status uses 'unpaid' | 'paid'; new rows are
--   'unpaid'. topup_id is left NULL — its FK target is ambiguous on
--   the un-versioned schema, and NULL keeps the insert safe.
--
-- Only 'percentage' commissions accrue per-topup here. 'monthly' /
-- 'onetime' / 'fixed' are subscription-shaped and handled elsewhere
-- (or manually) — accruing them per wallet-topup would over-pay.

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
begin
  -- Only on the clean credit transition.
  if not (tg_op = 'UPDATE'
          and new.status = 'completed'
          and old.status is distinct from 'completed') then
    return new;
  end if;

  begin
    -- Which advertiser topped up? wallet_topups links via wallet_id.
    select w.advertiser_id into v_advertiser_id
      from public.wallets w
     where w.id = new.wallet_id;
    if v_advertiser_id is null then
      return new;
    end if;

    -- Is this advertiser referred by an APPROVED affiliate? A link
    -- only earns once an admin has moved it to 'active' — pending and
    -- rejected links never accrue. (The status column may not exist
    -- on an older DB; the coalesce keeps this working either way.)
    select rl.id,
           rl.tenant_id,
           rl.commission_type,
           rl.commission_pct,
           rl.commission_currency,
           coalesce(rl.status, 'active') as status
      into v_link
      from public.referral_links rl
     where rl.referred_advertiser_id = v_advertiser_id
     limit 1;
    if not found then
      return new;
    end if;
    if v_link.status <> 'active' then
      return new;
    end if;

    -- Only percentage commissions accrue per top-up.
    if coalesce(v_link.commission_type, '') <> 'percentage' then
      return new;
    end if;
    if coalesce(v_link.commission_pct, 0) <= 0 then
      return new;
    end if;

    v_amount := round(new.amount * v_link.commission_pct / 100.0, 2);
    if v_amount <= 0 then
      return new;
    end if;

    -- Record the commission (unpaid — admin pays out manually).
    insert into public.referral_commissions (
      referral_link_id,
      tenant_id,
      type,
      amount,
      currency,
      status,
      topup_id
    ) values (
      v_link.id,
      v_link.tenant_id,
      'percentage',
      v_amount,
      coalesce(new.currency, v_link.commission_currency),
      'unpaid',
      null
    );

    -- Keep the running earnings on the link in sync so the
    -- /my-referrals hero reflects it without a re-aggregate.
    if new.currency = 'USD' then
      update public.referral_links
         set earnings_usd = coalesce(earnings_usd, 0) + v_amount
       where id = v_link.id;
    elsif new.currency = 'EUR' then
      update public.referral_links
         set earnings_eur = coalesce(earnings_eur, 0) + v_amount
       where id = v_link.id;
    end if;

  exception when others then
    -- Never block the topup on an accrual problem.
    raise warning 'referral accrual skipped for wallet_topup %: %',
      new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_accrue_referral_commission on public.wallet_topups;
create trigger trg_accrue_referral_commission
  after update of status on public.wallet_topups
  for each row execute function public._accrue_referral_commission();
