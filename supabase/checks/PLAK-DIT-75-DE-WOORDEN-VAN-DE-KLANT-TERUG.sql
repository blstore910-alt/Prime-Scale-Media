-- ════════════════════════════════════════════════════════════════════
--  PLAK 75 — de woorden van de klant terughalen uit de audittrail
--
--  Plak 71 zorgt dat dit niet meer GEBEURT. Deze haalt terug wat er al
--  is gebeurd.
--
--  WAT ER STOND. ad_account_withdrawals had één reason-kolom en twee
--  schrijvers, en afwijzen deed `reason = coalesce(p_reason, reason)`.
--  Op productie, nagemeten:
--
--      status     rejected
--      reason     "This was filed in the wrong currency. Your account
--                  is in EUR…"
--
--  Dat is ONZE zin. Hij staat in de kolom van de klant, en op het
--  scherm leest hij nu als "They said:" — wij, met de naam van de klant
--  eronder.
--
--  WAT ER ECHT GEBEURD IS, uit audit_events:
--
--      21-09 12:09:02  INSERT  reason -> "A6 walkthrough"
--      21-09 12:20:27  UPDATE  pending -> rejected
--                              reason -> "This was filed in the wrong…"
--
--  De klant schreef "A6 walkthrough". Bij het afwijzen is dat
--  overschreven. before_data van die UPDATE heeft het nog.
--
--  WAT DIT BLOK DOET. Voor elke AFGEWEZEN opname waar decision_reason
--  nog leeg is:
--    1  zet de huidige reason (die van ons) in decision_reason;
--    2  zet in reason terug wat de audittrail als before_data had op het
--       moment dat de status naar rejected ging.
--
--  Lukt stap 2 niet — geen auditrij, of before_data zonder reason — dan
--  wordt reason LEEGGEMAAKT in plaats van gevuld met een gok. Een leeg
--  veld zegt "wij weten niet meer wat de klant schreef"; onze zin laten
--  staan zegt iets dat niet waar is.
--
--  Dit raakt vandaag ÉÉN rij. Het blok is geschreven alsof het er
--  duizend waren, en het mag twee keer draaien: een rij waar
--  decision_reason al gevuld is, wordt overgeslagen.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p75;
create temp table _p75(nr int, wat text, uitkomst text);

do $blk0$
declare
  r        record;
  v_orig   text;
  v_hersteld int := 0;
  v_leeg     int := 0;
  v_done     text := '';
begin
  -- Zonder de kolom is er niets te doen: plak 71 moet eerst.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'ad_account_withdrawals'
       and column_name  = 'decision_reason'
  ) then
    insert into _p75 values (1, 'de woorden van de klant',
      'OVERGESLAGEN — plak 71 moet eerst, die maakt decision_reason');
    return;
  end if;

  for r in
    select w.id, w.reason
      from public.ad_account_withdrawals w
     where lower(coalesce(w.status, '')) = 'rejected'
       and coalesce(btrim(coalesce(w.decision_reason, '')), '') = ''
  loop
    begin
      -- De laatste keer dat deze rij op 'rejected' is gezet, en wat er
      -- vlak daarvóór in reason stond.
      select ae.before_data ->> 'reason'
        into v_orig
        from public.audit_events ae
       where ae.table_name = 'ad_account_withdrawals'
         and ae.row_id     = r.id
         and ae.action     = 'UPDATE'
         and coalesce(ae.after_data  ->> 'status', '') = 'rejected'
         and coalesce(ae.before_data ->> 'status', '') <> 'rejected'
       order by ae.occurred_at desc
       limit 1;

      update public.ad_account_withdrawals
         set decision_reason = nullif(btrim(coalesce(r.reason, '')), ''),
             -- Niets gevonden? Dan leeg, niet onze zin. Een leeg veld
             -- zegt "wij weten het niet meer"; onze zin daar laten staan
             -- zegt iets dat niet waar is.
             reason = nullif(btrim(coalesce(v_orig, '')), '')
       where id = r.id;

      if coalesce(btrim(coalesce(v_orig, '')), '') <> '' then
        v_hersteld := v_hersteld + 1;
        v_done := v_done || left(v_orig, 40) || ' · ';
      else
        v_leeg := v_leeg + 1;
      end if;
    exception when others then
      v_done := v_done || 'MISLUKT op ' || r.id::text || ' (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _p75 values (1, 'de woorden van de klant',
    case
      when v_hersteld = 0 and v_leeg = 0 then 'niets te doen — geen afgewezen opname zonder ons eigen antwoord'
      else v_hersteld::text || ' teruggehaald uit de audittrail, ' ||
           v_leeg::text || ' leeggemaakt omdat er niets te vinden was' ||
           case when v_done = '' then '' else ' — ' || rtrim(v_done, ' ·') end
    end);
end
$blk0$;

-- ── WAT ER NU STAAT (alleen lezen) ───────────────────────────────────
do $blk1$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(
             w.status || ' ' || w.amount::text || ' ' || upper(w.currency) ||
             ' | zij: ' || left(coalesce(w.reason, '(leeg)'), 34) ||
             ' | wij: ' || left(coalesce(w.decision_reason, '(leeg)'), 34),
             E'\n' order by w.created_at desc), 'geen opnames')
      into v_txt
      from public.ad_account_withdrawals w;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p75 values (2, 'elke opname, wie wat zei', v_txt);

  begin
    select coalesce(count(*)::text, '0') ||
           ' afgewezen opnames waar onze zin nog in de kolom van de klant staat'
      into v_txt
      from public.ad_account_withdrawals w
     where lower(coalesce(w.status, '')) = 'rejected'
       and coalesce(btrim(coalesce(w.decision_reason, '')), '') = '';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p75 values (3, 'nog te herstellen', v_txt);
end
$blk1$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p75 order by nr;
