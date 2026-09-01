-- =====================================================================
-- Subscription billing engine — invoice → 7-day grace → auto-debit →
-- dunning, plus mid-term subscription changes (plan-model phase 4)
-- =====================================================================
-- Model (decided 2026-09-01):
--   * Monthly, collected from the wallet balance.
--   * An invoice is issued when a subscription falls due. The customer
--     can "Pay now" (invoice_pay_from_wallet, already built) during a
--     7-day grace window.
--   * After the grace window, the daily cron auto-debits the wallet.
--   * If the wallet can't cover it → subscription goes past_due and the
--     customer is nudged to top up (dunning). Manual fallback always.
--
-- SAFETY
--   * Money only ever moves through invoice_pay_from_wallet, which locks
--     the wallet, floor-checks, and is idempotent (a paid invoice is a
--     no-op). So a "Pay now" click racing the cron can't double-charge.
--   * A unique (subscription_id, period_start) index makes invoice
--     generation idempotent — a period is billed at most once.
--   * Every notification / status side-effect is wrapped so it can never
--     abort a billing run or a payment.
-- =====================================================================

set search_path = public;

-- ─────────────────────────────────────────────────────────────
-- A) Columns that let an invoice belong to a subscription period.
-- ─────────────────────────────────────────────────────────────
alter table public.invoices
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null,
  add column if not exists due_date timestamptz,
  add column if not exists period_start date;

-- One invoice per subscription per billing period. Partial (only
-- subscription invoices) so existing topup/manual invoices are untouched.
-- Voiding detaches period_start (set null) to free the slot for a reissue.
create unique index if not exists invoices_subscription_period_uq
  on public.invoices (subscription_id, period_start)
  where subscription_id is not null and period_start is not null;

-- ─────────────────────────────────────────────────────────────
-- B) When a subscription invoice is paid (by "Pay now" or the cron),
--    reactivate the subscription and roll its next payment forward.
-- ─────────────────────────────────────────────────────────────
create or replace function public._on_subscription_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid'
     and coalesce(old.status, '') is distinct from 'paid'
     and new.subscription_id is not null then
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

drop trigger if exists trg_on_subscription_invoice_paid on public.invoices;
create trigger trg_on_subscription_invoice_paid
  after update of status on public.invoices
  for each row execute function public._on_subscription_invoice_paid();

-- ─────────────────────────────────────────────────────────────
-- C) The daily billing run. Called by the cron (service role).
--    1) generate an invoice for every due subscription period,
--    2) auto-debit invoices past their 7-day grace,
--    3) mark past_due + nudge when the wallet can't cover it.
-- ─────────────────────────────────────────────────────────────
create or replace function public.subscription_billing_run()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  inv      record;
  v_company uuid;
  v_period  date;
  v_inv_id  uuid;
  v_cur     text;
  v_generated int := 0;
  v_charged   int := 0;
  v_pastdue   int := 0;
  v_no_company int := 0;
  v_was_status text;
begin
  -- 1) GENERATE
  for r in
    select s.id, s.advertiser_id, s.tenant_id, s.amount, s.currency,
           s.next_payment_date, a.user_id as adv_user
      from public.subscriptions s
      join public.advertisers a on a.id = s.advertiser_id
     where s.status in ('active', 'past_due')
       and coalesce(s.amount, 0) > 0
       and s.next_payment_date is not null
       and s.next_payment_date <= now()
  loop
    v_period := r.next_payment_date::date;
    v_cur := upper(coalesce(r.currency, 'EUR'));

    if exists (
      select 1 from public.invoices i
       where i.subscription_id = r.id and i.period_start = v_period
    ) then
      continue;
    end if;

    select id into v_company from public.companies
     where advertiser_id = r.advertiser_id limit 1;
    if v_company is null then
      -- Billable actions need a company. Can't invoice → tell the admins.
      v_no_company := v_no_company + 1;
      begin
        perform public.raise_integration_failure(
          r.tenant_id, 'billing',
          'Subscription ' || r.id || ' is due but the advertiser has no company to invoice.');
      exception when others then null; end;
      continue;
    end if;

    begin
      insert into public.invoices
        (advertiser_id, tenant_id, company_id, subscription_id, type, currency,
         total, items, status, period_start, due_date)
      values
        (r.advertiser_id, r.tenant_id, v_company, r.id, 'subscription', v_cur,
         r.amount,
         jsonb_build_array(jsonb_build_object(
           'name', 'Monthly subscription', 'rate', r.amount, 'amount', r.amount,
           'quantity', 1, 'tax', 0, 'currency', v_cur)),
         'unpaid', v_period, now() + interval '7 days')
      returning id into v_inv_id;
      v_generated := v_generated + 1;

      begin
        insert into public.notifications
          (recipient_user_id, tenant_id, type, payload, is_read)
        values
          (r.adv_user, r.tenant_id, 'subscription_invoice',
           jsonb_build_object('invoice_id', v_inv_id, 'amount', r.amount,
                              'currency', v_cur), false);
      exception when others then null; end;
    exception when others then
      raise warning 'subscription invoice generate failed for sub %: %', r.id, sqlerrm;
    end;
  end loop;

  -- 2) AUTO-DEBIT overdue invoices (past the 7-day grace), 3) DUNNING.
  for inv in
    select i.id, i.subscription_id, i.tenant_id, i.total, i.currency,
           i.advertiser_id, a.user_id as adv_user, s.status as sub_status
      from public.invoices i
      join public.advertisers a on a.id = i.advertiser_id
      join public.subscriptions s on s.id = i.subscription_id
     where i.subscription_id is not null
       and i.status = 'unpaid'
       and i.due_date is not null
       and i.due_date <= now()
       and s.status <> 'cancelled'
  loop
    begin
      perform public.invoice_pay_from_wallet(inv.id);
      v_charged := v_charged + 1;
      -- the paid-trigger reactivates + advances the subscription
    exception when others then
      -- couldn't collect (usually insufficient balance) → dunning
      v_was_status := inv.sub_status;
      begin
        update public.subscriptions set status = 'past_due', updated_at = now()
         where id = inv.subscription_id and status <> 'cancelled';
      exception when others then null; end;
      if coalesce(v_was_status, '') <> 'past_due' then
        v_pastdue := v_pastdue + 1;
        begin
          insert into public.notifications
            (recipient_user_id, tenant_id, type, payload, is_read)
          values
            (inv.adv_user, inv.tenant_id, 'subscription_past_due',
             jsonb_build_object('invoice_id', inv.id, 'amount', inv.total,
                                'currency', upper(coalesce(inv.currency, 'EUR'))),
             false);
        exception when others then null; end;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'generated', v_generated,
    'charged', v_charged,
    'past_due', v_pastdue,
    'skipped_no_company', v_no_company);
end;
$$;

revoke all on function public.subscription_billing_run() from public, anon, authenticated;
grant execute on function public.subscription_billing_run() to service_role;

-- ─────────────────────────────────────────────────────────────
-- D) change_subscription_amount — an admin changes a sub mid-term.
--    * Unpaid current period → void it + reissue at the new amount.
--    * Paid current period (same currency) → reconcile the difference:
--        cheaper → refund the overpayment to the wallet,
--        pricier → issue an invoice for the difference.
--    Bounded: a refund can never exceed what was actually paid.
-- ─────────────────────────────────────────────────────────────
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
    -- Reconcile the already-paid current period.
    v_delta := p_new_amount - coalesce(v_curr.total, 0);
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
