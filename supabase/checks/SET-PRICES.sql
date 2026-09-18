-- =====================================================================
-- De prijzen zetten. Jouw eigen getallen.
-- =====================================================================
-- "200eu plan mag dan 225 USD zijn per maand ipv 229 is lelijk,
--  150eu plan mag dan 170 USD en 75eu plan mag 85 usd"
--
-- Those are prices somebody chose. EUR 200 at today's rate is $226.14,
-- which moves with the ECB and reads like a rounding error on an
-- invoice. So they are stored, not converted.
--
-- ONLY WHERE NOTHING IS SET YET. Every update below says
-- `where monthly_fee_usd is null`, so running this twice cannot
-- overwrite a price you later change on the Plans screen. If you DO want
-- to overwrite one, change it there — that is what the screen is for,
-- and it records who changed it.
--
-- Matched on the EUR amount rather than the name, because the names are
-- yours to change and the amounts are what the numbers above refer to.
-- Both tenants get them.
-- =====================================================================

set search_path = public;

-- ── The USD price per monthly EUR price ──────────────────────────────
update public.plans
   set monthly_fee_usd = v.usd
  from (values
    (200.00::numeric, 225.00::numeric),
    (150.00::numeric, 170.00::numeric),
    ( 75.00::numeric,  85.00::numeric)
  ) as v(eur, usd)
 where plans.kind = 'tier'
   and upper(coalesce(plans.currency, 'EUR')) = 'EUR'
   and plans.monthly_fee = v.eur
   and plans.monthly_fee_usd is null;

-- ── The EUR price, stated rather than inferred ───────────────────────
-- monthly_fee is already the EUR price for a EUR plan; copying it across
-- makes the pinned column the single place to read, and leaves
-- monthly_fee untouched as the fallback for anything not updated.
update public.plans
   set monthly_fee_eur = monthly_fee
 where kind = 'tier'
   and upper(coalesce(currency, 'EUR')) = 'EUR'
   and monthly_fee_eur is null;

-- ── The yearly option: 20% off twelve months ─────────────────────────
-- NULL or 0 means a plan has no yearly option at all and the pill does
-- not appear for it. Setting 20 turns it on.
--
-- The numbers it produces are round because the monthly ones are:
--   EUR 200 -> EUR 1,920 / $225 -> $2,160
--   EUR 150 -> EUR 1,440 / $170 -> $1,632
--   EUR  75 -> EUR   720 /  $85 ->   $816
-- The two USD yearly figures are the least tidy of the six. If you want
-- $1,600 and $800 instead, set yearly_fee_usd on those rows and the
-- computed figure is ignored — that is what the column is for.
update public.plans
   set yearly_discount_pct = 20
 where kind = 'tier'
   and monthly_fee > 0
   and yearly_discount_pct is null;

-- ── Read back: what a customer will actually be charged ──────────────
-- `derived` means nobody pinned that one and it is being computed.
select
  t.initials                              as tenant,
  p.name,
  p.currency                              as base,
  p.monthly_fee_eur                       as eur_month,
  p.monthly_fee_usd                       as usd_month,
  p.yearly_discount_pct                   as yearly_pct,
  round(coalesce(p.yearly_fee_eur,
        coalesce(p.monthly_fee_eur, p.monthly_fee) * 12
          * (1 - coalesce(p.yearly_discount_pct, 0) / 100.0)), 2)
                                          as eur_year,
  case when p.yearly_fee_eur is null then 'derived' else 'set' end
                                          as eur_year_from,
  round(coalesce(p.yearly_fee_usd,
        p.monthly_fee_usd * 12
          * (1 - coalesce(p.yearly_discount_pct, 0) / 100.0)), 2)
                                          as usd_year,
  case when p.yearly_fee_usd is null then 'derived' else 'set' end
                                          as usd_year_from
  from public.plans p
  join public.tenants t on t.id = p.tenant_id
 where p.kind = 'tier'
 order by t.initials, p.monthly_fee desc;
