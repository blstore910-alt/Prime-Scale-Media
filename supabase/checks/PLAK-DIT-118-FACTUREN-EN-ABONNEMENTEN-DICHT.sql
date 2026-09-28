-- ════════════════════════════════════════════════════════════════════
-- PLAK 118 — vier gaten rond facturen en abonnementen
-- ════════════════════════════════════════════════════════════════════
--
-- Gevonden door de rechten-veeg op blok 7, 28-09. Alles hieronder is
-- op de LIVE database gemeten voordat het is opgeschreven.
--
-- WAT ER MIS IS
--
-- 1. EEN BETAALDE FACTUUR KAN TERUG NAAR ONBETAALD, LANGS DE APP HEEN.
--
--    De server-action weigert paid -> unpaid, met een noot die zegt
--    waarom: de wallet wordt niet terugbetaald, en de dagelijkse
--    incasso pakt elke onbetaalde abonnementsfactuur die over zijn
--    vervaldatum is. De klant wordt dan twee keer belast voor dezelfde
--    maand.
--
--    Maar diezelfde rol mag die kolom rechtstreeks schrijven:
--    has_column_privilege('authenticated','invoices','status','UPDATE')
--    is true, het enige beleid op de tabel is "Enable ALL for admin",
--    en de trigger a0_guard_invoices_session_write bewaakt
--    tenant_id, advertiser_id, total, currency, type, sub_total, items
--    en subscription_id -- status en paid_at staan er NIET in.
--
--    Dus een medewerker-admin die in de console van zijn browser
--    `.update({status:'unpaid', paid_at:null})` doet, draait een
--    afgerekende factuur terug en de nachtrun int hem opnieuw. En
--    void -> paid komt er ook langs, wat een geannuleerde factuur op
--    betaald zet zonder weg terug.
--
-- 2. HET ABONNEMENTSSLOT ZIT ALLEEN OP UPDATE VAN amount EN currency.
--
--    Drie plekken in de code toetsen op de eigenaar, met de noot "een
--    verborgen knop is geen grens". De database doet dat alleen bij
--    een UPDATE: trg_money_columns_owner is tgtype 19 = ROW|BEFORE|
--    UPDATE, en zijn sleutellijst voor subscriptions is precies
--    array['amount'] en array['currency'].
--
--    Dus INSERT en DELETE staan open, en `status` ook. Een
--    medewerker-admin voegt een rij toe van EUR 2000 met status
--    'active', subscription_billing_run maakt er die nacht een factuur
--    van en de incasso haalt hem van de wallet. Of goedkoper: hij zet
--    een bestaande inactieve rij op 'active'.
--
--    LET OP -- waarom de test op "admin" staat en niet op "niet de
--    eigenaar": create_subscription_from_invite draait als SECURITY
--    DEFINER, maar auth.uid() is daarbinnen NIET null -- dat is de
--    net-aangemelde KLANT. Een simpele eigenaarstest zou dus elke
--    aanmelding breken. De klant is geen admin, dus die komt er langs.
--
-- 3. GEEN IDENTITEIT WAS DE MEEST BEVOEGDE AANROEPER.
--
--    invoice_pay_from_wallet begint met
--    `if v_uid is null then v_allowed := true;`. Dat is met opzet zo
--    voor de cron: subscription_billing_run en
--    process_recurring_subscriptions roepen deze functie aan met de
--    service-sleutel, en daar is auth.uid() leeg. Die tak moet dus
--    blijven.
--
--    Maar hij zegt nu "geen identiteit" waar hij "de service-sleutel"
--    bedoelt. Postgres kan dat onderscheid wel maken: bij een aanroep
--    uit de browser is current_user 'authenticated', bij de cron is
--    het service_role of postgres. Anon kan hem vandaag niet uitvoeren
--    (gemeten), dus dit is geen open deur -- het is het dichtzetten van
--    een aanname voordat de volgende aanroeper hem erft.
--
-- 4. TIEN FACTUURFUNCTIES DRAGEN NOG EXECUTE VOOR PUBLIC.
--
--    Niet uit te buiten: het zijn allemaal triggerfuncties, en
--    Postgres weigert een directe aanroep daarvan. Maar de regel uit
--    CLAUDE.md is niet op deze familie toegepast, en
--    handle_invoice_payment_update hangt aan GEEN ENKELE trigger --
--    dode code die wel aan PUBLIC is gegeven.
--
-- HOE
--
-- Tekstchirurgie waar de functie fixes van eerdere plakken draagt, een
-- volledige create waar de functie nieuw is. Op [[:space:]] gematcht,
-- want pg_get_functiondef geeft op deze database CRLF terug, en op oid
-- aangesproken in plaats van op een signatuur met parameternamen.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak118 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak118;

-- ── 1. een betaalde factuur blijft betaald ──────────────────────────
do $blk0$
declare
  v_oid oid;
  v_def text;
  v_pat text;
  v_rep text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_guard_invoices_session_write'
   limit 1;

  if v_oid is null then
    insert into _plak118 values (1, 'factuurstatus',
      'AFGEBROKEN: _guard_invoices_session_write bestaat niet');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('een betaalde factuur blijft betaald' in v_def) > 0 then
    insert into _plak118 values (1, 'factuurstatus', 'stond er al -- niets gedaan');
    return;
  end if;

  -- Ingevoegd VOOR de bestaande INSERT-tak, zodat al het andere in
  -- deze functie ongemoeid blijft.
  v_pat := 'if[[:space:]]+tg_op[[:space:]]*=[[:space:]]*''INSERT''[[:space:]]+then';
  if not (v_def ~ v_pat) then
    insert into _plak118 values (1, 'factuurstatus',
      'FOUT: de INSERT-tak is niet gevonden -- niets gewijzigd');
    return;
  end if;

  v_rep :=
    '-- een betaalde factuur blijft betaald' || chr(10) ||
    '  --' || chr(10) ||
    '  -- De server-action weigert paid -> unpaid al, met de reden:' || chr(10) ||
    '  -- de wallet wordt niet terugbetaald en de nachtelijke incasso' || chr(10) ||
    '  -- pakt elke onbetaalde abonnementsfactuur over zijn vervaldatum,' || chr(10) ||
    '  -- dus de klant betaalt twee keer voor dezelfde maand. Die regel' || chr(10) ||
    '  -- stond alleen in TypeScript, terwijl dezelfde rol de kolom' || chr(10) ||
    '  -- rechtstreeks mag schrijven.' || chr(10) ||
    '  if tg_op = ''UPDATE'' then' || chr(10) ||
    '    if coalesce(old.status, '''') = ''paid''' || chr(10) ||
    '       and new.status is distinct from old.status then' || chr(10) ||
    '      raise exception ''invoices: a paid invoice stays paid. The wallet is never re-credited, so reopening it can collect the same money twice. Issue a refund or a credit note.''' || chr(10) ||
    '        using errcode = ''42501'';' || chr(10) ||
    '    end if;' || chr(10) ||
    '    if coalesce(old.status, '''') = ''void''' || chr(10) ||
    '       and coalesce(new.status, '''') = ''paid'' then' || chr(10) ||
    '      raise exception ''invoices: a cancelled invoice cannot be marked paid. Raise a new one.''' || chr(10) ||
    '        using errcode = ''42501'';' || chr(10) ||
    '    end if;' || chr(10) ||
    '  end if;' || chr(10) || chr(10) ||
    '  if tg_op = ''INSERT'' then';

  execute regexp_replace(v_def, v_pat, v_rep);

  execute 'revoke all on function public._guard_invoices_session_write() from public, anon';
  execute 'grant execute on function public._guard_invoices_session_write() to authenticated, service_role';

  insert into _plak118 values (1, 'factuurstatus',
    'paid -> iets anders en void -> paid worden nu door de database geweigerd bij een sessieschrijf');
exception when others then
  insert into _plak118 values (1, 'factuurstatus', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2a. status hoort bij de bewaakte kolommen van een abonnement ────
do $blk1$
declare
  v_oid oid;
  v_def text;
  v_pat text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_money_columns_are_the_owners'
   limit 1;

  if v_oid is null then
    insert into _plak118 values (2, 'abonnementsstatus',
      'AFGEBROKEN: _money_columns_are_the_owners bestaat niet');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('''currency'', ''status''' in v_def) > 0 then
    insert into _plak118 values (2, 'abonnementsstatus', 'stond er al -- niets gedaan');
    return;
  end if;

  v_pat := 'txt_keys[[:space:]]*:=[[:space:]]*array\[''currency''\];';
  if not (v_def ~ v_pat) then
    insert into _plak118 values (2, 'abonnementsstatus',
      'FOUT: de sleutellijst voor subscriptions is niet gevonden -- niets gewijzigd');
    return;
  end if;

  -- status erbij: een inactieve rij op 'active' zetten is precies zo
  -- duur als het bedrag veranderen -- de incasso gaat er die nacht
  -- overheen.
  execute regexp_replace(v_def, v_pat, 'txt_keys := array[''currency'', ''status''];');

  execute 'revoke all on function public._money_columns_are_the_owners() from public, anon';
  execute 'grant execute on function public._money_columns_are_the_owners() to authenticated, service_role';

  insert into _plak118 values (2, 'abonnementsstatus',
    'status staat nu naast amount en currency in het eigenaarsslot');
exception when others then
  insert into _plak118 values (2, 'abonnementsstatus', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 2b. een abonnement AANMAKEN of WEGGOOIEN is ook de eigenaar ─────
do $blk2$
begin
  create or replace function public._subscription_rows_are_the_owners()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_uid    uuid := auth.uid();
    v_tenant uuid;
    v_owner  uuid;
    v_row    record;
  begin
    -- In een DELETE-trigger is NEW niet toegekend: `new.tenant_id`
    -- aanraken geeft dan "record new is not assigned yet". Dus eerst
    -- kiezen welke rij we hebben, en daarna pas een kolom lezen.
    if tg_op = 'DELETE' then
      v_row := old;
    else
      v_row := new;
    end if;

    -- De service-sleutel en de cron: geen mens aan de knoppen.
    if v_uid is null then
      return v_row;
    end if;

    v_tenant := v_row.tenant_id;

    -- ALLEEN ADMINS, met opzet.
    --
    -- create_subscription_from_invite is SECURITY DEFINER maar
    -- auth.uid() is daarbinnen de net-aangemelde KLANT, niet null. Een
    -- kale eigenaarstest zou dus elke aanmelding breken. Een klant is
    -- geen admin en komt hier langs; een medewerker-admin niet.
    if not exists (
      select 1 from public.user_profiles up
       where up.user_id = v_uid
         and up.role = 'admin'
         and coalesce(up.is_active, true) = true
         and coalesce(up.status, 'active') <> 'inactive'
    ) then
      return v_row;
    end if;

    select t.owner_id into v_owner from public.tenants t where t.id = v_tenant;
    if v_owner is not null and v_owner = v_uid then
      return v_row;
    end if;

    raise exception
      'Only the super-admin can start or remove a subscription. What a customer pays every month is a price, not a setting.'
      using errcode = '42501';
  end;
  $fn$;

  revoke all on function public._subscription_rows_are_the_owners() from public, anon;
  grant execute on function public._subscription_rows_are_the_owners()
    to authenticated, service_role;

  drop trigger if exists a1_subscription_rows_are_the_owners on public.subscriptions;
  create trigger a1_subscription_rows_are_the_owners
    before insert or delete on public.subscriptions
    for each row execute function public._subscription_rows_are_the_owners();

  insert into _plak118 values (3, 'abonnement aanmaken/weggooien',
    'een admin die niet de eigenaar is kan geen abonnementsrij meer toevoegen of verwijderen; aanmelden via uitnodiging blijft werken');
exception when others then
  insert into _plak118 values (3, 'abonnement aanmaken/weggooien',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 3. "geen identiteit" is de cron, niet iedereen ──────────────────
do $blk3$
declare
  v_oid oid;
  v_def text;
  v_pat text;
  v_rep text;
  v_args text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoice_pay_from_wallet'
   limit 1;

  if v_oid is null then
    insert into _plak118 values (4, 'betalen zonder identiteit',
      'AFGEBROKEN: invoice_pay_from_wallet bestaat niet');
    return;
  end if;

  v_def  := pg_get_functiondef(v_oid);
  v_args := pg_get_function_identity_arguments(v_oid);

  if position('current_user <> ''authenticated''' in v_def) > 0 then
    insert into _plak118 values (4, 'betalen zonder identiteit',
      'stond er al -- niets gedaan');
    return;
  end if;

  v_pat :=
    'if[[:space:]]+v_uid[[:space:]]+is[[:space:]]+null[[:space:]]+then[[:space:]]+v_allowed[[:space:]]*:=[[:space:]]*true;';
  if not (v_def ~ v_pat) then
    insert into _plak118 values (4, 'betalen zonder identiteit',
      'FOUT: de aanroepertest is niet gevonden -- niets gewijzigd');
    return;
  end if;

  -- De cron-tak blijft, hij wordt alleen benoemd. subscription_billing_run
  -- en process_recurring_subscriptions roepen deze functie met de
  -- service-sleutel aan; daar is auth.uid() leeg en current_user
  -- service_role of postgres. Uit de browser is current_user altijd
  -- 'authenticated'.
  v_rep :=
    'if v_uid is null and current_user <> ''authenticated'' then' || chr(10) ||
    '    v_allowed := true;';

  execute regexp_replace(v_def, v_pat, v_rep);

  execute 'revoke all on function public.invoice_pay_from_wallet(' || v_args || ') from public, anon';
  execute 'grant execute on function public.invoice_pay_from_wallet(' || v_args || ') to authenticated, service_role';

  insert into _plak118 values (4, 'betalen zonder identiteit',
    'een lege auth.uid() geeft alleen nog toegang buiten een sessie-aanroep om (de cron); de incasso blijft werken');
exception when others then
  insert into _plak118 values (4, 'betalen zonder identiteit',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── 4. de revokes, en de dode functie eruit ─────────────────────────
do $blk4$
declare
  r      record;
  v_n    integer := 0;
  v_dood integer := 0;
begin
  for r in
    select p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         '_on_subscription_invoice_paid',
         'create_invoice_for_subscription',
         'handle_referral_commission_on_invoice_paid',
         '_guard_invoices_session_write',
         '_invoice_first_subscription_due_date',
         'create_commission_from_invoice',
         'create_invoice_for_wallet_topup',
         'log_invoice_activity',
         'log_subscription_activity'
       )
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute 'revoke all on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') from public, anon';
    execute 'grant execute on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') to authenticated, service_role';
    v_n := v_n + 1;
  end loop;

  -- handle_invoice_payment_update hangt aan geen enkele trigger. Weg,
  -- maar alleen als dat nog steeds zo is op het moment dat dit draait.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'handle_invoice_payment_update'
  ) and not exists (
    select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
     where p.proname = 'handle_invoice_payment_update' and not t.tgisinternal
  ) then
    drop function if exists public.handle_invoice_payment_update();
    v_dood := 1;
  end if;

  insert into _plak118 values (5, 'rechten op de factuurfuncties',
    v_n || ' functies ingetrokken van public/anon' ||
    case when v_dood = 1
         then '; handle_invoice_payment_update verwijderd (hing aan geen trigger)'
         else '; geen dode functie gevonden' end);
exception when others then
  insert into _plak118 values (5, 'rechten op de factuurfuncties',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ── controle ────────────────────────────────────────────────────────
do $blk5$
declare
  v_fact   boolean;
  v_status boolean;
  v_trig   integer;
  v_uid    boolean;
  v_anon   integer;
  v_tabel  integer;
begin
  select position('een betaalde factuur blijft betaald' in pg_get_functiondef(p.oid)) > 0
    into v_fact
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_guard_invoices_session_write';

  select position('''currency'', ''status''' in pg_get_functiondef(p.oid)) > 0
    into v_status
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_money_columns_are_the_owners';

  select count(*) into v_trig
    from pg_trigger
   where tgname = 'a1_subscription_rows_are_the_owners' and not tgisinternal;

  select position('current_user <> ''authenticated''' in pg_get_functiondef(p.oid)) > 0
    into v_uid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoice_pay_from_wallet';

  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname ilike '%invoice%' or p.proname ilike '%subscription%')
     and has_function_privilege('anon', p.oid, 'execute');

  select count(*) into v_tabel
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public';

  insert into _plak118 values (6, 'stand van zaken',
    'betaald blijft betaald: ' || coalesce(v_fact, false)::text ||
    ' | status in het slot: ' || coalesce(v_status, false)::text ||
    ' | insert/delete-trigger: ' || v_trig || '/1' ||
    ' | lege uid dichtgezet: ' || coalesce(v_uid, false)::text);
  insert into _plak118 values (7, 'wat anon nog mag',
    'factuur-/abonnementsfuncties uitvoerbaar door anon: ' || v_anon || ' (moet 0)' ||
    ' | tabelrechten voor anon in public: ' || v_tabel || ' (moet 0)');
exception when others then
  insert into _plak118 values (6, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak118 order by n;
