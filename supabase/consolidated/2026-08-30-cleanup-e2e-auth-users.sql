-- ═══════════════════════════════════════════════════════════════════
-- Cleanup step for the E2E fixture.
--
-- The earlier fixup-and-seed.sql inserted auth.users rows via direct
-- SQL, which produced accounts that Supabase Auth refuses to work
-- with ("Database error checking email"). Remove them here — cascade
-- clears identities + user_profiles + advertisers + wallets +
-- affiliates for the test tenant.
--
-- After this, run the Node seed:
--   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
--   node e2e/fixtures/seed.mjs
--
-- Then re-run the SQL fixup script (Sections 1–3) — it will find
-- the auth.users rows already present and only add the tenant/
-- profile/advertiser/wallet/affiliate wiring.
-- ═══════════════════════════════════════════════════════════════════

-- Delete identities first (FK to users).
delete from auth.identities
 where user_id in (
   '22222222-2222-2222-2222-222222222222'::uuid,
   '33333333-3333-3333-3333-333333333333'::uuid,
   '44444444-4444-4444-4444-444444444444'::uuid,
   '55555555-5555-5555-5555-555555555555'::uuid
 );

-- Then users. tenants.owner_id = super-admin cascades on the tenant
-- side (SET NULL / ON DELETE NO ACTION depends on the FK), so also
-- drop the test tenant to keep the state consistent.
delete from public.tenants
 where id = '11111111-1111-1111-1111-111111111111'::uuid;

delete from auth.users
 where id in (
   '22222222-2222-2222-2222-222222222222'::uuid,
   '33333333-3333-3333-3333-333333333333'::uuid,
   '44444444-4444-4444-4444-444444444444'::uuid,
   '55555555-5555-5555-5555-555555555555'::uuid
 );

select 'cleanup complete — auth.users + test tenant removed' as status;
