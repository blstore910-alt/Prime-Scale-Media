-- ════════════════════════════════════════════════════════════════════
-- PLAK 123 — de dubbele teller, nu bij de bron
-- ════════════════════════════════════════════════════════════════════
--
-- GEMETEN VANDAAG, 28-09, IN DEZE VOLGORDE. Dit is geen vermoeden meer.
--
--   19:0x  plak 122 herbouwde `referral_links.earnings_*` uit de rijen.
--          Link 8fd91a63 (PSM0008 bracht PSM0011 binnen) kwam uit op
--          EUR 75,00 — klopt: één abonnementscommissie van 75,00, geen
--          clawback.
--   19:18  de affiliate vroeg uitbetaling #4 aan.
--   19:34  de eigenaar drukte "Mark as paid".
--   daarna opgeslagen 150,00 tegen echt 75,00. Exact het dubbele, en
--          het is er in die ene handeling bij gekomen.
--
-- DE OORZAAK: TWEE SCHRIJVERS VOOR ÉÉN GETAL
--
--   1. bij het BOEKEN. `_book_invoice_commission` (en `_book_topup_
--      commission` en `_book_onetime_if_due`) schrijven de commissie weg
--      als 'unpaid' en roepen in dezelfde adem
--      `_referral_link_earnings_add(...)` aan. Gemeten: regel 78 insert,
--      regel 89 de optelling.
--
--   2. bij het UITBETALEN. De trigger
--      `trg_update_referral_link_earnings_on_paid` op
--      `referral_commissions` telt hetzelfde bedrag er NOG EENS bij
--      zodra de status naar 'paid' gaat. Gemeten: hij bestaat en
--      `tgenabled` = 'O', dus hij vuurt.
--
-- Dat model is verkeerd, niet alleen dubbel: `earnings_*` betekent
-- LEVENSLANG VERDIEND — dat is wat de tierladder leest ("Your lifetime
-- earnings move you up the tiers"). Wat iemand heeft verdiend verandert
-- niet doordat wij het overmaken. Het boeken is dus de juiste schrijver
-- en de trigger is de verkeerde; zijn tweede helft trekt het er zelfs
-- weer AF als een uitbetaling wordt teruggedraaid, en dan telt het te
-- weinig.
--
-- WAAROM DIT NIET AL WEG WAS
--
-- Plak 106 had precies deze diagnose en liet de trigger vallen. Die
-- plak is NOOIT GEDRAAID — te zien aan zijn eigen kop: hij noteert
-- 15,88 en 30,00 als de scheve standen, en dat waren ze vanochtend nog
-- steeds, tot plak 122 ze herbouwde.
--
-- PLAK 106 MOET OOK NIET MEER GEDRAAID WORDEN. Zijn herbouw is van
-- vóór `referral_clawbacks` en trekt die er niet af, dus hij zou
-- a573fd96 van 5,92 terugzetten op 9,96 — het werk van plak 122
-- ongedaan. Deze plak vervangt hem.
--
-- WAT ER GEBEURT
--
--   1. de trigger gaat weg (de functie blijft staan, zodat een
--      bestaande verwijzing niet stilletjes omvalt);
--   2. de teller wordt nog één keer herbouwd uit de rijen, mét
--      clawbacks, precies zoals plak 122 het deed.
--
-- Niets hiervan verplaatst geld. `earnings_*` is een teller naast de
-- rijen; elke commissie, clawback en uitbetaling blijft staan zoals
-- hij staat.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak123 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak123;

-- ── 1. de tweede schrijver eruit ────────────────────────────────────
do $blk0$
begin
  if exists (
    select 1 from pg_trigger
     where tgname = 'trg_update_referral_link_earnings_on_paid'
       and not tgisinternal
  ) then
    drop trigger trg_update_referral_link_earnings_on_paid
      on public.referral_commissions;
    insert into _plak123 values (0, 'de tweede schrijver',
      'trigger weg -- het boeken telt al');
  else
    insert into _plak123 values (0, 'de tweede schrijver',
      'stond er al niet -- niets gedaan');
  end if;
exception when others then
  insert into _plak123 values (0, 'de tweede schrijver',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. de teller opnieuw uit de rijen, mét clawbacks ────────────────
do $blk1$
declare
  v_voor text;
  v_na   text;
  v_mis  integer;
begin
  select coalesce(sum(coalesce(earnings_eur, 0)), 0)::text || ' EUR / '
      || coalesce(sum(coalesce(earnings_usd, 0)), 0)::text || ' USD'
    into v_voor
    from public.referral_links;

  update public.referral_links rl
     set earnings_eur = greatest(0, round(
           coalesce((select sum(c.amount) from public.referral_commissions c
                      where c.referral_link_id = rl.id
                        and upper(coalesce(c.currency, 'EUR')) = 'EUR'), 0)
         - coalesce((select sum(cb.amount) from public.referral_clawbacks cb
                      where cb.referral_link_id = rl.id
                        and upper(coalesce(cb.currency, 'EUR')) = 'EUR'), 0), 2)),
         earnings_usd = greatest(0, round(
           coalesce((select sum(c.amount) from public.referral_commissions c
                      where c.referral_link_id = rl.id
                        and upper(coalesce(c.currency, 'EUR')) = 'USD'), 0)
         - coalesce((select sum(cb.amount) from public.referral_clawbacks cb
                      where cb.referral_link_id = rl.id
                        and upper(coalesce(cb.currency, 'EUR')) = 'USD'), 0), 2));

  select coalesce(sum(coalesce(earnings_eur, 0)), 0)::text || ' EUR / '
      || coalesce(sum(coalesce(earnings_usd, 0)), 0)::text || ' USD'
    into v_na
    from public.referral_links;

  -- Hoeveel links wijken NA de herbouw nog af? Hoort 0 te zijn.
  select count(*) into v_mis
    from public.referral_links rl
   where coalesce(rl.earnings_eur, 0) <> greatest(0, round(
           coalesce((select sum(c.amount) from public.referral_commissions c
                      where c.referral_link_id = rl.id
                        and upper(coalesce(c.currency, 'EUR')) = 'EUR'), 0)
         - coalesce((select sum(cb.amount) from public.referral_clawbacks cb
                      where cb.referral_link_id = rl.id
                        and upper(coalesce(cb.currency, 'EUR')) = 'EUR'), 0), 2));

  insert into _plak123 values (1, 'teller herberekend',
    'was ' || v_voor || ', is nu ' || v_na ||
    ' | links die nog afwijken: ' || v_mis || ' (moet 0)');
exception when others then
  insert into _plak123 values (1, 'teller herberekend',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── controle ────────────────────────────────────────────────────────
do $blk2$
declare
  v_trg   integer;
  v_regel text;
begin
  select count(*) into v_trg
    from pg_trigger
   where tgname = 'trg_update_referral_link_earnings_on_paid'
     and not tgisinternal;

  -- De link uit het voorbeeld hierboven, zodat je hem kunt naslaan.
  select coalesce(
      'link 8fd91a63: opgeslagen ' || coalesce(rl.earnings_eur, 0)::text
      || ' EUR, echt ' || greatest(0, round(
           coalesce((select sum(c.amount) from public.referral_commissions c
                      where c.referral_link_id = rl.id
                        and upper(coalesce(c.currency, 'EUR')) = 'EUR'), 0)
         - coalesce((select sum(cb.amount) from public.referral_clawbacks cb
                      where cb.referral_link_id = rl.id
                        and upper(coalesce(cb.currency, 'EUR')) = 'EUR'), 0), 2))::text
      || ' EUR', 'die link bestaat niet meer')
    into v_regel
    from public.referral_links rl
   where rl.id = '8fd91a63-9a8d-4552-94e6-ea16867bda2f';

  insert into _plak123 values (2, 'stand van zaken',
    'dubbele trigger nog aanwezig: ' || v_trg || ' (moet 0)');
  insert into _plak123 values (3, 'het voorbeeld',
    coalesce(v_regel, 'die link bestaat niet meer'));
exception when others then
  insert into _plak123 values (2, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak123 order by n;
