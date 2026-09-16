-- =====================================================================
-- A deactivated admin keeps no powers
-- =====================================================================
-- Every SECURITY DEFINER function in this database authorises an admin with
-- some variant of
--
--   exists (select 1 from user_profiles up
--            where up.user_id = auth.uid() and up.role = 'admin' ...)
--
-- and NOT ONE of them also tests is_active or status. Audited live: eleven
-- functions, all eleven. So an admin you deactivate keeps the ability to
-- credit wallets, approve refunds, release withdrawals, grant perks, verify
-- top-ups and change subscription amounts — which is exactly the power
-- deactivating them is meant to remove, at exactly the moment you most want
-- it gone.
--
-- The app paths are already closed: the six server actions that called those
-- RPCs directly now go through resolveAdminContext(), which does check. What
-- remains open is calling the RPC, or the table, straight from the browser's
-- own Supabase client.
--
-- THREE of the eleven are the shared predicates the RLS policies across this
-- schema authorise through:
--
--   _is_admin_of(p_tenant)        _is_super_admin_of(tenant)
--   is_tenant_admin(p_tenant)
--
-- Fixing these denies a deactivated admin at the TABLE level everywhere at
-- once, which is a far better place to enforce it than eleven separate
-- function bodies. The other eight still carry their own inline check and are
-- handled separately; this migration does not touch them.
--
-- Each body below is the LIVE text, read back from pg_get_functiondef, with
-- one condition added and nothing else changed. That matters: this project
-- has already broken a live RPC once by rewriting it from the repo's copy
-- instead of the running one.
--
-- On the NULL handling: coalesce(is_active, true) treats "never set" as
-- active, because a column added later without a backfill means unknown, not
-- deactivated — and defaulting the other way would lock out every admin the
-- moment this runs.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY. Safe to re-run.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- Pre-flight. Refuses to run if the columns this depends on are missing,
-- rather than failing later with something unreadable.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'user_profiles'
       and column_name = 'is_active'
  ) then
    raise exception 'user_profiles.is_active does not exist — stop and check the schema';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'user_profiles'
       and column_name = 'status'
  ) then
    raise exception 'user_profiles.status does not exist — stop and check the schema';
  end if;

  raise notice 'admins who will lose access: %', (
    select coalesce(string_agg(coalesce(up.full_name, up.email, up.id::text), ', '), 'none')
      from public.user_profiles up
     where up.role = 'admin'
       and (up.is_active = false or coalesce(up.status, 'active') = 'inactive')
  );
end $$;

-- ---------------------------------------------------------------------
-- 1. _is_admin_of — used by most RLS policies in the schema.
-- ---------------------------------------------------------------------
create or replace function public._is_admin_of(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = auth.uid()
      and up.tenant_id = p_tenant
      and up.role = 'admin'
      -- added: a deactivated admin is not an admin
      and coalesce(up.is_active, true)
      and coalesce(up.status, 'active') <> 'inactive'
  );
$function$;

-- ---------------------------------------------------------------------
-- 2. _is_super_admin_of — the owner-only predicate.
-- ---------------------------------------------------------------------
create or replace function public._is_super_admin_of(tenant uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.tenants t
      join public.user_profiles up on up.tenant_id = t.id
     where t.id = tenant
       and t.owner_id = auth.uid()
       and up.user_id = auth.uid()
       and up.role = 'admin'
       -- added: a deactivated admin is not an admin, owner or not
       and coalesce(up.is_active, true)
       and coalesce(up.status, 'active') <> 'inactive'
  );
$function$;

-- ---------------------------------------------------------------------
-- 3. is_tenant_admin — the older sibling of _is_admin_of, still referenced.
-- ---------------------------------------------------------------------
create or replace function public.is_tenant_admin(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid()
      and up.tenant_id = p_tenant
      and up.role = 'admin'
      -- added: a deactivated admin is not an admin
      and coalesce(up.is_active, true)
      and coalesce(up.status, 'active') <> 'inactive'
  );
$function$;

-- ---------------------------------------------------------------------
-- Verify. All three must read `true`, and the count of still-unguarded
-- SECURITY DEFINER admin functions should now be 8 rather than 11.
-- ---------------------------------------------------------------------
select
  (select p.prosrc ilike '%is_active%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='_is_admin_of')        as is_admin_of_guarded,
  (select p.prosrc ilike '%is_active%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='_is_super_admin_of')  as is_super_admin_of_guarded,
  (select p.prosrc ilike '%is_active%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='is_tenant_admin')     as is_tenant_admin_guarded,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.prosrc ilike '%role%=%admin%'
      and p.prosrc not ilike '%is_active%')                       as still_unguarded_expect_8;
