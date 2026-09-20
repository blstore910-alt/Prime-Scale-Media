-- =====================================================================
-- ad_account_type_suppliers — the supplier link, where a customer
--                             cannot read it
-- =====================================================================
-- 20260920120000 put supplier_label / supplier_url on ad_account_types
-- on the stated assumption that "ad_account_types is already an
-- admin-read table". It is not. Its read policy
-- (20260831300000_ad_account_types.sql) is:
--
--     any user_profiles row in the tenant may SELECT
--
-- with no role test at all -- deliberately, so the ad-account create
-- form can list type labels. So every advertiser and every affiliate
-- could have run
--
--     GET /rest/v1/ad_account_types?select=*
--
-- with their own token and read the supplier's name and dashboard URL.
-- Nothing rendered it, and that is not the rule: the supplier's name
-- must never reach a customer surface, INCLUDING the JSON behind the
-- page.
--
-- A supplier name HAS been entered on production since those columns
-- landed, so this is a live exposure and not a theoretical one: run it.
-- The fix is to put the fields somewhere a customer has no policy on at
-- all, rather than to narrow a policy other screens depend on -- the
-- ad-account create form needs the labels, so the read policy stays.
--
-- Safe to run more than once. Safe to run BEFORE or AFTER
-- 20260920120000 -- it copies across only if those columns exist.
-- =====================================================================

set search_path = public;

create table if not exists public.ad_account_type_suppliers (
  ad_account_type_id uuid primary key
    references public.ad_account_types(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  supplier_label  text,
  supplier_url    text,
  -- What WE pay the supplier on a top-up for this type, as a percent.
  -- COST DATA. It belongs here and nowhere a customer can read: the
  -- margin is default_fee_pct minus this, and ad_accounts.supplier_fee_pct
  -- is deliberately kept off the row an advertiser selects with *.
  -- NULL means "not recorded", which is NOT the same as 0 ("they charge
  -- us nothing") -- margin is only shown when it is actually known.
  supplier_fee_pct numeric(5, 2)
    check (supplier_fee_pct is null
           or (supplier_fee_pct >= 0 and supplier_fee_pct <= 100)),
  updated_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.ad_account_type_suppliers
  add column if not exists supplier_fee_pct numeric(5, 2);

create index if not exists ad_account_type_suppliers_tenant_idx
  on public.ad_account_type_suppliers(tenant_id);

comment on table public.ad_account_type_suppliers is
  'ADMIN ONLY. Which supplier services an ad-account type, the dashboard an admin opens to fund one by hand, and what we pay them. A customer must never be able to read this, in the UI or over the API.';

-- ── RLS: admins of the tenant, and nobody else ───────────────────────
-- No advertiser policy, no affiliate policy, no "any tenant member"
-- policy. With RLS on and no matching policy, a customer's select
-- returns zero rows.
alter table public.ad_account_type_suppliers enable row level security;

drop policy if exists ad_account_type_suppliers_admin
  on public.ad_account_type_suppliers;
create policy ad_account_type_suppliers_admin
  on public.ad_account_type_suppliers
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

-- ── Move anything already entered, then take the columns away ────────
do $blk0$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ad_account_types'
      and column_name = 'supplier_url'
  ) then
    insert into public.ad_account_type_suppliers
      (ad_account_type_id, tenant_id, supplier_label, supplier_url)
    select t.id, t.tenant_id, t.supplier_label, t.supplier_url
    from public.ad_account_types t
    where coalesce(t.supplier_label, '') <> ''
       or coalesce(t.supplier_url, '') <> ''
    on conflict (ad_account_type_id) do update
      set supplier_label = excluded.supplier_label,
          supplier_url   = excluded.supplier_url,
          updated_at     = now();

    alter table public.ad_account_types
      drop column if exists supplier_label,
      drop column if exists supplier_url;
  end if;
end;
$blk0$;

-- updated_at, same as every other business table.
do $blk1$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_touch_updated_at'
  ) then
    drop trigger if exists touch_ad_account_type_suppliers
      on public.ad_account_type_suppliers;
    create trigger touch_ad_account_type_suppliers
      before update on public.ad_account_type_suppliers
      for each row execute function public._touch_updated_at();
  end if;
end;
$blk1$;

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
select
  'ad_account_type_suppliers exists' as item,
  case
    when to_regclass('public.ad_account_type_suppliers') is not null
    then 'OK' else 'MISSING'
  end as status
union all
select
  'supplier columns off ad_account_types',
  case
    when not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ad_account_types'
        and column_name in ('supplier_label', 'supplier_url')
    ) then 'OK (a customer cannot read them)'
    else 'STILL THERE - customers can read them'
  end
union all
select
  'RLS on, admin-only policy',
  case
    when exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'ad_account_type_suppliers'
        and policyname = 'ad_account_type_suppliers_admin'
    ) then 'OK' else 'MISSING'
  end
union all
select
  'supplier_fee_pct present',
  case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ad_account_type_suppliers'
        and column_name = 'supplier_fee_pct'
    ) then 'OK' else 'MISSING'
  end
union all
select
  'supplier links carried over',
  coalesce(
    (select count(*)::text from public.ad_account_type_suppliers),
    '0'
  );
