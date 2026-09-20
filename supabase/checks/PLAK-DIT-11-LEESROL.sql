-- =====================================================================
-- PLAK 11 — een leesrol, zodat ik de cijfers zelf kan controleren
-- =====================================================================
-- Het grootste deel van JOUW tijd gaat nu naar SQL plakken en het
-- resultaat terugsturen. Dit haalt dat weg voor alles wat alleen LEEST
-- — en alleen daarvoor. Iets veranderen blijft langs jou gaan.
--
-- ── WAAROM ZO EN NIET MET EEN WACHTWOORD ─────────────────────────────
--
-- De voor de hand liggende manier is een read-only databasegebruiker en
-- een connectiestring. Die string is een wachtwoord, en dat hoort niet
-- in een chat. Dus gaat het anders: er komt een rol die ALLEEN mag
-- lezen, en één functie die als die rol draait. Er is geen nieuw geheim,
-- en jij hoeft niets te bewaren.
--
-- De beveiliging zit niet in wat ik intik, maar in wie de functie is:
--
--   * `psm_readonly` krijgt `select` op public en verder niets. Geen
--     insert, geen update, geen delete, geen execute op andere functies.
--   * `_ro()` is SECURITY DEFINER en heeft `psm_readonly` als EIGENAAR.
--     Wat er ook in de query staat, hij draait met die rechten. Stuur ik
--     per ongeluk een `delete`, dan komt er "permission denied" -- niet
--     een lege tabel.
--   * De transactie wordt bovendien expliciet op read-only gezet, dus
--     zelfs een schrijfactie die de rol wél zou mogen wordt geweigerd.
--   * Uitvoeren mag alleen de `service_role`. Niet `anon`, niet
--     `authenticated`. Een ingelogde klant of admin kan er niet bij,
--     ook niet vanuit de console.
--
-- De route in de app die hem aanroept is bovendien eigenaar-only en
-- gaat uit zodra `READONLY_SQL=off` in Vercel staat. Na de livegang zet
-- je hem uit en is hij weg.
--
-- ── WAT IK ERMEE GA DOEN ─────────────────────────────────────────────
--
-- Cijfers controleren zonder jou: saldo tegen de optelsom, factuur
-- tegen scherm, commissie tegen de database. Precies de dingen waar nu
-- een plak voor nodig is. Elke wijziging -- policies, functies, kolommen
-- -- blijft een plak die jij zelf uitvoert.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

do $blk0$
begin
  if not exists (select 1 from pg_roles where rolname = 'psm_readonly') then
    create role psm_readonly nologin;
    raise notice 'rol psm_readonly aangemaakt';
  else
    raise notice 'rol psm_readonly bestond al';
  end if;
end;
$blk0$;

-- ── EERST LID WORDEN VAN DE ROL ──────────────────────────────────────
-- Postgres laat je een object alleen aan een rol geven als je zelf lid
-- van die rol bent. Zonder dit komt er:
--   42501: must be able to SET ROLE "psm_readonly"
do $blk1$
begin
  execute format('grant psm_readonly to %I', current_user);
  raise notice 'psm_readonly toegekend aan %', current_user;
exception when others then
  raise notice 'kon psm_readonly niet aan % geven: %', current_user, sqlerrm;
end;
$blk1$;

-- Lezen op alles wat er is, en op wat er later bij komt.
grant usage on schema public to psm_readonly;
grant select on all tables in schema public to psm_readonly;
alter default privileges in schema public
  grant select on tables to psm_readonly;

-- En nadrukkelijk NIETS anders.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from psm_readonly;
revoke all on all functions in schema public from psm_readonly;
revoke all on all sequences in schema public from psm_readonly;

create or replace function public._ro(q text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $ro$
declare
  v_out jsonb;
begin
  -- Zelfs als de rol iets zou mogen schrijven, mag de transactie het
  -- niet. Twee sloten op dezelfde deur.
  perform set_config('transaction_read_only', 'on', true);
  -- Een query die blijft hangen mag de database niet bezighouden.
  perform set_config('statement_timeout', '15s', true);

  execute
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || q || ') t'
    into v_out;

  return v_out;
exception when others then
  -- De fout terug in plaats van een lege uitkomst: een mislukte lees
  -- die als niets terugkomt is precies de fout waar deze hele app vol
  -- mee zat.
  return jsonb_build_object('error', sqlstate || ' ' || sqlerrm);
end;
$ro$;

-- ── EIGENDOM IS DE HELE BEVEILIGING ──────────────────────────────────
--
-- SECURITY DEFINER betekent: draait als de EIGENAAR. Is dat
-- `psm_readonly`, dan kan de functie alleen lezen, wat er ook in de
-- query staat. Blijft hij van `postgres`, dan draait willekeurige SQL
-- met alle rechten -- precies het tegenovergestelde van wat dit moet
-- zijn.
--
-- Dus: lukt het eigendom niet, dan gaat de functie er weer af. Liever
-- geen leesroute dan een schrijfroute die eruitziet als een leesroute.
do $blk2$
begin
  execute 'alter function public._ro(text) owner to psm_readonly';
  execute 'revoke all on function public._ro(text) from public';
  execute 'revoke all on function public._ro(text) from anon';
  execute 'revoke all on function public._ro(text) from authenticated';
  execute 'grant execute on function public._ro(text) to service_role';
  raise notice '_ro staat op naam van psm_readonly';
exception when others then
  execute 'drop function if exists public._ro(text)';
  raise notice
    'EIGENDOM MISLUKT (%), functie weer verwijderd -- niets aangelegd', sqlerrm;
end;
$blk2$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'rol psm_readonly bestaat' as item,
  case when exists (select 1 from pg_roles where rolname = 'psm_readonly')
       then 'ja' else 'NEE' end as antwoord
union all
select 2, 'wie is de eigenaar van _ro (moet psm_readonly zijn)',
  coalesce((
    select pg_get_userbyid(p.proowner)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_ro' limit 1
  ), 'functie bestaat niet')
union all
select 3, 'wie mag _ro uitvoeren',
  coalesce((
    select coalesce(array_to_string(p.proacl, ' , '), 'default (IEDEREEN)')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_ro' limit 1
  ), 'functie bestaat niet')
union all
select 4, 'mag psm_readonly ergens schrijven',
  coalesce((
    select string_agg(distinct table_name || ':' || privilege_type, ', ')
      from information_schema.role_table_grants
     where grantee = 'psm_readonly'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ), 'nee - alleen lezen')
union all
-- De proef: eerst een gewone lees, dan een schrijfpoging.
select 5, 'PROEF lezen',
  case when to_regprocedure('public._ro(text)') is null
       then 'functie bestaat niet - zie regel 2'
       else (public._ro('select count(*) as n from public.wallets'))::text end
union all
select 6, 'PROEF schrijven (MOET weigeren)',
  case when to_regprocedure('public._ro(text)') is null
       then 'functie bestaat niet - zie regel 2'
       else (public._ro('delete from public.notifications where false returning 1'))::text end
order by nr;
