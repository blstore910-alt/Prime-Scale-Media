-- fee_defaults
--
-- Per-tenant default topup fee percentages, keyed by ad-account
-- platform + currency. Populated once per tenant by the admin bootstrap
-- (mirror of the exchange_rates seed) and editable by any admin.
--
-- At topup time the fee resolution is:
--   1. advertiser row's fee override, if any
--   2. this table's active row for (platform, currency)
--   3. hardcoded floor (0.05 = 5%)
--
-- The percentage is a fraction (0.05 = 5%) not a whole-number pct, to
-- avoid off-by-100 bugs at the boundary. Range clamped in a CHECK.

create table if not exists public.fee_defaults (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  platform text not null,
  currency text not null,
  fee_pct numeric(6, 4) not null check (fee_pct >= 0 and fee_pct <= 1),
  is_active boolean not null default true,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_defaults_platform_ck
    check (platform in ('meta-ads', 'tiktok-ads', 'google-ads')),
  constraint fee_defaults_currency_ck
    check (currency in ('USD', 'EUR')),
  constraint fee_defaults_uq
    unique (tenant_id, platform, currency)
);

create index if not exists fee_defaults_tenant_idx
  on public.fee_defaults(tenant_id);
create index if not exists fee_defaults_active_idx
  on public.fee_defaults(tenant_id, platform, currency)
  where is_active;

-- RLS: admins of the tenant read/write; nobody else touches it.
alter table public.fee_defaults enable row level security;

drop policy if exists fee_defaults_admin_all on public.fee_defaults;
create policy fee_defaults_admin_all on public.fee_defaults
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = fee_defaults.tenant_id
        and up.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = fee_defaults.tenant_id
        and up.role = 'admin'
    )
  );

-- The audit + updated_at migrations already list 'fee_defaults' in
-- their audited table array, but those migrations ran before this
-- one existed — their DO block skipped the table with `if exists`.
-- Attach the triggers explicitly here, using the same naming
-- convention so a re-run of the array script drop-and-recreates
-- these instead of duplicating them.
drop trigger if exists trg_touch_fee_defaults on public.fee_defaults;
create trigger trg_touch_fee_defaults
  before update on public.fee_defaults
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_fee_defaults on public.fee_defaults;
create trigger trg_audit_fee_defaults
  after insert or update or delete on public.fee_defaults
  for each row execute function public._audit_row_change();
