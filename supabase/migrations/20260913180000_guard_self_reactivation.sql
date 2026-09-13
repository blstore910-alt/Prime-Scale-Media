-- =====================================================================
-- Stop a suspended user from re-activating themselves
-- =====================================================================
-- The user_profiles UPDATE policy allows self-update of the caller's own row
-- (user_id = auth.uid()). Postgres RLS is row-level, not column-level, and
-- only `role` is trigger-guarded — nothing guards is_active/status. So an
-- admin the owner disabled (toggleAdminStatus -> status='inactive',
-- is_active=false) still holds a valid JWT and can run, from the browser,
--   supabase.from('user_profiles').update({is_active:true,status:'active'})
--                                 .eq('user_id', myUid)
-- restoring full access (require-admin / api-require-admin trust these
-- columns). The same trick clears a pending_erasure.
--
-- Fix: a BEFORE UPDATE trigger that blocks a SELF re-activation (is_active
-- false->true, or status inactive/pending_erasure->active) unless the caller
-- owns the tenant. Self-DEACTIVATION stays allowed (GDPR self-erasure sets
-- is_active=false / status='pending_erasure' on your own row), and changing
-- OTHER users' status (toggleAdminStatus, owner-gated) is unaffected because
-- new.user_id <> auth.uid() there.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY. Then TEST: (1) owner can deactivate AND
-- reactivate an admin; (2) a deactivated admin CANNOT reactivate themselves;
-- (3) GDPR "delete my account" (self is_active=false) still works.
-- =====================================================================

set search_path = public;

create or replace function public._guard_self_reactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and auth.uid() is not null
     and new.user_id = auth.uid() then
    if (coalesce(old.is_active, true) = false and coalesce(new.is_active, true) = true)
       or (coalesce(old.status, '') in ('inactive', 'pending_erasure')
           and coalesce(new.status, '') = 'active') then
      if not exists (
        select 1 from public.tenants t
        where t.id = new.tenant_id
          and t.owner_id = auth.uid()
      ) then
        raise exception 'You cannot re-activate your own account'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_self_reactivation on public.user_profiles;
create trigger trg_guard_self_reactivation
  before update on public.user_profiles
  for each row execute function public._guard_self_reactivation();
