-- ═══════════════════════════════════════════════════════════════════
-- Permission hardening — paste in Supabase SQL Editor.
--
-- Closes 3 client-side bypass leaks:
--   1. audit_events SELECT restricted to super-admin
--   2. Commission columns on advertisers/affiliates guarded by trigger
--   3. user_profiles.role changes guarded by trigger
--
-- Server actions were already gated; these are defense-in-depth so
-- a browser .from().update() call from a plain admin gets a 42501
-- error instead of a silent write.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

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
  v_caller := auth.uid();
  if v_caller is null then
    return new;
  end if;

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

-- Sanity: three trigger names + one policy should exist.
select 'triggers' as kind, count(*) as n
  from pg_trigger
 where tgname in (
   'trg_guard_advertiser_commission',
   'trg_guard_affiliate_commission',
   'trg_guard_user_profile_role'
 )
union all
select 'audit_events policy', count(*)
  from pg_policies
 where schemaname = 'public' and tablename = 'audit_events' and policyname = 'audit_events_read';
