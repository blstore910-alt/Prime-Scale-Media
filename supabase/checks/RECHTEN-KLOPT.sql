-- ════════════════════════════════════════════════════════════════════
-- WIE MAG WAT? — draai dit na elke plak
-- ════════════════════════════════════════════════════════════════════
--
--   npm run check -- -f supabase/checks/RECHTEN-KLOPT.sql
--
-- Dit is de scan die op 28-09 twee geldgaten vond, hier vastgelegd
-- zodat hij niet één keer is gebeurd maar elke keer kan. Hij LEEST
-- alleen.
--
-- Waarom dit bestaat, in één zin: beide gaten van die dag zijn
-- gevonden door de rechten systematisch uit te tellen, niet door
-- schermen te lopen. Schermen lopen heeft geen eindpunt; deze lijst
-- wel -- hij is precies zo lang als het aantal functies en tabellen.
--
-- WAT ELKE TABEL HIERONDER BETEKENT
--
--   1. LEEG IS GOED. Functies die om alle RLS heen gaan (SECURITY
--      DEFINER), die een klant mag aanroepen, en die zelf niet toetsen
--      wie er belt. Zo zag `wise_record_and_settle` eruit: een klant
--      kon er zijn eigen wallet mee crediteren.
--      Uitzondering die er hoort te staan: `get_invite_by_token` --
--      het token is daar het geheim.
--
--   2. LEEG IS GOED. Tabellen waar `authenticated` op mag schrijven
--      terwijl geen enkele policy dat toestaat. RLS weigert het, dus
--      dit is nog geen lek -- het is één vergeten policy ervandaan.
--
--   3. LEEG IS GOED. Wat `anon` mag. Dat is de rol achter de publieke
--      sleutel die in elke pagina staat.
--
--   4. Alleen ter informatie: hoeveel er in elke categorie zijn, zodat
--      je ziet of de aantallen bewegen.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. SECURITY DEFINER, aanroepbaar door een klant, zonder toets ───
select p.proname                                    as functie,
       pg_get_function_identity_arguments(p.oid)    as argumenten,
       (position('insert into' in lower(pg_get_functiondef(p.oid))) > 0
        or position('update public' in lower(pg_get_functiondef(p.oid))) > 0
        or position('delete from' in lower(pg_get_functiondef(p.oid))) > 0)
                                                    as schrijft
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type t on t.oid = p.prorettype
 where n.nspname = 'public'
   and t.typname <> 'trigger'
   and p.prosecdef
   and has_function_privilege('authenticated', p.oid, 'execute')
   and position('_require_profile' in pg_get_functiondef(p.oid)) = 0
   and position('auth.uid' in pg_get_functiondef(p.oid)) = 0
   and p.proname <> 'get_invite_by_token'
 order by schrijft desc, p.proname;

-- ── 2. schrijfrecht zonder policy die het toestaat ──────────────────
select c.relname                                               as tabel,
       has_table_privilege('authenticated', 'public.' || c.relname, 'insert') as insert_mag,
       has_table_privilege('authenticated', 'public.' || c.relname, 'update') as update_mag,
       has_table_privilege('authenticated', 'public.' || c.relname, 'delete') as delete_mag
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relrowsecurity
   and (has_table_privilege('authenticated', 'public.' || c.relname, 'insert')
     or has_table_privilege('authenticated', 'public.' || c.relname, 'update')
     or has_table_privilege('authenticated', 'public.' || c.relname, 'delete'))
   and not exists (
     select 1 from pg_policy p
      where p.polrelid = c.oid and p.polcmd in ('a', 'w', 'd', '*')
   )
 order by c.relname;

-- ── 3. alles wat anon mag ───────────────────────────────────────────
select 'functie' as soort, p.proname as naam
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type t on t.oid = p.prorettype
 where n.nspname = 'public'
   and t.typname <> 'trigger'
   and has_function_privilege('anon', p.oid, 'execute')
union all
select 'tabel', c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind in ('r', 'v')
   and (has_table_privilege('anon', 'public.' || c.relname, 'select')
     or has_table_privilege('anon', 'public.' || c.relname, 'insert'))
 order by 1, 2;

-- ── 4. de aantallen, zodat je ziet of ze bewegen ────────────────────
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
   where n.nspname = 'public' and t.typname <> 'trigger' and p.prosecdef)
    as security_definer,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
   where n.nspname = 'public' and t.typname <> 'trigger' and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute'))
    as door_klant_aanroepbaar,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity)
    as tabellen_zonder_rls;
