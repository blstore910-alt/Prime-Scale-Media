-- =====================================================================
-- Add the missing updated_at column (+ touch trigger) to the business
-- tables that were hand-authored without it.
-- =====================================================================
-- Verified live: subscriptions, ad_account_requests, invoices, companies,
-- referral_links and referral_commissions have NO updated_at column, yet
-- lots of code writes it (and 20260829140000_updated_at_triggers.sql
-- only attaches the touch-trigger to tables that ALREADY have the column,
-- so it skipped these). Every such UPDATE 400'd with
-- "column updated_at does not exist", silently breaking:
--   * activate / pause / disable a subscription
--   * change a subscription's amount + the billing run + the paid-invoice
--     advance trigger
--   * (and any request / company / referral update that bumps it)
--
-- Adding the column (default now() backfills existing rows) + the
-- standard _touch_updated_at trigger fixes all of them at once and
-- restores optimistic-concurrency. Idempotent.
-- =====================================================================

set search_path = public;

alter table public.subscriptions        add column if not exists updated_at timestamptz not null default now();
alter table public.ad_account_requests  add column if not exists updated_at timestamptz not null default now();
alter table public.invoices             add column if not exists updated_at timestamptz not null default now();
alter table public.companies            add column if not exists updated_at timestamptz not null default now();
alter table public.referral_links       add column if not exists updated_at timestamptz not null default now();
alter table public.referral_commissions add column if not exists updated_at timestamptz not null default now();

-- Attach the touch-trigger to every business table that now has the
-- column (same idempotent pattern as 20260829140000).
do $$
declare
  t text;
  audited constant text[] := array[
    'subscriptions',
    'ad_account_requests',
    'invoices',
    'companies',
    'referral_links',
    'referral_commissions'
  ];
begin
  foreach t in array audited loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'updated_at'
    ) then
      execute format(
        'drop trigger if exists trg_touch_%1$I on public.%1$I;
         create trigger trg_touch_%1$I
           before update on public.%1$I
           for each row execute function public._touch_updated_at();',
        t
      );
    end if;
  end loop;
end;
$$;
