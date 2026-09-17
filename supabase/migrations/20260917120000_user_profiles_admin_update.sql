-- =====================================================================
-- Let an admin write a profile in their own tenant
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY (SQL editor). Run
-- supabase/checks/user-profiles-update-policy.sql first — if the UPDATE
-- policy already allows an admin of the tenant, do NOT run this.
--
-- Symptom this fixes: Deactivate / Activate (and any other admin edit of a
-- user profile, including the name change) reports
--   "That change was not saved — the row could not be written."
-- The server action reads the target row, verifies the caller is an admin
-- of the same tenant, refuses admin targets, then updates by primary key
-- and gets zero rows back with no error. RLS does not raise on a denied
-- UPDATE; it filters the row out, which looks exactly like this.
--
-- The authorisation the app relies on is NOT being loosened here — it is
-- being restored to what the server action already enforces above the
-- database: admin of this tenant, target is not another admin, columns
-- allowlisted to is_active / status / full_name. Two BEFORE UPDATE
-- triggers stay in force and are the real guards:
--   _guard_user_profile_role      only the tenant owner may change `role`
--   _guard_self_reactivation      nobody may re-activate their own account
-- =====================================================================

set search_path = public;

-- A helper under its OWN name. `create or replace` on _is_admin_of cannot
-- change its parameter name, so a file that redefines it with a different
-- one fails at that statement and silently takes everything after it down
-- with it. A new name has no such history.
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
    -- The tenant in the NEW row must also be one the caller administers,
    -- so a profile cannot be moved out of (or into) a tenant sideways.
    user_id = auth.uid()
    or public._psm_admin_of(tenant_id)
  );

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
  and p.polcmd = 'w';
