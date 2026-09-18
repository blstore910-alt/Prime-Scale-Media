-- =====================================================================
-- Changing what a customer pays is the owner's decision, not an admin's.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY.
--
-- WHAT WAS OPEN. change_subscription_amount checked for role = 'admin'.
-- The screen hid its Amount button from anyone but the tenant owner, and
-- the server action did not check at all — so a plain admin, an employee,
-- could reprice any customer's plan by calling the action or the RPC
-- directly. On a DOWNGRADE that path can also hand money back.
--
-- A hidden button is not a boundary. The button, the action and this
-- function now all say the same thing, and this one is the only one that
-- cannot be gone around.
--
-- SUPER-ADMIN means what it means everywhere else in this app: the owner
-- of the tenant (tenants.owner_id). _is_super_admin_of exists for exactly
-- this and is used where present; the ownership test is inlined as a
-- fallback so this migration does not depend on it.
--
-- The is_active gate that 20260918130000 added is preserved — this narrows
-- WHO, it does not widen anything.
--
-- ROLLBACK: re-apply 20260918170000_restore_orphan_void.sql, which carries
-- the current body with the admin-only gate.
-- =====================================================================

set search_path = public;

do $blk0$
declare
  v_src text;
  v_new text;
  v_old text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'change_subscription_amount'
   limit 1;

  if v_src is null then
    raise exception 'change_subscription_amount not found';
  end if;

  if position('tenants t' in v_src) > 0
     or position('_is_super_admin_of' in v_src) > 0
  then
    raise notice 'Already owner-gated — no change.';
    return;
  end if;

  -- The admin lookup this function performs. Narrow it to the owner by
  -- adding an EXISTS on tenants. Written to match the shape used by
  -- 20260918130000 (role + is_active), and to say so loudly if the body
  -- has moved on since.
  v_old := 'and up.role = ''admin''';
  if position(v_old in v_src) = 0 then
    raise notice
      'The admin test is written differently — gate it by hand. Look for the select into the admin profile.';
    return;
  end if;

  v_new := replace(
    v_src,
    v_old,
    'and up.role = ''admin''
       and exists (
         select 1 from public.tenants t
          where t.id = up.tenant_id
            and t.owner_id = up.user_id
       )'
  );

  execute v_new;
  raise notice 'Repricing is now owner-only.';
end;
$blk0$;

-- ── Read back ────────────────────────────────────────────────────────
-- owner_gated must be true. admins_who_can_reprice is how many people in
-- each tenant still can — it should equal the number of tenants.
select
  (pg_get_functiondef(p.oid) like '%owner_id = up.user_id%') as owner_gated
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'change_subscription_amount';

select
  t.initials                                      as tenant,
  count(*) filter (where up.role = 'admin')       as admins,
  count(*) filter (where up.role = 'admin'
                     and t.owner_id = up.user_id) as can_reprice_now
  from public.tenants t
  left join public.user_profiles up on up.tenant_id = t.id
 group by t.id, t.initials
 order by t.initials;
