-- =====================================================================
-- The tax rate per country, as a reference an advertiser can read.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. Additive: one small table, seeded.
--
-- WHAT THIS IS, AND WHAT IT IS NOT.
--
-- A digital services tax applies on ad spend, at a rate set by the country
-- the ad account advertises in. The SUPPLIER holds the reserve — that is
-- the owner's rule, and it means this app computes nothing, holds nothing
-- and moves nothing. It shows the schedule, and for an API-linked account
-- it shows the figure the supplier reports.
--
-- So this table is a REFERENCE, not a ledger. Nothing here is money.
--
-- WHY A TABLE RATHER THAN A LIST IN A COMPONENT. Rates change by
-- government, not by deploy. Putting them in the code means a tax change
-- waits for an engineer; putting them here means somebody who knows the
-- number can change it and the customer sees the truth the same day.
--
-- WHO SEES IT: every signed-in profile in the tenant. It is a published
-- schedule — the same list the customer would be shown before they buy —
-- and it carries no cost, no margin and no supplier name.
--
-- The seed matches the schedule in use today. Check it against the
-- supplier's own list before relying on it.
-- =====================================================================

set search_path = public;

create table if not exists public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- ISO 3166-1 alpha-2, or the literal '**' for the catch-all row.
  country_code text not null,
  country_name text not null,
  rate_pct numeric(5,2) not null check (rate_pct >= 0 and rate_pct <= 100),

  is_active boolean not null default true,
  sort_order int not null default 0,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tax_rates_country_uq unique (tenant_id, country_code)
);

create index if not exists tax_rates_tenant_idx
  on public.tax_rates (tenant_id, sort_order);

alter table public.tax_rates enable row level security;

drop policy if exists tax_rates_select on public.tax_rates;
create policy tax_rates_select on public.tax_rates
  for select using (
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = tax_rates.tenant_id
    )
  );

drop policy if exists tax_rates_write_admin on public.tax_rates;
create policy tax_rates_write_admin on public.tax_rates
  for all using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));

-- ── Seed, per tenant, only where nothing is set ──────────────────────
insert into public.tax_rates
  (tenant_id, country_code, country_name, rate_pct, sort_order)
select t.id, v.code, v.name, v.pct, v.ord
  from public.tenants t
  cross join (values
    ('AT', 'Austria',        5.0, 1),
    ('FR', 'France',         3.0, 2),
    ('IT', 'Italy',          3.0, 3),
    ('ES', 'Spain',          3.0, 4),
    ('TR', 'Türkiye',        5.0, 5),
    ('GB', 'United Kingdom', 2.0, 6),
    ('**', 'Everywhere else', 0.0, 99)
  ) as v(code, name, pct, ord)
 on conflict (tenant_id, country_code) do nothing;

-- ── updated_at, as CLAUDE.md asks of a new table ─────────────────────
do $blk0$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_touch_updated_at'
  ) then
    execute 'drop trigger if exists trg_touch_tax_rates on public.tax_rates';
    execute 'create trigger trg_touch_tax_rates
             before update on public.tax_rates
             for each row execute function public._touch_updated_at()';
    raise notice 'updated_at trigger attached.';
  end if;
end;
$blk0$;

-- ── Read back ────────────────────────────────────────────────────────
select
  t.initials as tenant,
  r.country_code,
  r.country_name,
  r.rate_pct,
  r.is_active
  from public.tax_rates r
  join public.tenants t on t.id = r.tenant_id
 order by t.initials, r.sort_order;
