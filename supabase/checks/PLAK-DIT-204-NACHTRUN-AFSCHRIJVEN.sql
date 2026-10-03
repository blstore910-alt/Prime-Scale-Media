-- ════════════════════════════════════════════════════════════════════
-- PLAK 204 -- de ECHTE nachtrun (03:00) laat de automatische afschrijving zien
-- ════════════════════════════════════════════════════════════════════
--
-- Plak 203 + een run gaven op 03-10: T4-B een verlengingsfactuur #162
-- ($225, vervalt 10-10) en PSM0022 past_due (wallet EUR 0) -- met mails.
--
-- Deze plak zet factuur #162 van T4-B (alleen die) op "nu vervallen".
-- Vannacht om 03:00 hoort de nachtrun dan zelf:
--   * $225 van de USD-wallet van T4-B af te schrijven ($225 -> $0),
--   * #162 op paid te zetten en de verlengdatum een maand verder,
--   * een regel 'cron_run' in audit_events te schrijven (nieuw: bewijs
--     dat hij draaide).
-- Morgenochtend houdt Claude dat tegen de database.

do $blk0$
begin
  update public.invoices i
     set due_date = now() - interval '1 minute', updated_at = now()
    from public.advertisers a
   where a.id = i.advertiser_id
     and a.tenant_client_code = 'PSM0024'
     and i.number = 162
     and i.status = 'unpaid';
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  (select i.due_date <= now() from public.invoices i join public.advertisers a on a.id = i.advertiser_id
    where a.tenant_client_code = 'PSM0024' and i.number = 162) as factuur_162_vervallen_moet_true,
  (select w.usd_balance from public.wallets w join public.advertisers a on a.id = w.advertiser_id
    where a.tenant_client_code = 'PSM0024') as t4b_usd_wallet_moet_225;
