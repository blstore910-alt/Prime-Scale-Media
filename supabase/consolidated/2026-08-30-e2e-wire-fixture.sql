-- ═══════════════════════════════════════════════════════════════════
-- E2E fixture wiring — run AFTER e2e/fixtures/seed.mjs.
--
-- The Node script created the four auth.users rows via Supabase's
-- Admin API (with proper hashes + empty-string tokens + instance_id).
-- This SQL builds every non-auth row keyed to those users:
--   tenant  →  user_profiles  →  advertisers + wallets  →  affiliates
--
-- No auth.users touch here — that would overwrite the good password
-- hash with a raw crypt() value and break login again.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

insert into public.tenants (id, name, slug, initials, owner_id) values (
  '11111111-1111-1111-1111-111111111111',
  'PSM E2E Test', 'psm-e2e', 'E2E',
  '22222222-2222-2222-2222-222222222222'
)
on conflict (id) do update set
  name = excluded.name, slug = excluded.slug,
  initials = excluded.initials, owner_id = excluded.owner_id;

insert into public.user_profiles (
  id, user_id, tenant_id, role, full_name, email, status, is_active
) values
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'admin',      'E2E Super Admin', 'e2e-super@primescalemedia.test', 'active', true),
  ('a3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'admin',      'E2E Admin',       'e2e-admin@primescalemedia.test', 'active', true),
  ('a4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'advertiser', 'E2E Advertiser',  'e2e-adv@primescalemedia.test',   'active', true),
  ('a5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'advertiser', 'E2E Affiliate',   'e2e-aff@primescalemedia.test',   'active', true)
on conflict (id) do update set
  user_id = excluded.user_id,
  tenant_id = excluded.tenant_id,
  role = excluded.role,
  status = 'active',
  is_active = true;

select public.ensure_advertiser_and_wallet('a4444444-4444-4444-4444-444444444444'::uuid);
select public.ensure_advertiser_and_wallet('a5555555-5555-5555-5555-555555555555'::uuid);

-- Company + billing for the advertiser so /complete-profile stops
-- intercepting every advertiser navigation. Uses fixed IDs to keep
-- Playwright specs referenceable. Same shape for the affiliate
-- since they're also an advertiser at heart.
insert into public.companies (
  id, advertiser_id, tenant_id, user_profile_id,
  name, official_email, phone, website_url,
  vat_no, address, country, state, zipcode, is_not_vat
)
select
  'c4444444-4444-4444-4444-444444444444'::uuid,
  a.id,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'a4444444-4444-4444-4444-444444444444'::uuid,
  'E2E Advertiser BV',
  'billing@e2e.test',
  '+31600000001',
  'https://e2e-adv.test',
  'NL000000000B01',
  'Teststraat 1',
  'Netherlands',
  'North Holland',
  '1000AA',
  false
from public.advertisers a
 where a.profile_id = 'a4444444-4444-4444-4444-444444444444'
on conflict (id) do nothing;

insert into public.companies (
  id, advertiser_id, tenant_id, user_profile_id,
  name, official_email, phone, website_url,
  vat_no, address, country, state, zipcode, is_not_vat
)
select
  'c5555555-5555-5555-5555-555555555555'::uuid,
  a.id,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'a5555555-5555-5555-5555-555555555555'::uuid,
  'E2E Affiliate BV',
  'billing@e2e-aff.test',
  '+31600000002',
  'https://e2e-aff.test',
  'NL000000000B02',
  'Testlaan 2',
  'Netherlands',
  'North Holland',
  '1000BB',
  false
from public.advertisers a
 where a.profile_id = 'a5555555-5555-5555-5555-555555555555'
on conflict (id) do nothing;

insert into public.billings (
  company_id, address, state, country, zipcode
)
select
  'c4444444-4444-4444-4444-444444444444'::uuid,
  'Teststraat 1', 'North Holland', 'Netherlands', '1000AA'
where not exists (
  select 1 from public.billings
   where company_id = 'c4444444-4444-4444-4444-444444444444'::uuid
);

insert into public.billings (
  company_id, address, state, country, zipcode
)
select
  'c5555555-5555-5555-5555-555555555555'::uuid,
  'Testlaan 2', 'North Holland', 'Netherlands', '1000BB'
where not exists (
  select 1 from public.billings
   where company_id = 'c5555555-5555-5555-5555-555555555555'::uuid
);

insert into public.affiliates (
  affiliate_id, advertiser_id, status, commission_type,
  commission_rate, commission_amount, currency, tenant_id
)
select
  (select id from public.advertisers where profile_id = 'a5555555-5555-5555-5555-555555555555'),
  (select id from public.advertisers where profile_id = 'a4444444-4444-4444-4444-444444444444'),
  'pending', 'percentage', 0, 0, 'USD',
  '11111111-1111-1111-1111-111111111111'
on conflict on constraint affiliates_pair_uq do nothing;

-- Sanity: every count should be non-zero.
select
  (select count(*) from public.tenants where id = '11111111-1111-1111-1111-111111111111') as test_tenant,
  (select count(*) from auth.users where email like '%primescalemedia.test%') as test_auth_users,
  (select count(*) from public.user_profiles where tenant_id = '11111111-1111-1111-1111-111111111111') as test_profiles,
  (select count(*) from public.advertisers where tenant_id = '11111111-1111-1111-1111-111111111111') as test_advertisers,
  (select count(*) from public.wallets where tenant_id = '11111111-1111-1111-1111-111111111111') as test_wallets,
  (select count(*) from public.affiliates where tenant_id = '11111111-1111-1111-1111-111111111111') as test_affiliates,
  (select count(*) from public.companies where tenant_id = '11111111-1111-1111-1111-111111111111') as test_companies,
  (select count(*) from public.billings where company_id in (
    'c4444444-4444-4444-4444-444444444444'::uuid,
    'c5555555-5555-5555-5555-555555555555'::uuid
  )) as test_billings;
