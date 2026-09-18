-- =====================================================================
-- DEEL 1, opnieuw gemeten. READ-ONLY — dit schrijft niets.
-- =====================================================================
-- The summary row said views_read_as_caller = false. That can mean two
-- very different things, and they need different answers:
--
--   (a) The ALTER worked and my CHECK was wrong. I wrote
--       `security_invoker = on` and then compared the stored value to
--       the string 'true'. Postgres stores reloptions as written, so
--       'on' is not 'true' and a perfectly good view reports false.
--
--   (b) The ALTER did not work. Either one of them is a MATERIALIZED
--       view (which cannot carry security_invoker at all and always
--       bypasses RLS), or this Postgres is older than 15, where the
--       option does not exist.
--
-- One is a cosmetic bug in my query. The other means a deactivated
-- customer can still read every tenant's top-ups. So: measure.
-- =====================================================================

-- 1. Which Postgres. security_invoker needs 15 or newer.
select version() as postgres_version;


-- 2. The three objects, as they actually are.
--    kind 'view' can be fixed; 'MATERIALIZED VIEW' cannot.
--    raw_options is the truth. reads_as_caller casts properly this time,
--    so on / true / yes / 1 all count.
select
  c.relname                                   as object_name,
  case c.relkind
    when 'v' then 'view'
    when 'm' then 'MATERIALIZED VIEW - cannot be fixed this way'
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


-- 3. If step 2 shows kind = 'view' and reads_as_caller = false, run the
--    three lines below and then step 2 again. If a row is missing
--    entirely, that view does not exist here and nothing reads it. If
--    any row says MATERIALIZED VIEW, tell me — that one needs replacing
--    with a plain view, and it is not a one-line fix.

alter view public.top_ups_view
  set (security_invoker = true);
alter view public.referral_links_with_details
  set (security_invoker = true);
alter view public.referral_commissions_with_details
  set (security_invoker = true);


-- 4. Step 2 again, after the ALTERs above.
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


-- 5. THE PROOF THAT DOES NOT DEPEND ON ANY FLAG.
--
-- Owner semantics means the view ignores the policies on its base table.
-- Running the query below HERE shows everything, because the SQL editor
-- is superuser — that is expected and proves nothing either way.
--
-- The real test is one line in the browser console, logged in as a
-- CUSTOMER on app.primescalemedia.com:
--
--     await supabase.from('top_ups_view').select('tenant_id')
--
-- Count the distinct tenant_ids that come back. One is the fix holding.
-- More than one is the leak still open, whatever the flag says.
--
-- This number is what that test should be compared against: if the view
-- holds two tenants and a customer gets one, RLS is doing its job.
select
  count(distinct tenant_id) as tenants_in_the_view,
  count(*)                  as rows_total
  from public.top_ups_view;
