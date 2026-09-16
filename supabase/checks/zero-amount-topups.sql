-- =====================================================================
-- Did the broken bulk top-up actually write any zero rows?
-- =====================================================================
-- Read-only.
--
-- Between d69a669 (yesterday) and the fix, components/topups/
-- bulk-ad-accounts-topup-dialog.tsx passed ONE exchange-rate row to a
-- parameter that expects an ARRAY. calculateTopupAmount therefore read the
-- rate as 0, and every non-USD bulk top-up was inserted with
--
--   amount_usd = 0, topup_amount = 0, fee_amount = 0, eur_topup = 0
--
-- while amount_received kept the number the admin typed. USD rows kept their
-- USD figures but lost eur_value / eur_topup.
--
-- The fix stops new ones. This finds any that were already written, because
-- a pending top-up at $0 credits the ad account nothing when it is verified,
-- and the supplier push refuses it with "topup_amount is not a positive
-- number" — which looks like an integration fault rather than a data fault.
--
-- Nothing here writes. If it returns rows, fix them by editing the amount on
-- the top-up before verifying it, NOT by re-running the bulk dialog.
-- =====================================================================

select
  t.id,
  t.created_at,
  t.status,
  t.currency,
  t.amount_received,        -- what the admin typed: this survived
  t.amount_usd,             -- 0 on an affected row
  t.topup_amount,           -- 0 on an affected row
  t.fee_amount,             -- 0 on an affected row
  t.eur_value,
  t.eur_topup,
  a.tenant_client_code,
  acc.name        as account_name,
  acc.external_id
from public.top_ups t
left join public.advertisers a  on a.id  = t.advertiser_id
left join public.ad_accounts acc on acc.id = t.account_id
where t.amount_received > 0
  and (
        coalesce(t.amount_usd, 0)    = 0
     or coalesce(t.topup_amount, 0)  = 0
     or (t.currency <> 'USD' and coalesce(t.eur_topup, 0) = 0)
  )
  and t.created_at > now() - interval '14 days'
order by t.created_at desc;

-- ---------------------------------------------------------------------
-- Expected: no rows.
--
-- If rows come back, the ones that matter most are status = 'pending' —
-- those have not been credited yet, so correcting the amount now costs
-- nothing. A row already 'verified' at $0 means an ad account was credited
-- nothing while the advertiser was charged amount_received; that needs a
-- wallet adjustment, not an edit.
-- ---------------------------------------------------------------------
