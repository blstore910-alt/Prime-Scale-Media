-- ════════════════════════════════════════════════════════════════════
-- PLAK 102 — het bedrijf van de organisatie is door niemand op te slaan
-- ════════════════════════════════════════════════════════════════════
--
-- Gevonden door de laden/leeg/fout-agent op blok 1, daarna zelf
-- nagelopen op de live database.
--
-- `companies` draagt vier beleidsregels, en de enige UPDATE-regel is
-- "Allow update for advertisers":
--
--   exists (select 1 from user_profiles up
--             join advertisers a on a.profile_id = up.id
--            where up.user_id = auth.uid()
--              and a.id = companies.advertiser_id ...)
--
-- De rij van de ORGANISATIE zelf heeft `advertiser_id is null`, dus
-- `a.id = null` matcht nooit. Er is geen enkele admin-schrijfregel. RLS
-- filtert de UPDATE weg tot nul rijen ZONDER fout, en wroteSomething
-- geeft ok:false.
--
-- Er staat vandaag precies een zo'n rij op deze database.
--
-- WAT DE EIGENAAR ZIET
--
-- Op /settings/general: "Failed to update profile: That change was not
-- saved..." -- terwijl de naamhelft er al WEL in staat. Die update op
-- user_profiles gaat als eerste en slaagt; het bedrijf faalt daarna. En
-- het formulier leest niet opnieuw, dus de ingetypte bedrijfsnaam, het
-- btw-nummer en het adres blijven in de vakjes staan alsof ze bewaard
-- zijn, tot een herlading.
--
-- Dat is de rij die op elke factuur staat.
--
-- DE REPARATIE
--
-- Een schrijfregel voor de EIGENAAR op de rij van de organisatie.
-- Eigenaar en niet elke admin: dit is de naam, het btw-nummer en het
-- adres op elke uitgaande factuur, en het scherm zit toch al achter
-- requireSuperAdmin. Dezelfde grens als plannen en koersen.
--
-- De adverteerdersregel blijft ongemoeid: een klant houdt zijn eigen
-- bedrijf.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak102 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak102;

-- ── 1. de eigenaar mag de organisatierij wijzigen ───────────────────
do $blk0$
begin
  drop policy if exists companies_owner_tenant_update on public.companies;

  create policy companies_owner_tenant_update on public.companies
    for update
    to authenticated
    using (
      companies.advertiser_id is null
      and public._is_super_admin_of(companies.tenant_id)
    )
    with check (
      companies.advertiser_id is null
      and public._is_super_admin_of(companies.tenant_id)
    );

  insert into _plak102 values (0, 'wijzigen van de organisatierij',
    'eigenaar mag het nu, alleen waar advertiser_id leeg is');
exception when others then
  insert into _plak102 values (0, 'wijzigen van de organisatierij',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. en hem aanmaken als hij er nog niet is ───────────────────────
--     Op een verse organisatie bestaat die rij niet, en dan faalt
--     dezelfde opslag op een INSERT in plaats van op een UPDATE.
do $blk1$
begin
  drop policy if exists companies_owner_tenant_insert on public.companies;

  create policy companies_owner_tenant_insert on public.companies
    for insert
    to authenticated
    with check (
      companies.advertiser_id is null
      and public._is_super_admin_of(companies.tenant_id)
    );

  insert into _plak102 values (1, 'aanmaken van de organisatierij',
    'eigenaar mag het nu');
exception when others then
  insert into _plak102 values (1, 'aanmaken van de organisatierij',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── controle ─────────────────────────────────────────────────────────
do $blk2$
declare
  v_pol  text;
  v_rij  integer;
  v_anon boolean;
begin
  select coalesce(string_agg(
           policyname || ' [' || cmd || '] ' || roles::text, ' | '
           order by cmd, policyname), 'geen')
    into v_pol
    from pg_policies where tablename = 'companies';

  select count(*) into v_rij
    from public.companies where advertiser_id is null;

  select has_table_privilege('anon', 'public.companies', 'update')
    into v_anon;

  insert into _plak102 values (2, 'stand van zaken',
    v_pol || ' || organisatierijen: ' || v_rij ||
    ' || anon mag wijzigen: ' || v_anon || ' (moet false)');
exception when others then
  insert into _plak102 values (2, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── welke factuur nog zonder bedrijf staat ──────────────────────────
--     Plak 97 koppelde er vier; deze bleef over omdat die klant
--     helemaal geen bedrijfsrij heeft. Hier staat hij, zodat hij niet
--     als nieuwe fout terugkomt.
do $blk3$
declare
  v text;
begin
  select coalesce(string_agg(
           coalesce(a.tenant_client_code, '?') || '/' || i.number ||
           ' (' || i.type || ', ' || i.status || ')', ' | '), 'geen')
    into v
    from public.invoices i
    left join public.advertisers a on a.id = i.advertiser_id
   where i.company_id is null and i.status <> 'void';
  insert into _plak102 values (3, 'facturen zonder bedrijf', v);
exception when others then
  insert into _plak102 values (3, 'facturen zonder bedrijf',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak102 order by n;
