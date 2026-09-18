-- =====================================================================
-- Name the 8 — read-only, nothing here writes
-- =====================================================================
-- 20260918110000's read-back counted 8 SECURITY DEFINER functions that
-- mention a role, do not test is_active, and do not route through
-- _require_profile / _is_admin_of / _is_super_admin_of / is_tenant_admin.
--
-- A count is not a to-do list. Most of these will turn out to be fine:
-- several look at a role to DECIDE something rather than to authorise it
-- (does this signup need an advertiser row? is this profile allowed to
-- change its own role?), and a customer-facing RPC that gates on "do you
-- own an advertiser row" is not role-checking at all. What matters is
-- which of them let a DEACTIVATED person do something.
--
-- Query 1 names them and shows the two facts that decide it: does the
-- body authorise (raise / return false) off a role, and does it move
-- money or grant access.
-- =====================================================================

select
  p.proname,
  pg_get_function_identity_arguments(p.oid)            as args,
  -- Does it refuse anybody, or just branch?
  (p.prosrc ilike '%raise exception%')                 as can_refuse,
  -- The words that mean "this one matters".
  (p.prosrc ilike '%wallet%'
    or p.prosrc ilike '%topup%'
    or p.prosrc ilike '%top_up%'
    or p.prosrc ilike '%invoice%'
    or p.prosrc ilike '%refund%'
    or p.prosrc ilike '%adjustment%'
    or p.prosrc ilike '%precharge%'
    or p.prosrc ilike '%commission%')                  as touches_money,
  (p.prosrc ilike '%user_profiles%'
    and (p.prosrc ilike '%insert%' or p.prosrc ilike '%update%')) as touches_profiles,
  length(p.prosrc)                                     as body_chars
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
   and p.prosrc ilike '%role%'
   and p.prosrc not ilike '%is_active%'
   and p.prosrc not ilike '%_require_profile%'
   and p.prosrc not ilike '%_is_admin_of%'
   and p.prosrc not ilike '%_is_super_admin_of%'
   and p.prosrc not ilike '%is_tenant_admin%'
 order by touches_money desc, can_refuse desc, p.proname;

-- ── Query 2: the same question for POLICIES ──────────────────────────
-- Neither deactivation migration touched a single RLS policy — they both
-- operate on pg_proc. A policy that inlines its own
-- `exists (… up.role = 'admin')` is therefore still open to a
-- deactivated admin working directly against the table from the browser.
-- This is the real list, live, rather than the one grepped from the repo.
select
  tablename,
  policyname,
  cmd
  from pg_policies
 where schemaname = 'public'
   and (qual ilike '%role%admin%' or with_check ilike '%role%admin%')
   and coalesce(qual, '') || coalesce(with_check, '') not ilike '%is_active%'
 order by tablename, policyname;

-- ── Query 3: how many, in one line ───────────────────────────────────
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prosrc ilike '%role%'
      and p.prosrc not ilike '%is_active%'
      and p.prosrc not ilike '%_require_profile%'
      and p.prosrc not ilike '%_is_admin_of%'
      and p.prosrc not ilike '%_is_super_admin_of%'
      and p.prosrc not ilike '%is_tenant_admin%')            as functions_role_only,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and (qual ilike '%role%admin%' or with_check ilike '%role%admin%')
      and coalesce(qual,'') || coalesce(with_check,'') not ilike '%is_active%') as policies_role_only;
