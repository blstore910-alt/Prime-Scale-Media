-- =====================================================================
-- Scheduled maintenance jobs (rate-limit prune + audit retention)
-- =====================================================================
-- Uses pg_cron, which Supabase enables on Pro plans and up.
-- Both jobs are idempotent — safe to re-run, safe to disable.
--
-- Schedules:
--   rate-limit-prune : daily 03:15 UTC (housekeeping, small table)
--   audit-monthly-report : 1st of month 04:00 UTC (row count sanity)
--
-- See docs/BACKUP_AND_RECOVERY.md for the archive workflow that
-- cold-stores audit_events rows older than the retention window.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ensure pg_cron is enabled. On Supabase you also need to grant the
-- postgres role usage; the Dashboard SQL editor does this transparently.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;

-- ---------------------------------------------------------------------
-- Job 1 : rate_limit_prune
-- ---------------------------------------------------------------------
-- Removes buckets whose window ended > 24h ago. Table stays under a
-- few hundred rows in a healthy system.
do $$
begin
  -- Unschedule any older definition so this migration is re-runnable.
  perform cron.unschedule('psm-rate-limit-prune')
   where exists (select 1 from cron.job where jobname = 'psm-rate-limit-prune');

  perform cron.schedule(
    'psm-rate-limit-prune',
    '15 3 * * *',
    $cmd$ select public.rate_limit_prune(86400); $cmd$
  );
exception
  when undefined_function then
    -- pg_cron not enabled: skip silently, migration should still succeed.
    raise notice 'pg_cron not enabled; skipping rate_limit_prune schedule';
end;
$$;

-- ---------------------------------------------------------------------
-- Job 2 : monthly audit_events sanity check
-- ---------------------------------------------------------------------
-- Records a small metric row so a "did audit_events actually grow this
-- month?" query is trivial. If this stays flat, the trigger fell off.
create table if not exists public.audit_events_monthly_stats (
  month         date primary key,
  row_count     bigint not null,
  captured_at   timestamptz not null default now()
);

create or replace function public.audit_events_capture_monthly_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_count bigint;
begin
  select count(*) into v_count from public.audit_events
   where occurred_at >= v_month
     and occurred_at <  v_month + interval '1 month';

  insert into public.audit_events_monthly_stats (month, row_count)
       values (v_month, v_count)
  on conflict (month) do update set
    row_count   = excluded.row_count,
    captured_at = now();
end;
$$;

revoke all on function public.audit_events_capture_monthly_stats() from public;

do $$
begin
  perform cron.unschedule('psm-audit-monthly-stats')
   where exists (select 1 from cron.job where jobname = 'psm-audit-monthly-stats');

  perform cron.schedule(
    'psm-audit-monthly-stats',
    '0 4 1 * *',
    $cmd$ select public.audit_events_capture_monthly_stats(); $cmd$
  );
exception
  when undefined_function then
    raise notice 'pg_cron not enabled; skipping audit-monthly-stats schedule';
end;
$$;

-- ---------------------------------------------------------------------
-- Job 3 : audit_events archive candidate marker
-- ---------------------------------------------------------------------
-- Rows older than the retention window are eligible to be copied to
-- cold storage and then deleted. This function does NOT delete —
-- deletion needs a human-triggered playbook (BACKUP_AND_RECOVERY.md)
-- with an off-site archive proven first.
create or replace function public.audit_events_archive_candidates(
  p_older_than_days integer default 2555 -- ~7 years
)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
    from public.audit_events
   where occurred_at < now() - make_interval(days => p_older_than_days);
$$;

revoke all on function public.audit_events_archive_candidates(integer) from public;
