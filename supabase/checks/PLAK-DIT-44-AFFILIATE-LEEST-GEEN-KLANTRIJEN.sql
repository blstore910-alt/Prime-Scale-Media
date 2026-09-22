-- =====================================================================
-- PLAK 44 — een affiliate leest de rij van zijn klanten niet
-- =====================================================================
-- Plak 43 rij 5 liet het zien: op advertisers staat de policy
--
--   "Allow affiliates to read referred users"
--     exists (referral_links rl where rl.referred_advertiser_id = id
--             and rl.affiliate_user_id = auth.uid())
--
-- Daarmee leest een affiliate met één verzoek de VOLLEDIGE advertisers-
-- rij van elke klant die hij aanbracht: startup_fee, fee_status, note
-- (de interne notitie van de eigenaar over die klant), airtable en de
-- commissievoorwaarden. Niets in de app gebruikt dat: het affiliate-
-- portaal leest namen en bedragen via affiliate_referral_stats en
-- affiliate_commission_list, die maskeren (plak 35/39/42), en de enige
-- andere lezer (affiliateFinanceReportForMe) wordt nergens aangeroepen.
--
-- Deze plak haalt elke SELECT-policy weg op advertisers en user_profiles
-- die een affiliate via referral_links.affiliate_user_id toegang geeft
-- tot de rij van een doorverwezen klant. Eigen rij, admin en eigenaar
-- blijven zoals ze zijn. Rij 2 en 3 tonen wat er daarna nog staat.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _p44 (nr int, item text, v text);
delete from _p44;

do $blk0$
declare
  r record;
  v_done text := '';
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('advertisers', 'user_profiles')
       and cmd in ('SELECT', 'ALL')
       and coalesce(qual, '') ilike '%referral_links%'
       and coalesce(qual, '') ilike '%affiliate_user_id%'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    v_done := v_done || r.tablename || ': ' || r.policyname || E'\n';
  end loop;
  insert into _p44 values (1, 'weggehaald', case when v_done = '' then 'er stond er geen' else v_done end);
exception when others then
  insert into _p44 values (1, 'weggehaald', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

insert into _p44
select 2, 'advertisers: select-policies die er nu staan',
  coalesce(string_agg(policyname || ' :: ' || coalesce(qual, '-'), E'\n'), 'geen')
  from pg_policies
 where schemaname = 'public' and tablename = 'advertisers' and cmd in ('SELECT', 'ALL');

insert into _p44
select 3, 'user_profiles: select-policies die er nu staan',
  coalesce(string_agg(policyname || ' :: ' || coalesce(qual, '-'), E'\n'), 'geen')
  from pg_policies
 where schemaname = 'public' and tablename = 'user_profiles' and cmd in ('SELECT', 'ALL');

select nr, item, v as antwoord from _p44 order by nr;
