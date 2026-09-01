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
