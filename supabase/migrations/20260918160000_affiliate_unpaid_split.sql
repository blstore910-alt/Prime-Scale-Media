-- =====================================================================
-- "Request payout" was asking to be paid money we had already paid.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. Run the whole file in one go — it drops
-- and recreates the function, because two columns are being ADDED to its
-- RETURNS TABLE and Postgres will not let `create or replace` change a
-- function's result type.
--
-- THE BUG. affiliate_referral_stats sums referral_commissions.amount with
-- no status filter:
--
--     sum(rc.amount) filter (where upper(rc.currency) = 'EUR') as earn_eur
--
-- but that table carries `status` — 'unpaid' or 'paid' — and an admin
-- flips it to 'paid' from the commissions screen when the money actually
-- goes out. So the figure the affiliate portal calls "Commission earned",
-- shows in its commission wallet, and pastes into the payout request email
-- is the LIFETIME GROSS.
--
-- After PSM pays an affiliate €500, their wallet still reads €500 and
-- "Request payout" mails the team asking for the same €500 again. There is
-- nothing on either side of that conversation to catch it: the affiliate
-- is reading the number the app gave them, and the team is reading a
-- request that looks exactly like a first one.
--
-- WHAT THIS CHANGES. Two columns are added — unpaid_usd and unpaid_eur —
-- and NOTHING ELSE. earnings_usd/earnings_eur keep their present meaning
-- (lifetime), so every existing reader keeps working and keeps showing the
-- same figure; the app then uses `unpaid_*` where it means "what we owe
-- you" and `earnings_*` where it means "what you have earned in total".
-- Those are different sentences and the portal shows both.
--
-- The rest of the body is reproduced unchanged from
-- 20260901420000_fix_affiliate_stats.sql.
--
-- ROLLBACK: re-apply 20260901420000_fix_affiliate_stats.sql.
-- =====================================================================

set search_path = public;

drop function if exists public.affiliate_referral_stats(timestamptz, timestamptz);

create function public.affiliate_referral_stats(
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
  earnings_eur numeric,
  unpaid_usd numeric,
  unpaid_eur numeric
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
    coalesce(ea.earn_eur, 0)::numeric           as earnings_eur,
    coalesce(ea.unpaid_usd, 0)::numeric         as unpaid_usd,
    coalesce(ea.unpaid_eur, 0)::numeric         as unpaid_eur
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
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR') as earn_eur,
      -- THE TWO NEW ONES. Anything not yet marked paid. coalesce on the
      -- status so a NULL — a row written before the column existed — is
      -- treated as unpaid rather than silently vanishing from what we owe.
      sum(rc.amount) filter (
        where upper(rc.currency) = 'USD'
          and coalesce(rc.status, 'unpaid') <> 'paid'
      )                                                        as unpaid_usd,
      sum(rc.amount) filter (
        where upper(rc.currency) = 'EUR'
          and coalesce(rc.status, 'unpaid') <> 'paid'
      )                                                        as unpaid_eur
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

-- ── Read back ────────────────────────────────────────────────────────
-- What the split looks like on live right now. If paid_rows is 0 the two
-- figures agree today and diverge the first time somebody is paid — which
-- is the point.
--
-- ::numeric on every sum. referral_commissions.amount is `real`, and
-- round(real, int) does not exist in Postgres — only round(numeric, int).
-- (That the column is a float at all is worth a separate look: money in a
-- float accumulates error. It is not changed here.)
select
  count(*)                                                   as commission_rows,
  count(*) filter (where coalesce(status,'unpaid') = 'paid') as paid_rows,
  round(coalesce(sum(amount) filter (where upper(currency) = 'EUR'), 0)::numeric, 2)
                                                             as lifetime_eur,
  round(coalesce(sum(amount) filter (where upper(currency) = 'EUR'
                              and coalesce(status,'unpaid') <> 'paid'), 0)::numeric, 2)
                                                             as unpaid_eur,
  round(coalesce(sum(amount) filter (where upper(currency) = 'USD'), 0)::numeric, 2)
                                                             as lifetime_usd,
  round(coalesce(sum(amount) filter (where upper(currency) = 'USD'
                              and coalesce(status,'unpaid') <> 'paid'), 0)::numeric, 2)
                                                             as unpaid_usd
  from public.referral_commissions;
