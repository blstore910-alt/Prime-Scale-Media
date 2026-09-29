-- ════════════════════════════════════════════════════════════════════
-- PLAK 144 — contact@primescalemedia.com WORDT EIGENAAR
-- ════════════════════════════════════════════════════════════════════
--
-- Nagekeken voordat ik hem schreef:
--
--   email                        role   actief  login  eigenaar
--   contact@primescalemedia.com  admin  ja      ja     nee
--
-- Dus: het account bestaat, is admin, is actief en heeft een eigen
-- login. Alleen de eigenaarsrij ontbreekt nog.
--
-- ⚠ DRAAI EERST PLAK 145.
--
-- Zonder 145 kent de DATABASE `tenant_owners` niet -- alleen de code.
-- Vijf functies daar beslissen wie eigenaar is, en 26 policies, 17
-- triggers en zo'n 20 functies hangen eraan. Dan ziet dit account het
-- Owner-menu en krijgt het op elke knop "Forbidden". Precies wat je
-- niet wilde.
--
-- WAT DIT DOET
--
-- Eén rij in `tenant_owners`. Daarna kan dat account alles wat jij
-- kunt -- prijzen, koersen, commissieregels, het grootboek, de
-- reconciliatie, admins beheren -- en het staat met ZIJN EIGEN naam in
-- `audit_events`, wat het hele punt van dit blok is.
--
-- `tenants.owner_id` blijft naar jou wijzen. Dat is met opzet: die
-- kolom is nog de terugval voor alles wat de nieuwe tabel niet leest,
-- en de laatste-eigenaar-beveiliging hangt eraan. Jij blijft eigenaar
-- nummer één.
--
-- WAT DIT NIET DOET
--
-- Geen wachtwoord, geen login, geen tweede factor -- dat blijft van
-- jou. Deze plak raakt alleen de rechten van een account dat jij al
-- hebt aangemaakt.
-- ════════════════════════════════════════════════════════════════════

-- ── EEN NAAM OP DE AUDITREGEL ─────────────────────────
--
-- Gemeten 29-09: in de SQL-editor is `auth.uid()` NULL en de
-- headerfallback ook. Alles wat hier met de hand wordt geplakt komt
-- dus naamloos in `audit_events` -- en in een project waar migraties
-- met de hand worden geplakt is dat het grootste gat dat er nog is.
--
-- De trigger die plak 132 plaatste leest `x-psm-actor` uit de
-- request-headers. Die zet je hier zelf, en dan draagt de auditregel
-- jouw naam in plaats van niemand. Dit is de uuid van
-- baris0546@hotmail.com, opgezocht op 29-09.
--
-- Deze regel is het waard om boven ELKE plak te zetten die geld of
-- rechten aanraakt.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

do $blk0$
declare
  v_tenant uuid;
  v_user   uuid;
  v_role   text;
  v_actief boolean;
  v_gever  uuid;
begin
  select up.tenant_id, up.user_id, up.role,
         coalesce(up.is_active, true)
           and coalesce(up.status, 'active') <> 'inactive'
    into v_tenant, v_user, v_role, v_actief
    from public.user_profiles up
   where lower(up.email) = 'contact@primescalemedia.com'
   limit 1;

  if v_user is null then
    raise exception 'Geen profiel gevonden voor contact@primescalemedia.com';
  end if;

  -- Alleen een admin kan eigenaar worden. Dezelfde regel als in
  -- set_tenant_owner; hier nog een keer, want deze plak gaat daar
  -- omheen (hij draait als de databasebeheerder, niet als jij).
  if coalesce(v_role, '') <> 'admin' then
    raise exception 'Dat account heeft rol %, en alleen een admin kan eigenaar worden.',
      coalesce(v_role, 'geen');
  end if;

  if not v_actief then
    raise exception 'Dat account staat op inactief. Zet het eerst aan.';
  end if;

  -- ── WIE HEEFT HET GEGEVEN ───────────────────────────
  --
  -- Dit stond eerst op `values (v_tenant, v_user, v_user)` -- de
  -- nieuwe eigenaar als zijn eigen gever. Dat is de slechtst mogelijke
  -- rij om leeg te laten: bij onenigheid tussen twee eigenaren is "wie
  -- heeft jou eigenaar gemaakt" de eerste vraag, en het antwoord zou
  -- "hijzelf" zijn geweest.
  --
  -- Nu de zittende eigenaar, opgezocht uit de lijst.
  select o.user_id into v_gever
    from public.tenant_owners o
   where o.tenant_id = v_tenant
     and o.user_id <> v_user
   order by o.granted_at
   limit 1;

  if v_gever is null then
    raise exception 'Geen zittende eigenaar gevonden om dit namens te doen. Draai eerst plak 143.';
  end if;

  insert into public.tenant_owners (tenant_id, user_id, granted_by)
  values (v_tenant, v_user, v_gever)
  on conflict (tenant_id, user_id) do nothing;

  raise notice 'contact@primescalemedia.com is nu eigenaar van tenant %', v_tenant;
end
$blk0$;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- Er horen nu TWEE regels te staan.
select
  up.email,
  up.role,
  case when t.owner_id = o.user_id then 'ja (ook de oude kolom)' else 'ja' end
    as eigenaar,
  to_char(o.granted_at, 'DD-MM-YYYY HH24:MI')                as sinds,
  t.name                                                     as tenant
from public.tenant_owners o
join public.user_profiles up on up.user_id = o.user_id
join public.tenants t on t.id = o.tenant_id
order by o.granted_at;
