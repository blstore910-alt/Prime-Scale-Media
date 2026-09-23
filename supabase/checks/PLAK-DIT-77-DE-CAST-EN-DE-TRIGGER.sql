-- ════════════════════════════════════════════════════════════════════
--  PLAK 77 — de cast die ik vergat, en de trigger zonder tekstchirurgie
--
--  Plak 76 deed zijn werk: hij LIET ZIEN wat er misging in plaats van
--  het weg te gooien. Twee dingen, allebei van mij.
--
--  A  "42883 operator does not exist: text = uuid"
--     audit_events.row_id is TEKST (nagemeten) en ik vergeleek hem met
--     een uuid. Eén cast. Met `w.id::text = ae.row_id` vindt hij die
--     twee auditrijen wel — ook nagemeten.
--
--  B  "het begin van de functie niet herkend"
--     Ik probeerde een uitstap in de body van
--     _withdrawal_takes_the_account_currency te NAAIEN, en mijn patroon
--     paste niet op de tekst die er echt staat. Dat is de verkeerde
--     aanpak voor dit probleem: ik hoef de body niet te kennen.
--
--     Een trigger heeft een WHEN-clausule. De regel die ik wil is
--     precies "draai alleen zolang de rij nog pending is" — dat is een
--     voorwaarde op de trigger, niet op de functie. Geen tekstchirurgie,
--     geen aanname over wat er in die functie staat, en de functie zelf
--     blijft onaangeroerd.
--
--     Waarom het moet: die trigger eindigt met new.currency := v_cur, en
--     hij vuurt op INSERT én UPDATE. Bij indienen is dat precies goed.
--     Bij een rij die al afgehandeld is, is het geschiedvervalsing — de
--     opname hier is geweigerd OMDAT hij in USD stond op een
--     EUR-account, en één tekstwijziging zou hem als EUR laten staan
--     alsof die reden nooit bestond.
--
--     (Een BEFORE-trigger ziet new.status nadat kolomstandaarden zijn
--     toegepast, dus een insert die status leeg laat komt hier gewoon
--     als 'pending' binnen.)
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p77;
create temp table _p77(nr int, wat text, uitkomst text);

-- ── A. DE TRIGGER, MET EEN VOORWAARDE IN PLAATS VAN CHIRURGIE ────────
do $blk0$
begin
  execute 'drop trigger if exists trg_withdrawal_takes_the_account_currency
             on public.ad_account_withdrawals';
  execute 'create trigger trg_withdrawal_takes_the_account_currency
             before insert or update on public.ad_account_withdrawals
             for each row
             when (lower(coalesce(new.status, '''')) = ''pending'')
             execute function public._withdrawal_takes_the_account_currency()';
  insert into _p77 values (1, 'de valuta van een afgehandelde opname',
    'de trigger draait nu alleen zolang de rij pending is — de functie zelf is onaangeroerd');
exception when others then
  insert into _p77 values (1, 'de valuta van een afgehandelde opname', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. HET HERSTEL, MET DE CAST ──────────────────────────────────────
do $blk1$
declare
  r          record;
  v_orig     text;
  v_gevonden int := 0;
  v_hersteld int := 0;
  v_leeg     int := 0;
  v_fout     text := '';
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'ad_account_withdrawals'
       and column_name  = 'decision_reason'
  ) then
    insert into _p77 values (2, 'de woorden van de klant',
      'OVERGESLAGEN — decision_reason bestaat niet, plak 71 moet eerst');
    return;
  end if;

  for r in
    select w.id, w.reason
      from public.ad_account_withdrawals w
     where lower(coalesce(w.status, '')) = 'rejected'
       and coalesce(btrim(coalesce(w.decision_reason, '')), '') = ''
  loop
    v_gevonden := v_gevonden + 1;
    begin
      v_orig := null;
      select ae.before_data ->> 'reason'
        into v_orig
        from public.audit_events ae
       where ae.table_name = 'ad_account_withdrawals'
         -- ::text. row_id is tekst; dit was de hele fout.
         and ae.row_id     = r.id::text
         and ae.action     = 'UPDATE'
         and coalesce(ae.after_data  ->> 'status', '') = 'rejected'
         and coalesce(ae.before_data ->> 'status', '') <> 'rejected'
       order by ae.occurred_at desc
       limit 1;

      update public.ad_account_withdrawals
         set decision_reason = nullif(btrim(coalesce(r.reason, '')), ''),
             -- Niets gevonden? Dan leeg, niet onze zin. Een leeg veld
             -- zegt "wij weten niet meer wat de klant schreef"; onze zin
             -- daar laten staan zegt iets dat niet waar is.
             reason = nullif(btrim(coalesce(v_orig, '')), '')
       where id = r.id;

      if coalesce(btrim(coalesce(v_orig, '')), '') <> '' then
        v_hersteld := v_hersteld + 1;
      else
        v_leeg := v_leeg + 1;
      end if;
    exception when others then
      v_fout := v_fout || sqlstate || ' ' || sqlerrm || ' · ';
    end;
  end loop;

  insert into _p77 values (2, 'de woorden van de klant',
    v_gevonden::text || ' gevonden, ' ||
    v_hersteld::text || ' teruggehaald uit de audittrail, ' ||
    v_leeg::text || ' leeggemaakt' ||
    case when v_fout = '' then '' else ' — FOUT: ' || rtrim(v_fout, ' ·') end);
end
$blk1$;

-- ── C. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk2$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(
             w.status || ' ' || w.amount::text || ' ' || upper(w.currency) ||
             ' | zij: ' || left(coalesce(w.reason, '(leeg)'), 40) ||
             ' | wij: ' || left(coalesce(w.decision_reason, '(leeg)'), 40),
             E'\n' order by w.created_at desc), 'geen opnames')
      into v_txt
      from public.ad_account_withdrawals w;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p77 values (3, 'elke opname, wie wat zei', v_txt);

  begin
    select coalesce(count(*)::text, '0') ||
           ' afgewezen opnames waar onze zin nog in de kolom van de klant staat'
      into v_txt
      from public.ad_account_withdrawals w
     where lower(coalesce(w.status, '')) = 'rejected'
       and coalesce(btrim(coalesce(w.decision_reason, '')), '') = '';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p77 values (4, 'nog te herstellen', v_txt);

  begin
    select coalesce(string_agg(
             t.tgname ||
             case when pg_get_triggerdef(t.oid) ilike '%when %' then ' (met voorwaarde)' else '' end,
             ' · ' order by t.tgname), 'geen')
      into v_txt
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'ad_account_withdrawals' and not t.tgisinternal
       and (t.tgtype & 16) > 0;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p77 values (5, 'wat er op een UPDATE van een opname vuurt', v_txt);
end
$blk2$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p77 order by nr;
