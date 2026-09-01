-- =====================================================================
-- plans — billing presets (pricing tiers + communities) used to pre-fill
-- an advertiser's plan at invite time.
-- =====================================================================
-- One table for both the public pricing TIERS (Launch/Prime/Flex) and
-- COMMUNITIES (e.g. NSA), distinguished by `kind`. Each preset carries
-- the settings that get copied onto an advertiser when they're invited:
--   monthly_fee          the monthly subscription fee
--   included_ad_accounts how many ad accounts are free before the €50 fee
--   topup_fee_pct        default topup fee % for all their ad accounts
--
-- Choosing a preset at invite pre-fills these; the admin can still tweak
-- per advertiser, and everything is editable later. NSA community = €0/mo
-- (free → no subscription/invoice). Values are DEFAULTS/presets; once an
-- advertiser is set up their own copy governs, so changing a preset never
-- rewrites existing advertisers or history.
-- =====================================================================

set search_path = public;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  kind text not null default 'tier' check (kind in ('tier', 'community')),
  monthly_fee numeric(10, 2) not null default 0 check (monthly_fee >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'USD')),
  included_ad_accounts int not null default 1 check (included_ad_accounts >= 0),
  topup_fee_pct numeric(5, 2) not null default 5
    check (topup_fee_pct >= 0 and topup_fee_pct <= 100),
  is_active boolean not null default true,
  sort_order int not null default 0,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_name_uq unique (tenant_id, name)
);

create index if not exists plans_tenant_idx on public.plans(tenant_id);
create index if not exists plans_active_idx
  on public.plans(tenant_id, is_active, sort_order);

-- RLS: any tenant member may READ (invite form + display); admins WRITE.
-- Self-contained admin check (no _is_admin_of — absent in the live DB).
alter table public.plans enable row level security;

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans
  for select to authenticated
  using (
    exists (select 1 from public.user_profiles up
      where up.user_id = auth.uid() and up.tenant_id = plans.tenant_id)
  );

drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans
  for all to authenticated
  using (
    exists (select 1 from public.user_profiles up
      where up.user_id = auth.uid() and up.tenant_id = plans.tenant_id
        and up.role = 'admin')
  )
  with check (
    exists (select 1 from public.user_profiles up
      where up.user_id = auth.uid() and up.tenant_id = plans.tenant_id
        and up.role = 'admin')
  );

-- New financial table → audit + touch triggers (CLAUDE.md).
drop trigger if exists trg_touch_plans on public.plans;
create trigger trg_touch_plans before update on public.plans
  for each row execute function public._touch_updated_at();
drop trigger if exists trg_audit_plans on public.plans;
create trigger trg_audit_plans after insert or update or delete on public.plans
  for each row execute function public._audit_row_change();

-- Seed the public tiers + the NSA community for every tenant with none.
insert into public.plans
  (tenant_id, name, kind, monthly_fee, currency, included_ad_accounts, topup_fee_pct, sort_order)
select t.id, v.name, v.kind, v.fee, 'EUR', v.incl, v.pct, v.ord
from public.tenants t
cross join (values
  ('Launch', 'tier',      150, 1, 3.5, 1),
  ('Prime',  'tier',      200, 2, 3.0, 2),
  ('Flex',   'tier',       75, 1, 5.0, 3),
  ('NSA',    'community',    0, 1, 5.0, 4)
) as v(name, kind, fee, incl, pct, ord)
where not exists (select 1 from public.plans x where x.tenant_id = t.id);
