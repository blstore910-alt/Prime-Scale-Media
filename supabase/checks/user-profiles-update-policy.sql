-- =====================================================================
-- WHY "Deactivate" says "That change was not saved"
-- =====================================================================
-- Symptom: the admin list's Deactivate / Activate button returns
--   "That change was not saved — the row could not be written."
--
-- That message comes from the server action counting the rows an UPDATE
-- actually wrote. It reads the target row fine (so SELECT is allowed),
-- then updates the SAME row by primary key and gets ZERO rows back with
-- no error. In PostgREST that is the signature of exactly one thing: the
-- UPDATE policy's USING clause filtered the row out. RLS does not raise
-- on a denied UPDATE — it just matches nothing.
--
-- Run this whole file in the Supabase SQL editor. It only READS.
-- =====================================================================

select
  p.polname                                   as policy,
  case p.polcmd when 'r' then 'SELECT'
                when 'a' then 'INSERT'
                when 'w' then 'UPDATE'
                when 'd' then 'DELETE'
                else 'ALL' end                as command,
  pg_get_expr(p.polqual,      p.polrelid)     as using_clause,
  pg_get_expr(p.polwithcheck, p.polrelid)     as with_check_clause
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'user_profiles'
order by command, policy;

-- Expect a row with command = UPDATE whose using_clause allows an admin of
-- the tenant, e.g.
--     (user_id = auth.uid()) OR _is_admin_of(tenant_id)
--
-- If the UPDATE row is MISSING, or its using_clause is only
-- (user_id = auth.uid()), that is the bug: an admin may read every profile
-- in the tenant but may not write any profile except their own.
--
-- The fix is in the next file:
--     supabase/migrations/20260917120000_user_profiles_admin_update.sql
