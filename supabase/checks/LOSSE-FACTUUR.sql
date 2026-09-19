-- =====================================================================
-- LOSSE-FACTUUR — de ene factuur die niemand ooit kan betalen.
-- =====================================================================
-- HOE DRAAI JE DIT
--   Plakken in de Supabase SQL editor en Run. Geen rol wisselen, geen
--   instelling aanzetten: de editor draait als `postgres`, dat is de
--   eigenaar, en RLS geldt niet voor die rol. Veilig om twee keer te
--   draaien. De LAATSTE query is het rapport — dat is het enige wat de
--   editor toont.
--
-- WAT ER AAN DE HAND IS
--   WAT-STAAT-ER-ECHT gaf: 1 openstaande abonnementsfactuur zonder
--   period_start of zonder due_date, en 1 klant die daardoor vastzit.
--
--   Die factuur komt van de oude facturatiemotor
--   (process_recurring_subscriptions), die vannacht van de planning is
--   gehaald. Hij schreef facturen zonder period_start, zonder due_date
--   en zonder currency. De huidige incasso vereist die drie alle drie,
--   dus die factuur wordt NOOIT automatisch afgeschreven. Hij blijft
--   eeuwig open staan — en een openstaande factuur blokkeert de klant:
--   geen nieuwe maandfactuur, en de minimum-storting springt aan.
--
-- WAT DIT DOET, EN WAAROM JUIST DAT
--   Hij wordt op 'void' gezet, niet gerepareerd.
--
--   Repareren betekent period_start en due_date erin zetten, en dan
--   schrijft de incasso hem over zeven dagen van de wallet af. Maar deze
--   factuur is vrijwel zeker een DUBBELE: de oude motor factureerde om
--   02:00 en de nieuwe om 03:00, allebei op dezelfde vervaldatum. Geld
--   afschrijven voor een maand die al gefactureerd is, is het enige wat
--   echt niet mag.
--
--   Void kan dat niet. En het is niet het einde: void maakt de
--   unieke-periode-index vrij, dus als die maand écht nooit gefactureerd
--   is, maakt de nachtelijke run vannacht gewoon een nieuwe, correcte
--   factuur aan — mét period_start, due_date en valuta. Dezelfde aanpak
--   als migratie 20260917220000, die precies dit al een keer deed.
--
--   Het rapport hieronder zet het factuurnummer, de klant, het bedrag en
--   de datum erbij, zodat je kunt nakijken wat er weg is en het met een
--   regel kunt terugdraaien als je het er niet mee eens bent.
-- =====================================================================

set search_path = public;

drop table if exists public._psm_run_log;
create table public._psm_run_log (nr int, deel text, uitkomst text);

create or replace function public._log(p_nr int, p_deel text, p_uit text)
returns void language sql as $logfn$
  insert into public._psm_run_log(nr, deel, uitkomst) values (p_nr, p_deel, p_uit);
$logfn$;


-- ── 1 · wat er precies weg gaat, vóórdat het weg gaat ────────────────
do $d1$
declare r record; v text := '';
begin
  for r in
    select i.id, i.number, i.total, i.currency, i.created_at::date as gemaakt,
           i.period_start, i.due_date,
           coalesce(up.full_name, up.email, a.id::text) as klant
      from public.invoices i
      left join public.advertisers a on a.id = i.advertiser_id
      left join public.user_profiles up on up.user_id = a.user_id
     where i.type = 'subscription'
       and i.status = 'unpaid'
       and (i.period_start is null or i.due_date is null)
     order by i.created_at
  loop
    v := v || format('%s · %s · %s %s · gemaakt %s · klant %s. ',
                     coalesce(r.number, r.id::text),
                     case when r.period_start is null
                          then 'geen periode' else 'geen vervaldatum' end,
                     upper(coalesce(r.currency, 'EUR')), r.total::text,
                     r.gemaakt, coalesce(r.klant, 'onbekend'));
  end loop;
  perform public._log(1, 'Wat er weg gaat',
    case when v = '' then 'niets — er is geen losse factuur (meer)' else v end);
end;
$d1$;


-- ── 2 · op void zetten ───────────────────────────────────────────────
do $d2$
declare v_n int;
begin
  -- NOTE: invoices heeft geen updated_at. Zie 20260901440000 — dat er
  -- toch een wegschrijven is wat een eerdere RPC op elke echte factuur
  -- liet vastlopen.
  update public.invoices
     set status = 'void'
   where type = 'subscription'
     and status = 'unpaid'
     and (period_start is null or due_date is null);
  get diagnostics v_n = row_count;
  perform public._log(2, 'Op void gezet',
    case when v_n = 0 then 'AL GOED: er stond er geen meer open'
         else format('GELUKT: %s factuur/facturen. Terugdraaien kan met: '
                     'update public.invoices set status = ''unpaid'' where id = ''<id uit regel 1>'';',
                     v_n) end);
exception when others then
  perform public._log(2, 'Op void gezet', 'FOUT: ' || sqlerrm);
end;
$d2$;


-- ── 3 · wie maakt eigenlijk die wallet_topup-factuur ─────────────────
-- Er staat er precies één op live, en in de hele repo schrijft niets dat
-- type weg. Dus of er is een trigger die niet in de migraties staat, of
-- hij is met de hand gemaakt. Ik moet weten welke van de twee, want in
-- het eerste geval is er live-only logica die ik nog niet gezien heb.
do $d3$
declare r record; v text := '';
begin
  for r in
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.prosrc ilike '%wallet_topup%'
       and p.prosrc ilike '%insert into%invoices%'
  loop
    v := v || r.proname || '; ';
  end loop;
  perform public._log(3, 'Wie maakt de wallet_topup-factuur',
    case when v = '' then 'GEEN FUNCTIE — die ene factuur is dus met de hand gemaakt, er is geen automatiek'
         else 'functie(s): ' || v end);
end;
$d3$;


-- ── 4 · en welke triggers hangen er aan wallet_topups ────────────────
do $d4$
declare r record; v text := '';
begin
  for r in
    select t.tgname, p.proname
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'wallet_topups'
       and not t.tgisinternal
     order by t.tgname
  loop
    v := v || r.tgname || ' -> ' || r.proname || '; ';
  end loop;
  perform public._log(4, 'INFO triggers op wallet_topups',
    case when v = '' then 'geen' else v end);
end;
$d4$;


-- ── HET RAPPORT ──────────────────────────────────────────────────────
select nr as "#", deel as "wat", uitkomst as "resultaat"
  from public._psm_run_log
 order by nr;
