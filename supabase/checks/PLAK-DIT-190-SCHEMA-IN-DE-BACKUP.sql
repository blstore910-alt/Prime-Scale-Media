-- ════════════════════════════════════════════════════════════════════
-- PLAK 190 -- het schema gaat elke nacht mee in de backup
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: "bouw voor jezelf op dat je bent voorbereid op elk
-- scenario". De zip op Drive had alle DATA, maar niet het SCHEMA: welke
-- tabellen, kolommen, sleutels, functies, triggers, RLS-regels en
-- rechten er zijn. Dit schema is met de hand gegroeid (190 plakken) en
-- staat NIET volledig in supabase/migrations/. Is het Supabase-project
-- zelf weg, dan had je data zonder huis.
--
-- _backup_schema_ddl() geeft het hele public-schema terug als SQL-tekst.
-- De nachtelijke backup schrijft dat als schema.sql in de zip.
-- Alleen de service-sleutel mag hem aanroepen.
--
-- Twee keer plakken kan.

create or replace function public._backup_schema_ddl()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $blk0$
declare
  nl constant text := chr(10);
  uit text := '';
  r record;
  kol text;
begin
  uit := '-- PSM schema, gemaakt ' || now()::text || nl ||
         '-- Herstellen: plak dit in een LEEG Supabase-project, daarna de data uit tables/*.json.' || nl ||
         '-- Zie NOODPLAN.md in deze zip.' || nl || nl;

  -- Extensies
  for r in select extname from pg_extension where extname not in ('plpgsql') order by 1 loop
    uit := uit || format('create extension if not exists %I;', r.extname) || nl;
  end loop;
  uit := uit || nl;

  -- Sequences
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S' order by 1
  loop
    uit := uit || format('create sequence if not exists public.%I;', r.relname) || nl;
  end loop;
  uit := uit || nl;

  -- Tabellen met kolommen
  for r in
    select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1
  loop
    select string_agg(
             format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                    case when d.adbin is not null then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end,
                    case when a.attnotnull then ' not null' else '' end),
             ',' || nl order by a.attnum)
      into kol
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped;
    uit := uit || format('create table if not exists public.%I (', r.relname) || nl || coalesce(kol, '') || nl || ');' || nl || nl;
  end loop;

  -- Constraints (primaire sleutels eerst, dan uniek/check, dan vreemde sleutels)
  for r in
    select c.conrelid::regclass::text as tbl, c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
     where n.nspname = 'public' and c.contype in ('p', 'u', 'c', 'f', 'x')
     order by case c.contype when 'p' then 1 when 'u' then 2 when 'c' then 3 when 'x' then 4 else 5 end, 1, 2
  loop
    uit := uit || format('alter table %s add constraint %I %s;', r.tbl, r.conname, r.def) || nl;
  end loop;
  uit := uit || nl;

  -- Indexen die niet bij een constraint horen
  for r in
    select pg_get_indexdef(i.indexrelid) as def
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
     order by 1
  loop
    uit := uit || r.def || ';' || nl;
  end loop;
  uit := uit || nl;

  -- Functies (geen die bij een extensie horen)
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     order by p.proname
  loop
    uit := uit || pg_get_functiondef(r.oid) || ';' || nl || nl;
  end loop;

  -- Views
  for r in
    select c.relname, pg_get_viewdef(c.oid, true) as def, c.reloptions
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' order by 1
  loop
    uit := uit || format('create or replace view public.%I%s as', r.relname,
                         case when r.reloptions is not null then ' with (' || array_to_string(r.reloptions, ', ') || ')' else '' end)
               || nl || r.def || nl || nl;
  end loop;

  -- Triggers
  for r in
    select pg_get_triggerdef(t.oid) as def
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal order by c.relname, t.tgname
  loop
    uit := uit || r.def || ';' || nl;
  end loop;
  uit := uit || nl;

  -- RLS aan + de policies
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity order by 1
  loop
    uit := uit || format('alter table public.%I enable row level security;', r.relname) || nl;
  end loop;
  for r in
    select * from pg_policies where schemaname = 'public' order by tablename, policyname
  loop
    uit := uit || format('create policy %I on public.%I as %s for %s to %s%s%s;',
                         r.policyname, r.tablename, lower(r.permissive), lower(r.cmd),
                         array_to_string(r.roles, ', '),
                         case when r.qual is not null then ' using (' || r.qual || ')' else '' end,
                         case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end) || nl;
  end loop;
  uit := uit || nl;

  -- Rechten op tabellen voor de drie rollen die tellen
  uit := uit || '-- Rechten: eerst alles dicht, dan precies wat er nu is.' || nl;
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v') order by 1
  loop
    uit := uit || format('revoke all on public.%I from anon, authenticated, public;', r.relname) || nl;
  end loop;
  for r in
    select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privs
      from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
     group by grantee, table_name order by table_name, grantee
  loop
    uit := uit || format('grant %s on public.%I to %I;', r.privs, r.table_name, r.grantee) || nl;
  end loop;

  -- Rechten op functies
  for r in
    select p.oid::regprocedure::text as sig,
           has_function_privilege('anon', p.oid, 'execute') as anon_ok,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_ok
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     order by 1
  loop
    uit := uit || format('revoke all on function %s from public, anon, authenticated;', r.sig) || nl;
    if r.auth_ok then uit := uit || format('grant execute on function %s to authenticated;', r.sig) || nl; end if;
    if r.anon_ok then uit := uit || format('grant execute on function %s to anon;', r.sig) || nl; end if;
    uit := uit || format('grant execute on function %s to service_role;', r.sig) || nl;
  end loop;

  -- Opslag: welke buckets er waren
  uit := uit || nl || '-- Storage buckets (maak ze aan in Supabase -> Storage, met deze instellingen):' || nl;
  for r in select id, public from storage.buckets order by 1 loop
    uit := uit || format('-- bucket %s, public = %s', r.id, r.public) || nl;
  end loop;

  return uit;
end;
$blk0$;

revoke all on function public._backup_schema_ddl() from public, anon, authenticated;
grant execute on function public._backup_schema_ddl() to service_role;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  length(public._backup_schema_ddl())                                       as schema_tekens,
  (select count(*) from regexp_matches(public._backup_schema_ddl(), 'create table if not exists', 'g')) as tabellen,
  has_function_privilege('anon', 'public._backup_schema_ddl()', 'execute')          as anon_mag,
  has_function_privilege('authenticated', 'public._backup_schema_ddl()', 'execute') as ingelogd_mag;
