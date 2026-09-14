-- =====================================================================
-- Per-ad-account SUPPLIER fee — what WE pay, next to what we charge
-- =====================================================================
-- ad_accounts.fee is what the ADVERTISER pays us on a top-up. Nothing
-- recorded what WE pay the supplier on that same top-up, so the real
-- margin on an ad account was not knowable from the app.
--
-- supplier_ad_accounts.fee_percentage looks like it fills that role, but
-- it cannot:
--   * it is a MIRROR of the supplier's own figure and is overwritten on
--     every sync, so an operator correction does not survive;
--   * it only exists for pool-sourced accounts — manual ones have none;
--   * it is per pool row, and the pool row can be released while the
--     advertiser's ad account lives on.
--
-- So the figure belongs on the ad account itself: it is a property of the
-- commercial arrangement, not of the supplier's inventory listing. It is
-- seeded from the pool row at allocation and editable by the super-admin
-- afterwards.
--
-- Nullable on purpose: NULL means "not recorded", which is different from
-- 0 ("the supplier charges us nothing"). Margin is only shown when it is
-- actually known — a 0 default would have every account silently claiming
-- full margin, which is the same class of bug as the blank-fee default
-- that made allocation create 0% accounts.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY (git push ships only the frontend).
-- Rollback:  alter table public.ad_accounts drop column supplier_fee_pct;
-- =====================================================================

set search_path = public;

alter table public.ad_accounts
  add column if not exists supplier_fee_pct numeric;

comment on column public.ad_accounts.supplier_fee_pct is
  'Top-up fee percentage WE pay the supplier for this ad account. NULL = not recorded (distinct from 0). Margin = fee - supplier_fee_pct.';

-- Keep it sane. Percentages only; NULL still allowed.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ad_accounts_supplier_fee_pct_range'
  ) then
    alter table public.ad_accounts
      add constraint ad_accounts_supplier_fee_pct_range
      check (supplier_fee_pct is null or (supplier_fee_pct >= 0 and supplier_fee_pct <= 100));
  end if;
end $$;

-- Seed from the pool for accounts already allocated from it, where the
-- supplier reported a fee. Only fills blanks — never overwrites an
-- operator's figure.
update public.ad_accounts a
   set supplier_fee_pct = s.fee_percentage
  from public.supplier_ad_accounts s
 where s.ad_account_id = a.id
   and s.provider = 'supplier1'
   and s.fee_percentage is not null
   and a.supplier_fee_pct is null;

-- Result (so the editor shows something rather than "no rows"):
select
  count(*)                                              as ad_accounts_total,
  count(supplier_fee_pct)                               as with_supplier_fee,
  count(*) filter (where supplier_fee_pct is null)      as still_unrecorded
from public.ad_accounts;
