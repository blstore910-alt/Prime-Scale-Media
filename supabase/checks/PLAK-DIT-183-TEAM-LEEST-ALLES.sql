-- ════════════════════════════════════════════════════════════════════
-- PLAK 183 -- een teamlid leest ook de factuurgegevens, correcties,
--             terugbetalingen, voorschotten en perks
-- ════════════════════════════════════════════════════════════════════
--
-- Gelopen op productie 01-10 als teamlid van PSM0020. Plak 176 gaf
-- leesrechten op veertien tabellen, maar niet op deze vijf:
--
--   billings            -> het teamlid kreeg "Still needed: billing
--                          address" op elk scherm, omdat het adres
--                          onzichtbaar was -- niet omdat het ontbrak
--   wallet_adjustments  -> correcties ontbraken in de wallet-activiteit
--   wallet_refunds         en in het rapport; het saldo klopte wel, de
--   wallet_precharges      regels die het verklaren niet
--   advertiser_perks    -> een gratis aanvraag of korting van de klant
--                          was voor het teamlid onzichtbaar
--
-- Alleen LEZEN (for select), dezelfde vorm als plak 176: "je bent lid
-- van het team van deze adverteerder". Schrijven blijft bij de eigenaar.
-- Twee keer plakken kan.

do $blk0$
declare t text;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = '_psm_member_of') then
    raise exception 'Plak 175 staat er niet (_psm_member_of ontbreekt) -- eerst die draaien.';
  end if;

  foreach t in array array['wallet_adjustments', 'wallet_refunds', 'wallet_precharges', 'advertiser_perks'] loop
    execute format('drop policy if exists %I on public.%I', t || '_team_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (public._psm_member_of(''advertiser'', advertiser_id))',
      t || '_team_read', t);
  end loop;
end
$blk0$;

-- billings heeft geen advertiser_id: hij hangt aan een bedrijf.
do $blk1$
begin
  drop policy if exists billings_team_read on public.billings;
  create policy billings_team_read on public.billings
    for select to authenticated
    using (exists (
      select 1 from public.companies c
       where c.id = billings.company_id
         and public._psm_member_of('advertiser', c.advertiser_id)
    ));
end
$blk1$;

-- ── HET ENIGE VERSLAG ───────────────────────────────────────────────
select
  count(*) filter (where p.polname like '%team_read')                    as teamregels_totaal,
  string_agg(c.relname, ', ' order by c.relname)
    filter (where c.relname in ('billings','wallet_adjustments','wallet_refunds','wallet_precharges','advertiser_perks')
              and p.polname like '%team_read')                           as nieuw,
  case when count(*) filter (where c.relname in ('billings','wallet_adjustments','wallet_refunds',
                                                 'wallet_precharges','advertiser_perks')
                               and p.polname like '%team_read') = 5
       then 'OK' else 'NIET GOED -- meld het' end                         as uitkomst
from pg_policy p
join pg_class c on c.oid = p.polrelid;
