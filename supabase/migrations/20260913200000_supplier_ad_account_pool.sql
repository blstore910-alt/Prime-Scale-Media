-- =====================================================================
-- supplier_ad_accounts — the AD-ACCOUNT POOL
-- =====================================================================
-- Today the `sync_ad_accounts` integration job calls the supplier's
-- ad-accounts list endpoint and then just dumps the payload into
-- integration_jobs.result — nothing is persisted, so there is no inventory
-- of the accounts the supplier has provisioned to us, and no way to see the
-- ones that aren't allocated to an advertiser yet.
--
-- This table IS that pool: one row per supplier-side ad account, upserted on
-- every sync. A row is "unassigned" (available inventory) until an admin
-- allocates it to an advertiser, which creates the matching public.ad_accounts
-- row and stamps advertiser_id / ad_account_id / assigned_at here.
--
-- Deliberately a SEPARATE table rather than nullable ad_accounts.advertiser_id:
-- public.ad_accounts is hand-authored and every advertiser-facing query
-- assumes an owner, so widening it would ripple everywhere. The pool is
-- supplier inventory; ad_accounts stays "an account an advertiser owns".
--
-- Only tenant_id carries a FK — advertiser_id / ad_account_id / assigned_by
-- are plain uuids on purpose, because those tables are hand-authored on the
-- live DB and a mismatched FK would make this migration fail to apply.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY (git push ships only the frontend).
-- =====================================================================

set search_path = public;

create table if not exists public.supplier_ad_accounts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  provider        text not null default 'supplier1',
  external_id     text not null,            -- supplier's ad_account_id

  -- Mirrored supplier fields (refreshed on every sync)
  name            text,
  bm_id           text,
  platform        text,                     -- meta-ads | tiktok-ads | google-ads
  currency        text,
  timezone        text,
  status          text,                     -- active | paused | suspended
  fee_percentage  numeric,
  balance_cents   bigint,
  supplier_assigned_to text,                -- supplier-side owner, if they report one
  raw             jsonb,                    -- full normalised row, for debugging

  -- Allocation to one of our advertisers
  ad_account_id   uuid,                     -- public.ad_accounts.id once allocated
  advertiser_id   uuid,                     -- public.advertisers.id once allocated
  assigned_at     timestamptz,
  assigned_by     uuid,                     -- public.user_profiles.id
  notes           text,

  synced_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint supplier_ad_accounts_uq unique (tenant_id, provider, external_id)
);

create index if not exists supplier_ad_accounts_tenant_idx
  on public.supplier_ad_accounts (tenant_id, advertiser_id);
create index if not exists supplier_ad_accounts_unassigned_idx
  on public.supplier_ad_accounts (tenant_id, advertiser_id, platform)
  where advertiser_id is null;

-- RLS: any tenant member may READ (an advertiser only ever sees their own
-- ad_accounts anyway, and the pool page is admin-only in the UI);
-- only admins of the tenant may WRITE.
alter table public.supplier_ad_accounts enable row level security;

drop policy if exists supplier_ad_accounts_read on public.supplier_ad_accounts;
create policy supplier_ad_accounts_read on public.supplier_ad_accounts
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = supplier_ad_accounts.tenant_id
    )
  );

drop policy if exists supplier_ad_accounts_admin_write on public.supplier_ad_accounts;
create policy supplier_ad_accounts_admin_write on public.supplier_ad_accounts
  for all to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = supplier_ad_accounts.tenant_id
        and up.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = supplier_ad_accounts.tenant_id
        and up.role = 'admin'
    )
  );

-- Keep updated_at fresh + audit the allocation history (CLAUDE.md: new
-- business tables get both). Attached inline because the array-based trigger
-- migrations already ran before this table existed.
drop trigger if exists trg_touch_supplier_ad_accounts on public.supplier_ad_accounts;
create trigger trg_touch_supplier_ad_accounts
  before update on public.supplier_ad_accounts
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_supplier_ad_accounts on public.supplier_ad_accounts;
create trigger trg_audit_supplier_ad_accounts
  after insert or update or delete on public.supplier_ad_accounts
  for each row execute function public._audit_row_change();
