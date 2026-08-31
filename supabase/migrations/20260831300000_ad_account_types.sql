-- =====================================================================
-- ad_account_types — data-driven ad-account types with a default fee
-- =====================================================================
-- Types (Meta-HK-Premium, Meta-EU-PSM, Google, Tiktok, …) used to be
-- hardcoded in lib/constants.ts (PLATFORMS), so adding one meant a code
-- change + deploy. And the per-type fee lived only as a number typed by
-- hand on every ad_account. This table makes both data:
--
--   * admins add/rename/deactivate types in the app (no deploy)
--   * each type carries a default_fee_pct that auto-fills the fee field
--     when an account of that type is created (still overridable)
--
-- The fee at TOPUP time is still ad_accounts.fee — this table only
-- supplies the default. Existing accounts and historic topups are
-- untouched.
--
-- default_fee_pct is WHOLE PERCENT (5 = 5%) to match ad_accounts.fee,
-- so the auto-fill is a straight copy with no unit conversion.
--
-- platform_group (meta|google|tiktok) drives which platform-specific
-- metadata fields the create form shows, so a new type slots into an
-- existing platform family.
-- =====================================================================

set search_path = public;

create table if not exists public.ad_account_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  label text not null,
  slug text not null,
  platform_group text not null
    check (platform_group in ('meta', 'google', 'tiktok')),
  default_fee_pct numeric(5, 2) not null default 5
    check (default_fee_pct >= 0 and default_fee_pct <= 100),
  -- Whether this type can be auto-topped-up via the supplier API
  -- (SeamX) later. Only Meta-EU-PSM is API-automatable; every other
  -- type is handled manually (advertiser uploads a payment slip → admin
  -- verifies → wallet credited → ad-account topup verified by hand).
  api_topup_enabled boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_account_types_slug_uq unique (tenant_id, slug)
);

create index if not exists ad_account_types_tenant_idx
  on public.ad_account_types(tenant_id);
create index if not exists ad_account_types_active_idx
  on public.ad_account_types(tenant_id, is_active, sort_order);

-- RLS: any tenant member may READ (so labels resolve everywhere and the
-- create form can list types); only admins may WRITE.
alter table public.ad_account_types enable row level security;

drop policy if exists ad_account_types_read on public.ad_account_types;
create policy ad_account_types_read on public.ad_account_types
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = ad_account_types.tenant_id
    )
  );

drop policy if exists ad_account_types_admin_write on public.ad_account_types;
create policy ad_account_types_admin_write on public.ad_account_types
  for all to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = ad_account_types.tenant_id
        and up.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = ad_account_types.tenant_id
        and up.role = 'admin'
    )
  );

-- New financial-adjacent table → audit + touch triggers (CLAUDE.md
-- non-negotiable). Attached explicitly, same as fee_defaults did, since
-- the array-based trigger migrations already ran before this table
-- existed.
drop trigger if exists trg_touch_ad_account_types on public.ad_account_types;
create trigger trg_touch_ad_account_types
  before update on public.ad_account_types
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_ad_account_types on public.ad_account_types;
create trigger trg_audit_ad_account_types
  after insert or update or delete on public.ad_account_types
  for each row execute function public._audit_row_change();

-- Seed the current hardcoded types for every tenant that has none yet.
-- Mirror of lib/constants.ts PLATFORMS; fees mirror the old fee_defaults
-- seed (meta/google 5%, tiktok 6%). Idempotent: skips a tenant that
-- already has any type row.
-- Note: Meta-EU-GDN is intentionally NOT seeded — removed per business
-- rule. Only Meta-EU-PSM is API-automatable (api => true).
insert into public.ad_account_types
  (tenant_id, label, slug, platform_group, default_fee_pct, api_topup_enabled, sort_order)
select t.id, v.label, v.slug, v.platform_group, v.fee, v.api, v.ord
from public.tenants t
cross join (values
  ('Meta-HK-Premium',        'hk-meta-premium',        'meta',   5, false, 1),
  ('Meta-HK-Business',       'hk-meta-business',       'meta',   5, false, 2),
  ('Meta-HK-Business-Green', 'hk-meta-business-green', 'meta',   5, false, 3),
  ('Meta-EU-Premium',        'eu-meta-premium',        'meta',   5, false, 4),
  ('Meta-EU-PSM',            'eu-meta-psm',            'meta',   5, true,  5),
  ('Meta-EU-PSM-GH',         'eu-meta-psm-gh',         'meta',   5, false, 6),
  ('Google',                 'google',                 'google', 5, false, 7),
  ('Tiktok',                 'tiktok',                 'tiktok', 6, false, 8)
) as v(label, slug, platform_group, fee, api, ord)
where not exists (
  select 1 from public.ad_account_types x where x.tenant_id = t.id
);
