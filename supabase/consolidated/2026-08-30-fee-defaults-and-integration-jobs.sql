-- ═══════════════════════════════════════════════════════════════════
-- Combined migration — paste into Supabase SQL Editor and run once.
--
-- Includes:
--   1. fee_defaults table + RLS + triggers
--   2. integration_jobs queue + RLS + triggers
--   3. Re-attach audit + updated_at triggers on both new tables
--
-- Safe to re-run — every DDL uses IF NOT EXISTS / drop-and-recreate.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- 1. fee_defaults
-- ─────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────
-- 2. integration_jobs
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  operation text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  attempts int not null default 0,
  max_attempts int not null default 5,
  next_run_at timestamptz not null default now(),
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint integration_jobs_idempotency_uq
    unique (provider, operation, idempotency_key)
);

create index if not exists integration_jobs_due_idx
  on public.integration_jobs (status, next_run_at)
  where status in ('pending', 'processing');

create index if not exists integration_jobs_tenant_idx
  on public.integration_jobs (tenant_id, created_at desc);

alter table public.integration_jobs enable row level security;

drop policy if exists integration_jobs_admin_read on public.integration_jobs;
create policy integration_jobs_admin_read on public.integration_jobs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = integration_jobs.tenant_id
        and up.role = 'admin'
    )
  );


-- ─────────────────────────────────────────────────────────────────
-- 3. Triggers for both tables
--    Requires public._touch_updated_at() and public._audit_row_change()
--    to already exist (installed by earlier migrations).
-- ─────────────────────────────────────────────────────────────────
drop trigger if exists trg_touch_fee_defaults on public.fee_defaults;
create trigger trg_touch_fee_defaults
  before update on public.fee_defaults
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_fee_defaults on public.fee_defaults;
create trigger trg_audit_fee_defaults
  after insert or update or delete on public.fee_defaults
  for each row execute function public._audit_row_change();

drop trigger if exists trg_touch_integration_jobs on public.integration_jobs;
create trigger trg_touch_integration_jobs
  before update on public.integration_jobs
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_integration_jobs on public.integration_jobs;
create trigger trg_audit_integration_jobs
  after insert or update or delete on public.integration_jobs
  for each row execute function public._audit_row_change();


-- ─────────────────────────────────────────────────────────────────
-- 4. Sanity check
-- ─────────────────────────────────────────────────────────────────
select
  'fee_defaults'    as table_name,
  count(*)          as rows
from public.fee_defaults
union all
select
  'integration_jobs',
  count(*)
from public.integration_jobs;
