-- Security hardening round 2 — fixes from the deep auth/RLS audit.
--
-- P0-1 role escalation via user_profiles INSERT
-- P0-2 wise_incoming_transfers null-tenant cross-tenant leak
-- P1-1 stale broad audit_events SELECT policy defeats the owner-only one
-- P1-2 affiliate commission set via INSERT (guard was UPDATE-only)
-- P1-3 deactivated admins keep access (gates check role, not status)
--
-- (P0-3 — RLS possibly not applied on core tables — is handled by the
--  separate ensure-RLS script, since it may need to run against prod.)


-- ─────────────────────────────────────────────────────────────────
-- P0-1 + P1-2: make the role + commission guards fire on INSERT too.
-- The guards were BEFORE UPDATE only, so a fresh INSERT could set
-- role='admin' or an arbitrary commission_pct. Rewrite each to handle
-- INSERT (old is null) and attach a BEFORE INSERT trigger.
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
  v_old_role text;
begin
  v_caller := auth.uid();
  if v_caller is null then
    return new;               -- service role / SQL editor
  end if;

  v_old_role := case when tg_op = 'INSERT' then null else old.role end;

  -- On INSERT a self-service signup may only create an advertiser (or
  -- a null role). Anything else — and any role CHANGE on update —
  -- requires the tenant owner.
  if tg_op = 'INSERT' then
    if new.role is null or new.role = 'advertiser' then
      return new;
    end if;
  else
    if new.role is not distinct from v_old_role then
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

drop trigger if exists trg_guard_user_profile_role on public.user_profiles;
create trigger trg_guard_user_profile_role
  before insert or update on public.user_profiles
  for each row execute function public._guard_user_profile_role();


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
    v_changed := coalesce(new.commission_type, '') <> ''
              or coalesce(new.commission_pct, 0) <> 0
              or coalesce(new.commission_onetime, 0) <> 0
              or coalesce(new.commission_monthly, 0) <> 0
              or coalesce(new.commission_currency, '') <> '';
  else
    v_changed := new.commission_type is distinct from old.commission_type
              or new.commission_pct is distinct from old.commission_pct
              or new.commission_onetime is distinct from old.commission_onetime
              or new.commission_monthly is distinct from old.commission_monthly
              or new.commission_currency is distinct from old.commission_currency;
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

drop trigger if exists trg_guard_advertiser_commission on public.advertisers;
create trigger trg_guard_advertiser_commission
  before insert or update on public.advertisers
  for each row execute function public._guard_commission_columns();

drop trigger if exists trg_guard_affiliate_commission on public.affiliates;
create trigger trg_guard_affiliate_commission
  before insert or update on public.affiliates
  for each row execute function public._guard_commission_columns();


-- ─────────────────────────────────────────────────────────────────
-- P0-2: wise_incoming_transfers — a null-tenant (unmatched) row was
-- readable by EVERY tenant's admins. Restrict null-tenant rows to
-- tenant owners only; tenant-scoped rows stay visible to that tenant's
-- admins.
-- ─────────────────────────────────────────────────────────────────
drop policy if exists wise_incoming_admin_read on public.wise_incoming_transfers;
create policy wise_incoming_admin_read on public.wise_incoming_transfers
  for select to authenticated
  using (
    (
      wise_incoming_transfers.tenant_id is not null
      and exists (
        select 1 from public.user_profiles up
         where up.user_id = auth.uid()
           and up.role = 'admin'
           and up.tenant_id = wise_incoming_transfers.tenant_id
      )
    )
    or (
      wise_incoming_transfers.tenant_id is null
      and exists (
        select 1 from public.user_profiles up
          join public.tenants t on t.id = up.tenant_id
         where up.user_id = auth.uid()
           and up.role = 'admin'
           and t.owner_id = auth.uid()
      )
    )
  );


-- ─────────────────────────────────────────────────────────────────
-- P1-1: drop the stale broad audit_events SELECT policy so the
-- owner-only one from round 1 isn't OR'd back open.
-- ─────────────────────────────────────────────────────────────────
drop policy if exists audit_events_no_select_anon on public.audit_events;
drop policy if exists audit_events_admin_read on public.audit_events;
-- (audit_events_read, owner-only, remains from 20260830170000.)


-- ─────────────────────────────────────────────────────────────────
-- Hardening: server-side MIME + size gate on the payment-slip bucket
-- (client validation alone let a direct storage call store an
-- HTML/SVG-with-script in one's own folder).
-- ─────────────────────────────────────────────────────────────────
update storage.buckets
   set allowed_mime_types = array[
         'image/png','image/jpeg','image/gif','image/webp','image/bmp',
         'application/pdf'
       ],
       file_size_limit = 10485760   -- 10 MB
 where id = 'wallet_payment_slips';


-- ─────────────────────────────────────────────────────────────────
-- P0-3 is a DEPLOY-STATE check, not a code change: the un-versioned
-- rls_templates migration may never have been applied to prod, which
-- would leave core tables world-read/write via the anon key. Blindly
-- enabling RLS here is unsafe (a table with RLS on but no policy locks
-- out the app), so this migration only DIAGNOSES. Run the query in
-- supabase/consolidated/2026-08-31-rls-verify.sql and act on the
-- result: every core table must show rls_enabled = true AND
-- policy_count > 0.
-- ─────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────
-- P1-3 (DB layer) is handled separately: _require_profile and
-- _is_admin_of are part of the un-versioned baseline, so patching
-- them blind risks breaking every financial RPC. They're recreated
-- safely once dumped (see the deactivated-admin follow-up). The TS
-- auth guards (assertAdmin / resolveAdminContext / requireAdmin /
-- apiRequireAdmin) are hardened to require is_active in code, which
-- covers every app-driven path.
-- ─────────────────────────────────────────────────────────────────
