-- =====================================================================
-- PLAK 4 — de tabel waar elke admin zichzelf geld kon geven
-- =====================================================================
-- Vanavond is `wallet_admin_adjust` eigenaar-only gemaakt, omdat een
-- werknemer-admin daarmee elke wallet met elk bedrag kon ophogen vanuit
-- de console. Eén tabel verderop staat precies dezelfde macht nog open,
-- en die heeft niet eens een functie nodig.
--
-- `wallet_topups` draagt deze policy:
--
--   create policy "Enable ALL for admin" on public.wallet_topups
--     for all to authenticated
--     using (_is_admin_of(tenant_id)) with check (_is_admin_of(tenant_id));
--
-- FOR ALL is insert + update + delete. En de saldo-trigger hangt aan
-- `after update of status`. Dus:
--
--   await supabase.from('wallet_topups').insert({
--     wallet_id: W, advertiser_id: A, tenant_id: T,
--     currency: 'EUR', amount: 250000, status: 'pending' });
--   await supabase.from('wallet_topups')
--     .update({ status: 'completed' }).eq('id', ID);
--
-- Twee regels, EUR 250.000 bijgeschreven. Geen eigenaar, geen tweede
-- paar ogen, geen `approved_by` (die blijft leeg, dus de desk ziet niet
-- eens wie het deed), geen pending-controle, geen advance-afhandeling.
-- Elke controle die in `wallet_topup_admin_verify` zit wordt
-- overgeslagen, want er komt geen functie aan te pas. Het staat wél in
-- audit_events -- naspeurbaar, niet voorkomen.
--
-- ── WAT DIT DOET ─────────────────────────────────────────────────────
--
-- Postgres controleert eerst het GRANT en dan pas de policy. Dus in
-- plaats van aan de policy te sleutelen (die ook het LEZEN regelt, dat
-- elke admin nodig heeft) gaat het recht om te SCHRIJVEN eraf:
--
--   revoke insert, update, delete on wallet_topups from authenticated
--
-- Lezen blijft. Alle schrijfwegen die de app echt gebruikt blijven
-- werken, want ze lopen allemaal langs iets dat NIET `authenticated` is:
--
--   * wallet_topup_advertiser_create / _admin_verify / _reject / _undo
--     en wise_confirm_suggestion zijn SECURITY DEFINER -- die draaien
--     als de eigenaar van de functie, niet als de aanroeper.
--   * adjustWalletTopupAmount was de laatste plek in de app die deze
--     tabel als de AANROEPER schreef, en die gaat sinds vandaag via de
--     service-role. De rij wordt daar nog steeds eerst teruggelezen, de
--     tenant vergeleken en de status gecontroleerd.
--   * de Wise-webhook draait al op de service-role.
--
-- `wallets` krijgt dezelfde behandeling: die had geen UPDATE-policy
-- (goed) maar wél een DELETE voor admins -- een wallet weggooien is
-- geen desk-handeling.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

do $blk0$
declare
  t text;
begin
  foreach t in array array['wallet_topups', 'wallets'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'tabel niet aanwezig, overgeslagen: %', t;
      continue;
    end if;
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('revoke insert, update, delete on public.%I from anon', t);
    -- Lezen blijft expliciet staan, zodat een eerdere grant die alleen
    -- "ALL" was niet ook het lezen meeneemt.
    execute format('grant select on public.%I to authenticated', t);
    -- En de service-role houdt alles: cron, webhook en server-acties.
    execute format('grant all on public.%I to service_role', t);
    raise notice 'schrijfrecht ingetrokken voor authenticated: %', t;
  end loop;
end;
$blk0$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
-- Regel 1 t/m 3 is de fix. Regel 10 t/m 14 zijn de dingen die ik van
-- geen van de agents kon laten bewijzen omdat ze niet in deze repo
-- staan -- en 11 is de belangrijkste van de hele avond: staat er
-- ECHT maar één saldo-trigger op wallet_topups? Zo niet, dan is elke
-- top-up dubbel bijgeschreven en valt dat niet op, omdat verify + undo
-- netjes naar nul terugrekent.
-- =====================================================================
select 1 as nr, 'kan `authenticated` nog schrijven op wallet_topups' as item,
  coalesce((
    select string_agg(distinct privilege_type, ', ' order by privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'wallet_topups'
       and grantee = 'authenticated'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'nee - alleen lezen') as antwoord
union all
select 2, 'kan `authenticated` nog schrijven op wallets',
  coalesce((
    select string_agg(distinct privilege_type, ', ' order by privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'wallets'
       and grantee = 'authenticated'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'nee - alleen lezen')
union all
select 3, 'lezen werkt nog: top-ups zichtbaar voor JOU, nu',
  (select count(*)::text from public.wallet_topups)
union all
select 10, 'policies op wallet_topups',
  coalesce((
    select string_agg(policyname || ' (' || cmd || ')', E'\n' order by cmd, policyname)
      from pg_policies where schemaname = 'public' and tablename = 'wallet_topups'
  ), 'geen')
union all
-- DE BELANGRIJKSTE. Er horen er precies EEN te zijn die het saldo
-- bijwerkt. Zijn het er twee, dan is elke top-up dubbel bijgeschreven.
select 11, 'ALLE triggers op wallet_topups',
  coalesce((
    select string_agg(t.tgname || '  ->  ' || p.proname ||
                      case when t.tgenabled = 'D' then '  (UIT)' else '' end,
                      E'\n' order by t.tgname)
      from pg_trigger t join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.wallet_topups'::regclass and not t.tgisinternal
  ), 'geen')
union all
select 12, 'wie schrijft er meldingen (functies + triggers)',
  coalesce((
    select string_agg(x.naam, E'\n' order by x.naam) from (
      select p.proname || '  (functie)' as naam
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosrc ilike '%public.notifications%'
      union
      select t.tgname || '  ->  ' || t.tgrelid::regclass::text || '  (trigger)'
        from pg_trigger t join pg_proc p2 on p2.oid = t.tgfoid
       where not t.tgisinternal and p2.prosrc ilike '%notifications%'
    ) x
  ), 'geen')
union all
select 13, 'geldkolommen: type',
  coalesce((
    select string_agg(table_name || '.' || column_name || ' = ' || data_type,
                      E'\n' order by table_name, column_name)
      from information_schema.columns
     where table_schema = 'public'
       and (table_name, column_name) in (
         ('wallet_topups', 'amount'),
         ('wallets', 'eur_balance'), ('wallets', 'usd_balance'),
         ('wallets', 'min_topup'),
         ('ad_account_withdrawals', 'amount'),
         ('wallet_exchanges', 'from_amount'), ('wallet_exchanges', 'to_amount'),
         ('top_ups', 'topup_amount'), ('top_ups', 'amount_received'))
  ), 'geen')
union all
select 14, 'body wallet_topup_admin_verify',
  coalesce((
    select pg_get_functiondef(p.oid) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_topup_admin_verify' limit 1
  ), 'staat niet op deze database')
union all
select 15, 'body wallet_topup_admin_reject',
  coalesce((
    select pg_get_functiondef(p.oid) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_topup_admin_reject' limit 1
  ), 'staat niet op deze database')
order by nr;
