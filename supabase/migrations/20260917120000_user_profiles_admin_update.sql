-- =====================================================================
-- Let an admin write a profile in their own tenant
-- =====================================================================
-- APPLIED ON LIVE 2026-09-17. This file is the record of what ran; do not
-- run it again. Verified afterwards:
--
--   user_profiles_own_update  using (user_id = auth.uid())
--   user_profiles_update      using ((user_id = auth.uid())
--                                    OR _psm_admin_of(tenant_id))
--
-- Both are permissive and therefore OR'd, so the self-update path is
-- untouched and the admin case sits beside it.
--
-- WHY IT WAS NEEDED
-- Before this, the only UPDATE policy on user_profiles was
-- user_profiles_own_update, while the admin policy on the table was for
-- SELECT only (user_profiles_admin_select, using is_tenant_admin). So an
-- admin could READ every profile in the tenant and WRITE none but their
-- own. Deactivate / Activate — and the name change, and every other admin
-- edit of a profile — read the row, verified the caller, updated by
-- primary key and got ZERO rows back with no error, because RLS does not
-- raise on a denied UPDATE. It filters the row out. The server action
-- counts the written rows and refused to call that success, which is the
-- "That change was not saved" message.
--
-- WHAT IS NOT LOOSENED
-- This restores at the database what the server action already enforces
-- above it (actions/admin-actions.ts): admin of this tenant, target is
-- not another admin, columns allowlisted to is_active / status /
-- full_name. And the two BEFORE UPDATE triggers remain the real guards
-- for the dangerous columns:
--   _guard_user_profile_role   only the tenant owner may change `role`
--   _guard_self_reactivation   nobody may re-activate their own account
-- The with_check repeats the using clause so a profile cannot be moved
-- sideways into or out of a tenant.
--
-- The helper is deliberately NOT a create-or-replace of _is_admin_of:
-- create-or-replace cannot rename a function's parameter, so a file that
-- tries fails at that statement and takes every statement after it down
-- with it. A new name has no such history.
-- =====================================================================

set search_path = public;

create or replace function public._psm_admin_of(p_tenant uuid)
returns boolean
language sql
stable
security definer           -- so the subquery does not recurse through this policy
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = auth.uid()
      and up.tenant_id = p_tenant
      and up.role = 'admin'
  );
$$;
revoke all on function public._psm_admin_of(uuid) from public, anon;
grant execute on function public._psm_admin_of(uuid) to authenticated;

drop policy if exists user_profiles_update on public.user_profiles;
create policy user_profiles_update on public.user_profiles
  for update
  using (
    user_id = auth.uid()
    or public._psm_admin_of(tenant_id)
  )
  with check (
    user_id = auth.uid()
    or public._psm_admin_of(tenant_id)
  );
