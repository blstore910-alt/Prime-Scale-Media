-- =====================================================================
-- A deactivated admin still holds ~20 money RPCs
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY.
--
-- WHAT WAS MISSED, AND WHY THE CHECK THAT WAS MEANT TO CATCH IT DID NOT
--
-- 20260916100000 patched _is_admin_of, _is_super_admin_of and
-- is_tenant_admin so a deactivated admin loses access at the table level.
-- 20260916110000 then patched the money RPCs, selecting them with:
--
--     where p.prosrc ilike '%role%=%admin%'
--
-- `_require_profile` compares `up.role::text = p_expected_role` — a
-- PARAMETER, with no 'admin' literal anywhere in its body — so that
-- pattern never selected it. It was never patched, and it is the function
-- that authorises:
--
--   wallet_topup_admin_verify / _reject / _undo, wallet_admin_set_min_topup,
--   ad_account_withdrawal_approve / _reject, wallet_precharge_create /
--   _settle, wallet_refund_request / _approve / _reject,
--   wallet_adjustment_request / _approve / _reject,
--   wise_confirm_suggestion, and the rest of 20260831220000 /
--   20260831270000 / 20260831280000.
--
-- The TypeScript wrappers DO test is_active (actions/_shared.ts), so this
-- only bites when the RPC is called directly with a still-valid JWT —
-- which is exactly the residual path 20260916100000's own header names as
-- the reason it exists.
--
-- Worse: the verification query at the bottom of 20260916110000 uses the
-- same ilike filter, so it reports `still_unguarded_must_be_0 = 0` while
-- this stands. The check confirms itself.
--
-- WHAT THIS CHANGES: one predicate. A profile whose is_active is false, or
-- whose status is 'inactive', is no longer returned — so every caller
-- raises its own 'Forbidden' exactly as it would for a stranger. Nothing
-- else about the function changes: same signature, same columns, same
-- deterministic `order by created_at asc limit 1`.
--
-- ROLLBACK: re-apply 20260901480000_fix_require_profile_role_cast.sql.
-- =====================================================================

set search_path = public;

create or replace function public._require_profile(
  p_expected_role text default null
)
returns table (
  profile_id uuid,
  user_id    uuid,
  tenant_id  uuid,
  role       text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  return query
  select up.id, up.user_id, up.tenant_id, up.role::text
    from public.user_profiles up
   where up.user_id = v_uid
     and (p_expected_role is null or up.role::text = p_expected_role)
     -- Deactivated keeps the role and loses the access. coalesce on both
     -- sides because "never set" means active: is_active is null on rows
     -- created before the column existed, and status is null on most.
     and coalesce(up.is_active, true) = true
     and coalesce(up.status, 'active') <> 'inactive'
   order by up.created_at asc
   limit 1;

  if not found then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public._require_profile(text) from public;
grant execute on function public._require_profile(text) to authenticated;

-- ── Read it back ─────────────────────────────────────────────────────
-- guarded must be true. The second column is the honest version of the
-- check 20260916110000 ran: every SECURITY DEFINER function whose body
-- mentions a role at all, and whether it now tests is_active either
-- directly or through one of the three helpers.
select
  (select p.prosrc ilike '%is_active%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_require_profile')  as require_profile_guarded,
  (select count(*)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prosrc ilike '%role%'
      and p.prosrc not ilike '%is_active%'
      and p.prosrc not ilike '%_require_profile%'
      and p.prosrc not ilike '%_is_admin_of%'
      and p.prosrc not ilike '%_is_super_admin_of%'
      and p.prosrc not ilike '%is_tenant_admin%')                   as functions_still_role_only;
