-- =====================================================================
-- PLAK 15 — de melding bij incasso, plus: wie maakt die eerste factuur?
-- =====================================================================
-- Dit is plak 13 (nog niet geplakt) mét de vraag die plak 14 opriep.
--
-- ── DEEL 1: DE AUTOMATISCHE INCASSO ZEI NIETS ────────────────────────
--
-- `subscription_billing_run` schrijft alleen een melding als het MIS
-- gaat (`subscription_past_due`). Lukt het, dan telt hij v_charged op en
-- gaat verder. Er gaat dus geld uit de wallet op een dag die de klant
-- niet heeft gekozen, en de app noemt het nergens.
--
-- De melding komt in de TRIGGER op `invoices.status = 'paid'`, want dat
-- is de enige plek waar allebei de wegen langskomen: de klant die zelf
-- op "Pay now" drukt, en de incasso op de vervaldag. Het insert-blok
-- heeft een eigen exception-handler -- een mislukte melding mag nooit
-- een betaling tegenhouden.
--
-- De rest van de body is letterlijk die van plak 10.
--
-- ── DEEL 2: WAT MAAKTE FACTUUR 0006-125? ─────────────────────────────
--
-- De body die je stuurde maakt GEEN factuur. Hij maakt het abonnement
-- met `next_payment_date = now()`, en het idee was dat de nachtelijke
-- run van 03:00 de eerste factuur opmaakt. Maar PSM0006 meldde zich om
-- kwart over tien aan en had die factuur meteen. Er zit dus iets anders
-- op de database dat hem maakt.
--
-- DAT MOET IK WETEN, om deze reden:
--
--   Plak 10 zorgt dat de klok alleen opschuift bij een factuur die ECHT
--   een periode heeft (`period_start is not null`). Heeft factuur 125
--   GEEN period_start, dan schuift betalen de klok niet vooruit,
--   next_payment_date blijft op vandaag staan, en de run van morgen
--   ziet het abonnement opnieuw als verschuldigd. Of de duplicaat-test
--   hem dan tegenhoudt hangt af van hoe die test werkt -- en als hij dat
--   niet doet, wordt dezelfde maand twee keer gefactureerd.
--
-- Regel 3 t/m 6 beantwoorden dat. Er wordt NIETS aan veranderd.
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
declare
  v_user uuid;
begin
  if new.status = 'paid'
     and coalesce(old.status, '') is distinct from 'paid'
     and new.subscription_id is not null then
    begin
      update public.subscriptions
         set status =
               case
                 -- Alle DRIE blijven staan: cancelled is voorbij, paused
                 -- is bewust, en inactive betekent dat de klant is
                 -- gedeactiveerd. Een oude factuur afrekenen mag voor
                 -- geen van drieën de facturatie herstarten.
                 when status in ('cancelled', 'paused', 'inactive')
                   then status
                 else 'active'
               end,
             -- Alleen een ECHTE periode verzet de klok. Een
             -- `subscription_adjustment` heeft geen period_start en viel
             -- terug op de dag van betalen, wat de facturatiedag
             -- permanent opschoof: een gratis maand per plan-wijziging.
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

    -- ── ZEG HET TEGEN DE KLANT ───────────────────────────────────────
    begin
      select a.user_id into v_user
        from public.advertisers a
       where a.id = new.advertiser_id;

      if v_user is not null then
        insert into public.notifications
          (recipient_user_id, tenant_id, type, payload, is_read)
        values
          (v_user, new.tenant_id, 'subscription_invoice_paid',
           jsonb_build_object(
             'invoice_id', new.id,
             'number', new.number,
             'amount', new.total,
             'currency', upper(coalesce(new.currency, 'EUR'))),
           false);
      end if;
    exception when others then
      raise warning 'paid-notification failed for invoice %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$paid$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'stuurt een betaalde factuur nu een melding' as item,
  coalesce((
    select case when position('subscription_invoice_paid' in p.prosrc) > 0
                then 'ja - gerepareerd'
                else 'NEE - dit bestand is niet geplakt' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_on_subscription_invoice_paid'
     limit 1
  ), 'functie bestaat niet') as antwoord
union all
select 2, 'verzet een bijbetaling de klok nog (dat mag NIET)',
  coalesce((
    select case when position('new.period_start is not null' in p.prosrc) > 0
                then 'nee - plak 10 staat er nog in'
                else 'JA - plak 10 is kwijt, ZEG HET METEEN' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_on_subscription_invoice_paid'
     limit 1
  ), 'functie bestaat niet')
union all
-- ── DE VRAAG ─────────────────────────────────────────────────────────
select 3, 'HEEFT factuur 0006-125 een periode (zonder: klok schuift niet)',
  coalesce((
    select 'nummer ' || coalesce(i.number::text, '?')
           || '  periode ' || coalesce(i.period_start::text, 'GEEN')
           || '  t/m ' || coalesce(i.period_end::text, 'GEEN')
           || '  vervalt ' || coalesce(i.due_date::date::text, 'GEEN')
           || '  gemaakt ' || to_char(i.created_at, 'HH24:MI')
           || '  abonnement ' || case when i.subscription_id is null
                                      then 'NIET GEKOPPELD' else 'gekoppeld' end
      from public.invoices i
      join public.advertisers a on a.id = i.advertiser_id
     where a.tenant_client_code = 'PSM0006'
       and i.type = 'subscription'
     order by i.created_at desc
     limit 1
  ), 'geen abonnementsfactuur gevonden')
union all
select 4, 'de klok van PSM0006 staat op',
  coalesce((
    select s.next_payment_date::text || '  (status ' || coalesce(s.status, '-') || ')'
      from public.subscriptions s
      join public.advertisers a on a.id = s.advertiser_id
     where a.tenant_client_code = 'PSM0006'
     order by s.created_at desc limit 1
  ), 'geen abonnement')
union all
select 5, 'triggers op subscriptions (wie maakt die factuur)',
  coalesce((
    select string_agg(t.tgname || ' -> ' || p.proname, E'\n' order by t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where c.relname = 'subscriptions'
       and c.relnamespace = 'public'::regnamespace
       and not t.tgisinternal
  ), 'geen')
union all
select 6, 'triggers op invoices',
  coalesce((
    select string_agg(t.tgname || ' -> ' || p.proname, E'\n' order by t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where c.relname = 'invoices'
       and c.relnamespace = 'public'::regnamespace
       and not t.tgisinternal
  ), 'geen')
union all
-- Als er twee facturen voor dezelfde periode staan, is het al misgegaan.
select 7, 'klanten met MEER DAN EEN openstaande abonnementsfactuur',
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
order by nr;
