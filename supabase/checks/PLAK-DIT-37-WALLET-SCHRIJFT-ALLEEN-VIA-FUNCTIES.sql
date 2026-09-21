-- =====================================================================
-- PLAK 37 — de wallet schrijft alleen via functies. BEVEILIGING, NU.
-- =====================================================================
-- Plak 34 rij 8 somde de schrijf-policies op die NIET op een admin- of
-- eigenaarscheck staan. Drie daarvan raken geld:
--
--   wallet_topups | "Enable insert for advertisers" | INSERT
--   wallet_topups | "Enable update for advertisers" | UPDATE
--       Op wallet_topups hangt trg_wallet_topup_balance_sync: zodra de
--       status 'completed' wordt, schrijft hij de WALLET bij. Met deze
--       policy kan een ingelogde klant vanuit de console zijn eigen
--       storting op 'completed' zetten -- met het bedrag dat hij zelf
--       intypt -- en krijgt hij dat geld in zijn wallet zonder één
--       overboeking. Van daaruit gaat het naar een ad account.
--   wallets | "Enable insert for advertiser only" | INSERT
--       Een tweede wallet met een zelfgekozen saldo.
--   ad_account_requests | "Enable advertisers to insert data" | INSERT
--       Een aanvraag rechtstreeks in de tabel, langs
--       ad_account_request_create_paid heen: zonder de EUR 50 en zonder
--       de plan-eis van plak 35.
--
-- De app gebruikt ze NERGENS (gezocht in actions/, app/, components/,
-- hooks/, lib/, context/):
--   * de klant maakt een storting aan via wallet_topup_advertiser_create
--     (definer); het betaalbewijs gaat naar storage en als parameter mee;
--   * de admin verifieert/weigert/draait terug via wallet_topup_admin_*
--     (RPC's); adjustWalletTopupAmount schrijft met de service key;
--   * een wallet ontstaat in /auth/confirm met de service key of via
--     ensure_advertiser_and_wallet (definer);
--   * een aanvraag gaat via ad_account_request_create_paid (definer).
--
-- Dus: de drie klant-policies eraf, en voor wallet_topups en wallets ook
-- het schrijfRECHT voor sessies (dan kan ook een medewerker-admin niet
-- via de console een storting op 'completed' zetten of een saldo
-- overschrijven). Elke stap meet eerst of een INVOKER-functie (geen
-- definer) naar de tabel schrijft -- dan zou intrekken die breken, en
-- wordt de stap overgeslagen met de naam erbij.
--
-- En: de leverancierskost komt alleen nog uit het ACCOUNTTYPE
-- (Settings -> Finance -> Ad-account types). De eigenaar: "leverancierskost
-- moet uit de ad acc type data komen van settings".
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _p37 (nr int, item text, v text);
delete from _p37;

insert into _p37
select 0, 'policies VOOR',
  coalesce(string_agg(tablename || ' | ' || policyname || ' | ' || cmd, E'\n'
                      order by tablename, policyname), 'geen')
  from pg_policies
 where schemaname = 'public'
   and tablename in ('wallet_topups', 'wallets', 'ad_account_requests');

-- ── 1. wallet_topups ─────────────────────────────────────────────────
do $blk0$
declare
  v_invokers text;
begin
  select string_agg(p.proname, ', ') into v_invokers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f'
     and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?wallet_topups\b';
  if v_invokers is not null then
    insert into _p37 values (1, 'wallet_topups', 'OVERGESLAGEN - invoker-functies schrijven hier: ' || v_invokers);
  else
    execute 'drop policy if exists "Enable insert for advertisers" on public.wallet_topups';
    execute 'drop policy if exists "Enable update for advertisers" on public.wallet_topups';
    execute 'revoke insert, update, delete, truncate on public.wallet_topups from authenticated, anon';
    insert into _p37 values (1, 'wallet_topups', 'klant-policies weg; sessies schrijven niet meer; lezen blijft; de RPCs werken door');
  end if;
exception when others then
  insert into _p37 values (1, 'wallet_topups', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

-- ── 2. wallets ───────────────────────────────────────────────────────
do $blk1$
declare
  v_invokers text;
begin
  select string_agg(p.proname, ', ') into v_invokers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f'
     and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?wallets\b';
  if v_invokers is not null then
    insert into _p37 values (2, 'wallets', 'OVERGESLAGEN - invoker-functies schrijven hier: ' || v_invokers);
  else
    execute 'drop policy if exists "Enable insert for advertiser only" on public.wallets';
    execute 'revoke insert, update, delete, truncate on public.wallets from authenticated, anon';
    insert into _p37 values (2, 'wallets', 'klant-insert weg; sessies schrijven geen saldo meer; lezen blijft');
  end if;
exception when others then
  insert into _p37 values (2, 'wallets', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk1$;

-- ── 3. ad_account_requests: de klant alleen via de betaalde functie ──
do $blk2$
begin
  execute 'drop policy if exists "Enable advertisers to insert data" on public.ad_account_requests';
  execute 'revoke insert, update, delete, truncate on public.ad_account_requests from anon';
  insert into _p37 values (3, 'ad_account_requests', 'klant-insert weg; aanvragen alleen via ad_account_request_create_paid (EUR 50 + plan)');
exception when others then
  insert into _p37 values (3, 'ad_account_requests', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk2$;

-- ── 4. leverancierskost alleen uit het accounttype ───────────────────
create or replace function public._supplier_fee_pct_for(p_account uuid, p_tenant uuid)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public'
as $blk3$
declare
  v_pct  numeric;
  v_type text;
begin
  if p_account is null then
    return null;
  end if;
  select x.platform into v_type from public.ad_accounts x where x.id = p_account;
  if v_type is null or to_regclass('public.ad_account_type_suppliers') is null then
    return null;
  end if;
  execute 'select s.supplier_fee_pct
             from public.ad_account_type_suppliers s
             join public.ad_account_types t on t.id = s.ad_account_type_id
            where t.tenant_id = $1
              and public._slug_key(t.slug) = public._slug_key($2)
              and s.supplier_fee_pct is not null
            limit 1'
     into v_pct using p_tenant, v_type;
  return v_pct;
end;
$blk3$;

revoke all on function public._supplier_fee_pct_for(uuid, uuid) from public, anon, authenticated;

insert into _p37 values (4, 'leverancierskost', 'komt alleen nog uit het accounttype (Settings > Finance > Ad-account types)');

-- ── NA ───────────────────────────────────────────────────────────────
insert into _p37
select 5, 'policies NA',
  coalesce(string_agg(tablename || ' | ' || policyname || ' | ' || cmd, E'\n'
                      order by tablename, policyname), 'geen')
  from pg_policies
 where schemaname = 'public'
   and tablename in ('wallet_topups', 'wallets', 'ad_account_requests');

insert into _p37
select 6, 'rechten NA voor authenticated/anon',
  coalesce(string_agg(table_name || ' ' || grantee || ': ' || privs, E'\n' order by table_name, grantee), 'geen')
  from (select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
          from information_schema.role_table_grants
         where table_schema = 'public' and grantee in ('authenticated', 'anon')
           and table_name in ('wallet_topups', 'wallets', 'ad_account_requests')
         group by table_name, grantee) g;

-- De RPCs waar de klant en de admin op leunen: zijn ze allemaal definer?
-- Een invoker hier zou na deze plak niet meer kunnen schrijven.
insert into _p37
select 7, 'wallet-RPCs: definer? (moet overal ja zijn)',
  coalesce(string_agg(p.proname || ' = ' || case when p.prosecdef then 'ja' else 'NEE' end,
                      E'\n' order by p.proname), 'geen gevonden')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('wallet_topup_advertiser_create', 'wallet_topup_admin_verify',
                     'wallet_topup_admin_reject', 'wallet_topup_admin_undo',
                     'ensure_advertiser_and_wallet', 'ad_account_request_create_paid',
                     'top_up_create_for_advertiser', 'top_up_admin_verify', 'top_up_admin_reject');

select nr, item, v as antwoord from _p37 order by nr;
