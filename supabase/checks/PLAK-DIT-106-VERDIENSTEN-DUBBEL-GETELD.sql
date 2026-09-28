-- ════════════════════════════════════════════════════════════════════
-- ⚠ NIET MEER PLAKKEN — VERVANGEN DOOR PLAK 123 (28-09-2026)
-- ════════════════════════════════════════════════════════════════════
--
-- Deze plak is nooit gedraaid. De diagnose eronder klopt nog steeds --
-- de trigger stond er vanavond nog en telde bij uitbetaling #4 EUR
-- 75,00 er een tweede keer bij -- maar de HERBOUW hieronder is van
-- vóór `referral_clawbacks` en trekt die niet af. Hem nu draaien zet
-- link a573fd96 van 5,92 terug op 9,96 en maakt het werk van plak 122
-- ongedaan.
--
-- PLAK-DIT-123-DE-DUBBELE-TELLER-BIJ-DE-BRON.sql doet hetzelfde,
-- met de clawbacks erin.
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- PLAK 106 — de verdiensten op een verwijzing worden DUBBEL geteld
-- ════════════════════════════════════════════════════════════════════
--
-- Gevonden door de geld-agent op blok 4, daarna zelf nagemeten:
--
--   link 9385a77b…   staat op de link: 30,00   echt geboekt: 15,00
--   link a573fd96…   staat op de link: 15,88   echt geboekt:  9,96
--
-- De eerste is exact het dubbele.
--
-- HOE
--
-- Het bedrag wordt TWEE KEER opgeteld bij `referral_links.earnings_*`:
--
--   1. bij het BOEKEN. _book_topup_commission, _book_invoice_commission
--      en _book_onetime_if_due roepen alle drie
--      `_referral_link_earnings_add(...)` aan terwijl ze de commissie als
--      'unpaid' wegschrijven.
--   2. bij het UITBETALEN. De trigger
--      trg_update_referral_link_earnings_on_paid op
--      referral_commissions telt hem er nog eens bij zodra de status van
--      'unpaid' naar 'paid' gaat.
--
-- Daarom is de tweede link niet exact dubbel: alleen de commissies die
-- al uitbetaald zijn, zijn twee keer geteld.
--
-- WAT DE AFFILIATE ZIET
--
-- Een levenslang verdienstenbedrag dat te hoog is, en dat groeit elke
-- keer dat we hem betalen. Precies de verkeerde kant op: hoe meer wij
-- uitbetalen, hoe meer hij denkt nog tegoed te hebben. Het voedt ook de
-- tierladder, dus iemand klimt naar Riser op geld dat hij niet heeft
-- verdiend.
--
-- DE REPARATIE
--
-- De trigger eruit -- het boeken telt al -- en daarna beide kolommen
-- opnieuw afleiden uit de commissierijen zelf, wat de enige bron is die
-- niet kan verschuiven.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak106 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak106;

-- ── 0. het gat, vóór de reparatie ───────────────────────────────────
do $blk0$
declare v text;
begin
  select coalesce(string_agg(
           left(x.id::text, 8) || '… link ' || coalesce(x.op_link::text, 'leeg') ||
           ' vs geboekt ' || x.geboekt::text, ' | '), 'geen')
    into v
    from (
      select rl.id,
             rl.earnings_eur as op_link,
             coalesce(sum(rc.amount) filter (
               where upper(coalesce(rc.currency,'EUR')) = 'EUR'), 0) as geboekt
        from public.referral_links rl
        left join public.referral_commissions rc on rc.referral_link_id = rl.id
       group by rl.id, rl.earnings_eur
      having coalesce(rl.earnings_eur, 0) <> coalesce(sum(rc.amount) filter (
               where upper(coalesce(rc.currency,'EUR')) = 'EUR'), 0)
    ) x;
  insert into _plak106 values (0, 'afwijkingen VOORAF (EUR)', v);
exception when others then
  insert into _plak106 values (0, 'afwijkingen VOORAF (EUR)',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 1. de dubbeltelling eruit ───────────────────────────────────────
--     De trigger, niet de functie: die laten we staan zodat een
--     bestaande verwijzing in de code niet stilletjes omvalt.
do $blk1$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'trg_update_referral_link_earnings_on_paid'
                and not tgisinternal) then
    drop trigger trg_update_referral_link_earnings_on_paid
      on public.referral_commissions;
    insert into _plak106 values (1, 'de dubbeltelling',
      'trigger weg -- het boeken telt al');
  else
    insert into _plak106 values (1, 'de dubbeltelling',
      'trigger stond er al niet meer');
  end if;
exception when others then
  insert into _plak106 values (1, 'de dubbeltelling',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 2. en de kolommen opnieuw afleiden ──────────────────────────────
--     Uit de commissierijen, want dat is de enige bron die niet kan
--     verschuiven. Een terugdraaiing staat NIET in referral_commissions
--     (die zit in referral_clawbacks) en hoort hier dus ook niet af te
--     gaan -- deze kolom is "verdiend", niet "nog te krijgen". Dat is
--     ook hoe affiliate_referral_stats het leest.
do $blk2$
declare v_n integer;
begin
  with som as (
    select rl.id,
           coalesce(sum(rc.amount) filter (
             where upper(coalesce(rc.currency,'EUR')) = 'EUR'), 0) as eur,
           coalesce(sum(rc.amount) filter (
             where upper(coalesce(rc.currency,'EUR')) = 'USD'), 0) as usd
      from public.referral_links rl
      left join public.referral_commissions rc on rc.referral_link_id = rl.id
     group by rl.id
  )
  update public.referral_links rl
     set earnings_eur = som.eur,
         earnings_usd = som.usd
    from som
   where som.id = rl.id
     and (coalesce(rl.earnings_eur, 0) <> som.eur
       or coalesce(rl.earnings_usd, 0) <> som.usd);
  get diagnostics v_n = row_count;

  insert into _plak106 values (2, 'kolommen herberekend',
    v_n || ' verwijzing(en) rechtgezet');
exception when others then
  insert into _plak106 values (2, 'kolommen herberekend',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── controle ────────────────────────────────────────────────────────
do $blk3$
declare
  v_mis integer;
  v_trg integer;
  v_lijst text;
begin
  select count(*) into v_mis
    from (
      select rl.id
        from public.referral_links rl
        left join public.referral_commissions rc on rc.referral_link_id = rl.id
       group by rl.id, rl.earnings_eur, rl.earnings_usd
      having coalesce(rl.earnings_eur, 0) <> coalesce(sum(rc.amount) filter (
               where upper(coalesce(rc.currency,'EUR')) = 'EUR'), 0)
          or coalesce(rl.earnings_usd, 0) <> coalesce(sum(rc.amount) filter (
               where upper(coalesce(rc.currency,'EUR')) = 'USD'), 0)
    ) x;

  select count(*) into v_trg from pg_trigger
   where tgname = 'trg_update_referral_link_earnings_on_paid'
     and not tgisinternal;

  select coalesce(string_agg(
           coalesce(a.tenant_client_code,'?') || ': EUR ' ||
           coalesce(rl.earnings_eur::text,'0'), ' | '), 'geen')
    into v_lijst
    from public.referral_links rl
    left join public.advertisers a on a.id = rl.affiliate_advertiser_id;

  insert into _plak106 values (3, 'stand van zaken',
    'verwijzingen die nog afwijken: ' || v_mis || ' (moet 0) | ' ||
    'dubbeltel-trigger nog aanwezig: ' || v_trg || ' (moet 0)');
  insert into _plak106 values (4, 'verdiensten per affiliate nu', v_lijst);
exception when others then
  insert into _plak106 values (3, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
--
-- Regel 4 is wat de affiliates vanaf nu op hun scherm zien staan. Was
-- er al iemand betaald op het te hoge bedrag, dan is dat NIET met deze
-- plak teruggedraaid -- er is niets te veel uitbetaald, want de
-- uitbetaalstroom rekent met de commissierijen en niet met deze kolom.
-- Alleen het getal op het scherm stond te hoog.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak106 order by n;
