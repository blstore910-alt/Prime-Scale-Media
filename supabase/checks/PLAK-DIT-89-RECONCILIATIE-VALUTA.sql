-- ════════════════════════════════════════════════════════════════════
-- PLAK 89 — de reconciliatie kon een pond of een HK-dollar niet eens
--            opschrijven, en de audit-filter kende 17 van de 35 tabellen
-- ════════════════════════════════════════════════════════════════════
--
-- 1. VALUTA IN HET BANKBOEK
--
-- De opwaardeer-dialoog laat een klant in VIER valuta betalen: USD, EUR,
-- GBP en HKD. TURLIT houdt daar echte rekeningen voor aan (Wise UK,
-- Wise HK/DBS). `bank_ledger_entries.currency` staat er twee toe.
--
-- Dus: klant stuurt GBP 1.000 naar de pondrekening, de admin schrijft
-- EUR 1.150 in zijn portemonnee bij, en de eigenaar kan die ontvangst
-- NERGENS vastleggen. Op het scherm dat de vraag "klopt alles?"
-- beantwoordt, staat dan voor altijd "Credited EUR 1.150 · Received
-- EUR 0,00 — 1 to investigate". Een alarm dat altijd afgaat is geen
-- alarm meer, en dan valt een echt gat niet meer op.
--
-- Deze plak verbreedt de kolom naar de vier valuta die de app aanbiedt,
-- en voegt twee kolommen toe die de brug slaan:
--
--   credited_currency  EUR of USD — waarin deze storting is bijgeschreven
--   credited_amount    hoeveel dat was
--
-- Alleen de eigenaar weet welke koers de bank gaf, dus die vult het in.
-- Leeg laten mag: dan telt een EUR-storting gewoon als EUR, precies
-- zoals nu.
--
-- 2. DE AUDIT-FILTER
--
-- `AUDITED_TABLES` in components/audit/audit-events-table.tsx is een
-- met de hand bijgehouden lijst van 17 namen. De database heeft op dit
-- moment events op 35 tabellen. De grootste die ontbreekt is
-- `wise_incoming_transfers` met 1.756 rijen: niet te filteren, en dus
-- ook niet weg te filteren wanneer je iets anders zoekt.
--
-- Een lijst die met de hand bijgehouden wordt loopt altijd achter. Deze
-- plak zet er een functie voor neer die de namen uit de data haalt.
-- SECURITY INVOKER, dus RLS blijft gewoon gelden — de eigenaar ziet zijn
-- eigen tenant en niets anders.
--
-- De code die hierbij hoort valt terug op de oude lijst zolang deze plak
-- niet gedraaid is, dus er gaat niets stuk door te wachten.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak89 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak89;

-- ── 1. de valuta-check verbreden ─────────────────────────────────────
--
-- EEN ALTER PER BLOK. Een exception-handler draait alles terug wat het
-- blok deed, dus twee wijzigingen in één blok betekent dat de tweede de
-- eerste kan opeten terwijl het rapport "ok" zegt (plak 82 deed dat).
do $blk0$
begin
  alter table public.bank_ledger_entries
    drop constraint if exists bank_ledger_entries_currency_check;
exception when others then
  insert into _plak89 values (0, 'oude valuta-check verwijderen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

do $blk1$
begin
  alter table public.bank_ledger_entries
    add constraint bank_ledger_entries_currency_check
    check (currency in ('USD', 'EUR', 'GBP', 'HKD'));
exception when others then
  insert into _plak89 values (1, 'nieuwe valuta-check plaatsen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 2. waarin is deze storting bijgeschreven ─────────────────────────
do $blk2$
begin
  alter table public.bank_ledger_entries
    add column if not exists credited_currency text;
exception when others then
  insert into _plak89 values (2, 'kolom credited_currency',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

do $blk3$
begin
  alter table public.bank_ledger_entries
    add column if not exists credited_amount numeric(14, 2);
exception when others then
  insert into _plak89 values (3, 'kolom credited_amount',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

do $blk4$
begin
  alter table public.bank_ledger_entries
    drop constraint if exists bank_ledger_credited_check;
exception when others then
  insert into _plak89 values (4, 'oude credited-check verwijderen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- Allebei leeg, of allebei gevuld. Een bedrag zonder valuta is geen
-- bedrag, en een valuta zonder bedrag telt nergens in mee -- allebei
-- zouden hier stilletjes als nul eindigen.
do $blk5$
begin
  alter table public.bank_ledger_entries
    add constraint bank_ledger_credited_check
    check (
      (credited_currency is null and credited_amount is null)
      or (credited_currency in ('USD', 'EUR') and credited_amount >= 0)
    );
exception when others then
  insert into _plak89 values (5, 'nieuwe credited-check plaatsen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- ── 3. de tabelnamen voor de audit-filter ────────────────────────────
--
-- SECURITY INVOKER (de standaard, hier expliciet opgeschreven): RLS op
-- audit_events blijft gelden, dus dit geeft nooit meer terug dan de
-- aanroeper zelf al mag lezen.
do $blk6$
begin
  create or replace function public.audit_table_names()
  returns table (table_name text)
  language sql
  stable
  security invoker
  set search_path = public
  as $fn$
    select distinct ae.table_name
      from public.audit_events ae
     where ae.table_name is not null
     order by 1
  $fn$;

  -- Postgres geeft EXECUTE aan PUBLIC op een nieuwe functie, en PUBLIC
  -- is inclusief anon -- de rol achter de publiceerbare sleutel. Dus
  -- hoort de revoke in hetzelfde blok als de create.
  revoke all on function public.audit_table_names() from public, anon;
  grant execute on function public.audit_table_names() to authenticated, service_role;

  insert into _plak89 values (6, 'functie audit_table_names', 'geplaatst');
exception when others then
  insert into _plak89 values (6, 'functie audit_table_names',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk6$;

-- ── controle: leest de werkelijkheid terug, niet een teller ──────────
do $blk7$
declare
  v_cur    text;
  v_cols   integer;
  v_credck integer;
  v_fn     integer;
  v_anon   integer;
  v_tabs   integer;
begin
  select coalesce(pg_get_constraintdef(c.oid), 'GEEN') into v_cur
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
   where t.relname = 'bank_ledger_entries'
     and c.conname = 'bank_ledger_entries_currency_check';

  select count(*) into v_cols
    from information_schema.columns
   where table_name = 'bank_ledger_entries'
     and column_name in ('credited_currency', 'credited_amount');

  select count(*) into v_credck
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
   where t.relname = 'bank_ledger_entries'
     and c.conname = 'bank_ledger_credited_check';

  select count(*) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'audit_table_names';

  select count(*) into v_anon
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'audit_table_names'
     and has_function_privilege('anon', p.oid, 'execute');

  select count(distinct ae.table_name) into v_tabs from public.audit_events ae;

  insert into _plak89 values (7, 'stand van zaken',
    'valuta-check: ' || v_cur ||
    ' | nieuwe kolommen: ' || v_cols || '/2' ||
    ' | credited-check: ' || v_credck || '/1' ||
    ' | functie: ' || v_fn || '/1, anon mag hem: ' || v_anon ||
    ' (moet 0) | tabellen met events: ' || v_tabs);
exception when others then
  insert into _plak89 values (7, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk7$;

-- ── en wat er nu in het bankboek staat ───────────────────────────────
do $blk8$
declare
  v text;
begin
  select coalesce(string_agg(x.r, ' | '), 'het bankboek is leeg')
    into v
    from (
      select e.currency || ' ' || e.direction || ' ' ||
             to_char(sum(e.amount), 'FM999999990.00') ||
             ' (' || count(*) || ')' as r
        from public.bank_ledger_entries e
       group by e.currency, e.direction
       order by 1
    ) x;
  insert into _plak89 values (8, 'bankboek nu', v);
exception when others then
  insert into _plak89 values (8, 'bankboek nu', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk8$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak89 order by n;
