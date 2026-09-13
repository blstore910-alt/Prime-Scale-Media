-- =====================================================================
-- Make the user_profiles tenant guard actually bite
-- =====================================================================
-- 20260913140000 replaced user_profiles_insert with a policy that only lets
-- a user self-insert into a tenant they were invited to or own. But the live
-- DB also carries a second, hand-authored INSERT policy:
--
--   user_profiles_own_insert   WITH CHECK (user_id = auth.uid())
--
-- Postgres RLS combines permissive policies with OR, so that one still
-- allows a self-insert into ANY tenant_id — exactly the hole 140000 was
-- meant to close. The guard is a no-op until it is removed.
--
-- Safe to drop: the remaining user_profiles_insert already permits both
-- legitimate paths — an invited user accepting (app/api/accept-invite) and
-- the owner creating their own tenant (actions/tenant-actions.ts) — and the
-- anonymous signup route writes with the service-role client, which bypasses
-- RLS entirely.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY, then TEST: accept an invite as an existing
--    user, and create a new tenant. Both must still work.
-- Rollback:
--   create policy user_profiles_own_insert on public.user_profiles
--     for insert with check (user_id = auth.uid());
-- =====================================================================

set search_path = public;

drop policy if exists user_profiles_own_insert on public.user_profiles;
