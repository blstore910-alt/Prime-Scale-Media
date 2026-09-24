-- ════════════════════════════════════════════════════════════════════
-- PLAK 95 — twee sloten die nu nog toevallig dichtzitten
-- ════════════════════════════════════════════════════════════════════
--
-- Geen van beide is vandaag te misbruiken. Allebei zijn ze het soort
-- ding dat pas bijt als iemand later iets ANDERS verandert, en dan is
-- niemand er meer bij die weet waarom het ooit goed ging.
--
-- 1. referral_links_with_details
--
-- Die view draagt INSERT-, UPDATE- en DELETE-rechten voor
-- `authenticated`. Dat kan nu niets, want de view staat op
-- `security_invoker = on` en duwt de controle door naar
-- `referral_links`, waar `authenticated` geen schrijfrecht heeft. Zet
-- iemand ooit security_invoker uit -- bijvoorbeeld om een lees te
-- repareren -- dan is het ineens wel een gat, en dan schrijft de
-- browser rechtstreeks in de tabel die bepaalt wie welke commissie
-- krijgt. Een view die alleen gelezen wordt hoort geen schrijfrecht te
-- dragen.
--
-- 2. referral_commission_recalculate
--
-- Uitvoerbaar door `authenticated`, en alleen vanbinnen bewaakt door
-- zijn eigen eigenaarscontrole. Dat is precies het patroon waar
-- CLAUDE.md voor waarschuwt: Postgres geeft EXECUTE aan PUBLIC op elke
-- nieuwe functie, dus één `create or replace` zonder revoke en de
-- controle-in-de-body is het enige wat er nog tussen zit.
--
-- Deze plak haalt het schrijfrecht van de view af en laat de functie
-- alleen nog voor service_role staan -- de UI roept hem niet aan vanaf
-- de klant.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak95 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak95;

do $blk0$
begin
  revoke insert, update, delete
    on public.referral_links_with_details
    from authenticated, anon, public;
  insert into _plak95 values (0, 'schrijfrecht van de view af', 'gedaan');
exception when others then
  insert into _plak95 values (0, 'schrijfrecht van de view af',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

do $blk1$
declare
  v_sig text;
begin
  select 'public.' || p.proname || '(' ||
         pg_get_function_identity_arguments(p.oid) || ')'
    into v_sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'referral_commission_recalculate'
   limit 1;

  if v_sig is null then
    insert into _plak95 values (1, 'referral_commission_recalculate',
      'bestaat niet - overgeslagen');
    return;
  end if;

  execute 'revoke all on function ' || v_sig || ' from public, anon, authenticated';
  execute 'grant execute on function ' || v_sig || ' to service_role';
  insert into _plak95 values (1, 'referral_commission_recalculate',
    'alleen service_role nog (' || v_sig || ')');
exception when others then
  insert into _plak95 values (1, 'referral_commission_recalculate',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── controle ─────────────────────────────────────────────────────────
do $blk2$
declare
  v_view text;
  v_fn   text;
begin
  select coalesce(string_agg(privilege_type || '->' || grantee, ', '
                             order by privilege_type, grantee), 'geen')
    into v_view
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'referral_links_with_details'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

  select coalesce(string_agg(r || ': ' ||
           case when has_function_privilege(r, p.oid, 'execute')
                then 'ja' else 'nee' end, ', '), 'functie bestaat niet')
    into v_fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join unnest(array['anon', 'authenticated', 'service_role']) r
   where n.nspname = 'public' and p.proname = 'referral_commission_recalculate';

  insert into _plak95 values (2, 'stand van zaken',
    'schrijfrechten op de view: ' || v_view || ' | recalculate: ' || v_fn);
exception when others then
  insert into _plak95 values (2, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── en dat lezen nog gewoon kan ──────────────────────────────────────
do $blk3$
declare
  v bigint;
begin
  select count(*) into v from public.referral_links_with_details;
  insert into _plak95 values (3, 'de view leest nog',
    v || ' rijen (lezen is onaangeroerd)');
exception when others then
  insert into _plak95 values (3, 'de view leest nog',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak95 order by n;
