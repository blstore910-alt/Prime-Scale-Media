-- =====================================================================
-- Twee functie-bodies die ik nodig heb — leest alleen
-- =====================================================================
-- Uit WAT-DOET-DE-INCASSO-ECHT.sql van zojuist kwamen twee antwoorden
-- die ik niet zelf kan oplossen, omdat de functies met de hand op de
-- database staan en niet in deze repo:
--
-- REGEL 3 zei: "NEE — een onbetaalde maand zet de facturatie stil."
--
--   next_payment_date schuift alleen op als een factuur BETAALD wordt.
--   De duplicaat-check ziet de onbetaalde factuur van die maand elke
--   nacht opnieuw en slaat de klant over. Dus: klant mist oktober ->
--   november, december en januari worden NOOIT gefactureerd, tot
--   oktober alsnog betaald wordt. Bij EUR 200 per maand en drie
--   klanten die een maand achterlopen is dat EUR 1.800 per kwartaal dat
--   nooit op een factuur komt. Vandaag staat er 0 van 1 stil, dus het
--   heeft nog niets gekost -- maar het is een kwestie van de eerste
--   klant die een maand mist.
--
-- REGEL 8 liet TWEE triggers zien die allebei op een betaalde factuur
-- reageren:
--
--   on_invoice_subscription_paid  -> handle_invoice_payment_update
--   trg_on_subscription_invoice_paid -> _on_subscription_invoice_paid
--
--   Als ze allebei next_payment_date vooruitzetten, slaat ELKE betaalde
--   factuur een maand over, voor ELKE klant, en dan klopt regel 15
--   (laatste abonnementsfactuur 2 dagen geleden) alleen bij toeval.
--   Postgres vuurt triggers ALFABETISCH, dus `on_...` gaat voor
--   `trg_...` -- de volgorde bepaalt mee wat er overblijft.
--
-- Dit script drukt die twee bodies af. Plak het en stuur het resultaat
-- terug; dan schrijf ik de vervanging woord voor woord, in plaats van
-- de repo-versie eroverheen te zetten -- dat heeft eerder vanavond de
-- productie plat gelegd.
-- =====================================================================

set search_path = public;

select 1 as nr,
       'subscription_billing_run' as functie,
       coalesce(
         (select pg_get_functiondef(p.oid)
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'subscription_billing_run'
           limit 1),
         'staat niet op deze database'
       ) as body
union all
select 2,
       'handle_invoice_payment_update',
       coalesce(
         (select pg_get_functiondef(p.oid)
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'handle_invoice_payment_update'
           limit 1),
         'staat niet op deze database'
       )
union all
select 3,
       '_on_subscription_invoice_paid',
       coalesce(
         (select pg_get_functiondef(p.oid)
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = '_on_subscription_invoice_paid'
           limit 1),
         'staat niet op deze database'
       )
order by nr;
