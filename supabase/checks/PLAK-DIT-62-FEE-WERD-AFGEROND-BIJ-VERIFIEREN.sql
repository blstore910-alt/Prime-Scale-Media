-- ════════════════════════════════════════════════════════════════════
--  PLAK 62 — een fee van 3,5% werd 4% op het moment van verifiëren
--
--  GEVONDEN OP D1, met de rekenbril, en daarna zelf tegen de live
--  database nagerekend.
--
--  WAT ER MIS IS. De kolom `top_ups.fee` is numeric(6,3) — 3,500 past er
--  prima in, en het abonnement "Launch" staat op 3,50%. Maar de functie
--  die een storting verifieert heeft als parameter `smallint`:
--
--      top_up_admin_verify(p_top_up_id uuid, p_new_fee_percent smallint)
--
--  en zet die binnenin ook nog eens in een `v_new_fee smallint`. Daardoor:
--
--      select 3.5::numeric::smallint   ->   4
--      select 2.4::numeric::smallint   ->   2
--
--  De admin raakt het feeveld niet eens aan: de functie neemt dan de fee
--  van de rij zelf over, en rondt hem af. Omdat de fee "veranderd" lijkt,
--  splitst hij de hele storting opnieuw op dat afgeronde percentage.
--
--  WAT DAT KOST. Klant stort EUR 10.000 op een account met 3,5% fee. De
--  dialoog zegt: fee 3,5% = EUR 350,00, er landt EUR 9.650,00 — en de
--  admin vinkt aan dat hij EUR 9.650,00 op het account zet. Na op
--  Verifiëren drukken staat er in de database 4%, EUR 400,00 fee, en
--  EUR 9.600,00 geland. **EUR 50 minder dan wat de admin beloofd en
--  daadwerkelijk overgemaakt heeft** — en de rij zegt netjes 4%, dus elk
--  rapport is het daarna met zichzelf eens. Andersom net zo goed: 2,4%
--  wordt 2% en we innen te weinig.
--
--  En een gebroken percentage intypen kan sowieso niet: het veld staat
--  op step="0.01", maar '3.5' naar smallint sturen geeft botweg een
--  fout.
--
--  HOE DIT BLOK HET REPAREERT. Het typt de functie NIET over. Het leest
--  de tekst van de functie zoals die nu draait, vervangt daarin de drie
--  plekken waar `smallint` staat door `numeric`, controleert dat er geen
--  smallint meer in zit, en zet hem zo neer. De rest van de functie
--  blijft dus letterlijk gelijk aan wat er vandaag draait — geen
--  overtypfouten. Daarna gaat de oude versie weg.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p62;
create temp table _p62(nr int, wat text, uitkomst text);

do $blk0$
declare
  v_def  text;
  v_new  text;
begin
  -- ── 1. WAT DRAAIT ER NU ───────────────────────────────────────────
  begin
    select pg_get_functiondef('public.top_up_admin_verify(uuid, smallint)'::regprocedure)
      into v_def;
  exception when others then
    insert into _p62 values (1, 'oude functie',
      'NIET GEVONDEN (' || sqlerrm || ') — misschien al gerepareerd; kijk bij regel 4');
    return;
  end;
  insert into _p62 values (1, 'oude functie',
    'gevonden, ' || length(v_def)::text || ' tekens, ' ||
    (length(v_def) - length(replace(v_def, 'smallint', '')))/8 || ' keer het woord smallint erin');

  -- ── 2. DEZELFDE TEKST, MAAR MET NUMERIC ───────────────────────────
  v_new := replace(v_def, 'p_new_fee_percent smallint DEFAULT NULL::smallint',
                          'p_new_fee_percent numeric DEFAULT NULL::numeric');
  v_new := replace(v_new, 'v_new_fee smallint;', 'v_new_fee numeric;');

  if position('smallint' in v_new) > 0 then
    insert into _p62 values (2, 'omzetten',
      'GESTOPT — er staat nog ergens smallint in de functie die ik niet herkende. Niets veranderd.');
    return;
  end if;
  if v_new = v_def then
    insert into _p62 values (2, 'omzetten', 'GESTOPT — er viel niets te vervangen. Niets veranderd.');
    return;
  end if;

  begin
    execute v_new;
    insert into _p62 values (2, 'omzetten',
      'de numeric-versie staat er, met exact dezelfde inhoud als de versie die draaide');
  exception when others then
    insert into _p62 values (2, 'omzetten', 'MISLUKT: ' || sqlerrm || ' — niets veranderd');
    return;
  end;

  -- ── 3. DE OUDE WEG, EN HET RECHT OP DE NIEUWE ─────────────────────
  begin
    execute 'drop function if exists public.top_up_admin_verify(uuid, smallint)';
    execute 'grant execute on function public.top_up_admin_verify(uuid, numeric) to authenticated, service_role';
    insert into _p62 values (3, 'opruimen', 'oude smallint-versie weg, nieuwe aanroepbaar door een ingelogde admin');
  exception when others then
    insert into _p62 values (3, 'opruimen', 'MISLUKT: ' || sqlerrm);
  end;
end
$blk0$;

-- ── 4. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk1$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(pg_get_function_identity_arguments(p.oid), ' · '), 'BESTAAT NIET')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'top_up_admin_verify';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p62 values (4, 'top_up_admin_verify heet nu', v_txt);

  begin
    select 'fee-kolom is ' || data_type || '(' || numeric_precision || ',' || numeric_scale || ')' ||
           ' · 3,5 als smallint zou ' || (3.5::numeric::smallint)::text || ' worden'
      into v_txt
      from information_schema.columns
     where table_schema = 'public' and table_name = 'top_ups' and column_name = 'fee';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p62 values (5, 'ter controle', v_txt);

  begin
    select coalesce(string_agg(x.naam || ': ' || x.fee::text || '%', ' · ' order by x.naam), 'geen')
      into v_txt
      from (
        select a.name as naam, a.fee from public.ad_accounts a
         where a.fee is not null and a.fee <> round(a.fee)
      ) x;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p62 values (6, 'ad-accounts met een gebroken fee',
    case when v_txt = 'geen' then 'geen — nog niemand is hierdoor geraakt' else v_txt end);
end
$blk1$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p62 order by nr;
