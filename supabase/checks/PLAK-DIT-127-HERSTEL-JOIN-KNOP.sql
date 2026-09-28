-- ════════════════════════════════════════════════════════════════════
-- PLAK 127 — DRINGEND: de Join-knop is stuk, en dat is mijn fout
-- ════════════════════════════════════════════════════════════════════
--
-- PLAK DEZE METEEN. Zolang hij niet gedraaid is kan geen enkele
-- adverteerder zich aanmelden voor het affiliateprogramma; hij krijgt
-- "We couldn't send your application just now. Try again shortly."
--
-- WAT ER GEBEURD IS
--
-- Plak 124 zou het besluit van de eigenaar laten staan bij opnieuw
-- aanvragen. In dat blok stonden per ongeluk TWEE
-- `execute regexp_replace(...)` achter elkaar: een eerste poging die
-- naar een variabele `v_adv_keep` verwijst die niet bestaat, en
-- daaronder de verbeterde versie. De eerste liep, de tweede vond zijn
-- patroon daarna niet meer -- dus de kapotte tekst bleef staan.
--
-- Gemeten op de live functie, regel 46 en 54:
--
--   affiliate_decided_at    = v_adv_keep.affiliate_decided_at
--   affiliate_refusal_reason = v_adv_keep.affiliate_refusal_reason
--
-- `v_adv_keep` is nergens gedeclareerd, dus de functie valt om op het
-- moment dat iemand op Join drukt. Gevonden door het gewoon in te
-- drukken als PSM0011, twintig minuten na plak 124.
--
-- WAT DE FIX IS
--
-- De twee toekenningen gaan er helemaal uit. Dat is meteen de
-- eenvoudigste manier om te bereiken wat plak 124 wilde: een kolom die
-- je in een UPDATE niet noemt, blijft staan zoals hij stond. De reden
-- en de datum van een afwijzing blijven dus bewaard, precies zoals
-- bedoeld -- alleen zonder een variabele die er niet is.
--
-- De rest van plak 124 (de views, de policies, de triggerfuncties) is
-- wél goed gegaan en wordt hier niet aangeraakt; dat is nagemeten.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak127 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak127;

do $blk0$
declare
  v_oid  oid;
  v_def  text;
  v_new  text;
  v_pat  text;
  v_args text;
begin
  select p.oid, pg_get_function_identity_arguments(p.oid)
    into v_oid, v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_application_submit'
   limit 1;

  if v_oid is null then
    insert into _plak127 values (0, 'de Join-knop',
      'AFGEBROKEN: affiliate_application_submit bestaat niet');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('v_adv_keep' in v_def) = 0 then
    insert into _plak127 values (0, 'de Join-knop',
      'de kapotte verwijzing stond er niet (meer) -- niets gedaan');
    return;
  end if;

  -- Van de komma na now() tot en met de tweede v_adv_keep-verwijzing,
  -- inclusief de commentaarregels ertussen. Niet-hebberig (.*?), zodat
  -- hij stopt bij de EERSTE afsluiting en niet verder de functie in
  -- loopt. Postgres' regex laat . ook op een regeleinde matchen.
  v_pat := ',[[:space:]]*affiliate_decided_at[[:space:]]*='
        || '[[:space:]]*v_adv_keep\.affiliate_decided_at'
        || '.*?v_adv_keep\.affiliate_refusal_reason';

  if not (v_def ~ v_pat) then
    insert into _plak127 values (0, 'de Join-knop',
      'FOUT: de kapotte tekst is niet herkend -- niets gewijzigd. Stuur me pg_get_functiondef van deze functie.');
    return;
  end if;

  v_new := regexp_replace(v_def, v_pat, '');

  -- Voor de zekerheid: als er nog ergens een v_adv_keep in staat,
  -- niets doen. Liever kapot-zoals-het-was dan half gerepareerd.
  if position('v_adv_keep' in v_new) > 0 then
    insert into _plak127 values (0, 'de Join-knop',
      'FOUT: na de vervanging staat er nog een v_adv_keep -- niets gewijzigd');
    return;
  end if;

  execute v_new;

  execute 'revoke all on function public.affiliate_application_submit('
       || v_args || ') from public, anon';
  execute 'grant execute on function public.affiliate_application_submit('
       || v_args || ') to authenticated, service_role';

  insert into _plak127 values (0, 'de Join-knop',
    'hersteld -- de twee kapotte toekenningen zijn eruit');
exception when others then
  insert into _plak127 values (0, 'de Join-knop',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle ────────────────────────────────────────────────────────
do $blk1$
declare
  v_stuk   integer;
  v_wist   integer;
  v_anon   boolean;
  v_zet    integer;
begin
  select position('v_adv_keep' in pg_get_functiondef(p.oid))
    into v_stuk
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_application_submit';

  -- Wist hij de afwijzing nog? Hoort 0 te zijn: geen enkele
  -- `= null` op die twee kolommen meer.
  select (position('affiliate_decided_at = null' in pg_get_functiondef(p.oid)) > 0)::int
       + (position('affiliate_refusal_reason = null' in pg_get_functiondef(p.oid)) > 0)::int
    into v_wist
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_application_submit';

  -- En zet hij de status nog wel? Dat is waar de hele aanvraag op
  -- hangt; zonder dit verschijnt niets in "Waiting for you".
  select (position('affiliate_status = ''applied''' in pg_get_functiondef(p.oid)) > 0)::int
    into v_zet
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_application_submit';

  select has_function_privilege('anon', p.oid, 'execute')
    into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_application_submit';

  insert into _plak127 values (1, 'stand van zaken',
    'kapotte verwijzing over: ' || coalesce(v_stuk, -1) || ' (moet 0)'
    || ' | wist de afwijzing nog: ' || coalesce(v_wist, -1) || ' (moet 0)'
    || ' | zet de status op applied: ' || coalesce(v_zet, -1) || ' (moet 1)'
    || ' | anon mag uitvoeren: ' || coalesce(v_anon, false)::text || ' (moet false)');
exception when others then
  insert into _plak127 values (1, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak127 order by n;
