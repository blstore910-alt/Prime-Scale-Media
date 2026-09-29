-- ════════════════════════════════════════════════════════════════════
-- PLAK 141 — SPOED. DRAAI DEZE METEEN. (tweede versie)
-- ════════════════════════════════════════════════════════════════════
--
-- De eerste versie liep stuk op
--
--   ERROR: 42883: function "public.rate_limit_prune()" does not exist
--
-- en omdat de SQL-editor het hele bestand als één transactie draait,
-- is daarmee ALLES teruggedraaid -- ook de spoedregel bovenaan. De
-- incassomotor staat dus nog steeds open. Vandaar deze tweede versie.
--
-- Wat er mis was: `has_function_privilege('authenticated', 'public.x()',
-- 'execute')` WERPT een fout als die functie niet bestaat, hij geeft
-- geen false terug. Mijn `exists (...) and has_function_privilege(...)`
-- stond in één expressie, dus Postgres rekende allebei de kanten uit en
-- viel over de naam die er niet is. Nu met `to_regprocedure`, dat NULL
-- teruggeeft in plaats van te werpen.
--
-- ── WAAROM DIT MOET ───────────────────────────────────────────────
--
-- Plak 137 eindigde met de standaardregel uit CLAUDE.md:
--
--   grant execute on function ... to authenticated, service_role;
--
-- Die klopt voor een functie die een KLANT hoort te kunnen aanroepen.
-- `process_recurring_subscriptions` is dat niet: dat is de
-- incassomotor. Hij maakt abonnementsfacturen aan en int openstaande
-- facturen uit de wallets zodra de coulancetermijn om is.
-- `supabase/checks/FIX-B-INCASSO.sql` had hem met opzet dichtgezet, en
-- plak 137 heeft dat ongedaan gemaakt.
--
-- Gevonden door `npm run ochtend`, regel 4, die van 0 naar 1 sprong.
--
-- Niet direct stelen -- de functie boekt niets naar een rekening die de
-- aanroeper kiest. Wel: de incasso van ANDERE klanten vervroegd laten
-- lopen, facturen laten aanmaken, en dat zo vaak herhalen als je wilt.
-- ════════════════════════════════════════════════════════════════════

-- ── DE SPOEDREGEL, HELEMAAL ALLEEN ─────────────────────────────────
-- Geen do-block, geen lus, niets wat ernaast kan gaan. Als de rest van
-- dit bestand faalt, is dit het enige dat telt.
revoke all on function public.process_recurring_subscriptions()
  from public, anon, authenticated;
grant execute on function public.process_recurring_subscriptions()
  to service_role;

-- ── EN DE ANDERE MACHINEFUNCTIES, VOOR DE ZEKERHEID ────────────────
-- Alles wat alleen een cron of de server hoort te starten. Nu met
-- `to_regprocedure`, dat NULL geeft voor een naam die niet bestaat in
-- plaats van de hele transactie om te gooien. Een naam die er niet is
-- wordt gemeld en overgeslagen.
do $blk0$
declare
  f    text;
  oid_ regprocedure;
  n    int := 0;
begin
  foreach f in array array[
    'process_recurring_subscriptions',
    'expire_overdue_subscriptions',
    'rate_limit_prune',
    'prune_rate_limit_buckets'
  ] loop
    oid_ := to_regprocedure(format('public.%I()', f));
    if oid_ is null then
      raise notice 'bestaat niet, overgeslagen: %', f;
      continue;
    end if;
    if has_function_privilege('authenticated', oid_::oid, 'execute') then
      execute format(
        'revoke all on function public.%I() from public, anon, authenticated', f);
      execute format(
        'grant execute on function public.%I() to service_role', f);
      n := n + 1;
      raise notice 'dichtgezet: %', f;
    else
      raise notice 'stond al dicht: %', f;
    end if;
  end loop;
  raise notice 'plak 141: % machinefunctie(s) dichtgezet', n;
end
$blk0$;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- De eerste twee horen 'false' te zijn, de derde 'true'.
select
  'plak 141 geplaatst' as wat,
  has_function_privilege('authenticated',
    'public.process_recurring_subscriptions()', 'execute')::text
    as klant_mag_incasso_starten,
  has_function_privilege('anon',
    'public.process_recurring_subscriptions()', 'execute')::text
    as anon_mag_incasso_starten,
  has_function_privilege('service_role',
    'public.process_recurring_subscriptions()', 'execute')::text
    as server_mag_nog_wel;
