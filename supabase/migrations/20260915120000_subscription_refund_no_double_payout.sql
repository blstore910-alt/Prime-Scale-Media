-- =====================================================================
-- Subscription down-change could refund the SAME money more than once
-- =====================================================================
-- 20260914100000 clamped each single payout to "what was actually collected
-- for this period, minus the new price". That bounds one payout. It does not
-- bound their SUM, because the baseline it clamps against — v_collected — is
-- rebuilt from the invoices table on every call and never learns that a
-- payout already happened. The payout wrote only wallets.eur_balance /
-- usd_balance: no invoice, no credit note, no wallet_adjustments row.
--
-- The reachable loop (admin-only, but it fires by accident as easily as by
-- intent — an admin who lowers a price, changes their mind, and lowers it
-- again):
--
--   EUR 100 invoice, paid. Wallet 0.
--   change to 60  -> v_collected = 100, refund = least(40, 100-60) = 40.
--                    Wallet +40. subscriptions.amount = 60.
--   change to 100 -> raises an UNPAID subscription_adjustment for 40.
--                    Nothing is collected. subscriptions.amount = 100.
--   change to 60  -> voids that unpaid adjustment, so v_adjpaid is 0 and
--                    v_collected is the SAME frozen 100 -> refund 40 again.
--                    Wallet +80 total.
--
--   Collected 100, period now priced 60, paid out 80. Every further 60<->100
--   toggle adds another 40 of spendable balance, without limit. That balance
--   is real: it pays ad-account request fees, pays invoices from the wallet,
--   and can be pushed out through a refund request.
--
-- This is NOT specific to 20260914100000 — every earlier version had the
-- same hole or a worse one (20260913120000 paid out the full delta with no
-- clamp at all). So applying this is a fix whichever body is currently live.
--
-- The fix is to write the payout down and subtract it:
--
--   refund = min(decrease, collected - new_price - already_refunded)
--
-- `already_refunded` comes from wallet_adjustments rows tagged with a
-- deterministic reference, so a manual adjustment an admin made for some
-- other reason can never be counted as a refund of this period. Those rows
-- also give reconciliation and the audit log something to see: a payout that
-- left no trace anywhere was the other half of this bug.
--
-- Worked through, after the fix:
--   100 paid, ->60 : refunded 0 so far, pay 40, record 40.        wallet 40
--   ->100          : unpaid adjustment 40 raised.
--   ->60           : adjustment voided, collected still 100,
--                    already_refunded 40 -> min(40, 100-60-40) = 0.  wallet 40
--   And when the adjustment WAS paid (collected 140):
--   ->60           : min(40, 140-60-40) = 40 -> total back 80, retained 60. Correct.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY (git push ships only the frontend).
-- Safe to re-run.
--
-- BEFORE APPLYING, confirm what is actually live — the DB is hand-authored:
--   select prosrc from pg_proc where proname = 'change_subscription_amount';
-- =====================================================================

set search_path = public;

create or replace function public.change_subscription_amount(
  p_subscription_id uuid,
  p_new_amount numeric,
  p_new_currency text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_sub      public.subscriptions%rowtype;
  v_cur      text;
  v_company  uuid;
  v_advuser  uuid;
  v_curr     public.invoices%rowtype;
  v_delta    numeric;
  v_refund   numeric;
  v_adjpaid  numeric;
  v_collected numeric;
  v_refunded numeric;
  v_wallet   uuid;
  v_new_inv  uuid;
  v_period   date;
  v_action   text := 'updated';
begin
  if p_new_amount is null or p_new_amount < 0 then
    raise exception 'Invalid amount' using errcode = '22000';
  end if;

  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'Subscription not found' using errcode = '42704';
  end if;

  -- Admin of the sub's tenant (the super-admin is a tenant-owning admin,
  -- so role='admin' covers both). Service role (v_uid null) bypasses.
  if v_uid is not null and not exists (
    select 1 from public.user_profiles up
     where up.user_id = v_uid
       and up.tenant_id = v_sub.tenant_id
       and up.role = 'admin'
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_cur := upper(coalesce(nullif(p_new_currency, ''), v_sub.currency, 'EUR'));
  if v_cur not in ('USD', 'EUR') then
    raise exception 'Unsupported currency %', v_cur using errcode = '22000';
  end if;

  select user_id into v_advuser from public.advertisers where id = v_sub.advertiser_id;
  select id into v_company from public.companies where advertiser_id = v_sub.advertiser_id limit 1;

  -- Latest invoiced period for this subscription.
  select * into v_curr from public.invoices
   where subscription_id = p_subscription_id and period_start is not null
   order by period_start desc, created_at desc
   limit 1;

  if found and v_curr.status = 'paid'
     and upper(coalesce(v_curr.currency, 'EUR')) = v_cur then
    -- Reconcile the already-paid current period. Base the delta on the
    -- CURRENT effective amount (v_sub.amount, set by the previous change),
    -- not the original paid invoice total — otherwise repeated changes
    -- re-refund against the first price. Fall back to the invoice total
    -- for a first change where amount was never set.
    v_delta := p_new_amount - coalesce(v_sub.amount, v_curr.total, 0);

    if v_delta < 0 then
      -- ── Cheaper. This pays out REAL wallet cash, so bound it twice. ──

      -- (a) We are reversing an increase, so stop billing for it: void any
      --     adjustment for this period we never collected. That portion of
      --     the decrease is undone by voiding, not by a payout.
      --     NOTE: no updated_at on invoices.
      update public.invoices
         set status = 'void'
       where subscription_id = p_subscription_id
         and type = 'subscription_adjustment'
         and status = 'unpaid'
         and created_at >= v_curr.created_at;

      -- (b) Never pay out more than was actually COLLECTED for this period
      --     minus the new price. Adjustments carry no period_start, so they
      --     are scoped by having been raised at/after the current invoice.
      select coalesce(sum(total), 0) into v_adjpaid
        from public.invoices
       where subscription_id = p_subscription_id
         and type = 'subscription_adjustment'
         and status = 'paid'
         and created_at >= v_curr.created_at;

      -- (c) And subtract what we have ALREADY paid back for this period.
      --     Without this the baseline was rebuilt from scratch on every
      --     call and never moved, so an up-change that was never collected
      --     followed by a down-change re-refunded the same money — over and
      --     over, without bound. Scoped by a deterministic reference so an
      --     admin's unrelated manual wallet adjustments can never be
      --     mistaken for a refund of this period.
      select coalesce(sum(delta), 0) into v_refunded
        from public.wallet_adjustments
       where advertiser_id = v_sub.advertiser_id
         and status = 'approved'
         and reference = 'subscription_change_refund:' || v_curr.id::text;

      v_collected := coalesce(v_curr.total, 0) + coalesce(v_adjpaid, 0);
      v_refund := least(
        -v_delta,
        greatest(v_collected - p_new_amount - coalesce(v_refunded, 0), 0)
      );

      if v_refund > 0 then
        if v_cur = 'USD' then
          update public.wallets
             set usd_balance = coalesce(usd_balance, 0) + v_refund, updated_at = now()
           where advertiser_id = v_sub.advertiser_id;
        else
          update public.wallets
             set eur_balance = coalesce(eur_balance, 0) + v_refund, updated_at = now()
           where advertiser_id = v_sub.advertiser_id;
        end if;

        -- Record the payout. This is what makes the clamp above hold across
        -- calls: the money used to leave with nothing written down except
        -- the new wallet balance, so the next call had no way to know it had
        -- already happened. status 'approved' because it is done, not
        -- proposed — wallet_adjustments carries no money-moving trigger
        -- (20260831190000 only touches updated_at and audits), so this
        -- records the payout without repeating it.
        select id into v_wallet from public.wallets
         where advertiser_id = v_sub.advertiser_id limit 1;
        if v_wallet is not null then
          insert into public.wallet_adjustments
            (tenant_id, advertiser_id, wallet_id, delta, currency, status,
             reference, reason, reviewed_at)
          values
            (v_sub.tenant_id, v_sub.advertiser_id, v_wallet, v_refund, v_cur,
             'approved',
             'subscription_change_refund:' || v_curr.id::text,
             'Subscription lowered to ' || p_new_amount::text || ' ' || v_cur,
             now());
        end if;

        v_action := 'refunded';
      else
        -- The decrease was fully absorbed by voiding an uncollected
        -- adjustment (or there was nothing to give back).
        v_action := 'adjustment_voided';
      end if;

    elsif v_delta > 0 and v_company is not null then
      -- pricier → invoice the difference (unpaid).
      insert into public.invoices
        (advertiser_id, tenant_id, company_id, subscription_id, type, currency,
         total, items, status, due_date)
      values
        (v_sub.advertiser_id, v_sub.tenant_id, v_company, p_subscription_id,
         'subscription_adjustment', v_cur, v_delta,
         jsonb_build_array(jsonb_build_object(
           'name', 'Subscription change adjustment', 'rate', v_delta,
           'amount', v_delta, 'quantity', 1, 'tax', 0, 'currency', v_cur)),
         'unpaid', now() + interval '7 days')
      returning id into v_new_inv;
      v_action := 'charged_difference';
    end if;
  else
    -- No paid current period → void unpaid subscription invoices (detach
    -- their period so the unique index frees up) and reissue one.
    -- NOTE: no updated_at on invoices. See 20260901440000 — writing it
    -- here is what made this RPC 400 on every real invoice.
    update public.invoices
       set status = 'void', period_start = null
     where subscription_id = p_subscription_id and status = 'unpaid';

    if v_company is not null then
      v_period := coalesce(v_sub.next_payment_date::date, current_date);
      insert into public.invoices
        (advertiser_id, tenant_id, company_id, subscription_id, type, currency,
         total, items, status, period_start, due_date)
      values
        (v_sub.advertiser_id, v_sub.tenant_id, v_company, p_subscription_id,
         'subscription', v_cur, p_new_amount,
         jsonb_build_array(jsonb_build_object(
           'name', 'Monthly subscription', 'rate', p_new_amount,
           'amount', p_new_amount, 'quantity', 1, 'tax', 0, 'currency', v_cur)),
         'unpaid', v_period, now() + interval '7 days')
      returning id into v_new_inv;
      v_action := 'reissued';
    end if;
  end if;

  update public.subscriptions
     set amount = p_new_amount, currency = v_cur, updated_at = now()
   where id = p_subscription_id;

  begin
    insert into public.notifications
      (recipient_user_id, tenant_id, type, payload, is_read)
    values
      (v_advuser, v_sub.tenant_id, 'subscription_changed',
       jsonb_build_object('amount', p_new_amount, 'currency', v_cur,
                          'action', v_action), false);
  exception when others then null; end;

  return jsonb_build_object('action', v_action, 'new_invoice', v_new_inv,
                            'amount', p_new_amount, 'currency', v_cur);
end;
$$;

-- ---------------------------------------------------------------------
-- Verify. Expect clamp_present = 1 and ledger_write_present = 1.
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_proc
    where proname = 'change_subscription_amount'
      and prosrc like '%p_new_amount - coalesce(v_refunded, 0)%') as clamp_present,
  (select count(*) from pg_proc
    where proname = 'change_subscription_amount'
      and prosrc like '%subscription_change_refund:%') as ledger_write_present;
