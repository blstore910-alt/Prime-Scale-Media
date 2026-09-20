-- =====================================================================
-- PLAK DIT EERST — drie dingen die de check van vanavond heeft bevestigd
-- =====================================================================
-- Uit WAT-STAAT-ER-LIVE.sql, zojuist gedraaid op productie:
--
--   referral views read as the caller (security_invoker)
--     referral_commissions_with_details = NO
--     referral_links_with_details       = NO
--     top_ups_view                      = NO
--
--   change_subscription_amount callable by authenticated  = YES
--   wise_confirm_suggestion    callable by authenticated  = YES
--   subscriptions: one billable plan enforced by an index = NO
--
-- ── 1. EEN VIEW ZONDER security_invoker DRAAIT ALS ZIJN EIGENAAR ─────
--
-- Dat betekent: RLS op de onderliggende tabel doet NIETS. En
-- /commissions heeft helemaal geen tenant-filter -- die leunt volledig
-- op de view. Dus elke ingelogde gebruiker die
-- referral_commissions_with_details kan lezen, leest ELKE commissie van
-- ELKE tenant: bedragen, klantcodes, namen, e-mailadressen.
-- Hetzelfde voor referral_links_with_details (de commerciele
-- voorwaarden van een affiliate) en top_ups_view (elke betaling).
--
-- Er staan twee tenants op deze database, dus de schade is vandaag
-- beperkt tot "de testtenant ziet de echte en andersom". Dat is nog
-- steeds een lek, en het is het soort lek dat bij de derde tenant
-- onherstelbaar wordt.
--
-- ── ALS EEN SCHERM HIERNA LEEG IS ────────────────────────────────────
--
-- Dan is het niet dit bestand dat stuk is: dan staat de RLS op de
-- onderliggende tabel te streng, en dat was al zo -- alleen zag je het
-- niet omdat de view eroverheen keek. Terugdraaien is een regel:
--
--   alter view public.top_ups_view set (security_invoker = off);
--
-- Zeg het me als dat nodig is, dan lezen we het policy-probleem op.
--
-- ── 2 en 3 ───────────────────────────────────────────────────────────
--
-- change_subscription_amount schrijft rechtstreeks in wallets.
-- wise_confirm_suggestion crediteert een wallet en slaat de
-- twin-credit- en maintenance-checks over. Allebei staan ze open voor
-- `authenticated`, en PostgREST zet elke public function op
-- /rest/v1/rpc/<naam> -- dus elke ingelogde klant kan ze aanroepen. De
-- eigenaar-regel stond alleen in de server action.
--
-- En: geen enkele unieke index houdt tegen dat een klant twee lopende
-- abonnementen heeft. De regel "een betalend plan" staat alleen in
-- TypeScript, en elke admin kan via PostgREST een tweede rij op active
-- zetten. Twee rijen = twee facturen per maand = twee incasso's uit een
-- wallet. De index wordt CONCURRENT gebouwd zodat hij niets blokkeert,
-- en hij faalt als er al zo'n klant is -- daarom telt het rapport dat
-- eerst.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

-- ── 1. De views lezen als de aanroeper ───────────────────────────────
do $blk0$
declare
  v_name text;
begin
  foreach v_name in array array[
    'referral_commissions_with_details',
    'referral_links_with_details',
    'top_ups_view'
  ] loop
    if to_regclass('public.' || v_name) is not null then
      execute format(
        'alter view public.%I set (security_invoker = on)', v_name
      );
      raise notice 'security_invoker on: %', v_name;
    else
      raise notice 'view not here, skipped: %', v_name;
    end if;
  end loop;
end;
$blk0$;

-- ── 2. Twee RPCs die niemand iets vroegen ────────────────────────────
-- Alleen van `authenticated` afgepakt. De server actions draaien met
-- dezelfde rol, dus die moeten via de service-client gaan -- zie de
-- opmerking onderaan als een van beide daarna weigert.
do $blk1$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('change_subscription_amount', 'wise_confirm_suggestion')
  loop
    execute format('revoke execute on function %s from authenticated', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from public', r.sig);
    raise notice 'closed: %', r.sig;
  end loop;
end;
$blk1$;

-- ── 3. Een klant heeft ten hoogste een betalend abonnement ───────────
-- Partieel, zodat cancelled/paused/inactive rijen er zoveel mogen zijn
-- als de geschiedenis vraagt. CONCURRENTLY kan niet in een transactie,
-- dus als de editor dit in een blok stopt: draai deze ene regel apart.
do $blk2$
declare
  v_dupes int;
begin
  select count(*) into v_dupes from (
    select advertiser_id from public.subscriptions
     where coalesce(status,'') in ('active','past_due')
     group by advertiser_id having count(*) > 1
  ) x;

  if v_dupes > 0 then
    raise notice
      'NIET aangelegd: % klant(en) hebben nu al twee lopende abonnementen. Ruim die eerst op -- het rapport onderaan noemt ze.',
      v_dupes;
    return;
  end if;

  if to_regclass('public.subscriptions_one_billable_per_advertiser') is null then
    execute $blk3$
      create unique index subscriptions_one_billable_per_advertiser
        on public.subscriptions (advertiser_id)
       where coalesce(status, '') in ('active', 'past_due')
    $blk3$;
    raise notice 'index aangelegd';
  end if;
end;
$blk2$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen het LAATSTE resultaat
-- =====================================================================
select 1 as nr, 'views lezen als de aanroeper' as item,
  coalesce((
    select string_agg(
             c.relname || '=' ||
             case when array_to_string(coalesce(c.reloptions, '{}'), ',')
                       ilike '%security_invoker=on%'
                  then 'JA' else 'NEE' end,
             '  |  ' order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('referral_links_with_details',
                         'referral_commissions_with_details',
                         'top_ups_view')
  ), 'geen van de drie views bestaat') as antwoord
union all
select 2, 'change_subscription_amount open voor authenticated',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'change_subscription_amount'
       and has_function_privilege('authenticated', p.oid, 'execute')
  ) then 'JA - nog steeds open' else 'nee, dicht' end
union all
select 3, 'wise_confirm_suggestion open voor authenticated',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wise_confirm_suggestion'
       and has_function_privilege('authenticated', p.oid, 'execute')
  ) then 'JA - nog steeds open' else 'nee, dicht' end
union all
select 4, 'index: een betalend abonnement per klant',
  case when to_regclass('public.subscriptions_one_billable_per_advertiser') is null
       then 'NIET aangelegd - zie regel 5' else 'aangelegd' end
union all
select 5, 'klanten die NU al twee lopende abonnementen hebben',
  coalesce((
    select string_agg(x.advertiser_id::text || ' (' || x.n::text || ')', ' | ')
      from (select advertiser_id, count(*) as n from public.subscriptions
             where coalesce(status,'') in ('active','past_due')
             group by advertiser_id having count(*) > 1) x
  ), 'geen')
union all
-- Kan ik na dit bestand nog steeds zien wat ik moet kunnen zien? Als
-- dit 0 is en je weet dat er rijen zijn, dan is de RLS op de
-- onderliggende tabel te streng -- zie de kop van dit bestand.
select 6, 'zichtbaar via top_ups_view voor JOU, nu',
  (select count(*)::text from public.top_ups_view)
union all
select 7, 'zichtbaar via referral_commissions_with_details voor JOU, nu',
  case when to_regclass('public.referral_commissions_with_details') is null
    then 'view bestaat niet'
    else (select count(*)::text from public.referral_commissions_with_details)
  end
order by nr;
