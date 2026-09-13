-- =====================================================================
-- Close the user_profiles self-insert tenant hole
-- =====================================================================
-- The insert policy allowed `user_id = auth.uid()` into ANY tenant_id, so
-- any authenticated user could self-insert an advertiser membership into a
-- victim tenant (the role trigger blocks non-advertiser roles, so this is
-- data pollution / advertiser-scoped read exposure, not admin escalation).
--
-- Fix: a self-insert is allowed ONLY when the caller has a real tie to that
-- tenant — an invitation for their (JWT) email, or they own the tenant
-- (self-service tenant creation sets tenants.owner_id first). Admins of the
-- tenant may still insert. Both legit paths keep working:
--   • accept-invite (existing user): invitation exists for their email.
--   • tenant creation (actions/tenant-actions.ts): caller owns the tenant.
--
-- Uses SECURITY DEFINER helpers (same pattern as _is_admin_of) so the
-- checks don't depend on nested RLS visibility.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY, then TEST both onboarding paths:
--   1) accept an invite as an existing user  → profile is created;
--   2) create a new tenant (owner)           → owner profile is created;
--   3) (negative) a signed-in user cannot insert a profile into a tenant
--      they were never invited to and don't own.
-- Rollback if anything breaks: recreate the old permissive policy —
--   drop policy if exists user_profiles_insert on public.user_profiles;
--   create policy user_profiles_insert on public.user_profiles
--     for insert with check (user_id = auth.uid() or _is_admin_of(tenant_id));
-- =====================================================================

set search_path = public;

-- Admin-of-tenant check. Defined here (create or replace) so the policy
-- below never depends on a pre-existing _is_admin_of — the hand-authored
-- live DB may not have it. SECURITY DEFINER so the subquery on user_profiles
-- does not recurse through this same policy.
create or replace function public._is_admin_of(p_tenant uuid)
returns boolean
language sql
stable
security definer
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
revoke all on function public._is_admin_of(uuid) from public, anon;
grant execute on function public._is_admin_of(uuid) to authenticated;

-- Is there a pending/accepted invitation into p_tenant for the CALLER's own
-- email (taken from the JWT, not a client-supplied column)?
create or replace function public._invited_to(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invitations i
    where i.tenant_id = p_tenant
      and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and i.status in ('pending', 'accepted')
  );
$$;

-- Does the caller own p_tenant? (self-service tenant creation)
create or replace function public._owns_tenant(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenants t
    where t.id = p_tenant
      and t.owner_id = auth.uid()
  );
$$;

revoke all on function public._invited_to(uuid) from public, anon;
revoke all on function public._owns_tenant(uuid) from public, anon;
grant execute on function public._invited_to(uuid) to authenticated;
grant execute on function public._owns_tenant(uuid) to authenticated;

drop policy if exists user_profiles_insert on public.user_profiles;
create policy user_profiles_insert on public.user_profiles
  for insert
  with check (
    -- Admin of the target tenant may add members.
    _is_admin_of(tenant_id)
    -- Otherwise a self-insert is allowed only with a real tie to the tenant.
    or (
      user_id = auth.uid()
      and (public._invited_to(tenant_id) or public._owns_tenant(tenant_id))
    )
  );
