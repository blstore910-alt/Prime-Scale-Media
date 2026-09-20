-- =====================================================================
-- C1 t/m C8 — alle acht cijfer-checks in ÉÉN plak, ÉÉN tabel
-- =====================================================================
-- De walkthrough zet acht losse SQL-blokken naast elkaar, en de
-- SQL-editor laat alleen het LAATSTE resultaat zien. Dus acht keer
-- plakken, acht keer scrollen. Dit is hetzelfde, in één keer.
--
-- Leest alleen. Verandert niets.
--
-- Wat je terugkrijgt: één tabel, `blok | regel | waarde`. Stuur hem
-- terug zoals hij is — dan leg ik elke regel naast het scherm en zeg ik
-- per regel of het klopt tot op de cent, of niet.
--
-- WAAR IK OP LET, per blok:
--   C1  wallet-saldi per klant (scherm: hun eigen wallet-kaarten, en
--       /wallets bij de admin)
--   C2  geld binnen per valuta (dashboard "Wallet in", /wallet-topups)
--   C3  geld op ad-accounts + fee, alles USD (dashboard "Ad topups"
--       en "Fees"); een doorgestreepte top-up telt in GEEN van de drie
--   C4  facturen per type/status/valuta (het symbool komt van
--       invoices.currency, niet van het plan)
--   C5  abonnementen (hero "Subscriptions - billing now" = active +
--       past_due)
--   C6  commissies en clawbacks, BEIDE valuta's
--   C7  de maandgrens — een cijfer mag niet met terugwerkende kracht
--       bewegen als een oude factuur alsnog betaald wordt
--   C8  telt het geheel op, en: niets mag negatief zijn
-- =====================================================================

set search_path = public;

with

-- ── C1. De wallets ───────────────────────────────────────────────────
c1 as (
  select
    1 as blk,
    coalesce(a.tenant_client_code, '(geen code)') as line,
    'EUR ' || to_char(coalesce(w.eur_balance, 0), 'FM999999990.00') ||
    '  |  USD ' || to_char(coalesce(w.usd_balance, 0), 'FM999999990.00')
      as val,
    coalesce(a.tenant_client_code, 'zzz') as ord
  from public.wallets w
  left join public.advertisers a on a.id = w.advertiser_id
),

-- ── C2. Geld binnen ──────────────────────────────────────────────────
c2 as (
  select
    2, upper(coalesce(currency, 'EUR')) || ' — afgeronde top-ups',
    count(*)::text || ' stuks  |  ' ||
      to_char(coalesce(sum(amount), 0), 'FM999999990.00'),
    upper(coalesce(currency, 'EUR'))
  from public.wallet_topups
  where status = 'completed'
  group by upper(coalesce(currency, 'EUR'))
),
c2b as (
  select 2, 'nog open (niet completed/failed/rejected)',
    count(*)::text || ' stuks  |  ' ||
      to_char(coalesce(sum(amount), 0), 'FM999999990.00'), 'zz'
  from public.wallet_topups
  where coalesce(status, 'pending') not in ('completed', 'failed', 'rejected')
),

-- ── C3. Geld op de ad-accounts, en de fee ────────────────────────────
c3 as (
  select 3, 'ad-account top-ups (USD)',
    count(*)::text || ' stuks  |  landde ' ||
      to_char(coalesce(sum(topup_amount), 0), 'FM999999990.00') ||
      '  |  fee ' || to_char(coalesce(sum(fee_amount), 0), 'FM999999990.00') ||
      '  |  uit wallet ' ||
      to_char(coalesce(sum(amount_usd), 0), 'FM999999990.00'),
    'a'
  from public.top_ups
  where status = 'completed' and coalesce(is_deleted, false) = false
),
-- De doorgestreepte, apart. Die horen in GEEN van de drie cijfers
-- hierboven te zitten; als dit getal boven 0 staat en het scherm telt
-- ze wel mee, dan is dat meteen zichtbaar.
c3b as (
  select 3, 'daarvan doorgestreept (mag nergens meetellen)',
    count(*)::text || ' stuks  |  ' ||
      to_char(coalesce(sum(amount_usd), 0), 'FM999999990.00'), 'b'
  from public.top_ups
  where status = 'completed' and coalesce(is_deleted, false) = true
),
-- amount_received is de ENIGE regel in de valuta van de klant zelf.
c3c as (
  select 3, 'amount_received per valuta (de klant z''n eigen bedrag)',
    string_agg(
      upper(coalesce(currency, 'EUR')) || ' ' ||
        to_char(t, 'FM999999990.00'), '  |  ' order by c),
    'c'
  from (
    select upper(coalesce(currency, 'EUR')) as c,
           coalesce(sum(amount_received), 0) as t
      from public.top_ups
     where status = 'completed' and coalesce(is_deleted, false) = false
     group by 1
  ) x
),

-- ── C4. Facturen ─────────────────────────────────────────────────────
c4 as (
  select 4,
    coalesce(type, '(geen type)') || ' · ' || coalesce(status, '(geen status)')
      || ' · ' || upper(coalesce(currency, 'EUR')),
    count(*)::text || ' stuks  |  ' ||
      to_char(coalesce(sum(total), 0), 'FM999999990.00'),
    coalesce(type, 'zzz') || coalesce(status, '')
      || upper(coalesce(currency, 'EUR'))
  from public.invoices
  group by type, status, upper(coalesce(currency, 'EUR'))
),
-- Een factuur zonder currency wordt door invoice_pay_from_wallet als
-- EUR afgeschreven. Staat er een dollarbedrag in, dan wordt dat in
-- euro's van de wallet gehaald.
c4b as (
  select 4, 'facturen ZONDER currency (RPC leest die als EUR)',
    count(*)::text || ' stuks  |  ' ||
      to_char(coalesce(sum(total), 0), 'FM999999990.00'), 'zzzz'
  from public.invoices where currency is null
),

-- ── C5. Abonnementen ─────────────────────────────────────────────────
c5 as (
  select 5,
    coalesce(s.status, '(geen status)') || ' · ' ||
      upper(coalesce(s.currency, 'EUR')),
    count(*)::text || ' stuks  |  per maand ' ||
      to_char(coalesce(sum(s.amount), 0), 'FM999999990.00'),
    coalesce(s.status, 'zzz')
  from public.subscriptions s
  group by s.status, upper(coalesce(s.currency, 'EUR'))
),
c5b as (
  select 5, 'HERO: billing now (active + past_due)',
    count(*)::text || ' stuks  |  per maand ' ||
      to_char(coalesce(sum(amount), 0), 'FM999999990.00'), 'zz'
  from public.subscriptions
  where coalesce(status, '') in ('active', 'past_due')
),

-- ── C6. Commissies en clawbacks ──────────────────────────────────────
c6 as (
  select 6,
    upper(coalesce(currency, 'EUR')) || ' · ' ||
      coalesce(status, '(geen status)'),
    count(*)::text || ' stuks  |  ' ||
      to_char(coalesce(sum(amount), 0), 'FM999999990.00'),
    upper(coalesce(currency, 'EUR')) || coalesce(status, '')
  from public.referral_commissions
  group by upper(coalesce(currency, 'EUR')), status
),
c6b as (
  select 6, 'clawbacks',
    case when to_regclass('public.referral_clawbacks') is null
      then 'tabel staat niet op deze database'
      else (select count(*)::text || ' stuks  |  ' ||
                   to_char(coalesce(sum(amount), 0), 'FM999999990.00')
              from public.referral_clawbacks)
    end, 'zy'
),
-- Dit is de regel die de drie schermen uit elkaar heeft laten lopen:
-- referral_links.earnings_* zou gelijk moeten zijn aan
-- som(commissies) - som(clawbacks), per valuta. Staat hier iets anders
-- dan 0, dan liegt een van de schermen.
c6c as (
  select 6, 'links waar earnings NIET gelijk is aan commissies -/- clawbacks',
    case when to_regclass('public.referral_clawbacks') is null
      then 'clawback-tabel ontbreekt; niet te bepalen'
      else (
        select count(*)::text || ' van ' ||
               (select count(*)::text from public.referral_links)
          from public.referral_links rl
         where round(coalesce(rl.earnings_eur, 0)::numeric, 2) <> round((
                 coalesce((select sum(rc.amount) from public.referral_commissions rc
                            where rc.referral_link_id = rl.id
                              and upper(coalesce(rc.currency, 'EUR')) = 'EUR'), 0)
               - coalesce((select sum(cb.amount) from public.referral_clawbacks cb
                            where cb.referral_link_id = rl.id
                              and upper(coalesce(cb.currency, 'EUR')) = 'EUR'), 0)
               )::numeric, 2)
            or round(coalesce(rl.earnings_usd, 0)::numeric, 2) <> round((
                 coalesce((select sum(rc.amount) from public.referral_commissions rc
                            where rc.referral_link_id = rl.id
                              and upper(coalesce(rc.currency, 'EUR')) = 'USD'), 0)
               - coalesce((select sum(cb.amount) from public.referral_clawbacks cb
                            where cb.referral_link_id = rl.id
                              and upper(coalesce(cb.currency, 'EUR')) = 'USD'), 0)
               )::numeric, 2)
      )
    end, 'zz'
),

-- ── C7. De maandgrens ────────────────────────────────────────────────
-- Als paid_at en created_at in verschillende maanden vallen, dan
-- beweegt een "deze maand"-cijfer met terugwerkende kracht zodra een
-- oude factuur alsnog betaald wordt. Daarom staan ze hier allebei.
c7 as (
  select 7,
    'betaald in ' || to_char(coalesce(paid_at, created_at), 'YYYY-MM'),
    count(*)::text || ' stuks  |  ' ||
      to_char(coalesce(sum(total), 0), 'FM999999990.00'),
    to_char(coalesce(paid_at, created_at), 'YYYY-MM')
  from public.invoices
  where status = 'paid'
  group by 2, to_char(coalesce(paid_at, created_at), 'YYYY-MM')
),
c7b as (
  select 7, 'betaalde facturen waar paid_at een ANDERE maand is dan created_at',
    count(*)::text, 'zz'
  from public.invoices
  where status = 'paid' and paid_at is not null
    and to_char(paid_at, 'YYYY-MM') <> to_char(created_at, 'YYYY-MM')
),

-- ── C8. Telt het geheel op ───────────────────────────────────────────
c8 as (
  select 8, 'wallet in (EUR, completed)',
    to_char((select coalesce(sum(amount), 0) from public.wallet_topups
              where status = 'completed'
                and upper(coalesce(currency, 'EUR')) = 'EUR'), 'FM999999990.00'), 'a'
  union all
  select 8, 'wallet in (USD, completed)',
    to_char((select coalesce(sum(amount), 0) from public.wallet_topups
              where status = 'completed'
                and upper(coalesce(currency, 'EUR')) = 'USD'), 'FM999999990.00'), 'b'
  union all
  select 8, 'uit de wallet naar ad-accounts (USD)',
    to_char((select coalesce(sum(amount_usd), 0) from public.top_ups
              where status = 'completed'
                and coalesce(is_deleted, false) = false), 'FM999999990.00'), 'c'
  union all
  select 8, 'gefactureerd en betaald',
    to_char((select coalesce(sum(total), 0) from public.invoices
              where status = 'paid'), 'FM999999990.00'), 'd'
  union all
  select 8, 'saldo in alle wallets samen (EUR)',
    to_char((select coalesce(sum(eur_balance), 0) from public.wallets),
            'FM999999990.00'), 'e'
  union all
  select 8, 'saldo in alle wallets samen (USD)',
    to_char((select coalesce(sum(usd_balance), 0) from public.wallets),
            'FM999999990.00'), 'f'
  union all
  -- Een negatieve wallet is geld dat we hebben weggegeven.
  select 8, 'wallets met een NEGATIEF saldo',
    (select count(*)::text from public.wallets
      where coalesce(eur_balance, 0) < 0 or coalesce(usd_balance, 0) < 0), 'g'
  union all
  -- Voorschotten staan wél in het saldo en zijn nog niet betaald.
  select 8, 'openstaande voorschotten (zitten al WEL in het saldo hierboven)',
    case when to_regclass('public.wallet_precharges') is null
      then 'tabel staat niet op deze database'
      else (select coalesce(count(*)::text || ' stuks  |  EUR ' ||
                   to_char(coalesce(sum(outstanding) filter
                     (where currency = 'EUR'), 0), 'FM999999990.00') ||
                   '  |  USD ' ||
                   to_char(coalesce(sum(outstanding) filter
                     (where currency = 'USD'), 0), 'FM999999990.00'), '0')
              from public.wallet_precharges where status = 'outstanding')
    end, 'h'
)

select
  case blk
    when 1 then 'C1 wallets'
    when 2 then 'C2 geld binnen'
    when 3 then 'C3 ad-accounts + fee'
    when 4 then 'C4 facturen'
    when 5 then 'C5 abonnementen'
    when 6 then 'C6 commissies'
    when 7 then 'C7 maandgrens'
    else        'C8 telt het op'
  end as blok,
  line as regel,
  val  as waarde
from (
  select * from c1  union all select * from c2  union all select * from c2b
  union all select * from c3  union all select * from c3b union all select * from c3c
  union all select * from c4  union all select * from c4b
  union all select * from c5  union all select * from c5b
  union all select * from c6  union all select * from c6b union all select * from c6c
  union all select * from c7  union all select * from c7b
  union all select * from c8
) all_rows
order by blk, ord, line;
