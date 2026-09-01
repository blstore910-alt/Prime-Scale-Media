-- =====================================================================
-- advertiser_perks — admin-granted promotions / perks
-- =====================================================================
-- An admin can grant an advertiser:
--   * free_ad_account_requests — N free ad-account requests (beyond the
--     plan's included accounts). Consumes one per paid request.
--   * subscription_waiver       — no subscription charge while active.
--   * subscription_discount     — % off the subscription while active
--                                 (perk.amount = percent, 0..100).
--   * topup_fee_waiver / topup_discount — reserved for when the topup-fee
--     pipeline is plan-wired; stored now, not yet enforced.
--
-- Perks are time-boxed (starts_at / expires_at; null expiry = open-ended)
-- and can be revoked (active=false). Enforcement is additive: no perk =
-- exactly today's behaviour.
-- =====================================================================

set search_path = public;

create table if not exists public.advertiser_perks (
  id            uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  kind          text not null check (kind in (
                  'free_ad_account_requests',
                  'subscription_waiver',
                  'subscription_discount',
                  'topup_fee_waiver',
                  'topup_discount')),
  amount        numeric(10, 2),   -- percent for *_discount; unused for waivers
  remaining     int,              -- count left for free_ad_account_requests
  starts_at     timestamptz not null default now(),
  expires_at    timestamptz,
  active         boolean not null default true,
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists advertiser_perks_lookup_idx
  on public.advertiser_perks (advertiser_id, kind, active);

alter table public.advertiser_perks enable row level security;

-- Advertiser reads their own perks; admins read + manage their tenant's.
drop policy if exists advertiser_perks_read on public.advertiser_perks;
create policy advertiser_perks_read on public.advertiser_perks
  for select to authenticated
  using (
    exists (select 1 from public.advertisers a
             where a.id = advertiser_perks.advertiser_id and a.user_id = auth.uid())
    or exists (select 1 from public.user_profiles up
                where up.user_id = auth.uid()
                  and up.tenant_id = advertiser_perks.tenant_id
                  and up.role = 'admin')
  );

-- Writes go through SECURITY DEFINER RPCs (grant/revoke) so the tenant
-- guard + column shape stay server-side. No direct client write policy.

drop trigger if exists trg_touch_advertiser_perks on public.advertiser_perks;
create trigger trg_touch_advertiser_perks
  before update on public.advertiser_perks
  for each row execute function public._touch_updated_at();

-- ---------------------------------------------------------------------
-- grant / revoke RPCs (admin-only, tenant-scoped)
-- ---------------------------------------------------------------------
create or replace function public.grant_advertiser_perk(
  p_advertiser_id uuid,
  p_kind text,
  p_amount numeric default null,
  p_remaining int default null,
  p_expires_at timestamptz default null,
  p_note text default null
) returns public.advertiser_perks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_adv  public.advertisers%rowtype;
  v_perk public.advertiser_perks%rowtype;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  select * into v_adv from public.advertisers where id = p_advertiser_id;
  if not found then
    raise exception 'Advertiser not found' using errcode = '42704';
  end if;
  if not exists (
    select 1 from public.user_profiles up
     where up.user_id = v_uid and up.tenant_id = v_adv.tenant_id and up.role = 'admin'
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_kind not in ('free_ad_account_requests','subscription_waiver',
                    'subscription_discount','topup_fee_waiver','topup_discount') then
    raise exception 'Unknown perk kind %', p_kind using errcode = '22000';
  end if;

  insert into public.advertiser_perks
    (advertiser_id, tenant_id, kind, amount, remaining, expires_at, note, created_by)
  values
    (v_adv.id, v_adv.tenant_id, p_kind, p_amount,
     case when p_kind = 'free_ad_account_requests'
          then greatest(coalesce(p_remaining, 1), 0) else null end,
     p_expires_at, nullif(p_note, ''), v_uid)
  returning * into v_perk;
  return v_perk;
end;
$$;

revoke all on function public.grant_advertiser_perk(uuid, text, numeric, int, timestamptz, text) from public, anon;
grant execute on function public.grant_advertiser_perk(uuid, text, numeric, int, timestamptz, text) to authenticated;

create or replace function public.revoke_advertiser_perk(p_perk_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  select tenant_id into v_tenant from public.advertiser_perks where id = p_perk_id;
  if v_tenant is null then
    raise exception 'Perk not found' using errcode = '42704';
  end if;
  if not exists (
    select 1 from public.user_profiles up
     where up.user_id = v_uid and up.tenant_id = v_tenant and up.role = 'admin'
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.advertiser_perks set active = false, updated_at = now()
   where id = p_perk_id;
end;
$$;

revoke all on function public.revoke_advertiser_perk(uuid) from public, anon;
grant execute on function public.revoke_advertiser_perk(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Enforcement 1: ad_account_request_create_paid consumes a
-- free_ad_account_requests perk (after the plan's included accounts).
-- Full re-create of 20260901360000 with the perk step added.
-- ---------------------------------------------------------------------
create or replace function public.ad_account_request_create_paid(
  p_platform    text,
  p_currency    text,
  p_timezone    text,
  p_website_url text default null,
  p_notes       text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns public.ad_account_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_adv      public.advertisers%rowtype;
  v_wallet   public.wallets%rowtype;
  v_cur      text;
  v_fee      numeric;
  v_rate     numeric;
  v_bal      numeric;
  v_email    text;
  v_req      public.ad_account_requests%rowtype;
  v_included int;
  v_used     int;
  v_is_free  boolean;
  v_perk_id  uuid;
  v_free_source text := null;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select * into v_adv from public.advertisers where user_id = v_uid limit 1;
  if not found then
    raise exception 'No advertiser profile for this user' using errcode = '42501';
  end if;

  v_cur := upper(coalesce(p_currency, 'EUR'));
  if v_cur not in ('USD', 'EUR') then
    raise exception 'Unsupported currency %', v_cur using errcode = '22000';
  end if;

  select included_ad_accounts into v_included
    from public.advertiser_plans
   where advertiser_id = v_adv.id
   for update;
  v_included := coalesce(v_included, 0);

  select count(*) into v_used
    from public.ad_account_requests
   where advertiser_id = v_adv.id
     and coalesce(status, '') not in ('rejected', 'cancelled');

  v_is_free := v_used < v_included;
  if v_is_free then
    v_free_source := 'plan_included';
  end if;

  -- Not free by plan? Try a free-request perk (consume one).
  if not v_is_free then
    select id into v_perk_id
      from public.advertiser_perks
     where advertiser_id = v_adv.id
       and kind = 'free_ad_account_requests'
       and active
       and (expires_at is null or expires_at > now())
       and starts_at <= now()
       and coalesce(remaining, 0) > 0
     order by expires_at nulls last
     for update
     limit 1;
    if found then
      v_is_free := true;
      v_free_source := 'perk';
      update public.advertiser_perks
         set remaining = remaining - 1, updated_at = now()
       where id = v_perk_id;
    end if;
  end if;

  if v_is_free then
    v_fee := 0;
  else
    if v_cur = 'EUR' then
      v_fee := 50;
    else
      select eur into v_rate
        from public.exchange_rates
       where tenant_id = v_adv.tenant_id and is_active = true
       limit 1;
      if v_rate is null or v_rate <= 0 then
        v_rate := 0.86;
      end if;
      v_fee := round(50 / v_rate, 0);
    end if;

    select * into v_wallet from public.wallets
     where advertiser_id = v_adv.id for update;
    if not found then
      raise exception 'No wallet for this advertiser' using errcode = '42704';
    end if;

    v_bal := case when v_cur = 'USD'
                  then coalesce(v_wallet.usd_balance, 0)
                  else coalesce(v_wallet.eur_balance, 0) end;
    if v_bal < v_fee then
      raise exception
        'Insufficient wallet balance for the % ad-account request fee (have %, need %). Please top up.',
        v_cur, v_bal, v_fee using errcode = '22000';
    end if;

    if v_cur = 'USD' then
      update public.wallets set usd_balance = coalesce(usd_balance, 0) - v_fee,
             updated_at = now() where id = v_wallet.id;
    else
      update public.wallets set eur_balance = coalesce(eur_balance, 0) - v_fee,
             updated_at = now() where id = v_wallet.id;
    end if;
  end if;

  select email into v_email
    from public.user_profiles where user_id = v_uid limit 1;

  insert into public.ad_account_requests
    (advertiser_id, tenant_id, email, platform, currency, timezone,
     website_url, notes, metadata, status)
  values
    (v_adv.id, v_adv.tenant_id, v_email, p_platform, v_cur, p_timezone,
     nullif(p_website_url, ''), nullif(p_notes, ''),
     coalesce(p_metadata, '{}'::jsonb)
       || jsonb_build_object(
            'request_fee', v_fee,
            'request_fee_currency', v_cur,
            'request_fee_included', v_is_free,
            'request_fee_free_source', v_free_source
          ),
     'pending')
  returning * into v_req;

  return v_req;
end;
$$;

revoke all on function public.ad_account_request_create_paid(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.ad_account_request_create_paid(text, text, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Enforcement 2: subscription_billing_run honours a subscription_waiver
-- (skip + advance) and a subscription_discount (reduce the amount).
-- Full re-create of 20260901380000's run with the perk step added.
-- ---------------------------------------------------------------------
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
  v_amount  numeric;
  v_disc    numeric;
  v_generated int := 0;
  v_charged   int := 0;
  v_pastdue   int := 0;
  v_no_company int := 0;
  v_waived    int := 0;
  v_was_status text;
begin
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

    -- Waiver perk covering this period → don't bill, just roll forward.
    if exists (
      select 1 from public.advertiser_perks p
       where p.advertiser_id = r.advertiser_id
         and p.kind = 'subscription_waiver'
         and p.active
         and p.starts_at <= now()
         and (p.expires_at is null or p.expires_at > now())
    ) then
      update public.subscriptions
         set next_payment_date = (v_period + interval '1 month'), updated_at = now()
       where id = r.id;
      v_waived := v_waived + 1;
      continue;
    end if;

    -- Discount perk → reduce the amount for this invoice.
    v_amount := r.amount;
    select p.amount into v_disc from public.advertiser_perks p
      where p.advertiser_id = r.advertiser_id
        and p.kind = 'subscription_discount'
        and p.active
        and p.starts_at <= now()
        and (p.expires_at is null or p.expires_at > now())
      order by p.amount desc nulls last
      limit 1;
    if v_disc is not null and v_disc > 0 then
      v_amount := round(r.amount * (1 - least(v_disc, 100) / 100.0), 2);
    end if;
    if v_amount <= 0 then
      update public.subscriptions
         set next_payment_date = (v_period + interval '1 month'), updated_at = now()
       where id = r.id;
      v_waived := v_waived + 1;
      continue;
    end if;

    if exists (
      select 1 from public.invoices i
       where i.subscription_id = r.id and i.period_start = v_period
    ) then
      continue;
    end if;

    select id into v_company from public.companies
     where advertiser_id = r.advertiser_id limit 1;
    if v_company is null then
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
         v_amount,
         jsonb_build_array(jsonb_build_object(
           'name', 'Monthly subscription', 'rate', v_amount, 'amount', v_amount,
           'quantity', 1, 'tax', 0, 'currency', v_cur)),
         'unpaid', v_period, now() + interval '7 days')
      returning id into v_inv_id;
      v_generated := v_generated + 1;

      begin
        insert into public.notifications
          (recipient_user_id, tenant_id, type, payload, is_read)
        values
          (r.adv_user, r.tenant_id, 'subscription_invoice',
           jsonb_build_object('invoice_id', v_inv_id, 'amount', v_amount,
                              'currency', v_cur), false);
      exception when others then null; end;
    exception when others then
      raise warning 'subscription invoice generate failed for sub %: %', r.id, sqlerrm;
    end;
  end loop;

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
    exception when others then
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
    'waived', v_waived,
    'skipped_no_company', v_no_company);
end;
$$;

revoke all on function public.subscription_billing_run() from public, anon, authenticated;
grant execute on function public.subscription_billing_run() to service_role;
