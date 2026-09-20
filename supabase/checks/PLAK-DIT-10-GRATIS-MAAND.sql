-- =====================================================================
-- PLAK 10 — een bijbetaling schuift de facturatiedag op, elke keer
-- =====================================================================
-- `_on_subscription_invoice_paid` zet bij elke betaalde factuur:
--
--   next_payment_date = coalesce(new.period_start, current_date) + 1 maand
--
-- Voor een gewone maandfactuur klopt dat: die heeft een period_start en
-- de klok schuift netjes een maand op.
--
-- Maar `change_subscription_amount` maakt bij een plan-wijziging een
-- `subscription_adjustment` ZONDER period_start. Dan valt hij terug op
-- `current_date`, en dat is de dag waarop die bijbetaling toevallig
-- betaald wordt.
--
-- Wat dat kost, met echte data:
--
--   Plan factureert op de 1e. Op 20 september gaat het plan omhoog,
--   er komt een bijbetaling die op 27 september wordt geïnd.
--   next_payment_date springt van 1 oktober naar 27 OKTOBER.
--   De maandfactuur van 1 oktober wordt nooit gemaakt: 26 dagen gratis,
--   en de facturatiedag is permanent verschoven. Elke volgende
--   plan-wijziging schuift hem opnieuw.
--
-- ── WAT DIT DOET ─────────────────────────────────────────────────────
--
-- Eén regel: de klok verschuift alleen bij een factuur die ECHT een
-- periode is. Een bijbetaling hoort bij de maand die er al staat en
-- verzet niets. Het weer aanzetten van een `past_due` abonnement blijft
-- wel gebeuren, ook bij een bijbetaling — dat is het enige wat hij
-- verder deed en dat klopt.
--
-- De rest van de body is letterlijk wat er nu op de database staat.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create or replace function public._on_subscription_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $paid$
begin
  if new.status = 'paid'
     and coalesce(old.status, '') is distinct from 'paid'
     and new.subscription_id is not null then
    begin
      update public.subscriptions
         set status =
               case
                 -- All THREE stay: cancelled is over, paused is
                 -- deliberate, and inactive means the customer was
                 -- deactivated. Settling an old invoice must not
                 -- restart billing for any of them.
                 when status in ('cancelled', 'paused', 'inactive')
                   then status
                 else 'active'
               end,
             -- ── ALLEEN EEN ECHTE PERIODE VERZET DE KLOK ───────────
             --
             -- Was: coalesce(new.period_start, current_date) + 1 maand.
             -- Een `subscription_adjustment` heeft GEEN period_start,
             -- dus die viel terug op de dag van betalen en schoof de
             -- facturatiedag permanent op — een gratis maand per
             -- plan-wijziging, en elke volgende schuift opnieuw.
             --
             -- Een bijbetaling hoort bij de maand die er al staat.
             next_payment_date =
               case
                 when new.period_start is not null
                   then (new.period_start::date + interval '1 month')
                 else next_payment_date
               end,
             updated_at = now()
       where id = new.subscription_id;
    exception when others then
      raise warning 'subscription advance failed for invoice %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$paid$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'verzet een bijbetaling de klok nog' as item,
  coalesce((
    select case when position('new.period_start is not null' in p.prosrc) > 0
                then 'nee - gerepareerd'
                else 'JA - dit bestand is niet geplakt' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_on_subscription_invoice_paid'
     limit 1
  ), 'functie bestaat niet') as antwoord
union all
-- Hoeveel bijbetalingen zonder periode staan er, en hoeveel daarvan
-- zijn al betaald? Dat zijn de keren dat de klok al is opgeschoven.
select 2, 'bijbetalingen zonder periode  |  waarvan al betaald',
  (select count(*)::text || '  |  ' ||
          count(*) filter (where status = 'paid')::text
     from public.invoices
    where type = 'subscription_adjustment'
      and period_start is null)
union all
select 3, 'klanten met MEER DAN EEN openstaande abonnementsfactuur',
  coalesce((
    select string_agg(x.code || ': ' || x.n::text || ' open, samen ' || x.bedrag,
                      E'\n' order by x.code)
      from (
        select a.tenant_client_code as code, count(*) n,
               string_agg(distinct upper(coalesce(i.currency, 'EUR')) || ' ' ||
                          to_char(i.total, 'FM999999990.00'), ' + ') as bedrag
          from public.invoices i
          join public.advertisers a on a.id = i.advertiser_id
         where i.type in ('subscription', 'subscription_adjustment')
           and coalesce(i.status, '') not in ('paid', 'void', 'cancelled')
         group by a.tenant_client_code
        having count(*) > 1
      ) x
  ), 'geen')
union all
-- DEZE HEB IK NODIG. change_subscription_amount rekent de bijbetaling
-- als `nieuw bedrag - oud bedrag`, allebei LIJSTPRIJZEN, en leest
-- advertiser_perks nergens. Voor een klant met 97,5% korting op een
-- plan van EUR 200 dat naar EUR 500 gaat, is dat EUR 300 in plaats van
-- EUR 7,50 -- veertig keer te veel, automatisch geïncasseerd. Ik ga die
-- body niet uit de repo terugzetten; stuur me wat er staat.
select 4, 'STUUR TERUG >> body change_subscription_amount',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'change_subscription_amount'
     limit 1
  ), 'staat niet op deze database')
union all
-- En de collect-lus, waarvan ik alleen de genereer-helft heb gezien.
select 5, 'STUUR TERUG >> body process_recurring_subscriptions',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'process_recurring_subscriptions'
     limit 1
  ), 'staat niet op deze database')
union all
select 6, 'kolomtype van invoices.total en subscriptions.amount',
  coalesce((
    select string_agg(table_name || '.' || column_name || ' = ' || data_type,
                      '   |   ' order by table_name)
      from information_schema.columns
     where table_schema = 'public'
       and (table_name, column_name) in
           (('invoices', 'total'), ('subscriptions', 'amount'))
  ), 'kolommen niet gevonden')
order by nr;
