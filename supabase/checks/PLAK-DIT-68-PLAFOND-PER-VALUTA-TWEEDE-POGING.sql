-- ════════════════════════════════════════════════════════════════════
--  PLAK 68 — plak 67 opnieuw, nu met de juiste tekst
--
--  WAT ER MIS GING MET PLAK 67. Twee dingen, allebei van mij:
--
--  1  Ik castte een signatuur MÉT parameternamen naar regprocedure
--     ("public.f(p_withdrawal_id uuid)"). Dat kan niet -- regprocedure
--     wil alleen de types. Vandaar "syntax error at or near uuid", en
--     ad_account_withdrawal_approve is dus onaangeroerd gebleven.
--  2  De functies staan in de database met CRLF-regeleindes, en ik zocht
--     op enkele newlines. Daarom herkende hij bij
--     _withdrawal_within_the_account maar 2 van de 3 plekken -- en omdat
--     het blok bij minder dan 3 expres NIETS doet, is ook die functie
--     onveranderd gebleven. Dat is precies zoals het hoort: half
--     aanpassen is erger dan niet aanpassen.
--
--  Dit blok zoekt nu met een patroon dat witruimte negeert, en werkt met
--  de oid in plaats van een signatuurtekst. De rest is hetzelfde als
--  plak 67, en dat blok mag je overslaan -- blok B daarvan (de poort op
--  terugbetalingen) is al geland en komt hier niet terug.
--
--  WAAROM NOG EEN KEER. Twee functies rekenen uit hoeveel er van een
--  ad-account af mag, en allebei tellen ze stortingen in verschillende
--  valuta bij elkaar op. `topup_amount` staat bij een storting van de
--  KLANT in de valuta van het account en bij een storting van een ADMIN
--  in dollars. Een euro-account met USD 500 van een admin en EUR 194 van
--  de klant geeft zo een plafond van 694, en goedkeuren schrijft daarna
--  eur_balance + 694. Die 500 waren dollars.
--
--  EN ER KOMT IETS BIJ. Plak 62 heeft top_up_admin_verify opnieuw
--  aangemaakt, en een nieuwe functie krijgt van Postgres standaard
--  uitvoerrecht voor PUBLIC -- dus ook voor anon. Plak 66 liet dat zien
--  in regel 7. Dit blok trekt dat recht weer in, bij alle geld-functies
--  die nog open staan.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p68;
create temp table _p68(nr int, wat text, uitkomst text);

-- ── A. HET PLAFOND PER VALUTA ────────────────────────────────────────
do $blk0$
declare
  r      record;
  v_def  text;
  v_new  text;
  v_n    int;
  v_done text := '';
begin
  for r in
    select p.oid,
           p.proname,
           case when p.proname = 'ad_account_withdrawal_approve' then 'v_wd' else 'new' end as bron
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('_withdrawal_within_the_account', 'ad_account_withdrawal_approve')
  loop
    begin
      v_def := pg_get_functiondef(r.oid);

      if position('topup_usd is not null' in v_def) > 0 then
        v_done := v_done || r.proname || ': stond al goed · ';
        continue;
      end if;

      -- De stortingen, variant mét de is_deleted-filter.
      v_new := regexp_replace(
        v_def,
        'and[[:space:]]+t\.status[[:space:]]*=[[:space:]]*''completed''[[:space:]]+and[[:space:]]+coalesce\(t\.is_deleted,[[:space:]]*false\)[[:space:]]*=[[:space:]]*false;',
        'and t.status = ''completed''' || chr(13) || chr(10) ||
        '       and coalesce(t.is_deleted, false) = false' || chr(13) || chr(10) ||
        '       and case when t.topup_usd is not null then upper(coalesce(t.currency, ''EUR'')) else ''USD'' end' || chr(13) || chr(10) ||
        '           = upper(coalesce(' || r.bron || '.currency, ''USD''));',
        'gi');

      -- En de variant zonder, die als terugval dient.
      v_new := regexp_replace(
        v_new,
        'and[[:space:]]+t\.status[[:space:]]*=[[:space:]]*''completed'';',
        'and t.status = ''completed''' || chr(13) || chr(10) ||
        '       and case when t.topup_usd is not null then upper(coalesce(t.currency, ''EUR'')) else ''USD'' end' || chr(13) || chr(10) ||
        '           = upper(coalesce(' || r.bron || '.currency, ''USD''));',
        'gi');

      -- Wat er al af is: ook alleen dezelfde munt.
      v_new := regexp_replace(
        v_new,
        'and[[:space:]]+lower\(coalesce\(w\.status,[[:space:]]*''''\)\)[[:space:]]+not[[:space:]]+in[[:space:]]*\(''rejected'',[[:space:]]*''cancelled''\);',
        'and lower(coalesce(w.status, '''')) not in (''rejected'', ''cancelled'')' || chr(13) || chr(10) ||
        '     and upper(coalesce(w.currency, ''USD'')) = upper(coalesce(' || r.bron || '.currency, ''USD''));',
        'gi');

      v_n := (length(v_new) - length(replace(v_new, 'topup_usd is not null', ''))) / length('topup_usd is not null');

      if v_n < 2 then
        v_done := v_done || r.proname || ': NIET AANGEPAST (' || v_n::text ||
                  ' van 2 stortingssommen herkend, niets veranderd) · ';
      elsif position('upper(coalesce(w.currency' in v_new) = 0 then
        v_done := v_done || r.proname || ': NIET AANGEPAST (de opnamesom niet herkend) · ';
      else
        execute v_new;
        v_done := v_done || r.proname || ': aangepast · ';
      end if;
    exception when others then
      v_done := v_done || r.proname || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _p68 values (1, 'plafond per valuta',
    case when v_done = '' then 'geen van beide functies gevonden' else rtrim(v_done, ' ·') end);
end
$blk0$;

-- ── B. ANON HOORT NERGENS BIJ HET GELD ───────────────────────────────
do $blk1$
declare
  r      record;
  v_n    int := 0;
  v_done text := '';
begin
  for r in
    select p.oid,
           p.proname,
           'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.pronargs > 0                       -- triggerfuncties hebben er geen
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       -- get_invite_by_token MOET voor anon: die draait op het
       -- aanmeldscherm, vóórdat iemand is ingelogd.
       and p.proname <> 'get_invite_by_token'
       and (p.proname like 'wallet\_%' or p.proname like 'top\_up\_%'
            or p.proname like 'invoice\_%' or p.proname like 'ad\_account\_%'
            or p.proname like 'affiliate\_%' or p.proname like 'referral\_%'
            or p.proname like 'dst\_%' or p.proname like 'wise\_%'
            or p.proname like '%\_perk' or p.proname like 'grant\_%')
  loop
    begin
      execute 'revoke execute on function ' || r.sig || ' from public, anon';
      v_n := v_n + 1;
      v_done := v_done || r.proname || ' · ';
    exception when others then
      v_done := v_done || r.proname || ' MISLUKT · ';
    end;
  end loop;

  insert into _p68 values (2, 'anon bij geld-functies',
    case when v_n = 0 then 'er stond er geen meer open'
         else v_n::text || ' ingetrokken: ' || rtrim(v_done, ' ·') end);
end
$blk1$;

-- ── C. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk2$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(p.proname || ': ' ||
             (case when pg_get_functiondef(p.oid) ilike '%topup_usd is not null%'
                   then 'per valuta' else 'TELT NOG ALLES OP' end), ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('_withdrawal_within_the_account', 'ad_account_withdrawal_approve');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p68 values (3, 'controle op de twee functies', v_txt);

  begin
    select coalesce(string_agg(p.proname, ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and (p.proname like 'wallet\_%' or p.proname like 'top\_up\_%'
            or p.proname like 'invoice\_%' or p.proname like 'ad\_account\_%'
            or p.proname like 'affiliate\_%' or p.proname like 'referral\_%'
            or p.proname like 'dst\_%');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p68 values (4, 'geld-functies die anon nog mag aanroepen',
    coalesce(nullif(v_txt, 'geen'), 'geen — alleen get_invite_by_token blijft bewust open'));
end
$blk2$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p68 order by nr;
