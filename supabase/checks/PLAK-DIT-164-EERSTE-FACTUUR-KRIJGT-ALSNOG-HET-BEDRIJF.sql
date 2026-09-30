-- ════════════════════════════════════════════════════════════════════
-- PLAK 164 — DE EERSTE FACTUUR KRIJGT ALSNOG HET BEDRIJF
-- ════════════════════════════════════════════════════════════════════
--
-- Gevonden door `npm run ochtend` tijdens test 3, op een vers account.
-- Controle 12 ("elke factuur heeft een bedrijf") stond op 2 terwijl
-- daar 0 hoort te staan.
--
-- ── DE VOLGORDE IS HET PROBLEEM, NIET DE CODE ─────────────────────
--
-- Gemeten bij PSM0018, vandaag:
--
--   07:41   aanmelding -> abonnement gaat aan -> eerste factuur
--           EUR 200, `company_id` = NULL
--   08:55   klant vult Settings > Company in
--
-- Op het moment dat de factuur ontstaat IS er nog geen bedrijf. De
-- klant kan dat ook niet eerder doen: hij komt binnen via de
-- uitnodiging, het abonnement gaat meteen aan, en pas daarna ziet hij
-- het formulier. En niets vult de factuur later aan.
--
-- Dit overkomt dus **elke nieuwe klant, elke keer**, en alleen bij de
-- ALLEREERSTE factuur: de nachtelijke run (`subscription_billing_run`)
-- zet `company_id` wel -- nagekeken in de levende definitie, hij geeft
-- `v_company` mee aan de insert.
--
-- ── WAAROM HET NIET OPVIEL ────────────────────────────────────────
--
-- Op `/invoices` staat gewoon "T3 Alpha Media B.V." naast de factuur.
-- Dat scherm haalt de naam via de adverteerder op, niet via
-- `company_id`. En de PDF valt sinds een eerdere reparatie netjes
-- terug op de naam van de persoon in plaats van op de onze.
--
-- Wat er WEL verdwijnt is het adres en het btw-nummer. Een factuur is
-- het document waar die twee op horen; voor een echte klant is dat
-- geen schoonheidsfoutje.
--
-- ── WAT DEZE PLAK DOET ────────────────────────────────────────────
--
-- 1. Een trigger op `companies`: zodra een bedrijf wordt aangemaakt of
--    gewijzigd, krijgen de facturen van diezelfde adverteerder die nog
--    geen bedrijf hebben, dit bedrijf. Daarmee is de volgorde niet
--    langer van belang -- wie eerst factureert en dan invult, komt
--    vanzelf goed.
-- 2. Eenmalig dezelfde correctie over wat er al staat.
--
-- ── WAAROM OOK BETAALDE FACTUREN ──────────────────────────────────
--
-- Een lege `company_id` is geen besluit dat iemand genomen heeft; het
-- is een afwezigheid. Het bedrijf WAS de tegenpartij, wij wisten het
-- alleen nog niet. Hem invullen maakt het document juister en niet
-- anders. (En de auditregel legt de wijziging vast, dus het is terug
-- te zien.)
--
-- Wat NIET geraakt wordt: een adverteerder zonder bedrijfsrij, en een
-- adverteerder met meer dan een bedrijf. In het eerste geval is er
-- niets in te vullen, in het tweede zou het gokken zijn. Vandaag is
-- dat een rij: PSM0010, factuur van 22-09 van EUR 10, die heeft
-- helemaal geen bedrijf. Die blijft dus staan en dat is eerlijk.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. DE TRIGGER ─────────────────────────────────────────────────
create or replace function public._company_backfills_invoices()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk0$
begin
  if new.advertiser_id is null then
    return new;
  end if;

  update public.invoices i
     set company_id = new.id
   where i.advertiser_id = new.advertiser_id
     and i.company_id is null
     -- Nooit over een tenantgrens heen, ook niet als de data ooit
     -- rommelig wordt.
     and i.tenant_id = new.tenant_id;

  return new;
end
$blk0$;

-- Postgres geeft EXECUTE aan PUBLIC op een nieuwe functie, en PUBLIC
-- bevat anon. Een triggerfunctie hoort door niemand rechtstreeks
-- aangeroepen te worden.
revoke all on function public._company_backfills_invoices() from public, anon;
grant execute on function public._company_backfills_invoices() to service_role;

drop trigger if exists company_backfills_invoices on public.companies;
create trigger company_backfills_invoices
  after insert or update of name, advertiser_id on public.companies
  for each row execute function public._company_backfills_invoices();

-- ── 2. WAT ER AL STAAT ────────────────────────────────────────────
-- Alleen waar de adverteerder precies EEN bedrijf heeft.
update public.invoices i
   set company_id = c.id
  from public.companies c
 where i.company_id is null
   and c.advertiser_id = i.advertiser_id
   and c.tenant_id = i.tenant_id
   and (select count(*) from public.companies c2
         where c2.advertiser_id = i.advertiser_id) = 1;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `zonder_bedrijf_te_repareren` hoort 0 te zijn. `onherstelbaar` mag
-- 1 zijn: dat is PSM0010, die heeft geen bedrijfsrij.
select
  'plak 164 geplaatst'                                            as wat,
  (select count(*)::text from pg_trigger
    where tgname = 'company_backfills_invoices'
      and tgrelid = 'public.companies'::regclass)                 as trigger_staat,
  (select count(*)::text from public.invoices i
    where i.company_id is null
      and exists (select 1 from public.companies c
                   where c.advertiser_id = i.advertiser_id))      as zonder_bedrijf_te_repareren,
  (select count(*)::text from public.invoices i
    where i.company_id is null
      and not exists (select 1 from public.companies c
                       where c.advertiser_id = i.advertiser_id))  as onherstelbaar,
  (select coalesce(c.name, '(nog steeds leeg)')
     from public.invoices i
     join public.advertisers a on a.id = i.advertiser_id
     left join public.companies c on c.id = i.company_id
    where a.tenant_client_code = 'PSM0018'
      and i.type = 'subscription')                                as psm0018_factuur_bedrijf;
