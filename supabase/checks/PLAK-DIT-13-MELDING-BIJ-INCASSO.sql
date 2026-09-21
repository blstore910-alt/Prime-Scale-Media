-- =====================================================================
-- PLAK 13 — de automatische incasso zei helemaal niets
-- =====================================================================
-- `subscription_billing_run` schrijft alleen een melding als het MIS
-- gaat:
--
--     exception when others then ... 'subscription_past_due' ...
--
-- Lukt het wel, dan telt hij `v_charged := v_charged + 1` en gaat
-- verder. Er gaat dus geld uit de wallet, op een dag die de klant niet
-- gekozen heeft, en de app noemt het nergens. Hij komt erachter door
-- een saldo te vergelijken met wat hij zich herinnert -- precies de
-- fout die voor geld dat BINNENKOMT al is opgelost met
-- `wallet_topup_completed`.
--
-- ── WAAROM IN DE TRIGGER EN NIET IN DE INCASSO-LUS ───────────────────
--
-- Er zijn twee wegen naar een betaalde factuur: de klant drukt zelf op
-- "Pay now", of de lus int hem op de vervaldag. Ze eindigen allebei op
-- `invoices.status = 'paid'`. De trigger die daarop zit is dus de ENIGE
-- plek die allebei afdekt, en het is er een waarvan ik de body ken --
-- plak 10 heeft hem geschreven.
--
-- De body hieronder is letterlijk die van plak 10, met er EEN blok bij.
--
-- ── EN DE MELDING MAG DE BETALING NOOIT TEGENHOUDEN ──────────────────
--
-- Het insert-blok heeft zijn eigen `begin/exception`. Een ontbrekende
-- rij, een policy, een type dat de database niet kent: het kost hooguit
-- de melding, nooit de betaling. Dezelfde keuze als het past_due-blok
-- in de incasso-lus.
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
                 -- All THREE stay: cancelled is over, paused is
                 -- deliberate, and inactive means the customer was
                 -- deactivated. Settling an old invoice must not
                 -- restart billing for any of them.
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

    -- ── NIEUW: ZEG HET TEGEN DE KLANT ────────────────────────────────
    --
    -- Beide wegen komen hier langs, dus dit dekt zowel "Pay now" als de
    -- incasso op de vervaldag. Met het BEDRAG en het FACTUURNUMMER
    -- erin, want bij die tweede weg heeft de klant nergens op gedrukt en
    -- is "er is iets van je wallet af" geen bericht.
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
      -- Een melding mag een betaling nooit tegenhouden.
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
select 3, 'hangt de trigger nog aan invoices',
  coalesce((
    select string_agg(t.tgname || ' op ' || c.relname, ', ')
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where p.proname = '_on_subscription_invoice_paid'
       and not t.tgisinternal
  ), 'GEEN TRIGGER - de functie wordt nergens aangeroepen')
union all
select 4, 'al betaalde abonnementsfacturen (die hoorden niets)',
  (select count(*)::text
     from public.invoices i
    where i.subscription_id is not null
      and i.status = 'paid')
union all
select 5, 'meldingen per type, laatste 30 dagen',
  coalesce((
    select string_agg(x.type || ': ' || x.n::text, E'\n' order by x.type)
      from (select type, count(*) n from public.notifications
             where created_at > now() - interval '30 days'
             group by type) x
  ), 'geen')
order by nr;
