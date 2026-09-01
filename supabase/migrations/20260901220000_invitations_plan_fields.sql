-- =====================================================================
-- Plan fields on invitations — plan-model phase 2
-- =====================================================================
-- The plan chosen at invite time (pre-filled from a `plans` preset, then
-- adjustable) is stored on the invitation, so on accept it can be copied
-- onto the advertiser + drive the auto-created subscription. Nullable —
-- affiliate invites / plan-less invites just leave them null.
--
-- The referrer is already carried by invitations.affiliate_id (reused,
-- no new column). invitations is hand-authored; add columns idempotently.
-- =====================================================================

alter table public.invitations
  add column if not exists plan_id uuid references public.plans(id),
  add column if not exists monthly_fee numeric(10, 2),
  add column if not exists included_ad_accounts int,
  add column if not exists topup_fee_pct numeric(5, 2),
  add column if not exists plan_currency text;
