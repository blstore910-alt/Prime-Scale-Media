-- =====================================================================
-- TOON-DRIE (v2) — alleen lezen. Geeft mij de drie functies die overbleven.
-- =====================================================================
-- HOE DRAAI JE DIT
--   Plakken in de Supabase SQL editor en Run. Geen rol wisselen, geen
--   instelling aanzetten: de editor draait als `postgres`, dat is de
--   eigenaar, en row-level security geldt niet voor die rol. Er wordt
--   NIETS geschreven — alleen pg_catalog lezen. Zo vaak draaien als je
--   wilt.
--
-- WAT ER MIS WAS IN V1
--   Ik had `limit 1` binnen een tak van een UNION gezet. Postgres wil
--   daar haakjes omheen, anders "syntax error at or near union". Deze
--   versie heeft helemaal geen union meer: één query, één resultaat.
--
-- WAAROM DIT BESTAAT
--   FIX-EN-RAPPORT deed 13 van de 16 delen. Drie sloegen over omdat de
--   functie op live er anders uitziet dan de migratie in de repo, en ik
--   herschrijf een geldfunctie niet op de gok:
--     A9   affiliate_referral_stats — mijn regel-voor-regel verwijdering
--          haalde ook de `returns table(...)` weg. De e-mailkolom staat
--          dus op dezelfde regel als andere syntax; ik moet die zien.
--     B1a  subscription_billing_run — de incassolus heeft niet de vorm
--          `and s.status <> 'cancelled'` die ik verwachtte.
--     B1b  de functie die een abonnement na een betaalde factuur weer
--          op actief zet — ik weet de naam niet, dus die zoek ik op
--          inhoud.
--
--   Staat er een regel "(NIET GEVONDEN...)" bij een van de drie, dan
--   bestaat die functie niet onder die naam en zoek ik anders.
--
--   Stuur de tabel terug (of Download CSV als hij lang is).
-- =====================================================================

with wanted(nr, bron) as (
  values (1, 'A9  affiliate_referral_stats'),
         (2, 'B1a subscription_billing_run'),
         (3, 'B1b reactivatie')
),
gevonden as (
  select w.nr, w.bron, f.proname, f.def
    from wanted w
    -- left join lateral: elke bron levert altijd minstens één regel op,
    -- ook als de functie niet bestaat. Anders kan ik "niet gevonden" niet
    -- onderscheiden van "query stuk".
    left join lateral (
      select p.proname, pg_get_functiondef(p.oid) as def
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         -- prokind = 'f': geen aggregates. pg_get_functiondef GOOIT op
         -- een aggregate ("array_agg is an aggregate function") en dat
         -- sloopte een eerdere versie.
         and p.prokind = 'f'
         and case w.nr
               when 1 then p.proname = 'affiliate_referral_stats'
               when 2 then p.proname = 'subscription_billing_run'
               -- Zoeken in prosrc (de ruwe body) in plaats van in
               -- pg_get_functiondef: prosrc gooit nooit.
               else p.proname not in ('subscription_billing_run',
                                      'affiliate_referral_stats')
                    and p.prosrc ilike '%subscriptions%'
                    and p.prosrc ilike '%''active''%'
             end
    ) f on true
),
regels as (
  select g.nr,
         g.bron || coalesce(' · ' || g.proname, '') as bron,
         t.ln::int as ln,
         t.regel
    from gevonden g
    left join lateral regexp_split_to_table(
           coalesce(g.def, '(NIET GEVONDEN op deze database)'),
           E'\n') with ordinality as t(regel, ln) on true
)
select bron, ln, regel
  from regels
 where regel like '(NIET GEVONDEN%'
    -- A9 kan lang zijn: alleen de kop plus elke regel met de mailkolom.
    or (nr = 1 and (ln <= 40 or regel ilike '%referred_advertiser_email%'))
    -- B1a en B1b wil ik helemaal zien; die zijn kort genoeg en ik moet
    -- ze exact herschrijven.
    or nr in (2, 3)
 order by nr, bron, ln;
