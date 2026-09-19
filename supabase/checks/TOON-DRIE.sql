-- =====================================================================
-- TOON-DRIE — alleen lezen. Geeft mij de drie functies die overbleven.
-- =====================================================================
-- HOE DRAAI JE DIT
--   Gewoon plakken in de Supabase SQL editor en Run. Geen rol wisselen,
--   geen instelling aanzetten. De editor draait als `postgres`, dat is de
--   eigenaar, en row-level security geldt niet voor die rol — dus dit
--   werkt zoals het is. Er wordt NIETS geschreven: alleen pg_catalog
--   lezen. Je kunt het zo vaak draaien als je wilt.
--
-- WAAROM. FIX-EN-RAPPORT deed 13 van de 16 delen. Drie sloegen over
-- omdat de functie op live er anders uitziet dan de migratie in de repo,
-- en ik herschrijf een geldfunctie niet op de gok:
--
--   A9   affiliate_referral_stats — mijn regel-voor-regel verwijdering
--        haalde ook de `returns table(...)` regel weg ("function result
--        type must be specified"). Dat betekent dat de e-mailkolom op
--        dezelfde regel staat als andere syntax. Ik moet die regels zien.
--   B1a  subscription_billing_run — de incassolus heeft niet de vorm
--        `and s.status <> 'cancelled'`.
--   B1b  de trigger die een abonnement na een betaalde factuur weer op
--        actief zet, heeft niet de case-expressie die ik zocht.
--
-- Dit is één query, dus de editor toont het hele resultaat. Stuur de
-- tabel terug (of exporteer naar CSV als hij lang is).
-- =====================================================================

with bronnen as (
  select 'A9  affiliate_referral_stats'::text as bron,
         pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_referral_stats'
     and p.prokind = 'f'
   limit 1

  union all
  select 'B1a subscription_billing_run',
         pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscription_billing_run'
     and p.prokind = 'f'
   limit 1

  -- B1b: ik weet de naam niet, dus zoek de functie die een subscription
  -- op 'active' zet. Dat is de trigger op een betaalde factuur.
  union all
  select 'B1b ' || p.proname,
         pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and pg_get_functiondef(p.oid) like '%update public.subscriptions%'
     and pg_get_functiondef(p.oid) like '%''active''%'
     and p.proname <> 'subscription_billing_run'
),
regels as (
  select b.bron,
         row_number() over (partition by b.bron) as ln,
         l as regel
    from bronnen b, regexp_split_to_table(b.def, E'\n') as l
)
select bron, ln, regel
  from regels
 where
   -- A9: alles rond de returns-tabel en elke regel die de e-mailkolom
   --     noemt.
   (bron like 'A9%' and (
      ln <= 40
      or regel ilike '%referred_advertiser_email%'
   ))
   -- B1a: de regels die over status of over de incassolus gaan.
   or (bron like 'B1a%' and (
      regel ilike '%s.status%'
      or regel ilike '%status%cancelled%'
      or regel ilike '%invoice_pay_from_wallet%'
      or regel ilike '%for inv in%'
      or regel ilike '%due_date%'
   ))
   -- B1b: de regels die de status terugzetten.
   or (bron like 'B1b%' and (
      regel ilike '%status%'
      or regel ilike '%next_payment_date%'
   ))
 order by bron, ln;
