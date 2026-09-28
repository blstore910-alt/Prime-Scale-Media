-- ════════════════════════════════════════════════════════════════════
-- PLAK 121 — niemand keurt zijn eigen opname goed
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar koos B, 28-09: niet eigenaar-only, maar twee paar ogen.
-- `requested_by <> reviewed_by`.
--
-- WAT ER MIS WAS
--
-- Dezelfde medewerker kon beide helften doen, direct achter elkaar:
--
--   1. het ad-account van een klant openen -> "Withdraw for this
--      customer" -> bedrag en reden -> dat maakt het verzoek, met
--      `requested_by = auth.uid()` (de admin);
--   2. naar /withdrawals -> Approve op datzelfde verzoek.
--
-- Het ad-account gaat leeg, de wallet van de klant omhoog, en de
-- clawback haalt commissie bij de affiliate weg. Eén persoon, twee
-- klikken, niemand anders eraan te pas. Gemeten: vier admins op deze
-- tenant, waarvan twee geen eigenaar.
--
-- De twee zusterwegen kennen dit probleem niet -- `wallet_refund_approve`
-- en `wallet_adjustment_approve` toetsen allebei op de eigenaar. Alleen
-- deze niet.
--
-- WAT HET WORDT
--
-- Wie een opname heeft aangevraagd kan hem niet goedkeuren. Meer niet.
--
-- Dit raakt een KLANT-aanvraag NIET: daar is `requested_by` de klant
-- zelf, dus een admin is nooit dezelfde persoon. De regel bijt precies
-- daar waar hij bedoeld is -- op wat de balie zelf heeft ingevoerd.
--
-- BEIDE WEGEN, want anders is de tweede een achterdeur:
-- `ad_account_withdrawal_approve` (crediteert meteen) en
-- `ad_account_withdrawal_send_to_supplier` (duwt naar de leverancier en
-- crediteert later). Allebei zetten ze een opname in beweging.
--
-- Tekstchirurgie op de huidige definitie, op [[:space:]] en op oid,
-- zodat fixes van eerdere plakken blijven staan.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak121 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak121;

do $blk0$
declare
  r      record;
  v_def  text;
  v_pat  text;
  v_rep  text;
  v_n    integer := 0;
begin
  for r in
    select p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('ad_account_withdrawal_approve',
                         'ad_account_withdrawal_send_to_supplier')
  loop
    v_def := pg_get_functiondef(r.oid);

    if position('niet je eigen aanvraag' in v_def) > 0 then
      insert into _plak121 values (v_n, r.proname, 'stond er al -- niets gedaan');
      v_n := v_n + 1;
      continue;
    end if;

    -- Vlak VOOR de pending-test, zodat "deze opname staat niet meer
    -- open" als eerste komt: dat is het antwoord dat de beheerder het
    -- meest zal zien, en het is het minst verwijtende.
    v_pat := 'if[[:space:]]+v_wd\.status[[:space:]]*<>[[:space:]]*''pending''[[:space:]]+then';

    if not (v_def ~ v_pat) then
      insert into _plak121 values (v_n, r.proname,
        'FOUT: de pending-test is niet gevonden -- niets gewijzigd');
      v_n := v_n + 1;
      continue;
    end if;

    v_rep :=
      '-- niet je eigen aanvraag' || chr(10) ||
      '  --' || chr(10) ||
      '  -- De eigenaar koos dit op 28-09: twee paar ogen in plaats van' || chr(10) ||
      '  -- eigenaar-only. Wie een opname invoert kan hem niet zelf' || chr(10) ||
      '  -- goedkeuren, want anders leegt een medewerker een ad-account' || chr(10) ||
      '  -- met twee klikken en raakt de affiliate zijn commissie kwijt' || chr(10) ||
      '  -- zonder dat iemand anders ernaar heeft gekeken.' || chr(10) ||
      '  --' || chr(10) ||
      '  -- Een aanvraag van de KLANT raakt dit niet: daar is' || chr(10) ||
      '  -- requested_by de klant, dus nooit dezelfde persoon.' || chr(10) ||
      '  if v_wd.requested_by is not null' || chr(10) ||
      '     and auth.uid() is not null' || chr(10) ||
      '     and v_wd.requested_by = auth.uid() then' || chr(10) ||
      '    raise exception ''You entered this withdrawal yourself, so somebody else has to approve it.''' || chr(10) ||
      '      using errcode = ''42501'';' || chr(10) ||
      '  end if;' || chr(10) || chr(10) ||
      '  if v_wd.status <> ''pending'' then';

    execute regexp_replace(v_def, v_pat, v_rep);

    execute 'revoke all on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') from public, anon';
    execute 'grant execute on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') to authenticated, service_role';

    insert into _plak121 values (v_n, r.proname,
      'wie hem invoerde kan hem niet goedkeuren');
    v_n := v_n + 1;
  end loop;
exception when others then
  insert into _plak121 values (9, 'twee paar ogen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle ────────────────────────────────────────────────────────
do $blk1$
declare
  v_ok    integer;
  v_anon  integer;
  v_eigen integer;
begin
  select count(*) into v_ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ad_account_withdrawal_approve',
                       'ad_account_withdrawal_send_to_supplier')
     and position('niet je eigen aanvraag' in pg_get_functiondef(p.oid)) > 0;

  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'ad_account_withdrawal%'
     and has_function_privilege('anon', p.oid, 'execute');

  -- Zou een van de bestaande rijen hier op zijn gestrand? (Alleen
  -- informatief -- de regel geldt vanaf nu, niet met terugwerkende
  -- kracht.)
  select count(*) into v_eigen
    from public.ad_account_withdrawals
   where requested_by is not null
     and reviewed_by is not null
     and requested_by = reviewed_by;

  insert into _plak121 values (10, 'stand van zaken',
    'beide wegen dicht: ' || v_ok || '/2' ||
    ' | opnamefuncties uitvoerbaar door anon: ' || v_anon || ' (moet 0)');
  insert into _plak121 values (11, 'al goedgekeurd door de eigen aanvrager',
    v_eigen || ' bestaande rij(en) -- niet aangeraakt, ter informatie');
exception when others then
  insert into _plak121 values (10, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak121 order by n;
