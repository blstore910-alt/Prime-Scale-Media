-- =====================================================================
-- Backlog build-out (2026-09-01) — run this whole file once, in order.
-- Notifications prefs + integration alerts, affiliate dashboard RPC,
-- plan storage + included-free requests, subscription billing engine,
-- and the promotions/perks engine. Idempotent + additive.
-- =====================================================================


-- ========== 20260901300000_notification_preferences.sql ==========

-- notification_preferences + integration-failure alerts
--
-- Two things ship together here:
--
--   1. Per-user push preferences. A user (any role) chooses which
--      notification TYPES ping their device. Absence of a row = enabled
--      (opt-out model), so existing users keep getting everything until
--      they mute something. Only push DELIVERY is affected — the in-app
--      notification row is still written, so nothing is silently lost.
--
--   2. When an external integration/connection fails, every admin in the
--      tenant gets a notification. The super-admin is just the admin who
--      owns the tenant (tenants.owner_id), so role='admin' already covers
--      both tiers — see lib/permissions.ts. A DB trigger on
--      integration_jobs raises it, so the alert fires no matter which
--      code path marked the job failed. Manual fallback is always
--      available, so an alert never blocks operations.

-- ─────────────────────────────────────────────────────────────
-- 1) notification_preferences
-- ─────────────────────────────────────────────────────────────
create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  push_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

alter table public.notification_preferences enable row level security;

-- Self-service: a user reads and writes only their own preference rows.
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own
  on public.notification_preferences
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Keep updated_at fresh on edits (the column has a default for inserts).
drop trigger if exists trg_touch_notification_preferences
  on public.notification_preferences;
create trigger trg_touch_notification_preferences
  before update on public.notification_preferences
  for each row execute function public._touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2) raise_integration_failure(tenant, source, detail)
--    Inserts one notification per admin of the tenant. Throttled so a
--    flapping integration doesn't spam: skip if an unread
--    integration_failure for the same source was raised in the last
--    hour. SECURITY DEFINER because it writes notifications for OTHER
--    users; safe because it only ever targets admins of the given
--    tenant and writes a fixed, non-caller-controlled shape.
-- ─────────────────────────────────────────────────────────────
create or replace function public.raise_integration_failure(
  p_tenant_id uuid,
  p_source text,
  p_detail text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent int;
begin
  if p_tenant_id is null then
    return;
  end if;

  select count(*) into v_recent
  from public.notifications n
  where n.tenant_id = p_tenant_id
    and n.type = 'integration_failure'
    and coalesce(n.is_read, false) = false
    and n.created_at > now() - interval '1 hour'
    and coalesce(n.payload->>'source', '') = coalesce(p_source, '');

  if v_recent > 0 then
    return;
  end if;

  insert into public.notifications (recipient_user_id, tenant_id, type, payload, is_read)
  select up.user_id,
         p_tenant_id,
         'integration_failure',
         jsonb_build_object(
           'source', coalesce(p_source, 'integration'),
           'detail', left(coalesce(p_detail, ''), 500)
         ),
         false
  from public.user_profiles up
  where up.tenant_id = p_tenant_id
    and up.role = 'admin'
    and up.user_id is not null;
end;
$$;

revoke all on function public.raise_integration_failure(uuid, text, text) from public;

-- ─────────────────────────────────────────────────────────────
-- 3) Trigger: fire the alert when a job transitions to 'failed'.
--    Wrapped so a notification-schema hiccup can NEVER roll back the
--    job's own state transition — the worker must always be able to
--    record a failure.
-- ─────────────────────────────────────────────────────────────
create or replace function public._alert_on_integration_job_failed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'failed'
     and coalesce(old.status, '') is distinct from 'failed' then
    begin
      perform public.raise_integration_failure(
        new.tenant_id,
        new.provider,
        coalesce(new.last_error, 'Integration job failed')
      );
    exception when others then
      -- Alerting is best-effort; never break the job state machine.
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_alert_integration_job_failed on public.integration_jobs;
create trigger trg_alert_integration_job_failed
  after update of status on public.integration_jobs
  for each row execute function public._alert_on_integration_job_failed();

-- ========== 20260901320000_affiliate_referral_stats.sql ==========

-- affiliate_referral_stats(from, to)
--
-- Powers the affiliate dashboard: per referred advertiser, how much
-- they've spent (= their completed wallet top-ups, the volume the
-- affiliate drove) and how much the affiliate earned (referral
-- commissions), within an optional date range.
--
-- SECURITY: the caller's own affiliate advertiser id is resolved
-- server-side from auth.uid() — never passed in — so an affiliate can
-- only ever see their OWN referral book. No parameter can widen that.
-- SECURITY DEFINER is required because an affiliate has no RLS grant to
-- read a referred advertiser's wallet top-ups; this function exposes
-- only aggregates of their own referrals, nothing row-level.
--
-- "spend" mirrors the commission-accrual rule
-- (_accrue_referral_commission): commission accrues on a referred
-- advertiser's completed wallet_topup, so spend = sum of those
-- completed top-ups. Earnings are date-filtered from
-- referral_commissions.created_at rather than the cumulative running
-- total on referral_links, so a date range means what it says.

create or replace function public.affiliate_referral_stats(
  p_from timestamptz default null,
  p_to timestamptz default null
) returns table (
  referral_link_id uuid,
  referred_advertiser_id uuid,
  referred_advertiser_name text,
  referred_advertiser_email text,
  referred_advertiser_code text,
  commission_type text,
  commission_pct numeric,
  commission_currency text,
  spend_usd numeric,
  spend_eur numeric,
  topup_count int,
  earnings_usd numeric,
  earnings_eur numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_aff uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- The affiliate is an advertiser who refers others. Resolve their own
  -- advertiser id from the session; if they aren't an advertiser they
  -- simply have no referral book and we return no rows.
  select a.id into v_aff
    from public.advertisers a
   where a.user_id = v_uid
   limit 1;
  if v_aff is null then
    return;
  end if;

  return query
  select
    d.id                                        as referral_link_id,
    d.referred_advertiser_id                    as referred_advertiser_id,
    d.referred_advertiser_name                  as referred_advertiser_name,
    d.referred_advertiser_email                 as referred_advertiser_email,
    d.referred_advertiser_tenant_client_code    as referred_advertiser_code,
    d.commission_type                           as commission_type,
    d.commission_pct                            as commission_pct,
    d.commission_currency                       as commission_currency,
    coalesce(sp.spend_usd, 0)                   as spend_usd,
    coalesce(sp.spend_eur, 0)                   as spend_eur,
    coalesce(sp.topup_count, 0)::int            as topup_count,
    coalesce(ea.earn_usd, 0)                    as earnings_usd,
    coalesce(ea.earn_eur, 0)                    as earnings_eur
  from public.referral_links_with_details d
  left join lateral (
    select
      sum(wt.amount) filter (where upper(wt.currency) = 'USD') as spend_usd,
      sum(wt.amount) filter (where upper(wt.currency) = 'EUR') as spend_eur,
      count(*)                                                  as topup_count
    from public.wallet_topups wt
    join public.wallets w on w.id = wt.wallet_id
    where w.advertiser_id = d.referred_advertiser_id
      and wt.status = 'completed'
      and (p_from is null or wt.created_at >= p_from)
      and (p_to   is null or wt.created_at <= p_to)
  ) sp on true
  left join lateral (
    select
      sum(rc.amount) filter (where upper(rc.currency) = 'USD') as earn_usd,
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR') as earn_eur
    from public.referral_commissions rc
    where rc.referral_link_id = d.id
      and (p_from is null or rc.created_at >= p_from)
      and (p_to   is null or rc.created_at <= p_to)
  ) ea on true
  where d.affiliate_advertiser_id = v_aff
  order by d.referred_advertiser_name nulls last;
end;
$$;

revoke all on function public.affiliate_referral_stats(timestamptz, timestamptz) from public;
grant execute on function public.affiliate_referral_stats(timestamptz, timestamptz) to authenticated;

-- ========== 20260901340000_advertiser_plans.sql ==========

-- =====================================================================
-- advertiser_plans — the live plan settings for one advertiser
--    (plan-model phase 4, foundation)
-- =====================================================================
-- The invitation carries the chosen plan (monthly_fee, included_ad_accounts,
-- topup_fee_pct, plan_currency, plan_id). Phase 3 turned monthly_fee into a
-- subscription but DROPPED the rest. This table is where included_ad_accounts
-- and topup_fee_pct live per advertiser, so:
--   * the ad-account request fee can make the first N accounts free, and
--   * the wallet-topup fee can use the advertiser's plan rate.
--
-- One row per advertiser (upserted on accept). Absence of a row = no plan
-- perks (0 included, so the €50 request fee applies) — this keeps existing
-- advertisers on today's behaviour until they're put on a plan.
-- =====================================================================

set search_path = public;

create table if not exists public.advertiser_plans (
  advertiser_id       uuid primary key references public.advertisers(id) on delete cascade,
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  plan_id             uuid references public.plans(id),
  monthly_fee         numeric(10, 2) not null default 0,
  plan_currency       text not null default 'EUR',
  included_ad_accounts int not null default 0,
  topup_fee_pct       numeric(5, 2) not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.advertiser_plans enable row level security;

-- Advertiser reads their own plan; admins read their tenant's. No client
-- writes — populated only by SECURITY DEFINER functions.
drop policy if exists advertiser_plans_read_own on public.advertiser_plans;
create policy advertiser_plans_read_own on public.advertiser_plans
  for select to authenticated
  using (
    exists (
      select 1 from public.advertisers a
       where a.id = advertiser_plans.advertiser_id
         and a.user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = advertiser_plans.tenant_id
         and up.role = 'admin'
    )
  );

drop trigger if exists trg_touch_advertiser_plans on public.advertiser_plans;
create trigger trg_touch_advertiser_plans
  before update on public.advertiser_plans
  for each row execute function public._touch_updated_at();

-- ---------------------------------------------------------------------
-- Extend create_subscription_from_invite to ALSO persist the plan.
-- Same signature + guards as 20260901240000; the only change is the
-- advertiser_plans upsert, which runs even for free/NSA plans (monthly
-- fee 0) so their included-accounts + topup-fee settings still apply.
-- ---------------------------------------------------------------------
create or replace function public.create_subscription_from_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations%rowtype;
  v_adv public.advertisers%rowtype;
  v_fee numeric;
  v_cur text;
  v_has_plan boolean;
begin
  select * into v_inv from public.invitations where id = p_invite_id;
  if not found then return; end if;

  if v_uid is null then
    select a.* into v_adv
      from public.advertisers a
      join public.user_profiles up on up.user_id = a.user_id
     where lower(up.email) = lower(coalesce(v_inv.email, ''))
       and a.tenant_id = v_inv.tenant_id
     order by a.created_at desc
     limit 1;
  else
    select * into v_adv from public.advertisers where user_id = v_uid limit 1;
  end if;
  if not found then return; end if;

  v_cur := upper(coalesce(v_inv.plan_currency, 'EUR'));
  if v_cur not in ('USD', 'EUR') then v_cur := 'EUR'; end if;

  -- Persist the plan whenever the invite carried ANY plan signal, so a
  -- free/NSA advertiser still gets their included accounts + topup rate.
  v_has_plan := v_inv.plan_id is not null
             or v_inv.monthly_fee is not null
             or v_inv.included_ad_accounts is not null
             or v_inv.topup_fee_pct is not null;

  if v_has_plan then
    insert into public.advertiser_plans
      (advertiser_id, tenant_id, plan_id, monthly_fee, plan_currency,
       included_ad_accounts, topup_fee_pct)
    values
      (v_adv.id, v_adv.tenant_id, v_inv.plan_id,
       coalesce(v_inv.monthly_fee, 0), v_cur,
       coalesce(v_inv.included_ad_accounts, 0),
       coalesce(v_inv.topup_fee_pct, 0))
    on conflict (advertiser_id) do update
      set plan_id              = excluded.plan_id,
          monthly_fee          = excluded.monthly_fee,
          plan_currency        = excluded.plan_currency,
          included_ad_accounts = excluded.included_ad_accounts,
          topup_fee_pct        = excluded.topup_fee_pct,
          updated_at           = now();
  end if;

  v_fee := coalesce(v_inv.monthly_fee, 0);
  if v_fee <= 0 then return; end if; -- free / no plan → no subscription

  if exists (
    select 1 from public.subscriptions s
     where s.advertiser_id = v_adv.id
       and s.status in ('active', 'inactive', 'past_due', 'paused')
  ) then
    return;
  end if;

  insert into public.subscriptions
    (advertiser_id, tenant_id, amount, currency, start_date, status,
     next_payment_date)
  values
    (v_adv.id, v_inv.tenant_id, v_fee, v_cur, now(), 'active',
     now() + interval '1 month');
end;
$$;

revoke all on function public.create_subscription_from_invite(uuid) from public, anon;
grant execute on function public.create_subscription_from_invite(uuid) to authenticated, service_role;

-- ========== 20260901360000_request_included_free.sql ==========

-- =====================================================================
-- ad_account_request_create_paid — honour the plan's included accounts
--    (plan-model phase 4)
-- =====================================================================
-- Same RPC as 20260901160000, with one change: the first
-- advertiser_plans.included_ad_accounts requests are FREE; only requests
-- beyond the included count charge the €50 (or USD-equivalent) fee.
--
-- "used" = the advertiser's ad-account requests that weren't rejected or
-- cancelled (each such request is an account they're getting). The
-- advertiser_plans row is locked FOR UPDATE so two concurrent requests
-- can't both slip in under the same free slot. No plan row = 0 included
-- = today's behaviour (always charged).
--
-- The request row's metadata records the fee decision (request_fee,
-- request_fee_currency, request_fee_included) so the refund flow and the
-- admin UI can see whether anything was charged.
-- =====================================================================

set search_path = public;

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

  -- How many free accounts does the plan include? Lock the plan row so
  -- concurrent requests serialise on the free-slot decision.
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
    v_fee := 0;
  else
    -- Fee: €50 base; USD = round(50 / active usd->eur rate) whole dollars.
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

    -- Lock the wallet, check the floor, debit.
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
            'request_fee_included', v_is_free
          ),
     'pending')
  returning * into v_req;

  return v_req;
end;
$$;

revoke all on function public.ad_account_request_create_paid(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.ad_account_request_create_paid(text, text, text, text, text, jsonb) to authenticated;

-- ========== 20260901380000_subscription_billing.sql ==========

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

-- ========== 20260901400000_advertiser_perks.sql ==========

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
