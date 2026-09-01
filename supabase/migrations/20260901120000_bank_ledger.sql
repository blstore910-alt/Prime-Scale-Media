-- =====================================================================
-- bank_ledger_entries — manual record of money ACTUALLY received/spent
-- at each destination, for reconciliation against wallet credits.
-- =====================================================================
-- Staff record the real deposits/withdrawals seen on the bank/supplier
-- statements. The reconciliation view then compares the total credited
-- to customer wallets (completed topups) against the total actually
-- recorded here — a gap (credited > received) surfaces errors AND admin
-- fraud (a fake topup has no matching real deposit).
--
-- destination maps to the two topup groups:
--   our_bank  = the API / Meta-EU-PSM group (our own bank, e.g. TURLIT)
--   supplier  = everything else (the supplier bank, e.g. Guangzhou)
--
-- Manual now; the our_bank side can be API-synced later (Supplier 1).
-- Policies are self-contained (inline admin check) — the live DB's RLS
-- was hand-authored and _is_admin_of() does not exist there.
-- =====================================================================

set search_path = public;

create table if not exists public.bank_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  destination text not null check (destination in ('our_bank', 'supplier')),
  currency text not null check (currency in ('USD', 'EUR')),
  direction text not null check (direction in ('deposit', 'withdrawal')),
  amount numeric(14, 2) not null check (amount >= 0),
  occurred_on date not null default current_date,
  note text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_ledger_tenant_idx
  on public.bank_ledger_entries(tenant_id, occurred_on desc);
create index if not exists bank_ledger_dest_idx
  on public.bank_ledger_entries(tenant_id, destination, currency);

alter table public.bank_ledger_entries enable row level security;

drop policy if exists bank_ledger_admin_all on public.bank_ledger_entries;
create policy bank_ledger_admin_all on public.bank_ledger_entries
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = bank_ledger_entries.tenant_id
        and up.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = bank_ledger_entries.tenant_id
        and up.role = 'admin'
    )
  );

-- New financial table → audit + touch triggers (CLAUDE.md non-negotiable).
drop trigger if exists trg_touch_bank_ledger_entries on public.bank_ledger_entries;
create trigger trg_touch_bank_ledger_entries
  before update on public.bank_ledger_entries
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_bank_ledger_entries on public.bank_ledger_entries;
create trigger trg_audit_bank_ledger_entries
  after insert or update or delete on public.bank_ledger_entries
  for each row execute function public._audit_row_change();
