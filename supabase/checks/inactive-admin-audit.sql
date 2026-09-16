-- =====================================================================
-- Which money RPCs accept a DEACTIVATED admin?
-- =====================================================================
-- Read-only. Run this and send back the result.
--
-- Context: every SECURITY DEFINER money function authorises the caller with
-- some variant of
--
--   exists (select 1 from user_profiles up
--            where up.user_id = auth.uid() and up.role = 'admin' ...)
--
-- and none of them — checked across every migration in the repo — also tests
-- is_active or status. So an admin you have deactivated keeps the power to
-- credit wallets, approve refunds, release withdrawals and grant perks.
--
-- The app paths are now closed: the six server actions that called these
-- RPCs directly go through resolveAdminContext(), which does check. What is
-- still open is calling the RPC straight from the browser's own Supabase
-- client, because these functions are granted to `authenticated` and enforce
-- only their own weaker test.
--
-- Fixing that means editing the function bodies, and the live bodies are
-- hand-authored and are NOT reliably the ones in supabase/migrations — a
-- migration written against the repo's version once broke this exact RPC
-- family in production. So: list what is actually there first, then patch
-- precisely those.
-- =====================================================================

select
  p.proname                                   as function_name,
  p.prosecdef                                 as security_definer,
  (p.prosrc ilike '%role%=%admin%')           as checks_admin_role,
  (p.prosrc ilike '%is_active%')              as checks_is_active,
  (p.prosrc ilike '%status%<>%inactive%'
    or p.prosrc ilike '%status%!=%inactive%') as checks_status,
  case
    when p.prosrc ilike '%is_active%' then 'ok'
    else 'ACCEPTS A DEACTIVATED ADMIN'
  end                                         as verdict,
  pg_get_function_identity_arguments(p.oid)   as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef                       -- SECURITY DEFINER only
  and p.prosrc ilike '%role%=%admin%'   -- authorises on the admin role
order by
  (p.prosrc ilike '%is_active%'),       -- the unguarded ones first
  p.proname;
