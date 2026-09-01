-- integration_jobs
--
-- Durable async queue for calls into external systems (Supplier 1, Wise,
-- future integrations). Two failure modes have to be safe:
--
--   1. The remote system is slow / down — retries with exponential
--      backoff, without holding a user's HTTP request open.
--   2. Our worker crashes mid-call — the job row is the ONLY receipt
--      that the intent exists. When the worker restarts it re-reads
--      pending/processing rows and picks them up.
--
-- Every job row carries an idempotency_key so a retried push doesn't
-- create a duplicate topup / withdraw on the remote side.
--
-- Jobs are inserted by server actions (see wallet-topup + ad-account
-- flows). Processing lives in a cron/worker that we'll add next —
-- for now the table exists so those actions can start enqueueing.

create table if not exists public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,      -- 'supplier1' | 'wise' | …
  operation text not null,     -- 'push_topup' | 'push_withdraw' | 'sync_ad_accounts' | 'match_incoming' | …
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),

  -- Everything the operation needs to run and dedup. JSONB (not
  -- JSON) so we can index on payload->>'ad_account_id' later.
  payload jsonb not null default '{}'::jsonb,

  -- Caller-supplied, unique per (provider, operation). Refuses a
  -- duplicate enqueue if the same intent already has a live row.
  idempotency_key text not null,

  -- Retry bookkeeping.
  attempts int not null default 0,
  max_attempts int not null default 5,
  next_run_at timestamptz not null default now(),
  last_error text,

  -- Result of the last successful run (external_id, balance snapshot,
  -- whatever the operation returned).
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

-- Writes are server-side only via SECURITY DEFINER helpers, so no
-- INSERT/UPDATE/DELETE policy for authenticated users.

drop trigger if exists trg_touch_integration_jobs on public.integration_jobs;
create trigger trg_touch_integration_jobs
  before update on public.integration_jobs
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_integration_jobs on public.integration_jobs;
create trigger trg_audit_integration_jobs
  after insert or update or delete on public.integration_jobs
  for each row execute function public._audit_row_change();
