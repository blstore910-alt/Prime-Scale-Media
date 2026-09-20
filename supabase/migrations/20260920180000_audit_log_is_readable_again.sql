-- =====================================================================
-- The audit log was unreadable by everyone, including the owner
-- =====================================================================
-- Read off production 2026-09-20:
--
--   policyname              permissive   cmd     qual
--   audit_events_no_writes  RESTRICTIVE  ALL     false
--   audit_events_read       PERMISSIVE   SELECT  _is_super_admin_of(tenant_id)
--
-- A RESTRICTIVE policy is AND-ed with the permissive ones, and `FOR ALL`
-- includes SELECT. So every read evaluated as
--
--     (owner of this tenant)  AND  (false)   =   false
--
-- 1,553 rows on the table, 981 of them carrying a tenant_id, the newest
-- from today -- and /audit said "No audit events found" to everybody.
-- That is the screen you open when money is missing, and it has been
-- telling the owner nothing ever happened.
--
-- The repo's own version of this policy (20260828130000_audit_events)
-- is `create policy ... for all using (false)` with no AS clause, which
-- is PERMISSIVE and therefore harmless: permissive policies are OR-ed,
-- so it added nothing and blocked nothing. Somewhere between the repo
-- and production it became RESTRICTIVE, and that one word is the whole
-- fault.
--
-- Writes were never protected by it anyway: the REVOKE at the bottom of
-- that migration takes INSERT/UPDATE/DELETE away from public, anon and
-- authenticated at the GRANT level, which a policy cannot override. The
-- trigger that writes the rows is SECURITY DEFINER and runs as the table
-- owner, so it is unaffected.
--
-- Postgres has no "ALL except SELECT", so the same lock is expressed as
-- three restrictive policies, one per write command. Belt and braces
-- with the revoke, and neither touches reading.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

drop policy if exists audit_events_no_writes on public.audit_events;

drop policy if exists audit_events_no_insert on public.audit_events;
create policy audit_events_no_insert on public.audit_events
  as restrictive for insert to public with check (false);

drop policy if exists audit_events_no_update on public.audit_events;
create policy audit_events_no_update on public.audit_events
  as restrictive for update to public using (false) with check (false);

drop policy if exists audit_events_no_delete on public.audit_events;
create policy audit_events_no_delete on public.audit_events
  as restrictive for delete to public using (false);

revoke insert, update, delete on public.audit_events
  from public, anon, authenticated;

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
select
  'the restrictive ALL policy is gone' as item,
  case
    when not exists (
      select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'audit_events'
         and policyname = 'audit_events_no_writes'
    ) then 'OK'
    else 'STILL THERE - reading stays blocked'
  end as status
union all
select
  'writes still locked (one policy per command)',
  (
    select count(*)::text from pg_policies
     where schemaname = 'public'
       and tablename = 'audit_events'
       and permissive = 'RESTRICTIVE'
  ) || ' of 3'
union all
select
  'no restrictive policy touches SELECT',
  case
    when not exists (
      select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'audit_events'
         and permissive = 'RESTRICTIVE'
         and cmd in ('ALL', 'SELECT')
    ) then 'OK'
    else 'ONE STILL DOES - reading stays blocked'
  end
union all
select
  'a read policy exists',
  case
    when exists (
      select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'audit_events'
         and cmd = 'SELECT'
    ) then 'OK' else 'MISSING'
  end
union all
select
  'rows the owner should now see',
  (select count(*)::text from public.audit_events where tenant_id is not null);
