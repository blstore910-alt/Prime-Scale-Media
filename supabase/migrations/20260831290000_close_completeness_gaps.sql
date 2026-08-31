-- =====================================================================
-- Close the 3 gaps the live completeness-check found
-- =====================================================================
-- The migration files already declared these guards, but the DB the
-- consolidated SQL built up was missing them. Re-apply idempotently so
-- the live database matches the repo:
--
--   1. topup_logs               RLS was OFF (policies existed, dormant)
--   2. advertiser_bank_senders  audit trigger missing
--   3. wise_incoming_transfers  audit + touch triggers missing
--
-- All three are financial/logbook-critical. After this, re-run
-- 2026-08-31-completeness-check.sql — expect total_gaps = 0.
-- =====================================================================

set search_path = public;

-- 1. topup_logs — enable RLS. Its policies (topup_logs_select /
--    topup_logs_insert_admin) already exist from the rls_templates
--    migration; they were just dormant with RLS off. Owner/admin reads
--    keep working, SECURITY DEFINER writes bypass RLS.
alter table public.topup_logs enable row level security;

-- 2. advertiser_bank_senders — audit trigger (touch already present).
drop trigger if exists trg_audit_advertiser_bank_senders on public.advertiser_bank_senders;
create trigger trg_audit_advertiser_bank_senders
  after insert or update or delete on public.advertiser_bank_senders
  for each row execute function public._audit_row_change();

-- 3. wise_incoming_transfers — both triggers. Every incoming Wise
--    deposit change must be logged and concurrency-safe.
drop trigger if exists trg_touch_wise_incoming on public.wise_incoming_transfers;
create trigger trg_touch_wise_incoming
  before update on public.wise_incoming_transfers
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_wise_incoming on public.wise_incoming_transfers;
create trigger trg_audit_wise_incoming
  after insert or update or delete on public.wise_incoming_transfers
  for each row execute function public._audit_row_change();
