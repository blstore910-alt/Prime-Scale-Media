-- Nakijken na de nachtelijke incasso. ALLEEN LEZEN -- draait via
--   npm run check -- -f supabase/checks/NAKIJKEN-MAANDWISSEL.sql
-- Zie docs/MAANDWISSEL_REPETITIE.md voor wat elke regel hoort te zijn.

with klanten as (
  select a.id, a.tenant_client_code as code
    from public.advertisers a
   where a.tenant_client_code in ('PSM0018', 'PSM0006', 'PSM0012', 'PSM0013')
)
select
  k.code                                                         as klant,
  coalesce(w.eur_balance, 0)                                     as wallet_eur,
  s.status                                                       as abonnement,
  to_char(s.next_payment_date, 'DD-MM')                          as volgende_incasso,
  (select count(*) from public.invoices i
    where i.advertiser_id = k.id and i.type = 'subscription')     as facturen_totaal,
  (select count(*) from public.invoices i
    where i.advertiser_id = k.id and i.type = 'subscription'
      and i.status = 'paid')                                      as waarvan_betaald,
  (select count(*) from public.invoices i
    where i.advertiser_id = k.id and i.type = 'subscription'
      and i.created_at > now() - interval '18 hours')             as vannacht_erbij,
  (select to_char(max(i.due_date), 'DD-MM') from public.invoices i
    where i.advertiser_id = k.id and i.type = 'subscription'
      and i.status = 'unpaid')                                    as oudste_open_vervalt,
  case
    -- Het oordeel hangt aan de FACTUUR, niet aan het saldo. Het saldo
    -- kan om goede redenen anders zijn -- een ad-accountaanvraag kost
    -- EUR 50 van dezelfde wallet -- en dan zou een hard bedrag hier
    -- een geslaagde incasso als fout lezen.
    when k.code = 'PSM0018'
         and exists (select 1 from public.invoices i
                      where i.advertiser_id = k.id
                        and i.type = 'subscription' and i.status = 'paid')
         and s.status = 'active'
      then 'GOED -- incasso gelukt, abonnement bleef active'
    when k.code = 'PSM0018'
         and exists (select 1 from public.invoices i
                      where i.advertiser_id = k.id
                        and i.type = 'subscription' and i.status = 'paid')
      then 'KIJKEN -- factuur betaald maar abonnement staat op ' || coalesce(s.status, '?')
    when k.code = 'PSM0018'
      then 'NIET GEBEURD -- geen betaalde abonnementsfactuur; plak 163 niet gedraaid of de run is niet gelopen'
    -- Voor de drie oude testaccounts: pas een oordeel NADAT de run
    -- gelopen heeft. Anders leest de stand van voor de nacht als een
    -- geslaagde uitslag, en dat is precies de fout die dit moet vangen.
    when (select count(*) from public.invoices i
           where i.advertiser_id = k.id and i.type = 'subscription'
             and i.created_at > now() - interval '18 hours') = 0
      then 'NOG NIET GELOPEN -- geen factuur van vannacht'
    when s.status = 'past_due' and coalesce(w.eur_balance, 0) = 0
      then 'GOED -- factuur erbij, incasso mislukt, blijft past_due (verwacht)'
    else 'KIJKEN'
  end                                                             as oordeel
from klanten k
left join public.wallets w on w.advertiser_id = k.id
left join public.subscriptions s on s.advertiser_id = k.id
order by (k.code <> 'PSM0018'), k.code;
