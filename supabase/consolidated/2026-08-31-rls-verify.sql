-- RLS deploy-state check (P0-3 from the security audit).
--
-- The rls_templates migration is un-versioned and marked NOT AUTO-RUN.
-- If it was never applied to prod, these core tables are world-read/
-- write via the anon key — a critical leak. This query only READS —
-- it changes nothing.
--
-- Every row must show rls_enabled = t AND policy_count > 0.
-- If any row shows rls_enabled = f, or policy_count = 0 on a table
-- that should be tenant-scoped, tell me and I'll ship the exact
-- policies (or we re-apply rls_templates safely).

select
  c.relname                              as table_name,
  c.relrowsecurity                       as rls_enabled,
  count(p.polname)                       as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'wallets','wallet_topups','top_ups','invoices','companies','billings',
    'advertisers','affiliates','user_profiles','tenants','subscriptions',
    'referral_links','referral_commissions','ad_accounts','ad_account_requests',
    'notifications','push_subscriptions','invitations','exchange_rates',
    'fee_defaults','integration_jobs','ad_account_withdrawals','wallet_refunds',
    'wallet_adjustments','wallet_precharges','wise_incoming_transfers',
    'advertiser_bank_senders','audit_events','rate_limit_buckets'
  )
group by c.relname, c.relrowsecurity
order by c.relrowsecurity asc, policy_count asc, c.relname;
