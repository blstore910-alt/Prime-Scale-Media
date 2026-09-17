-- =====================================================================
-- A downgrade no longer pays cash back unless the admin asks
-- =====================================================================
-- Asked for directly: "en downgrade moet geen refund geven of als pill
-- optie." It is now an option, and the DEFAULT is not to refund.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY.
--
-- WHY THE DEFAULT FLIPS
-- Lowering a price mid-period paid REAL wallet cash out automatically. That
-- is a generous default nobody chose: an admin correcting a typo in a plan
-- amount moved money, and the only way to find out was to read the wallet
-- afterwards. Paying money back should be a decision, made on the screen,
-- at the moment.
--
-- WHAT "NO REFUND" DOES AND DOES NOT DO
--   * It does NOT pay the difference into the wallet, and writes no
--     wallet_adjustments row. Nothing moves.
--   * It DOES still void an uncollected `subscription_adjustment` for this
--     period. That is not a payout — it is us stopping billing for an
--     increase we are reversing, and keeping it would charge for something
--     the customer no longer has.
--   * The new price applies from here on, exactly as before.
--   * It returns action = 'lowered_no_refund' when there WAS a refundable
--     difference and the admin declined it, so the caller can say so
--     instead of reporting a silent success.
--
-- HOW THIS FILE WAS PRODUCED — this matters, because the function is 200
-- lines of money logic and hand-transcribing it is how a clamp gets lost.
-- The body below is the body of 20260915120000 verbatim, generated from
-- that file by script, with exactly three edits:
--   1. the `p_refund boolean default false` parameter
--   2. `if v_refund > 0` becomes `if p_refund and v_refund > 0`
--   3. an `elsif v_refund > 0` branch setting the new action label
-- Every clamp from that migration — the void-before-payout, the
-- never-more-than-collected bound, and the already-refunded subtraction
-- keyed on `subscription_change_refund:<invoice id>` — is untouched. Those
-- exist because an up-then-down cycle used to re-refund the same money
-- without bound.
--
-- ⚠️ THE OLD FUNCTION MUST BE DROPPED FIRST. Adding a parameter creates a
-- NEW function rather than replacing the old one, and PostgREST would then
-- have two candidates for the same call. The drop and the create are in one
-- transaction, so there is no window where neither exists.
-- =====================================================================

set search_path = public;

begin;

drop function if exists public.change_subscription_amount(uuid, numeric, text);

create or replace function public.change_subscription_amount(
  p_subscription_id uuid,
  p_new_amount numeric,
  p_new_currency text default null,
  -- FALSE by default: a downgrade does NOT pay cash back unless the
  -- admin asks for it on this call. See the migration header.
  p_refund boolean default false
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

      if p_refund and v_refund > 0 then
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
      elsif v_refund > 0 then
        -- There WAS a refundable difference and the admin chose not to pay
        -- it out. Nothing moves; the new price applies from here on.
        v_action := 'lowered_no_refund';
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
revoke all on function public.change_subscription_amount(uuid, numeric, text, boolean) from public, anon;
grant execute on function public.change_subscription_amount(uuid, numeric, text, boolean) to authenticated, service_role;

commit;

-- Read it back: one function, four arguments.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'change_subscription_amount';
