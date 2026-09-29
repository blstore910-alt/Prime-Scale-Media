-- ════════════════════════════════════════════════════════════════════
-- PLAK 138 — BEWIJST DAT HET GROOTBOEK WERKT. VERANDERT NIETS.
-- ════════════════════════════════════════════════════════════════════
--
-- WAAROM DIT MOET
--
-- Het grootboek staat er sinds plak 125 en de dagelijkse controle zegt
-- netjes "0 rijen, de boeken kloppen". Maar gemeten op 29-09:
--
--   select source, count(*) from wallet_ledger group by source;
--   → opening | 10
--
-- Er staan alleen OPENINGSREGELS in. De trigger heeft nog nooit een
-- echte beweging gezien. "De boeken kloppen" is op dit moment dus een
-- lege bewering: elke portemonnee heeft precies één regel die gelijk is
-- aan zijn eigen saldo, en dat klopt altijd.
--
-- De hele belofte van het grootboek is: er kan geen geld bewegen zonder
-- regel. Die belofte is nooit getoetst. Deze plak toetst hem.
--
-- WAT DIT DOET MET JE GELD: NIETS.
--
-- Elke toets staat in een blok met een eigen exception-handler. In
-- plpgsql is dat een savepoint: aan het eind wordt er ALTIJD een fout
-- opgeworpen, dus alles wat de toets veranderde wordt teruggedraaid. De
-- uitkomsten worden bewaard in variabelen -- die overleven een
-- terugdraai, want ze staan in het geheugen, niet in een tabel.
--
-- Regel 8 van het rapport leest het saldo daarna opnieuw en vergelijkt
-- het met wat het vóór de toets was. Staat daar iets anders dan "ja",
-- stuur het me dan meteen door.
--
-- WAT ER GETOETST WORDT
--
--   1  EUR erbij            -> één regel, delta +, before/after kloppen
--   2  USD eraf             -> één regel, delta -
--   3  BEIDE tegelijk       -> TWEE regels, niet één
--   4  Zelfde waarde        -> GEEN regel (een niet-beweging is er geen)
--   5  De bron-hint         -> komt in `source` terecht
--   6  Slot: UPDATE         -> geweigerd
--   7  Slot: DELETE         -> geweigerd
--   8  Saldo ongewijzigd    -> alles is teruggedraaid
--
-- Toets 3 is degene die het vaakst stuk is: een trigger die de twee
-- saldokolommen met een if/elsif afhandelt schrijft er één in plaats
-- van twee, en dan is er een beweging zonder regel -- precies wat het
-- grootboek onmogelijk hoort te maken.
-- ════════════════════════════════════════════════════════════════════

create temp table if not exists _grootboek_rapport (
  nr int, toets text, verwacht text, gekregen text, goed boolean
) on commit drop;
truncate _grootboek_rapport;

do $blk0$
declare
  v_w        uuid;
  v_eur0     numeric;
  v_usd0     numeric;
  v_eur_na   numeric;
  v_usd_na   numeric;
  v_n        int;
  t1 text := 'niet gedraaid'; g1 boolean := false;
  t2 text := 'niet gedraaid'; g2 boolean := false;
  t3 text := 'niet gedraaid'; g3 boolean := false;
  t4 text := 'niet gedraaid'; g4 boolean := false;
  t5 text := 'niet gedraaid'; g5 boolean := false;
  t6 text := 'niet gedraaid'; g6 boolean := false;
  t7 text := 'niet gedraaid'; g7 boolean := false;
  r  record;
begin
  -- De portemonnee met het meeste geld erin, zodat de toets op een
  -- echte rij draait en niet op een randgeval.
  select w.id, coalesce(w.eur_balance,0), coalesce(w.usd_balance,0)
    into v_w, v_eur0, v_usd0
    from public.wallets w
   order by coalesce(w.eur_balance,0) + coalesce(w.usd_balance,0) desc
   limit 1;

  if v_w is null then
    insert into _grootboek_rapport
    values (0, 'een portemonnee om op te toetsen', 'ten minste 1',
            'geen enkele', false);
    return;
  end if;

  -- ── 1 t/m 5: DE TRIGGER ZELF ────────────────────────────────────
  begin
    -- 1 ── EUR erbij
    update public.wallets set eur_balance = coalesce(eur_balance,0) + 12.34
     where id = v_w;

    select count(*) into v_n from public.wallet_ledger
     where wallet_id = v_w and currency = 'EUR' and delta = 12.34;
    select * into r from public.wallet_ledger
     where wallet_id = v_w and currency = 'EUR' and delta = 12.34
     order by occurred_at desc limit 1;
    if v_n = 1 and r.balance_before = v_eur0
       and r.balance_after = v_eur0 + 12.34 then
      g1 := true;
      t1 := format('1 regel, %s -> %s', r.balance_before, r.balance_after);
    else
      t1 := format('%s regel(s)%s', v_n,
        case when r.id is null then ', geen rij gevonden'
             else format(', before=%s after=%s (verwacht %s -> %s)',
                         r.balance_before, r.balance_after,
                         v_eur0, v_eur0 + 12.34) end);
    end if;

    -- 2 ── USD eraf
    update public.wallets set usd_balance = coalesce(usd_balance,0) - 5.00
     where id = v_w;

    select count(*) into v_n from public.wallet_ledger
     where wallet_id = v_w and currency = 'USD' and delta = -5.00;
    if v_n = 1 then
      g2 := true; t2 := '1 regel, delta -5.00';
    else
      t2 := format('%s regel(s) met delta -5.00', v_n);
    end if;

    -- 3 ── BEIDE in ÉÉN update. Dit is de val.
    update public.wallets
       set eur_balance = coalesce(eur_balance,0) + 1.11,
           usd_balance = coalesce(usd_balance,0) + 2.22
     where id = v_w;

    select count(*) into v_n from public.wallet_ledger
     where wallet_id = v_w and delta in (1.11, 2.22);
    if v_n = 2 then
      g3 := true; t3 := '2 regels -- allebei de valuta geboekt';
    else
      t3 := format('%s regel(s) -- er is een beweging ZONDER regel', v_n);
    end if;

    -- 4 ── dezelfde waarde terugschrijven is geen beweging
    select count(*) into v_n from public.wallet_ledger where wallet_id = v_w;
    update public.wallets
       set eur_balance = eur_balance, usd_balance = usd_balance
     where id = v_w;
    if (select count(*) from public.wallet_ledger
         where wallet_id = v_w) = v_n then
      g4 := true; t4 := 'geen regel -- terecht';
    else
      t4 := 'er kwam een regel bij voor een niet-beweging';
    end if;

    -- 5 ── de bron-hint
    perform set_config('psm.ledger_source', 'plak138_toets', true);
    update public.wallets set eur_balance = coalesce(eur_balance,0) + 0.77
     where id = v_w;
    select count(*) into v_n from public.wallet_ledger
     where wallet_id = v_w and source = 'plak138_toets';
    if v_n >= 1 then
      g5 := true; t5 := 'de hint komt in source terecht';
    else
      select source into t5 from public.wallet_ledger
       where wallet_id = v_w and delta = 0.77
       order by occurred_at desc limit 1;
      t5 := format('source = %s in plaats van plak138_toets',
                   coalesce(t5, 'GEEN REGEL'));
    end if;

    -- Alles hierboven wordt nu teruggedraaid. Dat is geen fout,
    -- dat is het ontwerp.
    raise exception 'ROLLBACK' using errcode = 'PS001';
  exception
    when sqlstate 'PS001' then null;
    when others then
      t1 := 'afgebroken: ' || left(sqlerrm, 80);
  end;

  -- ── 6 en 7: HET APPEND-ONLY SLOT ────────────────────────────────
  begin
    begin
      update public.wallet_ledger set reason = 'geknoeid'
       where wallet_id = v_w;
      t6 := 'GEACCEPTEERD -- het slot houdt niet';
      g6 := false;
    exception when others then
      t6 := 'geweigerd: ' || left(sqlerrm, 60); g6 := true;
    end;
    begin
      delete from public.wallet_ledger where wallet_id = v_w;
      t7 := 'GEACCEPTEERD -- het slot houdt niet';
      g7 := false;
    exception when others then
      t7 := 'geweigerd: ' || left(sqlerrm, 60); g7 := true;
    end;
    raise exception 'ROLLBACK' using errcode = 'PS001';
  exception
    when sqlstate 'PS001' then null;
    when others then null;
  end;

  -- ── 8: STAAT HET SALDO WEER ZOALS HET WAS ───────────────────────
  select coalesce(eur_balance,0), coalesce(usd_balance,0)
    into v_eur_na, v_usd_na
    from public.wallets where id = v_w;

  insert into _grootboek_rapport values
    (1, 'EUR erbij geeft een regel',     'before/after kloppen', t1, g1),
    (2, 'USD eraf geeft een regel',      '1 regel, delta -5.00', t2, g2),
    (3, 'BEIDE valuta in een update',    '2 regels',             t3, g3),
    (4, 'zelfde waarde = geen beweging', 'geen regel',           t4, g4),
    (5, 'de bron-hint landt in source',  'plak138_toets',        t5, g5),
    (6, 'een regel wijzigen',            'geweigerd',            t6, g6),
    (7, 'een regel verwijderen',         'geweigerd',            t7, g7),
    (8, 'saldo na de toets ONGEWIJZIGD',
        format('EUR %s / USD %s', v_eur0, v_usd0),
        format('EUR %s / USD %s', v_eur_na, v_usd_na),
        v_eur_na = v_eur0 and v_usd_na = v_usd0);
end
$blk0$;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- Alles in de kolom `goed` hoort "ja" te zijn. Regel 8 is de
-- belangrijkste: staat daar NEE, dan is er iets NIET teruggedraaid --
-- stuur hem me dan meteen door.
select nr, toets, verwacht, gekregen,
       case when goed then 'ja' else 'NEE' end as goed
  from _grootboek_rapport
 order by nr;
