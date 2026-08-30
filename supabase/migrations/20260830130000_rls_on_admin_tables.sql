-- =====================================================================
-- RLS policies for admin-only tables
-- =====================================================================
-- Runs AFTER the "Run and enable RLS" auto-migration adds default
-- deny-all policies to rate_limit_buckets + audit_events_monthly_stats.
-- Without a SELECT policy the super-admin dashboard panels see 0 rows.
--
-- Policy shape: super-admin (tenants.owner_id = auth.uid()) can read;
-- everyone else refused. Writes remain locked — those go through
-- SECURITY DEFINER RPCs and the retention cron.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- rate_limit_buckets — super-admin read for the dashboard panel
-- ---------------------------------------------------------------------
alter table public.rate_limit_buckets enable row level security;

drop policy if exists rate_limit_buckets_super_admin_read on public.rate_limit_buckets;
create policy rate_limit_buckets_super_admin_read
  on public.rate_limit_buckets for select
  using (
    exists (
      select 1
        from public.user_profiles up
        join public.tenants t on t.id = up.tenant_id
       where up.user_id = auth.uid()
         and up.role = 'admin'
         and t.owner_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policy — writes only via
-- rate_limit_check() (SECURITY DEFINER) and rate_limit_prune()
-- (SECURITY DEFINER, cron-triggered).

-- ---------------------------------------------------------------------
-- audit_events_monthly_stats — super-admin read for reporting
-- ---------------------------------------------------------------------
alter table public.audit_events_monthly_stats enable row level security;

drop policy if exists audit_events_monthly_stats_super_admin_read on public.audit_events_monthly_stats;
create policy audit_events_monthly_stats_super_admin_read
  on public.audit_events_monthly_stats for select
  using (
    exists (
      select 1
        from public.user_profiles up
        join public.tenants t on t.id = up.tenant_id
       where up.user_id = auth.uid()
         and up.role = 'admin'
         and t.owner_id = auth.uid()
    )
  );

-- No write policy — audit_events_capture_monthly_stats() writes via
-- SECURITY DEFINER.
