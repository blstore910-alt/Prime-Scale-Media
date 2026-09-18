-- =====================================================================
-- HET LAATSTE OPENSTAANDE PUNT. Drie views. Eén bestand, één doel.
-- =====================================================================
-- Everything else I have sent today has landed and been confirmed. This
-- is the one thing still unanswered, and it is the most serious of them.
--
-- WHAT IS WRONG. A Postgres view runs with the permissions of whoever
-- OWNS it, unless it is told otherwise. These three are owned by the
-- migration runner, so they read their base tables with row-level
-- security switched OFF. The word `security_invoker` appears nowhere in
-- this repository, so this was never noticed rather than accepted.
--
-- WHY IT MATTERS. The browser reads two of them directly:
--   components/topups/use-topups.ts       .from("top_ups_view").select("*")
--   components/commissions/use-commissions.ts
-- with no tenant and no advertiser predicate, because whoever wrote them
-- assumed RLS was underneath. And one of those readers is on /inactive —
-- the page a customer lands on after you switch them off. So a customer
-- you have DEACTIVATED can read every tenant's top-ups.
--
-- Run it top to bottom. Steps 1 and 2 only look.
-- =====================================================================

-- ── 1. Which Postgres. security_invoker needs 15 or newer. ───────────
select version() as postgres_version;


-- ── 2. What these three actually are, right now ──────────────────────
-- kind 'view' can be fixed here. 'MATERIALIZED VIEW' cannot — tell me.
-- reads_as_caller is cast properly, so on / true / yes / 1 all count.
select
  c.relname                                   as object_name,
  case c.relkind
    when 'v' then 'view'
    when 'm' then 'MATERIALIZED VIEW - tell me about this one'
    when 'r' then 'table'
    else c.relkind::text
  end                                         as kind,
  c.reloptions                                as raw_options,
  coalesce(
    (select option_value::boolean
       from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'),
    false
  )                                           as reads_as_caller
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('top_ups_view',
                     'referral_links_with_details',
                     'referral_commissions_with_details')
 order by c.relname;


-- ── 3. Fix whatever needs fixing ─────────────────────────────────────
-- Guarded, so a missing view or a materialized one cannot stop the rest.
-- A view that is already correct prints "already reads as the caller".
do $viewfix$
declare
  v_name text;
  v_kind "char";
  v_ok   boolean;
begin
  foreach v_name in array array[
    'top_ups_view',
    'referral_links_with_details',
    'referral_commissions_with_details'
  ] loop
    select c.relkind into v_kind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_name;

    if v_kind is null then
      raise notice '% does not exist here - nothing reads it.', v_name;
      continue;
    end if;

    if v_kind = 'm' then
      raise warning '% is a MATERIALIZED view. It bypasses RLS and cannot be fixed this way - tell me.', v_name;
      continue;
    end if;

    if v_kind <> 'v' then
      raise warning '% is not a view (relkind %).', v_name, v_kind;
      continue;
    end if;

    select coalesce(
             (select option_value::boolean
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace,
                     pg_options_to_table(c.reloptions)
               where n.nspname = 'public' and c.relname = v_name
                 and option_name = 'security_invoker'),
             false)
      into v_ok;

    if v_ok then
      raise notice '% already reads as the caller.', v_name;
      continue;
    end if;

    execute format('alter view public.%I set (security_invoker = true)', v_name);
    -- And the grant, in case a rebuild ever dropped it.
    execute format('grant select on public.%I to authenticated', v_name);
    raise notice '% now reads as the caller.', v_name;
  end loop;
end;
$viewfix$;


-- ── 4. Step 2 again, so you can see it changed ───────────────────────
select
  c.relname                                   as object_name,
  c.reloptions                                as raw_options,
  coalesce(
    (select option_value::boolean
       from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'),
    false
  )                                           as reads_as_caller
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'v'
   and c.relname in ('top_ups_view',
                     'referral_links_with_details',
                     'referral_commissions_with_details')
 order by c.relname;


-- ── 5. Eén ding om te onthouden ──────────────────────────────────────
-- Do NOT run 20260918200000_money_to_numeric.sql from an older checkout.
-- It drops and recreates these three views from pg_get_viewdef, which
-- returns the SELECT only — so security_invoker and the GRANTs are both
-- lost and this leak comes straight back, silently. The copy in the repo
-- was corrected this evening to re-add both; anything you have saved
-- locally from before tonight has not been.
--
-- This check confirms it either way:
select
  count(*)                                    as views_found,
  count(*) filter (
    where coalesce(
      (select option_value::boolean
         from pg_options_to_table(c.reloptions)
        where option_name = 'security_invoker'), false)
  )                                           as reading_as_caller
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'v'
   and c.relname in ('top_ups_view',
                     'referral_links_with_details',
                     'referral_commissions_with_details');
