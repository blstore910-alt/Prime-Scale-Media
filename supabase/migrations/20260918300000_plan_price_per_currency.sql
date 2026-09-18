-- =====================================================================
-- A plan has a PRICE per currency, not a conversion.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. Additive: four nullable columns. Nothing
-- changes for anybody until a price is actually pinned.
--
-- THE PROBLEM. `plans` carries one `monthly_fee` and one `currency`. A
-- customer paying in the other currency therefore gets a conversion:
-- €200 at today's rate is $226.14. That number moves every time the ECB
-- moves, it reads like a rounding error on an invoice, and nobody has
-- ever sold a subscription for $226.14.
--
-- THE OWNER'S RULE, which is the right one: the €200 plan costs $225, the
-- €150 plan costs $170, the €75 plan costs $85. Round numbers a person
-- chose. So the price per currency is STORED, and conversion is demoted
-- to what it should always have been — a SUGGESTION shown to the admin
-- setting the price, which they may take or ignore. The same shape as the
-- top-up fee: the system advises, the human decides, and what the human
-- decided is what gets charged.
--
-- WHY FOUR COLUMNS AND NOT A PRICES TABLE. There are two currencies and
-- two terms — four numbers. A table would bring its own RLS, its own
-- triggers and its own join for four nullable numerics, and every one of
-- those is somewhere a price can go missing.
--
-- NULL MEANS NOTHING WAS CHOSEN, and the price is derived: converted for
-- a monthly one, twelve months less the discount for a yearly one. ZERO
-- MEANS FREE and is a decision — lib/pure-plan-price.ts keeps that
-- distinction, and the tests in tests/lib/plan-price.test.ts hold it.
--
-- The existing `monthly_fee` + `currency` stay exactly as they are and
-- keep working. This only adds somewhere better to look first.
--
-- ROLLBACK: alter table public.plans drop column monthly_fee_eur, ... ;
-- =====================================================================

set search_path = public;

alter table public.plans
  add column if not exists monthly_fee_eur numeric(10, 2)
    check (monthly_fee_eur is null or monthly_fee_eur >= 0),
  add column if not exists monthly_fee_usd numeric(10, 2)
    check (monthly_fee_usd is null or monthly_fee_usd >= 0),
  add column if not exists yearly_fee_eur numeric(10, 2)
    check (yearly_fee_eur is null or yearly_fee_eur >= 0),
  add column if not exists yearly_fee_usd numeric(10, 2)
    check (yearly_fee_usd is null or yearly_fee_usd >= 0);

comment on column public.plans.monthly_fee_eur is
  'The monthly price in EUR, as a person chose it. NULL = derive it (from monthly_fee, or by conversion). 0 = free in EUR, which is a decision.';
comment on column public.plans.monthly_fee_usd is
  'The monthly price in USD, as a person chose it — e.g. 225 for the €200 plan, never 226.14. NULL = derive it.';
comment on column public.plans.yearly_fee_eur is
  'The yearly price in EUR. NULL = twelve monthly prices less yearly_discount_pct.';
comment on column public.plans.yearly_fee_usd is
  'The yearly price in USD. NULL = twelve monthly prices less yearly_discount_pct.';

-- ── Seed the base currency's own price, so nothing is derived twice ──
-- A plan priced in EUR already has its EUR price in monthly_fee. Copying
-- it across makes the pinned column the single place to read, and leaves
-- monthly_fee as the untouched fallback for anything not yet updated.
update public.plans
   set monthly_fee_eur = monthly_fee
 where monthly_fee_eur is null
   and upper(coalesce(currency, 'EUR')) = 'EUR';

update public.plans
   set monthly_fee_usd = monthly_fee
 where monthly_fee_usd is null
   and upper(coalesce(currency, 'EUR')) = 'USD';

-- ── Read back ────────────────────────────────────────────────────────
-- The USD column is deliberately empty for EUR plans: that is the whole
-- point — somebody has to choose 225, and until they do the screen says
-- "suggested" rather than pretending they did.
select
  t.initials            as tenant,
  p.name,
  p.kind,
  p.currency            as base,
  p.monthly_fee,
  p.monthly_fee_eur,
  p.monthly_fee_usd,
  p.yearly_discount_pct,
  p.yearly_fee_eur,
  p.yearly_fee_usd
  from public.plans p
  join public.tenants t on t.id = p.tenant_id
 order by t.initials, p.kind, p.sort_order;
