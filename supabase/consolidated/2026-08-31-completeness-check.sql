-- =====================================================================
-- COMPLETENESS CHECK — "logt het logboek echt alles?"
-- =====================================================================
-- Run this in the Supabase SQL editor. It prints one row per business
-- table with a checkbox for each guarantee:
--
--   rls        = Row Level Security enabled (no world-readable data)
--   audit      = trg_audit_* trigger present (every change hits the log)
--   touch      = trg_touch_* trigger present (optimistic-concurrency safe)
--   has_upd_at = table has an updated_at column (touch only needed if yes)
--
-- WHAT "GOOD" LOOKS LIKE
--   Every financial/business table: rls ✓, audit ✓.
--   touch ✓ wherever has_upd_at ✓.
--   Append-only / derived / ephemeral tables are listed at the bottom
--   with a note explaining why they intentionally skip a guarantee.
--
-- Anything financial showing ✗ in rls or audit is a REAL GAP — fix it
-- before go-live.
-- =====================================================================

with business_tables as (
  -- The tables that hold real business/financial state.
  select unnest(array[
    'wallets','wallet_topups','top_ups','topup_logs','invoices',
    'companies','billings','subscriptions','exchange_rates',
    'referral_commissions','referral_links','ad_accounts',
    'ad_account_requests','advertisers','affiliates','user_profiles',
    'tenants','invitations','fee_defaults','integration_jobs',
    'ad_account_withdrawals','wallet_refunds','wallet_adjustments',
    'wallet_precharges','wise_incoming_transfers','advertiser_bank_senders'
  ]) as table_name
),
flags as (
  select
    b.table_name,
    -- exists in the DB at all?
    exists (
      select 1 from information_schema.tables t
       where t.table_schema = 'public' and t.table_name = b.table_name
    ) as exists_in_db,
    -- RLS enabled?
    coalesce((
      select c.relrowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = b.table_name
    ), false) as rls_enabled,
    -- audit trigger attached?
    exists (
      select 1 from pg_trigger tg
        join pg_class c on c.oid = tg.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = b.table_name
         and tg.tgname = 'trg_audit_' || b.table_name
         and not tg.tgisinternal
    ) as has_audit,
    -- touch trigger attached?
    exists (
      select 1 from pg_trigger tg
        join pg_class c on c.oid = tg.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = b.table_name
         and tg.tgname = 'trg_touch_' || b.table_name
         and not tg.tgisinternal
    ) as has_touch,
    -- has an updated_at column?
    exists (
      select 1 from information_schema.columns col
       where col.table_schema = 'public' and col.table_name = b.table_name
         and col.column_name = 'updated_at'
    ) as has_updated_at
  from business_tables b
)
select
  table_name,
  case when not exists_in_db then '— MISSING —'
       when rls_enabled then 'ok' else 'GAP' end                       as rls,
  case when not exists_in_db then '—'
       when has_audit then 'ok' else 'GAP' end                         as audit,
  case when not has_updated_at then 'n/a'
       when has_touch then 'ok' else 'GAP' end                         as touch,
  case when has_updated_at then 'yes' else 'no' end                    as has_upd_at,
  case when (not exists_in_db) or (not rls_enabled) or (not has_audit)
            or (has_updated_at and not has_touch) then '<<< GAP' else '' end  as flag
from flags
order by
  -- surface any GAP first (repeat the predicate — SELECT aliases can't
  -- be used inside an ORDER BY expression in Postgres)
  (case when not exists_in_db then 0
        when not rls_enabled or not has_audit then 0
        when has_updated_at and not has_touch then 0
        else 1 end),
  table_name;

-- ---------------------------------------------------------------------
-- Intentionally NOT audited (documented, not gaps):
--   audit_events            append-only log itself (auditing the log = loop)
--   audit_events_*_stats    derived rollup, rebuildable from audit_events
--   rate_limit_buckets      ephemeral throttle counters, no business value
--   notifications           UI messages, not financial state
--   push_subscriptions      device tokens, not financial state
-- ---------------------------------------------------------------------

-- One-line summary: how many gaps?
select count(*) filter (
  where (rls = 'GAP' or audit = 'GAP' or touch = 'GAP')
) as total_gaps
from (
  select
    case when b.rls_enabled then 'ok' else 'GAP' end as rls,
    case when b.has_audit then 'ok' else 'GAP' end as audit,
    case when b.has_updated_at and not b.has_touch then 'GAP' else 'ok' end as touch
  from (
    select
      coalesce((select c.relrowsecurity from pg_class c
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname='public' and c.relname = t.table_name), false) as rls_enabled,
      exists (select 1 from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
                join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname=t.table_name
                 and tg.tgname='trg_audit_'||t.table_name and not tg.tgisinternal) as has_audit,
      exists (select 1 from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
                join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname=t.table_name
                 and tg.tgname='trg_touch_'||t.table_name and not tg.tgisinternal) as has_touch,
      exists (select 1 from information_schema.columns col
               where col.table_schema='public' and col.table_name=t.table_name
                 and col.column_name='updated_at') as has_updated_at
    from (select unnest(array[
      'wallets','wallet_topups','top_ups','topup_logs','invoices',
      'companies','billings','subscriptions','exchange_rates',
      'referral_commissions','referral_links','ad_accounts',
      'ad_account_requests','advertisers','affiliates','user_profiles',
      'tenants','invitations','fee_defaults','integration_jobs',
      'ad_account_withdrawals','wallet_refunds','wallet_adjustments',
      'wallet_precharges','wise_incoming_transfers','advertiser_bank_senders'
    ]) as table_name) t
  ) b
) g;
