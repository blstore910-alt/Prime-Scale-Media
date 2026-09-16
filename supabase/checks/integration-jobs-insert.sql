-- =====================================================================
-- Can the app actually enqueue an auto-push job?
-- =====================================================================
-- Read-only.
--
-- lib/integrations/enqueue.ts inserts into public.integration_jobs using the
-- SAME Supabase client the calling server action holds — an RLS-bound client
-- running as `authenticated`, not the service role. If integration_jobs has
-- RLS enabled and no INSERT policy that an authenticated admin satisfies,
-- that insert is refused every time, and auto-push to the supplier can never
-- enqueue anything. It would look like the integration is quiet rather than
-- like an error, because the caller only logs the reason.
--
-- This matters right now: the plan is to push exactly ONE top-up live during
-- testing. If this comes back wrong, that push will not happen at all, and
-- the top-up will sit verified with nothing queued behind it.
--
-- Run all three parts; they are separate statements, so run them one at a
-- time (the Supabase SQL editor only shows the last result).
-- =====================================================================

-- 1. Is RLS on, and is it forced?
select
  c.relname            as table_name,
  c.relrowsecurity     as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('integration_jobs', 'integration_events');

-- 2. What policies exist, and which commands do they cover?
--    Look for cmd = 'INSERT' (or 'ALL'). If there is none, the insert in
--    enqueue.ts cannot succeed as `authenticated`.
-- select
--   tablename,
--   policyname,
--   cmd,
--   roles,
--   qual        as using_expression,
--   with_check  as with_check_expression
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('integration_jobs', 'integration_events')
-- order by tablename, cmd, policyname;

-- 3. Which grants exist for the authenticated role?
--    A missing INSERT grant fails just as hard as a missing policy, and the
--    error reads differently, so it is worth telling them apart.
-- select
--   table_name,
--   grantee,
--   string_agg(privilege_type, ', ' order by privilege_type) as privileges
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in ('integration_jobs', 'integration_events')
--   and grantee in ('authenticated', 'anon', 'service_role')
-- group by table_name, grantee
-- order by table_name, grantee;

-- ---------------------------------------------------------------------
-- What the answers mean:
--
--   RLS off                  → the insert works; the finding is refuted.
--   RLS on + INSERT policy   → works IF an admin satisfies its with_check.
--                              Read the expression: it probably calls
--                              _is_admin_of(tenant_id), which now also
--                              requires the admin to be active.
--   RLS on + no INSERT policy → auto-push is dead. The fix is NOT to loosen
--                              the table: enqueueing a background job is a
--                              system action, so enqueue.ts should take the
--                              service-role client instead of the caller's.
-- ---------------------------------------------------------------------
