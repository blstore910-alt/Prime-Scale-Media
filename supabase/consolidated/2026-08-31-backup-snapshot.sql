-- Backup baseline snapshot.
--
-- Backup STATUS lives in the Supabase dashboard, not in SQL. This
-- query gives a data baseline: total DB size + row counts for every
-- financial table. Save the output somewhere safe. After any restore
-- (or to sanity-check backups are capturing growth), re-run it and
-- compare — the numbers should match the point you restored to.

select 'DATABASE SIZE' as metric,
       pg_size_pretty(pg_database_size(current_database())) as value;

select
  t.table_name,
  (xpath('/row/c/text()',
     query_to_xml(format('select count(*) as c from public.%I', t.table_name),
                  false, true, ''))
  )[1]::text::int as row_count
from (
  values
    ('tenants'),('user_profiles'),('advertisers'),('affiliates'),
    ('wallets'),('wallet_topups'),('top_ups'),('invoices'),
    ('companies'),('billings'),('subscriptions'),
    ('referral_links'),('referral_commissions'),
    ('ad_accounts'),('ad_account_requests'),
    ('ad_account_withdrawals'),('wallet_refunds'),('wallet_adjustments'),
    ('wallet_precharges'),('wise_incoming_transfers'),
    ('advertiser_bank_senders'),('exchange_rates'),('fee_defaults'),
    ('invitations'),('audit_events')
) as t(table_name)
order by t.table_name;
