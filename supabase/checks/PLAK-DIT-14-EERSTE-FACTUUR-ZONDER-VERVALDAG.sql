-- =====================================================================
-- PLAK 14 — de eerste factuur van een nieuwe klant heeft geen vervaldag
-- =====================================================================
-- Gevonden door A1 te lopen. PSM0006 meldde zich zojuist aan, kreeg
-- netjes een abonnement (Prime, EUR 200) en factuur 0006-125 -- en die
-- factuur heeft `due_date is null`.
--
-- WAT DAT KOST
--
-- De incasso-lus filtert:
--
--     and i.due_date is not null
--     and i.due_date <= now()
--
-- Dus deze factuur wordt NOOIT automatisch geïnd, en de aanmaning gaat
-- ook nooit af. EUR 200 blijft staan tot de klant zelf op Pay drukt. Op
-- zijn scherm staat nu letterlijk, en terecht: "This one carries no due
-- date, so nothing will be taken automatically."
--
-- ── WAAROM DE BESTAANDE TRIGGER HEM NIET PAKT ────────────────────────
--
-- `_invoice_first_subscription_due_date` (plak 20260917140000) begint
-- met:
--
--     if new.due_date is null then return new; end if;
--
-- met opzet: "leaves the due date alone if the insert did not set one,
-- so a code path that deliberately raises an invoice with no term keeps
-- that". Dat is een redelijke regel voor een handmatige factuur.
--
-- Voor een ABONNEMENTSFACTUUR is het er geen. Een abonnementsfactuur
-- heeft altijd een termijn -- dat is wat hem van een handmatige factuur
-- onderscheidt -- en zonder termijn valt hij buiten elk mechanisme dat
-- hem zou innen. Er is geen pad dat er baat bij heeft; er is alleen een
-- pad dat vergeet hem te zetten.
--
-- De route via `subscription_billing_run` zet hem wel (7 dagen, door de
-- trigger verkort naar 3 voor de eerste). Deze factuur is direct bij het
-- aanmelden ontstaan, dus iets anders heeft hem gemaakt -- zie regel 5,
-- daar vraag ik de body op. Deze reparatie werkt hoe dan ook, want hij
-- zit in de trigger en niet in de maker.
--
-- ── EN DE FACTUREN DIE ER AL STAAN ───────────────────────────────────
--
-- Blok 2 geeft bestaande openstaande abonnementsfacturen zonder
-- vervaldag er alsnog een: 3 dagen vanaf nu, niet vanaf hun
-- aanmaakdatum, zodat niemand met terugwerkende kracht te laat is.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _due (k text, v text);
delete from _due;

create or replace function public._invoice_first_subscription_due_date()
returns trigger
language plpgsql
as $blk0$
begin
  if coalesce(new.type, '') <> 'subscription' then return new; end if;
  if new.advertiser_id is null then return new; end if;

  -- ── EEN ABONNEMENTSFACTUUR ZONDER TERMIJN BESTAAT NIET ────────────
  --
  -- Was: `if new.due_date is null then return new; end if` -- de lege
  -- vervaldag met rust laten. Voor een handmatige factuur klopt dat.
  -- Voor deze niet: zonder vervaldag slaat de incasso-lus hem over
  -- (`due_date is not null and due_date <= now()`) en de aanmaning ook,
  -- dus hij blijft eeuwig open staan. Zeven dagen is wat de
  -- incasso-route zelf kiest, dus dat is hier de standaard.
  if new.due_date is null then
    new.due_date := now() + interval '7 days';
  end if;

  -- Hun EERSTE abonnementsfactuur ooit: 3 dagen. Daarna: laat staan wat
  -- het invoegende pad koos. "Eerste" is per ADVERTEERDER, niet per
  -- abonnement -- wie opzegt en opnieuw wordt uitgenodigd is geen
  -- nieuwe klant en hoort de korte termijn niet nog eens te krijgen.
  if not exists (
    select 1
      from public.invoices i
     where i.advertiser_id = new.advertiser_id
       and i.type = 'subscription'
       and coalesce(i.status, '') <> 'void'
  ) then
    new.due_date := now() + interval '3 days';
  end if;

  return new;
end;
$blk0$;

drop trigger if exists trg_invoice_first_subscription_due_date on public.invoices;
create trigger trg_invoice_first_subscription_due_date
  before insert on public.invoices
  for each row execute function public._invoice_first_subscription_due_date();

-- ── DE FACTUREN DIE ER AL STAAN ──────────────────────────────────────
do $blk1$
declare
  v_n int;
begin
  with fixed as (
    update public.invoices
       set due_date = now() + interval '3 days',
           updated_at = now()
     where type = 'subscription'
       and due_date is null
       and coalesce(status, '') not in ('paid', 'void', 'cancelled')
    returning 1
  )
  select count(*) into v_n from fixed;
  insert into _due values ('bijgewerkt', v_n::text
    || ' openstaande abonnementsfactuur(en) hadden geen vervaldag en '
    || 'staan nu op nu + 3 dagen');
exception when others then
  insert into _due values ('bijgewerkt', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk1$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'krijgt een abonnementsfactuur nu altijd een vervaldag' as item,
  coalesce((
    select case when position('new.due_date := now() + interval ''7 days''' in p.prosrc) > 0
                then 'ja - gerepareerd'
                else 'NEE - dit bestand is niet geplakt' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_invoice_first_subscription_due_date'
     limit 1
  ), 'functie bestaat niet') as antwoord
union all
select 2, 'wat er met de bestaande facturen gebeurde',
  coalesce((select v from _due where k = 'bijgewerkt' limit 1), 'niets gelopen')
union all
select 3, 'abonnementsfacturen ZONDER vervaldag die nog open staan',
  (select count(*)::text from public.invoices
    where type = 'subscription' and due_date is null
      and coalesce(status, '') not in ('paid', 'void', 'cancelled'))
union all
select 4, 'de facturen van PSM0006',
  coalesce((
    select string_agg(
             coalesce(i.number::text, i.id::text) || '  ' ||
             to_char(i.total, 'FM999999990.00') || ' ' ||
             upper(coalesce(i.currency, 'EUR')) || '  ' ||
             coalesce(i.status, '-') ||
             '  vervalt ' || coalesce(i.due_date::date::text, 'GEEN'),
             E'\n' order by i.created_at desc)
      from public.invoices i
      join public.advertisers a on a.id = i.advertiser_id
     where a.tenant_client_code = 'PSM0006'
  ), 'geen')
union all
-- Deze heb ik nodig. Factuur 0006-125 ontstond DIRECT bij het aanmelden,
-- niet bij de nachtelijke run -- dus iets heeft hem daar gemaakt, zonder
-- vervaldag. De repo-versie van deze functie maakt helemaal geen
-- factuur, dus de live body is anders. Ik ga hem niet uit de repo
-- terugzetten; stuur wat er staat.
select 5, 'STUUR TERUG >> body create_subscription_from_invite',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_subscription_from_invite'
     limit 1
  ), 'staat niet op deze database')
order by nr;
