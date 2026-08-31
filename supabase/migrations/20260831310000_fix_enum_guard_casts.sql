-- =====================================================================
-- Fix: "operator does not exist: Role = text" on every profile save
-- =====================================================================
-- Regression from 20260831240000. When the INSERT+UPDATE rewrite of
-- _guard_user_profile_role routed the old role through a `text`
-- variable, the comparison `new.role IS NOT DISTINCT FROM v_old_role`
-- became enum("Role") vs text — an operator Postgres doesn't have. The
-- comparison threw BEFORE the early-return, so EVERY user_profiles
-- update failed, even a plain name/address change that never touches
-- the role.
--
-- Fix: compare on ::text throughout, so the guard is correct whether
-- the underlying column is an enum or text. Same defensive cast applied
-- to _guard_commission_columns, which has the same latent hazard on
-- commission_type (only unhit so far because the seed runs as the
-- service role, where auth.uid() is null and the guard early-returns).
--
-- Behaviour is otherwise identical — the owner-only rule is unchanged.
-- =====================================================================

set search_path = public;

create or replace function public._guard_user_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_caller uuid;
  v_old_role text;
  v_new_role text;
begin
  v_caller := auth.uid();
  if v_caller is null then
    return new;               -- service role / SQL editor
  end if;

  v_new_role := new.role::text;
  v_old_role := case when tg_op = 'INSERT' then null else old.role::text end;

  -- On INSERT a self-service signup may only create an advertiser (or
  -- a null role). Anything else — and any role CHANGE on update —
  -- requires the tenant owner.
  if tg_op = 'INSERT' then
    if v_new_role is null or v_new_role = 'advertiser' then
      return new;
    end if;
  else
    if v_new_role is not distinct from v_old_role then
      return new;
    end if;
  end if;

  select owner_id into v_owner from public.tenants where id = new.tenant_id;
  if v_owner is null or v_owner <> v_caller then
    raise exception 'Only the tenant owner can set/change a profile role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public._guard_commission_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_caller uuid;
  v_changed boolean;
begin
  v_caller := auth.uid();
  if v_caller is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Any non-zero commission on a fresh row needs the owner.
    v_changed := coalesce(new.commission_type::text, '') <> ''
              or coalesce(new.commission_pct, 0) <> 0
              or coalesce(new.commission_onetime, 0) <> 0
              or coalesce(new.commission_monthly, 0) <> 0
              or coalesce(new.commission_currency::text, '') <> '';
  else
    v_changed := new.commission_type::text is distinct from old.commission_type::text
              or new.commission_pct is distinct from old.commission_pct
              or new.commission_onetime is distinct from old.commission_onetime
              or new.commission_monthly is distinct from old.commission_monthly
              or new.commission_currency::text is distinct from old.commission_currency::text;
  end if;

  if not v_changed then
    return new;
  end if;

  select owner_id into v_owner from public.tenants where id = new.tenant_id;
  if v_owner is null or v_owner <> v_caller then
    raise exception 'Only the tenant owner can set commission fields'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
