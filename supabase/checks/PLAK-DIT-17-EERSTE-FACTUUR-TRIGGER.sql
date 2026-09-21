-- =====================================================================
-- PLAK 17 — de trigger die de weesfacturen maakte
-- =====================================================================
-- Plak 16 repareerde de RIJ. Dit repareert de bron, nu ik de live body
-- heb gezien. Er zitten vier dingen in die geld raken.
--
-- 1. `subscription_id` STAAT IN DE ITEMS-JSON, NIET IN DE KOLOM.
--
--        'subscription_id', NEW.id     <- in jsonb_build_object
--
--    De kolom blijft leeg, en daar hangt alles aan: de duplicaat-grendel
--    van de incasso-motor (`i.subscription_id = r.id and i.period_start
--    = v_period`), de incasso-lus zelf (`subscription_id is not null`)
--    en `_on_subscription_invoice_paid`. Eén lege kolom, en de factuur
--    wordt dubbel gemaakt, nooit geïnd, en betalen doet niets.
--
-- 2. `period_start` WORDT NIET GEZET. Tweede helft van dezelfde grendel.
--
-- 3. `v_amount::real` OP EEN GELDBEDRAG. `real` is single precision:
--    EUR 99.99 wordt 99.98999786376953. De kolommen zijn allang numeric
--    (20260918200000); deze cast gooit dat weg op de eerste factuur die
--    een klant ooit ziet. Weg ermee.
--
-- 4. DE KORTING WORDT NIET TOEGEPAST. `subscription_billing_run` rekent
--    elke maandfactuur via de perks (`subscription_waiver` slaat over,
--    `subscription_discount` vermenigvuldigt), en plak 12 bracht
--    `change_subscription_amount` op dezelfde lijn. Deze trigger niet --
--    dus een klant met korting kreeg zijn EERSTE factuur op de volle
--    lijstprijs. Nu via `_effective_subscription_amount`, dezelfde
--    functie als plak 12.
--
-- ── WAT IK BEWUST NIET VERANDER ──────────────────────────────────────
--
-- * Geen `due_date` in de insert. Dat hoort zo: plak 14 zet hem in de
--   before-insert trigger (3 dagen voor de allereerste, anders 7).
-- * `company_id` mag leeg blijven, zoals nu. De incasso-motor slaat een
--   klant zonder bedrijf over en waarschuwt de admins; hier weigeren
--   zou de nieuwe klant tot 03:00 zonder factuur laten, en dat is
--   precies wat 20260918180000 kwam oplossen. Aparte beslissing.
-- * De rest van de body is letterlijk wat er nu staat.
--
-- Er is één ding bij: een factuur die er al is wordt niet nog eens
-- gemaakt. De trigger vuurt op elke insert in `subscriptions`, en
-- zonder die test is een tweede abonnementsrij voor dezelfde periode
-- een tweede factuur.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create or replace function public.create_invoice_for_subscription()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk0$
declare
  v_company_id uuid;
  v_amount     numeric;
  v_type       varchar := 'subscription';
  v_period     date;
begin
  -- De LIJSTPRIJS staat op de rij; wat er gefactureerd wordt gaat door
  -- de perks heen, net als bij de maandelijkse run en bij een
  -- plan-wijziging.
  v_amount := public._effective_subscription_amount(
                NEW.advertiser_id, coalesce(NEW.amount, 0));

  -- Niets te factureren is geen factuur van nul.
  if coalesce(v_amount, 0) <= 0 then
    return NEW;
  end if;

  v_period := coalesce(NEW.next_payment_date::date, current_date);

  -- Staat hij er al, dan niet nog een keer. De trigger vuurt op elke
  -- insert in subscriptions.
  if exists (
    select 1 from public.invoices i
     where i.subscription_id = NEW.id
       and i.period_start = v_period
  ) then
    return NEW;
  end if;

  select c.id
    into v_company_id
    from public.companies c
   where c.advertiser_id = NEW.advertiser_id
   limit 1;

  insert into public.invoices (
    tenant_id,
    company_id,
    subscription_id,   -- DE KOLOM, niet alleen de JSON
    period_start,      -- de andere helft van de duplicaat-grendel
    items,
    sub_total,
    total,
    advertiser_id,
    type,
    status,
    currency
  )
  values (
    NEW.tenant_id,
    v_company_id,
    NEW.id,
    v_period,
    jsonb_build_array(
      jsonb_build_object(
        'name', 'Platform Subscription',
        'quantity', 1,
        'rate', v_amount,
        'tax', 0,
        'amount', v_amount,
        'subscription_id', NEW.id,
        'start_date', NEW.start_date
      )
    ),
    v_amount,          -- GEEN ::real. Dat is single precision.
    v_amount,
    NEW.advertiser_id,
    v_type,
    'unpaid',
    NEW.currency
  );

  return NEW;
end;
$blk0$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'zet de trigger subscription_id in de KOLOM' as item,
  coalesce((
    select case when position('subscription_id,   -- DE KOLOM' in p.prosrc) > 0
                then 'ja - gerepareerd'
                else 'NEE - dit bestand is niet geplakt' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_invoice_for_subscription'
     limit 1
  ), 'functie bestaat niet') as antwoord
union all
select 2, 'staat er nog een ::real cast op een geldbedrag',
  coalesce((
    select case when position('::real' in p.prosrc) > 0
                then 'JA - NIET GOED, zeg het meteen'
                else 'nee - weg' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_invoice_for_subscription'
     limit 1
  ), 'functie bestaat niet')
union all
select 3, 'past hij de korting toe',
  coalesce((
    select case when position('_effective_subscription_amount' in p.prosrc) > 0
                then 'ja' else 'NEE' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_invoice_for_subscription'
     limit 1
  ), 'functie bestaat niet')
union all
select 4, 'bestaat _effective_subscription_amount (plak 12)',
  coalesce((
    select 'ja, ' || pg_get_function_identity_arguments(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_effective_subscription_amount'
     limit 1
  ), 'NEE - plak 12 is niet geland, NIET verder gaan')
union all
select 5, 'abonnementsfacturen zonder subscription_id die nog open staan',
  (select count(*)::text from public.invoices
    where type = 'subscription' and subscription_id is null
      and coalesce(status, '') not in ('paid', 'void', 'cancelled'))
union all
select 6, 'E2E0001 - welke twee facturen zijn dat',
  coalesce((
    select string_agg(
             coalesce(i.number::text, i.id::text) || '  ' ||
             to_char(i.total, 'FM999999990.00') || ' ' ||
             upper(coalesce(i.currency, 'EUR')) ||
             '  periode ' || coalesce(i.period_start::text, 'GEEN') ||
             '  vervalt ' || coalesce(i.due_date::date::text, 'GEEN') ||
             '  abonnement ' || case when i.subscription_id is null
                                     then 'NIET GEKOPPELD' else 'gekoppeld' end,
             E'\n' order by i.created_at)
      from public.invoices i
      join public.advertisers a on a.id = i.advertiser_id
     where a.tenant_client_code = 'E2E0001'
       and i.type in ('subscription', 'subscription_adjustment')
       and coalesce(i.status, '') not in ('paid', 'void', 'cancelled')
  ), 'geen')
order by nr;
