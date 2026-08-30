-- =====================================================================
-- Performance indexes for hot query paths
-- =====================================================================
-- After the pending-badge sidebar + system-status panel land, admins
-- fire off half-a-dozen count(*) queries per minute filtered by
-- (tenant_id, status). Without a composite index those become a scan
-- of the whole table per query.
--
-- Also indexes the pending-listings sort key (created_at desc) so the
-- "recent items" queries stay under a millisecond even as the tables
-- grow.
--
-- All CREATE INDEX statements use IF NOT EXISTS — idempotent, safe
-- to re-run.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- wallet_topups: filter by (tenant_id, status), order by created_at
-- ---------------------------------------------------------------------
create index if not exists wallet_topups_tenant_status_idx
  on public.wallet_topups (tenant_id, status);

create index if not exists wallet_topups_tenant_created_idx
  on public.wallet_topups (tenant_id, created_at desc);

create index if not exists wallet_topups_wallet_created_idx
  on public.wallet_topups (wallet_id, created_at desc);

-- ---------------------------------------------------------------------
-- top_ups
-- ---------------------------------------------------------------------
create index if not exists top_ups_tenant_status_idx
  on public.top_ups (tenant_id, status);

create index if not exists top_ups_tenant_created_idx
  on public.top_ups (tenant_id, created_at desc);

create index if not exists top_ups_advertiser_created_idx
  on public.top_ups (advertiser_id, created_at desc);

-- ---------------------------------------------------------------------
-- ad_account_requests
-- ---------------------------------------------------------------------
create index if not exists ad_account_requests_tenant_status_idx
  on public.ad_account_requests (tenant_id, status);

create index if not exists ad_account_requests_tenant_created_idx
  on public.ad_account_requests (tenant_id, created_at desc);

-- ---------------------------------------------------------------------
-- invoices: mark-paid queries hit (tenant_id, status)
-- ---------------------------------------------------------------------
create index if not exists invoices_tenant_status_idx
  on public.invoices (tenant_id, status);

create index if not exists invoices_advertiser_created_idx
  on public.invoices (advertiser_id, created_at desc);

-- ---------------------------------------------------------------------
-- subscriptions: hot "active per advertiser" check in
-- createSubscriptionAsAdmin
-- ---------------------------------------------------------------------
create index if not exists subscriptions_advertiser_status_idx
  on public.subscriptions (advertiser_id, status);

create index if not exists subscriptions_tenant_status_idx
  on public.subscriptions (tenant_id, status);

-- ---------------------------------------------------------------------
-- user_profiles: sidebar "was this admin active in last N minutes"
-- ---------------------------------------------------------------------
create index if not exists user_profiles_tenant_role_seen_idx
  on public.user_profiles (tenant_id, role, last_seen_at desc)
  where last_seen_at is not null;

create index if not exists user_profiles_tenant_role_idx
  on public.user_profiles (tenant_id, role);

-- ---------------------------------------------------------------------
-- notifications: unread lookup for the popover
-- ---------------------------------------------------------------------
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, is_read, created_at desc)
  where is_read = false;

-- ---------------------------------------------------------------------
-- referral_commissions: mark-paid + filter by status
-- ---------------------------------------------------------------------
create index if not exists referral_commissions_tenant_status_idx
  on public.referral_commissions (tenant_id, status);

-- ---------------------------------------------------------------------
-- audit_events: viewer queries + retention scans
-- ---------------------------------------------------------------------
-- The base migration already indexed (tenant_id, occurred_at desc) and
-- (table_name, row_id). Add the filter-on-action-only variant used by
-- the /audit page's action dropdown.
create index if not exists audit_events_tenant_action_time_idx
  on public.audit_events (tenant_id, action, occurred_at desc);
