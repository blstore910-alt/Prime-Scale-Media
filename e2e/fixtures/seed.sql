-- ═══════════════════════════════════════════════════════════════════
-- E2E test fixture.
--
-- Creates a completely isolated tenant `psm-e2e` with four fixed-UUID
-- users covering every role. Runs before Playwright's role-setup
-- project. Reverse with teardown.sql.
--
-- Fixed UUIDs so Playwright specs can reference them verbatim (see
-- e2e/fixtures/ids.ts). Fixed emails so magic-link and password flows
-- know exactly what to sign in with.
--
-- Passwords are set via Supabase's bcrypt helper (pgcrypto's crypt
-- with gen_salt('bf')). The four test users share the same password
-- to keep the spec harness small — this file only runs against a
-- non-production instance.
-- ═══════════════════════════════════════════════════════════════════

-- Fixed IDs
--   tenant           : 11111111-1111-1111-1111-111111111111
--   super-admin user : 22222222-2222-2222-2222-222222222222
--   admin user       : 33333333-3333-3333-3333-333333333333
--   advertiser user  : 44444444-4444-4444-4444-444444444444
--   affiliate user   : 55555555-5555-5555-5555-555555555555

-- Guard against running on production. Anyone who wants to bypass has
-- to set ALLOW_E2E_SEED=true in their psql session explicitly.
do $$
begin
  if current_setting('app.allow_e2e_seed', true) is distinct from 'true' then
    if exists (
      select 1 from public.tenants
       where id <> '11111111-1111-1111-1111-111111111111'::uuid
       limit 1
    ) then
      raise notice 'Existing tenants detected. To confirm this is a test env, run:  set app.allow_e2e_seed = ''true'';  then re-run this script.';
    end if;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────
-- Tenant
-- ─────────────────────────────────────────────────────────────────
insert into public.tenants (id, name, slug, initials, owner_id)
values (
  '11111111-1111-1111-1111-111111111111',
  'PSM E2E Test',
  'psm-e2e',
  'E2E',
  '22222222-2222-2222-2222-222222222222'
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  initials = excluded.initials,
  owner_id = excluded.owner_id;

-- ─────────────────────────────────────────────────────────────────
-- Four auth users with the same password. Idempotent by id.
-- ─────────────────────────────────────────────────────────────────
insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
)
select
  u.id::uuid,
  'authenticated', 'authenticated', u.email,
  crypt('E2E-passw0rd!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', u.name),
  false
from (values
  ('22222222-2222-2222-2222-222222222222', 'e2e-super@primescalemedia.test', 'E2E Super Admin'),
  ('33333333-3333-3333-3333-333333333333', 'e2e-admin@primescalemedia.test', 'E2E Admin'),
  ('44444444-4444-4444-4444-444444444444', 'e2e-adv@primescalemedia.test',   'E2E Advertiser'),
  ('55555555-5555-5555-5555-555555555555', 'e2e-aff@primescalemedia.test',   'E2E Affiliate')
) as u(id, email, name)
on conflict (id) do update set
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at;

-- Every auth user needs a matching identities row for
-- signInWithPassword to work.
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at,
  created_at, updated_at
)
select
  u.id::uuid,
  u.id::uuid,
  jsonb_build_object('sub', u.id, 'email', u.email, 'email_verified', true),
  'email',
  now(), now(), now()
from (values
  ('22222222-2222-2222-2222-222222222222', 'e2e-super@primescalemedia.test'),
  ('33333333-3333-3333-3333-333333333333', 'e2e-admin@primescalemedia.test'),
  ('44444444-4444-4444-4444-444444444444', 'e2e-adv@primescalemedia.test'),
  ('55555555-5555-5555-5555-555555555555', 'e2e-aff@primescalemedia.test')
) as u(id, email)
on conflict (provider, provider_id) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- Profiles
-- ─────────────────────────────────────────────────────────────────
insert into public.user_profiles (
  id, user_id, tenant_id, role, full_name, email, status, is_active
) values
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'admin',      'E2E Super Admin', 'e2e-super@primescalemedia.test', 'active', true),
  ('a3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'admin',      'E2E Admin',       'e2e-admin@primescalemedia.test', 'active', true),
  ('a4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'advertiser', 'E2E Advertiser',  'e2e-adv@primescalemedia.test',   'active', true),
  ('a5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'advertiser', 'E2E Affiliate',   'e2e-aff@primescalemedia.test',   'active', true)
on conflict (id) do update set
  role = excluded.role,
  status = excluded.status,
  is_active = excluded.is_active;

-- Advertiser + wallet for the advertiser & affiliate rows.
-- (Affiliate is an advertiser who also has an affiliates row.)
select public.ensure_advertiser_and_wallet('a4444444-4444-4444-4444-444444444444'::uuid);
select public.ensure_advertiser_and_wallet('a5555555-5555-5555-5555-555555555555'::uuid);

-- Affiliate relationship: e2e-aff refers e2e-adv.
insert into public.affiliates (
  affiliate_id, advertiser_id, status, commission_type,
  commission_rate, commission_amount, currency, tenant_id
)
select
  (select id from public.advertisers where profile_id = 'a5555555-5555-5555-5555-555555555555'),
  (select id from public.advertisers where profile_id = 'a4444444-4444-4444-4444-444444444444'),
  'pending', 'percentage', 0, 0, 'USD',
  '11111111-1111-1111-1111-111111111111'
on conflict do nothing;

select
  'seed complete' as status,
  count(*) filter (where role = 'admin')      as admins,
  count(*) filter (where role = 'advertiser') as advertisers
from public.user_profiles
where tenant_id = '11111111-1111-1111-1111-111111111111';
