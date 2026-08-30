-- ═══════════════════════════════════════════════════════════════════
-- Consolidated fix: creates the missing affiliates table, applies
-- permission hardening (now idempotent for the new table), and
-- seeds the E2E fixture.
--
-- Safe to re-run. Structured in 3 sections you can also run
-- individually if a step fails.
-- ═══════════════════════════════════════════════════════════════════

--
-- ═══════════════════════════════════════════════════════════════════
-- SECTION 1 — Create public.affiliates (missing from migrations)
-- ═══════════════════════════════════════════════════════════════════
--
create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  affiliate_id uuid references public.advertisers(id) on delete set null,
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected', 'suspended')),
  commission_type text check (
    commission_type in ('percentage', 'fixed', 'monthly', 'onetime')
    or commission_type is null
  ),
  commission_pct numeric,
  commission_onetime numeric,
  commission_monthly numeric,
  commission_currency text,
  commission_rate numeric default 0,
  commission_amount numeric default 0,
  usd_earnings numeric default 0,
  eur_earnings numeric default 0,
  currency text default 'USD',
  payment_status text default 'unpaid'
    check (payment_status in ('paid', 'unpaid')),
  fee_commission boolean default false,
  note text,
  airtable boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliates_pair_uq unique (affiliate_id, advertiser_id)
);

create index if not exists affiliates_tenant_idx
  on public.affiliates(tenant_id);
create index if not exists affiliates_advertiser_idx
  on public.affiliates(advertiser_id);
create index if not exists affiliates_status_idx
  on public.affiliates(tenant_id, status);

alter table public.affiliates enable row level security;

drop policy if exists affiliates_admin_all on public.affiliates;
create policy affiliates_admin_all on public.affiliates
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = affiliates.tenant_id
         and up.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = affiliates.tenant_id
         and up.role = 'admin'
    )
  );

drop trigger if exists trg_touch_affiliates on public.affiliates;
create trigger trg_touch_affiliates
  before update on public.affiliates
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_affiliates on public.affiliates;
create trigger trg_audit_affiliates
  after insert or update or delete on public.affiliates
  for each row execute function public._audit_row_change();


--
-- ═══════════════════════════════════════════════════════════════════
-- SECTION 2 — Permission hardening (now that affiliates exists)
-- ═══════════════════════════════════════════════════════════════════
--
drop policy if exists audit_events_read on public.audit_events;
create policy audit_events_read on public.audit_events
  for select to authenticated
  using (
    exists (
      select 1
        from public.user_profiles up
        join public.tenants t on t.id = up.tenant_id
       where up.user_id = auth.uid()
         and up.tenant_id = audit_events.tenant_id
         and up.role = 'admin'
         and t.owner_id = auth.uid()
    )
  );

create or replace function public._guard_commission_columns()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_caller uuid;
begin
  v_caller := auth.uid();
  if v_caller is null then return new; end if;

  if new.commission_type is not distinct from old.commission_type
     and new.commission_pct is not distinct from old.commission_pct
     and new.commission_onetime is not distinct from old.commission_onetime
     and new.commission_monthly is not distinct from old.commission_monthly
     and new.commission_currency is not distinct from old.commission_currency
  then return new; end if;

  select owner_id into v_owner from public.tenants where id = new.tenant_id;
  if v_owner is null or v_owner <> v_caller then
    raise exception 'Only the tenant owner can change commission fields'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_advertiser_commission on public.advertisers;
create trigger trg_guard_advertiser_commission
  before update on public.advertisers
  for each row execute function public._guard_commission_columns();

drop trigger if exists trg_guard_affiliate_commission on public.affiliates;
create trigger trg_guard_affiliate_commission
  before update on public.affiliates
  for each row execute function public._guard_commission_columns();

create or replace function public._guard_user_profile_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_caller uuid;
begin
  v_caller := auth.uid();
  if v_caller is null then return new; end if;
  if new.role is not distinct from old.role then return new; end if;

  select owner_id into v_owner from public.tenants where id = new.tenant_id;
  if v_owner is null or v_owner <> v_caller then
    raise exception 'Only the tenant owner can change a profile role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_user_profile_role on public.user_profiles;
create trigger trg_guard_user_profile_role
  before update on public.user_profiles
  for each row execute function public._guard_user_profile_role();


--
-- ═══════════════════════════════════════════════════════════════════
-- SECTION 3 — E2E test fixture (isolated psm-e2e tenant)
-- ═══════════════════════════════════════════════════════════════════
--
insert into public.tenants (id, name, slug, initials, owner_id) values (
  '11111111-1111-1111-1111-111111111111',
  'PSM E2E Test', 'psm-e2e', 'E2E',
  '22222222-2222-2222-2222-222222222222'
)
on conflict (id) do update set
  name = excluded.name, slug = excluded.slug,
  initials = excluded.initials, owner_id = excluded.owner_id;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
)
select u.id::uuid, 'authenticated', 'authenticated', u.email,
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

insert into auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select u.id::uuid, u.id::uuid,
       jsonb_build_object('sub', u.id, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from (values
  ('22222222-2222-2222-2222-222222222222', 'e2e-super@primescalemedia.test'),
  ('33333333-3333-3333-3333-333333333333', 'e2e-admin@primescalemedia.test'),
  ('44444444-4444-4444-4444-444444444444', 'e2e-adv@primescalemedia.test'),
  ('55555555-5555-5555-5555-555555555555', 'e2e-aff@primescalemedia.test')
) as u(id, email)
on conflict (provider, provider_id) do nothing;

insert into public.user_profiles (
  id, user_id, tenant_id, role, full_name, email, status, is_active
) values
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'admin',      'E2E Super Admin', 'e2e-super@primescalemedia.test', 'active', true),
  ('a3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'admin',      'E2E Admin',       'e2e-admin@primescalemedia.test', 'active', true),
  ('a4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'advertiser', 'E2E Advertiser',  'e2e-adv@primescalemedia.test',   'active', true),
  ('a5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'advertiser', 'E2E Affiliate',   'e2e-aff@primescalemedia.test',   'active', true)
on conflict (id) do update set
  role = excluded.role, status = excluded.status, is_active = excluded.is_active;

select public.ensure_advertiser_and_wallet('a4444444-4444-4444-4444-444444444444'::uuid);
select public.ensure_advertiser_and_wallet('a5555555-5555-5555-5555-555555555555'::uuid);

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


-- Sanity check
select
  (select count(*) from public.tenants where id = '11111111-1111-1111-1111-111111111111') as test_tenant,
  (select count(*) from public.user_profiles where tenant_id = '11111111-1111-1111-1111-111111111111') as test_profiles,
  (select count(*) from public.advertisers where tenant_id = '11111111-1111-1111-1111-111111111111') as test_advertisers,
  (select count(*) from public.wallets where tenant_id = '11111111-1111-1111-1111-111111111111') as test_wallets,
  (select count(*) from public.affiliates where tenant_id = '11111111-1111-1111-1111-111111111111') as test_affiliates,
  (select count(*) from pg_trigger where tgname in (
    'trg_guard_advertiser_commission',
    'trg_guard_affiliate_commission',
    'trg_guard_user_profile_role'
  )) as hardening_triggers;
