-- ═══════════════════════════════════════════════════════════════════
-- E2E fixture teardown. Removes the psm-e2e tenant + everything
-- FK'd to it. Safe to run when nothing exists yet.
--
-- Order matters — advertisers/wallets/affiliates cascade off the
-- tenant, but auth.users is a separate schema and has to be cleared
-- explicitly.
-- ═══════════════════════════════════════════════════════════════════

-- All public.* rows cascade off tenants.on delete cascade.
delete from public.tenants
 where id = '11111111-1111-1111-1111-111111111111'::uuid;

delete from auth.identities
 where user_id in (
   '22222222-2222-2222-2222-222222222222'::uuid,
   '33333333-3333-3333-3333-333333333333'::uuid,
   '44444444-4444-4444-4444-444444444444'::uuid,
   '55555555-5555-5555-5555-555555555555'::uuid
 );

delete from auth.users
 where id in (
   '22222222-2222-2222-2222-222222222222'::uuid,
   '33333333-3333-3333-3333-333333333333'::uuid,
   '44444444-4444-4444-4444-444444444444'::uuid,
   '55555555-5555-5555-5555-555555555555'::uuid
 );

select 'teardown complete' as status;
