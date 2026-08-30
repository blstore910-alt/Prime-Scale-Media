-- Permission-leak fixes surfaced by the audit sweep. Defense-in-depth:
-- server actions gate at the boundary, but a plain admin could still
-- open the browser devtools and .from().update() directly. These
-- triggers + policy tightenings block that.
--
--   1. audit_events SELECT — tighten to super-admin (tenant owner).
--   2. Trigger on advertisers UPDATE — raise if commission_* changed
--      and the caller isn't the tenant owner.
--   3. Trigger on affiliates UPDATE — same guard on commission_*.
--   4. Trigger on user_profiles UPDATE — raise if role changed and
--      the caller isn't the tenant owner (blocks admin-promotes-self).


-- ─────────────────────────────────────────────────────────────────
-- 1. audit_events SELECT — super-admin only
-- ─────────────────────────────────────────────────────────────────
drop policy if exists audit_events_read on public.audit_events;
create policy audit_events_read on public.audit_events
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.user_profiles up
        join public.tenants t on t.id = up.tenant_id
       where up.user_id = auth.uid()
         and up.tenant_id = audit_events.tenant_id
         and up.role = 'admin'
         and t.owner_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────
-- 2 + 3. Commission-column guard trigger — advertisers + affiliates
-- ─────────────────────────────────────────────────────────────────
create or replace function public._guard_commission_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_caller uuid;
begin
  -- No caller = admin RPC / SQL Editor / service_role → allow.
  v_caller := auth.uid();
  if v_caller is null then
    return new;
  end if;

  -- Nothing sensitive changed → allow.
  if new.commission_type is not distinct from old.commission_type
     and new.commission_pct is not distinct from old.commission_pct
     and new.commission_onetime is not distinct from old.commission_onetime
     and new.commission_monthly is not distinct from old.commission_monthly
     and new.commission_currency is not distinct from old.commission_currency
  then
    return new;
  end if;

  select owner_id into v_owner
    from public.tenants
   where id = new.tenant_id;

  if v_owner is null or v_owner <> v_caller then
    raise exception 'Only the tenant owner can change commission fields'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_advertiser_commission on public.advertisers;
create trigger trg_guard_advertiser_commission
  before update on public.advertisers
  for each row execute function public._guard_commission_columns();

drop trigger if exists trg_guard_affiliate_commission on public.affiliates;
create trigger trg_guard_affiliate_commission
  before update on public.affiliates
  for each row execute function public._guard_commission_columns();


-- ─────────────────────────────────────────────────────────────────
-- 4. user_profiles.role guard — only super-admin can promote/demote
-- ─────────────────────────────────────────────────────────────────
create or replace function public._guard_user_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_caller uuid;
begin
  v_caller := auth.uid();
  if v_caller is null then
    return new;
  end if;

  if new.role is not distinct from old.role then
    return new;
  end if;

  select owner_id into v_owner
    from public.tenants
   where id = new.tenant_id;

  if v_owner is null or v_owner <> v_caller then
    raise exception 'Only the tenant owner can change a profile role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_user_profile_role on public.user_profiles;
create trigger trg_guard_user_profile_role
  before update on public.user_profiles
  for each row execute function public._guard_user_profile_role();
