-- =====================================================================
-- Fix affiliate_referral_stats — the referral_links_with_details view
-- does NOT expose commission_currency (the TS type was aspirational),
-- so the original function 400'd with "column d.commission_currency
-- does not exist". Pull the commission fields from the BASE
-- referral_links table (proven columns, per the accrual trigger) joined
-- on the link id, and keep the identity + affiliate filter from the
-- view (those columns are what the app already renders).
-- =====================================================================

set search_path = public;

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

  select a.id into v_aff
    from public.advertisers a
   where a.user_id = v_uid
   limit 1;
  if v_aff is null then
    return;
  end if;

  -- All string columns are cast to ::text — the view/base columns are
  -- varchar and RETURNS TABLE(text) is strict about varchar vs text.
  return query
  select
    d.id                                        as referral_link_id,
    d.referred_advertiser_id                    as referred_advertiser_id,
    d.referred_advertiser_name::text            as referred_advertiser_name,
    d.referred_advertiser_email::text           as referred_advertiser_email,
    d.referred_advertiser_tenant_client_code::text as referred_advertiser_code,
    rl.commission_type::text                    as commission_type,
    rl.commission_pct::numeric                  as commission_pct,
    rl.commission_currency::text                as commission_currency,
    coalesce(sp.spend_usd, 0)::numeric          as spend_usd,
    coalesce(sp.spend_eur, 0)::numeric          as spend_eur,
    coalesce(sp.topup_count, 0)::int            as topup_count,
    coalesce(ea.earn_usd, 0)::numeric           as earnings_usd,
    coalesce(ea.earn_eur, 0)::numeric           as earnings_eur
  from public.referral_links_with_details d
  join public.referral_links rl on rl.id = d.id
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
