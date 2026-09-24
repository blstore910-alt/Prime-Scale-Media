-- ════════════════════════════════════════════════════════════════════
-- PLAK 91 — haal mijn testregel uit het bankboek
-- ════════════════════════════════════════════════════════════════════
--
-- Om te bewijzen dat het pondprobleem echt weg is heb ik er één regel in
-- gezet, op productie, als eigenaar:
--
--   Our bank · GBP · deposit · 100,00 · bijgeschreven EUR 115,00
--   note: "TEST van Claude - mag weg, plak 91 haalt hem weg"
--
-- Dat werkte precies zoals het hoort: de GBP-kaart verscheen op 100,00,
-- "Received" bij EUR sprong naar 115,00 en het gat werd 550,00 -- en dat
-- staat allemaal zo in de database. Vóór plak 89 kon die storting
-- nergens worden opgeschreven.
--
-- Maar het is geen echte storting, en er hoort niets in dat boek te
-- staan wat niet op een afschrift staat. Deze plak haalt precies die ene
-- regel weg -- op de tekst van de notitie, dus hij kan niets anders
-- raken -- en laat zien wat er daarna nog staat.
--
-- Wil je hem laten staan tot je zelf gekeken hebt: dan plak je dit
-- gewoon later. Er hangt niets van af.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak91 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak91;

do $blk0$
declare
  v_weg integer;
begin
  with verwijderd as (
    delete from public.bank_ledger_entries
     where note = 'TEST van Claude - mag weg, plak 91 haalt hem weg'
       and currency = 'GBP'
       and amount = 100.00
    returning 1
  )
  select count(*) into v_weg from verwijderd;

  insert into _plak91 values (0, 'testregel weghalen',
    v_weg || ' regel(s) weg');
exception when others then
  insert into _plak91 values (0, 'testregel weghalen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

do $blk1$
declare
  v text;
  v_n integer;
begin
  select count(*) into v_n from public.bank_ledger_entries;

  select coalesce(string_agg(x.r, ' | '), 'leeg')
    into v
    from (
      select e.destination || ' ' || e.currency || ' ' || e.direction || ' ' ||
             to_char(e.amount, 'FM999999990.00') as r
        from public.bank_ledger_entries e
       order by e.created_at desc
       limit 10
    ) x;

  insert into _plak91 values (1, 'bankboek nu',
    v_n || ' regel(s): ' || v);
exception when others then
  insert into _plak91 values (1, 'bankboek nu', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak91 order by n;
