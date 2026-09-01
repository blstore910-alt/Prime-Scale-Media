-- =====================================================================
-- create_subscription_from_invite — also create the referral link when
-- the invitation carried a referrer (invitations.affiliate_id).
-- =====================================================================
-- Super-admins can pick a referrer (an affiliate advertiser) on the
-- invite form. That was stored on invitations.affiliate_id but never
-- turned into a referral_links row on accept, so the referrer was
-- "remembered but not linked" and earned no commission. This re-creates
-- the accept RPC (same as 20260901340000) plus a best-effort referral
-- link: referred = the new advertiser, affiliate = invitations.affiliate_id
-- (an advertiser id), commission copied from that affiliate, status
-- 'active' (a super-admin choosing the referrer IS the approval — same
-- as assignAffiliateToAdvertiser). Idempotent per referred advertiser.
-- =====================================================================

set search_path = public;

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

  -- Persist the plan (even for free/NSA advertisers).
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

  -- Referrer → referral link (best-effort; never block accept).
  if v_inv.affiliate_id is not null then
    begin
      if not exists (
        select 1 from public.referral_links
         where referred_advertiser_id = v_adv.id
      ) then
        insert into public.referral_links
          (tenant_id, referred_advertiser_id, affiliate_advertiser_id,
           advertiser_user_id, affiliate_user_id,
           commission_type, commission_pct, commission_onetime,
           commission_monthly, commission_currency, status)
        select v_adv.tenant_id, v_adv.id, aff.id,
               v_adv.user_id, aff.user_id,
               aff.commission_type, aff.commission_pct, aff.commission_onetime,
               aff.commission_monthly, aff.commission_currency, 'active'
          from public.advertisers aff
         where aff.id = v_inv.affiliate_id
           and aff.tenant_id = v_adv.tenant_id
           and aff.id <> v_adv.id;
      end if;
    exception when others then
      raise warning 'referral link from invite failed for advertiser %: %',
        v_adv.id, sqlerrm;
    end;
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
