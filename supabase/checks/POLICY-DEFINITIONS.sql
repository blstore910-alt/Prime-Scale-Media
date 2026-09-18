-- =====================================================================
-- The 33 policies, with their actual expressions — read-only
-- =====================================================================
-- Names alone are not enough to rewrite a policy. Most of these are pure
-- admin gates and can become `_is_admin_of(tenant_id)` outright, which is
-- patched and tests is_active. But several OR an admin branch together
-- with a CUSTOMER branch — withdrawals_read, advertiser_perks_read,
-- advertiser_plans_read_own, precharge_read, supplier_ad_accounts_read,
-- the two `admins` self-policies — and rewriting one of those blind would
-- either lock a customer out of their own row or open somebody else's.
--
-- So: the expressions, verbatim. Paste the result back and the migration
-- gets written against what is actually there.
--
-- `qual` is the USING clause, `with_check` the WITH CHECK clause.
-- =====================================================================

select
  tablename,
  policyname,
  cmd,
  roles::text                                as granted_to,
  coalesce(qual, '')                         as using_expression,
  coalesce(with_check, '')                   as with_check_expression
  from pg_policies
 where schemaname = 'public'
   and (qual ilike '%role%admin%' or with_check ilike '%role%admin%')
   and coalesce(qual, '') || coalesce(with_check, '') not ilike '%is_active%'
 order by tablename, policyname;
