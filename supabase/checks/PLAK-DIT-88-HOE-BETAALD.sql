-- ════════════════════════════════════════════════════════════════════
-- PLAK 88 — de klant zag EUR 10 uit zijn portemonnee gaan die er nooit
--            uit is gegaan
-- ════════════════════════════════════════════════════════════════════
--
-- GELOPEN OP PRODUCTIE, 24-09. PSM0007's Wallet activity leest, van
-- onder naar boven:
--
--     21 sep  Wallet top-up                +EUR 100,00  Credited
--     21 sep  Funded AA-PSM0007-EU-01       -EUR 50,00  On the account
--     22 sep  Funded AA-PSM0007-EU-01       -EUR 50,00  On the account
--     22 sep  Monthly plan                  -EUR 10,00  Paid
--     24 sep  Returned from an ad account  +EUR 20,00  Credited
--
-- Dat telt op tot EUR 10,00. Het saldo erboven zegt EUR 20,00.
--
-- De audit op `wallets` laat zien wie gelijk heeft: 0 -> 100 -> 50 -> 0,
-- en daarna pas weer beweging op de 24e. Er is op 22 september GEEN
-- tientje uit die portemonnee gegaan. Factuur 130 is om 20:33 aangemaakt
-- als `unpaid` en om 20:34:59 door een PERSOON op `paid` gezet -- een
-- volstrekt legitieme handeling (per bank betaald, kwijtgescholden,
-- verrekend), alleen niet uit de portemonnee.
--
-- En dat is precies wat de app niet kan zien. `invoices` heeft geen
-- kolom die zegt HOE er betaald is, dus het overzicht van de klant zet
-- elke betaalde factuur als afschrijving neer. Wie zijn eigen afschrift
-- optelt komt EUR 10 tekort en kan dat nergens verklaren.
--
-- Deze plak voegt die ene kolom toe en laat de RPC hem vullen:
--
--   invoices.paid_from = 'wallet'  als invoice_pay_from_wallet het deed
--                        null      als iemand hem met de hand omzette
--
-- De code toont een factuur alleen nog als afschrijving wanneer er
-- 'wallet' staat, en zegt er anders bij dat hij buiten de portemonnee
-- om is voldaan. Bestaande rijen worden NIET geraden: die blijven null,
-- en dat is eerlijk -- we weten het niet meer.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak88 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak88;

-- ── 1. de kolom ──────────────────────────────────────────────────────
do $blk0$
begin
  alter table public.invoices
    add column if not exists paid_from text;
  insert into _plak88 values (1, 'invoices.paid_from toevoegen', 'aanwezig');
exception when others then
  insert into _plak88 values (1, 'invoices.paid_from toevoegen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. de RPC zet hem ────────────────────────────────────────────────
--
-- Chirurgie op de levende definitie, door de database zelf, met een
-- controle dat de regel er echt staat. pg_get_functiondef geeft CRLF
-- terug op deze database, dus matchen op [[:space:]].
do $blk1$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoice_pay_from_wallet';

  if v_src is null then
    insert into _plak88 values (2, 'invoice_pay_from_wallet vult paid_from',
      'OVERGESLAGEN: die functie bestaat niet');
    return;
  end if;

  if v_src ~ 'paid_from' then
    insert into _plak88 values (2, 'invoice_pay_from_wallet vult paid_from',
      'stond er al in');
    return;
  end if;

  if v_src !~ 'set[[:space:]]+status[[:space:]]*=[[:space:]]*''paid''[[:space:]]*,[[:space:]]*paid_at[[:space:]]*=[[:space:]]*now\(\)' then
    insert into _plak88 values (2, 'invoice_pay_from_wallet vult paid_from',
      'OVERGESLAGEN: de regel "set status = ''paid'', paid_at = now()" staat er niet zo in — niets veranderd');
    return;
  end if;

  v_new := regexp_replace(
    v_src,
    'set[[:space:]]+status[[:space:]]*=[[:space:]]*''paid''[[:space:]]*,[[:space:]]*paid_at[[:space:]]*=[[:space:]]*now\(\)',
    'set status = ''paid'', paid_at = now(), paid_from = ''wallet''',
    'g');

  execute v_new;

  revoke all on function public.invoice_pay_from_wallet(uuid) from public, anon;
  grant execute on function public.invoice_pay_from_wallet(uuid)
    to authenticated, service_role;

  insert into _plak88 values (2, 'invoice_pay_from_wallet vult paid_from', 'vervangen');
exception when others then
  insert into _plak88 values (2, 'invoice_pay_from_wallet vult paid_from',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── controle ─────────────────────────────────────────────────────────
do $blk2$
declare
  v_col   integer;
  v_inrpc integer;
  v_known integer;
  v_all   integer;
begin
  select count(*) into v_col
    from information_schema.columns
   where table_name = 'invoices' and column_name = 'paid_from';

  select count(*) into v_inrpc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoice_pay_from_wallet'
     and pg_get_functiondef(p.oid) ~ 'paid_from';

  select count(*) filter (where paid_from is not null), count(*)
    into v_known, v_all
    from public.invoices where status = 'paid';

  insert into _plak88 values (
    3, 'stand van zaken',
    v_col || '/1 kolom, ' || v_inrpc || '/1 RPC vult hem, ' ||
    v_known || ' van ' || v_all ||
    ' betaalde facturen weten hoe (de rest is van vóór vandaag en blijft onbekend)');
exception when others then
  insert into _plak88 values (3, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── en de rij die dit aan het licht bracht ───────────────────────────
do $blk3$
declare
  v text;
begin
  select coalesce(string_agg(
           'factuur ' || i.number || ' (' || i.type || ', ' ||
           i.currency || ' ' || i.total || ', ' ||
           coalesce(i.paid_from, 'hoe onbekend') || ')', ' | '), 'geen')
    into v
    from public.invoices i
    join public.advertisers a on a.id = i.advertiser_id
   where a.tenant_client_code = 'PSM0007' and i.status = 'paid';
  insert into _plak88 values (4, 'PSM0007 betaalde facturen', v);
exception when others then
  insert into _plak88 values (4, 'PSM0007 betaalde facturen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak88 order by n;
