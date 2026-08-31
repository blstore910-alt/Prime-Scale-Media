-- Referral approval gate.
--
-- Every affiliate relationship must be approved by an admin before it
-- earns. Adds a status column to referral_links:
--   pending   — created by a self-signup referral, awaiting review
--   active    — approved; commission accrues from here on
--   rejected  — declined; never accrues
--
-- Existing rows default to 'active' so nothing that already worked
-- breaks. New self-signup links are inserted as 'pending' by
-- app/auth/confirm; admin-assigned links (assignAffiliateToAdvertiser)
-- are 'active' immediately because the admin creating them IS the
-- approval.
--
-- Safe to re-run.

alter table public.referral_links
  add column if not exists status text not null default 'active';

-- Constrain to the known set. Drop first so a re-run with a changed
-- set doesn't collide.
alter table public.referral_links
  drop constraint if exists referral_links_status_ck;
alter table public.referral_links
  add constraint referral_links_status_ck
  check (status in ('pending', 'active', 'rejected'));

create index if not exists referral_links_status_idx
  on public.referral_links (tenant_id, status);
