-- ════════════════════════════════════════════════════════════════════
-- PLAK 203 -- de maandcyclus testen zonder een maand te wachten
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 03-10: "zijn we ready voor klanten onboarden dat we niet
-- 1 maand moeten wachten als test". Alleen TESTACCOUNTS krijgen een
-- andere datum; daarna draait Claude de nachtrun meteen
-- (/api/admin/run-billing, alleen eigenaars) en houdt alles tegen de DB.
--
--   T4-B  (PSM0024, $225/maand, USD-wallet $225): verlengdatum -> vandaag
--         => de run maakt een verlengingsfactuur van $225, 7 dagen tijd.
--   PSM0022 (Baris Invoicetest, EUR 75, wallet EUR 0): factuur 149 -> nu
--         vervallen => de run probeert af te schrijven, dat lukt niet
--         (geen saldo) => abonnement 'past_due' + melding/mail.
--
-- Geen echte klant wordt aangeraakt: beide rijen op klantcode.

do $blk0$
begin
  update public.subscriptions s
     set next_payment_date = current_date, updated_at = now()
    from public.advertisers a
   where a.id = s.advertiser_id
     and a.tenant_client_code = 'PSM0024'
     and s.status = 'active';

  update public.invoices i
     set due_date = now() - interval '1 minute', updated_at = now()
    from public.advertisers a
   where a.id = i.advertiser_id
     and a.tenant_client_code = 'PSM0022'
     and i.number = 149
     and i.status = 'unpaid';
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  (select s.next_payment_date from public.subscriptions s join public.advertisers a on a.id = s.advertiser_id
    where a.tenant_client_code = 'PSM0024' and s.status = 'active' limit 1) = current_date as t4b_vandaag_moet_true,
  (select i.due_date <= now() from public.invoices i join public.advertisers a on a.id = i.advertiser_id
    where a.tenant_client_code = 'PSM0022' and i.number = 149) as psm0022_vervallen_moet_true;
