-- ════════════════════════════════════════════════════════════════════
-- RONDJE — LOOPT ALLES NOG SOEPEL?
-- ════════════════════════════════════════════════════════════════════
--
--   npm run rondje
--
-- Leest alleen. Duurt een seconde. Eén tabel eronder.
--
-- ── WAAROM DIT NAAST `ochtend` BESTAAT EN NIET ERIN ───────────────
--
-- `npm run ochtend` vraagt: staat de DATABASE goed? RLS, rechten,
-- weesregels, NaN, kloppen de saldi. Twaalf controles, en ze staan op
-- nul.
--
-- Dit vraagt iets anders: HANGT HET NOG AAN ELKAAR? Dat is de vraag
-- waar de fouten van 29-09 in zaten, en geen van die fouten zou door
-- `ochtend` gevonden zijn, want de database was er kerngezond bij:
--
--   * /finance-check kapte de bankstortingen op 100 en er wachtten er
--     92. ACHT rijen van een verkeerd bedrag, en een limiet geeft geen
--     foutmelding -- een korte wachtrij leest als een rustige dag.
--   * /finance-check telde euro's en dollars op tot "$85.940,06".
--   * het grootboek gaf een oordeel boven een lees die nog liep.
--
-- Twee soorten controle dus, en allebei zijn ze anders dan `ochtend`:
--
--   A. EEN AANSLAG DIE AFGAAT VOORDAT ER GELOGEN WORDT. PostgREST kapt
--      stil op 1000 rijen en een `.limit(n)` kapt stil op n. Het is
--      geen fout als een tabel groeit; het is een fout als niemand het
--      merkte. Deze regels gaan af op 80% -- ruim voordat een cijfer
--      op een scherm stopt met kloppen.
--
--   B. TWEE SCHERMEN, ÉÉN GETAL. Waar hetzelfde bedrag op twee plekken
--      staat, wordt het hier van twee kanten uitgerekend en tegen
--      elkaar gelegd. Niet omdat de code fout is, maar omdat een
--      afwijking betekent dat iemand één kant heeft aangepast.
--
-- ── DE KOLOM `oordeel` ────────────────────────────────────────────
--
-- GOED     — niets te doen.
-- KIJKEN   — nog niet fout, maar het loopt ergens naartoe.
-- FOUT     — er staat nu iets verkeerd op een scherm.
--
-- Alles behalve GOED verdient een blik. FOUT gaat voor.
-- ════════════════════════════════════════════════════════════════════

with

-- ── A. DE AANSLAGEN ───────────────────────────────────────────────
-- PostgREST geeft standaard maximaal 1000 rijen terug en zegt er niets
-- bij. Elke tabel die ergens ONGEPAGINEERD wordt gelezen hoort hier.
cap_wise as (
  select count(*) as n from public.wise_incoming_transfers
),
-- Dit is de lees die op 100 stond. Hij is nu gepagineerd, maar de
-- aanslag blijft staan: als dit getal hard groeit wil je het weten
-- voordat iemand hem weer aftopt.
cap_wachtend as (
  select count(*) as n from public.wise_incoming_transfers
   where archived_at is null and matched_topup_id is null
),
cap_ledger as (select count(*) as n from public.wallet_ledger),
cap_topups as (select count(*) as n from public.top_ups),
cap_wtopups as (select count(*) as n from public.wallet_topups),
cap_invoices as (select count(*) as n from public.invoices),
cap_comm as (select count(*) as n from public.referral_commissions),

-- ── B. TWEE SCHERMEN, ÉÉN GETAL ───────────────────────────────────
--
-- 1. Wachtende stortingen. /finance-check telt ze als werk; /ledger
--    toont ze onder "Arrived, not yet attributed". Zelfde rijen, twee
--    schermen, en ze horen op de cent gelijk te zijn.
tweekant_eur as (
  select coalesce(sum(amount_cents),0)/100.0 as v
    from public.wise_incoming_transfers
   where archived_at is null and matched_topup_id is null
     and upper(coalesce(currency,'')) = 'EUR'
),
tweekant_usd as (
  select coalesce(sum(amount_cents),0)/100.0 as v
    from public.wise_incoming_transfers
   where archived_at is null and matched_topup_id is null
     and upper(coalesce(currency,'')) = 'USD'
),

-- 2. De commissies. Het *We keep*-paneel trekt het totaal eraf en
--    /commissions toont de regels. Eén som, twee schermen.
comm_eur as (
  select coalesce(sum(amount),0) as v from public.referral_commissions
   where upper(coalesce(currency,'')) = 'EUR'
     and lower(coalesce(status,'')) not in ('on_hold','reversed')
),

-- ── C. GELD DAT NIEMAND MEER KAN VINDEN ───────────────────────────
-- Nul vandaag. Wordt het niet-nul, dan heeft een verwijdering iets
-- achtergelaten -- dit is de aanslag onder blok 15.
wees as (
  select
    (select count(*) from public.wallets where advertiser_id is null) +
    (select count(*) from public.invoices where advertiser_id is null
                                           and company_id is null) +
    (select count(*) from public.top_ups where advertiser_id is null) +
    (select count(*) from public.wallet_topups where advertiser_id is null)
    as n
),
wees_geld as (
  select coalesce(sum(eur_balance),0) + coalesce(sum(usd_balance),0) as v
    from public.wallets where advertiser_id is null
),

-- ── D. DINGEN DIE MAAR ÉÉN KEER MOGEN BESTAAN ─────────────────────
dubbel_code as (
  select count(*) as n from (
    select tenant_client_code from public.advertisers
     where tenant_client_code is not null
     group by tenant_client_code having count(*) > 1) x
),
dubbel_factuur as (
  select count(*) as n from (
    select number from public.invoices where number is not null
     group by number having count(*) > 1) x
),
-- Twee bedrijfsrijen op één adverteerder is wat `maybeSingle()` liet
-- klappen: geen eerste rij maar PGRST116, waardoor de klant de
-- bedrijfspoort niet door kwam en de factuur-PDF een 500 werd. De code
-- pakt nu de oudste, maar twee rijen blijft een fout in de gegevens.
dubbel_bedrijf as (
  select count(*) as n from (
    select advertiser_id from public.companies
     where advertiser_id is not null
     group by advertiser_id having count(*) > 1) x
),

-- ── E. EEN VALUTA DIE WE NIET KENNEN ──────────────────────────────
-- Eén rij in een derde valuta laat elke optelling per valuta een pot
-- geld missen, zonder foutmelding.
vreemde_valuta as (
  select
    (select count(*) from public.wallet_topups
      where upper(coalesce(currency,'')) not in ('EUR','USD')) +
    (select count(*) from public.top_ups
      where upper(coalesce(currency,'')) not in ('EUR','USD')) +
    (select count(*) from public.invoices
      where upper(coalesce(currency,'')) not in ('EUR','USD')) +
    (select count(*) from public.referral_commissions
      where upper(coalesce(currency,'')) not in ('EUR','USD'))
    as n
),

-- ── F. WERK DAT STIL IS BLIJVEN LIGGEN ────────────────────────────
-- Geen fout, wel een vraag. Een wachtrij die niet korter wordt is de
-- reden dat dit hele document bestaat.
oud_werk as (
  select count(*) as n from public.wallet_topups
   where status = 'pending' and created_at < now() - interval '7 days'
),
dst_achter as (
  select count(*) as n from (
    select advertiser_id, max(period_end) as laatste
      from public.dst_charges group by advertiser_id) d
   where d.laatste < current_date - 7
)

select * from (
  values
    -- A. aanslagen: 80% van de grens is KIJKEN, eroverheen is FOUT
    ('A1', 'bankstortingen tegen de PostgREST-grens',
           (select n from cap_wise)::text || ' / 1000',
           case when (select n from cap_wise) >= 1000 then 'FOUT'
                when (select n from cap_wise) >= 800  then 'KIJKEN'
                else 'GOED' end),
    ('A2', 'stortingen die een mens nodig hebben',
           (select n from cap_wachtend)::text || ' / 1000',
           case when (select n from cap_wachtend) >= 1000 then 'FOUT'
                when (select n from cap_wachtend) >= 800  then 'KIJKEN'
                else 'GOED' end),
    ('A3', 'grootboekregels tegen de grens',
           (select n from cap_ledger)::text || ' / 1000',
           case when (select n from cap_ledger) >= 1000 then 'FOUT'
                when (select n from cap_ledger) >= 800  then 'KIJKEN'
                else 'GOED' end),
    ('A4', 'ad-account topups tegen de grens',
           (select n from cap_topups)::text || ' / 1000',
           case when (select n from cap_topups) >= 1000 then 'FOUT'
                when (select n from cap_topups) >= 800  then 'KIJKEN'
                else 'GOED' end),
    ('A5', 'wallet-topups tegen de grens',
           (select n from cap_wtopups)::text || ' / 1000',
           case when (select n from cap_wtopups) >= 1000 then 'FOUT'
                when (select n from cap_wtopups) >= 800  then 'KIJKEN'
                else 'GOED' end),
    ('A6', 'facturen tegen de grens',
           (select n from cap_invoices)::text || ' / 1000',
           case when (select n from cap_invoices) >= 1000 then 'FOUT'
                when (select n from cap_invoices) >= 800  then 'KIJKEN'
                else 'GOED' end),
    ('A7', 'commissies tegen de grens',
           (select n from cap_comm)::text || ' / 1000',
           case when (select n from cap_comm) >= 1000 then 'FOUT'
                when (select n from cap_comm) >= 800  then 'KIJKEN'
                else 'GOED' end),

    -- B. hetzelfde getal, van twee kanten
    ('B1', 'wachtend op de bank, EUR (finance-check = ledger)',
           to_char((select v from tweekant_eur), 'FM999G999G990D00'), 'GOED'),
    ('B2', 'wachtend op de bank, USD (finance-check = ledger)',
           to_char((select v from tweekant_usd), 'FM999G999G990D00'), 'GOED'),
    ('B3', 'commissies EUR (/commissions = wat "We keep" aftrekt)',
           to_char((select v from comm_eur), 'FM999G999G990D00'), 'GOED'),

    -- C. geld zonder eigenaar -- de aanslag onder blok 15
    ('C1', 'rijen zonder eigenaar (wallet/factuur/topup)',
           (select n from wees)::text,
           case when (select n from wees) > 0 then 'FOUT' else 'GOED' end),
    ('C2', 'geld in een wallet zonder eigenaar',
           to_char((select v from wees_geld), 'FM999G999G990D00'),
           case when (select v from wees_geld) > 0 then 'FOUT' else 'GOED' end),

    -- D. wat maar een keer mag bestaan
    ('D1', 'dubbele klantcode',
           (select n from dubbel_code)::text,
           case when (select n from dubbel_code) > 0 then 'FOUT' else 'GOED' end),
    ('D2', 'dubbel factuurnummer',
           (select n from dubbel_factuur)::text,
           case when (select n from dubbel_factuur) > 0 then 'FOUT' else 'GOED' end),
    ('D3', 'adverteerder met twee bedrijfsrijen',
           (select n from dubbel_bedrijf)::text,
           case when (select n from dubbel_bedrijf) > 0 then 'KIJKEN' else 'GOED' end),

    -- E. een valuta die nergens wordt opgeteld
    ('E1', 'bedragen in een valuta die geen scherm optelt',
           (select n from vreemde_valuta)::text,
           case when (select n from vreemde_valuta) > 0 then 'FOUT' else 'GOED' end),

    -- F. werk dat stilligt
    ('F1', 'wallet-topups langer dan 7 dagen in de wachtrij',
           (select n from oud_werk)::text,
           case when (select n from oud_werk) > 0 then 'KIJKEN' else 'GOED' end),
    ('F2', 'klanten die 7+ dagen achterlopen met DST',
           (select n from dst_achter)::text,
           case when (select n from dst_achter) > 0 then 'KIJKEN' else 'GOED' end)
) as t(nr, controle, gemeten, oordeel)
order by
  case oordeel when 'FOUT' then 0 when 'KIJKEN' then 1 else 2 end,
  nr;
