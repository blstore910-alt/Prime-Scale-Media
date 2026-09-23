-- ════════════════════════════════════════════════════════════════════
--  PLAK 76 — waarom plak 75 niets deed, en de trigger die geschiedenis
--             herschrijft
--
--  DE TABEL VAN PLAK 75 SPRAK ZICHZELF TEGEN:
--
--      1  de woorden van de klant   niets te doen — geen afgewezen
--                                   opname zonder ons eigen antwoord
--      3  nog te herstellen         1 afgewezen opnames waar onze zin
--                                   nog in de kolom van de klant staat
--
--  Allebei lezen exact dezelfde voorwaarde. Dat kan alleen als de lus
--  de rij WEL vond en er iets misging — en dat is mijn fout in de
--  RAPPORTAGE geweest: de tekst van de fout ging in v_done, en mijn
--  `case` keek alleen naar de tellers en gooide v_done weg. Een blok
--  dat zijn eigen fout opvangt en hem dan niet laat zien is erger dan
--  een blok dat klapt.
--
--  Dit blok doet hetzelfde werk en laat ALTIJD zien wat er gebeurde.
--
--  EN ONDERWEG IETS DAT LOS HIERVAN FOUT IS.
--  _withdrawal_takes_the_account_currency draait BEFORE INSERT **EN
--  BEFORE UPDATE**, en eindigt met:
--
--      new.currency := v_cur;
--
--  Dus elke update op een opnamerij overschrijft haar valuta met die
--  van het ad-account. Bij het indienen is dat precies goed. Bij een
--  rij die al AFGEHANDELD is, is het geschiedvervalsing: de opname die
--  hier geweigerd is, is geweigerd OMDAT hij in USD stond op een
--  EUR-account. Eén tekstwijziging en hij staat er als EUR bij, alsof
--  de reden van de weigering nooit bestond.
--
--  De trigger stapt nu opzij zodra de rij niet meer pending is. Wat
--  afgehandeld is, is geschiedenis; zijn valuta is wat hij wás.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p76;
create temp table _p76(nr int, wat text, uitkomst text);

-- ── A. EEN AFGEHANDELDE OPNAME IS GESCHIEDENIS ───────────────────────
do $blk0$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = '_withdrawal_takes_the_account_currency'
   limit 1;

  if v_oid is null then
    insert into _p76 values (1, 'de valuta van een afgehandelde opname', 'functie niet gevonden');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('tg_op = ''UPDATE''' in v_def) > 0 then
    insert into _p76 values (1, 'de valuta van een afgehandelde opname', 'stond al goed');
    return;
  end if;

  -- Vlak na `begin` een uitstap inbouwen. Witruimte-tolerant, want de
  -- functies staan hier met CRLF.
  v_new := regexp_replace(
    v_def,
    '(as \$function\$[[:space:]]*declare(.|[[:space:]])*?[[:space:]]begin[[:space:]])',
    '\1' ||
    '  -- Wat afgehandeld is, is geschiedenis: zijn valuta is wat hij WAS.' || chr(10) ||
    '  if tg_op = ''UPDATE'' and lower(coalesce(old.status, '''')) <> ''pending'' then' || chr(10) ||
    '    return new;' || chr(10) ||
    '  end if;' || chr(10),
    '');

  if v_new = v_def then
    insert into _p76 values (1, 'de valuta van een afgehandelde opname',
      'NIET AANGEPAST (het begin van de functie niet herkend, niets veranderd)');
    return;
  end if;

  execute v_new;
  execute 'revoke all on function public._withdrawal_takes_the_account_currency() from public, anon';
  execute 'grant execute on function public._withdrawal_takes_the_account_currency() to authenticated, service_role';
  insert into _p76 values (1, 'de valuta van een afgehandelde opname',
    'aangepast: de trigger stapt opzij zodra de rij niet meer pending is');
exception when others then
  insert into _p76 values (1, 'de valuta van een afgehandelde opname', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. HET HERSTEL, MET EERLIJKE RAPPORTAGE ──────────────────────────
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
    insert into _p76 values (2, 'de woorden van de klant',
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
      -- ALTIJD laten zien. Precies dit ging er mis in plak 75: de fout
      -- werd opgevangen en daarna door mijn eigen rapportregel weer
      -- weggegooid, zodat de tabel "niets te doen" zei over een rij die
      -- hij wel degelijk had gevonden.
      v_fout := v_fout || sqlstate || ' ' || sqlerrm || ' · ';
    end;
  end loop;

  insert into _p76 values (2, 'de woorden van de klant',
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
  insert into _p76 values (3, 'elke opname, wie wat zei', v_txt);

  begin
    select coalesce(count(*)::text, '0') ||
           ' afgewezen opnames waar onze zin nog in de kolom van de klant staat'
      into v_txt
      from public.ad_account_withdrawals w
     where lower(coalesce(w.status, '')) = 'rejected'
       and coalesce(btrim(coalesce(w.decision_reason, '')), '') = '';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p76 values (4, 'nog te herstellen', v_txt);

  begin
    select coalesce(string_agg(t.tgname || ' (' ||
             case when (t.tgtype & 16) > 0 then 'ook op UPDATE' else 'alleen INSERT' end || ')',
             ' · ' order by t.tgname), 'geen')
      into v_txt
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'ad_account_withdrawals' and not t.tgisinternal;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p76 values (5, 'wat er op een opname vuurt', v_txt);
end
$blk2$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p76 order by nr;
