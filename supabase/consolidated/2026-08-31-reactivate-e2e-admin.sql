-- Reactivate the E2E admin. A button-coverage sweep clicked the
-- "Deactivate" control on /admins and disabled the account. The
-- sweep now skips deactivate/activate/suspend labels, but this
-- restores the already-disabled row. Safe to re-run.
update public.user_profiles
   set is_active = true,
       status = 'active'
 where id in (
   'a2222222-2222-2222-2222-222222222222',  -- super admin
   'a3333333-3333-3333-3333-333333333333',  -- admin
   'a4444444-4444-4444-4444-444444444444',  -- advertiser
   'a5555555-5555-5555-5555-555555555555'   -- affiliate
 );

select id, full_name, role, status, is_active
  from public.user_profiles
 where tenant_id = '11111111-1111-1111-1111-111111111111'
 order by role;
