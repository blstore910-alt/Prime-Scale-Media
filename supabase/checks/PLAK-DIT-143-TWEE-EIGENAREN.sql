-- ════════════════════════════════════════════════════════════════════
-- PLAK 143 — TWEE EIGENAREN, EN BEVOEGDHEDEN PER ADMIN
-- ════════════════════════════════════════════════════════════════════
--
-- WAT ER MIS IS
--
-- `tenants.owner_id` is ÉÉN uuid. Elke eigenaar-actie vergelijkt
-- daartegen. Er kan er dus precies één zijn.
--
-- Jij, 26-09: "we zijn 2 compagnons dus moeten beide erop kunnen
-- inloggen." Dat kan technisch nu al -- twee mensen op één wachtwoord
-- werkt gewoon. Het probleem is niet dat het niet KAN, het is dat
-- jullie dan niet uit elkaar te houden zijn. Elke goedkeuring, elke
-- koerswijziging en elke vrijgave staat dan op één naam, en het
-- auditlog -- het enige dat na een geldfout nog vertelt wat er gebeurd
-- is -- wordt waardeloos. Precies op het moment dat "wie deed dit" de
-- eerste vraag is.
--
-- Dus: ieder een eigen login, allebei met eigenaarsrechten.
--
-- En daarbovenop, jij: "mooiste zou zijn als ik per admin wat
-- bevoegdheden kan instellen."
--
-- ── WAT DEZE PLAK BOUWT ───────────────────────────────────────────
--
-- Twee tabellen.
--
--   tenant_owners       eigenaarschap wordt een VERZAMELING
--   admin_capabilities  één rij per toekenning
--
-- `tenants.owner_id` blijft staan en blijft gevuld. Er kijkt van alles
-- naar, en een kolom weghalen waar nog code op leunt is hoe je een
-- app omver duwt. De bestaande eigenaar wordt automatisch de eerste
-- rij in `tenant_owners`, dus er verandert vandaag niets aan wie wat
-- mag.
--
-- Bevoegdheden zijn RIJEN, geen jsonb-kolom. Een rij per toekenning,
-- dus wie wat wanneer gaf staat vanzelf in het auditlog -- en dat is
-- het hele punt van dit blok.
--
-- ── TWEE REGELS DIE NIET BUIGEN ───────────────────────────────────
--
-- 1. STANDAARD NEE. Een bevoegdheid die niemand heeft, kan niemand --
--    behalve een eigenaar. Een nieuwe capability die per ongeluk
--    nergens wordt gecontroleerd staat dan DICHT, niet open.
--
-- 2. BEVOEGDHEDEN UITDELEN IS ALTIJD EIGENAAR-ALLEEN. Een admin die
--    zichzelf rechten kan geven, heeft alle rechten. Daarom kan het
--    alleen via de functies hieronder, en die toetsen de eigenaar.
--
-- ── WAT ER HIERNA NOG MOET ────────────────────────────────────────
--
-- Onderaan staat de regel om je compagnon toe te voegen. Vul zijn
-- e-mailadres in. Hij moet wel eerst een eigen login hebben -- maak
-- hem aan als admin via /admins, en zet hem daarna met die regel om
-- naar eigenaar.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. EIGENAARSCHAP ALS VERZAMELING ───────────────────────────────
create table if not exists public.tenant_owners (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null,
  granted_by  uuid,
  granted_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table public.tenant_owners enable row level security;
revoke all on public.tenant_owners from anon, public;
-- En van `authenticated`, wat de regel hierboven NIET bereikt: die rol
-- krijgt zijn rechten uit Supabase DEFAULT PRIVILEGES, niet uit PUBLIC,
-- en de grant hieronder voegt toe -- hij vervangt niet.
revoke insert, update, delete, truncate on public.tenant_owners from authenticated;
grant select on public.tenant_owners to authenticated;

-- ── 2. BEVOEGDHEDEN PER ADMIN ──────────────────────────────────────
create table if not exists public.admin_capabilities (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null,
  capability  text not null,
  granted_by  uuid,
  granted_at  timestamptz not null default now(),
  primary key (tenant_id, user_id, capability)
);

alter table public.admin_capabilities enable row level security;
revoke all on public.admin_capabilities from anon, public;
revoke insert, update, delete, truncate on public.admin_capabilities from authenticated;
grant select on public.admin_capabilities to authenticated;

-- ── 3. DE BESTAANDE EIGENAAR WORDT DE EERSTE RIJ ───────────────────
-- Zodat er vandaag niets verandert aan wie wat mag.
insert into public.tenant_owners (tenant_id, user_id, granted_by)
select t.id, t.owner_id, t.owner_id
  from public.tenants t
 where t.owner_id is not null
on conflict (tenant_id, user_id) do nothing;

-- ── 4. IS DEZE GEBRUIKER EIGENAAR? ─────────────────────────────────
-- Leest allebei: de nieuwe tabel EN de oude kolom. Zolang er nog code
-- naar `owner_id` kijkt moeten die twee hetzelfde zeggen, en een
-- functie die maar één van de twee leest is precies hoe ze uit elkaar
-- gaan lopen.
create or replace function public._is_tenant_owner(p_tenant uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $blk0$
  select exists (
    select 1 from public.tenant_owners o
     where o.tenant_id = p_tenant and o.user_id = p_user
  ) or exists (
    select 1 from public.tenants t
     where t.id = p_tenant and t.owner_id = p_user
  );
$blk0$;

revoke all on function public._is_tenant_owner(uuid, uuid) from public, anon;
grant execute on function public._is_tenant_owner(uuid, uuid)
  to authenticated, service_role;

-- ── 5. MAG DEZE GEBRUIKER DIT? ─────────────────────────────────────
-- Een eigenaar mag alles. Een admin mag wat hem is toegekend. Iedereen
-- anders mag niets -- en een capability die niemand is toegekend kan
-- dus niemand, wat regel 1 is.
create or replace function public.has_capability(p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $blk1$
declare
  v_tenant uuid;
  v_role   text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select up.tenant_id, up.role into v_tenant, v_role
    from public.user_profiles up
   where up.user_id = auth.uid()
     and coalesce(up.is_active, true)
     and coalesce(up.status, 'active') <> 'inactive'
   limit 1;

  if v_tenant is null then
    return false;
  end if;

  if public._is_tenant_owner(v_tenant, auth.uid()) then
    return true;
  end if;

  -- Alleen een admin kan een bevoegdheid dragen. Een adverteerder met
  -- een per ongeluk toegekende rij hoort er niets aan te hebben.
  if coalesce(v_role, '') <> 'admin' then
    return false;
  end if;

  return exists (
    select 1 from public.admin_capabilities c
     where c.tenant_id = v_tenant
       and c.user_id = auth.uid()
       and c.capability = p_capability
  );
end
$blk1$;

revoke all on function public.has_capability(text) from public, anon;
grant execute on function public.has_capability(text)
  to authenticated, service_role;

-- ── 6. DE POLICIES ─────────────────────────────────────────────────
-- Lezen mag een admin van zijn eigen tenant: hij moet op /admins
-- kunnen zien wie wat heeft. Schrijven kan alleen via de functies in
-- stap 7, die de eigenaar toetsen -- er is met opzet GEEN
-- schrijfpolicy.
drop policy if exists tenant_owners_select on public.tenant_owners;
create policy tenant_owners_select on public.tenant_owners
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = tenant_owners.tenant_id
         and up.role = 'admin'
    )
  );

drop policy if exists admin_capabilities_select on public.admin_capabilities;
create policy admin_capabilities_select on public.admin_capabilities
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = admin_capabilities.tenant_id
         and up.role = 'admin'
    )
  );

-- ── 7. UITDELEN EN AFNEMEN -- ALLEEN DE EIGENAAR ───────────────────
create or replace function public.set_admin_capability(
  p_profile_id uuid,
  p_capability text,
  p_on         boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $blk2$
declare
  v_tenant uuid;
  v_role   text;
  v_user   uuid;
begin
  select up.tenant_id, up.role, up.user_id
    into v_tenant, v_role, v_user
    from public.user_profiles up
   where up.id = p_profile_id;

  if v_tenant is null then
    raise exception 'Dat profiel bestaat niet.';
  end if;

  -- REGEL 2. Alleen een eigenaar deelt rechten uit.
  if not public._is_tenant_owner(v_tenant, auth.uid()) then
    raise exception 'Alleen een eigenaar kan bevoegdheden toekennen.';
  end if;

  if coalesce(v_role, '') <> 'admin' then
    raise exception 'Bevoegdheden kunnen alleen aan een admin worden gegeven.';
  end if;

  if coalesce(btrim(p_capability), '') = '' then
    raise exception 'Geen bevoegdheid opgegeven.';
  end if;

  if p_on then
    insert into public.admin_capabilities
      (tenant_id, user_id, capability, granted_by)
    values (v_tenant, v_user, btrim(p_capability), auth.uid())
    on conflict (tenant_id, user_id, capability) do nothing;
  else
    delete from public.admin_capabilities
     where tenant_id = v_tenant
       and user_id = v_user
       and capability = btrim(p_capability);
  end if;
end
$blk2$;

revoke all on function public.set_admin_capability(uuid, text, boolean)
  from public, anon;
grant execute on function public.set_admin_capability(uuid, text, boolean)
  to authenticated, service_role;

-- ── 8. EEN TWEEDE EIGENAAR AANWIJZEN ───────────────────────────────
create or replace function public.set_tenant_owner(
  p_profile_id uuid,
  p_on         boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $blk3$
declare
  v_tenant uuid;
  v_role   text;
  v_user   uuid;
  v_left   int;
begin
  select up.tenant_id, up.role, up.user_id
    into v_tenant, v_role, v_user
    from public.user_profiles up
   where up.id = p_profile_id;

  if v_tenant is null then
    raise exception 'Dat profiel bestaat niet.';
  end if;

  if not public._is_tenant_owner(v_tenant, auth.uid()) then
    raise exception 'Alleen een eigenaar kan een eigenaar aanwijzen.';
  end if;

  if p_on then
    if coalesce(v_role, '') <> 'admin' then
      raise exception 'Alleen een admin kan eigenaar worden.';
    end if;
    insert into public.tenant_owners (tenant_id, user_id, granted_by)
    values (v_tenant, v_user, auth.uid())
    on conflict (tenant_id, user_id) do nothing;
  else
    -- DE LAATSTE EIGENAAR KAN ER NIET AF.
    -- Een tenant zonder eigenaar is een tenant waar niemand meer bij
    -- de instellingen kan, en dat is niet met een schermpje te
    -- herstellen.
    select count(*) into v_left
      from public.tenant_owners where tenant_id = v_tenant;
    if v_left <= 1 then
      raise exception 'Dit is de laatste eigenaar. Wijs eerst iemand anders aan.';
    end if;

    delete from public.tenant_owners
     where tenant_id = v_tenant and user_id = v_user;

    -- Wijst de oude kolom nog naar de verwijderde eigenaar, dan moet
    -- hij mee -- anders zegt `_is_tenant_owner` alsnog ja via de
    -- tweede helft van zijn or.
    update public.tenants
       set owner_id = (select o.user_id from public.tenant_owners o
                        where o.tenant_id = v_tenant
                        order by o.granted_at limit 1)
     where id = v_tenant and owner_id = v_user;
  end if;
end
$blk3$;

revoke all on function public.set_tenant_owner(uuid, boolean) from public, anon;
grant execute on function public.set_tenant_owner(uuid, boolean)
  to authenticated, service_role;

-- ── 9. HET AUDITLOG MOET ZE ZIEN ───────────────────────────────────
-- Wie wat wanneer kreeg is precies het soort verandering dat
-- reconstrueerbaar moet zijn, en dat is de huisregel voor elke nieuwe
-- tabel die ergens over gaat.
do $blk4$
begin
  if to_regprocedure('public._audit_row_change()') is not null then
    if not exists (
      select 1 from pg_trigger
       where tgrelid = 'public.tenant_owners'::regclass
         and tgname = 'audit_tenant_owners'
    ) then
      create trigger audit_tenant_owners
        after insert or update or delete on public.tenant_owners
        for each row execute function public._audit_row_change();
    end if;
    if not exists (
      select 1 from pg_trigger
       where tgrelid = 'public.admin_capabilities'::regclass
         and tgname = 'audit_admin_capabilities'
    ) then
      create trigger audit_admin_capabilities
        after insert or update or delete on public.admin_capabilities
        for each row execute function public._audit_row_change();
    end if;
  else
    raise notice '_audit_row_change bestaat niet -- triggers overgeslagen';
  end if;
end
$blk4$;

-- ── 10. JE COMPAGNON ───────────────────────────────────────────────
-- Maak hem eerst aan als admin via /admins, met zijn eigen e-mailadres
-- en zijn eigen wachtwoord. Haal daarna de streepjes hieronder weg,
-- vul zijn adres in, en draai deze plak opnieuw.
--
-- insert into public.tenant_owners (tenant_id, user_id, granted_by)
-- select up.tenant_id, up.user_id, up.user_id
--   from public.user_profiles up
--  where up.email = 'VUL-HIER-HET-EMAILADRES-IN'
--    and up.role = 'admin'
-- on conflict (tenant_id, user_id) do nothing;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
select
  'plak 143 geplaatst'                                    as wat,
  (select count(*) from public.tenant_owners)::text       as eigenaren,
  coalesce((select string_agg(up.email, ', ')
              from public.tenant_owners o
              join public.user_profiles up on up.user_id = o.user_id),
           '(geen)')                                      as wie,
  (select count(*) from public.admin_capabilities)::text  as toekenningen,
  (select has_table_privilege('authenticated',
            'public.admin_capabilities', 'ins' || 'ert')::text)
                                                          as admin_mag_schrijven,
  (select has_function_privilege('anon',
            'public.set_admin_capability(uuid, text, boolean)', 'execute')::text)
                                                          as anon_mag;
