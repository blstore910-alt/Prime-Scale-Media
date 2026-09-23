-- ════════════════════════════════════════════════════════════════════
-- PLAK 84 — de commissiekolommen die nog in `real` staan
-- ════════════════════════════════════════════════════════════════════
--
-- MIJN FOUT IN PLAK 82, EN HET IS DE MOEITE WAARD OM TE ONTHOUDEN.
--
-- Blok 1 van plak 82 deed twee ALTERs achter elkaar in één DO-blok:
-- eerst `advertisers`, toen `referral_links`. De tweede liep stuk op een
-- view (0A000) en de `exception when others` ving dat op. Het rapport
-- zei toen "advertisers ok" — want dat was de waarde van de variabele op
-- dat moment.
--
-- Maar een DO-blok is één eenheid: zodra de handler aanslaat, wordt
-- ALLES teruggedraaid wat dat blok heeft gedaan. De advertisers-ALTER
-- was dus ook weg. Het rapport vertelde wat de code had geprobeerd, niet
-- wat er in de database stond.
--
-- Dus hier: elke ALTER in zijn EIGEN blok, en het rapport aan het eind
-- leest `information_schema` in plaats van een teller.
--
-- Wat er nog om moet:
--   advertisers.commission_monthly / _onetime / _pct
--   invitations.commission_rate
--
-- Waarom: `select 12345.67::real` geeft 12345.7 en `99999.99::real`
-- geeft 100000. Het commissievenster biedt step="0.01" aan en leest de
-- kolom rechtstreeks terug, dus je typt een bedrag, slaat op, doet hem
-- open en er staat iets anders.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak84 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak84;

-- ── 1. advertisers.commission_monthly ────────────────────────────────
do $blk0$
begin
  alter table public.advertisers
    alter column commission_monthly type numeric(14,2)
      using round(commission_monthly::numeric, 2);
  insert into _plak84 values (1, 'advertisers.commission_monthly', 'omgezet');
exception when others then
  insert into _plak84 values (1, 'advertisers.commission_monthly',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. advertisers.commission_onetime ────────────────────────────────
do $blk1$
begin
  alter table public.advertisers
    alter column commission_onetime type numeric(14,2)
      using round(commission_onetime::numeric, 2);
  insert into _plak84 values (2, 'advertisers.commission_onetime', 'omgezet');
exception when others then
  insert into _plak84 values (2, 'advertisers.commission_onetime',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. advertisers.commission_pct ────────────────────────────────────
do $blk2$
begin
  alter table public.advertisers
    alter column commission_pct type numeric(6,3)
      using round(commission_pct::numeric, 3);
  insert into _plak84 values (3, 'advertisers.commission_pct', 'omgezet');
exception when others then
  insert into _plak84 values (3, 'advertisers.commission_pct',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 4. invitations.commission_rate ───────────────────────────────────
--
-- Dezelfde kolom, één stap eerder in de reis: dit is het percentage dat
-- op de UITNODIGING staat en straks op de koppeling belandt.
do $blk3$
begin
  alter table public.invitations
    alter column commission_rate type numeric(6,3)
      using round(commission_rate::numeric, 3);
  insert into _plak84 values (4, 'invitations.commission_rate', 'omgezet');
exception when others then
  insert into _plak84 values (4, 'invitations.commission_rate',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── controle: uit de database, niet uit een teller ───────────────────
do $blk4$
declare
  v_rest text;
  v_n    integer;
begin
  select count(*),
         coalesce(string_agg(table_name || '.' || column_name, ', '
                             order by table_name, column_name), 'geen')
    into v_n, v_rest
    from information_schema.columns
   where table_schema = 'public'
     and (column_name like 'commission%' or column_name like '%_pct')
     and data_type = 'real';

  insert into _plak84 values (
    5, 'nog in real (uit information_schema)',
    v_n || ': ' || v_rest);
exception when others then
  insert into _plak84 values (5, 'nog in real', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- Wat de kolommen NU zijn, zwart op wit.
do $blk5$
declare
  v text;
begin
  select coalesce(string_agg(
           table_name || '.' || column_name || ' = ' ||
           case when numeric_precision is null then data_type
                else data_type || '(' || numeric_precision || ',' ||
                     coalesce(numeric_scale, 0) || ')' end,
           ' | ' order by table_name, column_name), 'geen')
    into v
    from information_schema.columns
   where table_schema = 'public'
     and table_name in ('advertisers', 'referral_links', 'invitations')
     and (column_name like 'commission%');

  insert into _plak84 values (6, 'zoals ze nu staan', v);
exception when others then
  insert into _plak84 values (6, 'zoals ze nu staan', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak84 order by n;
