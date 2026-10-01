-- ════════════════════════════════════════════════════════════════════
-- HERSTELOEFENING -- de telling
-- ════════════════════════════════════════════════════════════════════
--
-- Alleen lezen. Draai dit in de SQL-editor van PRODUCTIE en van het
-- HERSTELDE project (nooit herstellen bovenop productie tijdens een
-- oefening), en leg de twee uitkomsten naast elkaar. Zie
-- docs/RESTORE_DRILL.md.
--
-- Wat moet kloppen: de aantallen tot het hersteltijdstip, en vooral de
-- wallets -- de som van alle saldi en het verschil met het grootboek.
-- Een herstel waarin een wallet niet bij zijn ledger past, is geen
-- herstel maar een nieuw probleem.

select * from (
  select 1 as nr, 'advertisers' as wat, count(*)::text as waarde from public.advertisers
  union all select 2, 'user_profiles', count(*)::text from public.user_profiles
  union all select 3, 'wallets', count(*)::text from public.wallets
  union all select 4, 'som saldo EUR', coalesce(sum(eur_balance), 0)::text from public.wallets
  union all select 5, 'som saldo USD', coalesce(sum(usd_balance), 0)::text from public.wallets
  -- Per wallet en valuta: het saldo tegen de laatste balance_after in
  -- het grootboek. Een wallet zonder ledgerregel in die valuta telt niet
  -- mee (het grootboek begon op 28-09).
  union all select 6, 'wallets die niet bij hun ledger passen',
    (select count(*) from public.wallets w
      cross join lateral (values ('EUR', w.eur_balance), ('USD', w.usd_balance)) v(cur, saldo)
      cross join lateral (
        select l.balance_after from public.wallet_ledger l
         where l.wallet_id = w.id and upper(l.currency) = v.cur
         order by l.occurred_at desc, l.id desc limit 1) laatste
      where laatste.balance_after is distinct from v.saldo)::text
  union all select 7, 'wallet_topups', count(*)::text from public.wallet_topups
  union all select 8, 'top_ups', count(*)::text from public.top_ups
  union all select 9, 'invoices', count(*)::text from public.invoices
  union all select 10, 'invoices betaald', count(*)::text from public.invoices where status = 'paid'
  union all select 11, 'ad_accounts', count(*)::text from public.ad_accounts
  union all select 12, 'ad_account_requests', count(*)::text from public.ad_account_requests
  union all select 13, 'subscriptions', count(*)::text from public.subscriptions
  union all select 14, 'referral_commissions', count(*)::text from public.referral_commissions
  union all select 15, 'wise_incoming_transfers', count(*)::text from public.wise_incoming_transfers
  union all select 16, 'audit_events', count(*)::text from public.audit_events
  union all select 17, 'laatste audit_event', max(occurred_at)::text from public.audit_events
  union all select 18, 'laatste wallet_ledger', max(occurred_at)::text from public.wallet_ledger
) t
order by nr;
