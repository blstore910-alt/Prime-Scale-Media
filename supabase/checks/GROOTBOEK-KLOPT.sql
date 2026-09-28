-- ════════════════════════════════════════════════════════════════════
-- KLOPT HET GROOTBOEK? — draai dit elke ochtend
-- ════════════════════════════════════════════════════════════════════
--
--   npm run check -- -f supabase/checks/GROOTBOEK-KLOPT.sql
--
-- Dit is de controle die bij plak 125 hoort en die er vanaf nu elke dag
-- bij hoort. Hij LEEST alleen.
--
-- NUL RIJEN IN DE EERSTE TABEL IS GOED. Elke rij daarin is een
-- portemonnee waarvan het saldo niet gelijk is aan de som van zijn
-- eigen bewegingen -- dus geld dat is verplaatst zonder dat het
-- grootboek het heeft gezien, of andersom. Dat is het enige getal in
-- dit bestand dat alarm is.
--
-- De tweede tabel is de werklijst: bewegingen die wel geboekt zijn maar
-- waarvan we het WAAROM niet weten, omdat de RPC die ze veroorzaakte
-- zijn hint nog niet zet. Dat is werk, geen fout -- de regel staat er,
-- alleen zonder naam erbij.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. HET ALARM: portemonnees waar de boeken niet kloppen ──────────
select
  w.advertiser_id,
  round(coalesce(w.eur_balance, 0), 2)                        as eur_saldo,
  round(coalesce(sum(l.delta) filter (
          where upper(l.currency) = 'EUR'), 0), 2)            as eur_uit_regels,
  round(coalesce(w.usd_balance, 0), 2)                        as usd_saldo,
  round(coalesce(sum(l.delta) filter (
          where upper(l.currency) = 'USD'), 0), 2)            as usd_uit_regels,
  count(l.id)                                                 as regels
from public.wallets w
left join public.wallet_ledger l on l.wallet_id = w.id
group by w.id, w.advertiser_id, w.eur_balance, w.usd_balance
having round(coalesce(w.eur_balance, 0), 2) is distinct from
       round(coalesce(sum(l.delta) filter (where upper(l.currency) = 'EUR'), 0), 2)
    or round(coalesce(w.usd_balance, 0), 2) is distinct from
       round(coalesce(sum(l.delta) filter (where upper(l.currency) = 'USD'), 0), 2)
order by 1;

-- ── 2. DE WERKLIJST: bewegingen zonder reden ────────────────────────
select
  l.source,
  count(*)                                   as regels,
  min(l.occurred_at)                         as eerste,
  max(l.occurred_at)                         as laatste,
  round(sum(abs(l.delta)), 2)                as omvang
from public.wallet_ledger l
group by l.source
order by (l.source = 'unknown') desc, count(*) desc;
