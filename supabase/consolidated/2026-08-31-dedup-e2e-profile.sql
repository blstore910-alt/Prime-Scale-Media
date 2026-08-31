-- Remove the duplicate "E2E Super Admin" profile in the test tenant.
--
-- The stray profile is also referenced by public.admins (FK
-- admins_profile_id_fkey), so delete the admins row first, then the
-- profile. Targets ONLY E2E-tenant "E2E Super Admin" rows whose id is
-- NOT the canonical fixed id — cannot touch your real account.
-- Safe to re-run.

-- 1. Show the strays that will go
select id, user_id, full_name, created_at
  from public.user_profiles
 where tenant_id = '11111111-1111-1111-1111-111111111111'
   and full_name = 'E2E Super Admin'
   and id <> 'a2222222-2222-2222-2222-222222222222';

-- 2. Drop dependent admins rows first
delete from public.admins
 where profile_id in (
   select id from public.user_profiles
    where tenant_id = '11111111-1111-1111-1111-111111111111'
      and full_name = 'E2E Super Admin'
      and id <> 'a2222222-2222-2222-2222-222222222222'
 );

-- 3. Now the profiles
delete from public.user_profiles
 where tenant_id = '11111111-1111-1111-1111-111111111111'
   and full_name = 'E2E Super Admin'
   and id <> 'a2222222-2222-2222-2222-222222222222';

-- 4. Confirm 4 remain
select id, full_name, role, status, is_active
  from public.user_profiles
 where tenant_id = '11111111-1111-1111-1111-111111111111'
 order by role, full_name;
