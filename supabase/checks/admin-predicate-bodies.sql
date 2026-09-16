-- =====================================================================
-- The three shared admin predicates, as they exist LIVE
-- =====================================================================
-- Read-only. Send back the whole result.
--
-- Why these three specifically: RLS policies across the schema authorise
-- through them, so adding the is_active test HERE denies a deactivated admin
-- at the table level everywhere at once — without touching the eight other
-- functions individually.
--
-- I need the current bodies rather than the repo's, because they are not
-- reliably the same thing, and rewriting one from the wrong source is how
-- this project broke a live RPC once already. With the real text I can add
-- one condition and change nothing else.
--
-- Also included: who WOULD lose access. Check that list first. If it names
-- anyone who should still be working, the answer is to reactivate them, not
-- to skip the fix.
-- =====================================================================

select
  p.proname                                  as name,
  pg_get_function_identity_arguments(p.oid)  as args,
  p.provolatile                              as volatility,   -- s = stable
  p.prosecdef                                as security_definer,
  pg_get_functiondef(p.oid)                  as full_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('_is_admin_of', '_is_super_admin_of', 'is_tenant_admin')
order by p.proname;

-- ---------------------------------------------------------------------
-- Run this one SEPARATELY (the editor shows only the last result).
-- Everyone who would be denied once the predicates test is_active.
-- Expect only people you have actually deactivated.
-- ---------------------------------------------------------------------
-- select up.id, up.full_name, up.email, up.role, up.tenant_id,
--        up.is_active, up.status
--   from public.user_profiles up
--  where up.role = 'admin'
--    and (up.is_active = false or coalesce(up.status, 'active') = 'inactive')
--  order by up.full_name;
