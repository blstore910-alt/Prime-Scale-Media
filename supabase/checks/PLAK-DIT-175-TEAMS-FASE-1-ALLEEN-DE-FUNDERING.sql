-- ════════════════════════════════════════════════════════════════════
-- PLAK 175 — TEAMS, FASE 1: ALLEEN DE FUNDERING
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09: "multi user voor advertisers en affiliates", en
-- daarna "bouw alles fully auto."
--
-- ── WAT DEZE PLAK AAN DE APP VERANDERT: NIETS ─────────────────────
--
-- Hij maakt twee tabellen, twee hulpfuncties en een backfill. Hij raakt
-- GEEN ENKELE bestaande policy. Elke lees en elke schrijf in de app
-- blijft eigenaarschap bepalen zoals vandaag. Er kan niets gaan lekken,
-- want nog niets leest de nieuwe tabellen.
--
-- Dat is waarom dit een aparte plak is. Het gevaarlijke deel -- de
-- ~12 policies op de klanttabellen omzetten -- komt pas in fase 2, EEN
-- TABEL PER PLAK, elk tegen live gehouden voor de volgende. Zie
-- docs/TEAM_ACCOUNTS.md.
--
-- ── WAT ER ANDERS IS DAN HET ONTWERP VAN 17-09 ───────────────────
--
-- supabase/migrations/20260917180000_team_accounts_phase1.sql lag klaar
-- maar is nooit gedraaid. Tegen live gehouden op 30-09, en drie dingen
-- klopten niet meer:
--
-- 1. `affiliates` HEEFT GEEN `user_id`. Alleen `advertiser_id` en
--    `tenant_id`. De oude backfill deed `select af.user_id from
--    affiliates af` en was op die regel gestopt -- en omdat hij in een
--    blok stond, was de hele plak teruggedraaid. Een affiliate hangt aan
--    een gebruiker via zijn adverteerdersrij, en zo gaat hij er nu in.
--
-- 2. GEEN REVOKES OP DE TABELLEN. De regel dat Supabase `anon` op elke
--    nieuwe tabel arwdDxtm geeft, kwam op 27-09 in CLAUDE.md -- na dit
--    ontwerp. Zonder revoke kon de publieke sleutel lezen wie er in
--    wiens team zit. Nu: anon en public eruit, en insert/update/delete
--    van authenticated eruit (dat bereikt de eerste revoke niet -- de
--    les van plak 130).
--
-- 3. SCHRIJVEN VIA RLS. Het ontwerp liet een eigenaar rechtstreeks
--    vanuit de client leden toevoegen, via een `for all`-policy. Het
--    huispatroon is inmiddels: schrijven gaat via een server action die
--    eerst toetst, en de tabel geeft de client alleen select. Dus de
--    write-policies vervallen; de server action komt in fase 3.
--
-- En er kwam een auditspoor bij. Dit is de tabel die bepaalt wie
-- wiens geld mag zien; een wijziging erin hoort terug te vinden te zijn.
--
-- ── TERUGDRAAIEN, ZOLANG WE IN FASE 1 ZITTEN ──────────────────────
--
--   drop function if exists public._psm_member_of(text, uuid);
--   drop function if exists public._psm_member_role(text, uuid);
--   drop table if exists public.subject_member_accounts;
--   drop table if exists public.subject_members;
--
-- Schoon, want niets verwijst er nog naar.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. de twee tabellen ──────────────────────────────────────────
do $blk1$
begin
  create table if not exists public.subject_members (
    id           uuid primary key default gen_random_uuid(),
    -- 'advertiser' -> subject_id is advertisers.id
    -- 'affiliate'  -> subject_id is affiliates.id
    subject_kind text not null check (subject_kind in ('advertiser', 'affiliate')),
    subject_id   uuid not null,
    tenant_id    uuid not null references public.tenants(id) on delete cascade,
    user_id      uuid not null,
    -- owner   : alles wat het account vandaag kan, inclusief leden
    --           beheren en (bij een adverteerder) terugboekingen
    -- manager : het dagelijkse werk, maar GEEN terugboekingen, GEEN
    --           ledenbeheer, GEEN bedrijfs-, factuur- of uitbetaalgegevens
    -- viewer  : alleen kijken
    role         text not null check (role in ('owner', 'manager', 'viewer')),
    created_at   timestamptz not null default now(),
    created_by   uuid,
    -- Eén lidmaatschap per persoon per account. Een tweede rij voor
    -- hetzelfde paar zou "wat mag deze persoon" laten afhangen van
    -- welke rij toevallig eerst gelezen wordt.
    unique (subject_kind, subject_id, user_id)
  );

  create index if not exists subject_members_user_idx
    on public.subject_members (user_id);
  create index if not exists subject_members_subject_idx
    on public.subject_members (subject_kind, subject_id);

  -- Optionele beperking, alleen voor adverteerders. GEEN rijen voor een
  -- lid = alle ad-accounts. Wel rijen = precies die.
  create table if not exists public.subject_member_accounts (
    member_id     uuid not null references public.subject_members(id) on delete cascade,
    ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
    primary key (member_id, ad_account_id)
  );
end
$blk1$;

-- ── 2. rechten en RLS: de client LEEST, en verder niets ──────────
do $blk2$
begin
  alter table public.subject_members enable row level security;
  alter table public.subject_member_accounts enable row level security;

  revoke all on public.subject_members from anon, public;
  revoke all on public.subject_member_accounts from anon, public;
  revoke insert, update, delete, truncate on public.subject_members from authenticated;
  revoke insert, update, delete, truncate on public.subject_member_accounts from authenticated;
  grant select on public.subject_members to authenticated;
  grant select on public.subject_member_accounts to authenticated;
  grant all on public.subject_members to service_role;
  grant all on public.subject_member_accounts to service_role;
end
$blk2$;

-- ── 3. de hulpfuncties die fase 2 gebruikt ───────────────────────
-- SECURITY DEFINER, zodat een policy op een tabel die deze functies
-- lezen niet via zichzelf kan recurseren.
create or replace function public._psm_member_of(p_kind text, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $blk3$
  select exists (
    select 1
      from public.subject_members m
     where m.subject_kind = p_kind
       and m.subject_id = p_subject
       and m.user_id = auth.uid()
  );
$blk3$;

create or replace function public._psm_member_role(p_kind text, p_subject uuid)
returns text
language sql
stable
security definer
set search_path = public
as $blk4$
  select m.role
    from public.subject_members m
   where m.subject_kind = p_kind
     and m.subject_id = p_subject
     and m.user_id = auth.uid()
   limit 1;
$blk4$;

revoke all on function public._psm_member_of(text, uuid) from public, anon;
grant execute on function public._psm_member_of(text, uuid) to authenticated, service_role;
revoke all on function public._psm_member_role(text, uuid) from public, anon;
grant execute on function public._psm_member_role(text, uuid) to authenticated, service_role;

-- ── 4. wie mag de ledenlijst LEZEN ───────────────────────────────
-- Jezelf, je teamgenoten, en de beheerders van de tenant. Schrijven kan
-- de client niet (zie blok 2); dat doet de server action in fase 3.
do $blk5$
begin
  drop policy if exists subject_members_select on public.subject_members;
  create policy subject_members_select on public.subject_members
    for select to authenticated
    using (
      user_id = auth.uid()
      or public._psm_member_of(subject_kind, subject_id)
      or public.is_tenant_admin(tenant_id)
    );

  -- De write-policies uit het ontwerp van 17-09 komen er NIET: de
  -- client heeft geen schrijfrecht meer op deze tabel, dus een policy
  -- die schrijven toestaat zou alleen verwarren.
  drop policy if exists subject_members_write on public.subject_members;

  drop policy if exists subject_member_accounts_select on public.subject_member_accounts;
  create policy subject_member_accounts_select on public.subject_member_accounts
    for select to authenticated
    using (
      exists (
        select 1 from public.subject_members m
         where m.id = member_id
           and (
             m.user_id = auth.uid()
             or public._psm_member_of(m.subject_kind, m.subject_id)
             or public.is_tenant_admin(m.tenant_id)
           )
      )
    );
  drop policy if exists subject_member_accounts_write on public.subject_member_accounts;
end
$blk5$;

-- ── 5. het auditspoor ────────────────────────────────────────────
-- Dit is de tabel die bepaalt wie wiens geld mag zien.
do $blk6$
begin
  drop trigger if exists trg_audit_subject_members on public.subject_members;
  create trigger trg_audit_subject_members
    after insert or update or delete on public.subject_members
    for each row execute function public._audit_row_change();
end
$blk6$;

-- ── 6. backfill: de gebruiker van vandaag wordt de eigenaar ──────
-- Idempotent (unieke sleutel plus ON CONFLICT), dus veilig om nog eens
-- te draaien -- ook na nieuwe aanmeldingen, tot het aanmeldpad in fase 3
-- de rij zelf schrijft.
do $blk7$
begin
  insert into public.subject_members
    (subject_kind, subject_id, tenant_id, user_id, role)
  select 'advertiser', a.id, a.tenant_id, a.user_id, 'owner'
    from public.advertisers a
   where a.user_id is not null
     and a.tenant_id is not null
  on conflict (subject_kind, subject_id, user_id) do nothing;

  -- DE CORRECTIE. `affiliates` heeft geen user_id; de gebruiker van een
  -- affiliate is de gebruiker van zijn adverteerdersrij.
  insert into public.subject_members
    (subject_kind, subject_id, tenant_id, user_id, role)
  select 'affiliate', af.id, af.tenant_id, a.user_id, 'owner'
    from public.affiliates af
    join public.advertisers a on a.id = af.advertiser_id
   where a.user_id is not null
     and af.tenant_id is not null
  on conflict (subject_kind, subject_id, user_id) do nothing;
end
$blk7$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- DE POORT VOOR FASE 2:
--   adv_eigenaars   hoort gelijk te zijn aan  adv_met_gebruiker
--   aff_eigenaars   hoort gelijk te zijn aan  aff_met_gebruiker
-- Is er een korter: STOP. Dan heeft iets geen tenant_id, en fase 2 zou
-- die persoon buitensluiten van zijn eigen account.
--
-- En de rechten, gelezen en niet aangenomen:
--   anon_leest      hoort 'nee'
--   auth_schrijft   hoort 'nee'
select
  'plak 175 geplaatst'                                                 as wat,
  (select count(*)::text from public.subject_members
    where subject_kind = 'advertiser')                                 as adv_eigenaars,
  (select count(*)::text from public.advertisers
    where user_id is not null and tenant_id is not null)               as adv_met_gebruiker,
  (select count(*)::text from public.subject_members
    where subject_kind = 'affiliate')                                  as aff_eigenaars,
  (select count(*)::text from public.affiliates af
     join public.advertisers a on a.id = af.advertiser_id
    where a.user_id is not null and af.tenant_id is not null)          as aff_met_gebruiker,
  (select case when has_table_privilege('anon','public.subject_members','select')
               then 'JA -- FOUT' else 'nee' end)                       as anon_leest,
  (select case when has_table_privilege('authenticated','public.subject_members','insert')
                 or has_table_privilege('authenticated','public.subject_members','delete')
               then 'JA -- FOUT' else 'nee' end)                       as auth_schrijft;
