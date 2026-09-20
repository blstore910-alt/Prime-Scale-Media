-- =====================================================================
-- PLAK 5 — reis A2 tot op de cent, en de laatste float-geldkolom
-- =====================================================================
-- Ik heb zojuist de hele reis gelopen: als PSM0005 een claim van
-- EUR 300 ingediend, als owner geverifieerd, en het scherm zegt nu
-- EUR 300,00 met de activiteitsregel op "Credited". Dit meet of de
-- database hetzelfde zegt, tot op de cent.
--
-- En één ding klopte NIET: de klant kreeg geen melding. De code die
-- die schrijft staat live (0b0640e) en hangt aan precies de hook die
-- dat scherm gebruikt -- maar notifyAdvertiser slikt elke fout stil,
-- dus van buitenaf is niet te zien of de rij er niet is, of dat hij er
-- wel is en het scherm hem niet toont. Regel 3 en 4 beslissen dat.
--
-- ── EN ÉÉN REPARATIE ─────────────────────────────────────────────────
--
-- Uit het vorige rapport: `wallets.min_topup` is `real`. Dat is de
-- laatste geldkolom die nog een float is -- alle andere zijn numeric.
-- Een float4 heeft ~7 significante cijfers, dus 300 is toevallig exact
-- en 1234.56 niet. Het is de ondergrens waar elke top-up tegenaan
-- wordt gehouden, dus hij hoort numeric te zijn net als de rest.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

do $blk0$
declare
  v_type text;
  v_def  text;
begin
  select data_type into v_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'wallets'
     and column_name = 'min_topup';

  if v_type is null then
    raise notice 'wallets.min_topup bestaat niet; overgeslagen';
  elsif v_type in ('real', 'double precision') then
    -- Een view kan het type vastpinnen; dan zegt de fout welke.
    execute 'alter table public.wallets alter column min_topup type numeric(14,2) using min_topup::numeric';
    raise notice 'wallets.min_topup omgezet van % naar numeric(14,2)', v_type;
  else
    raise notice 'wallets.min_topup is al %; niets te doen', v_type;
  end if;
  v_def := null;
end;
$blk0$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'A2: de claim van vanavond' as item,
  coalesce((
    select 'status=' || coalesce(wt.status, '-') ||
           '  bedrag=' || to_char(wt.amount, 'FM999999990.00') ||
           ' ' || coalesce(wt.currency, '-') ||
           '  ref=' || coalesce(wt.reference_no, '-') ||
           '  goedgekeurd_door=' || coalesce(wt.approved_by::text, 'NIEMAND')
      from public.wallet_topups wt
     order by wt.created_at desc limit 1
  ), 'geen enkele top-up') as antwoord
union all
select 2, 'A2: wallet van PSM0005 nu  (scherm zei EUR 300,00)',
  coalesce((
    select 'EUR ' || to_char(coalesce(w.eur_balance, 0), 'FM999999990.00') ||
           '   USD ' || to_char(coalesce(w.usd_balance, 0), 'FM999999990.00')
      from public.wallets w
      join public.advertisers a on a.id = w.advertiser_id
     where a.tenant_client_code = 'PSM0005'
     limit 1
  ), 'geen wallet gevonden')
union all
-- Klopt het saldo met de optelsom, of zit er iets tussen?
select 3, 'A2: saldo vs. de som van alle bewegingen (EUR)',
  coalesce((
    select 'saldo ' || to_char(coalesce(w.eur_balance, 0), 'FM999999990.00') ||
           '   opgeteld ' || to_char(
             coalesce((select sum(wt.amount) from public.wallet_topups wt
                        where wt.wallet_id = w.id and wt.status = 'completed'
                          and upper(coalesce(wt.currency, 'EUR')) = 'EUR'), 0)
           - coalesce((select sum(t.amount_received) from public.top_ups t
                        where t.advertiser_id = w.advertiser_id
                          and upper(coalesce(t.currency, 'EUR')) = 'EUR'
                          and coalesce(t.status, '') <> 'rejected'
                          and coalesce(t.is_deleted, false) = false), 0)
           - coalesce((select sum(i.total) from public.invoices i
                        where i.advertiser_id = w.advertiser_id
                          and i.status = 'paid'
                          and upper(coalesce(i.currency, 'EUR')) = 'EUR'
                          and lower(coalesce(i.type, '')) not in ('wallet_topup', 'topup')), 0),
             'FM999999990.00')
      from public.wallets w
      join public.advertisers a on a.id = w.advertiser_id
     where a.tenant_client_code = 'PSM0005'
     limit 1
  ), 'geen wallet gevonden')
union all
-- DE VRAAG: is de melding geschreven?
select 4, 'meldingen van vandaag, nieuwste eerst',
  coalesce((
    select string_agg(
             to_char(n.created_at, 'HH24:MI') || '  ' || n.type ||
             '  ->  ' || coalesce(up.email, n.recipient_user_id::text) ||
             '  ' || coalesce(n.payload::text, ''),
             E'\n' order by n.created_at desc)
      from (select * from public.notifications
             where created_at > now() - interval '12 hours'
             order by created_at desc limit 12) n
      left join public.user_profiles up on up.user_id = n.recipient_user_id
  ), 'GEEN ENKELE melding in de laatste 12 uur')
union all
select 5, 'bestaan de twee nieuwe types al in meldingen',
  coalesce((
    select string_agg(t.type || ': ' || t.n::text, '  |  ' order by t.type)
      from (select type, count(*) n from public.notifications
             where type in ('wallet_topup_completed', 'wallet_topup_rejected',
                            'topup_completed', 'wallet_topup_created')
             group by type) t
  ), 'geen van deze types staat in de tabel')
union all
select 6, 'wallets.min_topup kolomtype',
  coalesce((
    select data_type from information_schema.columns
     where table_schema = 'public' and table_name = 'wallets'
       and column_name = 'min_topup'
  ), 'kolom bestaat niet')
union all
-- De factuur en de commissie die een voltooide top-up ook aanmaken.
select 7, 'heeft deze top-up een factuur en/of commissie opgeleverd',
  coalesce((
    select 'facturen vandaag: ' ||
           (select count(*)::text from public.invoices
             where created_at > now() - interval '2 hours') ||
           '   commissies vandaag: ' ||
           (select count(*)::text from public.referral_commissions
             where created_at > now() - interval '2 hours')
  ), '-')
order by nr;
