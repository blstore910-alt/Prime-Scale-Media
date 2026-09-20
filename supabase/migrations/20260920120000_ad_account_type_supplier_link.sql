-- =====================================================================
-- SUPERSEDED BY 20260920140000 -- DO NOT RUN THIS AGAIN
-- =====================================================================
-- This adds supplier_label / supplier_url to ad_account_types, whose
-- read policy grants SELECT to ANY member of the tenant. That is a
-- customer-readable row, so those columns were a leak: any advertiser
-- could GET /rest/v1/ad_account_types?select=* and read the supplier's
-- name and dashboard URL. A supplier name WAS entered on production in
-- the hours this was live.
--
-- 20260920140000 moves the fields to ad_account_type_suppliers, which
-- is admin-only, and DROPS them from this table. Running this file
-- again -- for instance by replaying the folder in filename order --
-- re-adds them and re-opens the leak, and its report below would print
-- OK while doing so.
--
-- The app at HEAD reads only ad_account_type_suppliers. This file is
-- kept for the record.
-- =====================================================================

-- =====================================================================
-- ad_account_types.supplier_label / supplier_url
--    where an admin goes to do a top-up by hand
-- =====================================================================
-- Only ONE ad-account type tops up over the API (api_topup_enabled).
-- Every other type means an admin opens the supplier's own dashboard in
-- another tab, moves the money there, comes back and presses Verify.
--
-- The review screen never said which supplier, let alone linked to one.
-- With three or four suppliers in play that is a guess made against a
-- customer's money -- and the admin who knows the mapping by heart is
-- the one who is on holiday when it matters.
--
-- Per TYPE rather than a table of suppliers, because the type IS the
-- mapping: Meta-EU-PSM comes from one supplier, Meta-HK-Premium from
-- another. Two columns, no new table, no new RLS.
--
-- ADMIN-ONLY DATA. ad_account_types is already an admin-read table
-- (its policies live in the tenant-scoped templates) and nothing on an
-- advertiser or affiliate surface selects from it. The supplier's name
-- must never reach a customer, in the UI or in the JSON behind it.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

alter table public.ad_account_types
  add column if not exists supplier_label text,
  add column if not exists supplier_url   text;

comment on column public.ad_account_types.supplier_label is
  'Admin-only. The supplier that services this ad-account type. Never rendered on a customer surface.';
comment on column public.ad_account_types.supplier_url is
  'Admin-only. The supplier dashboard an admin opens to fund an account of this type by hand. http/https only; the app refuses anything else before it renders a link.';

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
select
  'ad_account_types.supplier_label' as item,
  case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ad_account_types'
        and column_name = 'supplier_label'
    ) then 'OK'
    else 'MISSING'
  end as status
union all
select
  'ad_account_types.supplier_url',
  case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ad_account_types'
        and column_name = 'supplier_url'
    ) then 'OK'
    else 'MISSING'
  end
union all
select
  'types with a supplier link',
  coalesce(
    (
      select count(*)::text
      from public.ad_account_types
      where coalesce(supplier_url, '') <> ''
    ),
    '0'
  );
