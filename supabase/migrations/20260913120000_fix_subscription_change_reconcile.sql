-- =====================================================================
-- Fix two money bugs in mid-term subscription changes
-- =====================================================================
-- Both are in 20260901380000_subscription_billing.sql. This migration is
-- idempotent (create or replace) and safe to apply on top.
--
-- ⚠️  APPLY ON SUPABASE MANUALLY. `git push` only deploys the Next.js
--     frontend — it does NOT run migrations. Before applying, confirm the
--     LIVE definitions of change_subscription_amount and
--     _on_subscription_invoice_paid match the repo (the live DB is
--     hand-authored and may drift); if they differ, port these two fixes
--     into the live versions instead of replacing wholesale.
--
-- BUG 1 (HIGH — repeatable wallet over-refund):
--   change_subscription_amount reconciled a paid period by computing
--   `p_new_amount - v_curr.total`, where v_curr is the original paid
--   invoice whose `total` is never updated. Every subsequent change
--   re-based the delta on the ORIGINAL amount, so lowering 100→80→60
--   refunded 20 then 40 (60 total) against a 40 overpayment, and calling
--   with the same lower amount twice double-refunded. Fix: base the delta
--   on the current effective subscription amount (v_sub.amount), which
--   already tracks the last-set price.
--
-- BUG 2 (MEDIUM — mid-cycle invoice advances the billing period):
--   _on_subscription_invoice_paid advanced next_payment_date for ANY paid
--   invoice carrying a subscription_id. The 'subscription_adjustment'
--   invoices this function issues have no period_start, so paying one
--   pushed the whole cycle a month out (a month of subscription revenue
--   could be skipped). Fix: only advance the cycle for real period
--   invoices (period_start is not null).
-- =====================================================================

set search_path = public;

-- ── Bug 2: only real period invoices roll the cycle forward ──────────
create or replace function public._on_subscription_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid'
     and coalesce(old.status, '') is distinct from 'paid'
     and new.subscription_id is not null
     and new.period_start is not null then
    begin
      update public.subscriptions
         set status = case when status = 'cancelled' then status else 'active' end,
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
$$;

-- ── Bug 1: reconcile against the current effective amount ────────────
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
  v_uid     uuid := auth.uid();
  v_sub     public.subscriptions%rowtype;
  v_cur     text;
  v_company uuid;
  v_advuser uuid;
  v_curr    public.invoices%rowtype;
  v_delta   numeric;
  v_new_inv uuid;
  v_period  date;
  v_action  text := 'updated';
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
      -- cheaper → refund the overpayment (bounded by what was paid).
      if v_cur = 'USD' then
        update public.wallets
           set usd_balance = coalesce(usd_balance, 0) + (-v_delta), updated_at = now()
         where advertiser_id = v_sub.advertiser_id;
      else
        update public.wallets
           set eur_balance = coalesce(eur_balance, 0) + (-v_delta), updated_at = now()
         where advertiser_id = v_sub.advertiser_id;
      end if;
      v_action := 'refunded';
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
    update public.invoices
       set status = 'void', period_start = null, updated_at = now()
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

revoke all on function public.change_subscription_amount(uuid, numeric, text) from public, anon;
grant execute on function public.change_subscription_amount(uuid, numeric, text) to authenticated, service_role;
