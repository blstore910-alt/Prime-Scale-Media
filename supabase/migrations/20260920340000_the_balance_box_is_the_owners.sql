-- =====================================================================
-- "Edit wallet balances" is de eigenaar z'n knop — ook zonder scherm
-- =====================================================================
-- components/wallets/wallet-edit-dialog.tsx riep `wallet_admin_adjust`
-- RECHTSTREEKS vanuit de browser aan. Die functie test alleen
-- `role = 'admin'` (sinds 20260916110000 ook is_active/status). Meer
-- niet. En PostgREST zet elke public function op /rest/v1/rpc/<naam>,
-- dus voor een werknemer-admin was dit een regel in de console:
--
--   supabase.rpc('wallet_admin_adjust',
--     { p_wallet_id: '<willekeurige wallet>', p_eur_delta: 50000,
--       p_usd_delta: 0, p_reason: 'correctie' })
--
-- Geen eigenaar, geen tweede paar ogen, geen maximum, geen negatief-test.
-- Terwijl dit systeem juist WEL een goedgekeurde weg heeft voor precies
-- dit: wallet_adjustment_request (admin vraagt) +
-- wallet_adjustment_approve (eigenaar keurt goed). De dialog liep daar
-- omheen.
--
-- De code-kant is vandaag dicht: de dialog gaat nu door
-- adminAdjustWalletBalances in actions/adjustment-actions.ts, met
-- resolveOwnerContext, een tenant-controle op de OPNIEUW GELEZEN rij,
-- een weigering als het saldo intussen bewoog, en geen negatief
-- eindsaldo. Dit bestand sluit de kant waar geen scherm voor staat.
--
-- WAAROM DIT DE FUNCTIE NIET OVERSCHRIJFT
--
-- Zelfde reden als 20260916110000, en die zegt het zelf: dit project
-- heeft al een keer een live RPC gesloopt door hem uit de repo terug te
-- zetten terwijl de live versie was afgeweken. De body van
-- wallet_admin_adjust staat NIET in deze repo. Dus leest Postgres zijn
-- eigen definitie terug, er wordt precies EEN voorwaarde ingevoegd, en
-- het resultaat wordt opnieuw uitgevoerd. Er kan niets anders
-- veranderen, want er wordt niets anders aangeraakt.
--
-- Het blijft als de AANROEPER draaien -- niet als service-role -- zodat
-- auth.uid() blijft staan en het audit-spoor de admin bij naam noemt.
--
-- Veilig om vaker te draaien: een functie die de voorwaarde al draagt
-- wordt overgeslagen.
-- =====================================================================

set search_path = public;

-- De voorwaarde als functie, zodat de ingevoegde tekst kort is en bij
-- een tweede run herkenbaar.
create or replace function public._is_wallet_tenant_owner(p_wallet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $blk0$
  select exists (
    select 1
      from public.wallets w
      join public.tenants t on t.id = w.tenant_id
     where w.id = p_wallet
       and t.owner_id = auth.uid()
  );
$blk0$;

do $blk1$
declare
  v_oid  oid;
  v_args text;
  src    text;
  pat    text;
  hits   int;
begin
  select p.oid, pg_get_function_arguments(p.oid)
    into v_oid, v_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'wallet_admin_adjust'
   limit 1;

  if v_oid is null then
    raise notice 'wallet_admin_adjust staat niet op deze database';
    return;
  end if;

  src := pg_get_functiondef(v_oid);

  if position('_is_wallet_tenant_owner' in src) > 0 then
    raise notice 'wallet_admin_adjust draagt de eigenaar-test al';
    return;
  end if;

  -- De parameternaam moet kloppen, anders compileert het resultaat niet.
  if position('p_wallet_id' in v_args) = 0 then
    raise notice
      'OVERGESLAGEN: wallet_admin_adjust heeft geen parameter p_wallet_id (%). Met de hand doen.',
      v_args;
    return;
  end if;

  -- Twee schrijfwijzen bestaan in dit schema. De gekwalificeerde MOET
  -- eerst getest worden: up.role = 'admin' bevat role = 'admin'.
  if position('up.role = ''admin''' in src) > 0 then
    pat := 'up.role = ''admin''';
  elsif position('role = ''admin''' in src) > 0 then
    pat := 'role = ''admin''';
  else
    raise notice 'OVERGESLAGEN: geen herkenbare admin-test in wallet_admin_adjust';
    return;
  end if;

  hits := (length(src) - length(replace(src, pat, ''))) / length(pat);
  if hits <> 1 then
    raise notice 'OVERGESLAGEN: patroon % keer gevonden, verwacht precies 1', hits;
    return;
  end if;

  execute replace(
    src, pat,
    pat || ' and public._is_wallet_tenant_owner(p_wallet_id)');
  raise notice 'wallet_admin_adjust is nu eigenaar-only';
end;
$blk1$;

-- =====================================================================
-- De tweede trigger op een betaalde factuur
-- =====================================================================
-- Er hangen er TWEE aan dezelfde gebeurtenis:
--
--   on_invoice_subscription_paid      -> handle_invoice_payment_update
--   trg_on_subscription_invoice_paid  -> _on_subscription_invoice_paid
--
-- De tweede doet het werk goed. De eerste leest het abonnement uit
-- NEW.items->0->>'subscription_id' -- een veld dat de incasso-motor
-- niet schrijft -- dus hij doet vandaag niets. Dat is precies wat hem
-- gevaarlijk maakt: zodra iemand `items` uitbreidt wordt hij wakker, en
-- dan zet hij een GEPAUZEERD abonnement weer aan omdat er een oude
-- factuur betaald werd.
--
-- Hij gaat er alleen af als de live body ook echt die inerte vorm
-- heeft; anders blijft alles staan en zegt het rapport waarom. De body
-- komt hoe dan ook terug in regel 4.
-- =====================================================================
do $blk2$
declare
  body     text;
  has_good boolean;
begin
  select p.prosrc into body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handle_invoice_payment_update'
   limit 1;

  if body is null then
    raise notice 'handle_invoice_payment_update bestaat niet; niets te doen';
    return;
  end if;

  select exists (
    select 1 from pg_trigger t
     where t.tgname = 'trg_on_subscription_invoice_paid' and not t.tgisinternal
  ) into has_good;

  if not has_good then
    raise notice 'OVERGESLAGEN: de goede trigger trg_on_subscription_invoice_paid ontbreekt';
    return;
  end if;

  if position('subscription_id' in body) = 0 or position('items' in body) = 0 then
    raise notice
      'OVERGESLAGEN: handle_invoice_payment_update leest niet uit items/subscription_id; body staat in het rapport';
    return;
  end if;

  execute 'drop trigger if exists on_invoice_subscription_paid on public.invoices';
  raise notice 'on_invoice_subscription_paid verwijderd';
end;
$blk2$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen het LAATSTE resultaat
-- =====================================================================
-- Regels 5 t/m 9 zijn LEESWERK voor mij. Vier van de RPC's die de
-- browser rechtstreeks aanroept staan met de hand op de database en in
-- geen enkele migratie, dus ik kan van geen van vieren bewijzen dat ze
-- de eigenaar/tenant opnieuw afleiden uit auth.uid(). Zolang dat niet
-- vaststaat is elke uitspraak daarover een gok. Met deze ene plak zijn
-- ze alle vier beslist.
-- =====================================================================
select 1 as nr, 'wallet_admin_adjust is eigenaar-only' as item,
  coalesce((
    select case when position('_is_wallet_tenant_owner' in p.prosrc) > 0
                then 'JA' else 'NEE - nog elke admin' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_admin_adjust' limit 1
  ), 'functie bestaat niet') as antwoord
union all
select 2, 'wie mag wallet_admin_adjust aanroepen',
  coalesce((
    select coalesce(array_to_string(p.proacl, ' , '), 'default (elke ingelogde)')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_admin_adjust' limit 1
  ), 'functie bestaat niet')
union all
select 3, 'triggers op invoices die op BETAALD reageren',
  coalesce((
    select string_agg(t.tgname || ' -> ' || p.proname, E'\n' order by t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where c.relname = 'invoices' and not t.tgisinternal
       and (p.prosrc ilike '%paid%' or p.proname ilike '%paid%'
            or p.proname ilike '%payment%')
  ), 'geen')
union all
select 4, 'body van handle_invoice_payment_update',
  coalesce((
    select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'handle_invoice_payment_update' limit 1
  ), 'bestaat niet meer')
union all
-- Deze heb ik nodig om de vastloper te repareren: een GESTORNEERDE
-- (void) factuur blokkeert zijn maand voor altijd, want de
-- duplicaat-test kijkt niet naar de status en next_payment_date schuift
-- alleen op als er betaald wordt. Er staan 7 void abonnementsfacturen.
-- Zonder deze body schrijf ik de vervanging op gevoel, en dat doe ik
-- niet.
select 5, 'VOLLEDIGE body subscription_billing_run - STUUR TERUG',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'subscription_billing_run' limit 1
  ), 'staat niet op deze database')
union all
select 6, 'VOLLEDIGE body top_up_create_for_advertiser - STUUR TERUG',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'top_up_create_for_advertiser' limit 1
  ), 'staat niet op deze database')
union all
select 7, 'VOLLEDIGE body wallet_exchange - STUUR TERUG',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_exchange' limit 1
  ), 'staat niet op deze database')
union all
select 8, 'VOLLEDIGE body top_up_admin_reject - STUUR TERUG',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'top_up_admin_reject' limit 1
  ), 'staat niet op deze database')
union all
select 9, 'VOLLEDIGE body wallet_admin_adjust (NA de aanpassing hierboven)',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_admin_adjust' limit 1
  ), 'staat niet op deze database')
order by nr;
