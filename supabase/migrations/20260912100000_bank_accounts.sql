-- =====================================================================
-- bank_accounts — beneficiary bank destinations, PER AD-ACCOUNT TYPE
-- =====================================================================
-- Advertisers transfer to a different bank depending on which ad-account
-- type they're funding. Each ad-account type can have its own set of
-- beneficiary bank accounts, keyed by currency (EUR / USD / HKD). Some
-- types map to one bank; others to several. HKD is a bank-destination
-- currency only — wallets/topups stay EUR/USD (the admin credits the
-- EUR/USD wallet from the slip).
--
-- This replaces the hardcoded bank details in
-- components/wallet/bank-transfer-instructions.tsx: admins now manage the
-- destinations in super-admin Settings (no deploy), and adding a new
-- ad-account type lets them add its bank details which the advertiser
-- then sees. Changing a bank requires a double-confirm in the UI
-- (anti-fraud) — writes still go through the server action, never the
-- client.
--
-- Config only: the advertiser wallet-topup flow is NOT changed by this
-- migration. Resolving the shown bank by (type × currency) is a separate,
-- tested step.
-- =====================================================================

set search_path = public;

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ad_account_type_id uuid not null
    references public.ad_account_types(id) on delete cascade,
  currency text not null check (currency in ('EUR', 'USD', 'HKD')),
  label text not null,
  beneficiary text,       -- account holder / beneficiary name
  account_no text,        -- account number or IBAN
  swift_bic text,
  bank_name text,
  bank_address text,
  routing_no text,        -- ABA / ACH / wire routing (US), optional
  notes text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One destination per (type, currency). Multiple currencies per type
  -- give a type up to 3 rows (EUR/USD/HKD).
  constraint bank_accounts_uq unique (tenant_id, ad_account_type_id, currency)
);

create index if not exists bank_accounts_tenant_idx
  on public.bank_accounts(tenant_id);
create index if not exists bank_accounts_type_idx
  on public.bank_accounts(ad_account_type_id, currency, is_active);

-- RLS: any tenant member may READ (advertisers need to see their transfer
-- destination); only admins may WRITE (and the server action further
-- restricts writes to the tenant owner + double-confirm).
alter table public.bank_accounts enable row level security;

drop policy if exists bank_accounts_read on public.bank_accounts;
create policy bank_accounts_read on public.bank_accounts
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = bank_accounts.tenant_id
    )
  );

drop policy if exists bank_accounts_admin_write on public.bank_accounts;
create policy bank_accounts_admin_write on public.bank_accounts
  for all to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = bank_accounts.tenant_id
        and up.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = bank_accounts.tenant_id
        and up.role = 'admin'
    )
  );

-- New financial-adjacent table → audit + touch triggers (CLAUDE.md
-- non-negotiable). Attached inline (the array-based trigger migrations
-- already ran before this table existed), same as ad_account_types did.
drop trigger if exists trg_touch_bank_accounts on public.bank_accounts;
create trigger trg_touch_bank_accounts
  before update on public.bank_accounts
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_bank_accounts on public.bank_accounts;
create trigger trg_audit_bank_accounts
  after insert or update or delete on public.bank_accounts
  for each row execute function public._audit_row_change();

-- No seed: the real destinations differ per type and are entered by an
-- admin in Settings → Banks. The previous hardcoded TURLIT / MUXUE details
-- live in components/wallet/bank-transfer-instructions.tsx for reference.
