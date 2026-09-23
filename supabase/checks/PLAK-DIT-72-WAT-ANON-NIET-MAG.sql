-- ════════════════════════════════════════════════════════════════════
--  PLAK 72 — wat anon niet mag, en wat een oud-medewerker niet meer mag
--
--  DIT IS DE BELANGRIJKSTE VAN VANDAAG. De publiceerbare sleutel staat
--  in de paginabundel: die heeft iedereen die de site opent. Alles
--  hieronder is daarmee bereikbaar, zonder account en zonder inloggen.
--
--  NAGEMETEN: er is nog NIETS misbruikt. Elke beslissing op top_ups is
--  door de eigenaar genomen, geen enkel walletsaldo staat negatief, de
--  ene geweigerde storting klopt tot op de cent, admins.google_refresh_
--  token is leeg, en er staat geen vervalste logregel buiten de
--  demotenant. Maar een SELECT laat geen spoor na, dus "niet misbruikt"
--  geldt alleen voor wat je kunt zien.
--
--  A  rate_limit_prune STAAT OPEN VOOR ANON, EN HEEFT GEEN ONDERGRENS.
--     Zijn broer rate_limit_check is netjes ingetrokken; de functie die
--     de emmers WIST niet. Eén POST met p_older_than_seconds = -99999999
--     raakt elke rij: inlogpogingen, uitnodigingen, het aanmaken van
--     stortingen en de financiële rem in withdrawal-actions.ts staan
--     daarna allemaal weer op nul. In een lus draaien en de limiter telt
--     nooit meer tot iets. Het alarm in de cron leest dezelfde tabel, dus
--     dat valt ook stil.
--
--  B  public.admins HEEFT RLS UIT EN ANON HEEFT ER VOLLEDIG CRUD OP.
--     Er staan twee policies op — die doen NIETS zolang RLS uit staat.
--     De tabel is gebouwd om google_refresh_token te dragen: een
--     langlevend Google-token van de eigenaar. Vandaag leeg; de dag dat
--     Google gekoppeld wordt is het te laat. Niets in de code leest deze
--     tabel, dus intrekken kost niks.
--
--  C  EEN MEDEWERKER-ADMIN KAN SALDO UIT HET NIETS MAKEN.
--     _guard_top_ups_session_write legt zijn kolomlijst alleen op bij
--     UPDATE. Bij INSERT kijkt hij naar de tenant en verder niets — en
--     `wallet_debited` is een kolom die de aanroeper zet, geen feit dat
--     het systeem vaststelt. Dus: rij invoegen met wallet_debited = true
--     en status pending, dan top_up_admin_reject aanroepen, en
--     refund_wallet_on_topup_rejected zet EUR 10.000 in een wallet waar
--     niemand voor betaald heeft. De wachtrij toont een geweigerde
--     betaling, wat er volstrekt normaal uitziet. Zelfde vorm met
--     affiliate_id: rij invoegen, op completed zetten, en er staat
--     commissie op een storting die nooit is gedaan.
--
--  D  raise_integration_failure STAAT OPEN VOOR ANON. Die schrijft een
--     melding naar élke actieve admin van een tenant, met 500 tekens die
--     de aanroeper meegeeft — in dezelfde bel waar het geld wordt
--     goedgekeurd, in de eigen opmaak van de app.
--
--  E  DE LOGREGEL DIE DE EIGENAAR LEEST IS DOOR IEDEREEN TE SCHRIJVEN.
--     Policy logs_write_unchanged is `with check (true)`, en insert_log
--     schrijft de tenant die de AANROEPER meegeeft. Een adverteerder zet
--     er "WALLET_ADJUSTED" in met de profiel-id van de eigenaar erop, en
--     het activiteitenscherm toont een correctie die de eigenaar nooit
--     gemaakt heeft. audit_events zelf is wél dichtgetimmerd, dus het
--     forensische spoor overleeft — het scherm waar men naar kijkt niet.
--
--  F  TWEE GELD-RPC'S MISSEN DE STATUS-CONTROLE.
--     ad_account_request_reject_refund en wallet_precharge_cancel kijken
--     naar role en is_active, maar niet naar status <> 'inactive'. Elke
--     andere wachter in de app kijkt naar allebei. Een weggestuurde
--     medewerker die op status is uitgezet, wordt door elk scherm
--     geweigerd en kan via PostgREST nog steeds EUR 50 terugduwen in een
--     wallet of een voorschot intrekken.
--
--  G  IEDEREEN DIE INGELOGD IS LEEST ELKE TENANT.
--     tenants_signed_in_select is `auth.uid() is not null`. Dat geeft
--     naam, slug, eigenaar en status van elke andere tenant — en de
--     tenant-id's die D hierboven nodig heeft.
--
--  H  TWEE PRIJS-RPC'S ZIJN AAN TE ROEPEN ZONDER IN TE LOGGEN.
--     _effective_topup_fee_pct en _effective_subscription_amount geven,
--     met een adverteerder-id, precies het feepercentage en het
--     kortingsbedrag dat die klant betaalt.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p72;
create temp table _p72(nr int, wat text, uitkomst text);

-- ── A. DE LIMIETEN WISSEN IS NIET VOOR IEDEREEN ──────────────────────
do $blk0$
begin
  execute $fn$
    create or replace function public.rate_limit_prune(p_older_than_seconds integer default 86400)
    returns integer
    language sql
    security definer
    set search_path to 'public'
    as $body$
      with deleted as (
        delete from public.rate_limit_buckets
         where window_start < clock_timestamp()
               -- Een ondergrens van een uur: een negatieve of piepkleine
               -- waarde wiste anders ALLES, inclusief de emmer van de
               -- aanroeper zelf.
               - make_interval(secs => greatest(coalesce(p_older_than_seconds, 86400), 3600))
         returning 1
      )
      select count(*)::integer from deleted;
    $body$;
  $fn$;
  execute 'revoke all on function public.rate_limit_prune(integer) from public, anon, authenticated';
  execute 'grant execute on function public.rate_limit_prune(integer) to service_role';
  insert into _p72 values (1, 'de limieten wissen',
    'alleen service_role, en niet verder terug dan een uur');
exception when others then
  insert into _p72 values (1, 'de limieten wissen', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. public.admins ─────────────────────────────────────────────────
do $blk1$
begin
  execute 'alter table public.admins enable row level security';
  execute 'alter table public.admins force row level security';
  execute 'revoke all on table public.admins from anon, authenticated';
  execute 'grant select, insert, update, delete on table public.admins to service_role';
  insert into _p72 values (2, 'de tabel met het Google-token',
    'RLS aan en geforceerd, anon en authenticated hebben er niets meer op');
exception when others then
  insert into _p72 values (2, 'de tabel met het Google-token', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── C. DRIE KOLOMMEN DIE EEN AANROEPER NIET ZET ──────────────────────
do $blk2$
declare v_done text := '';
begin
  begin
    execute 'revoke insert (wallet_debited, verified_at, affiliate_id),
                    update (wallet_debited, verified_at, affiliate_id)
               on table public.top_ups from anon, authenticated';
    v_done := 'top_ups: wallet_debited, verified_at, affiliate_id ingetrokken';
  exception when others then
    v_done := 'top_ups MISLUKT: ' || sqlerrm;
  end;
  insert into _p72 values (3, 'saldo uit het niets', v_done);
end
$blk2$;

-- ── D. HET ALARM IS VOOR DE CRON ─────────────────────────────────────
do $blk3$
declare
  r      record;
  v_done text := '';
begin
  for r in
    select 'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('raise_integration_failure',
                         'audit_events_capture_monthly_stats',
                         'audit_events_archive_candidates')
  loop
    begin
      execute 'revoke all on function ' || r.sig || ' from public, anon, authenticated';
      execute 'grant execute on function ' || r.sig || ' to service_role';
      v_done := v_done || r.proname || ' · ';
    exception when others then
      v_done := v_done || r.proname || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;
  insert into _p72 values (4, 'alarm en onderhoud zijn voor de cron',
    case when v_done = '' then 'geen van de drie gevonden' else rtrim(v_done, ' ·') end);
end
$blk3$;

-- ── E. DE LOGREGEL DRAAGT DE TENANT VAN DE AANROEPER ─────────────────
do $blk4$
begin
  execute 'drop policy if exists "logs_write_unchanged" on public.logs';
  execute $pol$
    create policy logs_write_admin on public.logs
      for insert to authenticated
      with check (
        public._is_admin_of(tenant_id)
        and author_profile_id = public.get_current_profile_id()
      )
  $pol$;
  insert into _p72 values (5, 'wie schrijft in het activiteitenlog',
    'alleen een admin van diezelfde tenant, en alleen onder zijn eigen profiel-id');
exception when others then
  insert into _p72 values (5, 'wie schrijft in het activiteitenlog', 'MISLUKT: ' || sqlerrm);
end
$blk4$;

do $blk5$
begin
  execute $fn$
    create or replace function public.insert_log(
      p_action text, p_db_action text, p_table_name text,
      p_record_id uuid, p_data_snapshot jsonb, p_tenant_id uuid default null)
    returns void
    language plpgsql
    security definer
    set search_path to 'public'
    as $body$
    declare v_profile uuid; v_tenant uuid;
    begin
      select up.id, up.tenant_id into v_profile, v_tenant
        from public.user_profiles up
       where up.user_id = auth.uid()
         and up.role = 'admin'
         and coalesce(up.is_active, true)
         and coalesce(up.status, 'active') <> 'inactive'
       order by up.created_at asc
       limit 1;
      if v_profile is null then
        return;
      end if;
      -- De tenant is die van de AANROEPER, nooit die uit het bericht.
      insert into public.logs (author_profile_id, tenant_id, action, db_action,
                               table_name, reference_record_id, data_snapshot)
      values (v_profile, v_tenant, p_action, p_db_action,
              p_table_name, p_record_id, p_data_snapshot);
    end
    $body$;
  $fn$;
  execute 'revoke all on function public.insert_log(text, text, text, uuid, jsonb, uuid) from public, anon';
  execute 'grant execute on function public.insert_log(text, text, text, uuid, jsonb, uuid) to authenticated, service_role';
  insert into _p72 values (6, 'insert_log',
    'schrijft de tenant en het profiel van de aanroeper; het argument p_tenant_id wordt genegeerd');
exception when others then
  insert into _p72 values (6, 'insert_log', 'MISLUKT: ' || sqlerrm);
end
$blk5$;

-- ── F. UITGEZET IS UITGEZET ──────────────────────────────────────────
do $blk6$
declare
  r      record;
  v_def  text;
  v_new  text;
  v_sig  text;
  v_done text := '';
begin
  for r in
    select p.oid, p.proname,
           'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('ad_account_request_reject_refund', 'wallet_precharge_cancel')
  loop
    begin
      v_def := pg_get_functiondef(r.oid);
      v_sig := r.sig;

      if position('up.status' in v_def) > 0 then
        v_done := v_done || r.proname || ': stond al goed · ';
        continue;
      end if;

      -- Alleen de regel die de admin opzoekt. Witruimte-tolerant, want
      -- de functies staan hier met CRLF.
      v_new := regexp_replace(
        v_def,
        'and[[:space:]]+coalesce\(up\.is_active,[[:space:]]*true\)',
        'and coalesce(up.is_active, true)' || chr(13) || chr(10) ||
        '     and coalesce(up.status, ''active'') <> ''inactive''',
        'gi');

      if v_new = v_def then
        v_done := v_done || r.proname || ': NIET AANGEPAST (regel niet herkend) · ';
        continue;
      end if;

      execute v_new;
      execute 'revoke all on function ' || v_sig || ' from public, anon';
      execute 'grant execute on function ' || v_sig || ' to authenticated, service_role';
      v_done := v_done || r.proname || ': aangepast · ';
    exception when others then
      v_done := v_done || r.proname || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _p72 values (7, 'een uitgezette admin',
    case when v_done = '' then 'geen van beide functies gevonden' else rtrim(v_done, ' ·') end);
end
$blk6$;

-- ── G. EEN TENANT IS VOOR ZIJN EIGEN MENSEN ──────────────────────────
do $blk7$
begin
  execute 'drop policy if exists tenants_signed_in_select on public.tenants';
  execute $pol$
    create policy tenants_member_select on public.tenants
      for select to authenticated
      using (
        exists (
          select 1 from public.user_profiles up
           where up.user_id = auth.uid() and up.tenant_id = tenants.id
        )
      )
  $pol$;
  insert into _p72 values (8, 'wie leest een tenant',
    'alleen iemand met een profiel IN die tenant');
exception when others then
  insert into _p72 values (8, 'wie leest een tenant', 'MISLUKT: ' || sqlerrm);
end
$blk7$;

-- ── H. EEN PRIJS VRAAG JE INGELOGD ───────────────────────────────────
do $blk8$
declare
  r      record;
  v_n    int := 0;
  v_done text := '';
begin
  for r in
    select 'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       -- get_invite_by_token MOET open: die draait op het aanmeldscherm,
       -- vóórdat iemand is ingelogd.
       and p.proname <> 'get_invite_by_token'
  loop
    begin
      -- INTREKKEN VAN PUBLIC, DAN TERUGGEVEN AAN authenticated. Alleen
      -- `from anon` helpt niet: anon erft van PUBLIC. En alleen
      -- intrekken breekt RLS, want een policy die _require_profile of
      -- is_admin_user aanroept draait als de LEZER, niet als de
      -- eigenaar van de functie — zonder EXECUTE geeft elke select op
      -- die tabel een fout.
      execute 'revoke all on function ' || r.sig || ' from public, anon';
      execute 'grant execute on function ' || r.sig || ' to authenticated, service_role';
      v_n := v_n + 1;
      v_done := v_done || r.proname || ' · ';
    exception when others then
      v_done := v_done || r.proname || ' MISLUKT · ';
    end;
  end loop;

  insert into _p72 values (9, 'elke functie die anon nog mocht aanroepen',
    case when v_n = 0 then 'er stond er geen meer open'
         else v_n::text || ' ingetrokken: ' || rtrim(v_done, ' ·') end);
end
$blk8$;

-- ── I. EN DE LAATSTE TWEE WACHTRIJEN DIE ZONDER REDEN KONDEN ─────────
--  Plak 71 doet ad_account_requests en ad_account_withdrawals; deze twee
--  bewaren hun tekst in `reason`, dus ze hebben dezelfde wachter nodig
--  met een andere kolomnaam.
do $blk9$
declare
  r      record;
  v_done text := '';
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_guard_rejection_needs_reason_col'
  ) then
    insert into _p72 values (10, 'weigering zonder reden',
      'OVERGESLAGEN — plak 71 moet eerst, die maakt de wachter');
    return;
  end if;

  for r in select unnest(array['wallet_refunds', 'wallet_adjustments']) as tab loop
    begin
      execute format('drop trigger if exists a1_guard_rejection_needs_reason on public.%I', r.tab);
      execute format('create trigger a1_guard_rejection_needs_reason
                        before update on public.%I
                        for each row execute function public._guard_rejection_needs_reason_col(%L)',
                     r.tab, 'reason');
      v_done := v_done || r.tab || ' · ';
    exception when others then
      v_done := v_done || r.tab || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _p72 values (10, 'weigering zonder reden', rtrim(v_done, ' ·'));
end
$blk9$;

-- ── J. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk10$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(p.proname, ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p72 values (11, 'functies die anon nog mag aanroepen',
    coalesce(nullif(v_txt, 'geen'), 'geen'));

  begin
    select coalesce(string_agg(c.relname || ' (' ||
             case when c.relrowsecurity then 'RLS aan' else 'RLS UIT' end || ')',
             ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and not c.relrowsecurity
       and has_table_privilege('anon', c.oid, 'SELECT');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p72 values (12, 'tabellen zonder RLS die anon mag lezen', v_txt);

  begin
    select coalesce(count(*)::text, '0') || ' top_ups-rijen met wallet_debited = true'
      into v_txt
      from public.top_ups where wallet_debited = true;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p72 values (13, 'is er al saldo uit het niets gemaakt', v_txt);

  begin
    select coalesce(count(*)::text, '0') || ' wallets met een negatief saldo'
      into v_txt
      from public.wallets
     where coalesce(eur_balance, 0) < 0 or coalesce(usd_balance, 0) < 0;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p72 values (14, 'en klopt het saldo nog', v_txt);
end
$blk10$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p72 order by nr;
