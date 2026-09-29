-- ════════════════════════════════════════════════════════════════════
-- PLAK 148 — SPOED. MIJN FOUT, EN HIJ STAAT LIVE.
-- ════════════════════════════════════════════════════════════════════
--
-- WAT ER MIS IS
--
-- Plak 145 eindigde met:
--
--   drop function if exists public._is_tenant_owner(uuid, uuid);
--
-- Ik haalde die weg omdat twee functies met dezelfde naam en een
-- ander aantal argumenten vragen om de verkeerde aanroep. Wat ik niet
-- heb nagekeken: plak 143 had er DRIE functies op laten leunen.
--
--   has_capability(text)                    -> belt hem
--   set_admin_capability(uuid, text, bool)  -> belt hem
--   set_tenant_owner(uuid, bool)            -> belt hem
--
-- Postgres controleert de body van een plpgsql-functie pas bij het
-- uitvoeren, dus het droppen lukte zonder een kik. Gevolg: elke
-- schakelaar op /admins -> Permissions, en elke poging iemand
-- eigenaar te maken, valt om met
--
--   function _is_tenant_owner(uuid, uuid) does not exist
--
-- Precies het soort fout dat plak 124 ook was, en dezelfde les: een
-- functie weghalen is pas af als je hebt gezocht wie hem belt.
--
-- ── WAT DIT DOET ──────────────────────────────────────────────────
--
-- De drie functies bellen nu `_in_owner_set(tenant, user)`, dat plak
-- 145 heeft neergezet en dat exact hetzelfde antwoord geeft. Verder
-- verandert er niets aan wat ze doen.
--
-- Geen tekstchirurgie: ze worden alle drie in hun geheel opnieuw
-- gezet, zodat er niets van te raden valt.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. MAG DEZE GEBRUIKER DIT? ─────────────────────────────────────
create or replace function public.has_capability(p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $blk0$
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

  -- Een eigenaar mag alles.
  if public._in_owner_set(v_tenant, auth.uid()) then
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
$blk0$;

revoke all on function public.has_capability(text) from public, anon;
grant execute on function public.has_capability(text)
  to authenticated, service_role;

-- ── 2. EEN BEVOEGDHEID GEVEN OF AFNEMEN ────────────────────────────
create or replace function public.set_admin_capability(
  p_profile_id uuid,
  p_capability text,
  p_on         boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $blk1$
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

  -- Alleen een eigenaar deelt rechten uit. Een admin die zichzelf
  -- rechten kan geven, heeft alle rechten.
  if not public._in_owner_set(v_tenant, auth.uid()) then
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
$blk1$;

revoke all on function public.set_admin_capability(uuid, text, boolean)
  from public, anon;
grant execute on function public.set_admin_capability(uuid, text, boolean)
  to authenticated, service_role;

-- ── 3. EEN TWEEDE EIGENAAR AANWIJZEN ───────────────────────────────
create or replace function public.set_tenant_owner(
  p_profile_id uuid,
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
  v_left   int;
begin
  select up.tenant_id, up.role, up.user_id
    into v_tenant, v_role, v_user
    from public.user_profiles up
   where up.id = p_profile_id;

  if v_tenant is null then
    raise exception 'Dat profiel bestaat niet.';
  end if;

  if not public._in_owner_set(v_tenant, auth.uid()) then
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
    -- De laatste eigenaar kan er niet af: een tenant zonder eigenaar
    -- is een tenant waar niemand meer bij de instellingen kan, en dat
    -- is niet met een schermpje te herstellen.
    select count(*) into v_left
      from public.tenant_owners where tenant_id = v_tenant;
    if v_left <= 1 then
      raise exception 'Dit is de laatste eigenaar. Wijs eerst iemand anders aan.';
    end if;

    delete from public.tenant_owners
     where tenant_id = v_tenant and user_id = v_user;

    -- Wijst de oude kolom nog naar de verwijderde eigenaar, dan moet
    -- hij mee -- anders zegt `_in_owner_set` alsnog ja via zijn
    -- tweede helft.
    update public.tenants
       set owner_id = (select o.user_id from public.tenant_owners o
                        where o.tenant_id = v_tenant
                        order by o.granted_at limit 1)
     where id = v_tenant and owner_id = v_user;
  end if;
end
$blk2$;

revoke all on function public.set_tenant_owner(uuid, boolean) from public, anon;
grant execute on function public.set_tenant_owner(uuid, boolean)
  to authenticated, service_role;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- Alle drie horen 'nee' te zeggen bij belt_een_weg.
select
  p.proname                                                    as functie,
  case when pg_get_functiondef(p.oid) like '%\_is\_tenant\_owner(v\_tenant%'
       then 'JA -- nog steeds stuk' else 'nee' end             as belt_een_weg,
  case when position('_in_owner_set' in pg_get_functiondef(p.oid)) > 0
       then 'ja' else 'nee' end                                as belt_de_nieuwe,
  has_function_privilege('anon', p.oid, 'execute')::text       as anon_mag
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('has_capability', 'set_admin_capability',
                    'set_tenant_owner')
order by p.proname;
