-- ════════════════════════════════════════════════════════════════════
--  PLAK 63 — de 277 bankstortingen van vóór de livegang opzij
--
--  WAAROM. De tab Deposits en de dashboardkaart telden alleen status
--  'suggested', en alles staat op 'unmatched' — dus de badge zei 0
--  terwijl er 277 rijen lagen: EUR 366.718,45 + USD 155.674,00 +
--  HKD 11.850,00. Die teller is gerepareerd en telt nu alles wat nog
--  niet afgehandeld is. Zonder dit blok springt hij bij de eerstvolgende
--  deploy van 0 naar 277.
--
--  Dat is verkeer van de bestaande administratie — referenties als
--  INV-2026-2085, PSM1925, PSM2125/TRWIBEB1XXX — en niet van deze app.
--  Besluit van de eigenaar: opzijleggen, en bij de livegang bekijken wat
--  er eventueel alsnog gematcht moet worden.
--
--  WAT OPZIJLEGGEN HIER BETEKENT. Alleen `archived_at` wordt gezet. De
--  rij blijft staan, met bedrag, referentie en datum. Het paneel heeft
--  een eigen knop voor gearchiveerde stortingen met een teller ernaast,
--  dus ze zijn met één klik terug te zien en alsnog te matchen. Er gaat
--  niets weg en er verandert geen cent.
--
--  WAT DIT BLOK NIET DOET. Stortingen die NA dit moment binnenkomen
--  blijven gewoon op de wachtrij staan — dat is de bedoeling: vanaf de
--  livegang is elke binnenkomende overboeking werk.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p63;
create temp table _p63(nr int, wat text, uitkomst text);

do $blk0$
declare
  v_now   timestamptz := now();
  v_txt   text;
  v_n     int;
begin
  -- ── 1. WAT LIGT ER NU ─────────────────────────────────────────────
  begin
    select coalesce(string_agg(x.cur || ' ' || to_char(x.som, 'FM999G999G990D00') ||
                               ' (' || x.n::text || ')', ' · ' order by x.cur), 'niets')
      into v_txt
      from (
        select currency as cur, count(*) as n, sum(amount_cents)/100.0 as som
          from public.wise_incoming_transfers
         where archived_at is null
           and coalesce(status, '') not in ('confirmed', 'completed', 'matched')
         group by currency
      ) x;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p63 values (1, 'lag er open', v_txt);

  -- ── 2. OPZIJ ──────────────────────────────────────────────────────
  begin
    update public.wise_incoming_transfers
       set archived_at = v_now,
           -- Alleen waar nog niets stond: een notitie van een mens blijft.
           note = case when coalesce(btrim(note), '') = ''
                       then 'Opzijgelegd voor de livegang op ' || to_char(v_now, 'DD-MM-YYYY') ||
                            ' — verkeer van vóór deze app. Bij de livegang bekijken.'
                       else note end,
           updated_at = v_now
     where archived_at is null
       and coalesce(status, '') not in ('confirmed', 'completed', 'matched')
       and created_at < v_now;
    get diagnostics v_n = row_count;
    insert into _p63 values (2, 'opzijgelegd',
      v_n::text || ' stortingen — ze blijven staan en zijn in het paneel terug te zien onder de knop voor gearchiveerde stortingen');
  exception when others then
    insert into _p63 values (2, 'opzijgelegd', 'MISLUKT: ' || sqlerrm);
  end;
end
$blk0$;

-- ── 3. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk1$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(x.wat || ': ' || x.n::text, ' · ' order by x.wat), 'geen')
      into v_txt
      from (
        select case when archived_at is not null then 'opzijgelegd'
                    when coalesce(status, '') in ('confirmed', 'completed', 'matched') then 'afgehandeld'
                    else 'OP DE WACHTRIJ' end as wat,
               count(*) as n
          from public.wise_incoming_transfers
         group by 1
      ) x;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p63 values (3, 'de stand nu', v_txt);

  begin
    select coalesce(to_char(max(created_at), 'DD-MM-YYYY HH24:MI'), 'geen')
      into v_txt
      from public.wise_incoming_transfers;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p63 values (4, 'laatste storting binnengekomen', v_txt);
end
$blk1$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p63 order by nr;
