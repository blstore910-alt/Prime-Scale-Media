-- =====================================================================
-- Wat doet de incasso ECHT? — één plak, één tabel
-- =====================================================================
-- De nachtelijke incasso is het enige stuk van de app dat geld verplaatst
-- terwijl niemand kijkt. De functie die het doet staat NIET in deze repo:
-- hij is met de hand op de database gezet. Drie bestanden beschrijven
-- drie verschillende versies ervan, dus geen enkele uitspraak hierover is
-- te doen zonder dit te draaien.
--
-- Leest alleen. Verandert niets. Stuur de tabel terug zoals hij is.
--
-- DE VIJF DINGEN DIE HIERONDER KUNNEN ZITTEN, van duur naar minder duur:
--
--  1. Een klant die één maand mist wordt daarna NOOIT MEER gefactureerd,
--     tot hij die ene maand alsnog betaalt. next_payment_date schuift
--     alleen op als een factuur betaald wordt, en de duplicaat-check
--     ziet de onbetaalde factuur elke nacht opnieuw. Drie klanten drie
--     maanden achter op EUR 200 = EUR 1.800 die nooit gefactureerd is.
--     Regel 10 telt ze.
--
--  2. Een gepauzeerde of uitgezette klant wordt tóch geïncasseerd. De
--     verzamellus filtert misschien alleen op 'cancelled'. Regel 3 zegt
--     het.
--
--  3. Twee incasso-motoren. Als er ook een pg_cron-job draait, krijgt
--     elke klant twee facturen per maand. Regel 6.
--
--  4. Twee abonnementen op één klant. Er is nergens een unieke index;
--     de regel "één betalend plan" staat alleen in TypeScript, en elke
--     admin kan via PostgREST een tweede rij actief zetten. Regel 11 --
--     dit is de regel die ik als eerste zou lezen.
--
--  5. De dubbele wallet-credit. Als 20260913220000 nooit geplakt is,
--     staat er nog een tweede balans-trigger op wallet_topups en wordt
--     ELKE geverifieerde top-up twee keer bijgeschreven. Regel 7.
-- =====================================================================

set search_path = public;

select 1 as nr, 'incasso: welke statussen slaat hij over' as vraag,
  case
    when to_regprocedure('public.subscription_billing_run()') is null
      then 'FUNCTIE BESTAAT NIET onder die naam — stuur me de lijst uit regel 2'
    when pg_get_functiondef('public.subscription_billing_run()'::regprocedure)
           ilike '%not in (''cancelled'', ''inactive'', ''paused'')%'
      or pg_get_functiondef('public.subscription_billing_run()'::regprocedure)
           ilike '%not in (''cancelled'',''inactive'',''paused'')%'
      then 'OK — cancelled, inactive en paused worden overgeslagen'
    when pg_get_functiondef('public.subscription_billing_run()'::regprocedure)
           ilike '%paused%'
      then 'noemt paused ergens — stuur me de body, ik lees hem na'
    else 'PAUSED WORDT GEINCASSEERD — een uitgezette klant betaalt door'
  end as antwoord
union all
select 2, 'alle functies met "billing" of "subscription" in de naam',
  coalesce((
    select string_agg(p.proname, ' | ' order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname ilike '%billing%' or p.proname ilike '%subscription%')
  ), 'geen')
union all
select 3, 'incasso: schuift de klok op bij een ONBETAALDE maand',
  case
    when to_regprocedure('public.subscription_billing_run()') is null
      then 'n.v.t.'
    when pg_get_functiondef('public.subscription_billing_run()'::regprocedure)
           ilike '%already invoiced%'
      or pg_get_functiondef('public.subscription_billing_run()'::regprocedure)
           ilike '%move the clock on anyway%'
      then 'OK — de klok schuift ook zonder betaling'
    else 'NEE — een onbetaalde maand zet de facturatie stil (zie regel 10)'
  end
union all
select 4, 'incasso: wie mag hem aanroepen',
  coalesce((
    select string_agg(
             p.proname || ' -> ' ||
             coalesce(array_to_string(p.proacl, ' , '), 'default (IEDEREEN)'),
             '   |   ' order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('subscription_billing_run',
                         'process_recurring_subscriptions')
  ), 'geen van beide bestaat')
union all
select 5, 'kan een klant zélf de incasso starten',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('subscription_billing_run',
                         'process_recurring_subscriptions')
       and has_function_privilege('authenticated', p.oid, 'execute')
  ) then 'JA — PostgREST zet elke public function op /rest/v1/rpc/<naam>'
    else 'nee, dicht' end
union all
select 6, 'draait er ook een pg_cron-job',
  coalesce((
    select string_agg(jobname || ' (' || schedule || ')', ' | ' order by jobname)
      from cron.job
  ), 'geen / cron-schema niet leesbaar')
union all
-- ── De duurste van allemaal. Er hoort er precies ÉÉN te staan.
select 7, 'balans-triggers op wallet_topups (er hoort er ÉÉN te zijn)',
  coalesce((
    select string_agg(t.tgname, ' + ' order by t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'wallet_topups'
       and not t.tgisinternal
  ), 'geen')
union all
select 8, 'triggers op invoices (een tweede kan een maand overslaan)',
  coalesce((
    select string_agg(t.tgname || ' -> ' || p.proname, ' | ' order by t.tgname)
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'invoices'
       and not t.tgisinternal
  ), 'geen')
union all
select 9, 'lease-trigger op integration_jobs (zonder deze: dubbel pushen)',
  case when exists (
    select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'integration_jobs'
       and not t.tgisinternal and t.tgname ilike '%touch%'
  ) then 'OK' else 'ONTBREEKT — een lopende job wordt elke minuut opnieuw verstuurd' end
union all
-- ── En nu: hoeveel staat er al vast?
select 10, 'abonnementen waarvan de klok STILSTAAT (>35 dagen)',
  (select count(*)::text || ' van ' ||
          (select count(*)::text from public.subscriptions
            where status in ('active', 'past_due'))
     from public.subscriptions
    where status in ('active', 'past_due')
      and next_payment_date < current_date - interval '35 days')
union all
select 11, 'klanten met TWEE of meer betalende abonnementen',
  (select count(*)::text from (
     select advertiser_id from public.subscriptions
      where status in ('active', 'past_due')
      group by advertiser_id having count(*) > 1) x)
union all
select 12, 'onbetaalde abonnementsfacturen ouder dan 35 dagen',
  (select count(*)::text || '  |  ' ||
          to_char(coalesce(sum(total), 0), 'FM999999990.00')
     from public.invoices
    where type = 'subscription' and status = 'unpaid'
      and due_date < now() - interval '35 days')
union all
select 13, 'jobs die "processing" zijn gebleven (>1 uur)',
  case when to_regclass('public.integration_jobs') is null
    then 'tabel staat niet op deze database'
    else (select count(*)::text from public.integration_jobs
           where status = 'processing'
             and updated_at < now() - interval '1 hour')
  end
union all
-- Dit is de regel die zegt of "200 {}" al geld heeft gekost: een push die
-- geslaagd heet en geen enkel kenmerk van de leverancier heeft.
select 14, 'pushes die GESLAAGD heten met een LEEG leveranciers-id',
  case when to_regclass('public.integration_jobs') is null
    then 'tabel staat niet op deze database'
    else (select count(*)::text from public.integration_jobs
           where operation in ('push_topup', 'push_withdraw')
             and status = 'succeeded'
             and coalesce(result->>'external_topup_id',
                          result->>'external_withdraw_id', '') = '')
  end
union all
select 15, 'wanneer is er voor het laatst een abonnementsfactuur gemaakt',
  coalesce((
    select to_char(max(created_at), 'YYYY-MM-DD HH24:MI') || '  (' ||
           (now()::date - max(created_at)::date)::text || ' dagen geleden)'
      from public.invoices where type = 'subscription'
  ), 'nog nooit')
order by nr;
