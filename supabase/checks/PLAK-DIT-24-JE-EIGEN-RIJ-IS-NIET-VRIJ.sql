-- =====================================================================
-- PLAK 24 — "het is je eigen rij" is geen slot op de KOLOMMEN
-- =====================================================================
-- Twee tabellen op het instellingenscherm laten de klant hun eigen rij
-- schrijven via PostgREST, en de policy die dat toestaat kijkt naar WIE
-- de rij is, nooit naar WAT er verandert.
--
-- ── 1. user_profiles: een geblokkeerde klant zet zichzelf weer aan ────
--
--   user_profiles_update
--     using      (user_id = auth.uid() or _is_admin_of(tenant_id))
--     with check (user_id = auth.uid() or _is_admin_of(tenant_id))
--
-- De ROL is wel afgeschermd -- `_guard_user_profile_role` eist de
-- tenant-eigenaar voor elke rolwijziging, dus rechten opklimmen kan
-- niet. `status` en `is_active` niet. En dat zijn precies de twee
-- kolommen waar 20260920270000 de uitsluiting op bouwt:
--
--   PATCH /rest/v1/user_profiles?id=eq.<eigen id>
--   {"status":"active","is_active":true}
--
-- Een admin zet iemand uit, en diegene zet zichzelf terug aan. Het token
-- blijft geldig -- Supabase-auth weet niets van user_profiles.status --
-- dus het venster is de looptijd van hun sessie, met een refresh die het
-- gewoon verlengt.
--
-- `tenant_id` staat er ook open: de klant verplaatst zijn eigen profiel
-- naar een andere tenant en verdwijnt uit elke adminlijst, die allemaal
-- op tenant_id filteren.
--
-- ── 2. companies: hetzelfde gat, zonder rolgrendel ───────────────────
--
--   companies_update_owner
--     with check (_is_own_advertiser(advertiser_id) or _is_admin_of(tenant_id))
--
-- `_is_own_advertiser(advertiser_id)` blijft waar als je je EIGEN
-- bedrijfsrij naar een andere tenant_id schrijft. De rij verlaat de
-- tenant terwijl je hem nog bezit; adminlijsten en facturatie-joins
-- filteren op tenant_id en zien hem niet meer. Er staat nergens in
-- supabase/ een revoke op `companies`.
--
-- ── WAAROM HIER GEEN REVOKE STAAT ────────────────────────────────────
--
-- Dezelfde reden als bij `top_ups` in plak 21: de serveracties schrijven
-- met de SESSIE VAN DE BELLER. `saveOwnCompanyOnboarding`,
-- `updateOwnProfileAndCompany` en de adminacties gaan alle drie via
-- `createClient()`, dus insert/update intrekken sloopt het
-- bedrijfsformulier. Het slot hoort op de KOLOMMEN, niet op de deur.
--
-- DELETE wordt wel ingetrokken: er is geen enkele `.delete()` op
-- `companies` in de hele codebase.
--
-- ── WAT DIT NIET BREEKT ──────────────────────────────────────────────
--
-- * De eigen uitschrijving (GDPR) mag blijven: `requestOwnErasure`
--   schrijft status = pending_erasure en is_active = false op de eigen
--   rij, en dat is een stap NAAR BENEDEN. Alleen jezelf weer AANzetten
--   is geblokkeerd.
-- * Admins houden alles: `_is_admin_of(tenant_id)` is de uitweg in de
--   trigger, net als in de bestaande rolgrendel.
-- * Met auth.uid() null (service role, deze SQL-editor) doet de trigger
--   niets -- exact zoals `_guard_user_profile_role` het al doet.
-- * INSERT blijft ongemoeid. Aanmelden schrijft een verse rij met de
--   sessie van de nieuwe gebruiker; die afknijpen breekt de registratie.
--
-- Regel 1 en 2 meten EERST of het gat er echt is. Repo en live lopen op
-- dit project uit elkaar, dus dat wordt gemeten, niet aangenomen.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _jr (k text, v text);
delete from _jr;

insert into _jr
select 'grants_voor',
  coalesce((
    select string_agg(table_name || ': ' || privs, E'\n' order by table_name)
      from (
        select table_name,
               string_agg(distinct privilege_type, ', ' order by privilege_type) as privs
          from information_schema.role_table_grants
         where table_schema = 'public'
           and table_name in ('companies', 'user_profiles')
           and grantee in ('authenticated', 'anon')
           and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
         group by table_name
      ) x
  ), 'geen - beide dicht');

-- Staan er nu al bedrijfsrijen in een andere tenant dan hun adverteerder?
-- Zo ja, dan weigert de strengere policy hun VOLGENDE update en moet
-- iemand daarnaar kijken voordat dit landt.
insert into _jr
select 'scheve_bedrijven',
  coalesce((
    select string_agg(c.id::text || ' (bedrijf ' || coalesce(c.tenant_id::text, 'null') ||
                      ' / adverteerder ' || coalesce(a.tenant_id::text, 'geen') || ')',
                      E'\n')
      from public.companies c
      left join public.advertisers a on a.id = c.advertiser_id
     where c.advertiser_id is not null
       and c.tenant_id is distinct from a.tenant_id
  ), 'geen - elk bedrijf staat in de tenant van zijn adverteerder');

-- ── 1. De kolomgrendel op user_profiles ──────────────────────────────
create or replace function public._guard_user_profile_lockout()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk0$
declare
  v_caller uuid;
  v_owner uuid;
  v_new jsonb;
  v_old jsonb;
begin
  v_caller := auth.uid();
  if v_caller is null then
    return new;               -- service role / SQL editor, net als de rolgrendel
  end if;

  -- Een admin van deze tenant mag dit allemaal; dat is zijn werk.
  if public._is_admin_of(new.tenant_id) then
    return new;
  end if;

  -- Verhuizen naar een andere tenant: alleen de eigenaar.
  if new.tenant_id is distinct from old.tenant_id then
    select owner_id into v_owner from public.tenants where id = old.tenant_id;
    if v_owner is null or v_owner <> v_caller then
      raise exception 'Alleen de eigenaar van de tenant kan een profiel verplaatsen.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- ── VIA to_jsonb, NIET new.is_active ──────────────────────────────
  --
  -- plpgsql compileert pas bij de eerste aanroep. Zou `is_active` of
  -- `status` op deze database anders heten, dan faalt deze trigger niet
  -- bij het aanmaken maar bij de EERSTE profielupdate van de eerste
  -- klant -- en dan ligt elk profielformulier plat. `to_jsonb(new)`
  -- geeft gewoon null voor een kolom die er niet is.
  v_new := to_jsonb(new);
  v_old := to_jsonb(old);

  -- Jezelf UITschrijven mag (GDPR); jezelf weer AANzetten niet.
  if (v_new ->> 'is_active') is distinct from (v_old ->> 'is_active')
     and coalesce(v_new ->> 'is_active', 'false') = 'true' then
    raise exception 'Alleen een beheerder kan een account weer activeren.'
      using errcode = '42501';
  end if;

  if (v_new ->> 'status') is distinct from (v_old ->> 'status')
     and coalesce(v_new ->> 'status', '')
         not in ('pending_erasure', 'inactive', 'deactivated') then
    raise exception 'Alleen een beheerder kan de status van een account wijzigen.'
      using errcode = '42501';
  end if;

  return new;
end;
$blk0$;

do $blk1$
begin
  execute 'drop trigger if exists trg_guard_user_profile_lockout on public.user_profiles';
  execute 'create trigger trg_guard_user_profile_lockout
             before update on public.user_profiles
             for each row execute function public._guard_user_profile_lockout()';
  insert into _jr values ('trigger', 'aangehangen');
exception when others then
  insert into _jr values ('trigger', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk1$;

-- ── 2. companies: de tenant vastzetten aan de adverteerder ───────────
do $blk2$
begin
  execute $p$
    drop policy if exists companies_update_owner on public.companies;
    create policy companies_update_owner on public.companies
      for update using (
        _is_own_advertiser(advertiser_id) or _is_admin_of(tenant_id)
      )
      with check (
        (
          _is_own_advertiser(advertiser_id)
          and tenant_id = (
            select a.tenant_id from public.advertisers a where a.id = advertiser_id
          )
        )
        or _is_admin_of(tenant_id)
      );
  $p$;

  execute $p$
    drop policy if exists companies_insert_owner on public.companies;
    create policy companies_insert_owner on public.companies
      for insert with check (
        (
          _is_own_advertiser(advertiser_id)
          and tenant_id = (
            select a.tenant_id from public.advertisers a where a.id = advertiser_id
          )
        )
        or _is_admin_of(tenant_id)
      );
  $p$;

  insert into _jr values ('policies', 'vervangen');
exception when others then
  insert into _jr values ('policies', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk2$;

do $blk3$
begin
  execute 'revoke delete on public.companies from authenticated';
  execute 'revoke delete on public.companies from anon';
  insert into _jr values ('revoke', 'gelukt');
exception when others then
  insert into _jr values ('revoke', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk3$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'WAS het gat er (schrijfrechten VOOR deze plak)' as item,
  coalesce((select v from _jr where k = 'grants_voor' limit 1), '?') as antwoord
union all
select 2, 'bedrijfsrijen die nu al in de verkeerde tenant staan',
  coalesce((select v from _jr where k = 'scheve_bedrijven' limit 1), '?')
union all
select 3, 'kolomgrendel op user_profiles',
  coalesce((select v from _jr where k = 'trigger' limit 1), '?')
union all
select 4, 'triggers op user_profiles (de ROLgrendel hoort er nog te zijn)',
  coalesce((
    select string_agg(t.tgname || ' -> ' || p.proname, E'\n' order by t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where c.relname = 'user_profiles'
       and c.relnamespace = 'public'::regnamespace
       and not t.tgisinternal
  ), 'GEEN - dat zou heel raar zijn')
union all
select 5, 'companies-policies', coalesce((select v from _jr where k = 'policies' limit 1), '?')
union all
select 6, 'companies-policies zoals ze er nu staan',
  coalesce((
    select string_agg(policyname || ' [' || cmd || ']  check: ' ||
                      coalesce(with_check, '-'), E'\n' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'companies'
  ), 'geen')
union all
select 7, 'delete op companies ingetrokken',
  coalesce((select v from _jr where k = 'revoke' limit 1), '?')
union all
select 8, 'schrijfrechten NA deze plak (insert/update horen te BLIJVEN)',
  coalesce((
    select string_agg(table_name || ': ' || privs, E'\n' order by table_name)
      from (
        select table_name,
               string_agg(distinct privilege_type, ', ' order by privilege_type) as privs
          from information_schema.role_table_grants
         where table_schema = 'public'
           and table_name in ('companies', 'user_profiles')
           and grantee in ('authenticated', 'anon')
           and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
         group by table_name
      ) x
  ), 'geen')
union all
-- Welke statuswaarden komen echt voor: de trigger laat alleen een stap
-- naar beneden toe en die lijst moet kloppen met wat de app gebruikt.
select 9, 'user_profiles.status-waarden in gebruik',
  coalesce((
    select string_agg(x.s || '=' || x.n::text, ' | ' order by x.n desc)
      from (select coalesce(status::text, '(null)') as s, count(*) as n
              from public.user_profiles group by 1) x
  ), 'geen')
order by nr;
