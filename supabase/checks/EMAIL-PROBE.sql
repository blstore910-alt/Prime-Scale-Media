-- =====================================================================
-- Waar staat dat e-mailadres precies. READ-ONLY.
-- =====================================================================
-- RUN-NOW-3 DEEL 2 refused rather than guessing, which is what that
-- guard is for. Show me the actual lines so the removal is exact.
--
-- WHAT IT IS ABOUT. affiliate_referral_stats is SECURITY DEFINER and
-- granted to `authenticated`, so row-level security cannot trim what it
-- returns — and it declares `referred_advertiser_email` in its returns
-- table. The hook that calls it is mounted in BOTH the affiliate app and
-- the advertiser app, so every affiliate and every advertiser-acting-as-
-- affiliate receives the email address of everyone who signed up under
-- their code. Nothing renders it; the screens print the name and the
-- client code. A referral link is shareable publicly, so these are not
-- necessarily people they have met.
--
-- Nothing here writes. Paste the result back.
-- =====================================================================

-- 1. Every line of the function that mentions the email, with its line
--    number, so the shape is visible in context.
with src as (
  select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'affiliate_referral_stats'
   limit 1
),
lines as (
  select row_number() over () as ln, l as line
    from src, regexp_split_to_table(src.def, E'\n') as l
)
select ln, line
  from lines
 where line ilike '%email%'
 order by ln;


-- 2. The returns table, in full. The column has to come out of BOTH the
--    signature and the select list, or the function will not compile —
--    and PL/pgSQL would accept a half-edit and fail at call time.
with src as (
  select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'affiliate_referral_stats'
   limit 1
),
lines as (
  select row_number() over () as ln, l as line
    from src, regexp_split_to_table(src.def, E'\n') as l
),
bounds as (
  select
    (select min(ln) from lines where line ilike '%returns table%') as a,
    (select min(ln) from lines where line ilike '%language plpgsql%'
                                  or line ilike '%language sql%')  as b
)
select l.ln, l.line
  from lines l, bounds
 where l.ln between bounds.a and coalesce(bounds.b, bounds.a + 40)
 order by l.ln;


-- 3. And how many arguments it takes, since a DROP needs the exact
--    signature and there may be more than one overload.
select
  p.oid::regprocedure                        as full_signature,
  pg_get_function_identity_arguments(p.oid)  as arguments,
  p.prosecdef                                as security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'affiliate_referral_stats';
