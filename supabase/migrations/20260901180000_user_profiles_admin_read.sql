-- =====================================================================
-- P0: admins couldn't see any advertisers/members
-- =====================================================================
-- After RLS was enabled on user_profiles, the ONLY SELECT policy was
-- user_profiles_own_select (user_id = auth.uid()) — so an admin could
-- read only their OWN profile. Every admin view that lists other members
-- (Advertisers list, user details, etc.) came back empty. An accepted
-- advertiser "disappeared".
--
-- Add an admin-read policy: an admin may read all profiles in their
-- tenant. CANNOT be written as `exists (select ... from user_profiles)`
-- inside a user_profiles policy — that recurses. So the admin check goes
-- through a SECURITY DEFINER function whose inner query bypasses RLS.
--
-- Combined with the existing own-select policy (permissive OR), the
-- result: admins read own + all tenant profiles; advertisers/affiliates
-- still read only their own.
-- =====================================================================

set search_path = public;

create or replace function public.is_tenant_admin(p_tenant uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_profiles up
     where up.user_id = auth.uid()
       and up.tenant_id = p_tenant
       and up.role = 'admin'
  );
$$;

revoke all on function public.is_tenant_admin(uuid) from public, anon;
grant execute on function public.is_tenant_admin(uuid) to authenticated;

drop policy if exists user_profiles_admin_select on public.user_profiles;
create policy user_profiles_admin_select on public.user_profiles
  for select
  using (public.is_tenant_admin(user_profiles.tenant_id));
