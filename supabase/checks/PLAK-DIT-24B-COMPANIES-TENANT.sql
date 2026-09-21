-- =====================================================================
-- PLAK 24B — de tenant vastzetten op companies, met de LIVE uitdrukking
-- =====================================================================
-- Regel 5 van plak 24 kwam terug met
--
--     MISLUKT: 42883 function _is_own_advertiser(uuid) does not exist
--
-- Die helper staat in de repo en niet op deze database. De policies op
-- `companies` zijn dus NIET vervangen, en het gat staat nog open. Regel
-- 6 liet zien wat er wel staat, en die uitdrukking neem ik letterlijk
-- over:
--
--   EXISTS (SELECT 1 FROM user_profiles up
--             JOIN advertisers a ON a.profile_id = up.id
--            WHERE up.user_id = auth.uid()
--              AND a.id = companies.advertiser_id)
--
-- Die test WIE de rij bezit en niets over WAT erin geschreven wordt. De
-- klant blijft dus eigenaar van zijn eigen bedrijfsrij terwijl hij er
-- een andere `tenant_id` in zet:
--
--   PATCH /rest/v1/companies?id=eq.<eigen id>   {"tenant_id":"<andere>"}
--
-- De rij verlaat de tenant terwijl hij hem nog bezit. Adminlijsten en
-- facturatie-joins filteren op tenant_id en zien hem niet meer.
--
-- ── WAT DIT DOET ─────────────────────────────────────────────────────
--
-- Dezelfde twee policies, met er een voorwaarde bij: de tenant van de
-- bedrijfsrij moet die van zijn eigen adverteerder zijn. Verder blijft
-- alles woord voor woord staan.
--
-- De adminpolicies raak ik NIET aan. Plak 24 regel 6 liet zien dat er
-- op deze tabel alleen een LEES-policy voor admins staat; welke route
-- de tenantbrede bedrijfsrij schrijft weet ik niet, en een policy
-- herschrijven die ik niet heb gelezen is precies hoe je een scherm
-- sloopt.
--
-- Regel 1 meet eerst of er scheve rijen staan. Zo ja, dan weigert de
-- strengere check hun VOLGENDE update en moet iemand daar eerst naar
-- kijken. Plak 24 regel 2 zei "geen", dus dit hoort schoon te zijn.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _cb (k text, v text);
delete from _cb;

insert into _cb
select 'scheef',
  coalesce((
    select string_agg(c.id::text || ' (bedrijf ' || coalesce(c.tenant_id::text, 'null') ||
                      ' / adverteerder ' || coalesce(a.tenant_id::text, 'geen') || ')',
                      E'\n')
      from public.companies c
      left join public.advertisers a on a.id = c.advertiser_id
     where c.advertiser_id is not null
       and c.tenant_id is distinct from a.tenant_id
  ), 'geen - elk bedrijf staat in de tenant van zijn adverteerder');

insert into _cb
select 'voor',
  coalesce((
    select string_agg(policyname || ' [' || cmd || ']  check: ' ||
                      coalesce(with_check, '-'), E'\n' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'companies'
       and cmd in ('INSERT', 'UPDATE', 'ALL')
  ), 'geen');

do $blk0$
begin
  execute $p$
    drop policy if exists "Allow update for advertisers" on public.companies;
    create policy "Allow update for advertisers" on public.companies
      for update
      using (
        exists (
          select 1 from public.user_profiles up
            join public.advertisers a on a.profile_id = up.id
           where up.user_id = auth.uid()
             and a.id = companies.advertiser_id
        )
      )
      with check (
        exists (
          select 1 from public.user_profiles up
            join public.advertisers a on a.profile_id = up.id
           where up.user_id = auth.uid()
             and a.id = companies.advertiser_id
             and a.tenant_id is not distinct from companies.tenant_id
        )
      );
  $p$;
  insert into _cb values ('update', 'vervangen');
exception when others then
  insert into _cb values ('update', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

do $blk1$
begin
  execute $p$
    drop policy if exists "Allow insert for advertisers" on public.companies;
    create policy "Allow insert for advertisers" on public.companies
      for insert
      with check (
        exists (
          select 1 from public.user_profiles up
            join public.advertisers a on a.profile_id = up.id
           where up.user_id = auth.uid()
             and a.id = companies.advertiser_id
             and a.tenant_id is not distinct from companies.tenant_id
        )
      );
  $p$;
  insert into _cb values ('insert', 'vervangen');
exception when others then
  insert into _cb values ('insert', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk1$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'bedrijfsrijen die nu al in de verkeerde tenant staan' as item,
  coalesce((select v from _cb where k = 'scheef' limit 1), '?') as antwoord
union all
select 2, 'schrijfpolicies VOOR deze plak',
  coalesce((select v from _cb where k = 'voor' limit 1), '?')
union all
select 3, 'update-policy', coalesce((select v from _cb where k = 'update' limit 1), '?')
union all
select 4, 'insert-policy', coalesce((select v from _cb where k = 'insert' limit 1), '?')
union all
select 5, 'schrijfpolicies NA deze plak (tenant_id hoort nu in de check te staan)',
  coalesce((
    select string_agg(policyname || ' [' || cmd || ']  check: ' ||
                      coalesce(with_check, '-'), E'\n' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'companies'
       and cmd in ('INSERT', 'UPDATE', 'ALL')
  ), 'geen')
union all
select 6, 'alle policies op companies (de leesregels horen onaangeroerd)',
  coalesce((
    select string_agg(policyname || ' [' || cmd || ']', E'\n' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'companies'
  ), 'geen')
union all
select 7, 'schrijfrechten op companies (insert/update horen te BLIJVEN, delete weg)',
  coalesce((
    select string_agg(distinct privilege_type, ', ' order by privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'companies'
       and grantee in ('authenticated', 'anon')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'geen - dicht')
order by nr;
