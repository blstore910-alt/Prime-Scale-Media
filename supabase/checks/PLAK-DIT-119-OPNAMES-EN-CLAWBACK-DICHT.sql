-- ════════════════════════════════════════════════════════════════════
-- PLAK 119 — de opnamekant dicht, en een stille clawback hoorbaar
-- ════════════════════════════════════════════════════════════════════
--
-- Uit de rechten- en geldveeg op blok 8, 28-09. Alles hieronder is op
-- de LIVE database gemeten voordat het is opgeschreven.
--
-- WAT ER IN ZIT
--
-- 1. `ad_account_withdrawal_settle` en `..._supplier_failed` hebben
--    GEEN controle op de aanroeper in zich. Ze openen met
--    `select * into v_wd ... for update` en settle doet daarna
--    `update public.wallets set usd_balance = ... + v_wd.amount`. Geen
--    _require_profile, geen tenantvergelijking, geen auth.uid()-test --
--    terwijl elke andere RPC op deze reis daarmee begint.
--
--    Vandaag veilig: gemeten
--    has_function_privilege('anon'|'authenticated', ..., 'EXECUTE') =
--    false, en de cron gebruikt de service-sleutel. Maar het slot zit
--    ALLEEN in de grant. Dat is precies de vorm waar de regel in
--    CLAUDE.md voor geschreven is: de dag dat iemand settle repareert
--    met een `create function` staat hij weer open voor PUBLIC, en dan
--    crediteert een adverteerder met een rij in `at_supplier` zijn
--    eigen wallet. Er komt een test IN de functie.
--
-- 2. Een stille clawback. `_clawback_on_ad_account_withdrawal` (en de
--    tweeling op wallet_refunds) vangt alles af met
--    `exception when others then raise warning`. Terecht dat het de
--    opname van de klant niet blokkeert -- fout dat de mislukking naar
--    het Postgres-log gaat en naar geen enkele tabel, wachtrij of
--    scherm. `referral_clawbacks` heeft een check `amount > 0` en
--    vreemde sleutels; als een daarvan afgaat is de clawback stil en
--    voorgoed weg. Nu: dezelfde warning, PLUS een melding aan de
--    eigenaar, zoals de top-upcommissie dat bij een hold al doet.
--
-- 3. Twee policies toetsen `is_active` maar niet `status`.
--    `referral_clawbacks_select` en `referral_commissions_select`
--    eindigen op `AND COALESCE(up.is_active, true)` en houden daar op,
--    terwijl _is_admin_of, _require_profile, requireAdmin,
--    resolveAdminContext, wproof_admin_read en slip_admin_read alle zes
--    ook `coalesce(up.status,'active') <> 'inactive'` toetsen. En
--    updateUserProfile staat die twee kolommen los van elkaar toe, dus
--    ze KUNNEN uit elkaar lopen. Wat er achter zit is
--    `supplier_fee_pct` en `supplier_cost`: de leveranciersfee en onze
--    marge. Vandaag niemand in die toestand (gemeten: 0 rijen), en dat
--    is het moment om het recht te zetten.
--
-- 4. `anon` houdt nog `xtm` op ad_account_withdrawals, wallet_refunds,
--    wallet_adjustments en referral_clawbacks. De gevaarlijke rechten
--    (arwd) zijn er correct af -- gemeten: SELECT/INSERT/UPDATE/DELETE
--    allemaal false -- maar REFERENCES/TRIGGER/MAINTAIN zijn nooit
--    ingetrokken. Hetzelfde voor acht triggerfuncties op deze reis die
--    EXECUTE aan PUBLIC dragen. Niet uit te buiten (een triggerfunctie
--    is niet rechtstreeks aan te roepen), wel de regel.
--
-- WAT ER MET OPZET NIET IN ZIT
--
-- Twee dingen zijn van de eigenaar en staan in de rapportage, niet
-- hier:
--
--   * EEN admin mag een opname zowel AANVRAGEN als GOEDKEUREN. De twee
--     zustertabellen zijn wel eigenaar-gepoort (wallet_refund_approve
--     en wallet_adjustment_approve hebben allebei een owner-test), deze
--     niet, en er is geen requested_by <> reviewed_by. Gemeten: vier
--     admins, waarvan twee geen eigenaar. Dat is "wie wat mag".
--   * De clawback rekent over ALLE commissie op de link, ook de
--     abonnementscommissie die een ad-accountopname niet terugdraait.
--     Gemeten op een echte rij: van EUR 2,05 teruggevorderd was EUR
--     1,03 een abonnementscommissie. Welke commissie een opname hoort
--     te raken is een beslissing, geen bug.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak119 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak119;

-- ── 1. settle en supplier_failed controleren de aanroeper zelf ──────
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
       and p.proname in ('ad_account_withdrawal_settle',
                         'ad_account_withdrawal_supplier_failed')
  loop
    v_def := pg_get_functiondef(r.oid);

    if position('alleen de server zet dit' in v_def) > 0 then
      continue;  -- staat er al
    end if;

    -- De eerste `select ... into v_wd` is het begin van het werk; de
    -- test komt daarvoor. Op [[:space:]] gematcht want de body komt met
    -- CRLF terug.
    v_pat := '(select[[:space:]]+\*[[:space:]]+into[[:space:]]+v_wd)';
    if not (v_def ~ v_pat) then
      insert into _plak119 values (0, r.proname,
        'FOUT: het begin van de body is niet herkend -- niets gewijzigd');
      continue;
    end if;

    v_rep :=
      '-- alleen de server zet dit' || chr(10) ||
      '  --' || chr(10) ||
      '  -- Deze functie crediteert een wallet en had geen enkele test' || chr(10) ||
      '  -- op de aanroeper: het slot zat alleen in de EXECUTE-grant.' || chr(10) ||
      '  -- Een `create or replace` geeft die grant aan PUBLIC terug, en' || chr(10) ||
      '  -- dan crediteert een adverteerder met een rij in at_supplier' || chr(10) ||
      '  -- zijn eigen wallet. auth.uid() is leeg voor de service-' || chr(10) ||
      '  -- sleutel en de cron, en gevuld voor iedereen met een sessie.' || chr(10) ||
      '  if auth.uid() is not null then' || chr(10) ||
      '    perform public._require_profile(''admin'');' || chr(10) ||
      '  end if;' || chr(10) ||
      '  \1';

    execute regexp_replace(v_def, v_pat, v_rep);
    execute 'revoke all on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') from public, anon, authenticated';
    execute 'grant execute on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') to service_role';
    v_n := v_n + 1;
  end loop;

  insert into _plak119 values (0, 'settle / supplier_failed',
    v_n || ' functie(s) toetsen nu zelf wie er belt; anon, public en authenticated ingetrokken');
exception when others then
  insert into _plak119 values (0, 'settle / supplier_failed',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. een mislukte clawback wordt gemeld ───────────────────────────
do $blk1$
declare
  r     record;
  v_def text;
  v_pat text;
  v_rep text;
  v_n   integer := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('_clawback_on_ad_account_withdrawal',
                         '_clawback_on_wallet_refund')
  loop
    v_def := pg_get_functiondef(r.oid);
    if position('clawback_failed' in v_def) > 0 then
      continue;
    end if;

    -- `raise warning` is de hele afhandeling. Er komt een melding bij.
    v_pat := 'exception[[:space:]]+when[[:space:]]+others[[:space:]]+then[[:space:]]+raise[[:space:]]+warning';
    if not (v_def ~ v_pat) then
      insert into _plak119 values (1, r.proname,
        'FOUT: de exception-tak is niet herkend -- niets gewijzigd');
      continue;
    end if;

    v_rep :=
      'exception when others then' || chr(10) ||
      '  -- De opname van de klant mag hier niet op stuklopen, dus de' || chr(10) ||
      '  -- fout wordt nog steeds geslikt. Maar hij ging naar het' || chr(10) ||
      '  -- Postgres-log en naar geen enkele tabel, wachtrij of scherm,' || chr(10) ||
      '  -- en een verloren clawback is geld dat bij de affiliate blijft' || chr(10) ||
      '  -- zonder dat iemand het weet. De eigenaar krijgt nu bericht.' || chr(10) ||
      '  begin' || chr(10) ||
      '    insert into public.notifications' || chr(10) ||
      '      (recipient_user_id, tenant_id, type, payload)' || chr(10) ||
      '    select tn.owner_id, tn.id, ''clawback_failed'',' || chr(10) ||
      '           jsonb_build_object(''source'', tg_table_name,' || chr(10) ||
      '                              ''row_id'', new.id::text,' || chr(10) ||
      '                              ''sqlstate'', sqlstate,' || chr(10) ||
      '                              ''reason'', sqlerrm)' || chr(10) ||
      '      from public.tenants tn' || chr(10) ||
      '     where tn.id = new.tenant_id and tn.owner_id is not null;' || chr(10) ||
      '  exception when others then null;' || chr(10) ||
      '  end;' || chr(10) ||
      '  raise warning';

    execute regexp_replace(v_def, v_pat, v_rep);
    execute 'revoke all on function public.' || quote_ident(r.proname)
         || '() from public, anon';
    execute 'grant execute on function public.' || quote_ident(r.proname)
         || '() to authenticated, service_role';
    v_n := v_n + 1;
  end loop;

  insert into _plak119 values (1, 'stille clawback',
    v_n || ' trigger(s) melden een mislukking nu aan de eigenaar in plaats van alleen aan het log');
exception when others then
  insert into _plak119 values (1, 'stille clawback',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. de twee policies toetsen ook `status` ────────────────────────
do $blk2$
declare
  r     record;
  v_q   text;
  v_n   integer := 0;
begin
  for r in
    select tablename, policyname, qual
      from pg_policies
     where policyname in ('referral_clawbacks_select',
                          'referral_commissions_select')
  loop
    if position('status' in coalesce(r.qual, '')) > 0 then
      continue;  -- al recht
    end if;
    v_q := '(' || r.qual || ') and exists (select 1 from public.user_profiles up2'
        || ' where up2.user_id = auth.uid()'
        || ' and coalesce(up2.status, ''active'') <> ''inactive'')';
    execute 'alter policy ' || quote_ident(r.policyname)
         || ' on public.' || quote_ident(r.tablename)
         || ' using (' || v_q || ')';
    v_n := v_n + 1;
  end loop;

  insert into _plak119 values (2, 'uitgezette medewerker leest geen marge meer',
    v_n || ' policy(s) toetsen nu ook status, niet alleen is_active');
exception when others then
  insert into _plak119 values (2, 'uitgezette medewerker leest geen marge meer',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 4. de resten van anon ───────────────────────────────────────────
do $blk3$
declare
  t    text;
  r    record;
  v_t  integer := 0;
  v_f  integer := 0;
begin
  foreach t in array array['ad_account_withdrawals', 'wallet_refunds',
                           'wallet_adjustments', 'referral_clawbacks']
  loop
    if to_regclass('public.' || t) is not null then
      execute 'revoke all on public.' || quote_ident(t) || ' from anon, public';
      execute 'grant select on public.' || quote_ident(t) || ' to authenticated';
      v_t := v_t + 1;
    end if;
  end loop;

  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('_clawback_on_ad_account_withdrawal',
                         '_clawback_on_wallet_refund',
                         '_cap_pending_withdrawals',
                         '_withdrawal_within_the_account',
                         '_withdrawal_takes_the_account_currency',
                         '_no_twin_wallet_refund',
                         '_no_twin_wallet_adjustment',
                         '_guard_refund_not_from_an_advance')
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute 'revoke all on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') from public, anon';
    execute 'grant execute on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') to authenticated, service_role';
    v_f := v_f + 1;
  end loop;

  insert into _plak119 values (3, 'resten van anon',
    v_t || ' tabel(len) en ' || v_f || ' functie(s) ingetrokken');
exception when others then
  insert into _plak119 values (3, 'resten van anon',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── controle ────────────────────────────────────────────────────────
do $blk4$
declare
  v_settle boolean;
  v_claw   boolean;
  v_pol    integer;
  v_anon_t integer;
  v_anon_f integer;
begin
  select coalesce(bool_and(position('alleen de server zet dit' in pg_get_functiondef(p.oid)) > 0), false)
    into v_settle
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ad_account_withdrawal_settle',
                       'ad_account_withdrawal_supplier_failed');

  select coalesce(bool_and(position('clawback_failed' in pg_get_functiondef(p.oid)) > 0), false)
    into v_claw
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('_clawback_on_ad_account_withdrawal',
                       '_clawback_on_wallet_refund');

  select count(*) into v_pol
    from pg_policies
   where policyname in ('referral_clawbacks_select', 'referral_commissions_select')
     and position('status' in coalesce(qual, '')) > 0;

  select count(*) into v_anon_t
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public';

  select count(*) into v_anon_f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname ilike '%withdraw%' or p.proname ilike '%clawback%'
          or p.proname ilike '%refund%' or p.proname ilike '%adjust%')
     and has_function_privilege('anon', p.oid, 'execute');

  insert into _plak119 values (4, 'stand van zaken',
    'settle/failed toetsen zelf: ' || v_settle::text ||
    ' | clawback meldt: ' || v_claw::text ||
    ' | policies met status: ' || v_pol || '/2' ||
    ' | tabelrechten voor anon in public: ' || v_anon_t || ' (moet 0)' ||
    ' | opname-/clawbackfuncties uitvoerbaar door anon: ' || v_anon_f || ' (moet 0)');
exception when others then
  insert into _plak119 values (4, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak119 order by n;
