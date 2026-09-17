-- =====================================================================
-- Let an admin write a profile in their own tenant
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY (SQL editor).
--
-- Confirmed on live 2026-09-17 with
-- supabase/checks/user-profiles-update-policy.sql. The only UPDATE policy
-- on user_profiles was:
--
--   user_profiles_own_update   UPDATE   using (user_id = auth.uid())
--
-- and the only admin policy was for SELECT:
--
--   user_profiles_admin_select SELECT   using (is_tenant_admin(tenant_id))
--
-- So an admin may READ every profile in the tenant and WRITE none but
-- their own. Deactivate / Activate — and the name change, and anything
-- else that edits a profile — read the row, verify the caller, update by
-- primary key, and get ZERO rows back with no error, because RLS does not
-- raise on a denied UPDATE. It filters the row out.
--
-- This is ADDITIVE. Permissive policies for the same command are OR'd, so
-- user_profiles_own_update is left exactly as it is and a second policy
-- grants the admin case beside it. Nothing is dropped, so nothing that
-- works today can stop working.
--
-- It reuses is_tenant_admin(), which already gates the admin SELECT on
-- this same table — so it is known to exist, to be callable by
-- `authenticated`, and not to recurse through a policy on user_profiles.
-- (Deliberately NOT create-or-replace on _is_admin_of: that cannot rename
-- a parameter, and a file that tries fails at that statement and takes
-- every statement after it down with it.)
--
-- The authorisation the app relies on is not being loosened — it is being
-- restored to what the server action already enforces above the database:
--   actions/admin-actions.ts  admin of this tenant, target is not another
--                             admin, columns allowlisted to is_active /
--                             status / full_name.
-- And the two BEFORE UPDATE triggers stay in force and remain the real
-- guards for the dangerous columns:
--   _guard_user_profile_role   only the tenant owner may change `role`
--   _guard_self_reactivation   nobody may re-activate their own account
-- =====================================================================

set search_path = public;

drop policy if exists user_profiles_admin_update on public.user_profiles;
create policy user_profiles_admin_update on public.user_profiles
  for update
  using (is_tenant_admin(tenant_id))
  -- The NEW row's tenant must also be one the caller administers, so a
  -- profile cannot be moved sideways into or out of a tenant.
  with check (is_tenant_admin(tenant_id));

-- Read it back so the editor shows what is now in force.
select
  p.polname as policy,
  pg_get_expr(p.polqual, p.polrelid)      as using_clause,
  pg_get_expr(p.polwithcheck, p.polrelid) as with_check_clause
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'user_profiles'
  and p.polcmd = 'w'
order by p.polname;
