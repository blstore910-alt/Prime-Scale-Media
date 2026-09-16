-- =====================================================================
-- Profiles that say "advertiser" but have no advertisers row
-- =====================================================================
-- Read-only.
--
-- The admin list shows two of these today ("the affiliateking", "Parel AF"):
-- a user_profiles row with role = 'advertiser' and nothing in `advertisers`
-- behind it. That is not cosmetic. Everything a customer has hangs off the
-- advertisers row:
--
--   wallets.advertiser_id, ad_accounts.advertiser_id,
--   subscriptions.advertiser_id, invoices.advertiser_id,
--   companies.advertiser_id, referral_links.affiliate_advertiser_id
--
-- so without it the account has no wallet, cannot hold a subscription,
-- cannot be invoiced and cannot own an ad account. It can sign in and see an
-- app that does nothing. It also has no tenant_client_code, so it appears in
-- lists as "—" and cannot be referred to on a payment.
--
-- ensure_advertiser_and_wallet() exists and is idempotent — the accept-invite
-- path calls it — so the repair is likely a matter of calling it for these
-- profiles. Find out WHICH ones first, and how they got here: an invite that
-- half-completed, a signup path that skipped it, or a row deleted later.
-- =====================================================================

select
  up.id            as profile_id,
  up.full_name,
  up.email,
  up.role,
  up.status,
  up.is_active,
  up.created_at,
  t.name           as tenant,
  -- What they would lose by being left like this.
  (select count(*) from public.wallets w  where w.advertiser_id is not null
     and w.advertiser_id in (select a.id from public.advertisers a where a.profile_id = up.id)) as wallets,
  (select count(*) from public.ad_accounts ac
     where ac.advertiser_id in (select a.id from public.advertisers a where a.profile_id = up.id)) as ad_accounts
from public.user_profiles up
left join public.tenants t on t.id = up.tenant_id
where up.role = 'advertiser'
  and not exists (
    select 1 from public.advertisers a where a.profile_id = up.id
  )
order by up.created_at desc;

-- ---------------------------------------------------------------------
-- Expected: no rows.
--
-- If rows come back, check `advertisers.user_id` too — some code paths key
-- the advertiser off user_id rather than profile_id, and a row linked one way
-- but not the other looks missing to half the app:
--
--   select up.id, up.email,
--          exists(select 1 from public.advertisers a where a.profile_id = up.id) as by_profile,
--          exists(select 1 from public.advertisers a where a.user_id   = up.user_id) as by_user
--     from public.user_profiles up
--    where up.role = 'advertiser'
--    order by up.created_at desc;
--
-- A row that is `by_user = true, by_profile = false` is a DIFFERENT fault
-- from a missing row, and needs relinking rather than creating.
-- ---------------------------------------------------------------------
