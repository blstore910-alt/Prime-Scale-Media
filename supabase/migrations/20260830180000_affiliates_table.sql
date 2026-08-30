-- Belated create for public.affiliates.
--
-- The app has always read/written this table (see actions/admin-actions.ts,
-- components/affiliate/*, components/commissions/*, sidebar Referrals
-- section) but no migration in the tree ever CREATE-d it — the row
-- shape was clearly authored by hand in an earlier Supabase project
-- and never captured in code. This migration codifies the schema so
-- fresh environments have it, and so the permission-hardening + E2E
-- seed can attach cleanly.
--
-- Row semantics: an affiliates row IS a referral relationship, one
-- advertiser (affiliate_id) refers another (advertiser_id). Every
-- advertiser can be both — no separate 'affiliate' user role.

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- The referring party. Nullable because a self-signup can create
  -- an affiliates row before we know who to attribute it to.
  affiliate_id uuid references public.advertisers(id) on delete set null,

  -- The referred party. NOT NULL — a relationship without a referee
  -- has no meaning.
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected', 'suspended')),

  -- Payout economics. Kept multiple shapes because different flows
  -- write different fields: percentage vs one-time vs monthly.
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

  -- Aggregated earnings, updated by the commissions worker.
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

  -- One referral relationship per (referrer, referee) pair.
  constraint affiliates_pair_uq unique (affiliate_id, advertiser_id)
);

create index if not exists affiliates_tenant_idx
  on public.affiliates(tenant_id);
create index if not exists affiliates_advertiser_idx
  on public.affiliates(advertiser_id);
create index if not exists affiliates_status_idx
  on public.affiliates(tenant_id, status);

-- RLS: admins of the tenant read/write. End-user visibility (an
-- advertiser wanting to see their own referrals) goes through
-- /my-referrals which reads referral_links, not this table.
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

-- Attach the standard updated_at + audit triggers explicitly. The
-- arrays in the earlier migrations already list 'affiliates' but ran
-- before this table existed, so the guarded loops skipped it.
drop trigger if exists trg_touch_affiliates on public.affiliates;
create trigger trg_touch_affiliates
  before update on public.affiliates
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_affiliates on public.affiliates;
create trigger trg_audit_affiliates
  after insert or update or delete on public.affiliates
  for each row execute function public._audit_row_change();
