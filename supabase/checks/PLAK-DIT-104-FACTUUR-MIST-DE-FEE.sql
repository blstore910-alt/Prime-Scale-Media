-- ════════════════════════════════════════════════════════════════════
-- PLAK 104 — de ad-account-factuur staat op het NETTO, niet op wat er
--            van de portemonnee af ging
-- ════════════════════════════════════════════════════════════════════
--
-- Gevonden door de geld-agent op blok 3, daarna zelf nagemeten op de
-- live database:
--
--   van de portemonnee afgeschreven : 410,00
--   fee geïnd                       :  12,30
--   netto op het ad-account gezet   : 397,70
--   TOTAAL GEFACTUREERD             : 397,70
--
-- Per factuur is het hetzelfde beeld: 100,00 afgeschreven -> 97,00
-- gefactureerd, 50,00 -> 48,50, 10,00 -> 9,70. Elke factuur mist exact
-- de fee.
--
-- WAAROM
--
-- create_invoice_on_topup_completed doet, regel 16:
--
--     v_amount := coalesce(NEW.topup_amount, 0);
--
-- en dat is het bedrag NA aftrek van de fee. top_up_create_for_advertiser
-- schrijft ondertussen `amount_received` van de portemonnee af -- het
-- bruto. De factuur documenteert dus het tegoed dat op het ad-account
-- kwam, en niet het bedrag dat de klant kwijt was.
--
-- WAT DAT BETEKENT
--
-- 1. De klant kan zijn eigen boeken niet sluitend krijgen. Zijn
--    portemonnee-overzicht en zijn facturen verschillen precies met de
--    fee, en er is geen document dat dat verschil uitlegt.
-- 2. De 12,30 aan geïnde fee staat op GEEN ENKEL document. Dat is omzet.
-- 3. Bij een controle is "waar staat die fee dan" een vraag zonder
--    antwoord in de administratie.
--
-- DE REPARATIE -- ZOALS DE EIGENAAR HEM WIL
--
-- Ik stelde eerst twee regels voor, tegoed en fee apart. De eigenaar,
-- 27-09: "factuur moet gwn 1 totaal bedrag thats it geen specs dus
-- hoeveel die stuurt dat is het totaal."
--
-- Dus EEN regel, en het bedrag is wat er van de portemonnee af ging:
--
--     Ad account funding            410,00
--     ------------------------------------
--     Totaal                        410,00
--
-- Dat sluit het gat net zo goed -- het totaal is weer gelijk aan de
-- afschrijving -- en het zet geen opsplitsing op een document waar de
-- eigenaar er geen wil. De fee blijft gewoon op de rij in `top_ups`
-- staan voor de eigen boeken.
--
-- HET BRUTO WORDT `topup_amount + fee_amount` GENOMEN en niet
-- `amount_received`. Die twee zijn op elke klantrij op deze database
-- gelijk (nagemeten: 0 rijen wijken meer dan een cent af), maar op een
-- ADMIN-rij staat `topup_amount` in USD terwijl `amount_received` de
-- betaalvaluta is. Optellen binnen een rij houdt de valuta hoe dan ook
-- consistent met wat v_currency al zegt. Er staan vandaag 0 admin-rijen,
-- dus dit is vooruitkijken, niet repareren.
--
-- WAT DEZE PLAK NIET DOET
--
-- De ZEVEN facturen die er al uit zijn worden NIET aangepast. Een
-- uitgegeven factuur wijzig je niet stilletjes -- dat is jouw boekhouding
-- en dus jouw beslissing. Onderaan staat welke het zijn en hoeveel elk
-- mist, zodat je kunt kiezen: laten staan, crediteren en opnieuw, of een
-- losse feefactuur.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak104 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak104;

-- ── 0. het gat, vóór de reparatie ───────────────────────────────────
do $blk0$
declare
  v_bruto numeric; v_fee numeric; v_netto numeric; v_fact numeric;
begin
  select coalesce(sum(t.amount_received), 0),
         coalesce(sum(t.fee_amount), 0),
         coalesce(sum(t.topup_amount), 0)
    into v_bruto, v_fee, v_netto
    from public.top_ups t
   where t.status = 'completed' and coalesce(t.is_deleted, false) = false;

  select coalesce(sum(i.total), 0) into v_fact
    from public.invoices i
   where i.type = 'ad_account_topup' and coalesce(i.status,'') <> 'void';

  insert into _plak104 values (0, 'het gat nu',
    'portemonnee af: ' || v_bruto ||
    ' | fee: ' || v_fee ||
    ' | netto: ' || v_netto ||
    ' | gefactureerd: ' || v_fact ||
    ' | NIET GEFACTUREERD: ' || round(v_bruto - v_fact, 2));
exception when others then
  insert into _plak104 values (0, 'het gat nu',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 1. de trigger schrijft voortaan het bruto, met twee regels ──────
do $blk1$
begin
  create or replace function public.create_invoice_on_topup_completed()
  returns trigger
  language plpgsql
  as $fn$
  declare
    v_tenant_id  uuid;
    v_company_id uuid;
    v_net        numeric;
    v_fee        numeric;
    v_gross      numeric;
    v_currency   varchar;
    v_items      jsonb;
  begin
    if OLD.status is distinct from 'pending'
       or NEW.status is distinct from 'completed' then
      return NEW;
    end if;

    v_net := round(coalesce(NEW.topup_amount, 0), 2);
    v_fee := round(coalesce(NEW.fee_amount, 0), 2);
    -- Binnen de rij optellen, nooit amount_received: op een ADMIN-rij
    -- staat topup_amount in USD en amount_received in de betaalvaluta.
    v_gross := round(v_net + v_fee, 2);

    -- topup_amount is USD op een ADMIN-rij en de betaalvaluta op een rij
    -- die de klant zelf indiende. topup_usd is de scheidslijn die de
    -- hele app gebruikt (lib/pure-topup-landed.ts).
    v_currency := case
      when NEW.topup_usd is not null
        then upper(coalesce(NEW.currency, 'EUR'))
      else 'USD'
    end;

    select a.tenant_id into v_tenant_id
      from public.advertisers a where a.id = NEW.advertiser_id;
    select c.id into v_company_id
      from public.companies c where c.advertiser_id = NEW.advertiser_id;

    -- EEN regel, geen opsplitsing. De eigenaar: "gwn 1 totaal bedrag
    -- thats it geen specs". Het bedrag is het bruto -- wat er van de
    -- portemonnee af ging -- en niet het netto dat hier stond.
    v_items := jsonb_build_array(jsonb_build_object(
      'name', 'Ad account funding',
      'quantity', 1, 'rate', v_gross, 'tax', 0,
      'amount', v_gross, 'currency', v_currency,
      'topup_id', NEW.id));

    insert into public.invoices (
      tenant_id, company_id, items, sub_total, total, currency,
      advertiser_id, type, status, paid_at
    ) values (
      v_tenant_id, v_company_id, v_items,
      v_gross, v_gross, v_currency,
      NEW.advertiser_id, 'ad_account_topup', 'paid', now()
    );
    return NEW;
  end
  $fn$;

  insert into _plak104 values (1, 'de trigger',
    'factuur staat nu op het bruto, met een aparte feeregel');
exception when others then
  insert into _plak104 values (1, 'de trigger',
    'NIETS GEWIJZIGD - ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 2. de rechten horen bij elke create or replace ──────────────────
--     Postgres geeft EXECUTE aan PUBLIC op een nieuwe functie, en PUBLIC
--     is inclusief anon. Een triggerfunctie wordt niet los aangeroepen,
--     maar de regel is de regel: hij raakt geld.
do $blk2$
declare v_sig text;
begin
  select 'public.' || p.proname || '()' into v_sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_invoice_on_topup_completed'
   limit 1;

  if v_sig is null then
    insert into _plak104 values (2, 'rechten', 'functie bestaat niet');
    return;
  end if;
  execute 'revoke all on function ' || v_sig || ' from public, anon';
  execute 'grant execute on function ' || v_sig ||
          ' to authenticated, service_role';
  insert into _plak104 values (2, 'rechten',
    'anon eraf, authenticated + service_role erop');
exception when others then
  insert into _plak104 values (2, 'rechten',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 3. hangt de trigger er nog aan ──────────────────────────────────
do $blk3$
declare v text;
begin
  select coalesce(string_agg(tgname || ' op ' || c.relname, ' | '), 'GEEN - dat is fout')
    into v
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
   where p.proname = 'create_invoice_on_topup_completed'
     and not t.tgisinternal;
  insert into _plak104 values (3, 'trigger hangt aan', v);
exception when others then
  insert into _plak104 values (3, 'trigger hangt aan',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── 4. WELKE FACTUREN AL UIT ZIJN EN WAT ZE MISSEN ──────────────────
--     Deze worden NIET aangepast. Dit is jouw boekhouding: laten staan,
--     crediteren en opnieuw sturen, of een losse feefactuur. Hier staat
--     alleen wat het is.
do $blk4$
declare v text; v_som numeric;
begin
  select coalesce(string_agg(
           'nr ' || i.number || ': ' || i.currency || ' ' || i.total ||
           ' (mist ' || round(t.amount_received - i.total, 2) || ')',
           ' | ' order by i.number), 'geen'),
         coalesce(sum(round(t.amount_received - i.total, 2)), 0)
    into v, v_som
    from public.invoices i
    join lateral (
      select tu.amount_received
        from public.top_ups tu
       where tu.advertiser_id = i.advertiser_id
         and tu.status = 'completed'
         and coalesce(tu.is_deleted, false) = false
         and round(tu.topup_amount, 2) = round(i.total, 2)
         and tu.updated_at <= i.created_at + interval '5 minutes'
         and tu.updated_at >= i.created_at - interval '5 minutes'
       limit 1
    ) t on true
   where i.type = 'ad_account_topup'
     and coalesce(i.status, '') <> 'void'
     and round(t.amount_received, 2) <> round(i.total, 2);

  insert into _plak104 values (4, 'facturen die al uit zijn',
    v || ' || samen te weinig gefactureerd: ' || v_som);
exception when others then
  insert into _plak104 values (4, 'facturen die al uit zijn',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
--
-- Regel 4 vraagt om een beslissing van jou, niet van mij: die facturen
-- zijn de deur al uit.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak104 order by n;
