-- ════════════════════════════════════════════════════════════════════
-- PLAK 103 — elke ingelogde gebruiker kan ELK betalingsbewijs lezen,
--            overschrijven en WEGGOOIEN
-- ════════════════════════════════════════════════════════════════════
--
-- DIT IS DE ERNSTIGSTE VAN DEZE ronde. Gevonden door de rechten-agent op
-- blok 3, daarna zelf nagemeten op de live database.
--
-- Op `storage.objects` staan NEGEN beleidsregels. Vier ervan zijn kaal:
--
--   zifras_0   SELECT  {authenticated}  bucket_id = 'wallet_payment_slips'
--   zifras_1   INSERT  {authenticated}  bucket_id = 'wallet_payment_slips'
--   zifras_2   UPDATE  {authenticated}  bucket_id = 'wallet_payment_slips'
--   zifras_3   DELETE  {authenticated}  bucket_id = 'wallet_payment_slips'
--
-- Geen gebruiker in de test. Geen tenant. Geen rol. Alleen: welke emmer.
--
-- EN BELEIDSREGELS WORDEN GE-OR-D. Er staan twee zorgvuldige regels
-- naast -- `slip_admin_read` (rol admin, actief, niet op inactief, eigen
-- tenant) en `slip_advertiser_read` (alleen de map van je EIGEN
-- portemonnee) -- en die doen op dit moment helemaal niets. Wie langs
-- zifras_0 komt is binnen, en langs zifras_0 komt iedereen die is
-- ingelogd.
--
-- WAT ER IN DIE EMMER LIGT
--
-- Bankafschriften. De naam van de klant, hun IBAN, het bedrag. Het pad is
-- `wallet-topups/<wallet_id>/<tijdstip>-<bestandsnaam>`, en wallet-id's
-- zijn te lezen door wie een lijst van portemonnees mag opvragen.
--
-- Dus: elke adverteerder en elke affiliate op het platform kan het
-- bankafschrift van elke andere klant opvragen. En door zifras_3 ook
-- WEGGOOIEN -- het bewijs onder een geverifieerde storting.
--
-- De app zelf doet precies twee dingen met deze emmer, nagelopen in de
-- code:
--   INSERT  door de klant, vanuit wallet-topup-dialog.tsx, met
--           upsert:false, naar wallet-topups/<eigen wallet>/...
--   SELECT  via createSignedUrl in actions/payment-slip-actions.ts,
--           door de klant zelf of door een admin van de tenant
-- Geen UPDATE. Geen DELETE. Geen upload door een admin.
--
-- Die twee worden allebei al gedekt door de zorgvuldige regels. De vier
-- kale regels voegen dus geen enkele functie toe -- ze zetten alleen de
-- deur open. Ze mogen weg.
--
-- De opmerking in payment-slip-actions.ts zegt: "RLS on storage.objects
-- still gates who can sign". Dat is de aanname waar dit op rustte, en op
-- deze database klopt hij niet. Na deze plak wel.
--
-- ALS ER IETS BREEKT NA DEZE PLAK: een admin die een bewijs wil
-- UPLOADEN namens een klant kan dat niet meer (dat kon de app ook niet,
-- maar de kale regel stond het toe). Zeg het, dan komt er een
-- admin-insertregel bij die op tenant test in plaats van op niets.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak103 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak103;

-- ── 0. eerst vastleggen wat er NU staat ─────────────────────────────
--     Zodat er na afloop naast het nieuwe beeld ook het oude staat en
--     niemand hoeft te geloven dat er iets is veranderd.
do $blk0$
declare v text;
begin
  select coalesce(string_agg(policyname || ' [' || cmd || ']', ' | '
           order by policyname), 'geen')
    into v
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects';
  insert into _plak103 values (0, 'beleid VOORAF', v);
exception when others then
  insert into _plak103 values (0, 'beleid VOORAF',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 1. de vier kale regels op wallet_payment_slips eraf ─────────────
do $blk1$
declare
  v_weg text := '';
  v_naam text;
begin
  foreach v_naam in array array[
    'Allow authenticated users to perform all operation zifras_0',
    'Allow authenticated users to perform all operation zifras_1',
    'Allow authenticated users to perform all operation zifras_2',
    'Allow authenticated users to perform all operation zifras_3'
  ] loop
    if exists (select 1 from pg_policies
                where schemaname = 'storage' and tablename = 'objects'
                  and policyname = v_naam) then
      execute format('drop policy %I on storage.objects', v_naam);
      v_weg := v_weg || right(v_naam, 8) || ' ';
    end if;
  end loop;

  insert into _plak103 values (1, 'kale regels op de bewijzen eraf',
    case when v_weg = '' then 'stonden er al niet meer'
         else 'weg: ' || v_weg end);
exception when others then
  insert into _plak103 values (1, 'kale regels op de bewijzen eraf',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 2. en de twee op de oude, ongebruikte emmers ────────────────────
--     `payment_slips` en `payment-slips` worden door geen enkele regel
--     code aangeraakt -- alleen `wallet_payment_slips` staat in de app.
--     Wat er ook in ligt, het lag net zo open.
do $blk2$
declare
  v_weg text := '';
  v_naam text;
begin
  foreach v_naam in array array[
    'Allow authenticated users to perform all operations',
    'Allow uploads to payment-slips bucket'
  ] loop
    if exists (select 1 from pg_policies
                where schemaname = 'storage' and tablename = 'objects'
                  and policyname = v_naam) then
      execute format('drop policy %I on storage.objects', v_naam);
      v_weg := v_weg || v_naam || ' | ';
    end if;
  end loop;

  insert into _plak103 values (2, 'oude ongebruikte emmers',
    case when v_weg = '' then 'stonden er al niet meer' else 'weg: ' || v_weg end);
exception when others then
  insert into _plak103 values (2, 'oude ongebruikte emmers',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 2b. EN: een medewerker-admin kan geen factuur maken ────────────
--
-- Zelfde agent, zelfde ronde, en het hoort in dezelfde plak omdat het
-- een paste is. Op `companies` staan maar twee leesregels:
--
--   "Allow advertisers to read their companies"  -> je eigen bedrijf
--   "Enable admins to read tenant data"          -> t.owner_id = auth.uid()
--
-- De tweede heet naar admins en test op de EIGENAAR. Nagemeten op de
-- live database. Er is geen enkele leesregel voor een gewone admin.
--
-- En RLS geeft nul rijen, geen fout. Dus voor een medewerker-admin:
--
--   * `/invoices` -> Create Invoice faalt met "Company not found for
--     selected advertiser" -- een zin die de klant de schuld geeft van
--     iets wat aan het beleid ligt
--   * de EUR 50 factuur bij een ad-accountaanvraag is net zo onmogelijk
--   * en de factuur-PDF rendert gewoon door, met N/A waar de naam, het
--     adres en het btw-nummer van de klant horen. Geen fout, geen
--     waarschuwing. Die PDF gaat naar de klant.
--
-- `invoice_issue` en `invoice_view` staan in lib/permissions.ts als
-- ADMIN_CAPABILITIES, dus dit is niet bedoeld -- het is een regel die
-- nooit is meegekomen.
--
-- Lezen, niet schrijven: schrijven blijft van de eigenaar (plak 102).
do $blk2b$
begin
  drop policy if exists companies_admin_read on public.companies;

  create policy companies_admin_read on public.companies
    for select
    to authenticated
    using (public._is_admin_of(companies.tenant_id));

  insert into _plak103 values (8, 'medewerker-admin mag bedrijven lezen',
    'gedaan -- factuur maken en de PDF werken nu ook zonder eigenaar');
exception when others then
  insert into _plak103 values (8, 'medewerker-admin mag bedrijven lezen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2b$;

-- ── 3. controle: wat blijft er over, en dekt het de app? ────────────
do $blk3$
declare
  v_over  text;
  v_kaal  integer;
  v_lees  integer;
  v_schr  integer;
begin
  select coalesce(string_agg(policyname || ' [' || cmd || ']', ' | '
           order by cmd, policyname), 'GEEN -- dat is fout')
    into v_over
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects';

  -- Een regel op deze emmer die NIET naar een gebruiker kijkt.
  select count(*) into v_kaal
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and coalesce(qual, '') || coalesce(with_check, '') like '%wallet_payment_slips%'
     and coalesce(qual, '') || coalesce(with_check, '') not like '%auth.uid()%';

  -- De twee die er moeten zijn om de app te laten werken.
  select count(*) into v_lees
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('slip_admin_read', 'slip_advertiser_read');

  select count(*) into v_schr
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'slip_advertiser_insert';

  insert into _plak103 values (3, 'beleid ACHTERAF', v_over);
  insert into _plak103 values (4, 'staat er nog een regel zonder gebruikerstest',
    v_kaal || ' (moet 0)');
  insert into _plak103 values (5, 'de klant kan nog uploaden',
    v_schr || '/1 (slip_advertiser_insert)');
  insert into _plak103 values (6, 'klant en admin kunnen nog lezen',
    v_lees || '/2 (slip_advertiser_read + slip_admin_read)');
exception when others then
  insert into _plak103 values (3, 'controle',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── 4. hoeveel bewijzen er lagen ────────────────────────────────────
--     Niet uit storage -- daar mag het leesaccount niet bij -- maar uit
--     de rijen die ernaar verwijzen. Dat is het aantal bankafschriften
--     dat tot nu toe voor iedereen te lezen was.
do $blk4$
declare
  v_pad  integer;
  v_url  integer;
begin
  select count(*) filter (where payment_slip is not null
                            and payment_slip not like 'http%'),
         count(*) filter (where payment_slip like 'http%')
    into v_pad, v_url
    from public.wallet_topups;

  insert into _plak103 values (7, 'bewijzen die open lagen',
    v_pad || ' als pad in de prive-emmer' ||
    case when v_url > 0
      then ' | LET OP: ' || v_url || ' oude rijen dragen een volledige ' ||
           'http-URL uit de tijd voor de prive-emmer. Die worden door ' ||
           'payment-slip-actions.ts ongewijzigd teruggegeven en gaan ' ||
           'langs dit beleid heen -- apart nakijken.'
      else ' | geen oude publieke URLs' end);
exception when others then
  insert into _plak103 values (7, 'bewijzen die open lagen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
--
-- NA HET DRAAIEN NOG EEN DING, en dat kan alleen jij:
-- Storage -> wallet_payment_slips -> Settings. Staat "Public bucket"
-- AAN, dan leest iedereen met het pad de bestanden zonder in te loggen
-- en helpt geen enkele beleidsregel. Hij MOET uit staan. Het leesaccount
-- mag niet in schema `storage` kijken, dus ik kan het niet zien.
-- ════════════════════════════════════════════════════════════════════
-- en of die leesregel er echt staat
do $blk5$
declare v text;
begin
  select coalesce(string_agg(policyname || ' [' || cmd || ']', ' | '
           order by cmd, policyname), 'geen')
    into v from pg_policies where tablename = 'companies';
  insert into _plak103 values (9, 'beleid op companies', v);
exception when others then
  insert into _plak103 values (9, 'beleid op companies',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak103 order by n;
