-- =====================================================================
-- PLAK 8 — zet één maandfactuur open, zodat ik A5 echt kan lopen
-- =====================================================================
-- A5 is: maandfactuur -> Pay now uit de wallet -> saldo en status
-- kloppen. PSM0005 heeft een actief Prime-abonnement van EUR 5,00 per
-- maand, maar de eerstvolgende staat pas op 18 oktober. Er is dus niets
-- open om te betalen.
--
-- Ik kan er geen met de hand omheen maken: `setInvoicePaidStatus`
-- weigert paid -> unpaid met opzet (anders incasseert de cron hem een
-- tweede keer), en dat is een goede grendel waar ik niet omheen ga. En
-- een losse handmatige factuur loopt door een ándere tak van het
-- scherm dan de abonnementsfactuur.
--
-- Dus doet de echte motor het. Dit zet de klok van PSM0005 één maand
-- terug en roept `subscription_billing_run()` aan — precies wat de cron
-- elke nacht om 03:00 doet.
--
-- ── WAT ER GEBEURT ───────────────────────────────────────────────────
--
-- * Alleen PSM0005. Er is één ander abonnement (PSM0004) en dat staat
--   op inactive, dus de run raakt het niet aan — regel 1 telt dat na.
-- * De factuur krijgt due_date = nu + 7 dagen, dus de automatische
--   incasso in dezelfde run pakt hem NIET op. Hij blijft netjes open
--   staan tot ik hem als klant betaal.
-- * Dit test meteen de void-fix van plak 2: er staat een gestorneerde
--   factuur (0005-118) op deze klant, en die mag zijn maand niet meer
--   blokkeren.
--
-- Na afloop zet de betaling de klok vanzelf weer vooruit
-- (`_on_subscription_invoice_paid` zet next_payment_date op
-- period_start + 1 maand), dus er blijft niets scheef staan.
--
-- Veilig om vaker te draaien: een tweede run ziet de openstaande
-- factuur en slaat de klant over.
-- =====================================================================

set search_path = public;

create temporary table if not exists _a5 (k text, v text);
delete from _a5;

do $blk0$
declare
  v_sub   record;
  v_was   date;
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

  v_was := v_sub.next_payment_date::date;
  insert into _a5 values ('klok stond op', coalesce(v_was::text, '-'));

  -- ── EEN TWEEDE RUN MAG DE KLOK NIET NOG EEN MAAND TERUGZETTEN ────
  --
  -- De eerste poging viel om op een typefout in de RAPPORTREGEL, niet
  -- in dit blok -- de SQL-editor voert de statements op volgorde uit,
  -- dus de klok was toen al verzet en de motor had al gedraaid. Nog een
  -- keer plakken zou hem dan nóg een maand terugzetten en een tweede
  -- maand factureren.
  --
  -- Staat er al een openstaande abonnementsfactuur, dan is het werk
  -- gedaan en raken we niets meer aan.
  if exists (
    select 1 from public.invoices i
     where i.advertiser_id = v_sub.advertiser_id
       and i.type = 'subscription'
       and i.status = 'unpaid'
  ) then
    insert into _a5 values (
      'overgeslagen',
      'er staat al een openstaande maandfactuur; klok en motor niet aangeraakt');
    return;
  end if;

  -- Eén maand terug, zodat de run hem als verschuldigd ziet.
  update public.subscriptions
     set next_payment_date = (v_was - interval '1 month'),
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
    select s.next_payment_date::text
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
-- Heeft de run per ongeluk iemand anders geraakt?
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
-- En de proef dat de void-fix werkt: er staat een gestorneerde factuur
-- op deze klant, en die hoort geen maand meer te blokkeren.
select 6, 'gestorneerde facturen van PSM0005 (mogen niets blokkeren)',
  (select count(*)::text from public.invoices i
     join public.advertisers a on a.id = i.advertiser_id
    where a.tenant_client_code = 'PSM0005'
      and coalesce(i.status, '') in ('void', 'cancelled'))
order by nr;
