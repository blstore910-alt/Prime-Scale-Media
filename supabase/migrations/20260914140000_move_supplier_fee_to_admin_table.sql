-- =====================================================================
-- Move the supplier fee OFF the customer-visible ad_accounts row
-- =====================================================================
-- 20260914120000 (mine, earlier today) put supplier_fee_pct on
-- public.ad_accounts. That was wrong: an advertiser can read their own
-- ad_accounts rows through RLS, and the advertiser SPA reads them with
-- `select("*")` — so our cost per account was being shipped to the
-- customer's browser in the JSON. It never rendered, but it was there,
-- which is the same leak class as the pool's `raw` blob.
--
-- Fixing that by rewriting every select to an explicit column list makes
-- the guarantee depend on every future query being written carefully.
-- It isn't a boundary. So the figure moves to its own admin-only table:
-- `select * from ad_accounts` then CANNOT return it, no matter who writes
-- the next query.
--
-- Read:  any admin of the tenant (the super-admin is a tenant-owning
--        admin, so role='admin' covers both).
-- Write: server-side only, gated to the tenant owner in
--        actions/ad-account-actions.ts — the fee defines our margin.
--
-- Also note what this column is NOT: it is the supplier's TOP-UP fee
-- (2% of the funded amount, taken when we fund the account). DST /
-- location fee is a different cost entirely — charged against our reserve
-- as the advertiser SPENDS, at a rate that varies by country. DST cannot
-- be expressed as one percentage per account and is deliberately absent.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY (git push ships only the frontend).
-- Safe to re-run. Carries over anything already entered.
-- =====================================================================

set search_path = public;

create table if not exists public.ad_account_costs (
  ad_account_id     uuid primary key,
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  -- Supplier's TOP-UP fee percentage. NULL = not recorded, which is NOT
  -- the same as 0 ("they charge us nothing") — margin stays unreported
  -- rather than assumed.
  supplier_fee_pct  numeric,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint ad_account_costs_fee_range
    check (supplier_fee_pct is null
           or (supplier_fee_pct >= 0 and supplier_fee_pct <= 100))
);

create index if not exists ad_account_costs_tenant_idx
  on public.ad_account_costs (tenant_id);

alter table public.ad_account_costs enable row level security;

-- Read: admins of the tenant only. No advertiser or affiliate policy
-- exists, so RLS denies them by default — that is the whole point.
drop policy if exists ad_account_costs_admin_read on public.ad_account_costs;
create policy ad_account_costs_admin_read on public.ad_account_costs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = ad_account_costs.tenant_id
         and up.role = 'admin'
    )
  );

-- Writes go through the server action, which additionally requires the
-- tenant owner. This policy keeps a stray client write from succeeding
-- even for an admin.
drop policy if exists ad_account_costs_admin_write on public.ad_account_costs;
create policy ad_account_costs_admin_write on public.ad_account_costs
  for all
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
       where t.id = ad_account_costs.tenant_id
         and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tenants t
       where t.id = ad_account_costs.tenant_id
         and t.owner_id = auth.uid()
    )
  );

drop trigger if exists trg_touch_ad_account_costs on public.ad_account_costs;
create trigger trg_touch_ad_account_costs
  before update on public.ad_account_costs
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_ad_account_costs on public.ad_account_costs;
create trigger trg_audit_ad_account_costs
  after insert or update or delete on public.ad_account_costs
  for each row execute function public._audit_row_change();

-- ---------------------------------------------------------------------
-- Carry over whatever was already entered, then remove the leaky column.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'ad_accounts'
       and column_name = 'supplier_fee_pct'
  ) then
    insert into public.ad_account_costs (ad_account_id, tenant_id, supplier_fee_pct)
    select a.id, a.tenant_id, a.supplier_fee_pct
      from public.ad_accounts a
     where a.supplier_fee_pct is not null
    on conflict (ad_account_id) do update
      set supplier_fee_pct = excluded.supplier_fee_pct;

    alter table public.ad_accounts drop column supplier_fee_pct;
  end if;
end $$;

-- Result (so the editor shows something rather than "no rows"):
select
  (select count(*) from public.ad_accounts)                                as ad_accounts_total,
  (select count(*) from public.ad_account_costs
    where supplier_fee_pct is not null)                                    as costs_recorded,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'ad_accounts'
      and column_name = 'supplier_fee_pct')                                as leaky_column_must_be_0;
