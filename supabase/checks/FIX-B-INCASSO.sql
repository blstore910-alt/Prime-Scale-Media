-- =====================================================================
-- FIX-B-INCASSO — de drie die overbleven, plus iets ergers dat ik
--                 onderweg tegenkwam.
-- =====================================================================
-- HOE DRAAI JE DIT
--   Plakken in de Supabase SQL editor en Run. Geen rol wisselen, geen
--   instelling aanzetten: de editor draait als `postgres`, dat is de
--   eigenaar, en row-level security geldt niet voor die rol. Veilig om
--   twee keer te draaien. De LAATSTE query is de rapporttabel — dat is
--   het enige resultaat dat de editor toont, en daar staat per deel in
--   wat er gebeurde.
--
-- WAT DIT DOET, IN HET KORT
--   C1  De incassofunctie stond OPEN voor elke ingelogde gebruiker.
--   C2  Er draaien mogelijk TWEE facturatiemotoren op deze database.
--   B1a De incasso sloeg een gepauzeerde of uitgezette klant niet over.
--   B1b Een oude trigger zette een opgezegd abonnement weer AAN.
--   A9  Het mailadres van de klant in het affiliate-overzicht.
--
-- HOE IK DE GELDFUNCTIES AANPAS
--   Niet door ze over te typen. Ik lees de functie zoals hij NU op deze
--   database staat, vervang er een exact stukje tekst in, en voer het
--   resultaat uit. Alles wat ik niet noem blijft dus letterlijk zoals
--   het was. Vind ik het stukje niet, dan verandert er niets en zegt de
--   rapportregel dat.
-- =====================================================================

set search_path = public;

drop table if exists public._psm_run_log;
create table public._psm_run_log (nr int, deel text, uitkomst text);

create or replace function public._log(p_nr int, p_deel text, p_uit text)
returns void language sql as $logfn$
  insert into public._psm_run_log(nr, deel, uitkomst) values (p_nr, p_deel, p_uit);
$logfn$;


-- == C1 · de incasso stond open voor iedereen =========================
-- subscription_billing_run() is SECURITY DEFINER en controleert vanbinnen
-- NIETS over wie hem aanroept — dat hoeft ook niet, hij hoort alleen door
-- de nachtelijke cron gedraaid te worden, met de service-key.
--
-- Maar Postgres geeft EXECUTE op een nieuwe functie standaard aan PUBLIC,
-- en PostgREST zet elke public-functie op /rest/v1/rpc/<naam>. Dat
-- betekent: elke ingelogde adverteerder kon een POST doen en daarmee de
-- facturatie voor de HELE tenant starten — facturen aanmaken en wallets
-- automatisch laten afschrijven, voor iedereen, zo vaak als hij wilde.
--
-- De cron gebruikt de service-key (app/api/cron/subscription-billing),
-- en service_role gaat langs elke grant heen. Intrekken kan dus zonder
-- dat de nachtelijke run iets merkt.
do $c1$
declare v_done text := '';
begin
  if to_regprocedure('public.subscription_billing_run()') is not null then
    revoke all on function public.subscription_billing_run() from public;
    revoke all on function public.subscription_billing_run() from anon, authenticated;
    v_done := v_done || 'subscription_billing_run dicht. ';
  end if;
  if to_regprocedure('public.process_recurring_subscriptions()') is not null then
    revoke all on function public.process_recurring_subscriptions() from public;
    revoke all on function public.process_recurring_subscriptions() from anon, authenticated;
    v_done := v_done || 'process_recurring_subscriptions dicht. ';
  end if;
  if to_regprocedure('public.invoice_pay_from_wallet(uuid)') is not null then
    -- Deze mag de klant WEL zelf aanroepen ("Nu betalen"), dus alleen
    -- anon eraf.
    revoke all on function public.invoice_pay_from_wallet(uuid) from anon;
    v_done := v_done || 'invoice_pay_from_wallet niet meer voor uitgelogden. ';
  end if;
  perform public._log(1, 'C1 incasso-RPC was voor iedereen aanroepbaar',
    case when v_done = '' then 'OVERGESLAGEN: geen van de functies bestaat'
         else 'GELUKT: ' || v_done end);
exception when others then
  perform public._log(1, 'C1 incasso-RPC was voor iedereen aanroepbaar', 'FOUT: ' || sqlerrm);
end;
$c1$;


-- == C2 · er kunnen twee facturatiemotoren draaien ====================
-- process_recurring_subscriptions() is de oude motor. Hij staat in geen
-- enkele migratie en geen regel code in de app roept hem aan — hij is met
-- de hand in de SQL-editor gemaakt, van voor de herbouw. Hij verschilt op
-- drie manieren van de nieuwe:
--   * hij schuift next_payment_date vooruit ZONDER dat er betaald is;
--   * zijn facturen krijgen geen period_start, geen due_date en geen
--     currency — de nieuwe incasso raakt ze daardoor nooit aan, dus ze
--     blijven eeuwig open staan en blokkeren de klant;
--   * hij kent de kortingen en vrijstellingen niet.
-- Draaien ze allebei, dan krijgt een klant elke maand TWEE facturen.
--
-- Staat hij op pg_cron, dan halen we hem van de planning. De functie zelf
-- blijft staan, en de rapportregel bevat het commando om hem terug te
-- zetten als je hem toch nodig blijkt te hebben.
do $c2$
declare r record; v_found text := '';
begin
  if to_regclass('cron.job') is null then
    perform public._log(2, 'C2 tweede facturatiemotor',
      'AL GOED: pg_cron staat niet aan op deze database, dus de oude motor kan niet vanzelf draaien');
    return;
  end if;
  for r in execute
    'select jobid, jobname, schedule, command from cron.job where command ilike ''%process_recurring_subscriptions%'''
  loop
    execute format('select cron.unschedule(%L)', coalesce(r.jobname, r.jobid::text));
    v_found := v_found || format(
      'job %s (%s, "%s") van de planning gehaald. Terugzetten: select cron.schedule(%L, %L, %L); ',
      r.jobid, r.jobname, r.schedule,
      coalesce(r.jobname, 'oude-facturatie'), r.schedule, r.command);
  end loop;
  perform public._log(2, 'C2 tweede facturatiemotor',
    case when v_found = '' then 'AL GOED: de oude motor stond niet op de planning'
         else 'GELUKT: ' || v_found end);
exception when others then
  perform public._log(2, 'C2 tweede facturatiemotor', 'FOUT: ' || sqlerrm);
end;
$c2$;


-- == B1a · incasso slaat een uitgezette klant niet over ===============
-- De tweede lus van subscription_billing_run schrijft openstaande
-- facturen automatisch van de wallet af. Hij sloeg 'cancelled' en
-- 'inactive' over, maar NIET 'paused' — en keek helemaal niet naar de
-- klant zelf. Een adverteerder die je hebt uitgezet werd dus 's nachts
-- gewoon afgeschreven.
do $b1a$
declare
  v_def  text;
  v_new  text;
  v_zoek text := 'and s.status not in (''cancelled'', ''inactive'')';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscription_billing_run'
     and p.prokind = 'f';
  if v_def is null then
    perform public._log(3, 'B1a incasso slaat uitgezette klant over',
      'OVERGESLAGEN: subscription_billing_run bestaat niet');
    return;
  end if;
  if position(v_zoek in v_def) = 0 then
    perform public._log(3, 'B1a incasso slaat uitgezette klant over',
      'OVERGESLAGEN: de regel die ik zocht staat er niet (meer) in — misschien al gedaan');
    return;
  end if;

  v_new := replace(v_def, v_zoek,
    $rep1$and s.status not in ('cancelled', 'inactive', 'paused')
       -- Een uitgezette klant incasseer je niet. is_active en status
       -- worden allebei gebruikt om iemand uit te zetten, dus allebei.
       and not exists (
         select 1 from public.user_profiles up
          where up.user_id = a.user_id
            and up.tenant_id = i.tenant_id
            and (coalesce(up.is_active, true) = false
                 or coalesce(up.status, 'active') = 'inactive')
       )$rep1$);

  execute v_new;
  perform public._log(3, 'B1a incasso slaat uitgezette klant over',
    'GELUKT: paused erbij, en een uitgezet profiel wordt overgeslagen');
exception when others then
  perform public._log(3, 'B1a incasso slaat uitgezette klant over', 'FOUT: ' || sqlerrm);
end;
$b1a$;


-- == B1b · een oude trigger zette een opzegging weer aan ==============
-- Er staan twee triggerfuncties die bij "factuur betaald" het abonnement
-- bijwerken. De nieuwe, _on_subscription_invoice_paid, doet het goed:
--   set status = case when status in ('cancelled','inactive')
--                     then status else 'active' end
-- De oude, handle_invoice_payment_update, doet het zonder enige rem:
--   UPDATE subscriptions SET status = 'active' WHERE id = ...
-- Betaalt iemand een oude openstaande factuur van een abonnement dat je
-- hebt opgezegd, dan staat dat abonnement daarna weer aan — en loopt de
-- maandelijkse facturatie vrolijk door.
--
-- Ik haal de trigger niet weg (ik weet niet welke oude facturen er nog
-- aan hangen); ik zet er dezelfde rem in als de nieuwe heeft.
do $b1b$
declare
  v_def  text;
  v_new  text;
  v_zoek text := 'SET status = ''active''';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handle_invoice_payment_update'
     and p.prokind = 'f';
  if v_def is null then
    perform public._log(4, 'B1b oude trigger zette opzegging weer aan',
      'AL GOED: handle_invoice_payment_update bestaat niet (meer)');
    return;
  end if;
  if position(v_zoek in v_def) = 0 then
    perform public._log(4, 'B1b oude trigger zette opzegging weer aan',
      'OVERGESLAGEN: de regel die ik zocht staat er niet (meer) in — misschien al gedaan');
    return;
  end if;

  v_new := replace(v_def, v_zoek,
    $rep2$SET status = CASE WHEN status IN ('cancelled','inactive')
                          THEN status ELSE 'active' END$rep2$);

  execute v_new;
  perform public._log(4, 'B1b oude trigger zette opzegging weer aan',
    'GELUKT: een opgezegd of uitgezet abonnement blijft nu uit');
exception when others then
  perform public._log(4, 'B1b oude trigger zette opzegging weer aan', 'FOUT: ' || sqlerrm);
end;
$b1b$;


-- == A9 · het mailadres van de klant in het affiliate-overzicht =======
-- affiliate_referral_stats geeft de affiliate per aangebrachte klant ook
-- diens volledige e-mailadres. Naam en klantcode staan er al bij, dus het
-- adres voegt niets toe en is wel andermans persoonsgegeven.
--
-- Weghalen kan niet met create or replace: de kolom staat in
-- `returns table(...)` en Postgres laat je het retourtype niet wijzigen —
-- dat is precies waar de vorige poging op stuk liep ("function result
-- type must be specified"). Drop-en-opnieuw-maken zou de functie even
-- weghalen onder een draaiend dashboard en de rechten wissen.
--
-- Dus: de kolom blijft bestaan, maar wordt afgeschermd. b***@gmail.com.
-- De affiliate herkent zijn eigen aanbreng nog, en het adres zelf is weg.
do $a9$
declare
  v_def  text;
  v_new  text;
  v_zoek text := 'd.referred_advertiser_email::text';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_referral_stats'
     and p.prokind = 'f';
  if v_def is null then
    perform public._log(5, 'A9 mailadres in affiliate-overzicht',
      'OVERGESLAGEN: affiliate_referral_stats bestaat niet');
    return;
  end if;
  if position(v_zoek in v_def) = 0 then
    perform public._log(5, 'A9 mailadres in affiliate-overzicht',
      'OVERGESLAGEN: de kolom staat er niet zo in — misschien al gedaan');
    return;
  end if;

  -- replace() doet een pas en leest z'n eigen uitvoer niet opnieuw, dus
  -- dat de vervanging het zoekstuk zelf bevat is geen probleem.
  v_new := replace(v_def, v_zoek,
    $rep3$regexp_replace(d.referred_advertiser_email::text, '^(.)[^@]*@', '\1***@')$rep3$);

  execute v_new;
  perform public._log(5, 'A9 mailadres in affiliate-overzicht',
    'GELUKT: de affiliate ziet nu b***@domein.nl in plaats van het hele adres');
exception when others then
  perform public._log(5, 'A9 mailadres in affiliate-overzicht', 'FOUT: ' || sqlerrm);
end;
$a9$;


-- == INFO · wat hangt er aan invoices =================================
-- Geen wijziging, alleen zodat ik het zie.
do $info$
declare r record; v text := '';
begin
  for r in
    select t.tgname, p.proname
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'invoices' and not t.tgisinternal
     order by t.tgname
  loop
    v := v || r.tgname || ' -> ' || r.proname || '; ';
  end loop;
  perform public._log(6, 'INFO triggers op invoices',
    case when v = '' then 'geen' else v end);
end;
$info$;


-- == HET RAPPORT ======================================================
select nr as "#", deel as "wat", uitkomst as "resultaat"
  from public._psm_run_log
 order by nr;
