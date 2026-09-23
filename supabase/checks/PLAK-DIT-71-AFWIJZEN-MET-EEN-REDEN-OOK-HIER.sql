-- ════════════════════════════════════════════════════════════════════
--  PLAK 71 — reis D1: afwijzen MET een reden, ook op de twee wachtrijen
--             die hem nog niet eisten
--
--  D1 IS ÉÉN EIS: verifiëren en afwijzen MET een reden, en de klant
--  krijgt bericht. Plak 64 heeft dat vastgezet op wallet_topups en
--  top_ups. Nagemeten vandaag: ad_account_requests en
--  ad_account_withdrawals hebben die trigger NIET. Op die twee is de
--  reden nog steeds alleen een regel in een dialoog, en een dialoog is
--  geen regel.
--
--  A  EEN OPNAME AFWIJZEN OVERSCHREEF DE WOORDEN VAN DE KLANT.
--     ad_account_withdrawals heeft ÉÉN reason-kolom en twee schrijvers.
--     De klant zet daar neer waaróm hij geld terugvraagt; de functie
--     doet bij afwijzen:
--
--         set status = 'rejected', reason = coalesce(p_reason, reason)
--
--     Dus: met een reden wordt de zin van de klant overschreven — die is
--     weg, en met hem de enige vastlegging van wat hij vroeg. ZONDER
--     reden blijft zijn eigen zin staan, en krijgt hij zijn eigen
--     woorden terug alsof wij ze geschreven hebben. Allebei fout, en de
--     tweede is de ergste: het ziet eruit als een antwoord.
--
--     Er komt een aparte kolom `decision_reason` voor ons antwoord.
--     `reason` blijft van de klant.
--
--  B  EEN AANVRAAG AFWIJZEN KON ZONDER REDEN.
--     ad_account_requests heeft wel een eigen `rejection_reason`, maar
--     niets dwingt hem af buiten het scherm om. Dezelfde trigger als op
--     de andere twee.
--
--  C  _withdrawal_within_the_account STAAT OPEN VOOR ANON.
--     Nagemeten: has_function_privilege('anon', ..., 'EXECUTE') = true.
--     De revoke-veger van plak 68 ving hem niet, want zijn naam begint
--     met een underscore en niet met wallet_/top_up_/ad_account_. Hij
--     rekent uit hoeveel er van een ad-account af mag — dat is een
--     saldo, en niemand die niet is ingelogd hoort het te kunnen vragen.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p71;
create temp table _p71(nr int, wat text, uitkomst text);

-- ── A1. ONZE REDEN KRIJGT ZIJN EIGEN KOLOM ───────────────────────────
do $blk0$
begin
  alter table public.ad_account_withdrawals
    add column if not exists decision_reason text;
  insert into _p71 values (1, 'een eigen kolom voor ons antwoord',
    'ad_account_withdrawals.decision_reason toegevoegd — reason blijft van de klant');
exception when others then
  insert into _p71 values (1, 'een eigen kolom voor ons antwoord', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── A2. DE FUNCTIE SCHRIJFT IN DE NIEUWE KOLOM ───────────────────────
--  Chirurgisch, op de tekst die NU draait: één regel vervangen, en
--  alleen als hij herkend wordt. Half aanpassen is erger dan niet.
do $blk1$
declare
  v_oid oid;
  v_def text;
  v_new text;
  v_sig text;
begin
  select p.oid,
         'public.' || quote_ident(p.proname) || '(' ||
           pg_get_function_identity_arguments(p.oid) || ')'
    into v_oid, v_sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ad_account_withdrawal_reject'
   limit 1;

  if v_oid is null then
    insert into _p71 values (2, 'de reden van de klant blijft staan', 'functie niet gevonden');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('decision_reason' in v_def) > 0 then
    insert into _p71 values (2, 'de reden van de klant blijft staan', 'stond al goed');
    return;
  end if;

  -- De functies staan hier met CRLF, dus zoeken op witruimte die alles
  -- toelaat.
  v_new := regexp_replace(
    v_def,
    'reason[[:space:]]*=[[:space:]]*coalesce\(p_reason,[[:space:]]*reason\)',
    'decision_reason = nullif(btrim(coalesce(p_reason, '''')), '''')',
    'gi');

  if v_new = v_def then
    insert into _p71 values (2, 'de reden van de klant blijft staan',
      'NIET AANGEPAST (de regel niet herkend, niets veranderd)');
    return;
  end if;

  execute v_new;
  execute 'revoke all on function ' || v_sig || ' from public, anon';
  execute 'grant execute on function ' || v_sig || ' to authenticated, service_role';

  insert into _p71 values (2, 'de reden van de klant blijft staan',
    'aangepast: ons antwoord gaat naar decision_reason, reason blijft van de klant');
exception when others then
  insert into _p71 values (2, 'de reden van de klant blijft staan', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── B. GEEN WEIGERING ZONDER REDEN, OOK HIER ─────────────────────────
--  Eén wachter, twee kolomnamen: de tabellen noemen hem verschillend.
create or replace function public._guard_rejection_needs_reason_col()
returns trigger
language plpgsql
set search_path to 'public'
as $blk2$
declare
  v_col text := tg_argv[0];
  v_val text;
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
begin
  if coalesce(v_new ->> 'status', '') <> 'rejected'
     or coalesce(v_old ->> 'status', '') = 'rejected' then
    return new;
  end if;

  v_val := v_new ->> v_col;
  if coalesce(btrim(coalesce(v_val, '')), '') = '' then
    raise exception 'een weigering heeft een reden nodig — de klant krijgt hem te zien'
      using errcode = '22023';
  end if;
  return new;
end;
$blk2$;

do $blk3$
declare
  r      record;
  v_done text := '';
begin
  for r in
    select * from (values
      ('ad_account_requests',    'rejection_reason'),
      ('ad_account_withdrawals', 'decision_reason')
    ) as t(tab, col)
  loop
    begin
      -- Alleen als de kolom er is: anders weigert de trigger elke
      -- afwijzing, en dat is erger dan de fout die hij moet stoppen.
      if not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = r.tab and column_name = r.col
      ) then
        v_done := v_done || r.tab || ': kolom ' || r.col || ' bestaat niet, overgeslagen · ';
        continue;
      end if;

      execute format('drop trigger if exists a1_guard_rejection_needs_reason on public.%I', r.tab);
      execute format('create trigger a1_guard_rejection_needs_reason
                        before update on public.%I
                        for each row execute function public._guard_rejection_needs_reason_col(%L)',
                     r.tab, r.col);
      v_done := v_done || r.tab || ' (' || r.col || ') · ';
    exception when others then
      v_done := v_done || r.tab || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _p71 values (3, 'weigering zonder reden', rtrim(v_done, ' ·'));
end
$blk3$;

-- ── C. EEN SALDO IS NIET VOOR ANON ───────────────────────────────────
do $blk4$
declare
  r      record;
  v_n    int := 0;
  v_done text := '';
begin
  for r in
    select 'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig,
           p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and p.proname like '\_%'
  loop
    begin
      execute 'revoke execute on function ' || r.sig || ' from public, anon';
      v_n := v_n + 1;
      v_done := v_done || r.proname || ' · ';
    exception when others then
      v_done := v_done || r.proname || ' MISLUKT · ';
    end;
  end loop;

  insert into _p71 values (4, 'interne functies die anon mocht aanroepen',
    case when v_n = 0 then 'er stond er geen meer open'
         else v_n::text || ' ingetrokken: ' || rtrim(v_done, ' ·') end);
end
$blk4$;

-- ── D. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk5$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(c.relname, ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and t.tgname = 'a1_guard_rejection_needs_reason';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p71 values (5, 'tabellen die een reden eisen', v_txt);

  begin
    select coalesce(string_agg(p.proname, ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and p.proname not in ('get_invite_by_token');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p71 values (6, 'functies die anon nog mag aanroepen',
    coalesce(nullif(v_txt, 'geen'), 'geen — alleen get_invite_by_token blijft bewust open'));

  begin
    select coalesce(count(*)::text, '0') ||
           ' afgewezen opnames zonder eigen antwoord van ons'
      into v_txt
      from public.ad_account_withdrawals w
     where lower(coalesce(w.status, '')) = 'rejected'
       and coalesce(btrim(coalesce(w.decision_reason, '')), '') = '';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p71 values (7, 'oude afwijzingen', v_txt);
end
$blk5$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p71 order by nr;
