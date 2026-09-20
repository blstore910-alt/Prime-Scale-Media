-- =====================================================================
-- PLAK 9 — nu op een periode die nog niet gefactureerd is
-- =====================================================================
-- Plak 8 zette de klok op 18 september en de motor deed niets. Dat is
-- GOED: voor die periode staat factuur 0005-121 al betaald, en de
-- duplicaat-test zag die en sloeg de klant over. De grendel werkt.
--
-- Het was mijn opzet die fout was. Eén maand terug landde precies op
-- een periode die al gefactureerd is. De klok moet op een dag staan die
-- (a) in het verleden ligt, zodat de run hem als verschuldigd ziet, en
-- (b) nog nooit een factuurperiode is geweest.
--
-- Dat is vandaag. De motor maakt dan een factuur met
-- period_start = vandaag en due_date = vandaag + 7 dagen, dus de
-- automatische incasso in diezelfde run laat hem staan.
--
-- ── ÉÉN BIJWERKING, EXPLICIET ────────────────────────────────────────
--
-- Als ik hem straks als klant betaal, zet `_on_subscription_invoice_paid`
-- de klok op period_start + 1 maand. Dat is dan de 20e in plaats van de
-- 18e: twee dagen verschoven ten opzichte van waar PSM0005 stond. Ik
-- zet dat terug in de volgende plak, samen met de controle van de
-- cijfers. Ik noem het hier zodat het geen verrassing is.
--
-- Veilig om vaker te draaien: staat er al een openstaande maandfactuur,
-- dan raakt dit bestand niets aan.
-- =====================================================================

set search_path = public;

create temporary table if not exists _a5 (k text, v text);
delete from _a5;

do $blk0$
declare
  v_sub   record;
  v_res   jsonb;
begin
  select s.id, s.advertiser_id, s.amount, s.currency, s.status,
         s.next_payment_date
    into v_sub
    from public.subscriptions s
    join public.advertisers a on a.id = s.advertiser_id
   where a.tenant_client_code = 'PSM0005'
     and s.status in ('active', 'past_due')
   order by s.created_at desc
   limit 1;

  if v_sub.id is null then
    insert into _a5 values ('fout', 'PSM0005 heeft geen actief abonnement');
    return;
  end if;

  insert into _a5 values ('klok stond op',
    coalesce(v_sub.next_payment_date::date::text, '-'));

  -- Al een openstaande factuur? Dan is het werk gedaan.
  if exists (
    select 1 from public.invoices i
     where i.advertiser_id = v_sub.advertiser_id
       and i.type = 'subscription'
       and i.status = 'unpaid'
  ) then
    insert into _a5 values (
      'overgeslagen',
      'er staat al een openstaande maandfactuur; niets aangeraakt');
    return;
  end if;

  -- Is vandaag al eens een factuurperiode geweest? Dan zou de run
  -- opnieuw niets doen en heeft verzetten geen zin.
  if exists (
    select 1 from public.invoices i
     where i.subscription_id = v_sub.id
       and i.period_start = current_date
       and coalesce(i.status, '') not in ('void', 'cancelled')
  ) then
    insert into _a5 values (
      'kan niet',
      'voor vandaag bestaat al een factuur; kies een andere dag');
    return;
  end if;

  update public.subscriptions
     set next_payment_date = current_date,
         updated_at = now()
   where id = v_sub.id;

  v_res := public.subscription_billing_run();
  insert into _a5 values ('wat de motor deed', v_res::text);
end;
$blk0$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'wat de incasso-motor deed' as item,
  coalesce((
    select string_agg(k || ': ' || v, E'\n' order by k) from _a5
  ), 'niets gelopen') as antwoord
union all
select 2, 'openstaande abonnementsfacturen voor PSM0005',
  coalesce((
    select string_agg(
             coalesce(i.number::text, i.id::text) || '  ' ||
             to_char(i.total, 'FM999999990.00') || ' ' ||
             upper(coalesce(i.currency, 'EUR')) ||
             '  periode ' || coalesce(i.period_start::text, '-') ||
             '  vervalt ' || coalesce(i.due_date::date::text, '-'),
             E'\n' order by i.created_at desc)
      from public.invoices i
      join public.advertisers a on a.id = i.advertiser_id
     where a.tenant_client_code = 'PSM0005'
       and i.type = 'subscription'
       and i.status = 'unpaid'
  ), 'GEEN - de run heeft niets geraakt')
union all
select 3, 'de klok staat nu op',
  coalesce((
    select s.next_payment_date::date::text
      from public.subscriptions s
      join public.advertisers a on a.id = s.advertiser_id
     where a.tenant_client_code = 'PSM0005'
       and s.status in ('active', 'past_due')
     order by s.created_at desc limit 1
  ), '-')
union all
select 4, 'wallet van PSM0005 nu  (moet nog EUR 200,00 zijn)',
  coalesce((
    select 'EUR ' || to_char(coalesce(w.eur_balance, 0), 'FM999999990.00') ||
           '   USD ' || to_char(coalesce(w.usd_balance, 0), 'FM999999990.00')
      from public.wallets w
      join public.advertisers a on a.id = w.advertiser_id
     where a.tenant_client_code = 'PSM0005' limit 1
  ), 'geen wallet')
union all
select 5, 'andere abonnementen die deze run heeft aangeraakt',
  coalesce((
    select string_agg(a.tenant_client_code || ': ' || s.status, ', '
                      order by a.tenant_client_code)
      from public.subscriptions s
      join public.advertisers a on a.id = s.advertiser_id
     where s.updated_at > now() - interval '2 minutes'
       and a.tenant_client_code <> 'PSM0005'
  ), 'geen - alleen PSM0005')
union all
-- Ter controle: welke perioden van deze klant zijn al gefactureerd, en
-- met welke status. Dit laat zien waarom 18 september werd overgeslagen.
select 6, 'alle abonnementsfacturen van PSM0005, per periode',
  coalesce((
    select string_agg(
             coalesce(i.period_start::text, 'geen periode') || '  ' ||
             coalesce(i.status, '-') || '  ' ||
             to_char(i.total, 'FM999999990.00'),
             E'\n' order by i.period_start desc nulls last)
      from public.invoices i
      join public.advertisers a on a.id = i.advertiser_id
     where a.tenant_client_code = 'PSM0005'
       and i.type = 'subscription'
  ), 'geen')
order by nr;
