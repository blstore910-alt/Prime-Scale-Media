-- ════════════════════════════════════════════════════════════════════
-- PLAK 98 — de super-admin kan de uitbetalingsgrens vrijgeven
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 22-09: "200 usd of 200 eur ondergrens", per overboeking,
-- per valuta. Die regel blijft. De eigenaar, 25-09: "ik wil pas payout
-- vanaf 200 eu, of tenzij admin het vrijgeeft, super admin".
--
-- Dus niet de grens omlaag voor iedereen -- een uitzondering voor EEN
-- affiliate, gezet door een super-admin, met de grens er als getal bij.
-- Leeg blijft 200; 0 betekent geen grens voor deze ene.
--
-- WAAROM DIT TEKSTCHIRURGIE IS EN GEEN HERSCHRIJVING
--
-- affiliate_payout_request_multi is ~190 regels en staat alleen op de
-- live database; plak 53 schreef hem, latere plakken hebben eraan
-- gezeten. Hem hier opnieuw uitschrijven betekent een kopie van vandaag
-- vastzetten en alles wat er sinds 53 bij kwam stilletjes terugdraaien.
-- Dus: lees de definitie die er NU staat, vervang vijf stukjes, en zet
-- die terug. Elke vervanging wordt geteld; klopt een telling niet, dan
-- wordt er NIETS uitgevoerd en zegt het rapport welke het was.
--
-- pg_get_functiondef geeft op deze database CRLF terug, dus elke
-- vervanging grijpt BINNEN een regel aan en nooit over een regeleinde.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak98 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak98;

-- ── 1. de kolom ──────────────────────────────────────────────────────
do $blk0$
begin
  alter table public.advertisers
    add column if not exists payout_min_override numeric(14,2);
  insert into _plak98 values (0, 'kolom payout_min_override', 'staat er');
exception when others then
  insert into _plak98 values (0, 'kolom payout_min_override',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

do $blk1$
begin
  comment on column public.advertisers.payout_min_override is
    'Alleen een super-admin zet dit. Leeg = de staande ondergrens van 200 per valuta per overboeking; 0 = geen ondergrens voor deze affiliate.';
  insert into _plak98 values (1, 'toelichting op de kolom', 'gezet');
exception when others then
  insert into _plak98 values (1, 'toelichting op de kolom',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 2. de RPC, stukje voor stukje ────────────────────────────────────
do $blk2$
declare
  v_src  text;
  v_new  text;
  v_step text;
  v_prev text;
  v_done text := '';
  v_nl   text := chr(13) || chr(10);
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'affiliate_payout_request_multi'
   limit 1;

  if v_src is null then
    insert into _plak98 values (2, 'de RPC aanpassen',
      'affiliate_payout_request_multi bestaat niet - overgeslagen');
    return;
  end if;

  if position('payout_min_override' in v_src) > 0 then
    insert into _plak98 values (2, 'de RPC aanpassen',
      'stond er al - niets gedaan');
    return;
  end if;

  v_new := v_src;

  -- (a) een variabele voor de grens van DEZE affiliate
  v_step := 'declaratie v_min';
  v_prev := v_new;
  v_new := replace(v_new,
    'v_recv_usd numeric(14,2) := 0;',
    'v_recv_usd numeric(14,2) := 0;' || v_nl ||
    '  v_min numeric(14,2) := 200;');
  if v_new = v_prev then raise exception '%', v_step; end if;
  v_done := v_done || v_step || ' ok | ';

  -- (b) hem opzoeken, vlak voor de eerste controle
  v_step := 'opzoeken van de uitzondering';
  v_prev := v_new;
  v_new := replace(v_new,
    'if v_recv_eur > 0 and v_recv_eur < 200 then',
    '-- Een super-admin kan de grens voor een affiliate vrijgeven.' || v_nl ||
    '  -- Leeg blijft 200; 0 betekent geen grens voor deze ene.' || v_nl ||
    '  select coalesce(a.payout_min_override, 200) into v_min' || v_nl ||
    '    from public.advertisers a where a.id = v_aff;' || v_nl ||
    '  v_min := coalesce(v_min, 200);' || v_nl ||
    '  if v_recv_eur > 0 and v_recv_eur < v_min then');
  if v_new = v_prev then raise exception '%', v_step; end if;
  v_done := v_done || v_step || ' ok | ';

  -- (c) de dollarcontrole
  v_step := 'de dollargrens';
  v_prev := v_new;
  v_new := replace(v_new,
    'if v_recv_usd > 0 and v_recv_usd < 200 then',
    'if v_recv_usd > 0 and v_recv_usd < v_min then');
  if v_new = v_prev then raise exception '%', v_step; end if;
  v_done := v_done || v_step || ' ok | ';

  -- (d) en de twee foutmeldingen, zodat er geen 200 in staat als de
  --     grens iets anders is. Een verkeerd getal in een foutmelding is
  --     precies wat een klant doorbelt.
  v_step := 'de euromelding';
  v_prev := v_new;
  v_new := replace(v_new,
    'A payout starts at EUR 200 ',
    'A payout starts at EUR ' || chr(39) ||
    ' || to_char(v_min, ' || chr(39) || 'FM999G999G990D00' || chr(39) ||
    ') || ' || chr(39) || ' ');
  if v_new = v_prev then raise exception '%', v_step; end if;
  v_done := v_done || v_step || ' ok | ';

  v_step := 'de dollarmelding';
  v_prev := v_new;
  v_new := replace(v_new,
    'A payout starts at USD 200 ',
    'A payout starts at USD ' || chr(39) ||
    ' || to_char(v_min, ' || chr(39) || 'FM999G999G990D00' || chr(39) ||
    ') || ' || chr(39) || ' ');
  if v_new = v_prev then raise exception '%', v_step; end if;
  v_done := v_done || v_step || ' ok';

  execute v_new;

  insert into _plak98 values (2, 'de RPC aanpassen', v_done);
exception when others then
  insert into _plak98 values (2, 'de RPC aanpassen',
    'NIETS UITGEVOERD - ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 3. de rechten ────────────────────────────────────────────────────
--     Hoort in hetzelfde blok als de create; staat hier los omdat blok 2
--     kan besluiten niets te doen. Draai hem altijd: een create or
--     replace geeft EXECUTE terug aan PUBLIC, en PUBLIC is inclusief
--     anon -- de rol achter de publishable key.
do $blk3$
declare
  v_sig text;
begin
  select 'public.' || p.proname || '(' ||
         pg_get_function_identity_arguments(p.oid) || ')'
    into v_sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'affiliate_payout_request_multi'
   limit 1;

  if v_sig is null then
    insert into _plak98 values (3, 'rechten', 'functie bestaat niet');
    return;
  end if;

  execute 'revoke all on function ' || v_sig || ' from public, anon';
  execute 'grant execute on function ' || v_sig ||
          ' to authenticated, service_role';
  insert into _plak98 values (3, 'rechten',
    'anon eraf, authenticated + service_role erop (' || v_sig || ')');
exception when others then
  insert into _plak98 values (3, 'rechten',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── controle ─────────────────────────────────────────────────────────
do $blk4$
declare
  v_col  integer;
  v_min  integer;
  v_200  integer;
  v_anon integer;
begin
  select count(*) into v_col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'advertisers'
     and column_name = 'payout_min_override';

  select count(*) into v_min
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_request_multi'
     and pg_get_functiondef(p.oid) like '%payout_min_override%';

  -- Geen kale 200 meer in een vergelijking.
  select count(*) into v_200
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_request_multi'
     and pg_get_functiondef(p.oid) like '%< 200 then%';

  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_request_multi'
     and has_function_privilege('anon', p.oid, 'execute');

  insert into _plak98 values (4, 'stand van zaken',
    'kolom: ' || v_col || '/1 | RPC leest de uitzondering: ' || v_min ||
    '/1 | harde 200 in een vergelijking: ' || v_200 ||
    ' (moet 0) | anon mag hem: ' || v_anon || ' (moet 0)');
exception when others then
  insert into _plak98 values (4, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ── wie er vandaag een uitzondering heeft ────────────────────────────
do $blk5$
declare
  v text;
begin
  select coalesce(string_agg(
           coalesce(a.tenant_client_code, '?') || ' -> ' ||
           to_char(a.payout_min_override, 'FM999G999G990D00'), ' | '),
         'niemand - iedereen staat op de staande 200')
    into v
    from public.advertisers a
   where a.payout_min_override is not null;
  insert into _plak98 values (5, 'uitzonderingen', v);
exception when others then
  insert into _plak98 values (5, 'uitzonderingen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak98 order by n;
