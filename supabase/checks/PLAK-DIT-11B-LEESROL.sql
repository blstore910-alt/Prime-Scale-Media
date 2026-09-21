-- =====================================================================
-- PLAK 11b — de leesrol, nu met de twee dingen die hem tegenhielden
-- =====================================================================
-- Plak 11 viel om met:
--   42883: function public._ro(unknown) does not exist
--
-- Dat was het SYMPTOOM, niet de oorzaak. Wat er echt gebeurde:
--
--   `alter function ... owner to psm_readonly` eist TWEE dingen. Dat ik
--   lid ben van de rol (dat loste plak 11 op) EN dat die rol `create`
--   heeft op het schema. Dat tweede had psm_readonly niet -- met opzet,
--   want hij mag niets. Dus greep de noodrem die ik er zelf in had gezet
--   (eigendom mislukt -> functie weer weghalen), en pas DAARNA probeerde
--   de rapportregel `_ro` aan te roepen. Die bestond toen niet meer.
--
--   De echte reden stond in een `raise notice`, en die toont de
--   SQL-editor niet. Vandaar een foutmelding over het verkeerde ding.
--
-- ── WAT ER NU ANDERS IS ──────────────────────────────────────────────
--
-- 1. `create` op het schema gaat er even bij, de eigenaar wisselt, en
--    `create` gaat er meteen weer af. Postgres kijkt er alleen op het
--    moment van de wissel naar.
--
-- 2. Alles wat kan mislukken schrijft in een tabelletje in plaats van in
--    een notice, en het rapport leest ALLEEN dat tabelletje. `_ro` wordt
--    nergens rechtstreeks in een rapportregel aangeroepen. Zo komt er
--    altijd een tabel terug, ook als er halverwege iets klapt.
--
-- 3. En het ding dat ik bijna fout had. Een rol zonder `bypassrls` ziet
--    door RLS heen NIETS: `select count(*) from wallets` geeft dan 0.
--    Een zelfverzekerde nul over een mislukte lees -- precies de fout
--    waar deze app vol mee zat, en ik had hem er zelf in gebouwd.
--
--    Dus kiest dit script zelf:
--      * lukt `bypassrls` -> eigenaar wordt `psm_readonly`. Twee sloten
--        (geen schrijfrechten EN read-only transactie) en volledige
--        leesrechten.
--      * lukt het niet -> de eigenaar blijft wie hij is, en dan is het
--        TRANSACTIESLOT de beveiliging. Dat is geen tekstcontrole maar
--        een echte: in een read-only transactie weigert Postgres elke
--        insert, update, delete en DDL, en hij kan niet meer worden
--        teruggezet zodra er een query heeft gedraaid.
--
--    Regel 4 zegt welke van de twee het werd. Regel 7 zet naast elkaar
--    wat `_ro` telt en wat er ECHT staat. Verschillen die twee, dan
--    liegt hij en haal ik hem weg.
--
-- Uitvoeren mag alleen `service_role` (de server) en jijzelf. Niet
-- `anon`, niet `authenticated` -- geen ingelogde klant of admin komt
-- erbij, ook niet vanuit de console. De route in de app is bovendien
-- eigenaar-only en staat uit tot `READONLY_SQL=on` in Vercel staat.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _ro_log (nr int, item text, v text);
delete from _ro_log;

-- ── 1. de rol ────────────────────────────────────────────────────────
do $blk0$
begin
  if not exists (select 1 from pg_roles where rolname = 'psm_readonly') then
    create role psm_readonly nologin;
    insert into _ro_log values (1, 'rol psm_readonly', 'aangemaakt');
  else
    insert into _ro_log values (1, 'rol psm_readonly', 'bestond al');
  end if;
exception when others then
  insert into _ro_log values (1, 'rol psm_readonly',
    'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

-- ── 2. lid worden (anders: must be able to SET ROLE) ─────────────────
do $blk1$
begin
  execute format('grant psm_readonly to %I', current_user);
  insert into _ro_log values (2, 'ben ik lid van de rol', 'ja, ' || current_user);
exception when others then
  insert into _ro_log values (2, 'ben ik lid van de rol',
    'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk1$;

-- ── 3. lezen op alles, en nadrukkelijk niets anders ──────────────────
do $blk2$
begin
  execute 'grant usage on schema public to psm_readonly';
  execute 'grant select on all tables in schema public to psm_readonly';
  execute 'alter default privileges in schema public grant select on tables to psm_readonly';
  execute 'revoke insert, update, delete, truncate, references, trigger '
       || 'on all tables in schema public from psm_readonly';
  execute 'revoke all on all sequences in schema public from psm_readonly';
  execute 'revoke all on all functions in schema public from psm_readonly';
  insert into _ro_log values (3, 'leesrechten gezet', 'ja');
exception when others then
  insert into _ro_log values (3, 'leesrechten gezet',
    'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk2$;

-- ── 4. ziet hij alle rijen, of filtert RLS ze stilzwijgend weg ───────
--
-- Dit bepaalt wie de eigenaar wordt. Een leesroute die door RLS heen
-- nul teruggeeft is erger dan geen leesroute.
do $blk3$
declare
  v_bypass boolean;
begin
  begin
    execute 'alter role psm_readonly bypassrls';
  exception when others then
    insert into _ro_log values (98, '_intern', sqlstate || ' ' || sqlerrm);
  end;

  select rolbypassrls into v_bypass from pg_roles where rolname = 'psm_readonly';

  if coalesce(v_bypass, false) then
    insert into _ro_log values (4,
      'ziet psm_readonly ALLE rijen (anders filtert RLS stil weg)',
      'ja - bypassrls staat aan, dus de functie krijgt psm_readonly als '
      || 'eigenaar: geen schrijfrechten EN read-only transactie');
  else
    insert into _ro_log values (4,
      'ziet psm_readonly ALLE rijen (anders filtert RLS stil weg)',
      'NEE (' || coalesce((select v from _ro_log where nr = 98 limit 1),
                          'bypassrls niet toegekend')
      || ') - daarom BLIJFT de eigenaar ' || current_user
      || '. De beveiliging is dan de read-only transactie: Postgres '
      || 'weigert daarin elke insert/update/delete/DDL en hij kan niet '
      || 'meer worden teruggezet. Zie regel 8.');
  end if;
end;
$blk3$;

-- ── 5. oude versie weg (kan van een andere eigenaar zijn) ────────────
do $blk4$
begin
  execute 'drop function if exists public._ro(text)';
exception when others then
  insert into _ro_log values (97, '_intern', 'oude _ro niet te verwijderen: '
    || sqlstate || ' ' || sqlerrm);
end;
$blk4$;

-- ── 6. de functie ────────────────────────────────────────────────────
create or replace function public._ro(q text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $ro$
declare
  v_out jsonb;
begin
  -- HET SLOT. Postgres weigert in een read-only transactie elke
  -- insert, update, delete en DDL -- ook vanuit een functie die
  -- daarbinnen wordt aangeroepen. En terugzetten kan niet meer zodra er
  -- een query heeft gedraaid: `cannot set transaction read-write mode`.
  perform set_config('transaction_read_only', 'on', true);
  -- Een query die blijft hangen mag de database niet bezighouden.
  perform set_config('statement_timeout', '15s', true);

  execute
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || q || ') t'
    into v_out;

  return v_out;
exception when others then
  -- De fout terug in plaats van een lege uitkomst: een mislukte lees
  -- die als niets terugkomt is precies de fout waar deze app vol mee
  -- zat.
  return jsonb_build_object('error', sqlstate || ' ' || sqlerrm);
end;
$ro$;

-- ── 7. eigenaar en rechten ───────────────────────────────────────────
do $blk5$
declare
  v_bypass boolean;
begin
  select rolbypassrls into v_bypass from pg_roles where rolname = 'psm_readonly';

  if coalesce(v_bypass, false) then
    -- `create` op het schema is alleen NODIG op het moment van de
    -- wissel. Daarna gaat hij er weer af.
    execute 'grant create on schema public to psm_readonly';
    execute 'alter function public._ro(text) owner to psm_readonly';
    execute 'revoke create on schema public from psm_readonly';
  end if;

  execute 'revoke all on function public._ro(text) from public';
  execute 'revoke all on function public._ro(text) from anon';
  execute 'revoke all on function public._ro(text) from authenticated';
  execute 'grant execute on function public._ro(text) to service_role';
  execute format('grant execute on function public._ro(text) to %I', current_user);

  insert into _ro_log values (5, 'eigenaar van _ro',
    coalesce((select pg_get_userbyid(p.proowner)
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = '_ro' limit 1),
             'functie bestaat niet'));
exception when others then
  execute 'drop function if exists public._ro(text)';
  insert into _ro_log values (5, 'eigenaar van _ro',
    'MISLUKT (' || sqlstate || ' ' || sqlerrm
    || ') - functie weer verwijderd, er is niets aangelegd');
end;
$blk5$;

do $blk6$
begin
  insert into _ro_log
  select 6, 'wie mag _ro uitvoeren',
    coalesce((select coalesce(array_to_string(p.proacl, '  ,  '),
                              'standaard (IEDEREEN) - FOUT')
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = '_ro' limit 1),
             'functie bestaat niet');

  insert into _ro_log
  select 9, 'mag psm_readonly ergens schrijven',
    coalesce((select string_agg(distinct table_name || ':' || privilege_type, ', ')
                from information_schema.role_table_grants
               where grantee = 'psm_readonly'
                 and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
             'nee - alleen lezen');
end;
$blk6$;

-- ── 8. de proef ──────────────────────────────────────────────────────
--
-- Dit blok gaat ALS LAATSTE, want zodra `_ro` een keer gedraaid heeft
-- staat de hele transactie op read-only en kan er geen DDL meer bij.
do $blk7$
declare
  v_via  text;
  v_echt text;
  v_wr   text;
begin
  if to_regprocedure('public._ro(text)') is null then
    insert into _ro_log values (7, 'PROEF lezen', 'functie bestaat niet - zie regel 5');
    insert into _ro_log values (8, 'PROEF schrijven (MOET weigeren)',
      'functie bestaat niet - zie regel 5');
    return;
  end if;

  -- Eerst het echte aantal, als mezelf. Daarna hetzelfde via _ro.
  -- Staan hier twee verschillende getallen, dan liegt hij.
  select count(*)::text into v_echt from public.wallets;

  begin
    execute 'select public._ro($1)::text' into v_via
      using 'select count(*) as n from public.wallets';
  exception when others then
    v_via := 'FOUT ' || sqlstate || ' ' || sqlerrm;
  end;

  insert into _ro_log values (7,
    'PROEF lezen — via _ro   |   werkelijk (MOETEN gelijk zijn)',
    coalesce(v_via, '-') || '   |   ' || v_echt);

  begin
    execute 'select public._ro($1)::text' into v_wr
      using 'delete from public.notifications where false returning 1';
  exception when others then
    v_wr := 'geweigerd: ' || sqlstate || ' ' || sqlerrm;
  end;

  insert into _ro_log values (8, 'PROEF schrijven (MOET weigeren)',
    coalesce(v_wr, '-'));
end;
$blk7$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select nr, item, v as antwoord
  from _ro_log
 where nr < 90
 order by nr;
