-- =====================================================================
-- CRITICAL FIX: _require_profile compared the "Role" ENUM to a TEXT
-- variable → "operator does not exist: Role = text" (42883).
-- =====================================================================
-- user_profiles.role is an enum type ("Role"). `enum = 'literal'` works
-- (the literal is coerced to the enum), which is why RPCs that inline
-- `up.role = 'admin'` are fine. But _require_profile compares
-- `up.role = p_expected_role` where p_expected_role is a TEXT *variable*,
-- and there is no `Role = text` operator → the function fails to plan
-- and 42883s. That broke EVERY RPC that calls _require_profile('admin'):
--   wallet_topup_admin_verify/reject/undo, wallet_admin_set_min_topup,
--   wallet_adjustment_request/approve/reject, wallet_refund_*,
--   wallet_precharge_*, ad_account_withdrawal_approve/reject,
--   wise_confirm_suggestion — i.e. most day-to-day admin money actions.
--
-- Fix: cast the enum to text on both the comparison and the returned
-- column. Behaviour is otherwise identical.
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
   order by up.created_at asc
   limit 1;

  if not found then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public._require_profile(text) from public;
grant execute on function public._require_profile(text) to authenticated;
