-- =====================================================================
-- DEEL 4, waar staat die due_date precies. READ-ONLY.
-- =====================================================================
-- The guard refused rather than guessing, which is what it is for. Now
-- show me the actual text so the fix can be exact instead of hopeful.
--
-- Nothing here writes. Paste the result back.
-- =====================================================================

-- Every line of change_subscription_amount that mentions due_date, with
-- its line number, so the shape is visible in context.
with src as (
  select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'change_subscription_amount'
   limit 1
),
lines as (
  select row_number() over () as ln, l as line
    from src, regexp_split_to_table(src.def, E'\n') as l
)
select ln, line
  from lines
 where line ilike '%due_date%'
    or line ilike '%interval%'
 order by ln;


-- And the twenty lines around the first mention, in case the expression
-- is spread over several of them.
with src as (
  select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'change_subscription_amount'
   limit 1
),
lines as (
  select row_number() over () as ln, l as line
    from src, regexp_split_to_table(src.def, E'\n') as l
),
anchor as (
  select min(ln) as at from lines where line ilike '%due_date%'
)
select l.ln, l.line
  from lines l, anchor a
 where l.ln between a.at - 8 and a.at + 12
 order by l.ln;
