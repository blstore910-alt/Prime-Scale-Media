-- ════════════════════════════════════════════════════════════════════
-- PLAK 180 -- het plan van PSM0020 een maand doorschuiven
-- ════════════════════════════════════════════════════════════════════
--
-- Gevonden bij de controle van de nachtrun van 01-10.
--
-- De run zelf deed het goed: hij zag dat periode 30-09 van PSM0020 al
-- betaald was (factuur 145) en maakte geen tweede factuur. Maar factuur
-- 145 werd op 30-09 om 14:49 betaald VOOR de doorschuif-trigger
-- (_on_subscription_invoice_paid, plak 168) op zijn plek stond. Dus
-- next_payment_date bleef op 30-09 staan. Gevolg:
--
--   - de klant leest "Te verlengen sinds 30 Sep" naast "Maand betaald";
--   - de run ziet elke nacht opnieuw "periode 30-09 is betaald" en
--     factureert OKTOBER NOOIT.
--
-- Gemeten: dit is het ENIGE plan in die toestand (0 andere).
--
-- Een UPDATE uit de SQL-editor: auth.uid() is daar leeg, dus de twee
-- wachters op subscriptions laten hem door, net als de cron. De WHERE
-- eist de oude datum, dus twee keer plakken doet niets extra.

do $blk0$
begin
  update public.subscriptions s
     set next_payment_date = (date '2026-09-30' + interval '1 month'),
         updated_at = now()
   where s.id = '44ce94c6-ebb1-4f65-b08e-6df70fcc5af8'
     and s.next_payment_date::date = date '2026-09-30';
end
$blk0$;

-- ── HET ENIGE VERSLAG ───────────────────────────────────────────────
select
  a.tenant_client_code                    as klant,
  s.status,
  s.next_payment_date::date::text         as volgende_betaling,
  case when s.next_payment_date::date = date '2026-10-30'
       then 'OK -- oktober wordt op 30-10 gefactureerd'
       else 'NIET GOED -- meld het' end    as uitkomst,
  (select count(*) from public.subscriptions s2
     join public.invoices i on i.subscription_id = s2.id
                           and i.status = 'paid'
                           and i.period_start >= s2.next_payment_date::date
    where s2.status in ('active','past_due'))  as plannen_nog_vast
from public.subscriptions s
join public.advertisers a on a.id = s.advertiser_id
where s.id = '44ce94c6-ebb1-4f65-b08e-6df70fcc5af8';
