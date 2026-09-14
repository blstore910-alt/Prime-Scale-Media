-- =====================================================================
-- URGENT — repairs two defects I introduced in 20260913120000
-- =====================================================================
-- 20260913120000 fixed a real bug (repeated amount changes re-refunded
-- against the ORIGINAL price instead of the current one) but shipped two
-- new ones with it. Both are live on any DB where that file was applied.
--
-- ── Defect 1: the RPC now throws on its most common path ──────────────
-- The void-and-reissue branch writes `updated_at = now()` on
-- public.invoices. That column DOES NOT EXIST on the live DB — see
-- 20260901440000_invoices_no_updated_at.sql, whose header records it as
-- "verified live" and names THIS RPC as one of the two that 400'd because
-- of it. PL/pgSQL resolves column names at execution time, so the bad
-- migration applied cleanly and only fails when an admin actually changes
-- a subscription amount: 42703, the whole RPC aborts, nothing changes.
-- Reached whenever there is no PAID invoice for the current period — i.e.
-- every new or unpaid subscription. Removed again here, with the warning
-- comment restored so it does not get re-added a third time.
--
-- ── Defect 2: a refund for money that was never collected ─────────────
-- Re-basing the delta on v_sub.amount was the right call for repeated
-- DOWN-changes, but subscriptions.amount is advanced on EVERY call —
-- including an UP-change whose difference is only ever issued as an
-- 'unpaid' adjustment invoice. So:
--
--   100 paid  →  150  (adjustment invoice for 50, UNPAID, amount := 150)
--             →  100  (delta = 100 - 150 = -50  →  wallet += 50)
--
-- The advertiser paid 100, is still holding an unpaid 50 invoice, and has
-- just been credited 50 in spendable balance. The old code computed
-- 100 - 100 = 0 here, so this is a regression, not a pre-existing hole.
-- The same happens with no company attached at all, where the UP-change
-- creates no invoice but still advances `amount`.
--
-- Fixed with two independent bounds, because this is real cash:
--   a) any still-unpaid adjustment for the current period is VOIDED — we
--      are reversing the increase, so we must stop billing for it too;
--      that part of the decrease is undone by voiding, not by paying out.
--   b) the payout is then clamped to what was ACTUALLY collected for this
--      period minus the new price, so the wallet can never be credited
--      money that never arrived, whatever route got us here.
--
-- Worked through:
--   100 paid → 80 → 60      : refunds 20 then 20  (= 100 − 60)      ✓
--   100 paid → 150(unpaid) → 100 : voids the 50, refunds 0          ✓
--   100 paid + 50 adj PAID → 100 : refunds 50     (= 150 − 100)     ✓
--   100 paid → 200 (no company, no invoice) → 100 : refunds 0       ✓
--
-- ⚠️ APPLY ON SUPABASE MANUALLY (git push ships only the frontend).
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

      v_collected := coalesce(v_curr.total, 0) + coalesce(v_adjpaid, 0);
      v_refund := least(-v_delta, greatest(v_collected - p_new_amount, 0));

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

-- Verify it no longer references invoices.updated_at (expect 0):
--   select count(*) from pg_proc
--    where proname = 'change_subscription_amount'
--      and prosrc like '%period_start = null, updated_at%';
