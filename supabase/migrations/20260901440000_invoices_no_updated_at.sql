-- =====================================================================
-- Fix: public.invoices has NO updated_at column (verified live). Two
-- money RPCs wrote it and 400'd on any real invoice:
--   * invoice_pay_from_wallet  — "Pay now" + the billing auto-debit
--   * change_subscription_amount — the void-and-reissue path
-- Both are re-created here identically, minus the invoices.updated_at
-- write. (wallets DOES have updated_at, so wallet writes are unchanged.)
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- invoice_pay_from_wallet — same as 20260901140000, without updated_at.
-- ---------------------------------------------------------------------
create or replace function public.invoice_pay_from_wallet(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_inv     public.invoices%rowtype;
  v_wallet  public.wallets%rowtype;
  v_bal     numeric;
  v_cur     text;
  v_amt     numeric;
  v_allowed boolean;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;

  if v_uid is null then
    v_allowed := true;
  else
    v_allowed := exists (
      select 1 from public.advertisers a
       where a.id = v_inv.advertiser_id and a.user_id = v_uid
    ) or exists (
      select 1 from public.user_profiles up
       where up.user_id = v_uid
         and up.tenant_id = v_inv.tenant_id
         and up.role = 'admin'
    );
  end if;
  if not v_allowed then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_inv.status = 'paid' then
    return v_inv;
  end if;

  v_cur := upper(coalesce(v_inv.currency, 'EUR'));
  v_amt := coalesce(v_inv.total, 0);
  if v_amt <= 0 then
    raise exception 'Invoice has no payable amount' using errcode = '22000';
  end if;
  if v_cur not in ('USD', 'EUR') then
    raise exception 'Unsupported invoice currency %', v_cur using errcode = '22000';
  end if;

  select * into v_wallet
    from public.wallets
   where advertiser_id = v_inv.advertiser_id
   for update;
  if not found then
    raise exception 'No wallet for this advertiser' using errcode = '42704';
  end if;

  v_bal := case when v_cur = 'USD'
                then coalesce(v_wallet.usd_balance, 0)
                else coalesce(v_wallet.eur_balance, 0) end;
  if v_bal < v_amt then
    raise exception
      'Insufficient wallet balance (have %, need %). Please top up.',
      v_bal, v_amt using errcode = '22000';
  end if;

  if v_cur = 'USD' then
    update public.wallets set usd_balance = coalesce(usd_balance, 0) - v_amt,
           updated_at = now() where id = v_wallet.id;
  else
    update public.wallets set eur_balance = coalesce(eur_balance, 0) - v_amt,
           updated_at = now() where id = v_wallet.id;
  end if;

  update public.invoices
     set status = 'paid', paid_at = now()
   where id = p_invoice_id
  returning * into v_inv;
  return v_inv;
end;
$$;

revoke all on function public.invoice_pay_from_wallet(uuid) from public, anon;
grant execute on function public.invoice_pay_from_wallet(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- change_subscription_amount — same as 20260901380000, without the
-- invoices.updated_at write on the void step.
-- ---------------------------------------------------------------------
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

  select * into v_curr from public.invoices
   where subscription_id = p_subscription_id and period_start is not null
   order by period_start desc, created_at desc
   limit 1;

  if found and v_curr.status = 'paid'
     and upper(coalesce(v_curr.currency, 'EUR')) = v_cur then
    v_delta := p_new_amount - coalesce(v_curr.total, 0);
    if v_delta < 0 then
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
    -- their period) and reissue one. NOTE: no updated_at on invoices.
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

revoke all on function public.change_subscription_amount(uuid, numeric, text) from public, anon;
grant execute on function public.change_subscription_amount(uuid, numeric, text) to authenticated, service_role;
