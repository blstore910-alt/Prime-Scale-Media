-- =====================================================================
-- How do the last eight functions check that the caller is an admin?
-- =====================================================================
-- Read-only, and deliberately small: it returns only the LINES that mention
-- the admin role, not the whole function. Some of these bodies run to
-- hundreds of lines and I do not need them — I need to know whether each one
-- calls a shared predicate (in which case it is already fixed, because
-- _is_admin_of now tests is_active) or inlines its own check (in which case
-- it still needs one line added).
--
-- The three shared predicates are already patched and verified. These eight
-- are what the audit said remained.
-- =====================================================================

select
  p.proname as function_name,
  l.lineno,
  trim(l.line) as line
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral unnest(string_to_array(p.prosrc, E'\n'))
  with ordinality as l(line, lineno)
where n.nspname = 'public'
  and p.prosecdef
  and p.prosrc ilike '%role%=%admin%'
  and p.prosrc not ilike '%is_active%'
  and (
    l.line ilike '%role%'
    or l.line ilike '%_is_admin_of%'
    or l.line ilike '%is_tenant_admin%'
    or l.line ilike '%_is_super_admin_of%'
    or l.line ilike '%_require_profile%'
    or l.line ilike '%raise exception%forbidden%'
  )
order by p.proname, l.lineno;
