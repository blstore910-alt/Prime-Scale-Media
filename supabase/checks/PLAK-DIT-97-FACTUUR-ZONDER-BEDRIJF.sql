-- ════════════════════════════════════════════════════════════════════
-- PLAK 97 — de eerste factuur van elke nieuwe klant draagt geen
--            bedrijfsnaam en geen btw-nummer
-- ════════════════════════════════════════════════════════════════════
--
-- `invoices.company_id` wordt gezet op het moment dat de factuur wordt
-- gemaakt. De eerste abonnementsfactuur ontstaat bij de AANMELDING --
-- voordat iemand zijn bedrijfsgegevens heeft ingevuld. Dus blijft die
-- kolom leeg, en de PDF zet "N/A" waar de bedrijfsnaam en het
-- btw-nummer horen. Op het eerste document dat een nieuwe klant in zijn
-- boekhouding stopt, en in de EU is een btw-nummer op een factuur geen
-- optie.
--
-- Gemeten op productie: 4 facturen die niet vervallen zijn missen hun
-- bedrijf, waaronder de abonnementsfacturen van EUR 200 van PSM0012 en
-- PSM0013.
--
-- De app vangt dit sinds vandaag al op bij het maken van de PDF: staat
-- er geen bedrijf op de factuur, dan leest hij dat van de adverteerder
-- zelf. Deze plak repareert het bij de bron, zodat ook de lijst en elke
-- andere lezer het ziet.
--
-- Alleen waar het ondubbelzinnig is: een adverteerder met precies ÉÉN
-- bedrijf. Heeft iemand er meer, dan blijft de factuur zoals hij is en
-- zegt het rapport hoeveel dat er zijn.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak97 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak97;

do $blk0$
declare
  v_n integer;
begin
  with eenduidig as (
    select c.advertiser_id, min(c.id) as company_id
      from public.companies c
     where c.advertiser_id is not null
     group by c.advertiser_id
    having count(*) = 1
  ),
  bijgewerkt as (
    update public.invoices i
       set company_id = e.company_id
      from eenduidig e
     where i.company_id is null
       and i.advertiser_id = e.advertiser_id
    returning 1
  )
  select count(*) into v_n from bijgewerkt;

  insert into _plak97 values (0, 'facturen gekoppeld aan hun bedrijf',
    v_n || ' stuks');
exception when others then
  insert into _plak97 values (0, 'facturen gekoppeld aan hun bedrijf',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle ─────────────────────────────────────────────────────────
do $blk1$
declare
  v_tot  integer;
  v_met  integer;
  v_zon  integer;
  v_meer integer;
begin
  select count(*), count(company_id),
         count(*) filter (where company_id is null and status <> 'void')
    into v_tot, v_met, v_zon
    from public.invoices;

  select count(*) into v_meer
    from (
      select c.advertiser_id
        from public.companies c
       where c.advertiser_id is not null
       group by c.advertiser_id
      having count(*) > 1
    ) x;

  insert into _plak97 values (1, 'stand van zaken',
    v_met || ' van ' || v_tot || ' facturen dragen een bedrijf | ' ||
    v_zon || ' zonder (en niet vervallen) | ' ||
    v_meer || ' adverteerders met meer dan een bedrijf, die zijn overgeslagen');
exception when others then
  insert into _plak97 values (1, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── welke er nog over zijn, als er nog iets over is ──────────────────
do $blk2$
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
  insert into _plak97 values (2, 'nog zonder bedrijf', v);
exception when others then
  insert into _plak97 values (2, 'nog zonder bedrijf',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak97 order by n;
