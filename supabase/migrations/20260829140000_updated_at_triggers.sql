-- =====================================================================
-- Auto-touch updated_at on every UPDATE
-- =====================================================================
-- The optimistic-concurrency guards in actions/_shared.ts compare
-- the caller-supplied updated_at against the server's copy. That only
-- works if EVERY update bumps the timestamp — one row that misses the
-- bump becomes a false-positive "no conflict" and lets stale writes
-- through.
--
-- Rather than trusting every SQL author to remember, install a
-- BEFORE UPDATE trigger on every business-sensitive table.
-- Idempotent: safe to re-run.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- Trigger function
-- ---------------------------------------------------------------------
create or replace function public._touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Only touch when the row actually changed. Prevents write-write
  -- ping-pongs and keeps a spurious "no-op update" from producing a
  -- new version.
  if new is distinct from old then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Attach to every table that has an updated_at column.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  audited constant text[] := array[
    'wallets',
    'wallet_topups',
    'top_ups',
    'invoices',
    'companies',
    'billings',
    'subscriptions',
    'exchange_rates',
    'referral_commissions',
    'referral_links',
    'ad_accounts',
    'ad_account_requests',
    'advertisers',
    'affiliates',
    'user_profiles',
    'tenants',
    'invitations',
    'fee_defaults'
  ];
begin
  foreach t in array audited loop
    if exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t
    )
    and exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = t
         and column_name = 'updated_at'
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
