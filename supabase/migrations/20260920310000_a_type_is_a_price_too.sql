-- =====================================================================
-- Een ad-account TYPE is ook een prijs
-- =====================================================================
-- Het rapport van 20260920300000 zei het zelf, regel 4:
--
--   ad-account-TYPES die elke admin kan schrijven
--     ad_account_types_admin_write (ALL)
--
-- De prijs-poort op ad_accounts staat nu goed: bij een UPDATE leest hij
-- de OPGESLAGEN rij, dus het type onder een bestaande fee wegschuiven
-- helpt niet meer. Maar bij een INSERT is er geen oude rij, dus dan
-- leest hij noodgedwongen new.platform -- en dat is precies genoeg:
--
--   insert into ad_account_types (tenant_id, slug, label, default_fee_pct)
--        values (mijn_tenant, 'eigen-type', 'Eigen type', 25);
--   insert into ad_accounts (tenant_id, advertiser_id, platform, fee, ...)
--        values (mijn_tenant, klant, 'eigen-type', 25);
--
-- De trigger zoekt het default van 'eigen-type' op, vindt 25, en laat
-- het door. Een werknemer-admin heeft dan een account op 25% gezet voor
-- een klant met een 5%-plan, zonder dat er ooit een eigenaar aan te pas
-- kwam. Op EUR 10.000 is dat EUR 2.500 in plaats van EUR 500.
--
-- De type-tabel IS de lijst met standaardprijzen. upsertAdAccountType in
-- de server-actie is al eigenaar-only; de tabel eronder niet. Dit is
-- hetzelfde argument als bij ad_accounts zelf: een deur waar niemand
-- doorheen loopt is nog steeds een deur.
--
-- LEZEN blijft voor elke admin -- die moeten de types zien om een
-- account aan te maken en om de bank te kiezen. Alleen schrijven gaat
-- naar de eigenaar.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

do $blk0$
begin
  if to_regclass('public.ad_account_types') is null then
    raise notice 'ad_account_types staat niet op deze database; overgeslagen';
    return;
  end if;

  -- De bestaande ALL-policy dekt SELECT mee, dus die kan niet zomaar
  -- weg zonder het lezen te breken. Splitsen: lezen voor elke admin,
  -- schrijven voor de eigenaar.
  execute 'drop policy if exists ad_account_types_admin_write on public.ad_account_types';

  execute $blk1$
    drop policy if exists ad_account_types_admin_read on public.ad_account_types
  $blk1$;
  execute $blk1$
    create policy ad_account_types_admin_read on public.ad_account_types
      for select to authenticated
      using (public._is_admin_of(tenant_id))
  $blk1$;

  execute $blk1$
    drop policy if exists ad_account_types_owner_write on public.ad_account_types
  $blk1$;
  execute $blk1$
    create policy ad_account_types_owner_write on public.ad_account_types
      for all to authenticated
      using (public._is_super_admin_of(tenant_id))
      with check (public._is_super_admin_of(tenant_id))
  $blk1$;
end;
$blk0$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen het LAATSTE resultaat
-- =====================================================================
select 1 as nr, 'policies op ad_account_types' as item,
  coalesce((
    select string_agg(policyname || ' (' || cmd || ')', '  |  ' order by policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'ad_account_types'
  ), 'geen') as antwoord
union all
select 2, 'kan een werknemer-admin nog een TYPE schrijven',
  case when exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'ad_account_types'
       and cmd in ('ALL', 'INSERT', 'UPDATE')
       and qual ilike '%_is_admin_of%'
       and qual not ilike '%_is_super_admin_of%'
  ) then 'JA - dit bestand is niet geplakt' else 'nee' end
union all
select 3, 'types met een default dat van geen enkel plan is',
  case
    when to_regclass('public.ad_account_types') is null then 'tabel ontbreekt'
    else (select count(*)::text || ' van ' ||
                 (select count(*)::text from public.ad_account_types)
            from public.ad_account_types ty
           where coalesce(ty.default_fee_pct, 0) > 0
             and not exists (
               select 1 from public.advertiser_plans p
                where round(coalesce(p.topup_fee_pct, -1)::numeric, 2)
                    = round(ty.default_fee_pct::numeric, 2)))
  end
union all
-- Lezen moet blijven werken voor elke admin: zonder types kan niemand
-- een ad-account aanmaken en weet de klant niet naar welke bank hij
-- moet overmaken.
select 4, 'types zichtbaar voor JOU, nu',
  case when to_regclass('public.ad_account_types') is null then 'tabel ontbreekt'
       else (select count(*)::text from public.ad_account_types) end
order by nr;
