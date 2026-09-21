-- =====================================================================
-- PLAK 32 — F2: de eerste commissie ooit, tot op de cent. LEEST ALLEEN.
-- =====================================================================
-- Gelopen op productie, 21-09-2026:
--
--   PSM0007 (doorverwezen door PSM0005, link 10% "Topup %", EUR) zette
--   EUR 50 uit zijn EUR-wallet op AA-PSM0007-EU-01 (fee 3%). Topup
--   #000004. De eigenaar verifieerde hem.
--
--   Klantscherm na afloop:  EUR-wallet EUR 100,00 -> EUR 50,00
--                           Funded to date EUR 48,50
--
-- Verwacht, als plak 31 goed zit:
--   fee EUR 1,50, geland EUR 48,50, commissie 10% = EUR 4,85, in EUR,
--   status unpaid, gekoppeld aan topup #000004, en earnings_eur op de
--   link van leeg naar 4,85.
--
-- Rij 8 is de optelsom: een saldo dat niet gelijk is aan wat er in en uit
-- ging is een fout, ook als het scherm er netjes uitziet.
--
-- Veilig om vaker te draaien. Er wordt niets geschreven.
-- =====================================================================

set search_path = public;

with
t as (
  select tu.*
    from public.top_ups tu
    join public.advertisers a on a.id = tu.advertiser_id
   where a.tenant_client_code = 'PSM0007'
     and tu.number = 4
   limit 1
),
l as (
  select rl.*
    from public.referral_links rl
    join public.advertisers r on r.id = rl.referred_advertiser_id
   where r.tenant_client_code = 'PSM0007'
   order by rl.created_at asc
   limit 1
),
w as (
  select w.*
    from public.wallets w
    join public.advertisers a on a.id = w.advertiser_id
   where a.tenant_client_code = 'PSM0007'
   limit 1
)
select 1 as nr, 'topup #000004 zoals hij in de database staat' as item,
  coalesce((
    select 'status=' || coalesce(t.status, 'null') ||
           ' | valuta=' || coalesce(t.currency, 'null') ||
           ' | amount_received=' || coalesce(t.amount_received::text, 'null') ||
           ' | fee=' || coalesce(t.fee::text, 'null') ||
           ' | fee_amount=' || coalesce(t.fee_amount::text, 'null') ||
           ' | topup_amount=' || coalesce(t.topup_amount::text, 'null') ||
           ' | topup_usd=' || coalesce(t.topup_usd::text, 'null') ||
           ' | verified_at=' || coalesce(to_char(t.verified_at, 'DD-MM HH24:MI'), 'null')
      from t
  ), 'NIET GEVONDEN - PSM0007 heeft geen topup nummer 4') as antwoord
union all
select 2, 'wat er landde volgens de regel van pure-topup-landed (verwacht 48.50 EUR)',
  coalesce((
    select coalesce(t.topup_amount::text, 'null') || ' ' ||
           case when t.topup_usd is not null then upper(coalesce(t.currency, 'EUR'))
                else 'USD (adminrij)' end
      from t
  ), '-')
union all
select 3, '10% daarvan, zelf uitgerekend (verwacht 4.85)',
  coalesce((
    select to_char(round(coalesce(l.commission_pct, 0)::numeric / 100
                         * coalesce(t.topup_amount, 0)::numeric, 2), 'FM999999990.00')
      from t, l
  ), '-')
union all
select 4, 'commissierijen in de HELE tabel (was 0; verwacht nu 1)',
  (select count(*)::text from public.referral_commissions)
union all
select 5, 'DE commissie: type | bedrag | valuta | status | hoort bij #000004?',
  coalesce((
    select string_agg(
             coalesce(rc.type, 'null') ||
             ' | ' || coalesce(rc.amount::text, 'null') ||
             ' | ' || coalesce(rc.currency, 'null') ||
             ' | ' || coalesce(rc.status, 'null') ||
             ' | ' || case when rc.topup_id = (select id from t) then 'ja, #000004'
                           else 'NEE, topup_id=' || coalesce(rc.topup_id::text, 'null') end ||
             ' | link klopt=' || case when rc.referral_link_id = (select id from l)
                                      then 'ja' else 'NEE' end ||
             ' | ' || to_char(rc.created_at, 'DD-MM HH24:MI'),
             E'\n' order by rc.created_at)
      from public.referral_commissions rc
  ), 'GEEN ENKELE commissierij')
union all
select 6, 'de link PSM0005 -> PSM0007: status | type | pct | earnings_eur | earnings_usd',
  coalesce((
    select coalesce(l.status, 'null') ||
           ' | ' || coalesce(l.commission_type::text, 'null') ||
           ' | ' || coalesce(l.commission_pct::text, 'null') ||
           ' | EUR ' || coalesce(l.earnings_eur::text, 'null') ||
           ' | USD ' || coalesce(l.earnings_usd::text, 'null')
      from l
  ), 'GEEN link gevonden')
union all
select 7, 'earnings_eur tegen de som van de commissierijen in EUR (moeten gelijk zijn)',
  coalesce((
    select 'kolom ' || to_char(coalesce(l.earnings_eur, 0), 'FM999999990.00') ||
           '   som rijen ' || to_char(coalesce((
             select sum(rc.amount) from public.referral_commissions rc
              where rc.referral_link_id = l.id
                and upper(coalesce(rc.currency, '')) = 'EUR'), 0), 'FM999999990.00')
      from l
  ), '-')
union all
select 8, 'PSM0007 wallet: saldo tegen de som van alle bewegingen (EUR; verwacht 50.00 = 50.00)',
  coalesce((
    select 'saldo EUR ' || to_char(coalesce(w.eur_balance, 0), 'FM999999990.00') ||
           ' / USD ' || to_char(coalesce(w.usd_balance, 0), 'FM999999990.00') ||
           '   opgeteld EUR ' || to_char(
             coalesce((select sum(wt.amount) from public.wallet_topups wt
                        where wt.wallet_id = w.id and wt.status = 'completed'
                          and upper(coalesce(wt.currency, 'EUR')) = 'EUR'), 0)
           - coalesce((select sum(tu.amount_received) from public.top_ups tu
                        where tu.advertiser_id = w.advertiser_id
                          and upper(coalesce(tu.currency, 'EUR')) = 'EUR'
                          and coalesce(tu.status, '') <> 'rejected'
                          and coalesce(tu.is_deleted, false) = false), 0)
           - coalesce((select sum(i.total) from public.invoices i
                        where i.advertiser_id = w.advertiser_id
                          and i.status = 'paid'
                          and upper(coalesce(i.currency, 'EUR')) = 'EUR'
                          and lower(coalesce(i.type, '')) not in ('wallet_topup', 'topup')), 0),
             'FM999999990.00')
      from w
  ), 'geen wallet gevonden')
union all
select 9, 'kan dezelfde topup twee keer commissie boeken? (unieke index op topup_id)',
  coalesce((
    select string_agg(indexname || ': ' || indexdef, E'\n')
      from pg_indexes
     where schemaname = 'public' and tablename = 'referral_commissions'
       and indexdef ilike '%unique%' and indexdef ilike '%topup_id%'
  ), 'NEE - er is geen unieke index op topup_id; alleen de exists-check in de trigger houdt het tegen')
union all
select 10, 'meldingen van de laatste 2 uur (wie hoorde er iets van)',
  coalesce((
    select string_agg(
             to_char(n.created_at, 'HH24:MI') || '  ' || n.type ||
             '  ->  ' || coalesce(up.email, n.recipient_user_id::text),
             E'\n' order by n.created_at desc)
      from (select * from public.notifications
             where created_at > now() - interval '2 hours'
             order by created_at desc limit 12) n
      left join public.user_profiles up on up.user_id = n.recipient_user_id
  ), 'geen meldingen in de laatste 2 uur')
order by nr;
