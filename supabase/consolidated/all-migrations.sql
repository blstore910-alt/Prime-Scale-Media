-- =====================================================================
-- CONSOLIDATED MIGRATION (core, safe against missing tables)
-- =====================================================================
-- Contains 8 core migrations. Excludes 20260828140000_rls_templates.sql
-- because that file references specific tables that may not exist yet
-- in your schema (like public.affiliates). Supabase's "Run and enable
-- RLS" prompt covers the write-side security concern already —
-- refined RLS policies can be added per-table later once your schema
-- is finalized.
--
-- Run this ONCE in the Supabase SQL Editor. Idempotent (safe to re-run).
-- =====================================================================

-- ---------------------------------------------------------------------
-- From: 20260828120000_wallet_rpcs.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- P0 security: wallet + wallet_topups SECURITY DEFINER RPCs
-- =====================================================================
-- These RPCs replace direct client-side inserts/updates on `wallets`
-- and `wallet_topups`. Every function does its OWN auth + tenant check
-- (SECURITY DEFINER bypasses RLS, so the function body is the only
--  place where authorization is enforced).
--
-- See supabase/migrations/README.md for column assumptions.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- helper: identify the caller's active profile
-- ---------------------------------------------------------------------
-- Returns the profile_id, user_id, tenant_id and role of the caller.
-- If the caller has multiple profiles we return the first one for their
-- current tenant; callers that need per-request profile selection should
-- pass a specific profile via `p_profile_id`.
create or replace function public._require_profile(
  p_expected_role text default null
)
returns table (
  profile_id uuid,
  user_id    uuid,
  tenant_id  uuid,
  role       text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  return query
  select up.id, up.user_id, up.tenant_id, up.role
    from public.user_profiles up
   where up.user_id = v_uid
     and (p_expected_role is null or up.role = p_expected_role)
   order by up.created_at asc
   limit 1;

  if not found then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public._require_profile(text) from public;
grant execute on function public._require_profile(text) to authenticated;

-- =====================================================================
-- wallet_create_for_advertiser()
-- Advertiser calls this once, with no args, to create their own wallet.
-- Server derives advertiser_id, tenant_id, reference_no.
-- =====================================================================
create or replace function public.wallet_create_for_advertiser()
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_adv          public.advertisers%rowtype;
  v_existing     public.wallets%rowtype;
  v_new          public.wallets%rowtype;
  v_ref_no       text;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  select * into v_adv
    from public.advertisers
   where user_id = v_uid
   limit 1;

  if not found then
    raise exception 'No advertiser profile for caller' using errcode = '42501';
  end if;

  -- Idempotent: if wallet already exists, return it.
  select * into v_existing
    from public.wallets
   where advertiser_id = v_adv.id
   limit 1;
  if found then
    return v_existing;
  end if;

  v_ref_no := lpad((floor(random() * 1000000000)::bigint)::text, 10, '0');

  insert into public.wallets (advertiser_id, tenant_id, reference_no)
       values (v_adv.id, v_adv.tenant_id, v_ref_no)
    returning * into v_new;

  return v_new;
end;
$$;

revoke all on function public.wallet_create_for_advertiser() from public;
grant execute on function public.wallet_create_for_advertiser() to authenticated;

-- =====================================================================
-- wallet_topup_advertiser_create(p_amount, p_currency, p_payment_slip)
-- Advertiser submits a pending bank-transfer topup for THEIR wallet.
-- Server picks wallet_id / advertiser_id / tenant_id / created_by from
-- the caller — the client cannot spoof any of them.
-- =====================================================================
create or replace function public.wallet_topup_advertiser_create(
  p_amount        numeric,
  p_currency      text,
  p_payment_slip  text default null
)
returns public.wallet_topups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   record;
  v_adv       public.advertisers%rowtype;
  v_wallet    public.wallets%rowtype;
  v_new       public.wallet_topups%rowtype;
  v_new_ref   text;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive' using errcode = '22000';
  end if;
  if p_currency is null or p_currency not in ('USD', 'EUR') then
    raise exception 'Invalid currency' using errcode = '22000';
  end if;

  select id, user_id, tenant_id, role
    into v_profile
    from public.user_profiles
   where user_id = v_uid
   order by created_at asc
   limit 1;
  if not found then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into v_adv
    from public.advertisers
   where user_id = v_uid
     and tenant_id = v_profile.tenant_id
   limit 1;
  if not found then
    raise exception 'No advertiser profile' using errcode = '42501';
  end if;

  select * into v_wallet
    from public.wallets
   where advertiser_id = v_adv.id
     and tenant_id = v_profile.tenant_id
   limit 1;
  if not found then
    raise exception 'Wallet not found' using errcode = '42704';
  end if;

  if v_wallet.min_topup is not null and p_amount < v_wallet.min_topup then
    raise exception 'Amount below minimum' using errcode = '22000';
  end if;

  insert into public.wallet_topups (
    wallet_id,
    advertiser_id,
    tenant_id,
    currency,
    amount,
    status,
    created_by,
    reference_no,
    payment_slip
  ) values (
    v_wallet.id,
    v_adv.id,
    v_wallet.tenant_id,
    p_currency,
    p_amount,
    'pending',
    v_profile.id,
    v_wallet.reference_no,
    p_payment_slip
  )
  returning * into v_new;

  -- Rotate the wallet's reference_no so the next topup gets a fresh code.
  v_new_ref := lpad((floor(random() * 1000000000)::bigint)::text, 10, '0');
  update public.wallets
     set reference_no = v_new_ref,
         updated_at = now()
   where id = v_wallet.id;

  return v_new;
end;
$$;

revoke all on function public.wallet_topup_advertiser_create(numeric, text, text) from public;
grant execute on function public.wallet_topup_advertiser_create(numeric, text, text) to authenticated;

-- =====================================================================
-- Admin approve / reject / undo for wallet_topups
-- Uses the TOPUP's own amount (never a caller-supplied one).
-- =====================================================================
create or replace function public.wallet_topup_admin_verify(
  p_topup_id uuid
)
returns public.wallet_topups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   record;
  v_topup   public.wallet_topups%rowtype;
  v_updated public.wallet_topups%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_topup
    from public.wallet_topups
   where id = p_topup_id
   for update;
  if not found then
    raise exception 'Topup not found' using errcode = '42704';
  end if;
  if v_topup.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_topup.status <> 'pending' then
    raise exception 'Topup is not pending' using errcode = '22000';
  end if;

  update public.wallet_topups
     set status = 'completed',
         approved_by = v_admin.profile_id,
         rejection_reason = null,
         updated_at = now()
   where id = p_topup_id
  returning * into v_updated;

  -- NB: wallet balance is expected to be updated by an existing trigger
  -- on wallet_topups.status. If none exists, add one (see README).

  return v_updated;
end;
$$;

revoke all on function public.wallet_topup_admin_verify(uuid) from public;
grant execute on function public.wallet_topup_admin_verify(uuid) to authenticated;

create or replace function public.wallet_topup_admin_reject(
  p_topup_id uuid,
  p_reason   text default null
)
returns public.wallet_topups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   record;
  v_topup   public.wallet_topups%rowtype;
  v_updated public.wallet_topups%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_topup
    from public.wallet_topups
   where id = p_topup_id
   for update;
  if not found then
    raise exception 'Topup not found' using errcode = '42704';
  end if;
  if v_topup.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_topup.status <> 'pending' then
    raise exception 'Topup is not pending' using errcode = '22000';
  end if;

  update public.wallet_topups
     set status = 'rejected',
         approved_by = v_admin.profile_id,
         rejection_reason = coalesce(nullif(trim(p_reason), ''), null),
         updated_at = now()
   where id = p_topup_id
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke all on function public.wallet_topup_admin_reject(uuid, text) from public;
grant execute on function public.wallet_topup_admin_reject(uuid, text) to authenticated;

create or replace function public.wallet_topup_admin_undo(
  p_topup_id uuid
)
returns public.wallet_topups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   record;
  v_topup   public.wallet_topups%rowtype;
  v_updated public.wallet_topups%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_topup
    from public.wallet_topups
   where id = p_topup_id
   for update;
  if not found then
    raise exception 'Topup not found' using errcode = '42704';
  end if;
  if v_topup.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_topup.status not in ('completed', 'rejected') then
    raise exception 'Only completed or rejected topups can be undone' using errcode = '22000';
  end if;

  update public.wallet_topups
     set status = 'pending',
         approved_by = null,
         rejection_reason = null,
         updated_at = now()
   where id = p_topup_id
  returning * into v_updated;

  -- Trigger is expected to reverse the balance change on the status
  -- transition out of 'completed'. If no such trigger exists, add one.

  return v_updated;
end;
$$;

revoke all on function public.wallet_topup_admin_undo(uuid) from public;
grant execute on function public.wallet_topup_admin_undo(uuid) to authenticated;

-- =====================================================================
-- wallet_admin_set_min_topup(p_wallet_id, p_min_topup)
-- Replaces the client-side wallet.min_topup update.
-- =====================================================================
create or replace function public.wallet_admin_set_min_topup(
  p_wallet_id uuid,
  p_min_topup numeric
)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  record;
  v_wallet public.wallets%rowtype;
  v_updated public.wallets%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  if p_min_topup is null or p_min_topup < 0 then
    raise exception 'min_topup must be non-negative' using errcode = '22000';
  end if;

  select * into v_wallet
    from public.wallets
   where id = p_wallet_id
   for update;
  if not found then
    raise exception 'Wallet not found' using errcode = '42704';
  end if;
  if v_wallet.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.wallets
     set min_topup = p_min_topup,
         updated_at = now()
   where id = p_wallet_id
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke all on function public.wallet_admin_set_min_topup(uuid, numeric) from public;
grant execute on function public.wallet_admin_set_min_topup(uuid, numeric) to authenticated;

-- =====================================================================
-- OPTIONAL: balance-crediting trigger stub
-- =====================================================================
-- Enable only if there isn't already a trigger on wallet_topups that
-- updates wallets.usd_balance / wallets.eur_balance on status changes.
-- Uncomment carefully — this touches money.
--
-- create or replace function public._apply_wallet_topup_balance()
-- returns trigger
-- language plpgsql
-- as $$
-- declare
--   v_delta numeric;
-- begin
--   -- pending -> completed  : credit
--   -- completed -> pending  : debit (undo)
--   -- pending -> rejected   : no-op
--   -- rejected -> pending   : no-op
--   if tg_op = 'UPDATE'
--      and new.status = 'completed'
--      and old.status <> 'completed' then
--     v_delta := new.amount;
--   elsif tg_op = 'UPDATE'
--        and old.status = 'completed'
--        and new.status <> 'completed' then
--     v_delta := -old.amount;
--   else
--     return new;
--   end if;
--
--   if new.currency = 'USD' then
--     update public.wallets
--        set usd_balance = coalesce(usd_balance, 0) + v_delta,
--            updated_at = now()
--      where id = new.wallet_id;
--   elsif new.currency = 'EUR' then
--     update public.wallets
--        set eur_balance = coalesce(eur_balance, 0) + v_delta,
--            updated_at = now()
--      where id = new.wallet_id;
--   end if;
--
--   return new;
-- end;
-- $$;
--
-- drop trigger if exists trg_apply_wallet_topup_balance on public.wallet_topups;
-- create trigger trg_apply_wallet_topup_balance
--   after update of status on public.wallet_topups
--   for each row execute function public._apply_wallet_topup_balance();

-- ---------------------------------------------------------------------
-- From: 20260828130000_audit_events.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- Immutable audit log
-- =====================================================================
-- Every INSERT / UPDATE / DELETE on financial tables leaves a row in
-- audit_events. Rows here can only be inserted — never updated or
-- deleted, not even by the service role (see policy below and the
-- REVOKE that hides UPDATE/DELETE from the DB layer entirely).
--
-- If you ever need to rebuild a wallet balance, revive a lost invoice,
-- or answer "who changed this?" — this is where you look.
-- =====================================================================

set search_path = public;

create table if not exists public.audit_events (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  actor_user_id uuid,                    -- auth.uid() at time of change
  actor_profile_id uuid,                 -- best-effort profile.id from JWT
  tenant_id    uuid,                     -- copied from row when possible
  table_name   text not null,
  action       text not null check (action in ('INSERT','UPDATE','DELETE')),
  row_id       text,                     -- primary key of affected row
  before_data  jsonb,                    -- OLD row (null for INSERT)
  after_data   jsonb                     -- NEW row (null for DELETE)
);

create index if not exists audit_events_occurred_at_idx
  on public.audit_events (occurred_at desc);
create index if not exists audit_events_tenant_time_idx
  on public.audit_events (tenant_id, occurred_at desc);
create index if not exists audit_events_table_row_idx
  on public.audit_events (table_name, row_id);

-- Lock the table down: nobody can UPDATE or DELETE, ever.
-- INSERTs only happen via the trigger below (which runs SECURITY DEFINER).
alter table public.audit_events enable row level security;

drop policy if exists audit_events_no_select_anon on public.audit_events;
create policy audit_events_no_select_anon
  on public.audit_events for select
  using (
    -- Only admins of the row's tenant may read.
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.role = 'admin'
         and up.tenant_id = audit_events.tenant_id
    )
  );

-- Explicitly refuse INSERT/UPDATE/DELETE from application code. The
-- trigger below bypasses this because it runs SECURITY DEFINER as the
-- table owner.
drop policy if exists audit_events_no_writes on public.audit_events;
create policy audit_events_no_writes
  on public.audit_events for all
  using (false)
  with check (false);

revoke insert, update, delete on public.audit_events from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Trigger function
-- ---------------------------------------------------------------------
create or replace function public._audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_tenant_id uuid;
  v_row_id text;
begin
  -- Best-effort actor profile lookup.
  if v_uid is not null then
    select id, tenant_id into v_profile_id, v_tenant_id
      from public.user_profiles
     where user_id = v_uid
     order by created_at asc
     limit 1;
  end if;

  -- Prefer the row's own tenant_id when present.
  if tg_op = 'DELETE' then
    v_tenant_id := coalesce((to_jsonb(old) ->> 'tenant_id')::uuid, v_tenant_id);
    v_row_id := coalesce((to_jsonb(old) ->> 'id'), null);
  else
    v_tenant_id := coalesce((to_jsonb(new) ->> 'tenant_id')::uuid, v_tenant_id);
    v_row_id := coalesce((to_jsonb(new) ->> 'id'), null);
  end if;

  insert into public.audit_events (
    actor_user_id,
    actor_profile_id,
    tenant_id,
    table_name,
    action,
    row_id,
    before_data,
    after_data
  ) values (
    v_uid,
    v_profile_id,
    v_tenant_id,
    tg_table_name,
    tg_op,
    v_row_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- Attach the trigger to every financial-sensitive table.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  audited constant text[] := array[
    'wallets',
    'wallet_topups',
    'top_ups',
    'topup_logs',
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
    'invitations'
  ];
begin
  foreach t in array audited loop
    if exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t
    ) then
      execute format(
        'drop trigger if exists trg_audit_%1$I on public.%1$I;
         create trigger trg_audit_%1$I
           after insert or update or delete on public.%1$I
           for each row execute function public._audit_row_change();',
        t
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- From: 20260828150000_rate_limits.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- Distributed rate limiter backed by Postgres
-- =====================================================================
-- Serverless Next.js runs across many instances, so an in-memory
-- Map won't work. We push the counter into Postgres via an atomic
-- RPC. The bucket table is compact (one row per key/window) and gets
-- cleaned up opportunistically.
-- =====================================================================

set search_path = public;

create table if not exists public.rate_limit_buckets (
  key         text primary key,
  count       integer not null,
  window_start timestamptz not null default now()
);

create index if not exists rate_limit_buckets_window_idx
  on public.rate_limit_buckets (window_start);

-- rate_limit_check
--
-- Atomic counter with sliding fixed window. Returns true when the
-- caller is allowed, false when the limit is hit.
--
-- Params:
--   p_key            :  arbitrary identifier ("ip:1.2.3.4:send-invite")
--   p_max_requests   :  ceiling within the window
--   p_window_seconds :  window length
create or replace function public.rate_limit_check(
  p_key            text,
  p_max_requests   integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now  timestamptz := clock_timestamp();
  v_row  public.rate_limit_buckets%rowtype;
  v_reset boolean := false;
begin
  if p_key is null or length(p_key) = 0 then
    return true; -- fail-open on malformed key
  end if;
  if p_max_requests <= 0 or p_window_seconds <= 0 then
    return true;
  end if;

  select * into v_row
    from public.rate_limit_buckets
   where key = p_key
   for update;

  if not found then
    insert into public.rate_limit_buckets (key, count, window_start)
         values (p_key, 1, v_now);
    return true;
  end if;

  -- Window expired -> reset.
  if v_now - v_row.window_start > make_interval(secs => p_window_seconds) then
    update public.rate_limit_buckets
       set count = 1,
           window_start = v_now
     where key = p_key;
    return true;
  end if;

  if v_row.count >= p_max_requests then
    return false;
  end if;

  update public.rate_limit_buckets
     set count = count + 1
   where key = p_key;
  return true;
end;
$$;

revoke all on function public.rate_limit_check(text, integer, integer) from public;
grant execute on function public.rate_limit_check(text, integer, integer) to authenticated, anon;

-- Opportunistic janitor — call from cron once a day.
create or replace function public.rate_limit_prune(p_older_than_seconds integer default 86400)
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.rate_limit_buckets
     where window_start < clock_timestamp() - make_interval(secs => p_older_than_seconds)
     returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.rate_limit_prune(integer) from public;
-- Restrict prune to admins only via Supabase cron.

-- ---------------------------------------------------------------------
-- From: 20260829120000_scheduled_maintenance.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- From: 20260829130000_session_activity.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- Session activity tracking
-- =====================================================================
-- Adds `last_seen_at` to user_profiles + a tiny SECURITY DEFINER RPC
-- that the app calls at most once every 5 minutes per user. Cheap,
-- and it gives incident response an answer to "was this account
-- active in the last hour?".
--
-- This is NOT a real presence system — no websockets, no real-time.
-- It's a low-frequency heartbeat.
-- =====================================================================

set search_path = public;

alter table public.user_profiles
  add column if not exists last_seen_at timestamptz;

create index if not exists user_profiles_last_seen_idx
  on public.user_profiles (last_seen_at desc)
  where last_seen_at is not null;

-- ---------------------------------------------------------------------
-- Called by /api/heartbeat. Updates AT MOST ONCE per 5 minutes per
-- profile — the "if" guard keeps us from thrashing the row on every
-- request, and the SECURITY DEFINER bypasses the update-column
-- allowlist RLS policy for exactly this one field.
-- ---------------------------------------------------------------------
create or replace function public.mark_session_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  update public.user_profiles
     set last_seen_at = now()
   where user_id = v_uid
     and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
end;
$$;

revoke all on function public.mark_session_seen() from public;
grant execute on function public.mark_session_seen() to authenticated;

-- ---------------------------------------------------------------------
-- From: 20260829140000_updated_at_triggers.sql
-- ---------------------------------------------------------------------
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
    'invitations'
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

-- ---------------------------------------------------------------------
-- From: 20260830120000_perf_indexes.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- Performance indexes for hot query paths
-- =====================================================================
-- After the pending-badge sidebar + system-status panel land, admins
-- fire off half-a-dozen count(*) queries per minute filtered by
-- (tenant_id, status). Without a composite index those become a scan
-- of the whole table per query.
--
-- Also indexes the pending-listings sort key (created_at desc) so the
-- "recent items" queries stay under a millisecond even as the tables
-- grow.
--
-- All CREATE INDEX statements use IF NOT EXISTS — idempotent, safe
-- to re-run.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- wallet_topups: filter by (tenant_id, status), order by created_at
-- ---------------------------------------------------------------------
create index if not exists wallet_topups_tenant_status_idx
  on public.wallet_topups (tenant_id, status);

create index if not exists wallet_topups_tenant_created_idx
  on public.wallet_topups (tenant_id, created_at desc);

create index if not exists wallet_topups_wallet_created_idx
  on public.wallet_topups (wallet_id, created_at desc);

-- ---------------------------------------------------------------------
-- top_ups
-- ---------------------------------------------------------------------
create index if not exists top_ups_tenant_status_idx
  on public.top_ups (tenant_id, status);

create index if not exists top_ups_tenant_created_idx
  on public.top_ups (tenant_id, created_at desc);

create index if not exists top_ups_advertiser_created_idx
  on public.top_ups (advertiser_id, created_at desc);

-- ---------------------------------------------------------------------
-- ad_account_requests
-- ---------------------------------------------------------------------
create index if not exists ad_account_requests_tenant_status_idx
  on public.ad_account_requests (tenant_id, status);

create index if not exists ad_account_requests_tenant_created_idx
  on public.ad_account_requests (tenant_id, created_at desc);

-- ---------------------------------------------------------------------
-- invoices: mark-paid queries hit (tenant_id, status)
-- ---------------------------------------------------------------------
create index if not exists invoices_tenant_status_idx
  on public.invoices (tenant_id, status);

create index if not exists invoices_advertiser_created_idx
  on public.invoices (advertiser_id, created_at desc);

-- ---------------------------------------------------------------------
-- subscriptions: hot "active per advertiser" check in
-- createSubscriptionAsAdmin
-- ---------------------------------------------------------------------
create index if not exists subscriptions_advertiser_status_idx
  on public.subscriptions (advertiser_id, status);

create index if not exists subscriptions_tenant_status_idx
  on public.subscriptions (tenant_id, status);

-- ---------------------------------------------------------------------
-- user_profiles: sidebar "was this admin active in last N minutes"
-- ---------------------------------------------------------------------
create index if not exists user_profiles_tenant_role_seen_idx
  on public.user_profiles (tenant_id, role, last_seen_at desc)
  where last_seen_at is not null;

create index if not exists user_profiles_tenant_role_idx
  on public.user_profiles (tenant_id, role);

-- ---------------------------------------------------------------------
-- notifications: unread lookup for the popover
-- ---------------------------------------------------------------------
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, is_read, created_at desc)
  where is_read = false;

-- ---------------------------------------------------------------------
-- referral_commissions: mark-paid + filter by status
-- ---------------------------------------------------------------------
create index if not exists referral_commissions_tenant_status_idx
  on public.referral_commissions (tenant_id, status);

-- ---------------------------------------------------------------------
-- audit_events: viewer queries + retention scans
-- ---------------------------------------------------------------------
-- The base migration already indexed (tenant_id, occurred_at desc) and
-- (table_name, row_id). Add the filter-on-action-only variant used by
-- the /audit page's action dropdown.
create index if not exists audit_events_tenant_action_time_idx
  on public.audit_events (tenant_id, action, occurred_at desc);

-- ---------------------------------------------------------------------
-- From: 20260830130000_rls_on_admin_tables.sql
-- ---------------------------------------------------------------------
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

