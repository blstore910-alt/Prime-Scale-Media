-- ════════════════════════════════════════════════════════════════════
--  F4 — waarom viel de eenmalige bonus niet?
--
--  ALLEEN LEZEN. Draait met:  npm run check -- -f supabase/checks/read/F4-BONUS-DIAGNOSE.sql
--
--  WAT ER GEBEURDE. De bonus stond op EUR 10 voor PSM0005 (alleen voor
--  hem). Piet (PSM0010) werd door hem aangebracht, kreeg een abonnement,
--  en die factuur is betaald. De maandcommissie kwam binnen (50% van
--  EUR 10 = EUR 5,00). De bonus niet, terwijl plak 55 hem juist óók op
--  een betaalde factuur hoort te laten vallen.
--
--  Vijf tabellen, in deze volgorde te lezen:
--    1  staat de bonusregel er, en vanaf wanneer
--    2  draait de versie van de boekfunctie die plak 55 neerzette
--    3  welke trigger hangt er aan facturen
--    4  hoe ziet Piets koppeling eruit en wat staat erop
--    5  alle commissie van PSM0005 per soort
-- ════════════════════════════════════════════════════════════════════

-- ── 1. DE REGEL ──────────────────────────────────────────────────────
select
  coalesce(a.tenant_client_code, 'STANDAARD') as voor_wie,
  r.source,
  r.amount,
  r.currency,
  (to_jsonb(r) ->> 'pct') as pct,   -- via jsonb: een kolom die hier niet bestaat breekt de hele batch
  left(r.effective_from::text, 16) as vanaf,
  left(r.created_at::text, 16)     as gemaakt
from public.commission_rules r
left join public.advertisers a on a.id = r.affiliate_advertiser_id
where r.source = 'onetime'
order by r.effective_from desc nulls last;

-- ── 2. WELKE VERSIE VAN DE BOEKFUNCTIE DRAAIT ────────────────────────
select
  p.proname,
  case
    when position('_book_onetime_if_due' in pg_get_functiondef(p.oid)) > 0
      then 'plak 55 (roept _book_onetime_if_due aan)'
    else 'OUDE VERSIE -- plak 55 zit er niet in'
  end as versie,
  length(pg_get_functiondef(p.oid)) as lengte
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('_book_invoice_commission', '_book_onetime_if_due')
order by p.proname;

-- ── 3. DE TRIGGER OP FACTUREN ────────────────────────────────────────
select
  t.tgname,
  p.proname as roept_aan,
  case
    when position('_book_invoice_commission' in pg_get_functiondef(p.oid)) > 0
      then 'roept de boekfunctie aan'
    else 'heeft de boeking zelf in zich'
  end as hoe,
  t.tgenabled as aan
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where c.relname = 'invoices'
  and not t.tgisinternal
  and pg_get_functiondef(p.oid) ilike '%commission%';

-- ── 4. PIETS KOPPELING ───────────────────────────────────────────────
select
  l.id as koppeling,
  aff.tenant_client_code as affiliate,
  ref.tenant_client_code as klant,
  l.status,
  left(l.created_at::text, 16) as sinds,
  rc.source,
  rc.amount,
  rc.currency,
  rc.status as commissie_status,
  left(rc.created_at::text, 16) as geboekt
from public.referral_links l
join public.advertisers ref on ref.id = l.referred_advertiser_id
left join public.advertisers aff on aff.id = l.affiliate_advertiser_id
left join public.referral_commissions rc on rc.referral_link_id = l.id
where ref.tenant_client_code = 'PSM0010'
order by rc.created_at nulls first;

-- ── 5. ALLES WAT PSM0005 VERDIEND HEEFT, PER SOORT ───────────────────
select
  coalesce(rc.source, 'topup') as soort,
  upper(coalesce(rc.currency, 'EUR')) as valuta,
  count(*) as stuks,
  sum(rc.amount) as totaal,
  count(*) filter (where rc.status = 'paid') as betaald
from public.referral_commissions rc
join public.referral_links l on l.id = rc.referral_link_id
join public.advertisers a on a.id = l.affiliate_advertiser_id
where a.tenant_client_code = 'PSM0005'
  and coalesce(rc.status, 'unpaid') <> 'reversed'
group by 1, 2
order by 1, 2;
