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
