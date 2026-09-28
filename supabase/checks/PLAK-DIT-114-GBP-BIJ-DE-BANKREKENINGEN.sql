-- ════════════════════════════════════════════════════════════════════
-- PLAK 114 — GBP mag ook een bankrekening hebben
-- ════════════════════════════════════════════════════════════════════
--
-- Gelopen op productie, 28-09, met de nieuwe klant PSM0016: de
-- opwaardeerdialoog biedt vier overboekvaluta aan en GBP is er een van.
-- Het scherm laat dan netjes de Wise UK-rekening van TURLIT zien --
-- sort code 60-84-64, IBAN GB69TRWI60846445402484.
--
-- Maar die gegevens komen uit lib/bank-beneficiaries.ts, de INGEBOUWDE
-- lijst die alleen met een deploy verandert. Het Banken-scherm in
-- Settings kon er geen rij voor maken: de kolomcontrole op
-- bank_accounts staat alleen EUR, USD en HKD toe.
--
-- Dat is precies de belofte die dat scherm vetgedrukt doet -- "wat je
-- hier opslaat vervangt de ingebouwde begunstigde op het overboekscherm
-- van de klant" -- en voor GBP kon hij die niet waarmaken. Verandert de
-- Britse rekening ooit, dan blijft de klant de oude zien tot er iemand
-- een deploy doet.
--
-- De app-kant is al aangepast (BANK_ACCOUNT_CURRENCIES). Dit is de
-- databasekant; zonder deze plak levert de keuze GBP in Settings een
-- foutmelding op bij opslaan.
--
-- HET VERANDERT VERDER NIETS. Een valuta zonder rij valt gewoon terug
-- op de ingebouwde gegevens, wat vandaag ook al gebeurt. Er wordt geen
-- enkele bestaande rij aangeraakt.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak114 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak114;

do $blk0$
declare
  v_oud text;
  v_con text;
begin
  select substring(pg_get_constraintdef(oid) from 1 for 200)
    into v_oud
    from pg_constraint
   where conrelid = 'public.bank_accounts'::regclass
     and conname = 'bank_accounts_currency_check';

  select conname into v_con
    from pg_constraint
   where conrelid = 'public.bank_accounts'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%currency%'
   limit 1;

  if v_con is not null then
    execute format(
      'alter table public.bank_accounts drop constraint %I', v_con);
  end if;

  alter table public.bank_accounts
    add constraint bank_accounts_currency_check
    check (currency in ('EUR', 'USD', 'HKD', 'GBP'));

  insert into _plak114 values (0, 'valuta op bank_accounts',
    'was: ' || coalesce(v_oud, 'geen') || ' | nu ook GBP');
exception when others then
  insert into _plak114 values (0, 'valuta op bank_accounts',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle ────────────────────────────────────────────────────────
do $blk1$
declare
  v_def text;
  v_rij text;
begin
  select substring(pg_get_constraintdef(oid) from 1 for 200)
    into v_def
    from pg_constraint
   where conrelid = 'public.bank_accounts'::regclass
     and conname = 'bank_accounts_currency_check';

  select coalesce(string_agg(currency || ': ' || n::text, ', ' order by currency), 'geen')
    into v_rij
    from (select currency, count(*) as n from public.bank_accounts group by 1) x;

  insert into _plak114 values (1, 'stand van zaken',
    'controle: ' || coalesce(v_def, 'GEEN') || ' | rijen per valuta: ' || v_rij);
exception when others then
  insert into _plak114 values (1, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak114 order by n;
