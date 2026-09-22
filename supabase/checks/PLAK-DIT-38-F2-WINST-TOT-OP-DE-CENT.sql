-- =====================================================================
-- PLAK 38 — F2: de eerste commissie op WINST, tot op de cent. LEEST ALLEEN.
-- =====================================================================
-- Gelopen op productie, 22-09:
--   * leverancierskost per type gezet (Settings > Ad account types):
--     Meta-EU-PSM-RA 2%, Meta-EU-PSM-GH 2,5%, de rest 0%;
--   * standaardregels gezet (/affiliates > Default rules): 20% van de
--     winst op elk type, 20% van elke betaalde abonnementsfactuur, geen
--     eenmalige bonus;
--   * PSM0007 zet EUR 50 op AA-PSM0007-EU-01 (fee 3%), de eigenaar
--     verifieert.
--
-- Verwacht:
--   fee 1,50 | landt 48,50 | leverancier 2% = 0,97 | winst 0,53 |
--   commissie 20% = 0,11 EUR, unpaid, source 'topup', met de regel erbij
--   earnings_eur op de link: 4,85 -> 4,96
--   PSM0007 wallet EUR 50,00 -> 0,00
--
-- Veilig om vaker te draaien. Er wordt niets geschreven.
-- =====================================================================

set search_path = public;

with
adv as (
  select a.id, a.tenant_id from public.advertisers a where a.tenant_client_code = 'PSM0007' limit 1
),
t as (
  select tu.* from public.top_ups tu, adv
   where tu.advertiser_id = adv.id
   order by tu.created_at desc
   limit 1
),
l as (
  select rl.* from public.referral_links rl, adv
   where rl.referred_advertiser_id = adv.id
   order by rl.created_at asc limit 1
)
select 1 as nr, 'nieuwste funding van PSM0007' as item,
  coalesce((select '#' || t.number || ' | status=' || t.status || ' | ' || coalesce(t.currency, '?') ||
                   ' | ontvangen ' || t.amount_received || ' | fee ' || t.fee || '% = ' || t.fee_amount ||
                   ' | landt ' || t.topup_amount || ' | topup_usd ' || coalesce(t.topup_usd::text, 'null') ||
                   ' | verified ' || coalesce(to_char(t.verified_at, 'DD-MM HH24:MI'), 'nee')
              from t), 'geen') as antwoord
union all
select 2, 'type van het account + leverancierskost die de trigger ziet',
  coalesce((select x.platform || ' | leverancier ' ||
                   coalesce(public._supplier_fee_pct_for(t.account_id, t.tenant_id)::text, 'NIET INGEVULD') || '%'
              from t join public.ad_accounts x on x.id = t.account_id), '?')
union all
select 3, 'de regel die gold op het moment van verifiëren',
  coalesce((select string_agg(coalesce(r.pct::text, '-') || '% (' || r.level || ')', ', ')
              from t, l,
                   public._commission_rule_at(t.tenant_id, l.affiliate_advertiser_id, 'topup',
                     (select x.platform from public.ad_accounts x where x.id = t.account_id),
                     coalesce(t.verified_at, now())) r), 'GEEN regel')
union all
select 4, 'zelf uitgerekend: fee - leverancier = winst -> x % = commissie',
  coalesce((
    select to_char(round(t.fee_amount::numeric, 2), 'FM999990.00') || ' - ' ||
           to_char(round(round(t.topup_amount::numeric, 2) * public._supplier_fee_pct_for(t.account_id, t.tenant_id) / 100, 2), 'FM999990.00') ||
           ' = ' ||
           to_char(round(round(t.fee_amount::numeric, 2) - round(round(t.topup_amount::numeric, 2) * public._supplier_fee_pct_for(t.account_id, t.tenant_id) / 100, 2), 2), 'FM999990.00') ||
           ' -> x 20% = ' ||
           to_char(round(round(round(t.fee_amount::numeric, 2) - round(round(t.topup_amount::numeric, 2) * public._supplier_fee_pct_for(t.account_id, t.tenant_id) / 100, 2), 2) * 20 / 100, 2), 'FM999990.00')
      from t), '?')
union all
select 5, 'DE commissie op die funding (zoals geboekt)',
  coalesce((select string_agg(
             coalesce(rc.source, 'null') || ' | ' || rc.type || ' | ' || rc.amount || ' ' || rc.currency ||
             ' | ' || coalesce(rc.status, 'null') ||
             ' | grondslag ' || coalesce(rc.base_amount::text, 'null') ||
             ' | ' || coalesce(rc.pct::text, 'null') || '%' ||
             ' | fee ' || coalesce(rc.fee_amount::text, 'null') ||
             ' | leverancier ' || coalesce(rc.supplier_fee_pct::text, 'null') || '% = ' || coalesce(rc.supplier_cost::text, 'null') ||
             ' | regel ' || case when rc.rule_id is null then 'GEEN' else 'ja' end ||
             ' | ' || coalesce(rc.note, ''), E'\n')
              from public.referral_commissions rc, t where rc.topup_id = t.id), 'GEEN commissie op deze funding')
union all
select 6, 'alle commissies op de link (oud + nieuw)',
  coalesce((select string_agg(to_char(rc.created_at, 'DD-MM HH24:MI') || ' ' || coalesce(rc.source, 'oud') || ' ' ||
                              rc.amount || ' ' || rc.currency || ' ' || coalesce(rc.status, 'null'), E'\n' order by rc.created_at)
              from public.referral_commissions rc, l where rc.referral_link_id = l.id), 'geen')
union all
select 7, 'earnings_eur op de link tegen de som van unpaid+paid (moeten gelijk zijn)',
  coalesce((select 'kolom ' || coalesce(l.earnings_eur::text, 'null') || ' | som ' ||
                   coalesce((select sum(rc.amount) from public.referral_commissions rc
                              where rc.referral_link_id = l.id and upper(rc.currency) = 'EUR'
                                and coalesce(rc.status, 'unpaid') in ('unpaid', 'paid'))::text, '0')
              from l), '?')
union all
select 8, 'PSM0007 wallet nu',
  coalesce((select 'EUR ' || w.eur_balance || ' | USD ' || w.usd_balance
              from public.wallets w, adv where w.advertiser_id = adv.id), '?')
union all
select 9, 'meldingen van de laatste uur',
  coalesce((select string_agg(to_char(n.created_at, 'HH24:MI') || ' ' || n.type || ' -> ' ||
                              coalesce(up.email, n.recipient_user_id::text) || ' ' || coalesce(n.payload::text, ''),
                              E'\n' order by n.created_at desc)
              from (select * from public.notifications where created_at > now() - interval '1 hour'
                     order by created_at desc limit 10) n
              left join public.user_profiles up on up.user_id = n.recipient_user_id), 'geen')
order by nr;
